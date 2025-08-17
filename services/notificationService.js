const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');

const sendNotification = async (userId, notificationData) => {
  try {
    // Create notification in database
    const notification = new Notification({
      userId,
      ...notificationData
    });
    await notification.save();

    // Get user notification settings
    const user = await User.findById(userId).select('notificationSettings');
    if (!user) return;

    // Here you would integrate with push notification services
    // like Firebase Cloud Messaging, Apple Push Notifications, etc.
    
    logger.info(`Notification sent to user ${userId}: ${notificationData.title}`);
    
    return notification;
  } catch (error) {
    logger.error('Send notification error:', error);
  }
};

const sendBulkNotification = async (userIds, notificationData) => {
  try {
    const notifications = userIds.map(userId => ({
      userId,
      ...notificationData
    }));

    await Notification.insertMany(notifications);
    logger.info(`Bulk notification sent to ${userIds.length} users`);
  } catch (error) {
    logger.error('Send bulk notification error:', error);
  }
};

module.exports = {
  sendNotification,
  sendBulkNotification
};