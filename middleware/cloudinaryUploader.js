// middleware/cloudinary/cloudinaryUploader.js
const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const { v4: uuidv4 } = require("uuid");

const CloudinaryDB = process.env.CLOUDINARY_CLOUD_NAME;
const CloudinaryAPIKey = process.env.CLOUDINARY_API_KEY;
const CloudinarySecret = process.env.CLOUDINARY_API_SECRET;

cloudinary.config({
  cloud_name: CloudinaryDB,
  api_key: CloudinaryAPIKey,
  api_secret: CloudinarySecret,
  secure: true,
});

// Use memory storage for buffer access
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter(req, file, cb) {
    if (!file.originalname.match(/\.(jpg|jpeg|png|pdf)$/)) {
      return cb(
        new Error("Only .jpg, .jpeg, .png, and .pdf files are allowed"),
      );
    }
    cb(null, true);
  },
});

// Utility: Buffer -> Data URI
const bufferToDataURI = (file) => {
  const b64 = file.buffer.toString("base64");
  return `data:${file.mimetype};base64,${b64}`;
};

// Single file upload middleware
const cloudinarySingleUpload = (fieldName, folder = "default_folder") => [
  upload.single(fieldName),
  async (req, res, next) => {
    try {
      if (!req.file) return next(); // No file to upload

      // Check if Cloudinary is configured
      if (
        !cloudinary.config().cloud_name ||
        !cloudinary.config().api_key ||
        !cloudinary.config().api_secret
      ) {
        throw new Error(
          "Cloudinary configuration is missing. Please check your environment variables.",
        );
      }

      const file = req.file;
      const dataUri = bufferToDataURI(file);

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder,
        resource_type: "auto",
        public_id: `${fieldName}-${uuidv4()}`,
        timeout: 30000, // 30 second timeout
      });

      req.cloudinaryFile = {
        data: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        format: uploadResult.format,
        originalName: file.originalname,
        contentType: file.mimetype,
      };

      next();
    } catch (err) {
      console.error("Cloudinary Single Upload Error:", err);

      // Provide more specific error messages
      let errorMessage = "File upload failed";
      let statusCode = 500;

      if (
        err.message.includes("api_key") ||
        err.message.includes("configuration")
      ) {
        errorMessage =
          "File upload service is temporarily unavailable. Please try again later.";
        statusCode = 503;
      } else if (err.message.includes("timeout")) {
        errorMessage = "File upload timed out. Please try again.";
        statusCode = 408;
      } else if (err.message.includes("file size")) {
        errorMessage = "File too large. Maximum size is 10MB.";
        statusCode = 400;
      }

      return res.status(statusCode).json({
        success: false,
        message: errorMessage,
        errorCode: "FILE_UPLOAD_ERROR",
        ...(process.env.NODE_ENV === "development" && { details: err.message }),
      });
    }
  },
];

// Multiple file upload middleware
const cloudinaryMultiUpload = (fieldsArray, folder = "default_folder") => [
  upload.fields(fieldsArray),
  async (req, res, next) => {
    try {
      const files = req.files;
      req.cloudinaryFiles = {};

      // Check if Cloudinary is configured
      if (
        !cloudinary.config().cloud_name ||
        !cloudinary.config().api_key ||
        !cloudinary.config().api_secret
      ) {
        throw new Error("Cloudinary configuration is missing");
      }

      for (const field in files) {
        req.cloudinaryFiles[field] = [];

        for (const file of files[field]) {
          const dataUri = bufferToDataURI(file);
          const uploadResult = await cloudinary.uploader.upload(dataUri, {
            folder,
            resource_type: "auto",
            public_id: `${field}-${uuidv4()}`,
            timeout: 30000,
          });

          req.cloudinaryFiles[field].push({
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            format: uploadResult.format,
            originalName: file.originalname,
            contentType: file.mimetype,
          });
        }
      }

      next();
    } catch (err) {
      console.error("Cloudinary Multi Upload Error:", err);
      res.status(500).json({
        success: false,
        error: "File upload failed",
        errorCode: "FILE_UPLOAD_ERROR",
      });
    }
  },
];

// ==================== NEW PRODUCT FILE UPLOAD FUNCTION ====================
// This is specifically for product files (PDFs, etc.) - doesn't affect existing uploads

const cloudinaryProductFileUpload = (
  fieldName,
  folder = "shivamstack/products",
) => [
  upload.single(fieldName),
  async (req, res, next) => {
    try {
      if (!req.file) return next();

      // Check Cloudinary config
      if (
        !cloudinary.config().cloud_name ||
        !cloudinary.config().api_key ||
        !cloudinary.config().api_secret
      ) {
        throw new Error("Cloudinary configuration is missing");
      }

      const file = req.file;
      console.log("Uploading file:", {
        originalName: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      });

      const dataUri = bufferToDataURI(file);

      // Determine resource type
      const resourceType = file.mimetype === "application/pdf" ? "raw" : "auto";

      const safeName = file.originalname
        .replace(".pdf", "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "-");
      // Generate public_id WITHOUT extension
      const publicId = `${safeName}`;

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: folder,
        resource_type: resourceType,
        public_id: publicId,
        type: "upload",
        access_mode: "public", // CRITICAL: This makes it publicly accessible
        timeout: 60000,
        // Add these options for raw files
        ...(file.mimetype === "application/pdf" && {
          flags: "attachment", // Forces download instead of browser preview
          use_filename: false, // Don't use original filename
          unique_filename: true, // Ensure unique filename
        }),
      });

      console.log("Upload successful:", {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
        access_mode: uploadResult.access_mode || "public", // Should show 'public'
      });

      // Optional: Verify the file is accessible
      try {
        // Check the actual resource to confirm access mode
        const resource = await cloudinary.api.resource(uploadResult.public_id, {
          resource_type: resourceType,
        });
        console.log("Resource access mode:", resource.access_mode);

        // If access_mode is not 'public', update it
        if (resource.access_mode !== "public") {
          await cloudinary.uploader.update(uploadResult.public_id, {
            resource_type: resourceType,
            access_mode: "public",
            type: "upload",
          });
          console.log("Updated access_mode to public");
        }
      } catch (verifyErr) {
        console.error("Verification failed:", verifyErr);
      }

      req.cloudinaryProductFile = {
        url: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        format:
          uploadResult.format ||
          (file.mimetype === "application/pdf" ? "pdf" : ""),
        originalName: file.originalname,
        contentType: file.mimetype,
        fileSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
        resourceType: resourceType,
      };

      next();
    } catch (err) {
      console.error("Cloudinary Product File Upload Error:", err);
      return res.status(err.http_code || 500).json({
        success: false,
        message: "File upload failed",
        error: err.message,
        errorCode: "PRODUCT_FILE_UPLOAD_ERROR",
      });
    }
  },
];

// Multiple product files upload (for multiple PDFs or images)
const cloudinaryProductFilesUpload = (
  fieldName,
  maxCount = 5,
  folder = "shivamstack/products",
) => [
  upload.array(fieldName, maxCount),
  async (req, res, next) => {
    try {
      if (!req.files || req.files.length === 0) return next();

      // Check if Cloudinary is configured
      if (
        !cloudinary.config().cloud_name ||
        !cloudinary.config().api_key ||
        !cloudinary.config().api_secret
      ) {
        throw new Error("Cloudinary configuration is missing");
      }

      req.cloudinaryProductFiles = [];

      for (const file of req.files) {
        const dataUri = bufferToDataURI(file);

        let resourceType = "auto";
        if (file.mimetype === "application/pdf") {
          resourceType = "raw";
        }

        const uploadResult = await cloudinary.uploader.upload(dataUri, {
          folder,
          resource_type: resourceType,
          public_id: `product-${uuidv4()}`,
          timeout: 60000,
          ...(file.mimetype === "application/pdf" && {
            format: "pdf",
            flags: "attachment",
          }),
        });

        req.cloudinaryProductFiles.push({
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id,
          format: uploadResult.format,
          originalName: file.originalname,
          contentType: file.mimetype,
          fileSize: (file.size / (1024 * 1024)).toFixed(2) + " MB",
          resourceType: resourceType,
        });
      }

      next();
    } catch (err) {
      console.error("Cloudinary Multiple Product Files Upload Error:", err);
      res.status(500).json({
        success: false,
        message: "File upload failed",
        errorCode: "PRODUCT_FILES_UPLOAD_ERROR",
      });
    }
  },
];

module.exports = {
  cloudinarySingleUpload,
  cloudinaryMultiUpload,
  cloudinaryProductFileUpload,
  cloudinaryProductFilesUpload,
};
