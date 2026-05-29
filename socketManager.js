import { Server } from 'socket.io';

let io;

// Inicializa Socket.io sobre el servidor HTTP
export const init = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      methods: ['GET', 'POST']
    }
  });
  return io;
};

// Devuelve la instancia de io ya inicializada (usada por el subscriber de Redis)
export const getIo = () => {
  if (!io) throw new Error('Socket.io no ha sido inicializado');
  return io;
};
