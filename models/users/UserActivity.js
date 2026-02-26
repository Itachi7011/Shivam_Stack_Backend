const mongoose = require('mongoose');

const UserActivitySchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    action: {
        type: String,
        required: true,
        enum: [
            'login',
            'logout',
            'view_product',
            'add_to_cart',
            'purchase',
            'download_file',
            'update_profile',
            'change_password'
        ]
    },

    resourceType: String, // e.g., 'product', 'blog', 'order', 'file'
    resourceId: mongoose.Schema.Types.ObjectId, // optional ID for the resource

    ipAddress: String,
    userAgent: String,

    metadata: {
        type: Object,
        default: {}
    }

}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_UserActivity`, UserActivitySchema);