
import pool from '../config/bd.js';
import documentQueue from '../services/queue.serv.js';

// POST /api/documents/generate
export const generateDocument = async (req, res) => {
  const { template_type, data } = req.body;

  // Validaciones básicas
  if (!template_type || !data) {
    return res.status(400).json({
      error: 'Faltan campos requeridos: template_type y data'
    });
  }

  const validTemplates = ['invoice', 'report', 'certificate'];
  if (!validTemplates.includes(template_type)) {
    return res.status(400).json({
      error: `template_type inválido. Opciones: ${validTemplates.join(', ')}`
    });
  }

  // RETURNING id nos devuelve el UUID generado para usarlo en la cola
  const result = await pool.query(
    `INSERT INTO public_documents (status, template_type)
     VALUES ('queued', $1)
     RETURNING id`,
    [template_type]
  );

  const id = result.rows[0].id;

  // Mandamos el trabajo a la cola de BullMQ con el ID real de la BD
  await documentQueue.add('generate', { id, template_type, data });

  console.log(`Nuevo job en cola: ${id} (${template_type})`);

  // Respondemos inmediatamente, el worker se encarga del resto
  return res.status(202).json({
    message: 'Documento agregado a la cola',
    jobId: id,
    status: 'queued'
  });
};

// GET /api/documents
export const getDocuments = async (req, res) => {
  const { status, template_type } = req.query;

  // Construimos la query dinámicamente según los filtros que lleguen
  let query = 'SELECT * FROM public_documents';
  const params = [];
  const conditions = [];

  if (status) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  if (template_type) {
    params.push(template_type);
    conditions.push(`template_type = $${params.length}`);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC';

  const result = await pool.query(query, params);
  return res.json(result.rows);
};
