const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { 
        type: String, 
        required: true, 
        lowercase: true, 
        trim: true 
    },
    subject: { type: String },
    content: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    responded: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Message`, MessageSchema);