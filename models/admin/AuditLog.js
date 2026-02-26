const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    entity: { type: String, required: true }, // e.g., 'User', 'Order'
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, enum: ['create', 'update', 'delete'], required: true },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_Admin` },
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_AuditLog`, AuditLogSchema);