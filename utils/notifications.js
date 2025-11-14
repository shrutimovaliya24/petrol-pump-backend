import Notification from '../models/Notification.js';

/**
 * Create a notification for a user
 * @param {Object} options - Notification options
 * @param {String} options.userId - User ID to notify
 * @param {String} options.title - Notification title
 * @param {String} options.message - Notification message
 * @param {String} options.type - Notification type (info, success, warning, error)
 * @param {String} options.category - Notification category (gift, transaction, redemption, pump, user, system)
 * @param {String} options.link - Optional link to navigate to
 * @param {Object} options.metadata - Optional metadata
 */
export const createNotification = async ({
  userId,
  title,
  message,
  type = 'info',
  category = 'system',
  link = null,
  metadata = {},
}) => {
  try {
    if (!userId || !title || !message) {
      console.error('Missing required notification fields');
      return null;
    }

    const notification = new Notification({
      userId,
      title,
      message,
      type,
      category,
      link,
      metadata,
    });

    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    return null;
  }
};

/**
 * Create notifications for multiple users
 */
export const createNotificationsForUsers = async (userIds, notificationData) => {
  try {
    const notifications = userIds.map((userId) => ({
      ...notificationData,
      userId,
    }));

    await Notification.insertMany(notifications);
    return notifications;
  } catch (error) {
    console.error('Error creating notifications for users:', error);
    return [];
  }
};

