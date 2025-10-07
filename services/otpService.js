// utils/otpHelper.js

const nodemailer = require('nodemailer');
const twilio = require('twilio');
const logger = require('../utils/logger');
const { emailAddress, emailPass, twilioSid, twilioAuthToken, twilioPhoneNumber } = require('../config/config');

// ✅ Twilio Client
const twilioClient = twilio(twilioSid, twilioAuthToken);

// ✅ Nodemailer Transporter
const emailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: emailAddress,
    pass: emailPass
  }
});

// ✅ Generate 6-digit OTP
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ✅ Send OTP (Email or SMS)
const sendOTP = async (contact, otp, type) => {
  try {
    if (type === 'phone') {
      // 🔹 Send via Twilio SMS
      await twilioClient.messages.create({
        body: `Your verification code is: ${otp}`,
        from: twilioPhoneNumber,
        to: contact
      });
    } else if (type === 'email') {
      // 🔹 Send via Nodemailer
      await emailTransporter.sendMail({
        from: emailAddress,
        to: contact,
        subject: 'Verification Code',
        html: `
          <!DOCTYPE html>
          <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Verification Code</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  background-color: #f4f6f8;
                  font-family: Arial, sans-serif;
                }
                .container {
                  max-width: 400px;
                  margin: 40px auto;
                  background-color: #ffffff;
                  border-radius: 12px;
                  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
                  padding: 30px;
                  text-align: center;
                }
                h2 {
                  color: #333333;
                }
                p {
                  color: #555555;
                  line-height: 1.5;
                }
                .code-box {
                  display: inline-block;
                  background-color: #007bff;
                  color: #ffffff;
                  font-size: 24px;
                  font-weight: bold;
                  letter-spacing: 3px;
                  padding: 12px 20px;
                  border-radius: 8px;
                  cursor: pointer;
                  user-select: all;
                }
                .footer {
                  margin-top: 20px;
                  font-size: 12px;
                  color: #888888;
                }
              </style>
            </head>
            <body>
              <div class="container">
                <h2>Email Verification</h2>
                <p>Please use the verification code below:</p>
                <div class="code-box" id="otp">${otp}</div>
                <p>This code will expire in <strong>10 minutes</strong>.</p>
                <div class="footer">
                  <p>If you didn’t request this code, please ignore this email.</p>
                </div>
              </div>

              <!-- Optional JS: Copy to clipboard (only works in supported clients) -->
              <script>
                const codeBox = document.getElementById('otp');
                if (codeBox) {
                  codeBox.addEventListener('click', () => {
                    navigator.clipboard.writeText(codeBox.textContent)
                      .then(() => alert('Code copied to clipboard!'));
                  });
                }
              </script>
            </body>
          </html>
        `
      });
    }

    logger.info(`✅ OTP sent to ${contact} via ${type}`);
  } catch (error) {
    logger.error(`❌ Send OTP error (${type}):`, error);
    throw error;
  }
};

module.exports = {
  generateOTP,
  sendOTP
};
