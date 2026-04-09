// routes/admin/adminRoutes.js
const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
const speakeasy = require("speakeasy");

const Admin = require("../models/admin/Admin");
const AdminActivity = require("../models/admin/AdminActivity");
const SiteSettingsDB = require("../models/admin/SiteSettings");
const NewsletterSubscriberDB = require("../models/public/NewsletterSubscriber");
const BlogDB = require("../models/public/Blog");
const BlogCategoryDB = require("../models/public/BlogCategory");
const ReviewDB = require("../models/public/Review");
const ProductDB = require("../models/public/Product");
const ProductCategoryDB = require("../models/public/ProductCategory");
const ProjectDB = require("../models/public/Project");
const ProjectCategoryDB = require("../models/public/ProjectCategory");
const UserDB = require("../models/users/User");
const ContactMessageDB = require("../models/public/Contact");
const BookCallDB = require("../models/public/BookCall");
const UserActivityDB = require("../models/users/UserActivity");
const DownloadDB = require("../models/users/Download");
const CouponDB = require("../models/shared/Coupon");
const InvoiceDB = require("../models/shared/Invoice");
const OrderDB = require("../models/shared/Order");
const PaymentDB = require("../models/shared/Payment");
const { adminAuthenticate, hasPermission } = require("../middleware/adminAuth");
const { sendEmail } = require("../services/emailService");
const tokenService = require("../services/tokenService");
const adminActivityService = require("../services/adminActivityService");

/* ==============================
   PUBLIC ROUTES
================================ */

// Register new admin
router.post("/register", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { name, email, password } = req.body;

    // Check if admin exists
    const existingAdmin = await Admin.findOne({
      email: email.toLowerCase(),
    }).session(session);
    if (existingAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(409).json({
        message: "An admin with this email already exists.",
      });
    }

    // Check if this is the first admin (make them superadmin)
    const adminCount = await Admin.countDocuments();

    const adminData = {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: adminCount === 0 ? "superadmin" : "admin",
      permissions:
        adminCount === 0
          ? [
              "manage_products",
              "manage_orders",
              "manage_users",
              "manage_blog",
              "manage_projects",
              "manage_coupons",
              "view_analytics",
              "manage_settings",
            ]
          : [], // New admins get no permissions until assigned
    };

    const admin = new Admin(adminData);
    await admin.save({ session });

    await session.commitTransaction();
    session.endSession();

    // Send welcome email
    try {
      await sendEmail(
        admin.email,
        "Welcome to ShivamStack Admin",
        `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Welcome, ${admin.name}!</h2>
                    <p>Your admin account has been created successfully.</p>
                    <p><strong>Role:</strong> ${admin.role}</p>
                    <p>You can now login at: ${process.env.ADMIN_URL || "http://localhost:3000/admin/login"}</p>
                    <p style="color: #dc2626;">⚠️ Please keep your credentials secure.</p>
                </div>
                `,
      );
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
    }

    res.status(201).json({
      message: "Admin account created successfully!",
      role: admin.role,
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Admin registration error:", err);

    if (err.name === "ValidationError") {
      return res.status(400).json({
        message: "Invalid data provided.",
        errors: Object.values(err.errors).map((e) => e.message),
      });
    }

    res.status(500).json({
      message: "Registration failed. Please try again.",
    });
  }
});

// Admin login
router.post("/login", async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    console.log(email, password, twoFactorCode);

    // Find admin with password field included
    const admin = await Admin.findOne({ email: email.toLowerCase() }).select(
      "+password +twoFactorSecret",
    );
    console.log(admin);

    if (!admin) {
      return res.status(401).json({
        message: "Invalid email or password.",
      });
    }

    // Check if account is active
    if (!admin.isActive) {
      return res.status(403).json({
        message: "Account is deactivated. Contact superadmin.",
      });
    }

    // Check if account is blocked
    if (admin.isBlocked) {
      return res.status(403).json({
        message: "Account has been blocked. Contact superadmin.",
      });
    }

    // Check if account is locked
    if (admin.isLocked) {
      const lockRemaining = Math.ceil((admin.lockUntil - Date.now()) / 60000);
      return res.status(423).json({
        message: "Account temporarily locked due to multiple failed attempts.",
        lockRemainingMinutes: lockRemaining,
      });
    }

    // Verify password
    const isPasswordValid = await admin.comparePassword(password);
    console.log("isPasswordValid is", isPasswordValid);

    if (!isPasswordValid) {
      await admin.incrementLoginAttempts();

      const attemptsRemaining = 5 - (admin.loginAttempts || 0);

      return res.status(401).json({
        message: "Invalid email or password.",
        attemptsRemaining: Math.max(0, attemptsRemaining),
      });
    }

    // Check 2FA if enabled
    if (admin.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(202).json({
          message: "2FA code required.",
          requires2FA: true,
        });
      }

      const verified = speakeasy.totp.verify({
        secret: admin.twoFactorSecret,
        encoding: "base32",
        token: twoFactorCode,
      });

      if (!verified) {
        return res.status(401).json({
          message: "Invalid 2FA code.",
        });
      }
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Generate tokens
    const { accessToken, refreshToken } = tokenService.generateAdminTokens(
      admin._id,
    );

    // STORE TOKENS IN DATABASE
    admin.tokens = admin.tokens || [];

    // Add access token
    admin.tokens.push({
      token: accessToken,
      type: "access",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      isRevoked: false,
    });

    // Add refresh token
    admin.tokens.push({
      token: refreshToken,
      type: "refresh",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      isRevoked: false,
    });

    admin.lastLogin = new Date();
    await admin.save();

    // Track activity
    await adminActivityService.trackActivity(admin._id, "login", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    const isProduction = process.env.NODE_ENV === "production";

    // For production cross‑origin, you need sameSite='none' and secure=true
    // For localhost development, sameSite='lax' and secure=false works
    const cookieOptions = {
      httpOnly: true,
      secure: isProduction, // true in production (requires HTTPS)
      sameSite: isProduction ? "none" : "lax",
      path: "/",
      expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };

    // Only set domain in development (localhost) – omit in production
    if (!isProduction) {
      cookieOptions.domain = "localhost";
    }

    res.cookie("adminToken", accessToken, cookieOptions);

    console.log("✅ Admin login successful, tokens stored in DB");

    res.json({
      message: "Login successful!",
      token: accessToken,
      refreshToken,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        permissions: admin.permissions,
        twoFactorEnabled: admin.twoFactorEnabled,
      },
    });
  } catch (err) {
    console.error("Admin login error:", err);
    res.status(500).json({
      message: "Login failed. Please try again.",
    });
  }
});

// Forgot password
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const admin = await Admin.findOne({
      email: email.toLowerCase(),
      isActive: true,
    });

    if (admin) {
      const resetToken = admin.generatePasswordResetToken();
      await admin.save();

      const resetUrl = `${process.env.ADMIN_URL || "http://localhost:3000/admin/reset-password"}?token=${resetToken}`;

      await sendEmail(
        admin.email,
        "Reset Your ShivamStack Admin Password",
        `
                <div style="font-family: Arial, sans-serif;">
                    <h2>Password Reset Request</h2>
                    <p>Dear ${admin.name},</p>
                    <p>We received a request to reset your admin password. Click the link below to set a new password:</p>
                    <p><a href="${resetUrl}">${resetUrl}</a></p>
                    <p style="color: #dc2626;">⚠️ This link will expire in 1 hour. Do not share this link.</p>
                    <p>If you didn't request this, please ignore this email and ensure your account is secure.</p>
                </div>
                `,
      );
    }

    // Always return success to prevent email enumeration
    res.json({
      message:
        "If your email exists and is active, you will receive a password reset link.",
    });
  } catch (err) {
    console.error("Admin forgot password error:", err);
    res.status(500).json({
      message: "Failed to process request.",
    });
  }
});

// Validate reset token
router.post("/validate-reset-token", async (req, res) => {
  try {
    const { token } = req.body;

    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!admin) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    res.json({ valid: true });
  } catch (err) {
    console.error("Validate reset token error:", err);
    res.status(500).json({ message: "Token validation failed" });
  }
});

// Reset password
router.post("/reset-password", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { token, newPassword } = req.body;

    const admin = await Admin.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }).session(session);

    if (!admin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: "Invalid or expired reset token.",
      });
    }

    // Update password
    admin.password = newPassword;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpires = undefined;

    await admin.save({ session });

    // Track activity
    await adminActivityService.trackActivity(admin._id, "change_password", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { method: "reset" },
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.json({
      message:
        "Password reset successful! You can now log in with your new password.",
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Admin reset password error:", err);
    res.status(500).json({
      message: "Password reset failed.",
    });
  }
});

// Logout
router.post("/logout", adminAuthenticate, async (req, res) => {
  try {
    // Revoke the current token
    await Admin.updateOne(
      { _id: req.adminId, "tokens.token": req.adminToken },
      { $set: { "tokens.$.isRevoked": true } },
    );

    // Track activity
    await adminActivityService.trackActivity(req.adminId, "logout", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    // Clear cookie
    res.clearCookie("adminToken", {
      domain: "localhost",
      path: "/",
    });

    res.json({ message: "Logout successful" });
  } catch (err) {
    console.error("Admin logout error:", err);
    res.status(500).json({ message: "Logout failed" });
  }
});

/* ==============================
   PROTECTED ROUTES
================================ */

// Get current admin profile
router.get("/profile", adminAuthenticate, async (req, res) => {
  try {
    // console.log("it hitted");
    res.json({
      id: req.admin._id,
      name: req.admin.name,
      email: req.admin.email,
      role: req.admin.role,
      permissions: req.admin.permissions,
      twoFactorEnabled: req.admin.twoFactorEnabled,
      lastLogin: req.admin.lastLogin,
      createdAt: req.admin.createdAt,
    });
  } catch (err) {
    console.error("Get admin profile error:", err);
    res.status(500).json({ message: "Failed to fetch profile" });
  }
});

// Enable 2FA
router.post("/2fa/enable", adminAuthenticate, async (req, res) => {
  try {
    const admin = await Admin.findById(req.adminId).select("+twoFactorSecret");

    const secret = speakeasy.generateSecret({
      name: `ShivamStack:${admin.email}`,
    });

    admin.twoFactorSecret = secret.base32;
    await admin.save();

    await adminActivityService.trackActivity(admin._id, "enable_2fa", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({
      secret: secret.base32,
      otpauth_url: secret.otpauth_url,
    });
  } catch (err) {
    console.error("Enable 2FA error:", err);
    res.status(500).json({ message: "Failed to enable 2FA" });
  }
});

// Verify and confirm 2FA
router.post("/2fa/verify", adminAuthenticate, async (req, res) => {
  try {
    const { token } = req.body;
    const admin = await Admin.findById(req.adminId).select("+twoFactorSecret");

    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: "base32",
      token,
    });

    if (!verified) {
      return res.status(400).json({ message: "Invalid verification code" });
    }

    admin.twoFactorEnabled = true;
    await admin.save();

    res.json({ message: "2FA enabled successfully" });
  } catch (err) {
    console.error("Verify 2FA error:", err);
    res.status(500).json({ message: "Failed to verify 2FA" });
  }
});

// Disable 2FA
router.post("/2fa/disable", adminAuthenticate, async (req, res) => {
  try {
    const { password } = req.body;
    const admin = await Admin.findById(req.adminId).select("+password");

    const isPasswordValid = await admin.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Password is incorrect" });
    }

    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = undefined;
    await admin.save();

    await adminActivityService.trackActivity(admin._id, "disable_2fa", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    res.json({ message: "2FA disabled successfully" });
  } catch (err) {
    console.error("Disable 2FA error:", err);
    res.status(500).json({ message: "Failed to disable 2FA" });
  }
});

// Change password
router.post("/change-password", adminAuthenticate, async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.adminId)
      .select("+password")
      .session(session);

    const isPasswordValid = await admin.comparePassword(currentPassword);
    if (!isPasswordValid) {
      await session.abortTransaction();
      session.endSession();
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    admin.password = newPassword;
    await admin.save({ session });

    await adminActivityService.trackActivity(admin._id, "change_password", {
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: { method: "manual" },
      session,
    });

    await session.commitTransaction();
    session.endSession();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Admin change password error:", err);
    res.status(500).json({ message: "Password change failed" });
  }
});

/* ==============================
   SUPERADMIN ROUTES
================================ */

// Get all admins (superadmin only)
router.get(
  "/admins",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    try {
      const admins = await Admin.find()
        .select("-password -twoFactorSecret")
        .sort({ createdAt: -1 });

      res.json(admins);
    } catch (err) {
      console.error("Get admins error:", err);
      res.status(500).json({ message: "Failed to fetch admins" });
    }
  },
);

// Get admin by ID (superadmin only)
router.get(
  "/admins/:id",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    try {
      const admin = await Admin.findById(req.params.id).select(
        "-password -twoFactorSecret",
      );

      if (!admin) {
        return res.status(404).json({ message: "Admin not found" });
      }

      res.json(admin);
    } catch (err) {
      console.error("Get admin error:", err);
      res.status(500).json({ message: "Failed to fetch admin" });
    }
  },
);

// Update admin permissions (superadmin only)
router.patch(
  "/admins/:id/permissions",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { permissions } = req.body;
      const admin = await Admin.findById(req.params.id).session(session);

      if (!admin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Admin not found" });
      }

      // Store old permissions for activity tracking
      const oldPermissions = [...admin.permissions];

      admin.permissions = permissions;
      await admin.save({ session });

      await adminActivityService.trackActivity(
        req.adminId,
        "update_permissions",
        {
          resourceType: "admin",
          resourceId: admin._id,
          changes: {
            before: oldPermissions,
            after: permissions,
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          session,
        },
      );

      await session.commitTransaction();
      session.endSession();

      res.json({
        message: "Permissions updated successfully",
        permissions: admin.permissions,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Update permissions error:", err);
      res.status(500).json({ message: "Failed to update permissions" });
    }
  },
);

// Update admin role (superadmin only)
router.patch(
  "/admins/:id/role",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { role } = req.body;
      const admin = await Admin.findById(req.params.id).session(session);

      if (!admin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Admin not found" });
      }

      // Don't allow changing own role if last superadmin
      if (admin._id.toString() === req.adminId && role !== "superadmin") {
        const superadminCount = await Admin.countDocuments({
          role: "superadmin",
        });
        if (superadminCount <= 1) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message:
              "Cannot change your own role. You are the only superadmin.",
          });
        }
      }

      const oldRole = admin.role;
      admin.role = role;
      await admin.save({ session });

      await adminActivityService.trackActivity(
        req.adminId,
        "update_permissions",
        {
          resourceType: "admin",
          resourceId: admin._id,
          changes: {
            before: { role: oldRole },
            after: { role },
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          session,
        },
      );

      await session.commitTransaction();
      session.endSession();

      res.json({
        message: "Role updated successfully",
        role: admin.role,
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Update role error:", err);
      res.status(500).json({ message: "Failed to update role" });
    }
  },
);

// Block/unblock admin (superadmin only)
router.patch(
  "/admins/:id/block",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { block, reason } = req.body;
      const admin = await Admin.findById(req.params.id).session(session);

      if (!admin) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: "Admin not found" });
      }

      // Don't allow blocking self
      if (admin._id.toString() === req.adminId) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: "Cannot block your own account" });
      }

      admin.isBlocked = block;
      if (block && reason) admin.blockedReason = reason;
      await admin.save({ session });

      await adminActivityService.trackActivity(
        req.adminId,
        block ? "block_admin" : "unblock_admin",
        {
          resourceType: "admin",
          resourceId: admin._id,
          changes: {
            before: { isBlocked: !block },
            after: { isBlocked: block, reason },
          },
          ipAddress: req.ip,
          userAgent: req.get("user-agent"),
          session,
        },
      );

      await session.commitTransaction();
      session.endSession();

      res.json({
        message: block
          ? "Admin blocked successfully"
          : "Admin unblocked successfully",
      });
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      console.error("Block admin error:", err);
      res.status(500).json({ message: "Failed to update admin status" });
    }
  },
);

// Get admin activities (own activities)
router.get("/activities", adminAuthenticate, async (req, res) => {
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
        hasMore: skip + activities.length < total,
      },
    });
  } catch (err) {
    console.error("Get admin activities error:", err);
    res.status(500).json({ message: "Failed to fetch activities" });
  }
});

// Get all admin activities (superadmin only)
router.get(
  "/all-activities",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const skip = parseInt(req.query.skip) || 0;

      const activities = await AdminActivity.find()
        .populate("admin", "name email role")
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
          hasMore: skip + activities.length < total,
        },
      });
    } catch (err) {
      console.error("Get all activities error:", err);
      res.status(500).json({ message: "Failed to fetch activities" });
    }
  },
);

// Add these new routes to your existing adminRoutes.js

// ==================== DASHBOARD STATS ====================

// Get comprehensive dashboard statistics
router.get("/dashboard/stats", adminAuthenticate, async (req, res) => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    const [
      totalProducts,
      publishedProducts,
      totalBlogs,
      publishedBlogs,
      totalProjects,
      completedProjects,
      totalCoupons,
      activeCoupons,
      totalBlogCats,
      totalProdCats,
      totalProjectCats,
      totalNewsletterSubs,
      recentNewsletterSubs,
      totalReviews,
      approvedReviews,
      pendingReviews,
      totalUsers,
      activeUsers,
      totalAdmins,
      activeAdmins,
      totalDownloads,
      recentDownloads,
      totalOrders,
      completedOrders,
      totalPayments,
      completedPayments,
      totalInvoices,
      paidInvoices,
      recentActivities,
    ] = await Promise.all([
      // Products
      ProductDB.countDocuments(),
      ProductDB.countDocuments({ isPublished: true }),

      // Blogs
      BlogDB.countDocuments(),
      BlogDB.countDocuments({ isPublished: true }),

      // Projects
      ProjectDB.countDocuments(),
      ProjectDB.countDocuments({ status: "completed" }),

      // Coupons
      CouponDB.countDocuments(),
      CouponDB.countDocuments({
        isActive: true,
        $or: [
          { validTill: { $exists: false } },
          { validTill: null },
          { validTill: { $gte: new Date() } },
        ],
      }),

      // Categories
      BlogCategoryDB.countDocuments(),
      ProductCategoryDB.countDocuments(),
      ProjectCategoryDB.countDocuments(),

      // Newsletter Subscribers
      NewsletterSubscriberDB.countDocuments(),
      NewsletterSubscriberDB.countDocuments({
        createdAt: { $gte: thirtyDaysAgo },
      }),

      // Reviews
      ReviewDB.countDocuments(),
      ReviewDB.countDocuments({ isApproved: true }),
      ReviewDB.countDocuments({ isApproved: false }),

      // Users
      UserDB.countDocuments(),
      UserDB.countDocuments({
        lastLogin: { $gte: thirtyDaysAgo },
        isActive: true,
      }),

      // Admins
      Admin.countDocuments(),
      Admin.countDocuments({
        lastLogin: { $gte: thirtyDaysAgo },
        isActive: true,
      }),

      // Downloads
      DownloadDB.countDocuments(),
      DownloadDB.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),

      // Orders
      OrderDB.countDocuments(),
      OrderDB.countDocuments({ status: "completed" }),

      // Payments
      PaymentDB.countDocuments(),
      PaymentDB.countDocuments({ status: "completed" }),

      // Invoices
      InvoiceDB.countDocuments(),
      InvoiceDB.countDocuments({ status: "paid" }),

      // Recent Activities
      AdminActivity.find()
        .populate("admin", "name email")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    // Get revenue data
    const revenueData = await OrderDB.aggregate([
      {
        $match: {
          status: { $in: ["completed", "processing"] },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$totalAmount" },
        },
      },
    ]);

    const totalRevenue = revenueData[0]?.total || 0;

    res.json({
      data: {
        // Products
        totalProducts,
        publishedProducts,

        // Blogs
        totalBlogs,
        publishedBlogs,

        // Projects
        totalProjects,
        completedProjects,

        // Coupons
        totalCoupons,
        activeCoupons,

        // Categories
        totalBlogCats,
        totalProdCats,
        totalProjectCats,

        // Newsletter
        totalNewsletterSubs,
        recentNewsletterSubs: recentNewsletterSubs,

        // Reviews
        totalReviews,
        approvedReviews,
        pendingReviews,

        // Users & Admins
        totalUsers,
        activeUsers,
        totalAdmins,
        activeAdmins,

        // Downloads
        totalDownloads,
        recentDownloads: recentDownloads,

        // Orders
        totalOrders,
        completedOrders,

        // Payments
        totalPayments,
        completedPayments,
        totalRevenue,

        // Invoices
        totalInvoices,
        paidInvoices,

        // Activities
        recentActivities,
      },
    });
  } catch (err) {
    console.error("Get dashboard stats error:", err);
    res.status(500).json({ message: "Failed to fetch dashboard statistics" });
  }
});

// ==================== NEWSLETTER SUBSCRIBERS ====================

// Get all newsletter subscribers
router.get(
  "/newsletter-subscribers",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", status } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { email: { $regex: search, $options: "i" } },
          { name: { $regex: search, $options: "i" } },
        ];
      }

      if (status === "active") query.isActive = true;
      if (status === "unsubscribed") query.isActive = false;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const subscribers = await NewsletterSubscriberDB.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select("email name isActive subscribedAt unsubscribedAt");

      const total = await NewsletterSubscriberDB.countDocuments(query);

      res.json({
        data: subscribers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error("Get newsletter subscribers error:", err);
      res
        .status(500)
        .json({ message: "Failed to fetch newsletter subscribers" });
    }
  },
);

// Export newsletter subscribers as CSV
router.get(
  "/newsletter-subscribers/export",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const subscribers = await NewsletterSubscriberDB.find({ isActive: true })
        .select("email name subscribedAt")
        .sort({ subscribedAt: -1 });

      const csv = [
        ["Email", "Name", "Subscribed Date"].join(","),
        ...subscribers.map((sub) =>
          [
            sub.email,
            sub.name || "",
            new Date(sub.subscribedAt).toISOString().split("T")[0],
          ].join(","),
        ),
      ].join("\n");

      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        "attachment; filename=newsletter-subscribers.csv",
      );
      res.send(csv);
    } catch (err) {
      console.error("Export newsletter subscribers error:", err);
      res
        .status(500)
        .json({ message: "Failed to export newsletter subscribers" });
    }
  },
);

// ==================== REVIEWS ====================

// Get all reviews
router.get(
  "/reviews",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 50,
        search = "",
        status,
        productId,
      } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { title: { $regex: search, $options: "i" } },
          { comment: { $regex: search, $options: "i" } },
        ];
      }

      if (status === "approved") query.isApproved = true;
      if (status === "pending") query.isApproved = false;
      if (productId) query.product = productId;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const reviews = await ReviewDB.find(query)
        .populate("user", "name email")
        .populate("product", "name slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await ReviewDB.countDocuments(query);

      res.json({
        data: reviews,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      });
    } catch (err) {
      console.error("Get reviews error:", err);
      res.status(500).json({ message: "Failed to fetch reviews" });
    }
  },
);

// Approve review
router.patch(
  "/reviews/:id/approve",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const review = await ReviewDB.findById(req.params.id);
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      review.isApproved = true;
      await review.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Review",
        resourceId: review._id,
        metadata: { action: "approve_review" },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Review approved successfully", data: review });
    } catch (err) {
      console.error("Approve review error:", err);
      res.status(500).json({ message: "Failed to approve review" });
    }
  },
);

// Delete review
router.delete(
  "/reviews/:id",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const review = await ReviewDB.findById(req.params.id);
      if (!review) {
        return res.status(404).json({ message: "Review not found" });
      }

      await review.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "Review",
        resourceId: review._id,
        metadata: { action: "delete_review" },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Review deleted successfully" });
    } catch (err) {
      console.error("Delete review error:", err);
      res.status(500).json({ message: "Failed to delete review" });
    }
  },
);

// ==================== DOWNLOADS ====================

// Get all downloads with details
router.get(
  "/downloads",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", userId, fileName } = req.query;
      const query = {};

      if (search) {
        query.fileName = { $regex: search, $options: "i" };
      }
      if (userId) query.user = userId;
      if (fileName) query.fileName = { $regex: fileName, $options: "i" };

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const downloads = await DownloadDB.find(query)
        .populate("user", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await DownloadDB.countDocuments(query);

      // Get total downloads count
      const totalDownloadsCount = await DownloadDB.countDocuments();

      res.json({
        data: {
          downloads,
          totalCount: totalDownloadsCount,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (err) {
      console.error("Get downloads error:", err);
      res.status(500).json({ message: "Failed to fetch downloads" });
    }
  },
);

// Get download statistics
router.get(
  "/downloads/stats",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totalDownloads, downloadsByFile, recentDownloads, topDownloaders] =
        await Promise.all([
          DownloadDB.countDocuments(),

          // Downloads by file type
          DownloadDB.aggregate([
            {
              $group: {
                _id: "$fileType",
                count: { $sum: 1 },
                totalSize: { $sum: "$fileSize" },
              },
            },
            { $sort: { count: -1 } },
          ]),

          // Recent downloads (last 30 days)
          DownloadDB.aggregate([
            {
              $match: {
                createdAt: { $gte: thirtyDaysAgo },
              },
            },
            {
              $group: {
                _id: {
                  $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ]),

          // Top downloaders
          DownloadDB.aggregate([
            {
              $group: {
                _id: "$user",
                downloadCount: { $sum: 1 },
              },
            },
            { $sort: { downloadCount: -1 } },
            { $limit: 10 },
            {
              $lookup: {
                from: "users",
                localField: "_id",
                foreignField: "_id",
                as: "userInfo",
              },
            },
          ]),
        ]);

      res.json({
        data: {
          totalDownloads,
          downloadsByFile,
          recentDownloads,
          topDownloaders,
        },
      });
    } catch (err) {
      console.error("Get download stats error:", err);
      res.status(500).json({ message: "Failed to fetch download statistics" });
    }
  },
);

// ==================== ADMINS ====================

// Get all admins
router.get(
  "/admins-users",
  adminAuthenticate,
  hasPermission(["manage_settings"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", role } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      if (role) query.role = role;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const admins = await Admin.find(query)
        .select("-password -tokens -twoFactorSecret")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Admin.countDocuments(query);

      // Get online admins (active in last 15 minutes)
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const onlineAdmins = await Admin.countDocuments({
        lastLogin: { $gte: fifteenMinsAgo },
        isActive: true,
      });

      res.json({
        data: {
          admins,
          onlineAdmins,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (err) {
      console.error("Get admins error:", err);
      res.status(500).json({ message: "Failed to fetch admins" });
    }
  },
);

// ==================== PAYMENTS ====================

// Get all payments
router.get(
  "/payments",
  adminAuthenticate,
  hasPermission(["manage_orders"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, fromDate, toDate } = req.query;
      const query = {};

      if (status) query.status = status;
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const payments = await PaymentDB.find(query)
        .populate({
          path: "order",
          populate: {
            path: "user",
            select: "name email",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await PaymentDB.countDocuments(query);

      // Get payment statistics
      const stats = await PaymentDB.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]);

      res.json({
        data: {
          payments,
          stats,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (err) {
      console.error("Get payments error:", err);
      res.status(500).json({ message: "Failed to fetch payments" });
    }
  },
);

// ==================== INVOICES ====================

// Get all invoices
router.get(
  "/invoices",
  adminAuthenticate,
  hasPermission(["manage_orders"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, status, fromDate, toDate } = req.query;
      const query = {};

      if (status) query.status = status;
      if (fromDate || toDate) {
        query.createdAt = {};
        if (fromDate) query.createdAt.$gte = new Date(fromDate);
        if (toDate) query.createdAt.$lte = new Date(toDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const invoices = await InvoiceDB.find(query)
        .populate({
          path: "order",
          populate: {
            path: "user",
            select: "name email",
          },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await InvoiceDB.countDocuments(query);

      // Get invoice statistics
      const stats = await InvoiceDB.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            total: { $sum: "$amount" },
          },
        },
      ]);

      res.json({
        data: {
          invoices,
          stats,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (err) {
      console.error("Get invoices error:", err);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  },
);

// Generate invoice PDF (you'll need a PDF library)
router.get(
  "/invoices/:id/pdf",
  adminAuthenticate,
  hasPermission(["manage_orders"]),
  async (req, res) => {
    try {
      const invoice = await InvoiceDB.findById(req.params.id).populate({
        path: "order",
        populate: [
          { path: "user", select: "name email" },
          { path: "products.product" },
        ],
      });

      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Here you would generate PDF using a library like pdfkit
      // For now, return invoice data
      res.json({ data: invoice });
    } catch (err) {
      console.error("Generate invoice PDF error:", err);
      res.status(500).json({ message: "Failed to generate invoice PDF" });
    }
  },
);

// ==================== PROJECT CATEGORIES ====================

// Get all project categories
router.get("/project-categories", adminAuthenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = "", isActive } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
      ];
    }

    if (isActive !== undefined && isActive !== "") {
      query.isActive = isActive === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const categories = await ProjectCategoryDB.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectCategoryDB.countDocuments(query);

    // Get project counts per category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const projectCount = await ProjectDB.countDocuments({
          category: category._id,
          isPublished: true,
        });
        return {
          ...category.toObject(),
          projectCount,
        };
      }),
    );

    res.json({
      data: categoriesWithCounts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get project categories error:", err);
    res.status(500).json({ message: "Failed to fetch project categories" });
  }
});

// Get main settings (basic admin settings)
router.get("/main-settings", adminAuthenticate, async (req, res) => {
  try {
    // You can fetch from SiteSettings model or return defaults
    res.json({
      data: {
        appName: "ShivamStack",
        companyName: "ShivamStack Technologies",
        security: {
          isMaintenanceMode: false,
          enable2FA: true,
        },
      },
    });
  } catch (err) {
    console.error("Get main settings error:", err);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
});

// ==================== USERS ====================

// Get all users with details
router.get(
  "/users",
  adminAuthenticate,
  hasPermission(["manage_users"]),
  async (req, res) => {
    try {
      const { page = 1, limit = 50, search = "", status, role } = req.query;
      const query = {};

      if (search) {
        query.$or = [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      if (status === "active") query.isActive = true;
      if (status === "blocked") query.isBlocked = true;
      if (status === "inactive") query.isActive = false;
      if (role) query.role = role;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const users = await UserDB.find(query)
        .select("-password -tokens")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await UserDB.countDocuments(query);

      // Get online users (active in last 15 minutes)
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const onlineUsers = await UserDB.countDocuments({
        lastLogin: { $gte: fifteenMinsAgo },
        isActive: true,
      });

      res.json({
        data: {
          users,
          onlineUsers,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / parseInt(limit)),
          },
        },
      });
    } catch (err) {
      console.error("Get users error:", err);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  },
);

// Get single user details
router.get(
  "/users/:id",
  adminAuthenticate,
  hasPermission(["manage_users"]),
  async (req, res) => {
    try {
      const user = await UserDB.findById(req.params.id)
        .select("-password -tokens")
        .populate("likedBlogs", "title slug")
        .populate("likedProjects", "title slug");

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get user's downloads
      const downloads = await DownloadDB.find({ user: user._id })
        .sort({ createdAt: -1 })
        .limit(20);

      // Get user's orders
      const orders = await OrderDB.find({ user: user._id })
        .populate("products.product", "name slug price")
        .sort({ createdAt: -1 })
        .limit(20);

      // Get user's reviews
      const reviews = await ReviewDB.find({ user: user._id })
        .populate("product", "name slug")
        .sort({ createdAt: -1 });

      res.json({
        data: {
          user,
          downloads,
          orders,
          reviews,
          downloadCount: downloads.length,
          orderCount: orders.length,
          reviewCount: reviews.length,
        },
      });
    } catch (err) {
      console.error("Get user details error:", err);
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  },
);

// Block/Unblock user
router.patch(
  "/users/:id/toggle-block",
  adminAuthenticate,
  hasPermission(["manage_users"]),
  async (req, res) => {
    try {
      const { block, reason } = req.body;
      const user = await UserDB.findById(req.params.id);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      user.isBlocked = block;
      if (block && reason) user.blockedReason = reason;
      await user.save();

      await adminActivityService.trackActivity(
        req.admin._id,
        block ? "block_user" : "unblock_user",
        {
          resourceType: "User",
          resourceId: user._id,
          metadata: { userName: user.name, reason },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        },
      );

      res.json({
        message: block
          ? "User blocked successfully"
          : "User unblocked successfully",
        data: user,
      });
    } catch (err) {
      console.error("Toggle user block error:", err);
      res.status(500).json({ message: "Failed to update user status" });
    }
  },
);

// ============================================================
// CONTACT MESSAGES ADMIN ROUTES
// Add these routes to your existing adminRoutes.js file
// Base path: /api/admin/contact-messages
// ============================================================


// ── GET all messages (with search, filter, sort, pagination) ──────────────────
router.get(
  "/contact-messages",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search = "",
        status,
        category,
        sortField = "createdAt",
        sortOrder = "desc",
        urgent,
        followUp,
      } = req.query;

      const query = {};

      // Search
      if (search.trim()) {
        query.$or = [
          { "sender.name":  { $regex: search.trim(), $options: "i" } },
          { "sender.email": { $regex: search.trim(), $options: "i" } },
          { subject:        { $regex: search.trim(), $options: "i" } },
          { message:        { $regex: search.trim(), $options: "i" } },
          { messageId:      { $regex: search.trim(), $options: "i" } },
        ];
      }

      // Filters
      if (status && status !== "all") query.status = status;
      if (category && category !== "all") query.category = category;
      if (urgent === "true") query.isUrgent = true;
      if (followUp === "true") query.requiresFollowUp = true;

      // Sort — whitelist allowed fields
      const allowedSortFields = ["createdAt", "sender.name", "subject", "status", "category"];
      const safeSortField = allowedSortFields.includes(sortField) ? sortField : "createdAt";
      const safeSortOrder = sortOrder === "asc" ? 1 : -1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [messages, total, statusCounts] = await Promise.all([
        ContactMessageDB.find(query)
          .sort({ [safeSortField]: safeSortOrder })
          .skip(skip)
          .limit(parseInt(limit))
          .select("-userAgent") // optional: hide raw userAgent from list
          .lean(),

        ContactMessageDB.countDocuments(query),

        // Stats counts (always count across full collection, ignore filters)
        ContactMessageDB.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

      // Build stats object
      const stats = { unread: 0, read: 0, replied: 0, archived: 0, spam: 0 };
      statusCounts.forEach(({ _id, count }) => {
        if (stats.hasOwnProperty(_id)) stats[_id] = count;
      });

      res.json({
        data: messages,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        stats,
      });
    } catch (err) {
      console.error("Get contact messages error:", err);
      res.status(500).json({ message: "Failed to fetch contact messages" });
    }
  }
);

// ── PATCH mark single message as read ────────────────────────────────────────
router.patch("/contact-messages/:id/mark-read",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const msg = await ContactMessageDB.findById(req.params.id);
      if (!msg) return res.status(404).json({ message: "Message not found" });

      if (msg.status === "unread") {
        await msg.markAsRead();
      }

      res.json({ data: msg });
    } catch (err) {
      console.error("Mark read error:", err);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  }
);

// ── PATCH update single message status ───────────────────────────────────────
router.patch(
  "/contact-messages/:id/status",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { status } = req.body;
      const allowed = ["unread", "read", "replied", "archived", "spam"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const msg = await ContactMessageDB.findByIdAndUpdate(
        req.params.id,
        { status, ...(status === "read" && !msg?.readAt ? { readAt: new Date() } : {}) },
        { new: true }
      );
      if (!msg) return res.status(404).json({ message: "Message not found" });

      res.json({ data: msg });
    } catch (err) {
      console.error("Update status error:", err);
      res.status(500).json({ message: "Failed to update status" });
    }
  }
);

// ── PATCH toggle flag (isUrgent / requiresFollowUp) ──────────────────────────
router.patch(
  "/contact-messages/:id/toggle-flag",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { field } = req.body;
      if (!["isUrgent", "requiresFollowUp"].includes(field)) {
        return res.status(400).json({ message: "Invalid flag field" });
      }

      const msg = await ContactMessageDB.findById(req.params.id);
      if (!msg) return res.status(404).json({ message: "Message not found" });

      msg[field] = !msg[field];
      await msg.save();

      res.json({ data: msg });
    } catch (err) {
      console.error("Toggle flag error:", err);
      res.status(500).json({ message: "Failed to toggle flag" });
    }
  }
);

// ── POST reply to a message ───────────────────────────────────────────────────
router.post(
  "/contact-messages/:id/reply",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { response } = req.body;
      if (!response || !response.trim()) {
        return res.status(400).json({ message: "Reply text is required" });
      }

      const msg = await ContactMessageDB.findById(req.params.id);
      if (!msg) return res.status(404).json({ message: "Message not found" });

      // Mark as replied using schema method
      await msg.markAsReplied(response.trim(), req.admin._id);

      // Optional: Send email to user via your existing emailService
      // await sendEmail({
      //   to: msg.sender.email,
      //   subject: `Re: ${msg.subject}`,
      //   text: response.trim(),
      // });

      res.json({ data: msg });
    } catch (err) {
      console.error("Reply error:", err);
      res.status(500).json({ message: "Failed to send reply" });
    }
  }
);

// ── PATCH bulk status update ─────────────────────────────────────────────────
router.patch(
  "/contact-messages/bulk-status",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids, status } = req.body;
      const allowed = ["unread", "read", "replied", "archived", "spam"];

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }

      const updateData = { status };
      if (status === "read") updateData.readAt = new Date();

      const result = await ContactMessageDB.updateMany(
        { _id: { $in: ids } },
        { $set: updateData }
      );

      res.json({ message: `Updated ${result.modifiedCount} messages`, modifiedCount: result.modifiedCount });
    } catch (err) {
      console.error("Bulk status error:", err);
      res.status(500).json({ message: "Bulk update failed" });
    }
  }
);

// ── DELETE bulk delete ────────────────────────────────────────────────────────
router.delete(
  "/contact-messages/bulk",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }

      const result = await ContactMessageDB.deleteMany({ _id: { $in: ids } });
      res.json({ message: `Deleted ${result.deletedCount} messages`, deletedCount: result.deletedCount });
    } catch (err) {
      console.error("Bulk delete error:", err);
      res.status(500).json({ message: "Bulk delete failed" });
    }
  }
);

// ── DELETE single message ─────────────────────────────────────────────────────
router.delete(
  "/contact-messages/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const msg = await ContactMessageDB.findByIdAndDelete(req.params.id);
      if (!msg) return res.status(404).json({ message: "Message not found" });
      res.json({ message: "Message deleted successfully" });
    } catch (err) {
      console.error("Delete message error:", err);
      res.status(500).json({ message: "Failed to delete message" });
    }
  }
);

// ── GET single message by ID ──────────────────────────────────────────────────
router.get(
  "/contact-messages/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const msg = await ContactMessageDB.findById(req.params.id).lean();
      if (!msg) return res.status(404).json({ message: "Message not found" });
      res.json({ data: msg });
    } catch (err) {
      console.error("Get message error:", err);
      res.status(500).json({ message: "Failed to fetch message" });
    }
  }
);

// ============================================================
// NEWSLETTER SUBSCRIBERS ADMIN ROUTES
// Base path: /api/admin/newsletter/subscribers
// ============================================================

// ── GET all subscribers (with search, filter, sort, pagination) ─────────────
router.get(
  "/newsletter/subscribers",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search = "",
        status,
        sortField = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query = {};

      // Search
      if (search.trim()) {
        query.$or = [
          { email: { $regex: search.trim(), $options: "i" } },
          { name: { $regex: search.trim(), $options: "i" } },
        ];
      }

      // Status filter
      if (status && status !== "all") {
        query.isActive = status === "active";
      }

      // Sort — whitelist allowed fields
      const allowedSortFields = ["createdAt", "email", "name", "isActive"];
      const safeSortField = allowedSortFields.includes(sortField) ? sortField : "createdAt";
      const safeSortOrder = sortOrder === "asc" ? 1 : -1;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [subscribers, total, activeCount, inactiveCount] = await Promise.all([
        NewsletterSubscriberDB.find(query)
          .sort({ [safeSortField]: safeSortOrder })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),

        NewsletterSubscriberDB.countDocuments(query),

        NewsletterSubscriberDB.countDocuments({ isActive: true }),
        NewsletterSubscriberDB.countDocuments({ isActive: false }),
      ]);

      res.json({
        data: subscribers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        stats: {
          total,
          active: activeCount,
          inactive: inactiveCount,
        },
      });
    } catch (err) {
      console.error("Get subscribers error:", err);
      res.status(500).json({ message: "Failed to fetch subscribers" });
    }
  }
);

// ── PATCH toggle subscriber status ──────────────────────────────────────────
router.patch(
  "/newsletter/subscribers/:id/toggle-status",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const subscriber = await NewsletterSubscriberDB.findById(req.params.id);
      if (!subscriber) {
        return res.status(404).json({ message: "Subscriber not found" });
      }

      subscriber.isActive = !subscriber.isActive;
      await subscriber.save();

      res.json({ data: subscriber });
    } catch (err) {
      console.error("Toggle status error:", err);
      res.status(500).json({ message: "Failed to toggle status" });
    }
  }
);

// ── PATCH bulk status update ────────────────────────────────────────────────
router.patch(
  "/newsletter/subscribers/bulk-status",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids, isActive } = req.body;

      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }

      const result = await NewsletterSubscriberDB.updateMany(
        { _id: { $in: ids } },
        { $set: { isActive } }
      );

      res.json({
        message: `Updated ${result.modifiedCount} subscribers`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk status error:", err);
      res.status(500).json({ message: "Bulk update failed" });
    }
  }
);

// ── DELETE bulk delete subscribers ──────────────────────────────────────────
router.delete(
  "/newsletter/subscribers/bulk",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }

      const result = await NewsletterSubscriberDB.deleteMany({ _id: { $in: ids } });
      res.json({
        message: `Deleted ${result.deletedCount} subscribers`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete error:", err);
      res.status(500).json({ message: "Bulk delete failed" });
    }
  }
);

// ── DELETE single subscriber ────────────────────────────────────────────────
router.delete(
  "/newsletter/subscribers/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const subscriber = await NewsletterSubscriberDB.findByIdAndDelete(req.params.id);
      if (!subscriber) {
        return res.status(404).json({ message: "Subscriber not found" });
      }
      res.json({ message: "Subscriber deleted successfully" });
    } catch (err) {
      console.error("Delete subscriber error:", err);
      res.status(500).json({ message: "Failed to delete subscriber" });
    }
  }
);

// ── POST send newsletter to subscribers ─────────────────────────────────────
router.post(
  "/newsletter/subscribers/send-newsletter",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { subject, content, recipientIds } = req.body;

      if (!subject || !content) {
        return res.status(400).json({ message: "Subject and content are required" });
      }

      let recipients = [];
      if (recipientIds && recipientIds.length > 0) {
        // Send to specific subscribers
        recipients = await NewsletterSubscriberDB.find({
          _id: { $in: recipientIds },
          isActive: true,
        });
      } else {
        // Send to all active subscribers
        recipients = await NewsletterSubscriberDB.find({ isActive: true });
      }

      if (recipients.length === 0) {
        return res.status(400).json({ message: "No active subscribers found" });
      }

      // Send emails in batches to avoid overwhelming the server
      const batchSize = 10;
      let sentCount = 0;
      let failedCount = 0;

      for (let i = 0; i < recipients.length; i += batchSize) {
        const batch = recipients.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (subscriber) => {
            try {
              await sendEmail({
                to: subscriber.email,
                subject: subject,
                html: content,
                text: content.replace(/<[^>]*>/g, ""),
              });
              sentCount++;
            } catch (err) {
              console.error(`Failed to send to ${subscriber.email}:`, err);
              failedCount++;
            }
          })
        );
      }

      // Log admin activity
      await adminActivityService.logActivity(
        req.admin._id,
        "send_newsletter",
        `Sent newsletter to ${sentCount} subscribers (${failedCount} failed)`,
        req.ip,
        req.userAgent
      );

      res.json({
        message: `Newsletter sent to ${sentCount} subscribers`,
        sent: sentCount,
        failed: failedCount,
      });
    } catch (err) {
      console.error("Send newsletter error:", err);
      res.status(500).json({ message: "Failed to send newsletter" });
    }
  }
);

// ── GET subscriber statistics ───────────────────────────────────────────────
router.get(
  "/newsletter/subscribers/stats",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const [total, active, inactive, lastWeek] = await Promise.all([
        NewsletterSubscriberDB.countDocuments(),
        NewsletterSubscriberDB.countDocuments({ isActive: true }),
        NewsletterSubscriberDB.countDocuments({ isActive: false }),
        NewsletterSubscriberDB.countDocuments({
          subscribedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        }),
      ]);

      res.json({
        total,
        active,
        inactive,
        newThisWeek: lastWeek,
      });
    } catch (err) {
      console.error("Get stats error:", err);
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  }
);


// ============================================================
// BOOK A CALL ADMIN ROUTES
// Base path: /api/admin/book-calls
// ============================================================

// ── GET all bookings (with search, filter, sort, pagination) ─────────────
router.get(
  "/book-calls",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const {
        page = 1,
        limit = 20,
        search = "",
        status,
        conversionStatus,
        platform,
        sortField = "createdAt",
        sortOrder = "desc",
      } = req.query;

      const query = {};

      // Search
      if (search.trim()) {
        query.$or = [
          { "clientDetails.name": { $regex: search.trim(), $options: "i" } },
          { "clientDetails.email": { $regex: search.trim(), $options: "i" } },
          { bookingId: { $regex: search.trim(), $options: "i" } },
          { "selectedService.name": { $regex: search.trim(), $options: "i" } },
        ];
      }

      // Filters
      if (status && status !== "all") query.status = status;
      if (conversionStatus && conversionStatus !== "all") query.conversionStatus = conversionStatus;
      if (platform && platform !== "all") query.preferredPlatform = platform;

      // Sort — whitelist allowed fields
      const allowedSortFields = ["createdAt", "selectedDate.date", "clientDetails.name", "status", "conversionStatus", "leadScore"];
      let safeSortField = allowedSortFields.includes(sortField) ? sortField : "createdAt";
      
      // Handle nested field sorting
      let sortObject = {};
      if (safeSortField === "selectedDate.date") {
        sortObject = { "selectedDate.date": sortOrder === "asc" ? 1 : -1 };
      } else if (safeSortField === "clientDetails.name") {
        sortObject = { "clientDetails.name": sortOrder === "asc" ? 1 : -1 };
      } else {
        sortObject = { [safeSortField]: sortOrder === "asc" ? 1 : -1 };
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const [bookings, total, statusCounts] = await Promise.all([
        BookCallDB.find(query)
          .sort(sortObject)
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),

        BookCallDB.countDocuments(query),

        // Status counts
        BookCallDB.aggregate([
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]),
      ]);

      // Build stats object
      const stats = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, rescheduled: 0 };
      statusCounts.forEach(({ _id, count }) => {
        if (stats.hasOwnProperty(_id)) stats[_id] = count;
      });
      stats.total = total;

      res.json({
        data: bookings,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        stats,
      });
    } catch (err) {
      console.error("Get bookings error:", err);
      res.status(500).json({ message: "Failed to fetch bookings" });
    }
  }
);

// ── GET single booking by ID ────────────────────────────────────────────────
router.get(
  "/book-calls/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const booking = await BookCallDB.findById(req.params.id).lean();
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      res.json({ data: booking });
    } catch (err) {
      console.error("Get booking error:", err);
      res.status(500).json({ message: "Failed to fetch booking" });
    }
  }
);

// ── PUT update booking status and details ───────────────────────────────────
router.put(
  "/book-calls/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { status, conversionStatus, meetingLink, callNotes, leadScore } = req.body;
      
      const updateData = {};
      if (status) updateData.status = status;
      if (conversionStatus) updateData.conversionStatus = conversionStatus;
      if (meetingLink !== undefined) updateData.meetingLink = meetingLink;
      if (callNotes !== undefined) updateData.callNotes = callNotes;
      if (leadScore !== undefined) updateData.leadScore = leadScore;
      
      // Add timestamps based on status changes
      if (status === "confirmed" && !updateData.confirmedAt) updateData.confirmedAt = new Date();
      if (status === "completed" && !updateData.completedAt) updateData.completedAt = new Date();
      if (status === "cancelled" && !updateData.cancelledAt) updateData.cancelledAt = new Date();
      
      const booking = await BookCallDB.findByIdAndUpdate(
        req.params.id,
        { $set: updateData },
        { new: true, runValidators: true }
      );
      
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      
      // Log admin activity
      await adminActivityService.logActivity(
        req.admin._id,
        "update_booking",
        `Updated booking ${booking.bookingId}`,
        req.ip,
        req.userAgent
      );
      
      res.json({ data: booking });
    } catch (err) {
      console.error("Update booking error:", err);
      res.status(500).json({ message: "Failed to update booking" });
    }
  }
);

// ── PATCH bulk status update ────────────────────────────────────────────────
router.patch(
  "/book-calls/bulk-status",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids, status } = req.body;
      const allowed = ["pending", "confirmed", "completed", "cancelled", "rescheduled"];
      
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      
      const updateData = { status };
      if (status === "confirmed") updateData.confirmedAt = new Date();
      if (status === "completed") updateData.completedAt = new Date();
      if (status === "cancelled") updateData.cancelledAt = new Date();
      
      const result = await BookCallDB.updateMany(
        { _id: { $in: ids } },
        { $set: updateData }
      );
      
      res.json({ 
        message: `Updated ${result.modifiedCount} bookings`, 
        modifiedCount: result.modifiedCount 
      });
    } catch (err) {
      console.error("Bulk status error:", err);
      res.status(500).json({ message: "Bulk update failed" });
    }
  }
);

// ── DELETE bulk delete bookings ─────────────────────────────────────────────
router.delete(
  "/book-calls/bulk",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No IDs provided" });
      }
      
      const result = await BookCallDB.deleteMany({ _id: { $in: ids } });
      res.json({ 
        message: `Deleted ${result.deletedCount} bookings`, 
        deletedCount: result.deletedCount 
      });
    } catch (err) {
      console.error("Bulk delete error:", err);
      res.status(500).json({ message: "Bulk delete failed" });
    }
  }
);

// ── DELETE single booking ───────────────────────────────────────────────────
router.delete(
  "/book-calls/:id",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const booking = await BookCallDB.findByIdAndDelete(req.params.id);
      if (!booking) {
        return res.status(404).json({ message: "Booking not found" });
      }
      res.json({ message: "Booking deleted successfully" });
    } catch (err) {
      console.error("Delete booking error:", err);
      res.status(500).json({ message: "Failed to delete booking" });
    }
  }
);

// ── GET booking statistics ──────────────────────────────────────────────────
router.get(
  "/book-calls/stats/overview",
  adminAuthenticate,
  hasPermission(["view_analytics"]),
  async (req, res) => {
    try {
      const [total, pending, confirmed, completed, cancelled, todayBookings, thisWeek] = await Promise.all([
        BookCallDB.countDocuments(),
        BookCallDB.countDocuments({ status: "pending" }),
        BookCallDB.countDocuments({ status: "confirmed" }),
        BookCallDB.countDocuments({ status: "completed" }),
        BookCallDB.countDocuments({ status: "cancelled" }),
        BookCallDB.countDocuments({
          "selectedDate.date": {
            $gte: new Date().setHours(0, 0, 0, 0),
            $lte: new Date().setHours(23, 59, 59, 999)
          }
        }),
        BookCallDB.countDocuments({
          createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        }),
      ]);
      
      res.json({
        total,
        pending,
        confirmed,
        completed,
        cancelled,
        todayBookings,
        newThisWeek: thisWeek,
        conversionRate: total > 0 ? ((completed / total) * 100).toFixed(1) : 0,
      });
    } catch (err) {
      console.error("Get stats error:", err);
      res.status(500).json({ message: "Failed to fetch statistics" });
    }
  }
);

module.exports = router;
