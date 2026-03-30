// models/CaseStudy.js
// ─────────────────────────────────────────────────────────────
// Shivam Web Stack — CaseStudy Model
// ─────────────────────────────────────────────────────────────
const mongoose = require("mongoose");

const CaseStudyCommentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_User`,
    required: true,
  },
  comment: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const CaseStudySchema = new mongoose.Schema(
  {
    // ── Core Identity ────────────────────────────────────────
    title:    { type: String, required: true, trim: true },
    slug:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    tagline:  { type: String, trim: true },             // One-line hero description
    description: { type: String },

    // ── Narrative Sections ───────────────────────────────────
    challenge:       { type: String },   // The problem being solved
    solution:        { type: String },   // How it was solved
    outcome:         { type: String },   // Measurable results / impact
    lessonsLearned:  { type: String },   // Honest post-mortem

    // ── Client / Context ─────────────────────────────────────
    client: { type: String },            // "Personal Project" or client name

    // ── Dates & Status ───────────────────────────────────────
    startDate: { type: Date },
    endDate:   { type: Date },
    status: {
      type: String,
      enum: ["planned", "in-progress", "completed"],
      default: "planned",
    },

    // ── Media ────────────────────────────────────────────────
    mainImage: { type: String },         // Cover image URL (any resolution)
    images:    [{ type: String }],       // Screenshot URLs (any resolution)

    // ── Links ────────────────────────────────────────────────
    demoUrl:   { type: String },
    repoUrl:   { type: String },
    clientUrl: { type: String },

    // ── Tags & Technologies ──────────────────────────────────
    tags:         [{ type: String, trim: true }],
    technologies: [{ type: String, trim: true }],

    // ── Related Project (optional reference) ─────────────────
    relatedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: `${process.env.APP_NAME}_Project`,
    },

    // ── Featured / Priority ──────────────────────────────────
    isFeatured: { type: Boolean, default: false },
    priority:   { type: Number, default: 0 },    // Lower = higher display order

    // ── Stats ────────────────────────────────────────────────
    views:  { type: Number, default: 0 },
    shares: { type: Number, default: 0 },

    // ── Engagement ───────────────────────────────────────────
    caseStudyLikes: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: `${process.env.APP_NAME}_User`,
    }],
    caseStudyComments: [CaseStudyCommentSchema],

    // ── SEO ──────────────────────────────────────────────────
    metaTitle:       { type: String },
    metaDescription: { type: String },
    metaKeywords:    [{ type: String }],

    // ── Visibility ───────────────────────────────────────────
    isPublished:  { type: Boolean, default: true },
    requiresLogin:{ type: Boolean, default: false },
  },
  { timestamps: true }
);

// Full-text search index
CaseStudySchema.index({
  title:         "text",
  tagline:       "text",
  description:   "text",
  challenge:     "text",
  solution:      "text",
  outcome:       "text",
  lessonsLearned:"text",
  tags:          "text",
  technologies:  "text",
});



// Auto-sort by priority
CaseStudySchema.index({ priority: 1, createdAt: -1 });

module.exports = mongoose.model(
  `${process.env.APP_NAME}_CaseStudy`,
  CaseStudySchema
);