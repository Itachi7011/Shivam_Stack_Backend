// models/admin/Admin.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const AdminSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 10,
      select: false,
    },

    role: {
      type: String,
      enum: ["admin", "superadmin"],
      default: "admin",
    },

    permissions: [
      {
        type: String,
        enum: [
          "manage_products",
          "manage_orders",
          "manage_users",
          "manage_blog",
          "manage_projects",
          "manage_coupons",
          "view_analytics",
          "manage_settings",
        ],
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: Date,

    lastLogin: Date,

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    tokens: [{
      token: {
        type: String,
        required: true
      },
      type: {
        type: String,
        enum: ['access', 'refresh'],
        required: true
      },
      expiresAt: {
        type: Date,
        required: true
      },
      isRevoked: {
        type: Boolean,
        default: false
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],

    twoFactorSecret: String,

    resetPasswordToken: String,
    resetPasswordExpires: Date,
  },
  { timestamps: true },
);

/* ========================
   INDEXES
======================== */
// AdminSchema.index({ email: 1 });
AdminSchema.index({ role: 1 });

/* ========================
   VIRTUAL
======================== */
AdminSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

/* ========================
   HASH PASSWORD - FIXED VERSION
======================== */
AdminSchema.pre("save", async function () {
  // Only hash the password if it's modified (or new)
  if (!this.isModified("password")) return;

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    throw new Error("Password hashing failed");
  }
  // No next() needed - just return
});

/* ========================
   METHODS
======================== */

AdminSchema.methods.comparePassword = async function (candidatePassword) {
  // Get the stored hash
  const storedHash = this.password;

  try {
    // Ensure we have a password to compare
    if (!candidatePassword || !storedHash) {
      console.log("  ❌ Missing password or hash");
      return false;
    }

    const result = await bcrypt.compare(candidatePassword, storedHash);
    console.log("  ✅ Comparison result:", result);
    return result;
  } catch (error) {
    console.error("  ❌ bcrypt compare error:", error);
    return false;
  }
};

AdminSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  return token;
};

AdminSchema.methods.incrementLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

  // Reset lock if it's expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts = (this.loginAttempts || 0) + 1;

    if (this.loginAttempts >= MAX_ATTEMPTS) {
      this.lockUntil = Date.now() + LOCK_TIME;
    }
  }

  await this.save();
  return this;
};

AdminSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  await this.save();
  return this;
};

module.exports = mongoose.model(`${process.env.APP_NAME}_Admin`, AdminSchema);
