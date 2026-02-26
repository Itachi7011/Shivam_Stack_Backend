const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    price: { type: Number, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_ProductCategory` },
    images: [String],
    stock: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Product`, ProductSchema);