// routes/admin/adminRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const speakeasy = require('speakeasy');

const Admin = require('../models/admin/Admin');
const AdminActivity = require('../models/admin/AdminActivity');
const { adminAuthenticate, hasPermission } = require('../middleware/adminAuth');
const { sendEmail } = require('../services/emailService');
const tokenService = require('../services/tokenService');
const adminActivityService = require('../services/adminActivityService');

/* ==============================
   PUBLIC ROUTES
================================ */

// Register new admin
router.post('/register', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, password } = req.body;

        // Check if admin exists
        const existingAdmin = await Admin.findOne({ email: email.toLowerCase() }).session(session);
        if (existingAdmin) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ 
                message: 'An admin with this email already exists.' 
            });
        }

        // Check if this is the first admin (make them superadmin)
        const adminCount = await Admin.countDocuments();
        
        const adminData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            role: adminCount === 0 ? 'superadmin' : 'admin',
            permissions: adminCount === 0 ? [
                'manage_products',
                'manage_orders',
                'manage_users',
                'manage_blog',
                'manage_projects',
                'manage_coupons',
                'view_analytics',
                'manage_settings'
            ] : [] // New admins get no permissions until assigned
        };

        const admin = new Admin(adminData);
        await admin.save({ session });

        await session.commitTransaction();
        session.endSession();

        // Send welcome email
        try {
            await sendEmail(
                admin.email,
                'Welcome to ShivamStack Admin',
                `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Welcome, ${admin.name}!</h2>
                    <p>Your admin account has been created successfully.</p>
                    <p><strong>Role:</strong> ${admin.role}</p>
                    <p>You can now login at: ${process.env.ADMIN_URL || 'http://localhost:3000/admin/login'}</p>
                    <p style="color: #dc2626;">⚠️ Please keep your credentials secure.</p>
                </div>
                `
            );
        } catch (emailErr) {
            console.error('Failed to send welcome email:', emailErr);
        }

        res.status(201).json({ 
            message: 'Admin account created successfully!',
            role: admin.role
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Admin registration error:', err);
        
        if (err.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Invalid data provided.',
                errors: Object.values(err.errors).map(e => e.message)
            });
        }
        
        res.status(500).json({ 
            message: 'Registration failed. Please try again.' 
        });
    }
});

// Admin login
router.post('/login', async (req, res) => {
    try {
        const { email, password, twoFactorCode } = req.body;
        console.log(email, password, twoFactorCode)

        // Find admin with password field included
        const admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password +twoFactorSecret');
        console.log(admin)

        if (!admin) {
            return res.status(401).json({ 
                message: 'Invalid email or password.' 
            });
        }

        // Check if account is active
        if (!admin.isActive) {
            return res.status(403).json({ 
                message: 'Account is deactivated. Contact superadmin.' 
            });
        }

        // Check if account is blocked
        if (admin.isBlocked) {
            return res.status(403).json({ 
                message: 'Account has been blocked. Contact superadmin.' 
            });
        }

        // Check if account is locked
        if (admin.isLocked) {
            const lockRemaining = Math.ceil((admin.lockUntil - Date.now()) / 60000);
            return res.status(423).json({ 
                message: 'Account temporarily locked due to multiple failed attempts.',
                lockRemainingMinutes: lockRemaining
            });
        }

        // Verify password
        const isPasswordValid = await admin.comparePassword(password);
        console.log("isPasswordValid is", isPasswordValid)
        
        if (!isPasswordValid) {
            await admin.incrementLoginAttempts();
            
            const attemptsRemaining = 5 - (admin.loginAttempts || 0);
            
            return res.status(401).json({ 
                message: 'Invalid email or password.',
                attemptsRemaining: Math.max(0, attemptsRemaining)
            });
        }

        // Check 2FA if enabled
        if (admin.twoFactorEnabled) {
            if (!twoFactorCode) {
                return res.status(202).json({ 
                    message: '2FA code required.',
                    requires2FA: true
                });
            }

            const verified = speakeasy.totp.verify({
                secret: admin.twoFactorSecret,
                encoding: 'base32',
                token: twoFactorCode
            });

            if (!verified) {
                return res.status(401).json({ 
                    message: 'Invalid 2FA code.' 
                });
            }
        }

        // Reset login attempts on successful login
        await admin.resetLoginAttempts();

        // Generate tokens
        const { accessToken, refreshToken } = tokenService.generateAuthTokens(admin._id);

        admin.lastLogin = new Date();
        await admin.save();

        // Track activity
        await adminActivityService.trackActivity(admin._id, 'login', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        // Set cookie
        res.cookie('adminToken', accessToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        res.json({
            message: 'Login successful!',
            token: accessToken,
            refreshToken,
            admin: {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                role: admin.role,
                permissions: admin.permissions,
                twoFactorEnabled: admin.twoFactorEnabled
            }
        });

    } catch (err) {
        console.error('Admin login error:', err);
        res.status(500).json({ 
            message: 'Login failed. Please try again.' 
        });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const admin = await Admin.findOne({ email: email.toLowerCase(), isActive: true });
        
        if (admin) {
            const resetToken = admin.generatePasswordResetToken();
            await admin.save();

            const resetUrl = `${process.env.ADMIN_URL || 'http://localhost:3000/admin/reset-password'}?token=${resetToken}`;

            await sendEmail(
                admin.email,
                'Reset Your ShivamStack Admin Password',
                `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Password Reset Request</h2>
                    <p>Dear ${admin.name},</p>
                    <p>We received a request to reset your admin password. Click the link below to set a new password:</p>
                    <p><a href="${resetUrl}">${resetUrl}</a></p>
                    <p style="color: #dc2626;">⚠️ This link will expire in 1 hour. Do not share this link.</p>
                    <p>If you didn't request this, please ignore this email and ensure your account is secure.</p>
                </div>
                `
            );
        }

        // Always return success to prevent email enumeration
        res.json({ 
            message: 'If your email exists and is active, you will receive a password reset link.' 
        });

    } catch (err) {
        console.error('Admin forgot password error:', err);
        res.status(500).json({ 
            message: 'Failed to process request.' 
        });
    }
});

// Validate reset token
router.post('/validate-reset-token', async (req, res) => {
    try {
        const { token } = req.body;

        const admin = await Admin.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!admin) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        res.json({ valid: true });

    } catch (err) {
        console.error('Validate reset token error:', err);
        res.status(500).json({ message: 'Token validation failed' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { token, newPassword } = req.body;

        const admin = await Admin.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        }).session(session);

        if (!admin) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: 'Invalid or expired reset token.' 
            });
        }

        // Update password
        admin.password = newPassword;
        admin.resetPasswordToken = undefined;
        admin.resetPasswordExpires = undefined;
        
        await admin.save({ session });

        // Track activity
        await adminActivityService.trackActivity(admin._id, 'change_password', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { method: 'reset' },
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.json({ 
            message: 'Password reset successful! You can now log in with your new password.' 
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Admin reset password error:', err);
        res.status(500).json({ 
            message: 'Password reset failed.' 
        });
    }
});

// Logout
router.post('/logout', adminAuthenticate, async (req, res) => {
    try {
        // Track activity
        await adminActivityService.trackActivity(req.adminId, 'logout', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        // Clear cookie
        res.clearCookie('adminToken');

        res.json({ message: 'Logout successful' });

    } catch (err) {
        console.error('Admin logout error:', err);
        res.status(500).json({ message: 'Logout failed' });
    }
});

/* ==============================
   PROTECTED ROUTES
================================ */

// Get current admin profile
router.get('/profile', adminAuthenticate, async (req, res) => {
    try {
        res.json({
            id: req.admin._id,
            name: req.admin.name,
            email: req.admin.email,
            role: req.admin.role,
            permissions: req.admin.permissions,
            twoFactorEnabled: req.admin.twoFactorEnabled,
            lastLogin: req.admin.lastLogin,
            createdAt: req.admin.createdAt
        });
    } catch (err) {
        console.error('Get admin profile error:', err);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
});

// Enable 2FA
router.post('/2fa/enable', adminAuthenticate, async (req, res) => {
    try {
        const admin = await Admin.findById(req.adminId).select('+twoFactorSecret');
        
        const secret = speakeasy.generateSecret({
            name: `ShivamStack:${admin.email}`
        });

        admin.twoFactorSecret = secret.base32;
        await admin.save();

        await adminActivityService.trackActivity(admin._id, 'enable_2fa', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.json({
            secret: secret.base32,
            otpauth_url: secret.otpauth_url
        });

    } catch (err) {
        console.error('Enable 2FA error:', err);
        res.status(500).json({ message: 'Failed to enable 2FA' });
    }
});

// Verify and confirm 2FA
router.post('/2fa/verify', adminAuthenticate, async (req, res) => {
    try {
        const { token } = req.body;
        const admin = await Admin.findById(req.adminId).select('+twoFactorSecret');

        const verified = speakeasy.totp.verify({
            secret: admin.twoFactorSecret,
            encoding: 'base32',
            token
        });

        if (!verified) {
            return res.status(400).json({ message: 'Invalid verification code' });
        }

        admin.twoFactorEnabled = true;
        await admin.save();

        res.json({ message: '2FA enabled successfully' });

    } catch (err) {
        console.error('Verify 2FA error:', err);
        res.status(500).json({ message: 'Failed to verify 2FA' });
    }
});

// Disable 2FA
router.post('/2fa/disable', adminAuthenticate, async (req, res) => {
    try {
        const { password } = req.body;
        const admin = await Admin.findById(req.adminId).select('+password');

        const isPasswordValid = await admin.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Password is incorrect' });
        }

        admin.twoFactorEnabled = false;
        admin.twoFactorSecret = undefined;
        await admin.save();

        await adminActivityService.trackActivity(admin._id, 'disable_2fa', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.json({ message: '2FA disabled successfully' });

    } catch (err) {
        console.error('Disable 2FA error:', err);
        res.status(500).json({ message: 'Failed to disable 2FA' });
    }
});

// Change password
router.post('/change-password', adminAuthenticate, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { currentPassword, newPassword } = req.body;
        
        const admin = await Admin.findById(req.adminId).select('+password').session(session);

        const isPasswordValid = await admin.comparePassword(currentPassword);
        if (!isPasswordValid) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        admin.password = newPassword;
        await admin.save({ session });

        await adminActivityService.trackActivity(admin._id, 'change_password', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { method: 'manual' },
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.json({ message: 'Password changed successfully' });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Admin change password error:', err);
        res.status(500).json({ message: 'Password change failed' });
    }
});

/* ==============================
   SUPERADMIN ROUTES
================================ */

// Get all admins (superadmin only)
router.get('/admins', adminAuthenticate, hasPermission(['manage_settings']), async (req, res) => {
    try {
        const admins = await Admin.find()
            .select('-password -twoFactorSecret')
            .sort({ createdAt: -1 });

        res.json(admins);

    } catch (err) {
        console.error('Get admins error:', err);
        res.status(500).json({ message: 'Failed to fetch admins' });
    }
});

// Get admin by ID (superadmin only)
router.get('/admins/:id', adminAuthenticate, hasPermission(['manage_settings']), async (req, res) => {
    try {
        const admin = await Admin.findById(req.params.id)
            .select('-password -twoFactorSecret');

        if (!admin) {
            return res.status(404).json({ message: 'Admin not found' });
        }

        res.json(admin);

    } catch (err) {
        console.error('Get admin error:', err);
        res.status(500).json({ message: 'Failed to fetch admin' });
    }
});

// Update admin permissions (superadmin only)
router.patch('/admins/:id/permissions', adminAuthenticate, hasPermission(['manage_settings']), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { permissions } = req.body;
        const admin = await Admin.findById(req.params.id).session(session);

        if (!admin) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Store old permissions for activity tracking
        const oldPermissions = [...admin.permissions];

        admin.permissions = permissions;
        await admin.save({ session });

        await adminActivityService.trackActivity(req.adminId, 'update_permissions', {
            resourceType: 'admin',
            resourceId: admin._id,
            changes: {
                before: oldPermissions,
                after: permissions
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.json({ 
            message: 'Permissions updated successfully',
            permissions: admin.permissions
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Update permissions error:', err);
        res.status(500).json({ message: 'Failed to update permissions' });
    }
});

// Update admin role (superadmin only)
router.patch('/admins/:id/role', adminAuthenticate, hasPermission(['manage_settings']), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { role } = req.body;
        const admin = await Admin.findById(req.params.id).session(session);

        if (!admin) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Don't allow changing own role if last superadmin
        if (admin._id.toString() === req.adminId && role !== 'superadmin') {
            const superadminCount = await Admin.countDocuments({ role: 'superadmin' });
            if (superadminCount <= 1) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ 
                    message: 'Cannot change your own role. You are the only superadmin.' 
                });
            }
        }

        const oldRole = admin.role;
        admin.role = role;
        await admin.save({ session });

        await adminActivityService.trackActivity(req.adminId, 'update_permissions', {
            resourceType: 'admin',
            resourceId: admin._id,
            changes: {
                before: { role: oldRole },
                after: { role }
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.json({ 
            message: 'Role updated successfully',
            role: admin.role
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Update role error:', err);
        res.status(500).json({ message: 'Failed to update role' });
    }
});

// Block/unblock admin (superadmin only)
router.patch('/admins/:id/block', adminAuthenticate, hasPermission(['manage_settings']), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { block, reason } = req.body;
        const admin = await Admin.findById(req.params.id).session(session);

        if (!admin) {
            await session.abortTransaction();
            session.endSession();
            return res.status(404).json({ message: 'Admin not found' });
        }

        // Don't allow blocking self
        if (admin._id.toString() === req.adminId) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ message: 'Cannot block your own account' });
        }

        admin.isBlocked = block;
        if (block && reason) admin.blockedReason = reason;
        await admin.save({ session });

        await adminActivityService.trackActivity(req.adminId, block ? 'block_admin' : 'unblock_admin', {
            resourceType: 'admin',
            resourceId: admin._id,
            changes: {
                before: { isBlocked: !block },
                after: { isBlocked: block, reason }
            },
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            session
        });

        await session.commitTransaction();
        session.endSession();

        res.json({ 
            message: block ? 'Admin blocked successfully' : 'Admin unblocked successfully'
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Block admin error:', err);
        res.status(500).json({ message: 'Failed to update admin status' });
    }
});

// Get admin activities (own activities)
router.get('/activities', adminAuthenticate, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        const activities = await AdminActivity.find({ admin: req.adminId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await AdminActivity.countDocuments({ admin: req.adminId });

        res.json({
            activities,
            pagination: {
                total,
                limit,
                skip,
                hasMore: skip + activities.length < total
            }
        });

    } catch (err) {
        console.error('Get admin activities error:', err);
        res.status(500).json({ message: 'Failed to fetch activities' });
    }
});

// Get all admin activities (superadmin only)
router.get('/all-activities', adminAuthenticate, hasPermission(['view_analytics']), async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        const activities = await AdminActivity.find()
            .populate('admin', 'name email role')
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await AdminActivity.countDocuments();

        res.json({
            activities,
            pagination: {
                total,
                limit,
                skip,
                hasMore: skip + activities.length < total
            }
        });

    } catch (err) {
        console.error('Get all activities error:', err);
        res.status(500).json({ message: 'Failed to fetch activities' });
    }
});

// Get dashboard stats (admin only)
router.get('/dashboard/stats', adminAuthenticate, async (req, res) => {
    try {
        // These would come from your other models
        const stats = {
            totalUsers: 0, // await User.countDocuments()
            totalOrders: 0, // await Order.countDocuments()
            totalProducts: 0, // await Product.countDocuments()
            totalProjects: 0, // await Project.countDocuments()
            recentActivities: await AdminActivity.find()
                .populate('admin', 'name')
                .sort({ createdAt: -1 })
                .limit(10)
        };

        res.json(stats);

    } catch (err) {
        console.error('Get dashboard stats error:', err);
        res.status(500).json({ message: 'Failed to fetch dashboard stats' });
    }
});

module.exports = router;