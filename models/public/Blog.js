const mongoose = require('mongoose');

const CommentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_User`,
    required: true
  },
  comment: {
    type: String,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const BlogSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    content: { type: String, required: true },
    author: { type: String },
    category: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_BlogCategory` },
    tags: [String],
    featuredImage: String,
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
        views: { type: Number, default: 0 }, // Add this if missing
    likes: [{  // ADD THIS - it's missing!
        type: mongoose.Schema.Types.ObjectId,
        ref: `${process.env.APP_NAME}_User`
    }],
    comments: [CommentSchema] // Add this line - it was missing!

}, { timestamps: true });

module.exports = mongoose.model(`${process.env.APP_NAME}_Blog`, BlogSchema);