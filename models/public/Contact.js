const mongoose = require("mongoose");

const ContactMessageSchema = new mongoose.Schema(
  {
    messageId: {
      type: String,
      required: true,
      unique: true,
      default: function() {
        return `MSG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
    },
    
    // Sender Information
    sender: {
      name: { type: String, required: true },
      email: { type: String, required: true },
    },
    
    // Message Details
    subject: { type: String, required: true },
    category: { 
      type: String, 
      required: true,
      enum: ["general", "support", "purchase", "refund", "collab", "bug", "privacy", "legal", "feedback", "other"]
    },
    message: { type: String, required : true },
    
    // Metadata
    status: {
      type: String,
      enum: ["unread", "read", "replied", "archived", "spam"],
      default: "unread"
    },
    
    // Admin Response
    adminResponse: {
      respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_User` },
      response: { type: String },
      respondedAt: { type: Date }
    },
    
    // Tracking
    userAgent: { type: String },
    ipAddress: { type: String },
    
    // Flags
    isUrgent: { type: Boolean, default: false },
    requiresFollowUp: { type: Boolean, default: false },
    
    // Timestamps
    readAt: { type: Date },
    repliedAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes
ContactMessageSchema.index({ "sender.email": 1 });
ContactMessageSchema.index({ status: 1 });
ContactMessageSchema.index({ category: 1 });
ContactMessageSchema.index({ createdAt: -1 });
// ContactMessageSchema.index({ messageId: 1 });

// Method to mark as read
ContactMessageSchema.methods.markAsRead = async function() {
  this.status = "read";
  this.readAt = new Date();
  await this.save();
  return this;
};

// Method to mark as replied
ContactMessageSchema.methods.markAsReplied = async function(response, adminId) {
  this.status = "replied";
  this.repliedAt = new Date();
  this.adminResponse = {
    respondedBy: adminId,
    response: response,
    respondedAt: new Date()
  };
  await this.save();
  return this;
};

module.exports = mongoose.model(
  `${process.env.APP_NAME}_ContactMessage`,
  ContactMessageSchema
);