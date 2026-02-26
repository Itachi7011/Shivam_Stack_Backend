const mongoose = require('mongoose');

const DownloadSchema = new mongoose.Schema({

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    fileName: {
        type: String,
        required: true
    },

    fileType: {
        type: String,
        required: true
    },

    fileSize: Number, // in bytes

    downloadCount: {
        type: Number,
        default: 1
    },

    ipAddress: String,
    userAgent: String,

    metadata: {
        type: Object,
        default: {}
    }

}, { timestamps: true });

module.exports = mongoose.model('Download', DownloadSchema);
module.exports = mongoose.model(`${process.env.APP_NAME}_Download`, DownloadSchema);