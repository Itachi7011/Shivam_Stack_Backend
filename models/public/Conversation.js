// models/messages/Conversation.js
const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_User`,
    required: true,
    unique: true, // one conversation per user
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_Message`,
  },
  lastMessageAt: Date,
  // optional: unread count for admins (can be computed, but storing saves queries)
  unreadCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Conversation`, ConversationSchema);