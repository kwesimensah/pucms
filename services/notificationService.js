const { v4: uuidv4 } = require('uuid');
const db = require('./db');

function createNotification(userId, message, complaintId) {
  return db.insert('notifications', {
    id: uuidv4(),
    userId,
    message,
    complaintId: complaintId || null,
    read: false,
    createdAt: new Date().toISOString()
  });
}

function listForUser(userId) {
  return db.find('notifications', (n) => n.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function markRead(notificationId, userId) {
  const notif = db.findById('notifications', notificationId);
  if (!notif || notif.userId !== userId) return null;
  return db.updateById('notifications', notificationId, { read: true });
}

module.exports = { createNotification, listForUser, markRead };
