const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    order: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Order`, required: true },
    amount: { type: Number, required: true },
    paymentMethod: { type: String, enum: ['card', 'paypal', 'bank_transfer'], default: 'card' },
    transactionId: { type: String },
    status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
    paidAt: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Payment`, PaymentSchema);