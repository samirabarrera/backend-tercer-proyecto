import { Queue } from 'bullmq';

// Conexión a Redis para BullMQ
const connection = {
  host: 'localhost',
  port: 6379
};

// Esta es la cola donde están los documentos generados
const documentQueue = new Queue('document-job', {
  connection,
  defaultJobOptions: {
    attempts: 3, // Lo intenta 3 veces antes de marcar el trabajo como fallido
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

export default documentQueue;
