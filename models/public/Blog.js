const mongoose = require('mongoose');

const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    content: { type: String, required: true },
    author: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_BlogCategory` },
    tags: [String],
    featuredImage: String,
    isPublished: { type: Boolean, default: false },
    publishedAt: Date
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Blog`, BlogSchema);