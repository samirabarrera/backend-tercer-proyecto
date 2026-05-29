import 'dotenv/config';
import app from './index.js';
import { createServer } from 'http';
import { createClient } from 'redis';
import { init, getIo } from '../socketManager.js';

// Levanta el servidor HTTP con Socket.io
const httpServer = createServer(app);
const io = init(httpServer);

// Confirmar conexiones de clientes en consola
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);
});

// ─── Redis ──────────────────────────────────────────────────────
// El Worker publica en 'document-updates'; aquí se reciben y se emiten a los clientes conectados
const subscriber = createClient({ url: process.env.REDIS_URL });
subscriber.on('error', (err) => console.error('Redis subscriber error:', err));
await subscriber.connect();

await subscriber.subscribe('document-updates', (message) => {
  try {
    const data = JSON.parse(message);
    console.log('📡 Emitiendo a clientes:', data);
    getIo().emit('document:update', data);
  } catch (err) {
    console.error('Error al parsear mensaje de Redis:', err.message);
  }
});

console.log('Subscriber de Redis escuchando canal "document-updates"...');

httpServer.listen(process.env.PORT || 4000, () =>
  console.log(`Servidor listo en puerto ${process.env.PORT || 4000}`)
);