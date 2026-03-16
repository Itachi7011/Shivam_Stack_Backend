// routes/users/productRoutes.js
const express = require("express");
const router = express.Router();
const {
  adminAuthenticate,
  hasPermission,
  optionalAdminAuthenticate,
} = require("../middleware/adminAuth");
const ProductDB = require("../models/public/Product");
const ProductCategoryDB = require("../models/public/ProductCategory");
const adminActivityService = require("../services/adminActivityService");
const {
  cloudinaryProductFileUpload,
  cloudinaryProductFilesUpload,
} = require("../middleware/cloudinaryUploader");

// ==================== CATEGORY ROUTES ====================

// Get all categories (with pagination and search)
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

    const categories = await ProductCategoryDB.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProductCategoryDB.countDocuments(query);

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
    console.error("Get categories error:", err);
    res.status(500).json({ message: "Failed to fetch categories" });
  }
});

// Get single category
router.get("/categories/:id", adminAuthenticate, async (req, res) => {
  try {
    const category = await ProductCategoryDB.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get category error:", err);
    res.status(500).json({ message: "Failed to fetch category" });
  }
});

// Get category by slug (public)
router.get("/categories/slug/:slug", async (req, res) => {
  try {
    const category = await ProductCategoryDB.findOne({
      slug: req.params.slug,
      isActive: true,
    });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }
    res.json({ data: category });
  } catch (err) {
    console.error("Get category by slug error:", err);
    res.status(500).json({ message: "Failed to fetch category" });
  }
});

// Create category
router.post(
  "/categories",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        isActive,
        metaTitle,
        metaDescription,
        metaKeywords,
      } = req.body;

      const existing = await ProductCategoryDB.findOne({
        $or: [{ name }, { slug }],
      });

      if (existing) {
        return res.status(400).json({
          message:
            existing.name === name
              ? "Category name already exists"
              : "Slug already exists",
        });
      }

      const category = new ProductCategoryDB({
        name,
        slug,
        description,
        isActive: isActive !== undefined ? isActive : true,
        metaTitle,
        metaDescription,
        metaKeywords,
      });

      await category.save();

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "ProductCategory",
        resourceId: category._id,
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Category created successfully",
        data: category,
      });
    } catch (err) {
      console.error("Create category error:", err);
      res.status(500).json({ message: "Failed to create category" });
    }
  },
);

// Update category
router.put(
  "/categories/:id",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        isActive,
        metaTitle,
        metaDescription,
        metaKeywords,
      } = req.body;

      const category = await ProductCategoryDB.findById(req.params.id);
      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      // Store old values for activity log
      const oldValues = {
        name: category.name,
        slug: category.slug,
        isActive: category.isActive,
      };

      if (name !== category.name || slug !== category.slug) {
        const existing = await ProductCategoryDB.findOne({
          _id: { $ne: category._id },
          $or: [{ name }, { slug }],
        });

        if (existing) {
          return res.status(400).json({
            message:
              existing.name === name
                ? "Category name already exists"
                : "Slug already exists",
          });
        }
      }

      if (name) category.name = name;
      if (slug) category.slug = slug;
      if (description !== undefined) category.description = description;
      if (isActive !== undefined) category.isActive = isActive;
      if (metaTitle !== undefined) category.metaTitle = metaTitle;
      if (metaDescription !== undefined)
        category.metaDescription = metaDescription;
      if (metaKeywords !== undefined) category.metaKeywords = metaKeywords;

      await category.save();

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "ProductCategory",
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
        message: "Category updated successfully",
        data: category,
      });
    } catch (err) {
      console.error("Update category error:", err);
      res.status(500).json({ message: "Failed to update category" });
    }
  },
);

// Delete category
router.delete(
  "/categories/:id",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const category = await ProductCategoryDB.findById(req.params.id);
            console.log("category" , category)

      if (!category) {
        return res.status(404).json({ message: "Category not found" });
      }

      const productCount = await ProductDB.countDocuments({
        category: category._id,
      });

      if (productCount > 0) {
        return res.status(400).json({
          message: `Cannot delete category with ${productCount} products. Move or delete products first.`,
        });
      }

      await category.deleteOne();

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "ProductCategory",
        resourceId: category._id,
        metadata: { name: category.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Category deleted successfully" });
    } catch (err) {
      console.error("Delete category error:", err);
      res.status(500).json({ message: "Failed to delete category" });
    }
  },
);

// Bulk delete categories
router.post(
  "/categories/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No category IDs provided" });
      }

      const categoriesWithProducts = await ProductDB.distinct("category", {
        category: { $in: ids },
      });

      if (categoriesWithProducts.length > 0) {
        return res.status(400).json({
          message:
            "Some categories have products. Move or delete products first.",
        });
      }

      const result = await ProductCategoryDB.deleteMany({ _id: { $in: ids } });

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "ProductCategory",
        metadata: { count: result.deletedCount, categoryIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} categories deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete categories error:", err);
      res.status(500).json({ message: "Failed to delete categories" });
    }
  },
);

// ==================== PRODUCT ROUTES ====================

// Get all products (with pagination, search, filters)
router.get("/", adminAuthenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      category,
      isPublished,
      isFree,
      minPrice,
      maxPrice,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    if (search) {
      query.$text = { $search: search };
    }

    if (category) query.category = category;
    if (isPublished !== undefined && isPublished !== "")
      query.isPublished = isPublished === "true";
    if (isFree !== undefined && isPublished !== "")
      query.isFree = isFree === "true";

    if (minPrice !== undefined || maxPrice !== undefined) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const products = await ProductDB.find(query)
      .populate("category", "name slug")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await ProductDB.countDocuments(query);

    res.json({
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ message: "Failed to fetch products" });
  }
});

// Get single product
router.get("/:id", adminAuthenticate, async (req, res) => {
  try {
    const product = await ProductDB.findById(req.params.id).populate(
      "category",
      "name slug",
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.json({ data: product });
  } catch (err) {
    console.error("Get product error:", err);
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// Public route: Get product by slug (for download/view)
router.get("/slug/:slug", optionalAdminAuthenticate, async (req, res) => {
  try {
    const product = await ProductDB.findOne({
      slug: req.params.slug,
      isPublished: true,
    }).populate("category", "name slug");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    product.views += 1;
    await product.save();

    let canDownload = false;
    let downloadUrl = null;

    if (product.isFree) {
      canDownload = true;
      downloadUrl = product.fileUrl;
    } else if (req.admin) {
      canDownload = true;
      downloadUrl = product.fileUrl;
    } else if (product.requiresPurchase) {
      canDownload = false;
    }

    res.json({
      data: {
        ...product.toObject(),
        canDownload,
        downloadUrl: canDownload ? downloadUrl : null,
      },
    });
  } catch (err) {
    console.error("Get product by slug error:", err);
    res.status(500).json({ message: "Failed to fetch product" });
  }
});

// Download product file (public)
router.get("/:id/download", optionalAdminAuthenticate, async (req, res) => {
  try {
    const product = await ProductDB.findById(req.params.id);

    if (!product || !product.isPublished) {
      return res.status(404).json({ message: "Product not found" });
    }

    let canDownload = product.isFree || req.admin;

    if (!canDownload && product.requiresPurchase) {
      canDownload = false;
    }

    if (!canDownload) {
      return res
        .status(403)
        .json({
          message: "You don't have permission to download this product",
        });
    }

    if (
      product.downloadLimit > 0 &&
      product.downloadCount >= product.downloadLimit
    ) {
      return res.status(403).json({ message: "Download limit exceeded" });
    }

    product.downloadCount += 1;
    await product.save();

    res.json({
      downloadUrl: product.fileUrl,
      fileName: `${product.slug}.${product.fileType}`,
      fileSize: product.fileSize,
    });
  } catch (err) {
    console.error("Download product error:", err);
    res.status(500).json({ message: "Failed to process download" });
  }
});

// Create product with file upload
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  cloudinaryProductFileUpload("productFile", "shivamstack/products"),
  async (req, res) => {
    try {

 console.log('Product creation started');
      console.log('Body:', req.body);
      console.log('File:', req.cloudinaryProductFile);

      let productData = { ...req.body };

            // Parse JSON strings if needed
      if (productData.images && typeof productData.images === 'string') {
        try {
          productData.images = JSON.parse(productData.images);
        } catch (e) {
          productData.images = productData.images.split('\n').map(u => u.trim()).filter(Boolean);
        }
      }
      
      if (productData.metaKeywords && typeof productData.metaKeywords === 'string') {
        try {
          productData.metaKeywords = JSON.parse(productData.metaKeywords);
        } catch (e) {
          productData.metaKeywords = productData.metaKeywords.split(',').map(k => k.trim()).filter(Boolean);
        }
      }

      // FIX: Handle empty category - set to undefined or null
      if (!productData.category || productData.category === '') {
        delete productData.category; // Remove empty string completely
        // OR set to null if you prefer
        // productData.category = null;
      }

      // Check if slug exists
      const existing = await ProductDB.findOne({ slug: productData.slug });
      if (existing) {
        return res.status(400).json({ message: "Product slug already exists" });
      }

      // Validate category only if provided
      if (productData.category) {
        const category = await ProductCategoryDB.findById(productData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Add uploaded file info
      if (req.cloudinaryProductFile) {
        productData.fileUrl = req.cloudinaryProductFile.url;
        productData.fileSize = req.cloudinaryProductFile.fileSize;
        productData.fileType = req.cloudinaryProductFile.format;
        productData.cloudinaryPublicId = req.cloudinaryProductFile.publicId;
      }

      // Convert string booleans to actual booleans
      const booleanFields = ['isPublished', 'isDigital', 'isFree', 'requiresLogin', 'requiresPurchase'];
      booleanFields.forEach(field => {
        if (productData[field] !== undefined) {
          productData[field] = productData[field] === 'true';
        }
      });

      const product = new ProductDB({
        ...productData,
        price: parseFloat(productData.price),
        stock: parseInt(productData.stock) || 0,
        downloadLimit: parseInt(productData.downloadLimit) || 0
      });

      await product.save();


      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "Product",
        resourceId: product._id,
        metadata: { name: product.name, slug: product.slug },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Product created successfully",
        data: product,
      });
    } catch (err) {
      console.error("Create product error:", err);
      res.status(500).json({ message: "Failed to create product" });
    }
  },
);

// Update product with optional file upload
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  cloudinaryProductFileUpload("productFile", "shivamstack/products"),
  async (req, res) => {
    try {
      let productData = req.body;

      // Parse JSON strings if they came from FormData
      if (req.body.images && typeof req.body.images === "string") {
        try {
          productData.images = JSON.parse(req.body.images);
        } catch (e) {
          productData.images = req.body.images
            .split("\n")
            .map((u) => u.trim())
            .filter(Boolean);
        }
      }

      if (req.body.metaKeywords && typeof req.body.metaKeywords === "string") {
        try {
          productData.metaKeywords = JSON.parse(req.body.metaKeywords);
        } catch (e) {
          productData.metaKeywords = req.body.metaKeywords
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean);
        }
      }

      const product = await ProductDB.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Store old values for activity log
      const oldValues = {
        name: product.name,
        price: product.price,
        isPublished: product.isPublished,
        isFree: product.isFree,
      };

      // Check if slug exists for other products
      if (productData.slug && productData.slug !== product.slug) {
        const existing = await ProductDB.findOne({
          _id: { $ne: product._id },
          slug: productData.slug,
        });

        if (existing) {
          return res
            .status(400)
            .json({ message: "Product slug already exists" });
        }
      }

      // Validate category if provided
      if (
        productData.category &&
        productData.category !== product.category?.toString()
      ) {
        const category = await ProductCategoryDB.findById(productData.category);
        if (!category) {
          return res.status(400).json({ message: "Invalid category" });
        }
      }

      // Add uploaded file info to product data if new file uploaded
      if (req.cloudinaryProductFile) {
        productData.fileUrl = req.cloudinaryProductFile.url;
        productData.fileSize = req.cloudinaryProductFile.fileSize;
        productData.fileType = req.cloudinaryProductFile.format;
      }

      // Update fields
      Object.keys(productData).forEach((key) => {
        if (key !== "_id" && key !== "createdAt" && key !== "updatedAt") {
          if (key === "price") product[key] = parseFloat(productData[key]);
          else if (key === "stock" || key === "downloadLimit")
            product[key] = parseInt(productData[key]) || 0;
          else product[key] = productData[key];
        }
      });

      await product.save();

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Product",
        resourceId: product._id,
        changes: {
          before: oldValues,
          after: {
            name: product.name,
            price: product.price,
            isPublished: product.isPublished,
            isFree: product.isFree,
          },
        },
        metadata: { name: product.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Product updated successfully",
        data: product,
      });
    } catch (err) {
      console.error("Update product error:", err);
      res.status(500).json({ message: "Failed to update product" });
    }
  },
);

// Upload additional product images/files
router.post(
  "/:id/files",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  cloudinaryProductFilesUpload("files", 5, "shivamstack/products"),
  async (req, res) => {
    try {
      const product = await ProductDB.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      if (req.cloudinaryProductFiles && req.cloudinaryProductFiles.length > 0) {
        const fileUrls = req.cloudinaryProductFiles.map((f) => f.url);
        product.images = [...(product.images || []), ...fileUrls];
        await product.save();

        // FIXED: Use trackActivity instead of log
        await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
          resourceType: "Product",
          resourceId: product._id,
          metadata: {
            name: product.name,
            filesAdded: req.cloudinaryProductFiles.length,
          },
          ipAddress: req.ip,
          userAgent: req.get("User-Agent"),
        });
      }

      res.json({
        message: "Files uploaded successfully",
        files: req.cloudinaryProductFiles,
      });
    } catch (err) {
      console.error("Upload product files error:", err);
      res.status(500).json({ message: "Failed to upload files" });
    }
  },
);

// Delete product
router.delete(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const product = await ProductDB.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      await product.deleteOne();

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "Product",
        resourceId: product._id,
        metadata: { name: product.name },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Product deleted successfully" });
    } catch (err) {
      console.error("Delete product error:", err);
      res.status(500).json({ message: "Failed to delete product" });
    }
  },
);

// Bulk operations for products
router.post(
  "/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No product IDs provided" });
      }

      const result = await ProductDB.deleteMany({ _id: { $in: ids } });

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "Product",
        metadata: { count: result.deletedCount, productIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} products deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete products error:", err);
      res.status(500).json({ message: "Failed to delete products" });
    }
  },
);

router.post(
  "/bulk-update-status",
  adminAuthenticate,
  hasPermission(["manage_products"]),
  async (req, res) => {
    try {
      const { ids, isPublished } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No product IDs provided" });
      }

      const result = await ProductDB.updateMany(
        { _id: { $in: ids } },
        { $set: { isPublished } },
      );

      // FIXED: Use trackActivity instead of log
      await adminActivityService.trackActivity(req.admin._id, "BULK_UPDATE", {
        resourceType: "Product",
        metadata: {
          count: result.modifiedCount,
          action: `Set published to ${isPublished}`,
          productIds: ids,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.modifiedCount} products updated successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk update products error:", err);
      res.status(500).json({ message: "Failed to update products" });
    }
  },
);

module.exports = router;
