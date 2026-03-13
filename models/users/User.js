// models/users/User.js

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const CommentSchema = require("./Comment")


const UserSchema = new mongoose.Schema(
  {
    // Basic Identity
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
      minlength: 8,
      select: false,
    },

    avatar: {
      url: String,
      publicId: String,
    },

    phone: {
      type: String,
      sparse: true,
    },

    // Role Based Access
    role: {
      type: String,
      enum: ["user", "admin", "superadmin"],
      default: "user",
    },

    // Account Status
    isActive: {
      type: Boolean,
      default: true,
    },

    isBlocked: {
      type: Boolean,
      default: false,
    },

    blockedReason: String,

    // Email Verification
    emailVerified: {
      type: Boolean,
      default: false,
    },

    verificationToken: String,
    verificationTokenExpires: Date,

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpires: Date,

    // Security
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: Date,

    lastLogin: Date,

    // Preferences
    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark"],
        default: "light",
      },
      newsletter: {
        type: Boolean,
        default: false,
      },
    },

    // Social Login (Future Ready)
    socialLogins: {
      google: { id: String },
      github: { id: String },
    },

    likedBlogs: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Blog",
      },
    ],

    likedProjects: [
  {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_Project`,
  },
],

projectComments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: `${process.env.APP_NAME}_Project`,
      }
    ],
      comments: [CommentSchema],  // Add this if missing

    // Token management
    tokens: [
      {
        token: String,
        type: {
          type: String,
          enum: ["access", "refresh"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: Date,
        isRevoked: {
          type: Boolean,
          default: false,
        },
      },
    ],
  },
  { timestamps: true },
);

/* ==============================
   INDEXES
================================ */
// UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ createdAt: -1 });

/* ==============================
   VIRTUALS
================================ */
UserSchema.virtual("isLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

/* ==============================
   PRE SAVE - HASH PASSWORD
================================ */
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return ;

  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  // next();
});

/* ==============================
   METHODS
================================ */

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
UserSchema.methods.generateEmailVerificationToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.verificationToken = token;
  this.verificationTokenExpires = Date.now() + 3600000; // 1 hour
  return token;
};

// Generate password reset token
UserSchema.methods.generatePasswordResetToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.resetPasswordToken = token;
  this.resetPasswordExpires = Date.now() + 3600000; // 1 hour
  return token;
};

// Handle login attempts
UserSchema.methods.incrementLoginAttempts = async function () {
  const MAX_ATTEMPTS = 5;
  const LOCK_TIME = 2 * 60 * 60 * 1000; // 2 hours

  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts += 1;
    if (this.loginAttempts >= MAX_ATTEMPTS) {
      this.lockUntil = Date.now() + LOCK_TIME;
    }
  }

  await this.save();
};

// Reset login attempts
UserSchema.methods.resetLoginAttempts = async function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  return this;
};

// Safe public data
UserSchema.methods.getPublicProfile = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    avatar: this.avatar,
    emailVerified: this.emailVerified,
    preferences: this.preferences,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model(`${process.env.APP_NAME}_User`, UserSchema);
