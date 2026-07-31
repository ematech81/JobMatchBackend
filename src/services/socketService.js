const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config/env');

let io = null;
const userSocketMap = new Map(); // userId -> Set of socketIds

function initSocket(server, { clientUrl }) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: clientUrl, methods: ['GET', 'POST'] }
  });

  // The identity a socket claims must be proven, not asserted: trusting a
  // client-supplied userId would let anyone subscribe to another user's job
  // match notifications. Clients connect with the same JWT the REST API uses.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, jwtSecret);
      socket.userId = decoded.id;
      return next();
    } catch (err) {
      return next(new Error('Invalid or expired token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;

    if (userId) {
      if (!userSocketMap.has(userId)) userSocketMap.set(userId, new Set());
      userSocketMap.get(userId).add(socket.id);
      console.log(`[Socket] User ${userId} connected (${socket.id})`);
    }

    socket.on('disconnect', () => {
      if (userId && userSocketMap.has(userId)) {
        userSocketMap.get(userId).delete(socket.id);
        if (userSocketMap.get(userId).size === 0) userSocketMap.delete(userId);
      }
    });
  });

  return io;
}

function emitToUser(userId, event, payload) {
  if (!io) return;
  const sockets = userSocketMap.get(userId);
  if (!sockets) return;
  sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
}

module.exports = { initSocket, emitToUser };