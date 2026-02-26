const mongoose = require('mongoose');

const ProductCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_ProductCategory`, ProductCategorySchema);