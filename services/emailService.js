// services/emailService.js
const sgMail = require("@sendgrid/mail");
const crypto = require("crypto");

// Set SendGrid API Key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Generate OTP
const generateOTP = () => crypto.randomInt(100000, 999999).toString();

// Email templates
const emailTemplates = {
  otpVerification: (clientName, companyName, otp, expiration) => ({
    subject: `Verify Your ${companyName} Account - OTP Required`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Email Verification Required</h2>
        <p>Dear ${clientName},</p>
        <p>Thank you for registering with ${companyName}. Please verify your email using the OTP below:</p>
        <div style="font-size: 24px; font-weight: bold; margin: 20px 0;">${otp}</div>
        <p style="color: #dc2626;">⚠️ This OTP will expire in ${expiration} minutes. Do not share this code.</p>
        <p>Best regards,<br>The ${companyName} Team</p>
      </div>
    `,
  }),

  welcome: (clientName, companyName) => ({
    subject: `Welcome to ${companyName}! Your Account is Ready`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome, ${clientName}!</h2>
        <p>Your account with ${companyName} has been successfully created.</p>
        <p>You can now login: <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/login">Login Here</a></p>
        <p>Best regards,<br>The ${companyName} Team</p>
      </div>
    `,
  }),

  userRegistrationOTP: (userName, otp, website, company, expiration) => ({
    subject: `Verify Your Account - ${website} OTP Required`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Account Verification Required</h2>
        <p>Dear ${userName},</p>
        <p>Welcome to <strong>${website}</strong>! Please verify your email using the OTP below:</p>
        <div style="font-size: 24px; font-weight: bold; margin: 20px 0;">${otp}</div>
        <p style="color: #dc2626;">⚠️ This OTP will expire in ${expiration} minutes. Do not share this code.</p>
        <p>Best regards,<br>The ${website} Team</p>
      </div>
    `,
  }),

  bookingConfirmation: (clientName, bookingDetails, companyName) => ({
    subject: `Call Booking Confirmed - ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h2 style="color: white; margin: 0;">Call Booking Confirmed! 🎉</h2>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 18px;">Dear <strong>${clientName}</strong>,</p>
          <p>Your discovery call has been successfully scheduled. Here are your booking details:</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h3 style="color: #667eea; margin-top: 0;">📅 Booking Details</h3>
            <p><strong>Service:</strong> ${bookingDetails.service}</p>
            <p><strong>Date:</strong> ${bookingDetails.date}</p>
            <p><strong>Time:</strong> ${bookingDetails.time} (IST)</p>
            <p><strong>Platform:</strong> ${bookingDetails.platform}</p>
            <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
          </div>
          
          <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #2e7d32; margin-top: 0;">📝 What to Expect</h3>
            <ul style="margin: 0; padding-left: 20px;">
              <li>A 30-minute focused session about your project</li>
              <li>Technical guidance and scope definition</li>
              <li>Written estimate within 24 hours after the call</li>
              <li>No obligation or pressure to hire</li>
            </ul>
          </div>
          
          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #e65100; margin-top: 0;">🔗 Meeting Link</h3>
            <p>Your Google Meet link will be sent 15 minutes before the call.</p>
            <p>Add this to your calendar: <a href="${bookingDetails.calendarLink}" style="color: #667eea;">Click here</a></p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/booking/${bookingDetails.bookingId}" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Booking Details
            </a>
          </div>
          
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #e0e0e0;">
          
          <p style="font-size: 14px; color: #666;">Need to reschedule? Reply to this email or use the booking link above.</p>
          <p>Best regards,<br><strong>Shivam</strong><br>Full Stack Developer</p>
        </div>
      </div>
    `,
  }),

  bookingReminder: (clientName, bookingDetails, companyName) => ({
    subject: `Reminder: Your Call with ${companyName} in 1 Hour`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h2 style="color: white; margin: 0;">Call Starting Soon! ⏰</h2>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p style="font-size: 18px;">Hi <strong>${clientName}</strong>,</p>
          <p>This is a reminder that your discovery call starts in <strong>1 hour</strong>.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #667eea; margin-top: 0;">📅 Call Details</h3>
            <p><strong>Time:</strong> ${bookingDetails.time} (IST)</p>
            <p><strong>Duration:</strong> 30 minutes</p>
            <p><strong>Meeting Link:</strong> <a href="${bookingDetails.meetingLink}" style="color: #667eea;">Join Call</a></p>
          </div>
          
          <div style="background: #e3f2fd; padding: 20px; border-radius: 8px;">
            <h3 style="color: #1565c0; margin-top: 0;">💡 Quick Tips</h3>
            <ul>
              <li>Test your microphone and camera before joining</li>
              <li>Have your project brief ready (if any)</li>
              <li>Prepare your questions in advance</li>
            </ul>
          </div>
          
          <p>Click the link above to join the call when ready.</p>
          <p>Looking forward to our conversation! 🚀</p>
        </div>
      </div>
    `,
  }),

  bookingCancellation: (clientName, bookingDetails, companyName) => ({
    subject: `Booking Cancellation Confirmation - ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: #dc2626; padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h2 style="color: white; margin: 0;">Booking Cancelled</h2>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>Your booking for <strong>${bookingDetails.date} at ${bookingDetails.time}</strong> has been cancelled as requested.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Booking ID:</strong> ${bookingDetails.bookingId}</p>
            ${bookingDetails.reason ? `<p><strong>Cancellation Reason:</strong> ${bookingDetails.reason}</p>` : ""}
          </div>
          
          <p>You can book another slot anytime: <a href="${process.env.CLIENT_URL || "http://localhost:5173"}/book-call">Book New Call</a></p>
          <p>Have questions? Feel free to reply to this email.</p>
        </div>
      </div>
    `,
  }),

  followUpEstimate: (clientName, estimateDetails, companyName) => ({
    subject: `Your Project Estimate from ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%); padding: 20px; text-align: center; border-radius: 10px 10px 0 0;">
          <h2 style="color: white; margin: 0;">Project Estimate Ready! 📄</h2>
        </div>
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p>Dear <strong>${clientName}</strong>,</p>
          <p>Thank you for your time on the discovery call. Based on our discussion, I've prepared a detailed project estimate.</p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #11998e; margin-top: 0;">📊 Estimate Summary</h3>
            <p><strong>Project:</strong> ${estimateDetails.projectName}</p>
            <p><strong>Estimated Timeline:</strong> ${estimateDetails.timeline}</p>
            <p><strong>Budget Range:</strong> ${estimateDetails.budget}</p>
          </div>
          
          <div style="margin: 20px 0; text-align: center;">
            <a href="${estimateDetails.documentUrl}" 
               style="background: #11998e; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Full Estimate
            </a>
          </div>
          
          <p>I'd love to discuss this further and answer any questions you might have.</p>
          <p>Looking forward to working together! 🚀</p>
        </div>
      </div>
    `,
  }),

  bookingConfirmationAdmin: (bookingDetails, companyName) => ({
    subject: `New Booking Alert - ${companyName}`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>New Call Booking Received! 🎉</h2>
        <div style="background: #f0f0f0; padding: 20px; border-radius: 8px;">
          <p><strong>Client:</strong> ${bookingDetails.clientName}</p>
          <p><strong>Email:</strong> ${bookingDetails.clientEmail}</p>
          <p><strong>Phone:</strong> ${bookingDetails.clientPhone || "Not provided"}</p>
          <p><strong>Service:</strong> ${bookingDetails.service}</p>
          <p><strong>Date & Time:</strong> ${bookingDetails.date} at ${bookingDetails.time} IST</p>
          <p><strong>Project Description:</strong> ${bookingDetails.projectDescription || "Not provided"}</p>
        </div>
        <p><a href="${process.env.ADMIN_URL || "http://localhost:3000"}/admin/bookings/${bookingDetails.bookingId}">View in Admin Panel</a></p>
      </div>
    `,
  }),
};

// --- SEND EMAIL FUNCTION USING SENDGRID ---
const sendEmail = async (to, subject, html) => {
  try {
    const msg = {
      to, // recipient email
      from: process.env.SENDGRID_FROM_EMAIL, // single verified sender
      subject,
      html,
    };

    const result = await sgMail.send(msg);
    console.log("Email sent via SendGrid:", result[0].statusCode);
    return { success: true, statusCode: result[0].statusCode };
  } catch (error) {
    console.error(
      "Error sending email via SendGrid:",
      error.response?.body || error.message,
    );
    return { success: false, error: error.message };
  }
};

// --- HELPER FUNCTIONS ---
const sendOTPEmail = async (
  email,
  clientName,
  companyName,
  otp,
  expiration,
) => {
  const template = emailTemplates.otpVerification(
    clientName,
    companyName,
    otp,
    expiration,
  );
  return await sendEmail(email, template.subject, template.html);
};

const sendWelcomeEmail = async (email, clientName, companyName) => {
  const template = emailTemplates.welcome(clientName, companyName);
  return await sendEmail(email, template.subject, template.html);
};

const sendUserRegistrationOTP = async (
  email,
  { name, otp, website, company, expiration },
) => {
  const template = emailTemplates.userRegistrationOTP(
    name || "User",
    otp,
    website?.websiteName || "our website",
    company?.name || "our company",
    expiration,
  );

  return await sendEmail(email, template.subject, template.html);
};

// Add new email functions
const sendBookingConfirmationEmail = async (
  email,
  clientName,
  bookingDetails,
) => {
  const template = emailTemplates.bookingConfirmation(
    clientName,
    bookingDetails,
    process.env.APP_NAME || "ShivamStack",
  );
  return await sendEmail(email, template.subject, template.html);
};

const sendBookingReminderEmail = async (email, clientName, bookingDetails) => {
  const template = emailTemplates.bookingReminder(
    clientName,
    bookingDetails,
    process.env.APP_NAME || "ShivamStack",
  );
  return await sendEmail(email, template.subject, template.html);
};

const sendBookingCancellationEmail = async (
  email,
  clientName,
  bookingDetails,
) => {
  const template = emailTemplates.bookingCancellation(
    clientName,
    bookingDetails,
    process.env.APP_NAME || "ShivamStack",
  );
  return await sendEmail(email, template.subject, template.html);
};

const sendFollowUpEstimateEmail = async (
  email,
  clientName,
  estimateDetails,
) => {
  const template = emailTemplates.followUpEstimate(
    clientName,
    estimateDetails,
    process.env.APP_NAME || "ShivamStack",
  );
  return await sendEmail(email, template.subject, template.html);
};

const sendAdminBookingNotification = async (adminEmail, bookingDetails) => {
  const template = emailTemplates.bookingConfirmationAdmin(
    bookingDetails,
    process.env.APP_NAME || "ShivamStack",
  );
  return await sendEmail(adminEmail, template.subject, template.html);
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendUserRegistrationOTP,
  sendEmail,
  sendBookingConfirmationEmail,
  sendBookingReminderEmail,
  sendBookingCancellationEmail,
  sendFollowUpEstimateEmail,
  sendAdminBookingNotification,
};
