const express = require("express");
const router = express.Router();
const ProductDB = require("../models/public/Product");
const ProductCategoryDB = require("../models/public/ProductCategory");

// Get all published products with optional filtering
router.get("/products", async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 12, 
            category, 
            search,
            sort = 'newest',
            type = 'all' // all, free, paid, digital
        } = req.query;
        
        const query = { isPublished: true };
        
        // Filter by category
        if (category) {
            query.category = category;
        }
        
        // Search in name and description
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { shortDescription: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Filter by type
        if (type === 'free') {
            query.isFree = true;
        } else if (type === 'paid') {
            query.isFree = false;
            query.price = { $gt: 0 };
        } else if (type === 'digital') {
            query.isDigital = true;
        }
        
        // Determine sort order
        let sortOption = {};
        switch(sort) {
            case 'newest':
                sortOption = { createdAt: -1 };
                break;
            case 'oldest':
                sortOption = { createdAt: 1 };
                break;
            case 'price-low':
                sortOption = { price: 1 };
                break;
            case 'price-high':
                sortOption = { price: -1 };
                break;
            case 'popular':
                sortOption = { downloads: -1, views: -1 };
                break;
            default:
                sortOption = { createdAt: -1 };
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const products = await ProductDB.find(query)
            .populate('category', 'name slug')
            .sort(sortOption)
            .skip(skip)
            .limit(parseInt(limit));
            
        const total = await ProductDB.countDocuments(query);
        
        // Get categories for filter sidebar
        const categories = await ProductCategoryDB.find({ isActive: true })
            .sort({ name: 1 });
        
        res.json({
            success: true,
            data: {
                products,
                categories,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                },
                filters: {
                    type,
                    sort,
                    category: category || null,
                    search: search || null
                }
            }
        });
        
    } catch (err) {
        console.error("Get public products error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch products" 
        });
    }
});

// Get single product by slug
router.get("/products/:slug", async (req, res) => {
    try {
        const product = await ProductDB.findOne({ 
            slug: req.params.slug,
            isPublished: true 
        }).populate('category', 'name slug description');
        
        if (!product) {
            return res.status(404).json({ 
                success: false, 
                message: "Product not found" 
            });
        }
        
        // Increment view count
        product.views += 1;
        await product.save();
        
        // Get related products (same category)
        const relatedProducts = await ProductDB.find({
            _id: { $ne: product._id },
            category: product.category,
            isPublished: true
        })
        .limit(4)
        .select('name slug price images isFree shortDescription');
        
        res.json({
            success: true,
            data: {
                product,
                relatedProducts
            }
        });
        
    } catch (err) {
        console.error("Get public product error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch product" 
        });
    }
});

// Get products by category slug
router.get("/categories/:slug/products", async (req, res) => {
    try {
        const { page = 1, limit = 12 } = req.query;
        
        const category = await ProductCategoryDB.findOne({ 
            slug: req.params.slug,
            isActive: true 
        });
        
        if (!category) {
            return res.status(404).json({ 
                success: false, 
                message: "Category not found" 
            });
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const products = await ProductDB.find({ 
            category: category._id,
            isPublished: true 
        })
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
        
        const total = await ProductDB.countDocuments({ 
            category: category._id,
            isPublished: true 
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
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });
        
    } catch (err) {
        console.error("Get category products error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch products" 
        });
    }
});

// Get all active categories
router.get("/categories", async (req, res) => {
    try {
        const categories = await ProductCategoryDB.find({ isActive: true })
            .sort({ name: 1 });
            
        // Get product counts for each category
        const categoriesWithCounts = await Promise.all(
            categories.map(async (category) => {
                const count = await ProductDB.countDocuments({
                    category: category._id,
                    isPublished: true
                });
                return {
                    ...category.toObject(),
                    productCount: count
                };
            })
        );
        
        res.json({
            success: true,
            data: categoriesWithCounts
        });
        
    } catch (err) {
        console.error("Get public categories error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Failed to fetch categories" 
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
                message: "Product not found" 
            });
        }
        
        // Check if product is free or requires purchase
        if (!product.isFree) {
            return res.status(403).json({ 
                success: false, 
                message: "This product requires purchase" 
            });
        }
        
        // Check download limit
        if (product.downloadLimit > 0 && product.downloadCount >= product.downloadLimit) {
            return res.status(403).json({ 
                success: false, 
                message: "Download limit exceeded" 
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
                productName: product.name
            }
        });
        
    } catch (err) {
        console.error("Download error:", err);
        res.status(500).json({ 
            success: false, 
            message: "Failed to process download" 
        });
    }
});

module.exports = router;