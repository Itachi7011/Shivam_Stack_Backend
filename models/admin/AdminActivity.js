// models/admin/AdminActivity.js
const mongoose = require('mongoose');

const AdminActivitySchema = new mongoose.Schema({

    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },

    action: {
        type: String,
        required: true,
        enum: [
            'login',
            'logout',
            'create',
            'update',
            'delete',
            'view',
            'change_password',
            'enable_2fa',
            'disable_2fa',
            'update_permissions',
            'block_admin',
            'unblock_admin'
        ]
    },

    resourceType: {
        type: String,
        enum: [
            'admin',
            'user',
            'product',
            'order',
            'blog',
            'project',
            'coupon',
            'setting'
        ]
    },

    resourceId: mongoose.Schema.Types.ObjectId,

    changes: {
        before: mongoose.Schema.Types.Mixed,
        after: mongoose.Schema.Types.Mixed
    },

    ipAddress: String,
    userAgent: String,

    metadata: {
        type: Object,
        default: {}
    }

}, { 
    timestamps: true,
    indexes: [
        { admin: 1, createdAt: -1 },
        { action: 1 },
        { resourceType: 1 }
    ]
});

module.exports = mongoose.model(`${process.env.APP_NAME}_AdminActivity`, AdminActivitySchema);