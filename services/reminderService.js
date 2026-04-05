const cron = require('node-cron');
const BookCall = require('../models/public/BookCall');
const { sendBookingReminderEmail } = require('./emailService');

// Run every hour to check for upcoming calls
const scheduleReminders = () => {
  cron.schedule('0 * * * *', async () => {
    console.log('Checking for upcoming calls to send reminders...');
    
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    
    // Find bookings that start in about 1 hour and haven't had a reminder sent
    const upcomingBookings = await BookCall.find({
      status: "confirmed",
      "selectedDate.date": {
        $gte: now,
        $lte: oneHourFromNow
      },
      reminderSent: { $ne: true } // You'll need to add this field to schema
    });
    
    for (const booking of upcomingBookings) {
      try {
        const bookingDetails = {
          time: booking.selectedTimeSlot,
          meetingLink: booking.meetingLink || "Link will be sent shortly"
        };
        
        await sendBookingReminderEmail(
          booking.clientDetails.email,
          booking.clientDetails.name,
          bookingDetails
        );
        
        booking.reminderSent = true;
        await booking.save();
        console.log(`Reminder sent to ${booking.clientDetails.email}`);
      } catch (error) {
        console.error(`Failed to send reminder to ${booking.clientDetails.email}:`, error);
      }
    }
  });
};

module.exports = { scheduleReminders };