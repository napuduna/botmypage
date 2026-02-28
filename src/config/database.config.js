const logger = require('../utils/logger');

const databaseConfig = {
  DATABASE_URL: process.env.DATABASE_URL || 'mongodb://localhost:27017/fb-line-bot',
  MONGODB: {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  },
};

logger.info(`📦 Database: ${databaseConfig.DATABASE_URL.split('@')[1] || 'Local MongoDB'}`);

module.exports = databaseConfig;
