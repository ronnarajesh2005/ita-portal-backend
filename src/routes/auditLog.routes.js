const express = require('express');
const router = express.Router();
const { getAuditLogs } = require('../controllers/auditLog.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/', authenticate, authorize('admin'), getAuditLogs);

module.exports = router;