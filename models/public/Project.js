const mongoose = require('mongoose');

const ProjectSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String },
    client: { type: String },
    startDate: Date,
    endDate: Date,
    status: { type: String, enum: ['planned', 'in-progress', 'completed'], default: 'planned' },
    images: [String]
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Project`, ProjectSchema);