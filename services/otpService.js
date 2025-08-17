const twilio = require('twilio');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTP = async (contact, otp, type) => {
  try {
    if (type === 'phone') {
      await twilioClient.messages.create({
        body: `Your verification code is: ${otp}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: contact
      });
    } else if (type === 'email') {
      await emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: contact,
        subject: 'Verification Code',
        html: `
          <h2>Verification Code</h2>
          <p>Your verification code is: <strong>${otp}</strong></p>
          <p>This code will expire in 10 minutes.</p>
        `
      });
    }
    
    logger.info(`OTP sent to ${contact} via ${type}`);
  } catch (error) {
    logger.error(`Send OTP error (${type}):`, error);
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTP
};