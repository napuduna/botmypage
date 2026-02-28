const logger = require('../utils/logger');

const facebookConfig = {
  PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,
  VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN,
  APP_SECRET: process.env.FB_APP_SECRET,
  GRAPH_API_URL: 'https://graph.instagram.com/v18.0',
  GRAPH_API_ENDPOINT: 'https://graph.facebook.com/v18.0',
  SEND_API_ENDPOINT: 'https://graph.facebook.com/v18.0/me/messages',
};

const validateFacebookConfig = () => {
  const required = ['PAGE_ACCESS_TOKEN', 'VERIFY_TOKEN', 'APP_SECRET'];
  const missing = required.filter((key) => !facebookConfig[key]);

  if (missing.length > 0) {
    logger.warn(`⚠️  Missing Facebook config: ${missing.join(', ')}`);
  } else {
    logger.info('✅ Facebook config loaded successfully');
    logger.debug(`Verify Token: ${facebookConfig.VERIFY_TOKEN}`);
  }
};

validateFacebookConfig();

module.exports = facebookConfig;
