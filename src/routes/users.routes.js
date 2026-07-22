const express = require('express');
const router = express.Router();
const { getAllUsers, getUserById, updateUser, deleteUser } = require('../controllers/users.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const auditLogger = require('../middleware/auditLogger.middleware');

router.get('/', authenticate, authorize('admin'), getAllUsers);
router.get('/:id', authenticate, getUserById);
router.put('/:id', authenticate, authorize('admin'), auditLogger('User'), updateUser);
router.delete('/:id', authenticate, authorize('admin'), auditLogger('User'), deleteUser);

module.exports = router;