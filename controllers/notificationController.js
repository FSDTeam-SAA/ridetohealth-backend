const Notification = require('../models/Notification');
const { sendNotification } = require('../services/notificationService');
const logger = require('../utils/logger');

class NotificationController {
  async getNotifications(req, res) {
    try {
      const { page = 1, limit = 20 } = req.query;
      const userId = req.user.userId;

      const notifications = await Notification.find({ userId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const unreadCount = await Notification.countDocuments({ 
        userId, 
        isRead: false 
      });

      const total = await Notification.countDocuments({ userId });

      res.json({
        success: true,
        data: {
          notifications,
          unreadCount,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total
          }
        }
      });
    } catch (error) {
      logger.error('Get notifications error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  async markAsRead(req, res) {
    try {
      const { notificationId } = req.params;
      const userId = req.user.userId;

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