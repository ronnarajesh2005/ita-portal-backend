const express = require('express');
const router = express.Router();
const { getAllCandidates, getCandidateById, createCandidate, updateCandidate, deleteCandidate } = require('../controllers/candidates.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const auditLogger = require('../middleware/auditLogger.middleware');

router.get('/', authenticate, getAllCandidates);
router.get('/:id', authenticate, getCandidateById);
router.post('/', authenticate, auditLogger('Candidate'), createCandidate);
router.put('/:id', authenticate, auditLogger('Candidate'), updateCandidate);
router.delete('/:id', authenticate, authorize('admin'), auditLogger('Candidate'), deleteCandidate);

module.exports = router;