import 'dotenv/config';
import { Worker } from 'bullmq';
import { createClient } from 'redis';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from '../config/bd.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Información de Redis para BullMQ
const publisher = createClient({ url: process.env.REDIS_URL });
publisher.on('error', (err) => console.error('Redis publisher error:', err));
await publisher.connect();
console.log('Redis publisher conectado');

//Bucket S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Publica actualizaciones del estado del documento a través de Redis Pub/Sub
const notificar = async (data) => {
  await publisher.publish('document-updates', JSON.stringify(data));
};

// Carga el template .hbs según el tipo de documento
const getTemplate = (templateType) => {
  const templatePath = path.join(__dirname, '../templates', `${templateType}.hbs`);
  const source = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(source);
};

// Genera el PDF usando Puppeteer
// cssPath: ruta absoluta al archivo .css del template
const generarPDF = async (html, cssPath) => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  // Inyectamos el CSS del template para asegurar que el PDF tenga el estilo correcto
  await page.addStyleTag({ path: cssPath });
  const pdf = await page.pdf({ format: 'A4', printBackground: true });
  await browser.close();
  return pdf;
};

// Sube el PDF a S3 y devuelve la URL pública
const subirA_S3 = async (pdfBuffer, fileName) => {
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: `documents/${fileName}`,
    Body: pdfBuffer,
    ContentType: 'application/pdf',
    ACL: 'public-read'
  }));
  return `https://${process.env.AWS_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/documents/${fileName}`;
};

// --- El Worker principal ---
const worker = new Worker('document-job', async (job) => {
  const { id, template_type, data } = job.data;
  console.log(`Procesando job: ${id} (${template_type})`);

  //Lo marca como 'processing' en la base de datos y notifica a través de Redis
  await pool.query(`UPDATE public_documents SET status = 'processing' WHERE id = $1`, [id]);
  await notificar({ id, status: 'processing' });

  //Compila el template con los datos proporcionados
  const template = getTemplate(template_type);
  const html = template(data);

  //General el pdf usando Puppeteer, inyectando el CSS del template para asegurar el estilo correcto
  const cssPath = path.join(__dirname, '../templates', `${template_type}.css`);
  const pdfBuffer = await generarPDF(html, cssPath);

  //Subir a Bucket S3 y obtener la URL pública
  const fileName = `${id}.pdf`;
  const fileUrl = await subirA_S3(pdfBuffer, fileName);

  //Completarlo y guarda la URL en la base de datos, además de notificar a través de Redis
  await pool.query(
    `UPDATE public_documents SET status = 'completed', file_url = $1 WHERE id = $2`,
    [fileUrl, id]
  );
  await notificar({ id, status: 'completed', file_url: fileUrl });

  console.log(`✅ Job completado: ${id}`);
  console.log(`🔗 URL: ${fileUrl}`);

}, { connection: { host: 'localhost', port: 6379 } });

// Si el job falla después de todos los reintentos
worker.on('failed', async (job, error) => {
  console.error(`Fallido: ${job.data.id}`, error.message);
  await pool.query(
    `UPDATE public_documents SET status = 'failed', error_reason = $1 WHERE id = $2`,
    [error.message, job.data.id]
  );
  await notificar({ id: job.data.id, status: 'failed', error_reason: error.message });
});

console.log('Worker escuchando la cola "document-job"...');
