// routes/users/blogRoutes.js
const express = require("express");
const router = express.Router();
const {
  adminAuthenticate,
  hasPermission,
  optionalAdminAuthenticate,
} = require("../middleware/adminAuth");
const BlogDB = require("../models/public/Blog");
const BlogCategoryDB = require("../models/public/BlogCategory");
const adminActivityService = require("../services/adminActivityService");
const {
  cloudinaryProductFileUpload,
  cloudinaryProductFilesUpload,
} = require("../middleware/cloudinaryUploader");

// ==================== BLOG CATEGORY ROUTES ====================

// Get all blog categories (with pagination and search)
router.get("/categories", adminAuthenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, search = "", isActive } = req.query;
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { slug: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    if (isActive !== undefined && isActive !== "") {
      query.isActive = isActive === "true";
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const categories = await BlogCategoryDB.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BlogCategoryDB.countDocuments(query);

    res.json({
      data: categories,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get blog categories error:", err);
    res.status(500).json({ message: "Failed to fetch blog categories" });
  }
});

// Get single blog category
router.get("/categories/:id", adminAuthenticate, async (req, res) => {
  try {
    const category = await BlogCategoryDB.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Blog category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get blog category error:", err);
    res.status(500).json({ message: "Failed to fetch blog category" });
  }
});

// Get blog category by slug (public)
router.get("/categories/slug/:slug", async (req, res) => {
  try {
    const category = await BlogCategoryDB.findOne({
      slug: req.params.slug,
      isActive: true,
    });
    if (!category) {
      return res.status(404).json({ message: "Blog category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get blog category by slug error:", err);
    res.status(500).json({ message: "Failed to fetch blog category" });
  }
});

// Create blog category
router.post(
  "/categories",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        isActive,
      } = req.body;

      const existing = await BlogCategoryDB.findOne({
        $or: [{ name }, { slug }],
      });

      if (existing) {
        return res.status(400).json({
          message:
            existing.name === name
              ? "Blog category name already exists"
              : "Slug already exists",
        });
      }

      const category = new BlogCategoryDB({
        name,
        slug,
        description,
        isActive: isActive !== undefined ? isActive : true,
      });

      await category.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "BlogCategory",
        resourceId: category._id,
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Blog category created successfully",
        data: category,
      });
    } catch (err) {
      console.error("Create blog category error:", err);
      res.status(500).json({ message: "Failed to create blog category" });
    }
  },
);

// Update blog category
router.put(
  "/categories/:id",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        isActive,
      } = req.body;

      const category = await BlogCategoryDB.findById(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Blog category not found" });
      }

      // Store old values for activity log
      const oldValues = {
        name: category.name,
        slug: category.slug,
        isActive: category.isActive,
      };

      if (name !== category.name || slug !== category.slug) {
        const existing = await BlogCategoryDB.findOne({
          _id: { $ne: category._id },
          $or: [{ name }, { slug }],
        });

        if (existing) {
          return res.status(400).json({
            message:
              existing.name === name
                ? "Blog category name already exists"
                : "Slug already exists",
          });
        }
      }

      if (name) category.name = name;
      if (slug) category.slug = slug;
      if (description !== undefined) category.description = description;
      if (isActive !== undefined) category.isActive = isActive;

      await category.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "BlogCategory",
        resourceId: category._id,
        changes: {
          before: oldValues,
          after: {
            name: category.name,
            slug: category.slug,
            isActive: category.isActive,
          },
        },
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Blog category updated successfully",
        data: category,
      });
    } catch (err) {
      console.error("Update blog category error:", err);
      res.status(500).json({ message: "Failed to update blog category" });
    }
  },
);

// Delete blog category
router.delete(
  "/categories/:id",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const category = await BlogCategoryDB.findById(req.params.id);

      if (!category) {
        return res.status(404).json({ message: "Blog category not found" });
      }

      const blogCount = await BlogDB.countDocuments({
        category: category._id,
      });

      if (blogCount > 0) {
        return res.status(400).json({
          message: `Cannot delete category with ${blogCount} blog posts. Move or delete blog posts first.`,
        });
      }

      await category.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "BlogCategory",
        resourceId: category._id,
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Blog category deleted successfully" });
    } catch (err) {
      console.error("Delete blog category error:", err);
      res.status(500).json({ message: "Failed to delete blog category" });
    }
  },
);

// Bulk delete blog categories
router.post(
  "/categories/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No blog category IDs provided" });
      }

      const categoriesWithBlogs = await BlogDB.distinct("category", {
        category: { $in: ids },
      });

      if (categoriesWithBlogs.length > 0) {
        return res.status(400).json({
          message:
            "Some categories have blog posts. Move or delete blog posts first.",
        });
      }

      const result = await BlogCategoryDB.deleteMany({ _id: { $in: ids } });

      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "BlogCategory",
        metadata: { count: result.deletedCount, categoryIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} blog categories deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete blog categories error:", err);
      res.status(500).json({ message: "Failed to delete blog categories" });
    }
  },
);

// ==================== BLOG POST ROUTES ====================

// Get all blog posts (with pagination, search, filters)
router.get("/", adminAuthenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      category,
      isPublished,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } },
        { author: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    if (category) query.category = category;
    if (isPublished !== undefined && isPublished !== "")
      query.isPublished = isPublished === "true";

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const blogs = await BlogDB.find(query)
      .populate("category", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await BlogDB.countDocuments(query);

    res.json({
      data: blogs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get blog posts error:", err);
    res.status(500).json({ message: "Failed to fetch blog posts" });
  }
});

// Get single blog post
router.get("/:id", adminAuthenticate, async (req, res) => {
  try {
    const blog = await BlogDB.findById(req.params.id).populate(
      "category",
      "name slug",
    );

    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }
    res.json({ data: blog });
  } catch (err) {
    console.error("Get blog post error:", err);
    res.status(500).json({ message: "Failed to fetch blog post" });
  }
});

// Public route: Get blog post by slug
router.get("/slug/:slug", optionalAdminAuthenticate, async (req, res) => {
  try {
    const query = { slug: req.params.slug };
    
    // If not admin, only show published posts
    if (!req.admin) {
      query.isPublished = true;
    }

    const blog = await BlogDB.findOne(query).populate("category", "name slug");

    if (!blog) {
      return res.status(404).json({ message: "Blog post not found" });
    }

    // Increment view count (if you want to track views)
    // blog.views += 1;
    // await blog.save();

    res.json({
      data: blog,
    });
  } catch (err) {
    console.error("Get blog post by slug error:", err);
    res.status(500).json({ message: "Failed to fetch blog post" });
  }
});

// Create blog post
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  cloudinaryProductFileUpload("featuredImage", "shivamstack/blogs"),
  async (req, res) => {
    try {
      console.log('Blog post creation started');
      console.log('Body:', req.body);
      console.log('File:', req.cloudinaryProductFile);

      let blogData = { ...req.body };

      // Parse JSON strings if needed
      if (blogData.tags && typeof blogData.tags === 'string') {
        try {
          blogData.tags = JSON.parse(blogData.tags);
        } catch (e) {
          blogData.tags = blogData.tags.split(',').map(t => t.trim()).filter(Boolean);
        }
      }

      // Handle empty category
      if (!blogData.category || blogData.category === '') {
        delete blogData.category;
      }

      // Check if slug exists
      const existing = await BlogDB.findOne({ slug: blogData.slug });
      if (existing) {
        return res.status(400).json({ message: "Blog post slug already exists" });
      }

      // Validate category only if provided
      if (blogData.category) {
        const category = await BlogCategoryDB.findById(blogData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Add uploaded file info for featured image
      if (req.cloudinaryProductFile) {
        blogData.featuredImage = req.cloudinaryProductFile.url;
      }

      // Convert string booleans to actual booleans
      if (blogData.isPublished !== undefined) {
        blogData.isPublished = blogData.isPublished === 'true';
      }

      // Handle published date
      if (blogData.isPublished && !blogData.publishedAt) {
        blogData.publishedAt = new Date();
      }

      // Parse tags if they came as string
      if (typeof blogData.tags === 'string') {
        blogData.tags = blogData.tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      const blog = new BlogDB(blogData);
      await blog.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "Blog",
        resourceId: blog._id,
        metadata: { title: blog.title, slug: blog.slug },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Blog post created successfully",
        data: blog,
      });
    } catch (err) {
      console.error("Create blog post error:", err);
      res.status(500).json({ message: "Failed to create blog post" });
    }
  },
);

// Update blog post with optional featured image upload
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  cloudinaryProductFileUpload("featuredImage", "shivamstack/blogs"),
  async (req, res) => {
    try {
      let blogData = req.body;

      // Parse JSON strings if they came from FormData
      if (blogData.tags && typeof blogData.tags === "string") {
        try {
          blogData.tags = JSON.parse(blogData.tags);
        } catch (e) {
          blogData.tags = blogData.tags.split(",").map(t => t.trim()).filter(Boolean);
        }
      }

      const blog = await BlogDB.findById(req.params.id);
      if (!blog) {
        return res.status(404).json({ message: "Blog post not found" });
      }

      // Store old values for activity log
      const oldValues = {
        title: blog.title,
        isPublished: blog.isPublished,
      };

      // Check if slug exists for other blog posts
      if (blogData.slug && blogData.slug !== blog.slug) {
        const existing = await BlogDB.findOne({
          _id: { $ne: blog._id },
          slug: blogData.slug,
        });

        if (existing) {
          return res
            .status(400)
            .json({ message: "Blog post slug already exists" });
        }
      }

      // Validate category if provided
      if (blogData.category && blogData.category !== blog.category?.toString()) {
        const category = await BlogCategoryDB.findById(blogData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Add uploaded file info to blog data if new featured image uploaded
      if (req.cloudinaryProductFile) {
        blogData.featuredImage = req.cloudinaryProductFile.url;
      }

      // Handle publishing logic
      if (blogData.isPublished === 'true' && !blog.isPublished && !blog.publishedAt) {
        blogData.publishedAt = new Date();
      }

      // Parse tags
      if (typeof blogData.tags === 'string') {
        blogData.tags = blogData.tags.split(',').map(t => t.trim()).filter(Boolean);
      }

      // Update fields
      const updatableFields = ['title', 'slug', 'content', 'author', 'category', 'tags', 'featuredImage', 'isPublished', 'publishedAt'];
      
      updatableFields.forEach(field => {
        if (blogData[field] !== undefined) {
          if (field === 'isPublished' && typeof blogData[field] === 'string') {
            blog[field] = blogData[field] === 'true';
          } else {
            blog[field] = blogData[field];
          }
        }
      });

      await blog.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Blog",
        resourceId: blog._id,
        changes: {
          before: oldValues,
          after: {
            title: blog.title,
            isPublished: blog.isPublished,
          },
        },
        metadata: { title: blog.title },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Blog post updated successfully",
        data: blog,
      });
    } catch (err) {
      console.error("Update blog post error:", err);
      res.status(500).json({ message: "Failed to update blog post" });
    }
  },
);

// Delete blog post
router.delete(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const blog = await BlogDB.findById(req.params.id);
      if (!blog) {
        return res.status(404).json({ message: "Blog post not found" });
      }

      await blog.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "Blog",
        resourceId: blog._id,
        metadata: { title: blog.title },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Blog post deleted successfully" });
    } catch (err) {
      console.error("Delete blog post error:", err);
      res.status(500).json({ message: "Failed to delete blog post" });
    }
  },
);

// Bulk delete blog posts
router.post(
  "/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No blog post IDs provided" });
      }

      const result = await BlogDB.deleteMany({ _id: { $in: ids } });

      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "Blog",
        metadata: { count: result.deletedCount, blogIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} blog posts deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete blog posts error:", err);
      res.status(500).json({ message: "Failed to delete blog posts" });
    }
  },
);

// Bulk update blog posts status
router.post(
  "/bulk-update-status",
  adminAuthenticate,
  hasPermission(["manage_blog"]),
  async (req, res) => {
    try {
      const { ids, isPublished } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No blog post IDs provided" });
      }

      const updateData = { isPublished };
      
      // If publishing, set publishedAt date
      if (isPublished === true) {
        updateData.publishedAt = new Date();
      }

      const result = await BlogDB.updateMany(
        { _id: { $in: ids } },
        { $set: updateData },
      );

      await adminActivityService.trackActivity(req.admin._id, "BULK_UPDATE", {
        resourceType: "Blog",
        metadata: {
          count: result.modifiedCount,
          action: `Set published to ${isPublished}`,
          blogIds: ids,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.modifiedCount} blog posts updated successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk update blog posts error:", err);
      res.status(500).json({ message: "Failed to update blog posts" });
    }
  },
);

module.exports = router;