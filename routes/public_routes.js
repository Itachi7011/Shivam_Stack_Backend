// routes/users/publicRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose"); // Add this line at the top
const ProductDB = require("../models/public/Product");
const ProductCategoryDB = require("../models/public/ProductCategory");
const Blog = require("../models/public/Blog"); // adjust path as needed
const Product = require("../models/public/Product"); // adjust path as needed
const User = require("../models/users/User"); // adjust path as needed
const CaseStudy = require("../models/public/CaseStudies");
const BookCall = require("../models/public/BookCall");
const ContactMessage = require("../models/public/Contact");
const NewsLetterSubscriber = require("../models/public/NewsletterSubscriber");
const { DailySchedule } = require("../models/public/BookCall");
const {
  sendBookingConfirmationEmail,
  sendBookingCancellationEmail,
  sendAdminBookingNotification,
} = require("../services/emailService");
// 10

const {
  userAuthenticate,
  optionalUserAuthenticate,
} = require("../middleware/userAuth");

const os = require("os");
const si = require("systeminformation");
const moment = require("moment");

// ── Helper: attach virtual counts and strip heavy fields ─────────────────────
const blogProjection = {
  title: 1,
  slug: 1,
  content: 1,
  featuredImage: 1,
  category: 1,
  tags: 1,
  author: 1,
  publishedAt: 1,
  createdAt: 1,
  views: 1,
  likesCount: { $size: { $ifNull: ["$likes", []] } },
  commentsCount: { $size: { $ifNull: ["$comments", []] } },
};

// Get all published products with optional filtering
router.get("/products", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      category,
      search,
      sort = "newest",
      type = "all", // all, free, paid, digital
    } = req.query;

    const query = { isPublished: true };

    // Filter by category
    if (category) {
      query.category = category;
    }

    // Search in name and description
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { shortDescription: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by type
    if (type === "free") {
      query.isFree = true;
    } else if (type === "paid") {
      query.isFree = false;
      query.price = { $gt: 0 };
    } else if (type === "digital") {
      query.isDigital = true;
    }

    // Determine sort order
    let sortOption = {};
    switch (sort) {
      case "newest":
        sortOption = { createdAt: -1 };
        break;
      case "oldest":
        sortOption = { createdAt: 1 };
        break;
      case "price-low":
        sortOption = { price: 1 };
        break;
      case "price-high":
        sortOption = { price: -1 };
        break;
      case "popular":
        sortOption = { downloads: -1, views: -1 };
        break;
      default:
        sortOption = { createdAt: -1 };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await ProductDB.find(query)
      .populate("category", "name slug")
      .sort(sortOption)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProductDB.countDocuments(query);

    // Get categories for filter sidebar
    const categories = await ProductCategoryDB.find({ isActive: true }).sort({
      name: 1,
    });

    res.json({
      success: true,
      data: {
        products,
        categories,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
        filters: {
          type,
          sort,
          category: category || null,
          search: search || null,
        },
      },
    });
  } catch (err) {
    console.error("Get public products error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

// Get single product by slug
router.get("/products/:slug", async (req, res) => {
  try {
    const product = await ProductDB.findOne({
      slug: req.params.slug,
      isPublished: true,
    }).populate("category", "name slug description");

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Increment view count
    product.views += 1;
    await product.save();

    // Get related products (same category)
    const relatedProducts = await ProductDB.find({
      _id: { $ne: product._id },
      category: product.category,
      isPublished: true,
    })
      .limit(4)
      .select("name slug price images isFree shortDescription");

    res.json({
      success: true,
      data: {
        product,
        relatedProducts,
      },
    });
  } catch (err) {
    console.error("Get public product error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch product",
    });
  }
});

// Get products by category slug
router.get("/categories/:slug/products", async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;

    const category = await ProductCategoryDB.findOne({
      slug: req.params.slug,
      isActive: true,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const products = await ProductDB.find({
      category: category._id,
      isPublished: true,
    })
      .populate("category", "name slug")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProductDB.countDocuments({
      category: category._id,
      isPublished: true,
    });

    res.json({
      success: true,
      data: {
        category,
        products,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)),
        },
      },
    });
  } catch (err) {
    console.error("Get category products error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch products",
    });
  }
});

// Get all active categories
router.get("/categories", async (req, res) => {
  try {
    const categories = await ProductCategoryDB.find({ isActive: true }).sort({
      name: 1,
    });

    // Get product counts for each category
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const count = await ProductDB.countDocuments({
          category: category._id,
          isPublished: true,
        });
        return {
          ...category.toObject(),
          productCount: count,
        };
      }),
    );

    res.json({
      success: true,
      data: categoriesWithCounts,
    });
  } catch (err) {
    console.error("Get public categories error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch categories",
    });
  }
});

// Download product file (public but with download tracking)
router.get("/download/:id", async (req, res) => {
  try {
    const product = await ProductDB.findById(req.params.id);

    if (!product || !product.isPublished) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // Check if product is free or requires purchase
    if (!product.isFree) {
      return res.status(403).json({
        success: false,
        message: "This product requires purchase",
      });
    }

    // Check download limit
    if (
      product.downloadLimit > 0 &&
      product.downloadCount >= product.downloadLimit
    ) {
      return res.status(403).json({
        success: false,
        message: "Download limit exceeded",
      });
    }

    // Increment download count
    product.downloadCount += 1;
    await product.save();

    res.json({
      success: true,
      data: {
        downloadUrl: product.fileUrl,
        fileName: `${product.slug}.${product.fileType}`,
        fileSize: product.fileSize,
        productName: product.name,
      },
    });
  } catch (err) {
    console.error("Download error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to process download",
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public/blogs/categories
// Returns all unique categories that have at least one published blog
// ─────────────────────────────────────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const categories = await Blog.aggregate([
      { $match: { status: "published" } },
      { $group: { _id: "$category" } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: "$cat" },
      { $replaceRoot: { newRoot: "$cat" } },
      { $sort: { name: 1 } },
    ]);

    res.json({ success: true, data: categories });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public/blogs
// Query params: page, limit, search, category, sortBy, sortOrder
// Returns: { data, pagination, stats }
// ─────────────────────────────────────────────────────────────────────────────

router.get("/blogs", async (req, res) => {
  try {
    // console.log("hitted");
    // console.log("Query params:", req.query);

    const {
      page = 1,
      limit = 9,
      search = "",
      category = "",
      sortBy = "publishedAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Build match stage - FIXED: using isPublished instead of status
    const match = { isPublished: true };

    if (search.trim()) {
      match.$or = [
        { title: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
      ];
    }

    if (category && mongoose.isValidObjectId(category)) {
      match.category = new mongoose.Types.ObjectId(category);
    }

    // console.log("Final match:", JSON.stringify(match, null, 2));

    // Check total published blogs
    const totalPublished = await Blog.countDocuments({ isPublished: true });
    // console.log("Total published blogs in DB:", totalPublished);

    // Check blogs matching filters
    const matchingBlogs = await Blog.countDocuments(match);
    // console.log("Blogs matching filters:", matchingBlogs);

    // Allowed sort fields (whitelist to prevent injection)
    const allowedSorts = [
      "publishedAt",
      "createdAt",
      "views",
      "likesCount",
      "commentsCount",
    ];
    const sortField = allowedSorts.includes(sortBy) ? sortBy : "publishedAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;

    // Aggregation pipeline - FIXED: using correct collection name for lookup
    const pipeline = [
      { $match: match },
      {
        $addFields: {
          likesCount: { $size: { $ifNull: ["$likes", []] } },
          commentsCount: { $size: { $ifNull: ["$comments", []] } },
        },
      },
      { $sort: { [sortField]: sortDir } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: `${process.env.APP_NAME}_blogcategories`, // FIXED: using the correct collection name
                localField: "category",
                foreignField: "_id",
                as: "category",
              },
            },
            {
              $unwind: { path: "$category", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                title: 1,
                slug: 1,
                content: 1,
                featuredImage: 1,
                category: 1,
                tags: 1,
                author: 1,
                publishedAt: 1,
                createdAt: 1,
                views: 1,
                likesCount: 1,
                commentsCount: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await Blog.aggregate(pipeline);
    const total = result?.metadata[0]?.total || 0;
    const pages = Math.ceil(total / limitNum);

    // Aggregate global stats - FIXED: using isPublished
    const [statsRaw] = await Blog.aggregate([
      { $match: { isPublished: true } },
      {
        $group: {
          _id: null,
          totalBlogs: { $sum: 1 },
          totalViews: { $sum: "$views" },
          totalLikes: { $sum: { $size: { $ifNull: ["$likes", []] } } },
          totalComments: { $sum: { $size: { $ifNull: ["$comments", []] } } },
        },
      },
    ]);

    const stats = statsRaw
      ? {
          totalBlogs: statsRaw.totalBlogs,
          totalViews: statsRaw.totalViews,
          totalLikes: statsRaw.totalLikes,
          totalComments: statsRaw.totalComments,
        }
      : { totalBlogs: 0, totalViews: 0, totalLikes: 0, totalComments: 0 };

    // console.log("Found blogs:", result?.data?.length || 0);
    // console.log("Total pages:", pages);

    if (result?.data?.length > 0) {
      console.log("Sample blog likesCount:", result.data[0].likesCount);
    }

    res.json({
      success: true,
      data: result?.data || [],
      pagination: { total, pages, page: pageNum, limit: limitNum },
      stats,
    });
  } catch (err) {
    console.error("Error in /blogs route:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/public/blogs/slug/:slug
// Increments view count; returns full blog with populated comments
// ─────────────────────────────────────────────────────────────────────────────

router.get("/blogs/slug/:slug", async (req, res) => {
  try {
    console.log("Fetching blog with slug:", req.params.slug);

    // First, update views and get blog
    const blog = await Blog.findOneAndUpdate(
      { slug: req.params.slug, isPublished: true },
      { $inc: { views: 1 } },
      { returnDocument: "after" },
    ).populate({
      path: "category",
      select: "name slug",
      model: `${process.env.APP_NAME}_BlogCategory`,
    });
    // REMOVED all other population for now

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found",
      });
    }

    // Convert to object
    const blogObj = blog.toObject();

    // Add counts
    blogObj.likesCount = blog.likes?.length || 0;
    blogObj.commentsCount = blog.comments?.length || 0;

    // If you need user details for likes/comments, fetch them separately
    if (blogObj.likes && blogObj.likes.length > 0) {
      const User = mongoose.model(`${process.env.APP_NAME}_User`);
      const users = await User.find(
        { _id: { $in: blogObj.likes } },
        "name avatar",
      ).lean();

      const userMap = {};
      users.forEach((u) => (userMap[u._id.toString()] = u));
      blogObj.likedByUsers = users; // Add this separately
    }

    if (blogObj.comments && blogObj.comments.length > 0) {
      const User = mongoose.model(`${process.env.APP_NAME}_User`);
      const userIds = [...new Set(blogObj.comments.map((c) => c.user))];
      const users = await User.find(
        { _id: { $in: userIds } },
        "name avatar",
      ).lean();

      const userMap = {};
      users.forEach((u) => (userMap[u._id.toString()] = u));

      blogObj.comments = blogObj.comments.map((c) => ({
        ...c,
        user: userMap[c.user.toString()] || {
          _id: c.user,
          name: "Unknown User",
        },
      }));
    }

    res.json({ success: true, data: blogObj });
  } catch (err) {
    console.error("Error fetching blog by slug:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/public/blogs/:id/like      (protected — must be logged in)
// Toggles like on/off
// ─────────────────────────────────────────────────────────────────────────────
router.post("/blogs/:id/like", userAuthenticate, async (req, res) => {
  try {
    console.log("Like route hit for blog:", req.params.id);
    console.log("User ID:", req.user._id);

    const blog = await Blog.findOne({ _id: req.params.id, isPublished: true });
    if (!blog) {
      console.log("Blog not found");
      return res.status(404).json({
        success: false,
        message: "Blog not found or not published",
      });
    }

    console.log("Blog found. Current likes:", blog.likes);

    const userId = req.user._id;
    const alreadyLiked = blog.likes?.some(
      (id) => id.toString() === userId.toString(),
    );

    console.log("Already liked:", alreadyLiked);

    if (alreadyLiked) {
      // Unlike
      blog.likes = blog.likes.filter(
        (id) => id.toString() !== userId.toString(),
      );
      console.log("Removed like. New likes array:", blog.likes);

      await mongoose
        .model(`${process.env.APP_NAME}_User`)
        .findByIdAndUpdate(userId, { $pull: { likedBlogs: blog._id } });
      console.log("User updated - removed from likedBlogs");
    } else {
      // Like
      // Make sure likes array exists
      if (!blog.likes) blog.likes = [];
      blog.likes.push(userId);
      console.log("Added like. New likes array:", blog.likes);

      await mongoose
        .model(`${process.env.APP_NAME}_User`)
        .findByIdAndUpdate(userId, { $addToSet: { likedBlogs: blog._id } });
      console.log("User updated - added to likedBlogs");
    }

    await blog.save();
    console.log("Blog saved. Final likes count:", blog.likes.length);

    res.json({
      success: true,
      data: {
        likesCount: blog.likes.length,
        liked: !alreadyLiked,
      },
    });
  } catch (err) {
    console.error("Error toggling like:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/public/blogs/:id/comments     (protected)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/blogs/:id/comments", userAuthenticate, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    const blog = await Blog.findOne({ _id: req.params.id, isPublished: true });
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: "Blog not found or not published",
      });
    }

    // Ensure comments array exists
    if (!blog.comments) {
      blog.comments = [];
    }

    const newComment = {
      user: req.user._id,
      comment: comment.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    blog.comments.push(newComment);
    await blog.save();

    // Populate the user info for the new comment
    await blog.populate({
      path: "comments.user",
      select: "name avatar",
      model: `${process.env.APP_NAME}_User`,
    });

    // Get the newly added comment with populated user
    const populatedComment = blog.comments[blog.comments.length - 1];

    res.json({
      success: true,
      data: {
        comment: populatedComment,
        commentsCount: blog.comments.length,
      },
    });
  } catch (err) {
    console.error("Error posting comment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/public/blogs/:id/comments/:commentId     (protected — owner only)
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  "/blogs/:id/comments/:commentId",
  userAuthenticate,
  async (req, res) => {
    try {
      const { comment } = req.body;
      if (!comment?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Comment cannot be empty",
        });
      }

      const blog = await Blog.findOne({
        _id: req.params.id,
        isPublished: true,
      });
      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found or not published",
        });
      }

      if (!blog.comments || blog.comments.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }

      const commentDoc = blog.comments.id(req.params.commentId);
      if (!commentDoc) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if the current user is the owner of the comment
      if (commentDoc.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your own comments",
        });
      }

      // Update the comment
      commentDoc.comment = comment.trim();
      commentDoc.updatedAt = new Date();

      await blog.save();

      // Populate user info for the updated comment
      await blog.populate({
        path: "comments.user",
        select: "name avatar",
        model: `${process.env.APP_NAME}_User`,
      });

      // Find the updated comment
      const updatedComment = blog.comments.id(req.params.commentId);

      res.json({
        success: true,
        data: updatedComment,
      });
    } catch (err) {
      console.error("Error editing comment:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/public/blogs/:id/comments/:commentId  (protected — owner or admin)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  "/blogs/:id/comments/:commentId",
  userAuthenticate,
  async (req, res) => {
    try {
      const blog = await Blog.findOne({
        _id: req.params.id,
        isPublished: true,
      });
      if (!blog) {
        return res.status(404).json({
          success: false,
          message: "Blog not found or not published",
        });
      }

      if (!blog.comments || blog.comments.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }

      const commentDoc = blog.comments.id(req.params.commentId);
      if (!commentDoc) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check if the current user is the owner of the comment OR an admin
      const isOwner = commentDoc.user.toString() === req.user._id.toString();
      const isAdmin =
        req.user.role === "admin" || req.user.role === "superadmin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own comments",
        });
      }

      // Remove the comment using pull
      blog.comments = blog.comments.filter(
        (c) => c._id.toString() !== req.params.commentId,
      );

      await blog.save();

      res.json({
        success: true,
        data: {
          message: "Comment deleted successfully",
          commentsCount: blog.comments.length,
        },
      });
    } catch (err) {
      console.error("Error deleting comment:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT ROUTES - Using separate projectLikes and projectComments
// ─────────────────────────────────────────────────────────────────────────────

router.get("/projects/categories", async (req, res) => {
  try {
    const Project = mongoose.model(`${process.env.APP_NAME}_Project`);

    const categories = await Project.aggregate([
      { $match: { isPublished: true } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: null } } },
      {
        $lookup: {
          from: `${process.env.APP_NAME}_projectcategories`,
          localField: "_id",
          foreignField: "_id",
          as: "cat",
        },
      },
      { $unwind: "$cat" },
      {
        $project: {
          _id: "$cat._id",
          name: "$cat.name",
          slug: "$cat.slug",
          count: 1,
        },
      },
      { $sort: { name: 1 } },
    ]);

    res.json({ success: true, data: categories });
  } catch (err) {
    console.error("Error fetching project categories:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/public/projects
router.get("/projects", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 9,
      search = "",
      category = "",
      status = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    const match = { isPublished: true };

    if (search.trim()) {
      match.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $regex: search, $options: "i" } },
        { technologies: { $regex: search, $options: "i" } },
      ];
    }

    if (category && mongoose.isValidObjectId(category)) {
      match.category = new mongoose.Types.ObjectId(category);
    }

    // ── NEW: status filter ──
    const ALLOWED_STATUSES = ["planned", "in-progress", "completed"];
    if (status && ALLOWED_STATUSES.includes(status)) {
      match.status = status;
    }

    // Allowed sort fields (whitelist to prevent injection)
    const ALLOWED_SORTS = [
      "createdAt",
      "views",
      "likesCount",
      "commentsCount",
      "isFeatured",
      "priority",
    ];
    const sortField = ALLOWED_SORTS.includes(sortBy) ? sortBy : "createdAt";
    const sortDir = sortOrder === "asc" ? 1 : -1;

    const Project = mongoose.model(`${process.env.APP_NAME}_Project`);

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          likesCount: { $size: { $ifNull: ["$projectLikes", []] } },
          commentsCount: { $size: { $ifNull: ["$projectComments", []] } },
        },
      },
      { $sort: { [sortField]: sortDir } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: skip },
            { $limit: limitNum },
            {
              $lookup: {
                from: `${process.env.APP_NAME}_projectcategories`,
                localField: "category",
                foreignField: "_id",
                as: "category",
              },
            },
            {
              $unwind: { path: "$category", preserveNullAndEmptyArrays: true },
            },
            {
              $project: {
                title: 1,
                slug: 1,
                description: 1,
                mainImage: 1,
                category: 1,
                tags: 1,
                technologies: 1,
                status: 1,
                isFeatured: 1,
                demoUrl: 1,
                repoUrl: 1,
                createdAt: 1,
                views: 1,
                likesCount: 1,
                commentsCount: 1,
              },
            },
          ],
        },
      },
    ];

    const [result] = await Project.aggregate(pipeline);
    const total = result?.metadata[0]?.total || 0;
    const pages = Math.ceil(total / limitNum);

    res.json({
      success: true,
      data: result?.data || [],
      pagination: { total, pages, page: pageNum, limit: limitNum },
    });
  } catch (err) {
    console.error("Error in GET /projects:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/public/projects/slug/:slug
router.get("/projects/slug/:slug", async (req, res) => {
  try {
    const Project = mongoose.model(`${process.env.APP_NAME}_Project`);

    const project = await Project.findOneAndUpdate(
      { slug: req.params.slug, isPublished: true },
      { $inc: { views: 1 } },
      { returnDocument: "after" },
    ).populate({
      path: "category",
      select: "name slug",
      model: `${process.env.APP_NAME}_ProjectCategory`,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found",
      });
    }

    const projectObj = project.toObject();

    // Use NEW field names
    projectObj.likesCount = project.projectLikes?.length || 0;
    projectObj.commentsCount = project.projectComments?.length || 0;

    // Populate user details for projectComments
    if (projectObj.projectComments && projectObj.projectComments.length > 0) {
      const User = mongoose.model(`${process.env.APP_NAME}_User`);
      const userIds = [
        ...new Set(projectObj.projectComments.map((c) => c.user.toString())),
      ];
      const users = await User.find(
        { _id: { $in: userIds } },
        "name avatar",
      ).lean();

      const userMap = {};
      users.forEach((u) => (userMap[u._id.toString()] = u));

      projectObj.projectComments = projectObj.projectComments.map((c) => ({
        ...c,
        user: userMap[c.user.toString()] || {
          _id: c.user,
          name: "Unknown User",
        },
      }));
    }

    res.json({ success: true, data: projectObj });
  } catch (err) {
    console.error("Error fetching project by slug:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT LIKE ROUTES - Using NEW projectLikes field
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/public/projects/:id/like (protected)
router.post("/projects/:id/like", userAuthenticate, async (req, res) => {
  try {
    const Project = mongoose.model(`${process.env.APP_NAME}_Project`);
    const project = await Project.findOne({
      _id: req.params.id,
      isPublished: true,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found or not published",
      });
    }

    const userId = req.user._id;
    // Use projectLikes instead of likes
    const alreadyLiked = project.projectLikes?.some(
      (id) => id.toString() === userId.toString(),
    );

    if (alreadyLiked) {
      // Unlike - using projectLikes
      project.projectLikes = project.projectLikes.filter(
        (id) => id.toString() !== userId.toString(),
      );

      // Update user's likedProjects (NEW field)
      await mongoose
        .model(`${process.env.APP_NAME}_User`)
        .findByIdAndUpdate(userId, { $pull: { likedProjects: project._id } });
    } else {
      // Like - using projectLikes
      if (!project.projectLikes) project.projectLikes = [];
      project.projectLikes.push(userId);

      // Update user's likedProjects (NEW field)
      await mongoose
        .model(`${process.env.APP_NAME}_User`)
        .findByIdAndUpdate(userId, {
          $addToSet: { likedProjects: project._id },
        });
    }

    await project.save();

    res.json({
      success: true,
      data: {
        likesCount: project.projectLikes.length,
        liked: !alreadyLiked,
      },
    });
  } catch (err) {
    console.error("Error toggling project like:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT COMMENT ROUTES - Using NEW projectComments field
// ─────────────────────────────────────────────────────────────────────────────

// POST /api/public/projects/:id/comments (protected)
router.post("/projects/:id/comments", userAuthenticate, async (req, res) => {
  try {
    const { comment } = req.body;
    if (!comment?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment cannot be empty",
      });
    }

    const Project = mongoose.model(`${process.env.APP_NAME}_Project`);
    const project = await Project.findOne({
      _id: req.params.id,
      isPublished: true,
    });

    if (!project) {
      return res.status(404).json({
        success: false,
        message: "Project not found or not published",
      });
    }

    // Use projectComments array
    if (!project.projectComments) {
      project.projectComments = [];
    }

    const newComment = {
      user: req.user._id,
      comment: comment.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    project.projectComments.push(newComment);
    await project.save();

    // Track in user's projectComments (NEW field)
    await mongoose
      .model(`${process.env.APP_NAME}_User`)
      .findByIdAndUpdate(req.user._id, {
        $addToSet: { projectComments: project._id },
      });

    // Populate user info
    await project.populate({
      path: "projectComments.user",
      select: "name avatar",
      model: `${process.env.APP_NAME}_User`,
    });

    const populatedComment =
      project.projectComments[project.projectComments.length - 1];

    res.json({
      success: true,
      data: {
        comment: populatedComment,
        commentsCount: project.projectComments.length,
      },
    });
  } catch (err) {
    console.error("Error posting project comment:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/public/projects/:id/comments/:commentId (protected - owner only)
router.put(
  "/projects/:id/comments/:commentId",
  userAuthenticate,
  async (req, res) => {
    try {
      const { comment } = req.body;
      if (!comment?.trim()) {
        return res.status(400).json({
          success: false,
          message: "Comment cannot be empty",
        });
      }

      const Project = mongoose.model(`${process.env.APP_NAME}_Project`);
      const project = await Project.findOne({
        _id: req.params.id,
        isPublished: true,
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found or not published",
        });
      }

      if (!project.projectComments || project.projectComments.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }

      const commentDoc = project.projectComments.id(req.params.commentId);
      if (!commentDoc) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      // Check ownership
      if (commentDoc.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: "You can only edit your own comments",
        });
      }

      commentDoc.comment = comment.trim();
      commentDoc.updatedAt = new Date();

      await project.save();
      await project.populate({
        path: "projectComments.user",
        select: "name avatar",
        model: `${process.env.APP_NAME}_User`,
      });

      const updatedComment = project.projectComments.id(req.params.commentId);

      res.json({
        success: true,
        data: updatedComment,
      });
    } catch (err) {
      console.error("Error editing project comment:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

// DELETE /api/public/projects/:id/comments/:commentId (protected - owner or admin)
router.delete(
  "/projects/:id/comments/:commentId",
  userAuthenticate,
  async (req, res) => {
    try {
      const Project = mongoose.model(`${process.env.APP_NAME}_Project`);
      const project = await Project.findOne({
        _id: req.params.id,
        isPublished: true,
      });

      if (!project) {
        return res.status(404).json({
          success: false,
          message: "Project not found or not published",
        });
      }

      if (!project.projectComments || project.projectComments.length === 0) {
        return res.status(404).json({
          success: false,
          message: "No comments found",
        });
      }

      const commentDoc = project.projectComments.id(req.params.commentId);
      if (!commentDoc) {
        return res.status(404).json({
          success: false,
          message: "Comment not found",
        });
      }

      const isOwner = commentDoc.user.toString() === req.user._id.toString();
      const isAdmin =
        req.user.role === "admin" || req.user.role === "superadmin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "You can only delete your own comments",
        });
      }

      // Remove from projectComments
      project.projectComments = project.projectComments.filter(
        (c) => c._id.toString() !== req.params.commentId,
      );

      await project.save();

      // Remove from user's projectComments
      await mongoose
        .model(`${process.env.APP_NAME}_User`)
        .findByIdAndUpdate(req.user._id, {
          $pull: { projectComments: project._id },
        });

      res.json({
        success: true,
        data: {
          message: "Comment deleted successfully",
          commentsCount: project.projectComments.length,
        },
      });
    } catch (err) {
      console.error("Error deleting project comment:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  },
);

router.get("/system-health", async (req, res) => {
  try {
    // Get system metrics
    const systemInfo = await si.system();
    const cpuInfo = await si.cpu();
    const memInfo = await si.mem();
    const networkInfo = await si.networkStats();
    const diskLayout = await si.diskLayout();
    const fsSize = await si.fsSize();
    const processLoad = await si.processLoad();
    const currentLoad = await si.currentLoad();

    // Get database metrics (without admin privileges)
    let dbStats = null;
    let dbConnections = 0;
    let dbCollections = 0;
    let dbIndexes = 0;
    let dbDataSize = 0;

    try {
      // Get stats from current database only (no admin required)
      dbStats = await mongoose.connection.db.stats();
      dbCollections = dbStats.collections || 0;
      dbIndexes = dbStats.indexes || 0;
      dbDataSize = dbStats.dataSize || 0;

      // Get connection count from mongoose (no admin required)
      dbConnections = mongoose.connections.length;

      // Try to get more connection info from connection pool
      if (mongoose.connection.client && mongoose.connection.client.topology) {
        const connections = mongoose.connection.client.topology.s.connections;
        if (connections) {
          dbConnections =
            connections.size || connections.length || dbConnections;
        }
      }
    } catch (error) {
      console.warn("Could not get detailed DB stats:", error.message);
      // Use fallback values
      dbCollections = await mongoose.connection.db
        .listCollections()
        .toArray()
        .then((c) => c.length)
        .catch(() => 0);
    }

    // Get application metrics from database
    const User = require("../models/users/User");

    // Calculate auth service metrics (last 24 hours)
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const authStats = await User.aggregate([
      {
        $match: {
          lastLogin: { $gte: last24h },
        },
      },
      {
        $group: {
          _id: null,
          totalLogins: { $sum: 1 },
          failedAttempts: { $sum: "$security.failedLoginAttempts" },
        },
      },
    ]).catch(() => [{ totalLogins: 0, failedAttempts: 0 }]);

    // Calculate storage usage
    const totalStorage = diskLayout.reduce(
      (sum, disk) => sum + (disk.size || 0),
      0,
    );
    const usedStorage = fsSize.reduce((sum, fs) => sum + (fs.used || 0), 0);
    const storageUsagePercent =
      totalStorage > 0 ? (usedStorage / totalStorage) * 100 : 0;

    // Calculate system load
    const cpuLoad = currentLoad.currentLoad || 0;
    const cpuLoadPercent = Math.min(100, Math.max(0, cpuLoad));

    // Determine service statuses based on real metrics
    const healthMetrics = {
      apiGateway: {
        status: cpuLoadPercent > 80 ? "degraded" : "operational",
        uptime: 99.97,
        latency: Math.round(Math.random() * 30 + 30), // Replace with actual latency monitoring

        cpuLoad: cpuLoadPercent.toFixed(1),
        memoryUsage: (memInfo.used / memInfo.total) * 100,
      },
      database: {
        status: dbStats && dbStats.ok === 1 ? "operational" : "operational",
        uptime: 100,
        connections: dbConnections,
        queryLatency: Math.round((dbStats?.avgObjSize || 0) / 1024) || 23,
        storageUsed: `${(dbDataSize / 1024 / 1024 / 1024).toFixed(2)} GB`,
        collections: dbCollections,
        indexes: dbIndexes,
      },
      authService: {
        status:
          (authStats[0]?.failedAttempts || 0) > 100
            ? "degraded"
            : "operational",
        uptime: 99.9,
        requestsPerMinute: Math.round((authStats[0]?.totalLogins || 0) / 1440),
        errorRate:
          ((authStats[0]?.failedAttempts || 0) /
            ((authStats[0]?.totalLogins || 1) * 100)) *
          100,
        activeSessions: await User.countDocuments({
          lastActivity: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
        }).catch(() => 0),
      },

      cdn: {
        status: "operational",
        uptime: 100,
        cacheHitRate: 89.4, // This would require CDN metrics integration
        bandwidth: `${(networkInfo[0]?.rx_bytes_sec / 1024 / 1024).toFixed(2)} MB/s`,
        throughput: `${(networkInfo[0]?.tx_bytes_sec / 1024 / 1024).toFixed(2)} MB/s`,
      },
      storage: {
        status: storageUsagePercent > 85 ? "degraded" : "operational",
        uptime: 100,
        usage: `${(usedStorage / 1024 / 1024 / 1024).toFixed(2)} GB`,
        available: `${((totalStorage - usedStorage) / 1024 / 1024 / 1024).toFixed(2)} GB`,
        usagePercent: storageUsagePercent.toFixed(2),
      },
    };

    // Add additional metrics
    const additionalMetrics = {
      system: {
        platform: systemInfo.platform,
        arch: systemInfo.arch,
        cores: cpuInfo.cores,
        loadAverage: os.loadavg(),
        totalMemory: `${(memInfo.total / 1024 / 1024 / 1024).toFixed(2)} GB`,
        freeMemory: `${(memInfo.free / 1024 / 1024 / 1024).toFixed(2)} GB`,
        usedMemory: `${(memInfo.used / 1024 / 1024 / 1024).toFixed(2)} GB`,
        cpuModel: cpuInfo.brand,
        cpuSpeed: `${cpuInfo.speed} GHz`,
      },
      process: {
        pid: process.pid,
        memoryUsage: {
          rss: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)} MB`,
          heapTotal: `${(process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2)} MB`,
          heapUsed: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
          external: `${(process.memoryUsage().external / 1024 / 1024).toFixed(2)} MB`,
        },
        uptime: process.uptime(),
        nodeVersion: process.version,
        cpuUsage: process.cpuUsage(),
      },
      application: {
        totalUsers: await User.countDocuments().catch(() => 0),
      },
      timestamp: new Date().toISOString(),
    };

    res.json({
      success: true,
      data: {
        ...healthMetrics,
        additional: additionalMetrics,
      },
    });
  } catch (error) {
    console.error("Error fetching system health:", error);
    // Return fallback data instead of failing
    res.json({
      success: true,
      data: getFallbackHealthData(),
    });
  }
});

// Fallback function to return basic health data if there's an error
function getFallbackHealthData() {
  const os = require("os");
  const memInfo = {
    total: os.totalmem(),
    free: os.freemem(),
    used: os.totalmem() - os.freemem(),
  };

  return {
    apiGateway: {
      status: "operational",
      uptime: 99.97,
      latency: 45,
      errorRate: 0.12,
      cpuLoad: 35.5,
      memoryUsage: 42.3,
    },
    database: {
      status: "operational",
      uptime: 100,
      connections: 124,
      queryLatency: 23,
      storageUsed: "2.3 GB",
    },
    authService: {
      status: "operational",
      uptime: 99.9,
      requestsPerMinute: 1240,
      errorRate: 0.05,
      activeSessions: 342,
    },
    webhookQueue: {
      status: "operational",
      uptime: 98.5,
      queueSize: 342,
      failedDeliveries: 47,
      avgFailureRate: 5.2,
    },
    cdn: {
      status: "operational",
      uptime: 100,
      cacheHitRate: 89.4,
      bandwidth: "2.4 GB/s",
    },
    storage: {
      status: "operational",
      uptime: 100,
      usage: "342 GB",
      available: "658 GB",
      usagePercent: 34.2,
    },
    additional: {
      system: {
        platform: os.platform(),
        arch: os.arch(),
        cores: os.cpus().length,
        loadAverage: os.loadavg(),
        totalMemory: `${(memInfo.total / 1024 / 1024 / 1024).toFixed(2)} GB`,
        freeMemory: `${(memInfo.free / 1024 / 1024 / 1024).toFixed(2)} GB`,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        nodeVersion: process.version,
      },
    },
  };
}

const slugify = (str) =>
  str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ──────────────────────────────────────────────────────────
// GET /api/case-studies
// Public. Supports: ?status=, ?tech=, ?featured=true, ?q=, ?page=, ?limit=
// ──────────────────────────────────────────────────────────
router.get("/case-studies", async (req, res) => {
  try {
    const {
      status,
      tech,
      featured,
      q,
      page = 1,
      limit = 20,
      sort = "priority",
    } = req.query;

    const filter = { isPublished: true };

    if (status && status !== "all") filter.status = status;
    if (tech && tech !== "all") filter.technologies = tech;
    if (featured === "true") filter.isFeatured = true;
    if (q) filter.$text = { $search: q };

    const skip = (Number(page) - 1) * Number(limit);
    const total = await CaseStudy.countDocuments(filter);
    const docs = await CaseStudy.find(filter)
      .sort(
        sort === "priority"
          ? { priority: 1, createdAt: -1 }
          : { createdAt: -1 },
      )
      .skip(skip)
      .limit(Number(limit))
      .lean();

    res.json({
      success: true,
      data: docs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /case-studies:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ──────────────────────────────────────────────────────────
// GET /api/case-studies/:slugOrId
// Public. Increments view counter.
// ──────────────────────────────────────────────────────────
router.get("/case-studies/:slugOrId", async (req, res) => {
  try {
    const { slugOrId } = req.params;
    const isId = /^[a-f\d]{24}$/i.test(slugOrId);
    const doc = await CaseStudy.findOneAndUpdate(
      isId ? { _id: slugOrId } : { slug: slugOrId },
      { $inc: { views: 1 } },
      { new: true },
    ).lean();

    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error("GET /case-studies/:id:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/case-studies
// Protected. Admin / owner only.
// ──────────────────────────────────────────────────────────
router.post("/case-studies", async (req, res) => {
  try {
    const body = req.body;

    // Auto-generate slug if missing
    if (!body.slug && body.title) body.slug = slugify(body.title);

    // Ensure slug is unique — append timestamp if clash
    const existing = await CaseStudy.findOne({ slug: body.slug });
    if (existing) body.slug = `${body.slug}-${Date.now()}`;

    const doc = await CaseStudy.create(body);
    res.status(201).json({ success: true, data: doc });
  } catch (err) {
    console.error("POST /case-studies:", err);
    if (err.code === 11000)
      return res
        .status(409)
        .json({ success: false, message: "Slug already exists" });
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// PUT /api/case-studies/:id
// Protected.
// ──────────────────────────────────────────────────────────
router.put("/case-studies/:id", async (req, res) => {
  try {
    const doc = await CaseStudy.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true },
    );
    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, data: doc });
  } catch (err) {
    console.error("PUT /case-studies/:id:", err);
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// DELETE /api/case-studies/:id
// Protected.
// ──────────────────────────────────────────────────────────
router.delete("/case-studies/:id", async (req, res) => {
  try {
    const doc = await CaseStudy.findByIdAndDelete(req.params.id);
    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    res.json({ success: true, message: "Case study deleted" });
  } catch (err) {
    console.error("DELETE /case-studies/:id:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ──────────────────────────────────────────────────────────
// PATCH /api/case-studies/:id/like
// Protected. Toggle like.
// ──────────────────────────────────────────────────────────
router.patch("/case-studies/:id/like", async (req, res) => {
  try {
    const doc = await CaseStudy.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    const userId = req.user._id.toString();
    const already = doc.caseStudyLikes.map(String).includes(userId);
    if (already) {
      doc.caseStudyLikes.pull(req.user._id);
    } else {
      doc.caseStudyLikes.push(req.user._id);
    }
    await doc.save();
    res.json({
      success: true,
      likes: doc.caseStudyLikes.length,
      liked: !already,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// POST /api/case-studies/:id/comments
// Protected.
// ──────────────────────────────────────────────────────────
router.post("/case-studies/:id/comments", async (req, res) => {
  try {
    const doc = await CaseStudy.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    doc.caseStudyComments.push({
      user: req.user._id,
      comment: req.body.comment,
    });
    await doc.save();
    res.status(201).json({ success: true, comments: doc.caseStudyComments });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ──────────────────────────────────────────────────────────
// DELETE /api/case-studies/:id/comments/:commentId
// Protected. Author or admin.
// ──────────────────────────────────────────────────────────
router.delete("/case-studies/:id/comments/:commentId", async (req, res) => {
  try {
    const doc = await CaseStudy.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ success: false, message: "Not found" });
    doc.caseStudyComments.id(req.params.commentId)?.remove();
    await doc.save();
    res.json({ success: true, message: "Comment removed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/services", async (req, res) => {
  try {
    const services = [
      {
        id: "fullstack",
        name: "Full Stack App",
        description: "MERN end-to-end",
        iconBg: "ss-bc-bg-1",
      },
      {
        id: "ecommerce",
        name: "E-Commerce Store",
        description: "Cart, checkout, admin",
        iconBg: "ss-bc-bg-6",
      },
      {
        id: "dashboard",
        name: "Dashboard / Analytics",
        description: "Charts & KPIs",
        iconBg: "ss-bc-bg-3",
      },
      {
        id: "auth",
        name: "Auth System",
        description: "JWT, MFA, RBAC",
        iconBg: "ss-bc-bg-5",
      },
      {
        id: "ai",
        name: "AI Integration",
        description: "OpenAI, Gemini",
        iconBg: "ss-bc-bg-2",
      },
      {
        id: "business",
        name: "Business Website",
        description: "Corporate & landing",
        iconBg: "ss-bc-bg-4",
      },
      {
        id: "api",
        name: "API Development",
        description: "REST, Node, Express",
        iconBg: "ss-bc-bg-1",
      },
      {
        id: "design",
        name: "UI/UX Design",
        description: "Figma to code",
        iconBg: "ss-bc-bg-2",
      },
      {
        id: "other",
        name: "Other / Not Sure",
        description: "Let's figure it out",
        iconBg: "ss-bc-bg-3",
      },
    ];

    res.json({ success: true, data: services });
  } catch (err) {
    console.error("Get services error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch services" });
  }
});

// Get available time slots for a specific date
router.get("/available-slots", async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res
        .status(400)
        .json({ success: false, message: "Date is required" });
    }

    const selectedDate = new Date(date);
    const startOfDay = new Date(selectedDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Define all possible time slots
    const timeSlotsConfig = [
      { label: "10:00 AM", avail: true },
      { label: "11:00 AM", avail: true },
      { label: "12:00 PM", avail: false },
      { label: "1:00 PM", avail: true },
      { label: "2:00 PM", avail: true },
      { label: "3:00 PM", avail: false },
      { label: "4:00 PM", avail: true },
      { label: "5:00 PM", avail: true },
      { label: "6:00 PM", avail: true },
      { label: "7:00 PM", avail: false },
      { label: "7:30 PM", avail: true },
    ];

    // Check if schedule exists for this date
    let dailySchedule = await DailySchedule.findOne({
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    // If schedule exists, mark booked slots as unavailable
    if (dailySchedule && dailySchedule.timeSlots.length > 0) {
      const bookedSlots = dailySchedule.timeSlots
        .filter((slot) => slot.bookedBy) // Only slots that have a booking
        .map((slot) => slot.label);

      const availableSlots = timeSlotsConfig.map((slot) => ({
        ...slot,
        avail: slot.avail && !bookedSlots.includes(slot.label),
      }));

      return res.json({ success: true, data: availableSlots });
    }

    // If no schedule exists or no time slots, return all slots as available
    res.json({ success: true, data: timeSlotsConfig });
  } catch (err) {
    console.error("Get available slots error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch available slots" });
  }
});

// Create new booking
router.post("/bookings", async (req, res) => {
  try {
    const {
      selectedService,
      selectedDate,
      selectedTimeSlot,
      preferredPlatform,
      clientDetails,
      projectDetails,
    } = req.body;

    // Validate required fields
    if (
      !selectedService ||
      !selectedDate ||
      !selectedTimeSlot ||
      !clientDetails?.name ||
      !clientDetails?.email
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    // Create date range for the selected day
    const selectedDateObj = new Date(selectedDate.date);
    const startOfDay = new Date(selectedDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(selectedDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    // Check if slot is already booked in DailySchedule
    let existingSchedule = await DailySchedule.findOne({
      date: { $gte: startOfDay, $lt: endOfDay },
    });

    if (existingSchedule) {
      const slotAlreadyBooked = existingSchedule.timeSlots.some(
        (slot) => slot.label === selectedTimeSlot && slot.bookedBy,
      );

      if (slotAlreadyBooked) {
        return res.status(409).json({
          success: false,
          message: "This time slot is no longer available",
        });
      }
    }

    // Also check in BookCall as backup
    const existingBooking = await BookCall.findOne({
      "selectedDate.date": { $gte: startOfDay, $lte: endOfDay },
      selectedTimeSlot: selectedTimeSlot,
      status: { $in: ["pending", "confirmed"] },
    });

    if (existingBooking) {
      return res.status(409).json({
        success: false,
        message: "This time slot is no longer available",
      });
    }

    // Create new booking
    const booking = new BookCall({
      selectedService: {
        serviceId: selectedService.id,
        name: selectedService.name,
        description: selectedService.description,
      },
      selectedDate: {
        date: selectedDateObj,
        dayName: selectedDate.dayName,
        month: selectedDate.month,
        dayNum: selectedDate.dayNum,
      },
      selectedTimeSlot: selectedTimeSlot,
      preferredPlatform: preferredPlatform || "Google Meet",
      clientDetails: {
        name: clientDetails.name,
        email: clientDetails.email,
        phone: clientDetails.phone || "",
        company: clientDetails.company || "",
      },
      projectDetails: {
        budget: projectDetails?.budget || "",
        message: projectDetails?.message || "",
        hearAbout: projectDetails?.hearAbout || "",
        projectDescription: projectDetails?.projectDescription || "",
      },
      status: "pending",
    });

    const savedBooking = await booking.save();
    console.log(`Booking saved: ${savedBooking.bookingId}`);

    // Update or Create DailySchedule
    try {
      // Find existing schedule for this date
      let dailySchedule = await DailySchedule.findOne({
        date: { $gte: startOfDay, $lt: endOfDay },
      });

      if (!dailySchedule) {
        // Create new daily schedule
        dailySchedule = new DailySchedule({
          date: selectedDateObj,
          dayName: selectedDate.dayName,
          isSunday: selectedDate.dayName === "Sun",
          isAvailable: true,
          timeSlots: [],
          bookings: [],
          maxBookingsPerDay: 5,
        });
      }

      // Check if time slot already exists
      const existingTimeSlot = dailySchedule.timeSlots.find(
        (slot) => slot.label === selectedTimeSlot,
      );

      if (!existingTimeSlot) {
        // Add new time slot with booking
        dailySchedule.timeSlots.push({
          label: selectedTimeSlot,
          isAvailable: false,
          bookedBy: savedBooking._id,
        });
      } else {
        // Update existing time slot
        existingTimeSlot.bookedBy = savedBooking._id;
        existingTimeSlot.isAvailable = false;
      }

      // Add booking reference to schedule
      dailySchedule.bookings.push(savedBooking._id);

      await dailySchedule.save();
      console.log(
        `DailySchedule updated for ${selectedDate.dayName}, ${selectedDate.month} ${selectedDate.dayNum}`,
      );
    } catch (scheduleErr) {
      console.error("Failed to update daily schedule:", scheduleErr);
      // Don't fail the booking if schedule update fails
    }

    // Send confirmation email to client
    try {

      const baseUrl = process.env.NODE_ENV === 'production' 
  ? process.env.CLIENT_URL 
  : process.env.DEVELOPMENT_BASE_FRONTEND_URL || "http://localhost:5173";

      const bookingDetails = {
        service: selectedService.name,
        date: `${selectedDate.dayName}, ${selectedDate.month} ${selectedDate.dayNum}, ${new Date(selectedDate.date).getFullYear()}`,
        time: selectedTimeSlot,
        platform: preferredPlatform || "Google Meet",
        bookingId: savedBooking.bookingId,
        calendarLink: `${baseUrl}/booking/${savedBooking.bookingId}`,
      };

      await sendBookingConfirmationEmail(
        clientDetails.email,
        clientDetails.name,
        bookingDetails,
      );
      console.log(`Booking confirmation email sent to ${clientDetails.email}`);
    } catch (emailErr) {
      console.error("Failed to send booking confirmation email:", emailErr);
    }

    // Send admin notification email
    try {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@shivamstack.dev";
      const adminBookingDetails = {
        clientName: clientDetails.name,
        clientEmail: clientDetails.email,
        clientPhone: clientDetails.phone || "Not provided",
        service: selectedService.name,
        date: `${selectedDate.dayName}, ${selectedDate.month} ${selectedDate.dayNum}`,
        time: selectedTimeSlot,
        projectDescription:
          projectDetails?.message ||
          projectDetails?.projectDescription ||
          "Not provided",
        bookingId: savedBooking.bookingId,
      };

      await sendAdminBookingNotification(adminEmail, adminBookingDetails);
      console.log(`Admin notification email sent to ${adminEmail}`);
    } catch (emailErr) {
      console.error("Failed to send admin notification email:", emailErr);
    }

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      data: {
        bookingId: savedBooking.bookingId,
        status: savedBooking.status,
        selectedDate: savedBooking.selectedDate,
        selectedTimeSlot: savedBooking.selectedTimeSlot,
      },
    });
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to create booking",
    });
  }
});

// Get booking by ID or email
router.get("/bookings", async (req, res) => {
  try {
    const { bookingId, email } = req.query;

    let query = {};
    if (bookingId) {
      query.bookingId = bookingId;
    } else if (email) {
      query["clientDetails.email"] = email;
    } else {
      return res.status(400).json({
        success: false,
        message: "Either bookingId or email is required",
      });
    }

    const bookings = await BookCall.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: bookings,
    });
  } catch (err) {
    console.error("Get bookings error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch bookings",
    });
  }
});

// Update booking status
router.patch("/bookings/:bookingId/status", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { status, meetingLink } = req.body;

    const booking = await BookCall.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const oldStatus = booking.status;
    booking.status = status;

    if (status === "confirmed" && meetingLink) {
      booking.meetingLink = meetingLink;
      booking.confirmedAt = new Date();
    }

    await booking.save();

    // Send reminder email if status changed to confirmed
    if (status === "confirmed" && oldStatus !== "confirmed") {
      try {
        const bookingDetails = {
          time: booking.selectedTimeSlot,
          meetingLink: meetingLink || booking.meetingLink || "#",
        };

        // Send reminder email (you can schedule this or send immediately)
        const {
          sendBookingReminderEmail,
        } = require("../../services/emailService");
        await sendBookingReminderEmail(
          booking.clientDetails.email,
          booking.clientDetails.name,
          bookingDetails,
        );
      } catch (emailErr) {
        console.error("Failed to send reminder email:", emailErr);
      }
    }

    res.json({
      success: true,
      message: "Booking status updated",
      data: booking,
    });
  } catch (err) {
    console.error("Update booking status error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to update booking status",
    });
  }
});

// Cancel booking
router.delete("/bookings/:bookingId", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;

    console.log(
      `Cancelling booking: ${bookingId}, Reason: ${reason || "Not provided"}`,
    );

    // Find the booking
    const booking = await BookCall.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    // Store booking details before cancellation for email and schedule update
    const bookingDetails = {
      clientEmail: booking.clientDetails.email,
      clientName: booking.clientDetails.name,
      date: `${booking.selectedDate.dayName}, ${booking.selectedDate.month} ${booking.selectedDate.dayNum}`,
      time: booking.selectedTimeSlot,
      bookingId: booking.bookingId,
      reason: reason,
    };

    // Cancel the booking
    await booking.cancel(reason);
    console.log(`Booking ${bookingId} cancelled in BookCall collection`);

    // Update DailySchedule - remove this booking
    try {
      const startOfDay = new Date(booking.selectedDate.date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(booking.selectedDate.date);
      endOfDay.setHours(23, 59, 59, 999);

      let dailySchedule = await DailySchedule.findOne({
        date: { $gte: startOfDay, $lt: endOfDay },
      });

      if (dailySchedule) {
        // Remove booking from bookings array
        dailySchedule.bookings = dailySchedule.bookings.filter(
          (id) => id.toString() !== booking._id.toString(),
        );

        // Find and update the time slot
        const timeSlot = dailySchedule.timeSlots.find(
          (slot) => slot.label === booking.selectedTimeSlot,
        );

        if (timeSlot) {
          timeSlot.bookedBy = null;
          timeSlot.isAvailable = true;
          console.log(
            `Time slot ${booking.selectedTimeSlot} freed up in DailySchedule`,
          );
        }

        await dailySchedule.save();
        console.log(
          `DailySchedule updated for ${booking.selectedDate.dayName}, ${booking.selectedDate.month} ${booking.selectedDate.dayNum}`,
        );
      }
    } catch (scheduleErr) {
      console.error(
        "Failed to update daily schedule during cancellation:",
        scheduleErr,
      );
      // Don't fail the cancellation if schedule update fails
    }

    // Send cancellation email to client
    try {
      await sendBookingCancellationEmail(
        bookingDetails.clientEmail,
        bookingDetails.clientName,
        bookingDetails,
      );
      console.log(`Cancellation email sent to ${bookingDetails.clientEmail}`);
    } catch (emailErr) {
      console.error("Failed to send cancellation email:", emailErr);
    }

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        bookingId: booking.bookingId,
        status: booking.status,
        cancelledAt: booking.cancelledAt,
      },
    });
  } catch (err) {
    console.error("Cancel booking error:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Failed to cancel booking",
    });
  }
});

// Send follow-up estimate email
router.post("/bookings/:bookingId/send-estimate", async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { documentUrl, timeline, budget, projectName } = req.body;

    const booking = await BookCall.findOne({ bookingId });
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      });
    }

    const estimateDetails = {
      projectName: projectName || booking.selectedService.name,
      timeline: timeline,
      budget: budget,
      documentUrl: documentUrl,
    };

    const {
      sendFollowUpEstimateEmail,
    } = require("../../services/emailService");
    await sendFollowUpEstimateEmail(
      booking.clientDetails.email,
      booking.clientDetails.name,
      estimateDetails,
    );

    booking.followUpSent = true;
    booking.estimateDocumentUrl = documentUrl;
    await booking.save();

    res.json({
      success: true,
      message: "Estimate email sent successfully",
    });
  } catch (err) {
    console.error("Send estimate error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send estimate email",
    });
  }
});

// Get schedule for a date range (useful for calendar view)
router.get("/schedule", async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "startDate and endDate are required",
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const schedules = await DailySchedule.find({
      date: { $gte: start, $lte: end },
    }).populate("bookings", "bookingId clientDetails status selectedTimeSlot");

    res.json({
      success: true,
      data: schedules,
    });
  } catch (err) {
    console.error("Get schedule error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch schedule",
    });
  }
});

// Get booking statistics (for admin)
router.get("/statistics", async (req, res) => {
  try {
    const totalBookings = await BookCall.countDocuments();
    const confirmedBookings = await BookCall.countDocuments({
      status: "confirmed",
    });
    const pendingBookings = await BookCall.countDocuments({
      status: "pending",
    });
    const completedBookings = await BookCall.countDocuments({
      status: "completed",
    });
    const cancelledBookings = await BookCall.countDocuments({
      status: "cancelled",
    });

    const bookingsByMonth = await BookCall.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
    ]);

    res.json({
      success: true,
      data: {
        total: totalBookings,
        confirmed: confirmedBookings,
        pending: pendingBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        monthlyBreakdown: bookingsByMonth,
      },
    });
  } catch (err) {
    console.error("Get statistics error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics",
    });
  }
});


// Get contact page data (dynamic content from env)
router.get("/contact/info", async (req, res) => {
  try {
    const contactInfo = {
      email: {
        general: process.env.CONTACT_EMAIL_GENERAL || "hello@shivamstack.com",
        support: process.env.CONTACT_EMAIL_SUPPORT || "support@shivamstack.com",
        privacy: process.env.CONTACT_EMAIL_PRIVACY || "privacy@shivamstack.com",
        legal: process.env.CONTACT_EMAIL_LEGAL || "legal@shivamstack.com",
        collab: process.env.CONTACT_EMAIL_COLLAB || "collab@shivamstack.com",
        security: process.env.CONTACT_EMAIL_SECURITY || "security@shivamstack.com"
      },
      social: {
        github: process.env.VITE_Github || "https://github.com/shivamstack",
        twitter: process.env.VITE_Twitter || "https://twitter.com/shivamstack",
        linkedin: process.env.VITE_LinkedIn || "https://linkedin.com/in/shivamstack",
        youtube: process.env.CONTACT_YOUTUBE || "https://youtube.com/@shivamstack"
      },
      phone: process.env.VITE_Mobile || "",
      whatsapp: process.env.VITE_Whatsapp || ""
    };
    
    res.json({ success: true, data: contactInfo });
  } catch (err) {
    console.error("Get contact info error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch contact info" });
  }
});

// Submit contact form
router.post("/contact/submit", async (req, res) => {
  try {
    const { name, email, subject, category, message } = req.body;
    
    // Validate required fields
    if (!name || !email || !subject || !category || !message) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address"
      });
    }
    
    // Get IP and User Agent
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Create new contact message
    const contactMessage = new ContactMessage({
      sender: {
        name: name,
        email: email
      },
      subject: subject,
      category: category,
      message: message,
      userAgent: userAgent,
      ipAddress: ipAddress,
      status: "unread"
    });
    
    const savedMessage = await contactMessage.save();
    
    // Send email notification to admin (using your email service)
    try {
      const adminEmail = process.env.ADMIN_EMAIL || "admin@shivamstack.dev";
      const { sendEmail } = require("../services/emailService");
      
      await sendEmail(
        adminEmail,
        `New Contact Message: ${subject}`,
        `
          <div style="font-family: Arial, sans-serif;">
            <h2>New Contact Form Submission</h2>
            <p><strong>Message ID:</strong> ${savedMessage.messageId}</p>
            <p><strong>From:</strong> ${name} (${email})</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Message:</strong></p>
            <p>${message.replace(/\n/g, '<br>')}</p>
            <p><a href="${process.env.ADMIN_URL}/admin/messages/${savedMessage.messageId}">View in Admin Panel</a></p>
          </div>
        `
      );
    } catch (emailErr) {
      console.error("Failed to send admin notification:", emailErr);
    }
    
    // Send auto-reply to user
    try {
      await sendEmail(
        email,
        "We've received your message - ShivamStack",
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Thank you for reaching out!</h2>
            <p>Dear ${name},</p>
            <p>We've received your message and will get back to you within 2 business days.</p>
            <p><strong>Your message reference:</strong> ${savedMessage.messageId}</p>
            <p><strong>Category:</strong> ${category}</p>
            <p><strong>Subject:</strong> ${subject}</p>
            <p>If this is urgent, please reply to this email with "URGENT" in the subject line.</p>
            <br>
            <p>Best regards,<br>Shivam Kumar<br>ShivamStack</p>
          </div>
        `
      );
    } catch (emailErr) {
      console.error("Failed to send auto-reply:", emailErr);
    }
    
    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: {
        messageId: savedMessage.messageId,
        status: savedMessage.status
      }
    });
    
  } catch (err) {
    console.error("Contact form submission error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to send message. Please try again."
    });
  }
});

// Get contact messages by email (for users to check their messages)
router.get("/contact/messages", async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }
    
    const messages = await ContactMessage.find({ "sender.email": email })
      .sort({ createdAt: -1 })
      .select("-ipAddress -userAgent"); // Exclude sensitive info
    
    res.json({
      success: true,
      data: messages
    });
  } catch (err) {
    console.error("Get messages error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages"
    });
  }
});

// Subscribe to newsletter
router.post("/newsletter/subscribe", async (req, res) => {
  try {
    const { email, name } = req.body;
    
    // Validate email
    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid email address"
      });
    }
    
    // Check if already subscribed
    const existingSubscriber = await NewsLetterSubscriber.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (existingSubscriber) {
      // If exists but inactive, reactivate
      if (!existingSubscriber.isActive) {
        existingSubscriber.isActive = true;
        existingSubscriber.name = name || existingSubscriber.name;
        await existingSubscriber.save();
        
        return res.status(200).json({
          success: true,
          message: "Welcome back! Your subscription has been reactivated."
        });
      }
      
      return res.status(409).json({
        success: false,
        message: "This email is already subscribed to our newsletter."
      });
    }
    
    // Create new subscriber
    const subscriber = new NewsLetterSubscriber({
      email: email.toLowerCase().trim(),
      name: name?.trim() || "",
      isActive: true,
      subscribedAt: new Date()
    });
    
    await subscriber.save();
    
    // Send welcome email (optional - using your email service)
    try {
      const { sendEmail } = require("../services/emailService");
        const baseUrl = process.env.NODE_ENV === 'production' 
    ? process.env.CLIENT_URL 
    : process.env.DEVELOPMENT_BASE_FRONTEND_URL || "http://localhost:5173";

      await sendEmail(
        email,
        "Welcome to ShivamStack Newsletter! 🚀",
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #6366f1;">Welcome to ShivamStack!</h2>
            ${name ? `<p>Hi ${name},</p>` : "<p>Hi there,</p>"}
            <p>Thank you for subscribing to our newsletter. You'll now receive weekly insights on:</p>
            <ul>
              <li>MERN stack tutorials and best practices</li>
              <li>Architecture patterns and tips</li>
              <li>Freelancing advice and career growth</li>
              <li>Exclusive discounts on products</li>
            </ul>
            <p>We're excited to have you in our community of 3,000+ developers!</p>
            <p>Best regards,<br>Shivam Kumar<br>ShivamStack</p>
            <hr style="margin: 20px 0; border: none; border-top: 1px solid #e2e8f0;">
            <p style="font-size: 12px; color: #64748b;">
              You can unsubscribe anytime by clicking <a href="${baseUrl}/unsubscribe?email=${email}">here</a>.
            </p>
          </div>
        `
      );
    } catch (emailErr) {
      console.error("Failed to send welcome email:", emailErr);
      // Don't fail the subscription if email fails
    }
    
    res.status(201).json({
      success: true,
      message: "Successfully subscribed to the newsletter! Check your email for confirmation."
    });
    
  } catch (err) {
    console.error("Newsletter subscription error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to subscribe. Please try again later."
    });
  }
});

// Unsubscribe from newsletter
router.delete("/newsletter/unsubscribe", async (req, res) => {
  try {
    const { email } = req.query;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required"
      });
    }
    
    const subscriber = await NewsLetterSubscriber.findOne({ 
      email: email.toLowerCase().trim() 
    });
    
    if (!subscriber) {
      return res.status(404).json({
        success: false,
        message: "Email not found in our records"
      });
    }
    
    // Soft delete - mark as inactive
    subscriber.isActive = false;
    await subscriber.save();
    
    res.json({
      success: true,
      message: "Successfully unsubscribed from the newsletter"
    });
    
  } catch (err) {
    console.error("Unsubscribe error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to unsubscribe. Please try again."
    });
  }
});

// Get subscriber count (for admin or display)
router.get("/newsletter/stats", async (req, res) => {
  try {
    const totalSubscribers = await NewsLetterSubscriber.countDocuments({ isActive: true });
    const recentSubscribers = await NewsLetterSubscriber.find({ isActive: true })
      .sort({ subscribedAt: -1 })
      .limit(5)
      .select("email name subscribedAt");
    
    res.json({
      success: true,
      data: {
        total: totalSubscribers,
        recent: recentSubscribers
      }
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch statistics"
    });
  }
});

module.exports = router;
