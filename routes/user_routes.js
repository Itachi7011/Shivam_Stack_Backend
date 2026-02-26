// routes/users/userRoutes.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const User = require('../models/users/User');
const UserActivity = require('../models/users/UserActivity');
const { userAuthenticate, optionalUserAuthenticate } = require('../middleware/userAuth');
const { cloudinarySingleUpload } = require('../middleware/cloudinaryUploader');
const { 
  generateOTP, 
  sendUserRegistrationOTP,
  sendWelcomeEmail 
} = require('../services/emailService');
const userActivityService = require('../services/userActivityService');
const tokenService = require('../services/tokenService');

/* ==============================
   PUBLIC ROUTES
================================ */

// Register new user
router.post('/register', cloudinarySingleUpload('avatar', 'shivamstack/avatars'), async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { name, email, password, phone, preferences } = req.body;

        // Check if user exists
        const existingUser = await User.findOne({ email: email.toLowerCase() }).session(session);
        if (existingUser) {
            await session.abortTransaction();
            session.endSession();
            return res.status(409).json({ 
                message: 'An account with this email already exists.' 
            });
        }

        // Parse preferences if it's a string (from FormData)
        let userPreferences = { newsletter: false };
        if (preferences) {
            try {
                userPreferences = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;
            } catch (e) {
                userPreferences = { newsletter: preferences === 'true' };
            }
        }

        // Generate OTP for email verification
        const otp = generateOTP();
        const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        // Create user
        const userData = {
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password,
            phone: phone || undefined,
            preferences: userPreferences,
            verificationToken: otp,
            verificationTokenExpires: otpExpiry
        };

        // Add avatar if uploaded
        if (req.cloudinaryFile) {
            userData.avatar = {
                url: req.cloudinaryFile.data,
                publicId: req.cloudinaryFile.publicId
            };
        }

        const user = new User(userData);
        await user.save({ session });

        // Send verification OTP email
        try {
            await sendUserRegistrationOTP(user.email, {
                name: user.name,
                otp: otp,
                website: { websiteName: 'ShivamStack' },
                company: { name: 'ShivamStack' },
                expiration: 10
            });
        } catch (emailErr) {
            console.error('Failed to send verification email:', emailErr);
            // Continue - user can request resend later
        }

        await session.commitTransaction();
        session.endSession();

        res.status(201).json({ 
            message: 'Registration successful! Please check your email for the OTP to verify your account.',
            email: user.email,
            requiresOTP: true
        });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Registration error:', err);
        
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

// Verify email with OTP
router.post('/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const user = await User.findOne({
            email: email.toLowerCase(),
            verificationToken: otp,
            verificationTokenExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ 
                message: 'Invalid or expired OTP.' 
            });
        }

        user.emailVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        // Send welcome email
        try {
            await sendWelcomeEmail(user.email, user.name, 'ShivamStack');
        } catch (emailErr) {
            console.error('Failed to send welcome email:', emailErr);
        }

        // Track activity
        await userActivityService.trackActivity(user._id, 'update_profile', {
            metadata: { action: 'email_verified' },
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.json({ 
            message: 'Email verified successfully! You can now log in.' 
        });

    } catch (err) {
        console.error('Email verification error:', err);
        res.status(500).json({ 
            message: 'Email verification failed.' 
        });
    }
});

// Resend verification OTP
router.post('/resend-verification', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        
        // Don't reveal if email exists
        if (!user || user.emailVerified) {
            return res.json({ 
                message: 'If your email exists and is not verified, a new OTP will be sent.' 
            });
        }

        // Generate new OTP
        const otp = generateOTP();
        user.verificationToken = otp;
        user.verificationTokenExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
        await user.save();

        await sendUserRegistrationOTP(user.email, {
            name: user.name,
            otp: otp,
            website: { websiteName: 'ShivamStack' },
            company: { name: 'ShivamStack' },
            expiration: 10
        });

        res.json({ 
            message: 'Verification OTP sent successfully.' 
        });

    } catch (err) {
        console.error('Resend verification error:', err);
        res.status(500).json({ 
            message: 'Failed to resend verification OTP.' 
        });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user with password field included
        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({ 
                message: 'Invalid email or password.' 
            });
        }

        // Check if account is locked
        if (user.isLocked) {
            const lockRemaining = Math.ceil((user.lockUntil - Date.now()) / 60000);
            return res.status(423).json({ 
                message: 'Account temporarily locked.',
                lockRemainingMinutes: lockRemaining
            });
        }

        // Check if account is blocked
        if (user.isBlocked) {
            return res.status(403).json({ 
                message: user.blockedReason || 'Your account has been blocked.',
                code: 'ACCOUNT_BLOCKED'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        
        if (!isPasswordValid) {
            await user.incrementLoginAttempts();
            
            // Get remaining attempts
            const attemptsRemaining = 5 - (user.loginAttempts || 0);
            
            return res.status(401).json({ 
                message: 'Invalid email or password.',
                attemptsRemaining: Math.max(0, attemptsRemaining)
            });
        }

        // Check if email is verified
        if (!user.emailVerified) {
            return res.status(403).json({ 
                message: 'Please verify your email before logging in.',
                code: 'EMAIL_NOT_VERIFIED'
            });
        }

        // Reset login attempts on successful login
        await user.resetLoginAttempts();

        // Generate tokens
        const { accessToken, refreshToken } = tokenService.generateAuthTokens(user._id);

        // Save tokens to user
        user.tokens = user.tokens || [];
        user.tokens.push({
            token: accessToken,
            type: 'access',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        });
        user.tokens.push({
            token: refreshToken,
            type: 'refresh',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        user.lastLogin = new Date();
        await user.save();

        // Track activity
        await userActivityService.trackActivity(user._id, 'login', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        // Set cookie
        res.cookie('cookies1', accessToken, {
            expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        res.json({
            message: 'Login successful!',
            token: accessToken,
            refreshToken,
            user: user.getPublicProfile()
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ 
            message: 'Login failed. Please try again.' 
        });
    }
});

// Refresh token
router.post('/refresh-token', async (req, res) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(400).json({ message: 'Refresh token required' });
        }

        // Verify refresh token
        const decoded = tokenService.verifyRefreshToken(refreshToken);

        // Find user with this token
        const user = await User.findOne({
            _id: decoded.userId,
            'tokens.token': refreshToken,
            'tokens.type': 'refresh',
            'tokens.isRevoked': false
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid refresh token' });
        }

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = tokenService.generateAuthTokens(user._id);

        // Revoke old refresh token
        await User.updateOne(
            { _id: user._id, 'tokens.token': refreshToken },
            { $set: { 'tokens.$.isRevoked': true } }
        );

        // Add new tokens
        user.tokens.push({
            token: accessToken,
            type: 'access',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });
        user.tokens.push({
            token: newRefreshToken,
            type: 'refresh',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        await user.save();

        res.json({
            token: accessToken,
            refreshToken: newRefreshToken
        });

    } catch (err) {
        console.error('Token refresh error:', err);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ message: 'Refresh token expired' });
        }
        res.status(500).json({ message: 'Token refresh failed' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        
        // Always return success to prevent email enumeration
        if (user && user.emailVerified) {
            const resetToken = user.generatePasswordResetToken();
            await user.save();
            
            // Send password reset email with token (not OTP)
            const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
            
            // You can create a separate email template for password reset
            // For now, using a simple email structure
            const { sendEmail } = require('../../services/emailService');
            await sendEmail(
                user.email,
                'Reset Your ShivamStack Password',
                `
                <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                    <h2>Password Reset Request</h2>
                    <p>Dear ${user.name},</p>
                    <p>We received a request to reset your password. Click the link below to set a new password:</p>
                    <p><a href="${resetUrl}">${resetUrl}</a></p>
                    <p style="color: #dc2626;">⚠️ This link will expire in 1 hour. Do not share this link.</p>
                    <p>If you didn't request this, please ignore this email.</p>
                    <p>Best regards,<br>The ShivamStack Team</p>
                </div>
                `
            );
        }

        res.json({ 
            message: 'If your email exists and is verified, you will receive a password reset link.' 
        });

    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ 
            message: 'Failed to process request.' 
        });
    }
});

// Validate reset token
router.post('/validate-reset-token', async (req, res) => {
    try {
        const { token } = req.body;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
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

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        }).session(session);

        if (!user) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ 
                message: 'Invalid or expired reset token.' 
            });
        }

        // Update password
        user.password = newPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        
        // Revoke all existing tokens for security
        if (user.tokens && user.tokens.length > 0) {
            user.tokens.forEach(t => t.isRevoked = true);
        }

        await user.save({ session });

        // Track activity
        await userActivityService.trackActivity(user._id, 'change_password', {
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
        console.error('Reset password error:', err);
        res.status(500).json({ 
            message: 'Password reset failed.' 
        });
    }
});

// Logout
router.post('/logout', userAuthenticate, async (req, res) => {
    try {
        // Revoke the current token
        await User.updateOne(
            { _id: req.userId, 'tokens.token': req.token },
            { $set: { 'tokens.$.isRevoked': true } }
        );

        // Track activity
        await userActivityService.trackActivity(req.userId, 'logout', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        // Clear cookie
        res.clearCookie('cookies1');

        res.json({ message: 'Logout successful' });

    } catch (err) {
        console.error('Logout error:', err);
        res.status(500).json({ message: 'Logout failed' });
    }
});

// Logout from all devices
router.post('/logout-all', userAuthenticate, async (req, res) => {
    try {
        // Revoke all tokens
        await User.updateOne(
            { _id: req.userId },
            { $set: { 'tokens.$[].isRevoked': true } }
        );

        // Track activity
        await userActivityService.trackActivity(req.userId, 'logout', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { allDevices: true }
        });

        // Clear cookie
        res.clearCookie('cookies1');

        res.json({ message: 'Logged out from all devices' });

    } catch (err) {
        console.error('Logout all error:', err);
        res.status(500).json({ message: 'Logout failed' });
    }
});

/* ==============================
   PROTECTED ROUTES
================================ */

// Get current user profile
router.get('/profile', userAuthenticate, async (req, res) => {
    try {
        res.json(req.user.getPublicProfile());
    } catch (err) {
        console.error('Get profile error:', err);
        res.status(500).json({ message: 'Failed to fetch profile' });
    }
});

// Update profile
router.patch('/profile', userAuthenticate, cloudinarySingleUpload('avatar', 'shivamstack/avatars'), async (req, res) => {
    try {
        const { name, phone, preferences } = req.body;
        const user = req.user;

        // Update allowed fields
        if (name) user.name = name.trim();
        if (phone !== undefined) user.phone = phone || undefined;
        
        if (preferences) {
            const prefs = typeof preferences === 'string' ? JSON.parse(preferences) : preferences;
            if (prefs.theme) user.preferences.theme = prefs.theme;
            if (prefs.newsletter !== undefined) user.preferences.newsletter = prefs.newsletter;
        }

        // Update avatar if new one uploaded
        if (req.cloudinaryFile) {
            // Delete old avatar from cloudinary if exists
            if (user.avatar && user.avatar.publicId) {
                try {
                    const cloudinary = require('../../config/cloudinary');
                    await cloudinary.uploader.destroy(user.avatar.publicId);
                } catch (err) {
                    console.error('Failed to delete old avatar:', err);
                }
            }

            user.avatar = {
                url: req.cloudinaryFile.data,
                publicId: req.cloudinaryFile.publicId
            };
        }

        await user.save();

        // Track activity
        await userActivityService.trackActivity(user._id, 'update_profile', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { updatedFields: Object.keys(req.body) }
        });

        res.json({
            message: 'Profile updated successfully',
            user: user.getPublicProfile()
        });

    } catch (err) {
        console.error('Update profile error:', err);
        if (err.name === 'ValidationError') {
            return res.status(400).json({ 
                message: 'Invalid data provided.',
                errors: Object.values(err.errors).map(e => e.message)
            });
        }
        res.status(500).json({ message: 'Profile update failed' });
    }
});

// Change password
router.post('/change-password', userAuthenticate, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { currentPassword, newPassword } = req.body;
        
        // Get user with password field
        const user = await User.findById(req.userId).select('+password').session(session);

        // Verify current password
        const isPasswordValid = await user.comparePassword(currentPassword);
        if (!isPasswordValid) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: 'Current password is incorrect' });
        }

        // Update password
        user.password = newPassword;
        
        // Optional: Revoke all other tokens except current
        if (user.tokens && user.tokens.length > 0) {
            user.tokens.forEach(t => {
                if (t.token !== req.token) {
                    t.isRevoked = true;
                }
            });
        }

        await user.save({ session });

        // Track activity
        await userActivityService.trackActivity(user._id, 'change_password', {
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
        console.error('Change password error:', err);
        res.status(500).json({ message: 'Password change failed' });
    }
});

// Get user activities
router.get('/activities', userAuthenticate, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const skip = parseInt(req.query.skip) || 0;

        const activities = await UserActivity.find({ user: req.userId })
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip(skip);

        const total = await UserActivity.countDocuments({ user: req.userId });

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
        console.error('Get activities error:', err);
        res.status(500).json({ message: 'Failed to fetch activities' });
    }
});

// Delete account (soft delete - deactivate)
router.delete('/account', userAuthenticate, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const { password } = req.body;
        
        // Get user with password
        const user = await User.findById(req.userId).select('+password').session(session);

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            await session.abortTransaction();
            session.endSession();
            return res.status(401).json({ message: 'Password is incorrect' });
        }

        // Soft delete - deactivate account
        user.isActive = false;
        user.tokens.forEach(t => t.isRevoked = true);
        await user.save({ session });

        // Track activity
        await userActivityService.trackActivity(user._id, 'update_profile', {
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            metadata: { action: 'account_deactivation' },
            session
        });

        await session.commitTransaction();
        session.endSession();

        // Clear cookie
        res.clearCookie('cookies1');

        res.json({ message: 'Account deactivated successfully' });

    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error('Delete account error:', err);
        res.status(500).json({ message: 'Account deactivation failed' });
    }
});

/* ==============================
   SOCIAL AUTH ROUTES (Placeholders)
================================ */

router.get('/google', (req, res) => {
    res.json({ message: 'Google OAuth will be implemented here' });
});

router.get('/github', (req, res) => {
    res.json({ message: 'GitHub OAuth will be implemented here' });
});

module.exports = router;