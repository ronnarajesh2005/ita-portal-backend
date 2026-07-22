const express = require('express');
const router = express.Router();
const { getAllJRs, getJRById, createJR, updateJR, deleteJR } = require('../controllers/jobRequisitions.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const auditLogger = require('../middleware/auditLogger.middleware');

router.get('/', authenticate, getAllJRs);
router.get('/:id', authenticate, getJRById);
router.post('/', authenticate, auditLogger('Job Requisition'), createJR);
router.put('/:id', authenticate, auditLogger('Job Requisition'), updateJR);
router.delete('/:id', authenticate, authorize('admin'), auditLogger('Job Requisition'), deleteJR);

module.exports = router;