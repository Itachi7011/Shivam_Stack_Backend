const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/users/User');
const Admin = require('../models/admin/Admin');

let io;

function initializeSocket(server) {
  io = socketIo(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if it's a user or admin token
      if (decoded.userId) {
        const user = await User.findById(decoded.userId).select('-password');
        if (!user || user.isBlocked || !user.isActive) {
          return next(new Error('User not found or inactive'));
        }
        socket.user = user;
        socket.userId = user._id;
        socket.userType = 'user';
      } else if (decoded.adminId) {
        const admin = await Admin.findById(decoded.adminId).select('-password');
        if (!admin || admin.isBlocked || !admin.isActive) {
          return next(new Error('Admin not found or inactive'));
        }
        socket.admin = admin;
        socket.adminId = admin._id;
        socket.userType = 'admin';
      } else {
        return next(new Error('Invalid token payload'));
      }

      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (${socket.userType})`);

    // Join rooms based on user type
    if (socket.userType === 'user') {
      socket.join(`user_${socket.userId}`);
    } else if (socket.userType === 'admin') {
      socket.join('admins'); // all admins share this room
      // Optionally join a room per admin for private notifications
      socket.join(`admin_${socket.adminId}`);
    }

    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized');
  }
  return io;
}

module.exports = { initializeSocket, getIO };