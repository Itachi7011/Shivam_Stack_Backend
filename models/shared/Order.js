const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_User`, required: true },
    products: [{
        product: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Product`, required: true },
        quantity: { type: Number, default: 1 },
        price: { type: Number, required: true },
    }],
    coupon: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Coupon` },
    totalAmount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'cancelled'], default: 'pending' },
    orderedAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Order`, OrderSchema);