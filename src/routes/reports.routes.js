const express = require('express');
const router = express.Router();
const {
  getOverview, getTAComparison, getClientHiring, getPipelineFunnel, getTrends,
} = require('../controllers/reports.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/overview', authenticate, authorize('admin'), getOverview);
router.get('/ta-comparison', authenticate, authorize('admin'), getTAComparison);
router.get('/client-hiring', authenticate, authorize('admin'), getClientHiring);
router.get('/pipeline-funnel', authenticate, authorize('admin'), getPipelineFunnel);
router.get('/trends', authenticate, authorize('admin'), getTrends);

module.exports = router;