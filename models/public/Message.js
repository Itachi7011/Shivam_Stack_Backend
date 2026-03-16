// models/messages/Message.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  conversation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_Conversation`,
    required: true,
    index: true,
  },
  senderType: {
    type: String,
    enum: ['user', 'admin'],
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'senderModel',
  },
  senderModel: {
    type: String,
    enum: [`${process.env.APP_NAME}_User`, `${process.env.APP_NAME}_Admin`],
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  attachments: [{
    url: String,
    publicId: String,
    format: String,
    originalName: String,
    contentType: String,
  }],
  // Global read flag for admins
  isRead: { type: Boolean, default: false },
  // Track which admin first read this message (and when)
  firstReadByAdmin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_Admin`,
  },
  firstReadAt: Date,
}, { timestamps: true });

// Index for efficient sorting
MessageSchema.index({ conversation: 1, createdAt: 1 });

module.exports = mongoose.model(`${process.env.APP_NAME}_Message`, MessageSchema);