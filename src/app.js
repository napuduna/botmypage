require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const mongoose = require('mongoose');

const logger = require('./utils/logger');
const webhookRoute = require('./routes/webhook.route');

const app = express();

// ============= Middleware =============
app.use(cors());

// Serve static files (privacy policy, assets)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Capture raw body for webhook signature verification BEFORE parsing JSON
app.use(express.raw({ type: 'application/json' }));

// Custom middleware to store raw body and parse JSON
app.use((req, res, next) => {
  if (req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString();
    req.body = JSON.parse(req.rawBody);
  }
  next();
});

app.use(bodyParser.urlencoded({ extended: true }));

// ============= Request Logger =============
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`);
  next();
});

// ============= Routes =============
app.use('/webhook', webhookRoute);

// ============= Health Check =============
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Simple privacy policy route required for Facebook App publishing
app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'privacy.html'));
});

// ============= 404 Handler =============
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ============= Error Handler =============
app.use((err, req, res, next) => {
  logger.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// ============= Database Connection =============
const connectDB = async () => {
  try {
    if (process.env.DATABASE_URL) {
      await mongoose.connect(process.env.DATABASE_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      logger.info('✅ MongoDB Connected');
    } else {
      logger.warn('⚠️  DATABASE_URL not set - Running without database');
    }
  } catch (error) {
    logger.error('⚠️  Database Connection Error:', error.message);
    logger.warn('⚠️  Continuing without database - webhook still works');
  }
};

// ============= Start Server =============
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`📝 Webhook URL: http://localhost:${PORT}/webhook`);
    logger.info(`💚 Health Check: http://localhost:${PORT}/health`);
  });
};

startServer().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

module.exports = app;
