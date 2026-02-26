const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_User` },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'info' },
    isRead: { type: Boolean, default: false },
    sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Notification`, NotificationSchema);