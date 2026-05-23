const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');
const flowService = require('../services/flow.service');
const sessionModel = require('../models/session.model');

const getFacebookEventId = (messaging) => {
  const messageId = messaging.message?.mid || messaging.postback?.mid;
  if (messageId) {
    return `mid:${messageId}`;
  }

  const senderId = messaging.sender?.id || 'unknown-sender';
  const recipientId = messaging.recipient?.id || 'unknown-recipient';
  const timestamp = messaging.timestamp || 'unknown-time';
  const payload = messaging.postback?.payload || messaging.message?.text;

  if (!payload || timestamp === 'unknown-time') {
    return null;
  }

  return `event:${senderId}:${recipientId}:${timestamp}:${payload}`;
};

const markEventProcessed = async (facebookId, eventId) => {
  if (!eventId) {
    return true;
  }

  const wasMarked = await sessionModel.markEventProcessed(facebookId, eventId);
  if (!wasMarked) {
    logger.info(`[Facebook] Duplicate event skipped for ${facebookId}: ${eventId}`);
  }

  return wasMarked;
};

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
 * Handle incoming messages from Facebook Messenger and LINE
 */
const handleMessage = async (req, res) => {
  const body = req.body;

  // Validate request body
  if (!body) {
    logger.warn('[Webhook] Empty request body');
    return res.status(400).send('Invalid request body');
  }

  // ✅ ส่งค่า 200 ให้ sender ทันทีเพื่อไม่ให้ resend
  res.status(200).send('EVENT_RECEIVED');

  // Facebook Messenger format
  if (body.object === 'page') {
    try {
      if (!body.entry || !Array.isArray(body.entry)) {
        logger.warn('[Facebook] Invalid entry array structure');
        return;
      }
      for (const entry of body.entry) {
        await processFacebookEntry(entry);
      }
    } catch (error) {
      logger.error('Error processing Facebook webhook:', error.message);
    }
  }

  // LINE Messaging API format
  if (body.events && Array.isArray(body.events)) {
    try {
      for (const event of body.events) {
        await processLineEvent(event);
      }
    } catch (error) {
      logger.error('Error processing LINE webhook:', error.message);
    }
  }

  // If neither Facebook nor LINE format, log as unknown
  if (body.object !== 'page' && !body.events) {
    logger.debug('[Webhook] Unknown format - not Facebook nor LINE');
  }
};

/**
 * ประมวลผล Facebook entry
 */
const processFacebookEntry = async (entry) => {
  // Validate entry structure
  if (!entry || !entry.messaging) {
    logger.warn('[Facebook] Invalid entry structure - missing messaging');
    return;
  }

  for (const messaging of entry.messaging) {
    const senderId = messaging.sender?.id;
    const recipientId = messaging.recipient?.id;
    const pageId = entry.id;
    const eventId = getFacebookEventId(messaging);

    // Validate sender ID
    if (!senderId) {
      logger.warn('[Facebook] Missing sender ID in messaging event');
      continue;
    }

    logger.info(`📩 [Facebook] New event from ${senderId}`);
    logger.debug(`[DEBUG] messaging object:`, JSON.stringify(messaging, null, 2));

    try {
      // Skip non-actionable events: delivery receipts, read receipts, reactions
      if (messaging.delivery || messaging.read || messaging.reaction) {
        logger.debug(`[Facebook] Skipping non-message event from ${senderId}`);
        continue;
      }

      // ตรวจจับ echo/admin reply = แอดมินตอบเองจาก Inbox หรือ event ที่ sender คือ Page
      if (messaging.message && (messaging.message.is_echo || senderId === pageId)) {
        // sender ของ echo คือ Page, recipient คือลูกค้า
        const customerId = recipientId;
        if (customerId) {
          try {
            const shouldProcess = await markEventProcessed(customerId, eventId);
            if (!shouldProcess) {
              continue;
            }

            await sessionModel.setAdminTakeover(customerId, true);
            logger.info(`🛑 [Admin Takeover] Admin replied to ${customerId} — bot paused`);
            
            // Log the admin response for tracking
            const adminMessage = messaging.message?.text || '[File/Image/Attachment]';
            logger.info(`👨‍💼 [Admin Message] to ${customerId}: ${adminMessage}`);

            // Schedule automatic reset if admin doesn't respond to new messages within 12 hours
            const resetDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000);
            flowService.scheduleAdminResponseTimeout(customerId, resetDeadline);
          } catch (err) {
            logger.error(`Error processing echo message for ${customerId}:`, err);
          }
        }
        continue;
      }

      // Extract message or postback from messaging event
      const messageData = messaging.message || messaging.postback;

      // If there's no actionable data, skip
      if (!messageData) {
        logger.debug(`[Facebook] No message or postback in event from ${senderId}, skipping`);
        continue;
      }

      const shouldProcess = await markEventProcessed(senderId, eventId);
      if (!shouldProcess) {
        continue;
      }

      // ถ้าแอดมิน takeover อยู่ → บอทหยุดทำงาน
      const session = await sessionModel.getSession(senderId);
      if (session?.adminTakenOver) {
        logger.info(`🔇 [Bot Paused] Admin has taken over conversation with ${senderId} — skipping bot`);
        continue;
      }

      // Pass extracted data to flow service
      await flowService.processMessage(senderId, messageData);
    } catch (error) {
      logger.error(`Error processing message from ${senderId}:`, error.message);
    }
  }
};

/**
 * ประมวลผล LINE event
 * LINE ใช้เฉพาะส่ง notification ให้เจ้าของ ไม่ใช่สำหรับ customer interaction
 */
const processLineEvent = async (event) => {
  const userId = event.source?.userId;
  const eventType = event.type;

  logger.info(`📩 [LINE] New event (${eventType}) from userId: ${userId}`);

  // เก็บ LINE_OWNER_ID สำหรับใช้ส่ง notification
  if (!process.env.LINE_OWNER_ID && userId) {
    logger.info(`💡 Hint: LINE_OWNER_ID should be set to: ${userId}`);
  }

  // ส่ง acknowledge เท่านั้น ไม่ process message จาก LINE
  logger.debug(`[LINE] Event documented. LINE is for notifications only.`);
};

module.exports = {
  verifyWebhook,
  handleMessage,
};
