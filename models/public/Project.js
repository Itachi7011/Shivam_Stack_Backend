const mongoose = require("mongoose");

const ProjectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: { type: String },
    client: { type: String },

    // Dates & Status
    startDate: Date,
    endDate: Date,
    status: {
      type: String,
      enum: ["planned", "in-progress", "completed"],
      default: "planned",
    },

    // Media
    images: [String],

    // Project category
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `${process.env.APP_NAME}_ProjectCategory`,
    },

    // Optional useful links
    demoUrl: { type: String },
    repoUrl: { type: String },
    clientUrl: { type: String },

    // Tags & Technologies
    tags: [{ type: String, trim: true }],
    technologies: [{ type: String, trim: true }],

    // Featured / Priority
    isFeatured: { type: Boolean, default: false },
    priority: { type: Number, default: 0 }, // Lower = higher display priority

    // Stats
    views: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },

    // SEO
    metaTitle: { type: String },
    metaDescription: { type: String },
    metaKeywords: [{ type: String }],

    // Visibility
    isPublished: { type: Boolean, default: true },
    requiresLogin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Optional: text index for search
ProjectSchema.index({
  title: "text",
  description: "text",
  tags: "text",
  technologies: "text",
});

module.exports = mongoose.model(
  `${process.env.APP_NAME}_Project`,
  ProjectSchema,
);
