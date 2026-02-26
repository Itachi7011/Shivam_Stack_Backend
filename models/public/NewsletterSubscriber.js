const mongoose = require('mongoose');

const NewsLetterSubscriberSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    name: { type: String },
    subscribedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_NewsLetterSubscriber`, NewsLetterSubscriberSchema);