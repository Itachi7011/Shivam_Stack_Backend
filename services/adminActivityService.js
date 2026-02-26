// services/adminActivityService.js
const AdminActivity = require('../models/admin/AdminActivity');

class AdminActivityService {
    async trackActivity(adminId, action, options = {}) {
        try {
            const activity = new AdminActivity({
                admin: adminId,
                action,
                resourceType: options.resourceType,
                resourceId: options.resourceId,
                changes: options.changes,
                ipAddress: options.ipAddress,
                userAgent: options.userAgent,
                metadata: options.metadata || {}
            });

            await activity.save();
            return activity;
        } catch (err) {
            console.error('Error tracking admin activity:', err);
            // Don't throw - activity tracking should not break main flow
        }
    }

    async getAdminActivities(adminId, limit = 50, skip = 0) {
        return await AdminActivity.find({ admin: adminId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
    }

    async getAllActivities(filters = {}, limit = 50, skip = 0) {
        const query = {};
        if (filters.action) query.action = filters.action;
        if (filters.resourceType) query.resourceType = filters.resourceType;
        if (filters.adminId) query.admin = filters.adminId;

        return await AdminActivity.find(query)
            .populate('admin', 'name email role')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
    }
}

module.exports = new AdminActivityService();