const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');

class NotificationController {

 async sendNotification(req, res) {
    try {
      const { receiverId, title, message, type } = req.body;
      const senderId = req.user.userId;

      const notification = await sendNotification({
        senderId,
        receiverId,
        title,
        message,
        type,
      });

      // console.log('Notification sent:', notification);

      res.json({
        success: true,
        message: 'Notification sent successfully',
        notification,
      });
    } catch (error) {
      logger.error('Send notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }

 async getNotifications(req, res) {
    try {
      const userId = req.user.userId; // logged-in user
      const { page = 1, limit = 10 } = req.query;

      // Fetch notifications where user is either sender or receiver
      const filter = {
        $or: [
          { senderId: userId },
          { receiverId: userId }
        ]
      };

      const notifications = await Notification.find(filter)
        .populate("senderId", "fullName profileImage")    // sender details
        .populate("receiverId", "fullName profileImage")  // receiver details
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .skip((parseInt(page) - 1) * parseInt(limit));

      const total = await Notification.countDocuments(filter);

      res.json({
        success: true,
        data: {
          notifications,
          pagination: {
            current: parseInt(page),
            pages: Math.ceil(total / parseInt(limit)),
            total
          }
        }
      });

    } catch (error) {
      logger.error("Get notifications error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error"
      });
    }
  }


  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user._id;

      await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { isRead: true }
      );

      res.json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      logger.error('Mark notification as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async markAllAsRead(req, res) {
    try {
      const userId = req.user.userId;

      await Notification.updateMany(
        { userId, isRead: false },
        { isRead: true }
      );

      res.json({
        success: true,
        message: 'All notifications marked as read'
      });
    } catch (error) {
      logger.error('Mark all notifications as read error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async deleteNotification(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.userId;

      await Notification.findOneAndDelete({ _id: notificationId, userId });

      res.json({
        success: true,
        message: 'Notification deleted successfully'
      });
    } catch (error) {
      logger.error('Delete notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async sendBulkNotification(req, res) {
    try {
      const { title, message, userType, specificUsers } = req.body;

      let targetUsers = [];

      if (specificUsers && specificUsers.length > 0) {
        targetUsers = specificUsers;
      } else if (userType) {
        const User = require('../models/User');
        const users = await User.find({ role: userType }).select('_id');
        targetUsers = users.map(user => user._id);
      }

      // Send notifications to all target users
      const notificationPromises = targetUsers.map(userId =>
        sendNotification(userId, {
          title,
          message,
          type: 'system'
        })
      );

      await Promise.all(notificationPromises);

      res.json({
        success: true,
        message: `Notification sent to ${targetUsers.length} users`,
        data: { sentTo: targetUsers.length }
      });
    } catch (error) {
      logger.error('Send bulk notification error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

module.exports = new NotificationController();