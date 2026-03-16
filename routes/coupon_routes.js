// routes/users/couponRoutes.js
const express = require("express");
const router = express.Router();
const {
  adminAuthenticate,
  hasPermission,
} = require("../middleware/adminAuth");
const CouponDB = require("../models/shared/Coupon");
const adminActivityService = require("../services/adminActivityService");

// ==================== COUPON ROUTES ====================

// Get all coupons (with pagination, search, filters)
router.get("/", adminAuthenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = "",
      isActive,
      discountType,
      validFrom,
      validTill,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const query = {};

    // Search by coupon code
    if (search) {
      query.code = { $regex: search, $options: "i" };
    }

    // Filter by active status
    if (isActive !== undefined && isActive !== "") {
      query.isActive = isActive === "true";
    }

    // Filter by discount type
    if (discountType && discountType !== "") {
      query.discountType = discountType;
    }

    // Date range filters
    if (validFrom || validTill) {
      query.validFrom = {};
      if (validFrom) query.validFrom.$gte = new Date(validFrom);
      if (validTill) query.validFrom.$lte = new Date(validTill);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const coupons = await CouponDB.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CouponDB.countDocuments(query);

    res.json({
      data: coupons,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error("Get coupons error:", err);
    res.status(500).json({ message: "Failed to fetch coupons" });
  }
});

// Get single coupon
router.get("/:id", adminAuthenticate, async (req, res) => {
  try {
    const coupon = await CouponDB.findById(req.params.id);

    if (!coupon) {
      return res.status(404).json({ message: "Coupon not found" });
    }
    res.json({ data: coupon });
  } catch (err) {
    console.error("Get coupon error:", err);
    res.status(500).json({ message: "Failed to fetch coupon" });
  }
});

// Public route: Validate coupon by code (for checkout)
router.get("/validate/:code", async (req, res) => {
  try {
    const { code } = req.params;
    const { cartTotal } = req.query;

    const coupon = await CouponDB.findOne({
      code: code.toUpperCase(),
      isActive: true,
      validFrom: { $lte: new Date() },
      $or: [
        { validTill: { $exists: false } },
        { validTill: null },
        { validTill: { $gte: new Date() } }
      ]
    });

    if (!coupon) {
      return res.status(404).json({ 
        valid: false,
        message: "Invalid or expired coupon code" 
      });
    }

    // Check if max uses reached
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
      return res.status(400).json({ 
        valid: false,
        message: "This coupon has reached its maximum usage limit" 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (parseFloat(cartTotal) * coupon.discountValue) / 100;
    } else {
      discountAmount = coupon.discountValue;
    }

    res.json({
      valid: true,
      data: {
        _id: coupon._id,
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount,
        usedCount: coupon.usedCount,
        maxUses: coupon.maxUses
      }
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    res.status(500).json({ message: "Failed to validate coupon" });
  }
});

// Create coupon
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_coupons"]),
  async (req, res) => {
    try {
      console.log('Coupon creation started');
      console.log('Body:', req.body);

      let couponData = { ...req.body };

      // Convert code to uppercase
      if (couponData.code) {
        couponData.code = couponData.code.toUpperCase().trim();
      }

      // Check if coupon code exists
      const existing = await CouponDB.findOne({ code: couponData.code });
      if (existing) {
        return res.status(400).json({ message: "Coupon code already exists" });
      }

      // Parse numeric values
      couponData.discountValue = parseFloat(couponData.discountValue);
      couponData.maxUses = parseInt(couponData.maxUses) || 1;
      couponData.usedCount = 0;

      // Handle dates
      if (couponData.validFrom) {
        couponData.validFrom = new Date(couponData.validFrom);
      }
      if (couponData.validTill) {
        couponData.validTill = new Date(couponData.validTill);
      }

      // Convert string booleans to actual booleans
      if (couponData.isActive !== undefined) {
        couponData.isActive = couponData.isActive === 'true';
      }

      const coupon = new CouponDB(couponData);
      await coupon.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "Coupon",
        resourceId: coupon._id,
        metadata: { 
          code: coupon.code,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Coupon created successfully",
        data: coupon,
      });
    } catch (err) {
      console.error("Create coupon error:", err);
      res.status(500).json({ message: "Failed to create coupon" });
    }
  },
);

// Update coupon
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_coupons"]),
  async (req, res) => {
    try {
      let couponData = req.body;

      const coupon = await CouponDB.findById(req.params.id);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }

      // Store old values for activity log
      const oldValues = {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        isActive: coupon.isActive,
        maxUses: coupon.maxUses
      };

      // Check if code exists for other coupons
      if (couponData.code && couponData.code.toUpperCase().trim() !== coupon.code) {
        const newCode = couponData.code.toUpperCase().trim();
        const existing = await CouponDB.findOne({
          _id: { $ne: coupon._id },
          code: newCode,
        });

        if (existing) {
          return res.status(400).json({ message: "Coupon code already exists" });
        }
        couponData.code = newCode;
      }

      // Update fields
      const updatableFields = ['code', 'discountType', 'discountValue', 'maxUses', 'validFrom', 'validTill', 'isActive'];
      
      updatableFields.forEach(field => {
        if (couponData[field] !== undefined) {
          if (field === 'discountValue') {
            coupon[field] = parseFloat(couponData[field]);
          } else if (field === 'maxUses') {
            coupon[field] = parseInt(couponData[field]) || 1;
          } else if (field === 'validFrom' || field === 'validTill') {
            coupon[field] = couponData[field] ? new Date(couponData[field]) : null;
          } else if (field === 'isActive' && typeof couponData[field] === 'string') {
            coupon[field] = couponData[field] === 'true';
          } else {
            coupon[field] = couponData[field];
          }
        }
      });

      await coupon.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Coupon",
        resourceId: coupon._id,
        changes: {
          before: oldValues,
          after: {
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            isActive: coupon.isActive,
            maxUses: coupon.maxUses
          },
        },
        metadata: { code: coupon.code },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Coupon updated successfully",
        data: coupon,
      });
    } catch (err) {
      console.error("Update coupon error:", err);
      res.status(500).json({ message: "Failed to update coupon" });
    }
  },
);

// Delete coupon
router.delete(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_coupons"]),
  async (req, res) => {
    try {
      const coupon = await CouponDB.findById(req.params.id);
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }

      await coupon.deleteOne();

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "Coupon",
        resourceId: coupon._id,
        metadata: { code: coupon.code },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: "Coupon deleted successfully" });
    } catch (err) {
      console.error("Delete coupon error:", err);
      res.status(500).json({ message: "Failed to delete coupon" });
    }
  },
);

// Increment coupon usage (call this when coupon is applied in order)
router.post(
  "/:id/use",
  adminAuthenticate,
  hasPermission(["manage_orders"]),
  async (req, res) => {
    try {
      const coupon = await CouponDB.findById(req.params.id);
      
      if (!coupon) {
        return res.status(404).json({ message: "Coupon not found" });
      }

      // Check if coupon is still valid
      if (!coupon.isActive) {
        return res.status(400).json({ message: "Coupon is not active" });
      }

      if (coupon.validTill && new Date(coupon.validTill) < new Date()) {
        return res.status(400).json({ message: "Coupon has expired" });
      }

      if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
        return res.status(400).json({ message: "Coupon usage limit reached" });
      }

      coupon.usedCount += 1;
      await coupon.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "Coupon",
        resourceId: coupon._id,
        metadata: { 
          code: coupon.code,
          action: "increment_usage",
          newCount: coupon.usedCount
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Coupon usage incremented successfully",
        data: { usedCount: coupon.usedCount }
      });
    } catch (err) {
      console.error("Increment coupon usage error:", err);
      res.status(500).json({ message: "Failed to increment coupon usage" });
    }
  },
);

// Bulk delete coupons
router.post(
  "/bulk-delete",
  adminAuthenticate,
  hasPermission(["manage_coupons"]),
  async (req, res) => {
    try {
      const { ids } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No coupon IDs provided" });
      }

      const result = await CouponDB.deleteMany({ _id: { $in: ids } });

      await adminActivityService.trackActivity(req.admin._id, "BULK_DELETE", {
        resourceType: "Coupon",
        metadata: { count: result.deletedCount, couponIds: ids },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.deletedCount} coupons deleted successfully`,
        deletedCount: result.deletedCount,
      });
    } catch (err) {
      console.error("Bulk delete coupons error:", err);
      res.status(500).json({ message: "Failed to delete coupons" });
    }
  },
);

// Bulk update coupons status
router.post(
  "/bulk-update-status",
  adminAuthenticate,
  hasPermission(["manage_coupons"]),
  async (req, res) => {
    try {
      const { ids, isActive } = req.body;

      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ message: "No coupon IDs provided" });
      }

      const result = await CouponDB.updateMany(
        { _id: { $in: ids } },
        { $set: { isActive: isActive === true } },
      );

      await adminActivityService.trackActivity(req.admin._id, "BULK_UPDATE", {
        resourceType: "Coupon",
        metadata: {
          count: result.modifiedCount,
          action: `Set active to ${isActive}`,
          couponIds: ids,
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: `${result.modifiedCount} coupons updated successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (err) {
      console.error("Bulk update coupons error:", err);
      res.status(500).json({ message: "Failed to update coupons" });
    }
  },
);

// Get coupon statistics
router.get(
  "/stats/summary",
  adminAuthenticate,
  hasPermission(["view_coupons"]),
  async (req, res) => {
    try {
      const now = new Date();
      
      const [
        totalCoupons,
        activeCoupons,
        expiredCoupons,
        totalUses,
        mostUsedCoupons
      ] = await Promise.all([
        CouponDB.countDocuments(),
        CouponDB.countDocuments({
          isActive: true,
          $or: [
            { validTill: { $exists: false } },
            { validTill: null },
            { validTill: { $gte: now } }
          ]
        }),
        CouponDB.countDocuments({
          validTill: { $lt: now }
        }),
        CouponDB.aggregate([
          { $group: { _id: null, total: { $sum: "$usedCount" } } }
        ]),
        CouponDB.find()
          .sort({ usedCount: -1 })
          .limit(5)
          .select('code usedCount discountType discountValue')
      ]);

      res.json({
        data: {
          totalCoupons,
          activeCoupons,
          expiredCoupons,
          totalUses: totalUses[0]?.total || 0,
          mostUsedCoupons
        }
      });
    } catch (err) {
      console.error("Get coupon stats error:", err);
      res.status(500).json({ message: "Failed to fetch coupon statistics" });
    }
  }
);

module.exports = router;