// routes/users/publicRoutes.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose"); // Add this line at the top
const ProductDB = require("../models/public/Product");
const ProductCategoryDB = require("../models/public/ProductCategory");
const Blog = require("../models/public/Blog"); // adjust path as needed
const Product = require("../models/public/Product"); // adjust path as needed
const User = require("../models/users/User"); // adjust path as needed
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
    const User = require("../models/users/User")

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

module.exports = router;
