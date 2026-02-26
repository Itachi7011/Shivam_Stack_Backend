const mongoose = require('mongoose');

const CouponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
    discountValue: { type: Number, required: true },
    maxUses: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    validFrom: { type: Date, default: Date.now },
    validTill: { type: Date },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Coupon`, CouponSchema);