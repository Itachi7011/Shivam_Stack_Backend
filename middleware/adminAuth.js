// middleware/adminAuth.js
const jwt = require('jsonwebtoken');
const Admin = require('../models/admin/Admin');

const adminAuthenticate = async (req, res, next) => {
    try {
        const token = req.cookies.adminToken || req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                message: 'Admin authentication required. Please log in.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        // console.log(decoded)
        
        // Check if token exists in database and is not revoked
        const admin = await Admin.findOne({ 
            _id: decoded.adminId,
            'tokens.token': token,
            'tokens.isRevoked': false,
            'tokens.type': 'access',
            isActive: true,
            isBlocked: false
        }).select('-password -twoFactorSecret');

        if (!admin) {
            return res.status(401).json({ 
                message: 'Invalid or expired token. Please log in again.' 
            });
        }

        req.admin = admin;
        req.adminId = admin._id;
        req.adminToken = token;
        
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        console.error('Admin authentication error:', err);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
};
// Optional authentication - doesn't fail if no token
const optionalAdminAuthenticate = async (req, res, next) => {
    try {
        const token = req.cookies.adminToken || req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const admin = await Admin.findOne({ 
                _id: decoded.adminId,
                isActive: true,
                isBlocked: false
            }).select('-password -twoFactorSecret');
            
            if (admin) {
                req.admin = admin;
                req.adminId = admin._id;
            }
        }
        next();
    } catch (err) {
        // Silently continue without admin
        next();
    }
};

// Permission middleware
const hasPermission = (requiredPermissions) => {
    return (req, res, next) => {
        if (!req.admin) {
            return res.status(401).json({ message: 'Authentication required' });
        }

        // Superadmin has all permissions
        if (req.admin.role === 'superadmin') {
            return next();
        }

        const hasAllPermissions = requiredPermissions.every(permission => 
            req.admin.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
            return res.status(403).json({ 
                message: 'Insufficient permissions to perform this action' 
            });
        }

        next();
    };
};

module.exports = { 
    adminAuthenticate, 
    optionalAdminAuthenticate,
    hasPermission 
};