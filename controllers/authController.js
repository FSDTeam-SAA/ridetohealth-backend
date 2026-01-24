const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Driver = require('../models/Driver');
const OTP = require('../models/OTP');
const { generateOTP, sendOTP } = require('../services/otpService');
const { validateRegister, validateLogin } = require('../validators/authValidator');
const logger = require('../utils/logger');
const { refreshTokenSecret, refreshTokenExpires } = require('../config/config');
const { uploadToCloudinary } = require("../services/cloudinaryService");
const { sendNotification } = require('../services/notificationService');
const Service = require('../models/Service');
const dotenv = require('dotenv');
const UAParser = require('ua-parser-js');
dotenv.config();


class AuthController {
  async register(req, res) {
    try {
      const { 
        fullName, 
        email, 
        phoneNumber, 
        password, 
        role = "customer",
        licenseNumber,
        nidNumber,
        serviceTypes,
        insuranceInformation
      } = req.body;

      // 1️⃣ Validate required fields
      if (!fullName || !email || !phoneNumber || !password) {
        return res.status(400).json({
          success: false,
          message: "Full name, email, phone number, and password are required."
        });
      }

      // 2️⃣ Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { phoneNumber }]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: existingUser.email === email
            ? "This email is already registered."
            : "This phone number is already registered."
        });
      }

      // 3️⃣ Driver-specific validation
      let licenseImage = null;
      let nidImage = null;
      let selfieImage = null;

      if (role === "driver") {
        // Validate driver fields
        if (!licenseNumber || !nidNumber || !serviceTypes) {
          return res.status(400).json({
            success: false,
            message: "Driver registration requires license number, NID number, and service types."
          });
        }

        // Validate driver files
        if (!req.files?.license || !req.files?.nid || !req.files?.selfie) {
          return res.status(400).json({
            success: false,
            message: "Driver registration requires all images (license, NID, selfie)."
          });
        }

        // Check unique license number
        const existingLicense = await User.findOne({ licenseNumber });
        if (existingLicense) {
          return res.status(400).json({
            success: false,
            message: "This license number is already registered."
          });
        }

        // Check unique NID number
        const existingNID = await User.findOne({ nidNumber });
        if (existingNID) {
          return res.status(400).json({
            success: false,
            message: "This NID number is already registered."
          });
        }

        // 🚀 CRITICAL: Upload images with timeout protection
        try {
          const uploadTimeout = 25000; // 25 seconds timeout
          
          const uploadPromises = Promise.all([
            uploadToCloudinary(req.files.license[0].buffer, "driver_documents"),
            uploadToCloudinary(req.files.nid[0].buffer, "driver_documents"),
            uploadToCloudinary(req.files.selfie[0].buffer, "driver_documents")
          ]);

          // Race between uploads and timeout
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Upload timeout')), uploadTimeout)
          );

          const [licenseUpload, nidUpload, selfieUpload] = await Promise.race([
            uploadPromises,
            timeoutPromise
          ]);

          // Extract URLs
          licenseImage = licenseUpload.secure_url;
          nidImage = nidUpload.secure_url;
          selfieImage = selfieUpload.secure_url;

        } catch (uploadError) {
          logger.error("Image upload error:", uploadError);
          return res.status(500).json({
            success: false,
            message: "Failed to upload images. Please try again or check your internet connection."
          });
        }
      }

      // 4️⃣ Create new user
      const user = new User({
        fullName,
        email,
        phoneNumber,
        password,
        role,
        ...(role === "driver" && {
          licenseNumber,
          licenseImage,
          nidNumber,
          nidImage,
          selfieImage,
          serviceTypes,
          insuranceInformation
        })
      });

      await user.save();

      // 5️⃣ Generate and send OTP (don't await email sending)
      const otp = generateOTP();
      
      // Send OTP without blocking
      sendOTP(email, otp, "email").catch(err => {
        logger.error("OTP email sending error:", err);
      });

      await OTP.create({
        userId: user._id,
        otp,
        type: "email_verification",
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      let notification = null;
      const service = await Service.findOne({ name: serviceTypes });

      // 6️⃣ Create driver profile if role is driver
      if (role === "driver") {
        const adminId = process.env.ADMIN_ID;
        const driver = await Driver.create({ userId: user._id, serviceId: service._id });
       
        // Send notification
        notification = await sendNotification({
          senderId: driver._id,
          receiverId: adminId,
          title: 'driver_request',
          message: `New driver request from ${user.fullName}`,
          type: 'driver_request',
          data: { adminId: adminId } // ✅ String
        });
      }

      const payload = { _id: user._id, role: user.role };

      const token = user.generateAccessToken(payload);
      const refreshToken = user.generateRefreshToken(payload);

      // 7️⃣ Send success response IMMEDIATELY
      return res.status(201).json({
        success: true,
        token,
        refreshToken,
        message: role === "driver"
          ? "Driver registered successfully. Please verify your email. Awaiting admin approval."
          : "Customer registered successfully. Please verify your email.",
        data: {
          userId: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role
        }
      });

    } catch (error) {
      logger.error("Registration error:", error);
      
      // Provide more specific error messages
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: "Validation error: " + error.message
        });
      }
      
      if (error.code === 11000) {
        return res.status(400).json({
          success: false,
          message: "Duplicate entry detected. Please check your information."
        });
      }

      return res.status(500).json({
        success: false,
        message: "Internal server error during registration."
      });
    }
  }

  async login(req, res) {
  try {
    const { error } = validateLogin(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }

    const { emailOrPhone, password, deviceInfo } = req.body; // ✅ Get deviceInfo from body

    // Find user by email or phone
    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }]
    });

    if (!user.isEmailVerified && !user.isPhoneVerified) {
      console.log("User not verified:", user._id);
      return res.status(401).json({
        success: false,
        message: 'User is not verified'
      });
    }

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is suspended'
      });
    }

    const payload = { _id: user._id, role: user.role };

    const token = user.generateAccessToken(payload);
    const refreshToken = user.generateRefreshToken(payload);

    // Save refresh token + login history
    user.refreshToken = refreshToken;

    // ✅ FIXED: Check deviceInfo from request body FIRST
    let deviceName;
    
    if (deviceInfo && deviceInfo.name) {
      // Use device info from Flutter app (iOS/Android)
      deviceName = `${deviceInfo.name} (${deviceInfo.os || ''})`.trim();
    } else {
      // Fallback to User-Agent parsing (for Postman, browsers, etc.)
      const parser = new UAParser(req.headers['user-agent']);
      const result = parser.getResult();
      
      deviceName = result.device.model || 
                  `${result.browser.name || 'Unknown Browser'} on ${result.os.name || 'Unknown OS'}`;
    }

    user.loginHistory.push({
      device: deviceName,
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    await user.save({ validateBeforeSave: false });

    // Send only one response
    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role,
          profileImage: user.profileImage,
          isEmailVerified: user.isEmailVerified,
          isPhoneVerified: user.isPhoneVerified
        }
      }
    });
  } catch (error) {
    logger.error('Login error :', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
}

  async refreshToken(req, res) {
    try {

      const { refreshToken } = req.body;

      const userId = req.user.userId;

      if (!refreshToken) throw new Error('No refresh token provided');

      const user = await User.findById(userId).select('-password');

      if (!user) throw new Error('Invalid refresh token');

      const decoded = jwt.verify(refreshToken, refreshTokenSecret);

      if (!decoded || decoded._id !== user._id.toString()) throw new Error('Invalid refresh token')

      const payload = { _id: user._id, role: user.role }

      const accessToken = user.generateAccessToken(payload);
      const newRefreshToken = user.generateRefreshToken(payload);

      user.refreshToken = newRefreshToken;
      await user.save({ validateBeforeSave: false })

      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      logger.error('Refresh token error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async verifyOTP(req, res) {
    try {
      const { email, otp, type } = req.body;
      console.log(req.body);
      const otpRecord = await OTP.findOne({
        otp,
        type,
        expiresAt: { $gt: new Date() }
      });

      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired OTP'
        });
      }

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Update verification status
      if (type === 'phone_verification') {
        user.isPhoneVerified = true;
      } else if (type === 'email_verification') {
        user.isEmailVerified = true;
      }

      await user.save();
      await OTP.deleteOne({ _id: otpRecord._id });

      res.json({
        success: true,
        message: 'OTP verified successfully',
        data: {
          isPhoneVerified: user.isPhoneVerified,
          isEmailVerified: user.isEmailVerified
        }
      });

    } catch (error) {
      logger.error('OTP verification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async changePassword(req, res) {

    const { userId: id } = req.user;

    try {
      const { currentPassword, newPassword } = req.body;

      const user = await User.findById(id).select('+password');

      if (!user || !(await user.comparePassword(currentPassword))) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } catch (error) {
      logger.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }


  async requestPasswordReset(req, res) {
    try {
      const { emailOrPhone } = req.body;

      const user = await User.findOne({
        $or: [
          { email: emailOrPhone },
          { phoneNumber: emailOrPhone }
        ]
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const otp = generateOTP();
      const isEmail = emailOrPhone.includes('@');

      await sendOTP(emailOrPhone, otp, isEmail ? 'email' : 'phone');

      await OTP.create({
        userId: user._id,
        otp,
        type: 'password_reset',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000)
      });

      res.json({
        success: true,
        message: `Password reset OTP sent to your ${isEmail ? 'email' : 'phone'}`
      });

    } catch (error) {
      logger.error('Password reset request error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { emailOrPhone, newPassword } = req.body;

      const user = await User.findOne({
        $or: [
          { email: emailOrPhone },
          { phoneNumber: emailOrPhone }
        ]
      });


      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }



      user.password = newPassword;
      await user.save();

      res.json({
        success: true,
        message: 'Password reset successfully'
      });

    } catch (error) {
      logger.error('Password reset error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async logout(req, res) {
    try {
      // In a real application, you might want to blacklist the token
      // For now, we'll just send a success response
      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      logger.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new AuthController();