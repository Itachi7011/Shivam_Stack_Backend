const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Order`, required: true },
    invoiceNumber: { type: String, required: true, unique: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'paid', 'cancelled'], default: 'pending' },
    issuedAt: { type: Date, default: Date.now },
    paidAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Invoice`, InvoiceSchema);