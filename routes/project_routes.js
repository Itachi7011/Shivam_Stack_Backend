const express = require("express");
const multer = require("multer");

const router = express.Router();
const {
  adminAuthenticate,
  hasPermission,
  optionalAdminAuthenticate,
} = require("../middleware/adminAuth");
const ProjectDB = require("../models/public/Project");
const ProjectCategoryDB = require("../models/public/ProjectCategory");
const adminActivityService = require("../services/adminActivityService");
const {
  cloudinaryProductFileUpload,
  cloudinaryProductFilesUpload,
  cloudinaryProductFilesUploadFields,
} = require("../middleware/cloudinaryUploader");

// ==================== PROJECT CATEGORY ROUTES ====================

// Get all project categories (with pagination and search)
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

    const categories = await ProjectCategoryDB.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectCategoryDB.countDocuments(query);

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
    console.error("Get project categories error:", err);
    res.status(500).json({ message: "Failed to fetch project categories" });
  }
});

// Get single project category
router.get("/categories/:id", adminAuthenticate, async (req, res) => {
  try {
    const category = await ProjectCategoryDB.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Project category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get project category error:", err);
    res.status(500).json({ message: "Failed to fetch project category" });
  }
});

// Get project category by slug (public)
router.get("/categories/slug/:slug", async (req, res) => {
  try {
    const category = await ProjectCategoryDB.findOne({
      slug: req.params.slug,
      isActive: true,
    });
    if (!category) {
      return res.status(404).json({ message: "Project category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get project category by slug error:", err);
    res.status(500).json({ message: "Failed to fetch project category" });
  }
});

// Create project
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  cloudinaryProductFilesUploadFields(
    [
      { name: "images", maxCount: 10 },
      { name: "mainImage", maxCount: 1 },
    ],
    "shivamstack/projects"
  ),
  async (req, res) => {
    try {
    //   console.log("Project creation started");
    //   console.log("Body:", req.body);
    //   console.log("Uploaded files:", req.uploadedFiles);

      let projectData = { ...req.body };

      // Parse JSON strings if needed
      const parseFields = ["tags", "technologies", "metaKeywords"];
      parseFields.forEach((field) => {
        if (projectData[field] && typeof projectData[field] === "string") {
          try {
            projectData[field] = JSON.parse(projectData[field]);
          } catch (e) {
            projectData[field] = projectData[field]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }
      });

      // Handle main image - SEPARATE FIELD
      if (req.uploadedFiles.mainImage) {
        // New uploaded main image
        projectData.mainImage = req.uploadedFiles.mainImage.url;
      } else if (projectData.existingMainImage && projectData.existingMainImage !== '') {
        // Existing main image URL
        projectData.mainImage = projectData.existingMainImage;
      } else {
        // No main image
        projectData.mainImage = '';
      }

      // Handle additional images - SEPARATE FIELD
      let additionalImages = [];

      // Add existing additional images if provided
      if (projectData.existingImages) {
        try {
          const existingImages = JSON.parse(projectData.existingImages);
          if (Array.isArray(existingImages)) {
            additionalImages = [...additionalImages, ...existingImages];
          }
        } catch (e) {
          console.error("Error parsing existing images:", e);
        }
      }

      // Add newly uploaded additional images
      if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
        const newImageUrls = req.uploadedFiles.images.map(img => img.url);
        additionalImages = [...additionalImages, ...newImageUrls];
      }

      projectData.images = additionalImages;

      // Handle empty category
      if (!projectData.category || projectData.category === "") {
        delete projectData.category;
      }

      // Check if slug exists
      const existing = await ProjectDB.findOne({ slug: projectData.slug });
      if (existing) {
        return res.status(400).json({ message: "Project slug already exists" });
      }

      // Validate category only if provided
      if (projectData.category) {
        const category = await ProjectCategoryDB.findById(projectData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Convert string booleans to actual booleans
      const booleanFields = ["isFeatured", "isPublished", "requiresLogin"];
      booleanFields.forEach((field) => {
        if (projectData[field] !== undefined) {
          projectData[field] = projectData[field] === "true";
        }
      });

      // Parse numeric fields
      if (projectData.priority !== undefined) {
        projectData.priority = parseInt(projectData.priority) || 0;
      }

      // Handle dates
      if (projectData.startDate) {
        projectData.startDate = new Date(projectData.startDate);
      }
      if (projectData.endDate) {
        projectData.endDate = new Date(projectData.endDate);
      }

      const project = new ProjectDB(projectData);
      await project.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "Project",
        resourceId: project._id,
        metadata: { title: project.title, slug: project.slug },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Project created successfully",
        data: project,
      });
    } catch (err) {
      console.error("Create project error:", err);
      res.status(500).json({ message: "Failed to create project" });
    }
  }
);

// Update project
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  cloudinaryProductFilesUploadFields(
    [
      { name: "images", maxCount: 10 },
      { name: "mainImage", maxCount: 1 },
    ],
    "shivamstack/projects"
  ),
  async (req, res) => {
    try {
      let projectData = req.body;

      // Parse JSON strings if they came from FormData
      const parseFields = ["tags", "technologies", "metaKeywords"];
      parseFields.forEach((field) => {
        if (projectData[field] && typeof projectData[field] === "string") {
          try {
            projectData[field] = JSON.parse(projectData[field]);
          } catch (e) {
            projectData[field] = projectData[field]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }
      });

      const project = await ProjectDB.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Handle main image - SEPARATE FIELD
      if (req.uploadedFiles.mainImage) {
        // New uploaded main image
        projectData.mainImage = req.uploadedFiles.mainImage.url;
      } else if (projectData.existingMainImage !== undefined) {
        // Existing main image URL or empty string
        projectData.mainImage = projectData.existingMainImage;
      }

      // Handle additional images - SEPARATE FIELD
      let additionalImages = [];

      // Add existing additional images if provided
      if (projectData.existingImages) {
        try {
          const existingImages = JSON.parse(projectData.existingImages);
          if (Array.isArray(existingImages)) {
            additionalImages = [...additionalImages, ...existingImages];
          }
        } catch (e) {
          console.error("Error parsing existing images:", e);
        }
      }

      // Add newly uploaded additional images
      if (req.uploadedFiles.images && req.uploadedFiles.images.length > 0) {
        const newImageUrls = req.uploadedFiles.images.map(img => img.url);
        additionalImages = [...additionalImages, ...newImageUrls];
      }

      projectData.images = additionalImages;

      // Store old values for activity log
      const oldValues = {
        title: project.title,
        status: project.status,
        isPublished: project.isPublished,
        isFeatured: project.isFeatured,
      };

      // Check if slug exists for other projects
      if (projectData.slug && projectData.slug !== project.slug) {
        const existing = await ProjectDB.findOne({
          _id: { $ne: project._id },
          slug: projectData.slug,
        });

        if (existing) {
          return res.status(400).json({ message: "Project slug already exists" });
        }
      }

      // Validate category if provided
      if (projectData.category && projectData.category !== project.category?.toString()) {
        const category = await ProjectCategoryDB.findById(projectData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Update fields
      const updatableFields = [
        "title",
        "slug",
        "description",
        "client",
        "startDate",
        "endDate",
        "status",
        "mainImage",      // Separate main image field
        "images",         // Separate additional images field
        "category",
        "demoUrl",
        "repoUrl",
        "clientUrl",
        "tags",
        "technologies",
        "isFeatured",
        "priority",
        "metaTitle",
        "metaDescription",
        "metaKeywords",
        "isPublished",
        "requiresLogin",
      ];

      updatableFields.forEach((field) => {
        if (projectData[field] !== undefined) {
          if (field === "startDate" || field === "endDate") {
            project[field] = projectData[field] ? new Date(projectData[field]) : null;
          } else if (field === "priority") {
            project[field] = parseInt(projectData[field]) || 0;
          } else if (["isFeatured", "isPublished", "requiresLogin"].includes(field)) {
            if (typeof projectData[field] === "string") {
              project[field] = projectData[field] === "true";
            } else {
              project[field] = projectData[field];
            }
          } else {
            project[field] = projectData[field];
          }
        }
      });

      await project.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Project",
        resourceId: project._id,
        changes: {
          before: oldValues,
          after: {
            title: project.title,
            status: project.status,
            isPublished: project.isPublished,
            isFeatured: project.isFeatured,
          },
        },
        metadata: { title: project.title },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Project updated successfully",
        data: project,
      });
    } catch (err) {
      console.error("Update project error:", err);
      res.status(500).json({ message: "Failed to update project" });
    }
  }
);

// Delete project category
router.delete(
  "/categories/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const category = await ProjectCategoryDB.findById(req.params.id);

      if (!category) {
        return res.status(404).json({ message: "Project category not found" });
      }

      const projectCount = await ProjectDB.countDocuments({
        category: category._id,
      });

      if (projectCount > 0) {
        return res.status(400).json({
          message: `Cannot delete category with ${projectCount} projects. Move or delete projects first.`,
        });
      }

      await category.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "ProjectCategory",
        resourceId: category._id,
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Project category deleted successfully" });
    } catch (err) {
      console.error("Delete project category error:", err);
      res.status(500).json({ message: "Failed to delete project category" });
    }
  },
);

// Bulk delete project categories
router.post(
  "/categories/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res
          .status(400)
          .json({ message: "No project category IDs provided" });
      }

      const categoriesWithProjects = await ProjectDB.distinct("category", {
        category: { $in: ids },
      });

      if (categoriesWithProjects.length > 0) {
        return res.status(400).json({
          message:
            "Some categories have projects. Move or delete projects first.",
        });
      }

      const result = await ProjectCategoryDB.deleteMany({ _id: { $in: ids } });

      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "ProjectCategory",
        metadata: { count: result.deletedCount, categoryIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} project categories deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete project categories error:", err);
      res.status(500).json({ message: "Failed to delete project categories" });
    }
  },
);

// ==================== PROJECT ROUTES ====================

// Get all projects (with pagination, search, filters)
router.get("/", adminAuthenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      category,
      status,
      isFeatured,
      isPublished,
      minPriority,
      maxPriority,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$text = { $search: search };
    }

    if (category) query.category = category;
    if (status) query.status = status;
    if (isFeatured !== undefined && isFeatured !== "")
      query.isFeatured = isFeatured === "true";
    if (isPublished !== undefined && isPublished !== "")
      query.isPublished = isPublished === "true";

    if (minPriority !== undefined || maxPriority !== undefined) {
      query.priority = {};
      if (minPriority) query.priority.$gte = parseInt(minPriority);
      if (maxPriority) query.priority.$lte = parseInt(maxPriority);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const projects = await ProjectDB.find(query)
      .populate("category", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProjectDB.countDocuments(query);

    res.json({
      data: projects,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get projects error:", err);
    res.status(500).json({ message: "Failed to fetch projects" });
  }
});

// Get single project
router.get("/:id", adminAuthenticate, async (req, res) => {
  try {
    const project = await ProjectDB.findById(req.params.id).populate(
      "category",
      "name slug",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }
    res.json({ data: project });
  } catch (err) {
    console.error("Get project error:", err);
    res.status(500).json({ message: "Failed to fetch project" });
  }
});

// Public route: Get project by slug
router.get("/slug/:slug", optionalAdminAuthenticate, async (req, res) => {
  try {
    const query = { slug: req.params.slug };

    // If not admin, only show published projects
    if (!req.admin) {
      query.isPublished = true;
    }

    const project = await ProjectDB.findOne(query).populate(
      "category",
      "name slug",
    );

    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Increment view count
    project.views += 1;
    await project.save();

    res.json({
      data: project,
    });
  } catch (err) {
    console.error("Get project by slug error:", err);
    res.status(500).json({ message: "Failed to fetch project" });
  }
});

// Create project
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  // Use fields() to handle multiple file fields
  (req, res, next) => {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
      },
    }).fields([
      { name: "images", maxCount: 10 },
      { name: "mainImage", maxCount: 1 },
    ]);

    upload(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({
          message: err.message || "File upload error",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      console.log("Project creation started");
      console.log("Body:", req.body);
      console.log("Files:", req.files);

      let projectData = { ...req.body };

      // Parse JSON strings if needed
      const parseFields = ["tags", "technologies", "metaKeywords"];
      parseFields.forEach((field) => {
        if (projectData[field] && typeof projectData[field] === "string") {
          try {
            projectData[field] = JSON.parse(projectData[field]);
          } catch (e) {
            projectData[field] = projectData[field]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }
      });

      // Handle images
      let allImages = [];

      // 1. Handle existing images (URLs)
      if (projectData.existingImages) {
        try {
          const existingImages = JSON.parse(projectData.existingImages);
          allImages = [...allImages, ...existingImages];
        } catch (e) {
          console.error("Error parsing existing images:", e);
        }
      }

      // 2. Handle main image file if uploaded
      if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
        // Upload main image to Cloudinary
        const mainImageFile = req.files.mainImage[0];
        // You'll need to upload to Cloudinary here
        // For now, we'll add a placeholder
        allImages.unshift("main-image-url-will-go-here"); // This should be the Cloudinary URL
      }

      // 3. Handle additional image files
      if (req.files && req.files.images && req.files.images.length > 0) {
        // Upload additional images to Cloudinary
        // req.files.images.forEach(file => {
        //   Upload to Cloudinary and add URL to allImages
        // });
        // For now, add placeholders
        req.files.images.forEach((file, index) => {
          allImages.push(`additional-image-${index}-url-will-go-here`);
        });
      }

      projectData.images = allImages;

      // Handle empty category
      if (!projectData.category || projectData.category === "") {
        delete projectData.category;
      }

      // Check if slug exists
      const existing = await ProjectDB.findOne({ slug: projectData.slug });
      if (existing) {
        return res.status(400).json({ message: "Project slug already exists" });
      }

      // Validate category only if provided
      if (projectData.category) {
        const category = await ProjectCategoryDB.findById(projectData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Convert string booleans to actual booleans
      const booleanFields = ["isFeatured", "isPublished", "requiresLogin"];
      booleanFields.forEach((field) => {
        if (projectData[field] !== undefined) {
          projectData[field] = projectData[field] === "true";
        }
      });

      // Parse numeric fields
      if (projectData.priority !== undefined) {
        projectData.priority = parseInt(projectData.priority) || 0;
      }

      // Handle dates
      if (projectData.startDate) {
        projectData.startDate = new Date(projectData.startDate);
      }
      if (projectData.endDate) {
        projectData.endDate = new Date(projectData.endDate);
      }

      const project = new ProjectDB(projectData);
      await project.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "Project",
        resourceId: project._id,
        metadata: { title: project.title, slug: project.slug },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Project created successfully",
        data: project,
      });
    } catch (err) {
      console.error("Create project error:", err);
      res.status(500).json({ message: "Failed to create project" });
    }
  },
);

// Update project
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  // Use fields() to handle multiple file fields
  (req, res, next) => {
    const upload = multer({
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter(req, file, cb) {
        if (!file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
          return cb(new Error("Only image files are allowed"));
        }
        cb(null, true);
      },
    }).fields([
      { name: "images", maxCount: 10 },
      { name: "mainImage", maxCount: 1 },
    ]);

    upload(req, res, async (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({
          message: err.message || "File upload error",
        });
      }
      next();
    });
  },
  async (req, res) => {
    try {
      let projectData = req.body;

      // Parse JSON strings if they came from FormData
      const parseFields = ["tags", "technologies", "metaKeywords"];
      parseFields.forEach((field) => {
        if (projectData[field] && typeof projectData[field] === "string") {
          try {
            projectData[field] = JSON.parse(projectData[field]);
          } catch (e) {
            projectData[field] = projectData[field]
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
        }
      });

      const project = await ProjectDB.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Handle images
      let allImages = [];

      // 1. Handle existing images (URLs)
      if (projectData.existingImages) {
        try {
          const existingImages = JSON.parse(projectData.existingImages);
          allImages = [...allImages, ...existingImages];
        } catch (e) {
          console.error("Error parsing existing images:", e);
        }
      }

      // 2. Handle main image file if uploaded
      if (req.files && req.files.mainImage && req.files.mainImage.length > 0) {
        // Upload main image to Cloudinary
        const mainImageFile = req.files.mainImage[0];
        // You'll need to upload to Cloudinary here
        // For now, we'll add a placeholder
        allImages.unshift("main-image-url-will-go-here"); // This should be the Cloudinary URL
      }

      // 3. Handle additional image files
      if (req.files && req.files.images && req.files.images.length > 0) {
        // Upload additional images to Cloudinary
        req.files.images.forEach((file, index) => {
          allImages.push(`additional-image-${index}-url-will-go-here`);
        });
      }

      projectData.images = allImages;

      // Store old values for activity log
      const oldValues = {
        title: project.title,
        status: project.status,
        isPublished: project.isPublished,
        isFeatured: project.isFeatured,
      };

      // Check if slug exists for other projects
      if (projectData.slug && projectData.slug !== project.slug) {
        const existing = await ProjectDB.findOne({
          _id: { $ne: project._id },
          slug: projectData.slug,
        });

        if (existing) {
          return res
            .status(400)
            .json({ message: "Project slug already exists" });
        }
      }

      // Validate category if provided
      if (
        projectData.category &&
        projectData.category !== project.category?.toString()
      ) {
        const category = await ProjectCategoryDB.findById(projectData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Update fields
      const updatableFields = [
        "title",
        "slug",
        "description",
        "client",
        "startDate",
        "endDate",
        "status",
        "images",
        "category",
        "demoUrl",
        "repoUrl",
        "clientUrl",
        "tags",
        "technologies",
        "isFeatured",
        "priority",
        "metaTitle",
        "metaDescription",
        "metaKeywords",
        "isPublished",
        "requiresLogin",
      ];

      updatableFields.forEach((field) => {
        if (projectData[field] !== undefined) {
          if (field === "startDate" || field === "endDate") {
            project[field] = projectData[field]
              ? new Date(projectData[field])
              : null;
          } else if (field === "priority") {
            project[field] = parseInt(projectData[field]) || 0;
          } else if (
            ["isFeatured", "isPublished", "requiresLogin"].includes(field)
          ) {
            if (typeof projectData[field] === "string") {
              project[field] = projectData[field] === "true";
            } else {
              project[field] = projectData[field];
            }
          } else {
            project[field] = projectData[field];
          }
        }
      });

      await project.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Project",
        resourceId: project._id,
        changes: {
          before: oldValues,
          after: {
            title: project.title,
            status: project.status,
            isPublished: project.isPublished,
            isFeatured: project.isFeatured,
          },
        },
        metadata: { title: project.title },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Project updated successfully",
        data: project,
      });
    } catch (err) {
      console.error("Update project error:", err);
      res.status(500).json({ message: "Failed to update project" });
    }
  },
);

// Upload additional project images
router.post(
  "/:id/images",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  cloudinaryProductFilesUpload("images", 10, "shivamstack/projects"),
  async (req, res) => {
    try {
      const project = await ProjectDB.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (req.cloudinaryProductFiles && req.cloudinaryProductFiles.length > 0) {
        const fileUrls = req.cloudinaryProductFiles.map((f) => f.url);
        project.images = [...(project.images || []), ...fileUrls];
        await project.save();

        await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
          resourceType: "Project",
          resourceId: project._id,
          metadata: {
            title: project.title,
            imagesAdded: req.cloudinaryProductFiles.length,
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });
      }

      res.json({
        message: "Images uploaded successfully",
        files: req.cloudinaryProductFiles,
        images: project.images,
      });
    } catch (err) {
      console.error("Upload project images error:", err);
      res.status(500).json({ message: "Failed to upload images" });
    }
  },
);

// Delete project
router.delete(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const project = await ProjectDB.findById(req.params.id);
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      await project.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "Project",
        resourceId: project._id,
        metadata: { title: project.title },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Project deleted successfully" });
    } catch (err) {
      console.error("Delete project error:", err);
      res.status(500).json({ message: "Failed to delete project" });
    }
  },
);

// Bulk delete projects
router.post(
  "/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No project IDs provided" });
      }

      const result = await ProjectDB.deleteMany({ _id: { $in: ids } });

      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "Project",
        metadata: { count: result.deletedCount, projectIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} projects deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete projects error:", err);
      res.status(500).json({ message: "Failed to delete projects" });
    }
  },
);

// Bulk update projects status
router.post(
  "/bulk-update-status",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const { ids, status } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No project IDs provided" });
      }

      if (!["planned", "in-progress", "completed"].includes(status)) {
        return res.status(400).json({ message: "Invalid status value" });
      }

      const result = await ProjectDB.updateMany(
        { _id: { $in: ids } },
        { $set: { status } },
      );

      await adminActivityService.trackActivity(req.admin._id, "BULK_UPDATE", {
        resourceType: "Project",
        metadata: {
          count: result.modifiedCount,
          action: `Set status to ${status}`,
          projectIds: ids,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.modifiedCount} projects updated successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk update projects error:", err);
      res.status(500).json({ message: "Failed to update projects" });
    }
  },
);

// Bulk update featured status
router.post(
  "/bulk-update-featured",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const { ids, isFeatured } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No project IDs provided" });
      }

      const result = await ProjectDB.updateMany(
        { _id: { $in: ids } },
        { $set: { isFeatured: isFeatured === true } },
      );

      await adminActivityService.trackActivity(req.admin._id, "BULK_UPDATE", {
        resourceType: "Project",
        metadata: {
          count: result.modifiedCount,
          action: `Set featured to ${isFeatured}`,
          projectIds: ids,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.modifiedCount} projects updated successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk update projects featured error:", err);
      res.status(500).json({ message: "Failed to update projects" });
    }
  },
);

// Get project statistics
router.get(
  "/stats/summary",
  adminAuthenticate,
  hasPermission(["view_projects"]),
  async (req, res) => {
    try {
      const [
        totalProjects,
        plannedProjects,
        inProgressProjects,
        completedProjects,
        featuredProjects,
        totalViews,
        topProjects,
      ] = await Promise.all([
        ProjectDB.countDocuments(),
        ProjectDB.countDocuments({ status: "planned" }),
        ProjectDB.countDocuments({ status: "in-progress" }),
        ProjectDB.countDocuments({ status: "completed" }),
        ProjectDB.countDocuments({ isFeatured: true }),
        ProjectDB.aggregate([
          { $group: { _id: null, total: { $sum: "$views" } } },
        ]),
        ProjectDB.find()
          .sort({ views: -1 })
          .limit(5)
          .select("title views status"),
      ]);

      res.json({
        data: {
          totalProjects,
          plannedProjects,
          inProgressProjects,
          completedProjects,
          featuredProjects,
          totalViews: totalViews[0]?.total || 0,
          topProjects,
        },
      });
    } catch (err) {
      console.error("Get project stats error:", err);
      res.status(500).json({ message: "Failed to fetch project statistics" });
    }
  },
);

module.exports = router;
