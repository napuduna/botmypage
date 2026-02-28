const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');
const flowService = require('../services/flow.service');

/**
 * GET /webhook
 * Verify webhook endpoint (ใช้ verify token)
 */
const verifyWebhook = (req, res) => {
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info(`📍 Verify request received`);
  logger.debug(`Token from Facebook: "${verifyToken}"`);
  logger.debug(`Config token: "${facebookConfig.VERIFY_TOKEN}"`);

  if (verifyToken === facebookConfig.VERIFY_TOKEN) {
    logger.info('✅ Webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('❌ Webhook verification failed - tokens do not match');
    logger.warn(`Expected: "${facebookConfig.VERIFY_TOKEN}" | Got: "${verifyToken}"`);
    res.status(403).send('Verification failed');
  }
};

/**
 * POST /webhook
 * Handle incoming messages from Facebook Messenger
 */
const handleMessage = async (req, res) => {
  const body = req.body;

  // ✅ ส่งค่า 200 ให้ Facebook ทันทีเพื่อไม่ให้ resend
  res.status(200).send('EVENT_RECEIVED');

  // ประมวลผลข้อมูล
  if (body.object === 'page') {
    try {
      for (const entry of body.entry) {
        await processEntry(entry);
      }
    } catch (error) {
      logger.error('Error processing webhook:', error);
    }
  }
};

/**
 * ประมวลผล entry หนึ่งรายการจาก Facebook
 */
const processEntry = async (entry) => {
  for (const messaging of entry.messaging) {
    const senderId = messaging.sender.id;
    const pageId = entry.id;

    logger.info(`📩 New event from ${senderId}`);

    try {
      // ส่งต่อให้ flow service ประมวลผล
      await flowService.processMessage(senderId, messaging);
    } catch (error) {
      logger.error(`Error processing message from ${senderId}:`, error);
    }
  }
};

module.exports = {
  verifyWebhook,
  handleMessage,
};
