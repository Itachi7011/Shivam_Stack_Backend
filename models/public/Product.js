const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    shortDescription: { type: String },
    price: { type: Number, required: true, min: 0 },
    
    // Digital product specific fields
    isDigital: { type: Boolean, default: true },
    isFree: { type: Boolean, default: false },
    fileUrl: { type: String },
    fileSize: { type: String },
    fileType: { type: String, enum: ['pdf', 'epub', 'mobi', 'zip'], default: 'pdf' },
    
    // Download options
    downloadLimit: { type: Number, default: 0 }, // 0 = unlimited
    downloadCount: { type: Number, default: 0 },
    sampleFileUrl: { type: String },
    
    category: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_ProductCategory` },
    images: [String],
    stock: { type: Number, default: 0 }, // For physical products
    isPublished: { type: Boolean, default: true },
    
    // SEO
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: [{ type: String }],
    
    // Stats
    views: { type: Number, default: 0 },
    downloads: { type: Number, default: 0 },
    
    // Settings
    requiresLogin: { type: Boolean, default: false },
    requiresPurchase: { type: Boolean, default: false } // For paid products
}, { timestamps: true });

// Index for search
ProductSchema.index({ name: 'text', description: 'text', shortDescription: 'text' });

module.exports = mongoose.model(`${process.env.APP_NAME}_Product`, ProductSchema);