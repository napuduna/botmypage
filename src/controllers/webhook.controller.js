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
  const mode = req.query['hub.mode'];

  logger.info(`📍 Verify request received`);
  logger.debug(`hub.mode: "${mode}", hub.verify_token: "${verifyToken}"`);

  // If no verify token present it's likely a non-Facebook healthcheck
  // (e.g. LINE Console / simple probe). Return 200 so LINE's Verify passes.
  if (!verifyToken) {
    logger.info('ℹ️  No hub.verify_token found - treating as health check (200)');
    return res.status(200).send('OK');
  }

  // Standard Facebook verification flow
  if (mode === 'subscribe' && verifyToken === facebookConfig.VERIFY_TOKEN) {
    logger.info('✅ Webhook verified');
    return res.status(200).send(challenge);
  }

  logger.warn('❌ Webhook verification failed - tokens do not match');
  logger.warn(`Expected: "${facebookConfig.VERIFY_TOKEN}" | Got: "${verifyToken}"`);
  return res.status(403).send('Verification failed');
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
