const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { generateOTP, sendOTP } = require('../services/otpService');
const { validateRegister, validateLogin } = require('../validators/authValidator');
const logger = require('../utils/logger');
const { refreshTokenSecrete, refreshTokenExpires } = require('../config/config');


class AuthController {
  async register(req, res) {
    try {
      const { error } = validateRegister(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: error.details[0].message
        });
      }

      const { fullName, email, phoneNumber, password, role = 'customer' } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { phoneNumber }]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email or phone number'
        });
      }

      // Create new user
      const user = new User({
        fullName,
        email,
        phoneNumber,
        password,
        role
      });

      await user.save();

      // Generate and send OTP for phone verification
      // const otp = generateOTP();
      // await sendOTP(phoneNumber, otp, 'phone');

      // // Save OTP to database
      // await OTP.create({
      //   userId: user._id,
      //   otp,
      //   type: 'phone_verification',
      //   expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      // });

      // Generate and send OTP for email verification
      const otp = generateOTP();
      await sendOTP(email, otp, 'email');

      // Save OTP to database
      await OTP.create({
        userId: user._id,
        otp,
        type: 'email_verification',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
      });


      res.status(201).json({
        success: true,
        message: 'User registered successfully. Please verify your email.',
        data: {
          userId: user._id,
          fullName: user.fullName,
          email: user.email,
          phoneNumber: user.phoneNumber,
          role: user.role
        }
      });

    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
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

      const { emailOrPhone, password } = req.body;

      // Find user by email or phone
      const user = await User.findOne({
        $or: [{ email: emailOrPhone }, { phoneNumber: emailOrPhone }]
      });

      if (!user.isEmailVerified && !user.isPhoneVerified) {
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
      user.loginHistory.push({
        device: req.headers['user-agent'],
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
      logger.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
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

      const decoded = jwt.verify(refreshToken, refreshTokenSecrete);

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

      const otpRecord = await OTP.findOne({
        otp,
        type,
        expiresAt: { $gt: new Date() }
      });


      console.log(otpRecord);

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