// middleware/userAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/users/User');

const userAuthenticate = async (req, res, next) => {
    try {
        const token = req.cookies.cookies1 || req.header('Authorization')?.replace('Bearer ', '');
        // concole.log(token)
        
        if (!token) {
            return res.status(401).json({ 
                message: 'Authentication required. Please log in.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const user = await User.findOne({ 
            _id: decoded.userId,
            'tokens.token': token,
            'tokens.isRevoked': false,
            'tokens.type': 'access'
        }).select('-password');

        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid or expired token. Please log in again.' 
            });
        }

        if (user.isBlocked) {
            return res.status(403).json({ 
                message: user.blockedReason || 'Your account has been blocked. Please contact support.' 
            });
        }

        if (!user.isActive) {
            return res.status(403).json({ 
                message: 'Your account is deactivated. Please contact support.' 
            });
        }

        req.user = user;
        req.token = token;
        req.userId = user._id;
        
        next();
    } catch (err) {
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ message: 'Invalid token' });
        }
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Token expired' });
        }
        console.error('Authentication error:', err);
        res.status(500).json({ message: 'Internal server error during authentication' });
    }
};

// Optional authentication - doesn't fail if no token
const optionalUserAuthenticate = async (req, res, next) => {
    try {
        const token = req.cookies.cookies1 || req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
            const user = await User.findOne({ 
                _id: decoded.userId,
                'tokens.token': token,
                'tokens.isRevoked': false
            }).select('-password');
            
            if (user && !user.isBlocked && user.isActive) {
                req.user = user;
                req.userId = user._id;
            }
        }
        next();
    } catch (err) {
        // Silently continue without user
        next();
    }
};

module.exports = { userAuthenticate, optionalUserAuthenticate };