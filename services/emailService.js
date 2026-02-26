// services/emailService.js
const sgMail = require('@sendgrid/mail');
const crypto = require('crypto');

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
    `
  }),

  welcome: (clientName, companyName) => ({
    subject: `Welcome to ${companyName}! Your Account is Ready`,
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome, ${clientName}!</h2>
        <p>Your account with ${companyName} has been successfully created.</p>
        <p>You can now login: <a href="${process.env.CLIENT_URL || 'http://localhost:5173'}/login">Login Here</a></p>
        <p>Best regards,<br>The ${companyName} Team</p>
      </div>
    `
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
    `
  })
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
    console.log('Email sent via SendGrid:', result[0].statusCode);
    return { success: true, statusCode: result[0].statusCode };
  } catch (error) {
    console.error('Error sending email via SendGrid:', error.response?.body || error.message);
    return { success: false, error: error.message };
  }
};

// --- HELPER FUNCTIONS ---
const sendOTPEmail = async (email, clientName, companyName, otp, expiration) => {
  const template = emailTemplates.otpVerification(clientName, companyName, otp, expiration);
  return await sendEmail(email, template.subject, template.html);
};

const sendWelcomeEmail = async (email, clientName, companyName) => {
  const template = emailTemplates.welcome(clientName, companyName);
  return await sendEmail(email, template.subject, template.html);
};

const sendUserRegistrationOTP = async (email, { name, otp, website, company, expiration }) => {
  const template = emailTemplates.userRegistrationOTP(
    name || 'User',
    otp,
    website?.websiteName || 'our website',
    company?.name || 'our company',
    expiration
  );

  return await sendEmail(email, template.subject, template.html);
};

module.exports = {
  generateOTP,
  sendOTPEmail,
  sendWelcomeEmail,
  sendUserRegistrationOTP,
  sendEmail
};
