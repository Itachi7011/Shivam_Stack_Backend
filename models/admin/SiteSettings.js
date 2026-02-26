const mongoose = require("mongoose");

const EmailSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["support", "billing", "legal", "sales", "technical", "marketing"],
      required: true,
    },
    address: { type: String, required: true },
    description: String,
  },
  { _id: false },
);

const PhoneSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["support", "billing", "sales", "technical", "emergency"],
      required: true,
    },
    number: { type: String, required: true },
    countryCode: String,
    description: String,
  },
  { _id: false },
);

const SocialLinkSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      enum: [
        "twitter",
        "linkedin",
        "facebook",
        "github",
        "youtube",
        "instagram",
      ],
      required: true,
    },
    url: { type: String, required: true },
  },
  { _id: false },
);

const BusinessHoursSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
      required: true,
    },
    open: String,
    close: String,
    isClosed: { type: Boolean, default: false },
  },
  { _id: false },
);

const FeatureFlagsSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    enabled: { type: Boolean, default: false },
    description: String,
  },
  { _id: false },
);

const SiteSettingsSchema = new mongoose.Schema(
  {
    appName: { type: String, default: "MyApp" },
    companyName: { type: String, required: true },
    companyLegalName: String,
    companyAddress: String,
    officialEmails: [EmailSchema],
    contactNumbers: [PhoneSchema],
    socialLinks: [SocialLinkSchema],
    businessHours: [BusinessHoursSchema],
    featureFlags: [FeatureFlagsSchema],
    websiteUrl: String,
    dashboardUrl: String,
    apiBaseUrl: String,
    branding: {
      logoUrl: String,
      faviconUrl: String,
      darkModeLogoUrl: String,
      defaultLanguage: { type: String, default: "en" },
    },
    security: {
      isMaintenanceMode: { type: Boolean, default: false },
      maintenanceMessage: String,
      allowedIPs: [String],
      blockedIPs: [String],
      enable2FA: { type: Boolean, default: true },
      sessionTimeout: { type: Number, default: 24 },
      maxLoginAttempts: { type: Number, default: 5 },
    },
    compliance: {
      gdprCompliant: { type: Boolean, default: true },
      dataRetentionPolicy: {
        type: String,
        default: "User data is retained only as long as necessary.",
      },
      cookieConsent: {
        enabled: { type: Boolean, default: true },
        bannerText: String,
      },
    },
    analytics: {
      googleAnalyticsId: String,
      enableTelemetry: { type: Boolean, default: true },
    },
    integrations: {
      stripe: {
        enabled: { type: Boolean, default: false },
        publicKey: String,
        secretKey: String,
        webhookSecret: String, // ← NEW
        currency: { type: String, default: "usd" }, // ← NEW
      },
      sendgrid: {
        enabled: { type: Boolean, default: false },
        apiKey: String,
        fromEmail: String,
        fromName: String, // ← NEW
        replyTo: String, // ← NEW
      },
      razorpay: {
        // ← ENTIRE BLOCK NEW
        enabled: { type: Boolean, default: false },
        keyId: String,
        keySecret: String,
        webhookSecret: String,
      },
    },

    backup: {
      autoBackup: { type: Boolean, default: true },
      backupFrequency: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "daily",
      },
      retentionDays: { type: Number, default: 30 },
      storageUrl: String, // ← NEW
      notificationEmail: String, // ← NEW
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `${process.env.APP_NAME}_Admin`,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `${process.env.APP_NAME}_Admin`,
    },
  },
  { timestamps: true },
);

/** Singleton pattern: only one settings document allowed */
SiteSettingsSchema.pre("save", async function (next) {
  if (this.isNew) {
    const count = await mongoose
      .model(`${process.env.APP_NAME}_SiteSettings`)
      .countDocuments();
    if (count > 0) {
      return next(new Error("Only one SiteSettings document is allowed."));
    }
  }
  next();
});

/** Helper method to get the singleton */
SiteSettingsSchema.statics.getSingleton = async function () {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({ companyName: "Your Company Name" });
  }
  return settings;
};

module.exports = mongoose.model(
  `${process.env.APP_NAME}_SiteSettings`,
  SiteSettingsSchema,
);
