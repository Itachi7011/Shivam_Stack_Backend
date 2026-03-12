const mongoose = require('mongoose');

const ProjectCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },

    // SEO fields
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_ProjectCategory`, ProjectCategorySchema);