const express = require('express');
const router = express.Router();
const multer = require('multer');
const { analyzeCVs } = require('../controllers/screener.controller');
const { authenticate } = require('../middleware/auth.middleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10MB per file, 10 files max
});

router.post('/analyze', authenticate, upload.array('cvs', 10), analyzeCVs);

module.exports = router;