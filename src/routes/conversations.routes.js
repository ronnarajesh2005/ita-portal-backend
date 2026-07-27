const express = require('express');
const router = express.Router();
const {
  getConversations,
  getConversationMessages,
  createConversation,
  addMessage,
  deleteConversation,
} = require('../controllers/conversations.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, getConversations);
router.get('/:id/messages', authenticate, getConversationMessages);
router.post('/', authenticate, createConversation);
router.post('/:id/messages', authenticate, addMessage);
router.delete('/:id', authenticate, deleteConversation);

module.exports = router;
