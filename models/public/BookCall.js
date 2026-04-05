const mongoose = require("mongoose");

// Service Schema (embedded)
const ServiceSchema = new mongoose.Schema({
  serviceId: { type: String, required: true },
  name: { type: String, required: true },
  description: { type: String },
  iconBg: { type: String }
});

// Time Slot Schema
const TimeSlotSchema = new mongoose.Schema({
  label: { type: String, required: true },
  isAvailable: { type: Boolean, default: true },
  bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_BookCall` }
});

// Daily Schedule Schema
const DailyScheduleSchema = new mongoose.Schema({
  date: { type: Date, required: true, unique: true },
  dayName: { type: String },
  isAvailable: { type: Boolean, default: true },
  isSunday: { type: Boolean, default: false },
  timeSlots: [TimeSlotSchema],
  bookings: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: `${process.env.APP_NAME}_BookCall`
  }],
  maxBookingsPerDay: { type: Number, default: 5 }
});

// Main BookCall Schema
const BookCallSchema = new mongoose.Schema(
  {
    // Booking Information
    bookingId: { 
      type: String, 
      required: true, 
      unique: true,
      default: () => `BOOK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    },
    
    // Selected Service
    selectedService: {
      serviceId: { type: String, required: true },
      name: { type: String, required: true },
      description: { type: String }
    },
    
    // Date & Time Selection
    selectedDate: {
      date: { type: Date, required: true },
      dayName: { type: String },
      month: { type: String },
      dayNum: { type: Number }
    },
    selectedTimeSlot: { type: String, required: true },
    preferredPlatform: { 
      type: String, 
      enum: ["Google Meet", "Zoom", "Microsoft Teams", "WhatsApp Video", "No preference"],
      default: "Google Meet"
    },
    
    // Client Information
    clientDetails: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String },
      company: { type: String }
    },
    
    // Project Information
    projectDetails: {
      budget: { type: String },
      message: { type: String },
      hearAbout: { type: String },
      projectDescription: { type: String }
    },
    
    // Status Tracking
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "rescheduled"],
      default: "pending"
    },
    
    // Meeting Links
    meetingLink: { type: String },
    calendarEventId: { type: String },
    
    // Follow-up Information
    followUpSent: { type: Boolean, default: false },
    followUpEmailSent: { type: Boolean, default: false },
    writtenEstimateSent: { type: Boolean, default: false },
    estimateDocumentUrl: { type: String },
    
    // Notes & Feedback
    callNotes: { type: String },
    clientFeedback: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    
    // Admin/Sales Information
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: `${process.env.APP_NAME}_User` },
    leadScore: { type: Number, default: 0 },
    conversionStatus: { 
      type: String, 
      enum: ["new", "contacted", "negotiating", "converted", "lost"],
      default: "new"
    },
    
    // Timestamps
    bookedAt: { type: Date, default: Date.now },
    confirmedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    rescheduledAt: { type: Date }
  },
  { timestamps: true }
);

// Indexes for better query performance
BookCallSchema.index({ "clientDetails.email": 1 });
BookCallSchema.index({ status: 1, "selectedDate.date": 1 });
// BookCallSchema.index({ bookingId: 1 });
BookCallSchema.index({ createdAt: -1 });

// Virtual for checking if booking is upcoming
BookCallSchema.virtual('isUpcoming').get(function() {
  return this.status === 'confirmed' && this.selectedDate.date > new Date();
});

// Virtual for checking if booking is today
BookCallSchema.virtual('isToday').get(function() {
  const today = new Date().toDateString();
  return this.selectedDate.date.toDateString() === today;
});

// Method to cancel booking
BookCallSchema.methods.cancel = async function(reason) {
  this.status = "cancelled";
  this.cancelledAt = new Date();
  if (reason) this.callNotes = reason;
  await this.save();
  return this;
};

// Method to confirm booking
BookCallSchema.methods.confirm = async function(meetingLink) {
  this.status = "confirmed";
  this.confirmedAt = new Date();
  if (meetingLink) this.meetingLink = meetingLink;
  await this.save();
  return this;
};

// Static method to get available slots for a date
BookCallSchema.statics.getAvailableSlotsForDate = async function(date, timeSlotsConfig) {
  // Create date range for the entire day
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const existingBookings = await this.find({
    "selectedDate.date": {
      $gte: startOfDay,
      $lte: endOfDay
    },
    status: { $in: ["pending", "confirmed"] }
  });
  
  const bookedSlots = existingBookings.map(b => b.selectedTimeSlot);
  return timeSlotsConfig.map(slot => ({
    ...slot,
    avail: slot.avail && !bookedSlots.includes(slot.label)
  }));
};

module.exports = mongoose.model(
  `${process.env.APP_NAME}_BookCall`,
  BookCallSchema
);

// Daily Schedule Model
const DailySchedule = mongoose.model(
  `${process.env.APP_NAME}_DailySchedule`,
  DailyScheduleSchema
);

module.exports.DailySchedule = DailySchedule;