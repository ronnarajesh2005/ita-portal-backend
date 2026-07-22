const express = require('express');
const router = express.Router();
const { getAllStages, getStageById, createStage, updateStage, deleteStage } = require('../controllers/interviewStages.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const auditLogger = require('../middleware/auditLogger.middleware');

router.get('/', authenticate, getAllStages);
router.get('/:id', authenticate, getStageById);
router.post('/', authenticate, auditLogger('Interview Stage'), createStage);
router.put('/:id', authenticate, auditLogger('Interview Stage'), updateStage);
router.delete('/:id', authenticate, auditLogger('Interview Stage'), deleteStage);

module.exports = router;