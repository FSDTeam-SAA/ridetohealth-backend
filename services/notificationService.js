const Notification = require('../models/Notification');
const User = require('../models/User');
const logger = require('../utils/logger');

const sendNotification = async ({ senderId, receiverId, title, message, type }) => {
    try {
      const notification = new Notification({
        receiverId,
        senderId,
        title,
        message,
        type,
      });

      await notification.save();
      // console.log('Notification saved:', notification);

      // Here you can trigger push notifications (FCM, sockets, etc.)

      return notification;
    } catch (error) {
      logger.error('Send notification error:', error);
      throw error; // rethrow so controller can catch
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