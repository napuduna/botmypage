const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');
const verifySignature = require('../middlewares/verifySignature');

/**
 * GET /webhook
 * Facebook Webhook Verification
 * ตรวจสอบ verify token เมื่อ Facebook subscribe webhook
 */
router.get('/', webhookController.verifyWebhook);

/**
 * POST /webhook
 * Receive messages from Facebook Messenger
 * ตรวจสอบลายเซนจากฟเซบุค แล้วประมวลผลข้อความ
 */
router.post('/', verifySignature, webhookController.handleMessage);

module.exports = router;
