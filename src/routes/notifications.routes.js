const express = require('express');
const router = express.Router();
const {
  getNotifications, markAsRead, markAllAsRead, deleteNotification,
} = require('../controllers/notifications.controller');
const { authenticate } = require('../middleware/auth.middleware');

// No role restriction — every endpoint scopes strictly to req.user.user_id,
// same pattern as dashboard.routes.js.
router.get('/', authenticate, getNotifications);
router.patch('/:id/read', authenticate, markAsRead);
router.patch('/mark-all-read', authenticate, markAllAsRead);
router.delete('/:id', authenticate, deleteNotification);

module.exports = router;