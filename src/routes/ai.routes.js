const express = require('express');
const router = express.Router();
const {
  reportQuery, draftJR, refineJR, screenerQuery, pipelineQuery, assistChat,
} = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.post('/report-query', authenticate, reportQuery);
router.post('/draft-jr', authenticate, draftJR);
router.post('/refine-jr', authenticate, refineJR);
router.post('/screener-query', authenticate, screenerQuery);
router.post('/pipeline-query', authenticate, pipelineQuery);
router.post('/assist', authenticate, assistChat);

module.exports = router;