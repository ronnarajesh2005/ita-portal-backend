const express = require('express');
const router = express.Router();
const {
  getTAOverview, getTAPerformance, getTAPipeline, getTAUpcomingInterviews,
  getTARecentActivity, getProfileStats,
} = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth.middleware');

// No role restriction — every endpoint scopes strictly to req.user.user_id,
// so a TA only ever sees their own data regardless of role.
router.get('/ta/overview', authenticate, getTAOverview);
router.get('/ta/performance', authenticate, getTAPerformance);
router.get('/ta/pipeline', authenticate, getTAPipeline);
router.get('/ta/upcoming-interviews', authenticate, getTAUpcomingInterviews);
router.get('/ta/recent-activity', authenticate, getTARecentActivity);
router.get('/profile/stats', authenticate, getProfileStats);

module.exports = router;