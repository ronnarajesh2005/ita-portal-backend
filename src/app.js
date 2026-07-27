const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const errorHandler = require('./middleware/error.middleware');

const app = express();

app.use(helmet());

// CORS — lock to your frontend origin
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

app.use(morgan('dev'));
app.use(express.json());

// Rate limiter for auth routes only — 10 requests per 15 minutes per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ITA backend' });
});

app.use('/auth', authLimiter, require('./routes/auth.routes'));
app.use('/users', require('./routes/users.routes'));
app.use('/clients', require('./routes/clients.routes'));
app.use('/job-requisitions', require('./routes/jobRequisitions.routes'));
app.use('/candidates', require('./routes/candidates.routes'));
app.use('/interview-stages', require('./routes/interviewStages.routes'));
app.use('/audit-log', require('./routes/auditLog.routes'));
app.use('/screener', require('./routes/screener.routes'));
app.use('/reports', require('./routes/reports.routes'));
app.use('/dashboard', require('./routes/dashboard.routes'));
app.use('/ai', require('./routes/ai.routes'));
app.use('/notifications', require('./routes/notifications.routes'));
app.use('/conversations', require('./routes/conversations.routes'));

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

module.exports = app;