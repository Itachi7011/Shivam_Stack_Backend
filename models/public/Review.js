const mongoose = require('mongoose');

const ReviewSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_User` },
    product: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Product` },
    rating: { type: Number, min: 1, max: 5, required: true },
    title: { type: String },
    comment: { type: String },
    isApproved: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Review`, ReviewSchema);