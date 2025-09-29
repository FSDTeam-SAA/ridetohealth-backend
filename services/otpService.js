const twilio = require('twilio');
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');
const { twilioAccountSid, twilioAuthToken, emailAddress, emailPass, twilioPhoneNumber } = require('../config/config');

const twilioClient = twilio(
  twilioAccountSid,
  twilioAuthToken
);

const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailAddress,
    pass: emailPass
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
        from: twilioPhoneNumber,
        to: contact
      });
    } else if (type === 'email') {
      await emailTransporter.sendMail({
        from: emailAddress,
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