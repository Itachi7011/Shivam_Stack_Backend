// services/userActivityService.js
const UserActivity = require('../models/users/UserActivity');

class UserActivityService {
    async trackActivity(userId, action, options = {}) {
        try {
            const activity = new UserActivity({
                user: userId,
                action,
                resourceType: options.resourceType,
                resourceId: options.resourceId,
                ipAddress: options.ipAddress,
                userAgent: options.userAgent,
                metadata: options.metadata || {}
            });

            await activity.save();
            return activity;
        } catch (err) {
            console.error('Error tracking user activity:', err);
            // Don't throw - activity tracking should not break main flow
        }
    }

    async getUserActivities(userId, limit = 50, skip = 0) {
        return await UserActivity.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);
    }
}

module.exports = new UserActivityService();