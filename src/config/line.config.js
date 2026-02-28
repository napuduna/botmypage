const logger = require('../utils/logger');

const lineConfig = {
  CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
  API_ENDPOINT: 'https://api.line.biz/v1',
  PUSH_MESSAGE_ENDPOINT: 'https://api.line.biz/v1/bot/message/push',
};

const validateLineConfig = () => {
  const required = ['CHANNEL_ACCESS_TOKEN', 'CHANNEL_SECRET'];
  const missing = required.filter((key) => !lineConfig[key]);

  if (missing.length > 0) {
    logger.warn(`⚠️  Missing LINE config: ${missing.join(', ')}`);
  }
};

validateLineConfig();

module.exports = lineConfig;
