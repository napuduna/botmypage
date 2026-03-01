const crypto = require('crypto');
const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');
const lineConfig = require('../config/line.config');

/**
 * Middleware: Verify X-Hub-Signature from Facebook
 * ตรวจสอบว่าข้อมูลมาจากFacebook จริง ๆ
 */
const verifySignature = (req, res, next) => {
  const fbSignature = req.headers['x-hub-signature'];
  const lineSignature = req.headers['x-line-signature'];

  const body = req.rawBody || JSON.stringify(req.body);

  // Facebook signature verification (sha1, format: sha1=hash)
  if (fbSignature) {
    try {
      const hash = crypto
        .createHmac('sha1', facebookConfig.APP_SECRET)
        .update(body)
        .digest('hex');

      const signatureHash = fbSignature.split('=')[1];

      if (hash === signatureHash) {
        logger.info('✅ Facebook signature verified');
        return next();
      }

      logger.warn('❌ Facebook signature mismatch');
      return res.status(403).send('Unauthorized');
    } catch (e) {
      logger.error('Error verifying Facebook signature', e);
      return res.status(403).send('Unauthorized');
    }
  }

  // LINE signature verification (HMAC-SHA256, Base64)
  if (lineSignature) {
    try {
      const hash = crypto
        .createHmac('sha256', lineConfig.CHANNEL_SECRET || '')
        .update(body)
        .digest('base64');

      if (hash === lineSignature) {
        logger.info('✅ LINE signature verified');
        return next();
      }

      logger.warn('❌ LINE signature mismatch');
      return res.status(403).send('Unauthorized');
    } catch (e) {
      logger.error('Error verifying LINE signature', e);
      return res.status(403).send('Unauthorized');
    }
  }

  // No signature provided - treat as healthcheck / allow through (for LINE Console verify GETs or probes)
  logger.info('ℹ️  No known signature header present - allowing request (healthcheck/test)');
  return next();
};

module.exports = verifySignature;
