// routes/admin/CaseStudiesRoutes.js
// ─────────────────────────────────────────────────────────────
// Shivam Web Stack — Admin Case Studies API
// Mount: app.use("/api/admin/case-studies", CaseStudiesRoutes);
// ─────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();

const {
  adminAuthenticate,
  hasPermission,
} = require("../middleware/adminAuth");

const CaseStudyDB = require("../models/public/CaseStudies"); // adjust path as needed
const adminActivityService = require("../services/adminActivityService");

// ─── Helper: auto-generate slug ──────────────────────────────
const toSlug = (str) =>
  str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// ══════════════════════════════════════════════════════════════
// GET /api/admin/case-studies/stats
// Returns aggregate counts for the dashboard header cards
// ══════════════════════════════════════════════════════════════
router.get("/stats", adminAuthenticate, async (req, res) => {
  try {
    const [total, published, featured, completed, inProgress, planned] =
      await Promise.all([
        CaseStudyDB.countDocuments(),
        CaseStudyDB.countDocuments({ isPublished: true }),
        CaseStudyDB.countDocuments({ isFeatured: true }),
        CaseStudyDB.countDocuments({ status: "completed" }),
        CaseStudyDB.countDocuments({ status: "in-progress" }),
        CaseStudyDB.countDocuments({ status: "planned" }),
      ]);

    res.json({
      data: { total, published, featured, completed, inProgress, planned },
    });
  } catch (err) {
    console.error("Case study stats error:", err);
    res.status(500).json({ message: "Failed to fetch case study stats" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/admin/case-studies
// List with pagination, search, sort, and filter
// ══════════════════════════════════════════════════════════════
router.get("/", adminAuthenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sort = "createdAt",
      order = "desc",
      status,
      isFeatured,
      isPublished,
    } = req.query;

    const query = {};

    // Full-text search
    if (search.trim()) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { tagline: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { tags: { $elemMatch: { $regex: search, $options: "i" } } },
        { technologies: { $elemMatch: { $regex: search, $options: "i" } } },
        { client: { $regex: search, $options: "i" } },
      ];
    }

    if (status) query.status = status;

    if (isFeatured !== undefined && isFeatured !== "") {
      query.isFeatured = isFeatured === "true";
    }

    if (isPublished !== undefined && isPublished !== "") {
      query.isPublished = isPublished === "true";
    }

    // Whitelist sortable fields
    const ALLOWED_SORT = ["createdAt", "updatedAt", "priority", "views", "title", "status"];
    const sortField = ALLOWED_SORT.includes(sort) ? sort : "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = Math.min(parseInt(limit), 100); // cap at 100

    const [caseStudies, total] = await Promise.all([
      CaseStudyDB.find(query)
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limitNum)
        .select("-__v"),
      CaseStudyDB.countDocuments(query),
    ]);

    res.json({
      data: caseStudies,
      pagination: {
        page: parseInt(page),
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum),
      },
    });
  } catch (err) {
    console.error("List case studies error:", err);
    res.status(500).json({ message: "Failed to fetch case studies" });
  }
});

// ══════════════════════════════════════════════════════════════
// GET /api/admin/case-studies/:id
// Single case study by MongoDB ObjectId
// ══════════════════════════════════════════════════════════════
router.get("/:id", adminAuthenticate, async (req, res) => {
  try {
    const cs = await CaseStudyDB.findById(req.params.id).select("-__v");
    if (!cs) {
      return res.status(404).json({ message: "Case study not found" });
    }
    res.json({ data: cs });
  } catch (err) {
    console.error("Get case study error:", err);
    res.status(500).json({ message: "Failed to fetch case study" });
  }
});

// ══════════════════════════════════════════════════════════════
// POST /api/admin/case-studies
// Create a new case study
// ══════════════════════════════════════════════════════════════
router.post(
  "/",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const {
        title, slug, tagline, description,
        challenge, solution, outcome, lessonsLearned,
        client, startDate, endDate, status,
        mainImage, images,
        demoUrl, repoUrl, clientUrl,
        tags, technologies,
        relatedProject,
        isFeatured, priority,
        metaTitle, metaDescription, metaKeywords,
        isPublished, requiresLogin,
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ message: "Title is required" });
      }

      // Build slug (use provided or auto-generate)
      const finalSlug = (slug || toSlug(title)).trim();

      // Slug uniqueness check
      const exists = await CaseStudyDB.findOne({ slug: finalSlug });
      if (exists) {
        return res
          .status(400)
          .json({ message: `Slug "${finalSlug}" is already taken. Please use a different title or slug.` });
      }

      const cs = new CaseStudyDB({
        title: title.trim(),
        slug: finalSlug,
        tagline,
        description,
        challenge,
        solution,
        outcome,
        lessonsLearned,
        client,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        status: status || "planned",
        mainImage,
        images: images || [],
        demoUrl,
        repoUrl,
        clientUrl,
        tags: tags || [],
        technologies: technologies || [],
        relatedProject: relatedProject || undefined,
        isFeatured: isFeatured ?? false,
        priority: priority ?? 0,
        metaTitle: metaTitle || title.trim(),
        metaDescription,
        metaKeywords: metaKeywords || [],
        isPublished: isPublished ?? true,
        requiresLogin: requiresLogin ?? false,
      });

      await cs.save();

      await adminActivityService.trackActivity(req.admin._id, "CREATE", {
        resourceType: "CaseStudy",
        resourceId: cs._id,
        metadata: { title: cs.title, slug: cs.slug, status: cs.status },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.status(201).json({
        message: "Case study created successfully",
        data: cs,
      });
    } catch (err) {
      console.error("Create case study error:", err);
      if (err.code === 11000) {
        return res.status(400).json({ message: "A case study with this slug already exists." });
      }
      res.status(500).json({ message: "Failed to create case study" });
    }
  }
);

// ══════════════════════════════════════════════════════════════
// PUT /api/admin/case-studies/:id
// Update an existing case study (partial or full update)
// ══════════════════════════════════════════════════════════════
router.put(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const cs = await CaseStudyDB.findById(req.params.id);
      if (!cs) {
        return res.status(404).json({ message: "Case study not found" });
      }

      const {
        title, slug, tagline, description,
        challenge, solution, outcome, lessonsLearned,
        client, startDate, endDate, status,
        mainImage, images,
        demoUrl, repoUrl, clientUrl,
        tags, technologies,
        relatedProject,
        isFeatured, priority,
        metaTitle, metaDescription, metaKeywords,
        isPublished, requiresLogin,
      } = req.body;

      // Slug uniqueness check (only if slug is being changed)
      if (slug && slug !== cs.slug) {
        const slugTaken = await CaseStudyDB.findOne({
          slug,
          _id: { $ne: cs._id },
        });
        if (slugTaken) {
          return res
            .status(400)
            .json({ message: `Slug "${slug}" is already taken.` });
        }
        cs.slug = slug;
      }

      // Update only provided fields
      if (title !== undefined) cs.title = title.trim();
      if (tagline !== undefined) cs.tagline = tagline;
      if (description !== undefined) cs.description = description;
      if (challenge !== undefined) cs.challenge = challenge;
      if (solution !== undefined) cs.solution = solution;
      if (outcome !== undefined) cs.outcome = outcome;
      if (lessonsLearned !== undefined) cs.lessonsLearned = lessonsLearned;
      if (client !== undefined) cs.client = client;
      if (startDate !== undefined) cs.startDate = startDate || undefined;
      if (endDate !== undefined) cs.endDate = endDate || undefined;
      if (status !== undefined) cs.status = status;
      if (mainImage !== undefined) cs.mainImage = mainImage;
      if (images !== undefined) cs.images = images;
      if (demoUrl !== undefined) cs.demoUrl = demoUrl;
      if (repoUrl !== undefined) cs.repoUrl = repoUrl;
      if (clientUrl !== undefined) cs.clientUrl = clientUrl;
      if (tags !== undefined) cs.tags = tags;
      if (technologies !== undefined) cs.technologies = technologies;
      if (relatedProject !== undefined) cs.relatedProject = relatedProject || undefined;
      if (isFeatured !== undefined) cs.isFeatured = isFeatured;
      if (priority !== undefined) cs.priority = priority;
      if (metaTitle !== undefined) cs.metaTitle = metaTitle;
      if (metaDescription !== undefined) cs.metaDescription = metaDescription;
      if (metaKeywords !== undefined) cs.metaKeywords = metaKeywords;
      if (isPublished !== undefined) cs.isPublished = isPublished;
      if (requiresLogin !== undefined) cs.requiresLogin = requiresLogin;

      await cs.save();

      await adminActivityService.trackActivity(req.admin._id, "UPDATE", {
        resourceType: "CaseStudy",
        resourceId: cs._id,
        metadata: {
          title: cs.title,
          slug: cs.slug,
          changes: Object.keys(req.body),
        },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({
        message: "Case study updated successfully",
        data: cs,
      });
    } catch (err) {
      console.error("Update case study error:", err);
      if (err.code === 11000) {
        return res.status(400).json({ message: "Slug conflict — use a different slug." });
      }
      res.status(500).json({ message: "Failed to update case study" });
    }
  }
);

// ══════════════════════════════════════════════════════════════
// DELETE /api/admin/case-studies/:id
// Hard-delete a case study
// ══════════════════════════════════════════════════════════════
router.delete(
  "/:id",
  adminAuthenticate,
  hasPermission(["manage_projects"]),
  async (req, res) => {
    try {
      const cs = await CaseStudyDB.findByIdAndDelete(req.params.id);
      if (!cs) {
        return res.status(404).json({ message: "Case study not found" });
      }

      await adminActivityService.trackActivity(req.admin._id, "DELETE", {
        resourceType: "CaseStudy",
        resourceId: req.params.id,
        metadata: { title: cs.title, slug: cs.slug },
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
      });

      res.json({ message: `Case study "${cs.title}" deleted successfully` });
    } catch (err) {
      console.error("Delete case study error:", err);
      res.status(500).json({ message: "Failed to delete case study" });
    }
  }
);

module.exports = router;