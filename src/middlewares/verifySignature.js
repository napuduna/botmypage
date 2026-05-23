const crypto = require('crypto');
const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');
const lineConfig = require('../config/line.config');

const safeCompare = (expected, actual) => {
  if (!expected || !actual) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const actualBuffer = Buffer.from(actual, 'utf8');

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

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
      if (!facebookConfig.APP_SECRET) {
        logger.warn('❌ Facebook app secret is missing, cannot verify signature');
        return res.status(403).send('Unauthorized');
      }

      const [algorithm, signatureHash] = fbSignature.split('=');
      if (algorithm !== 'sha1' || !signatureHash) {
        logger.warn('❌ Invalid Facebook signature format');
        return res.status(403).send('Unauthorized');
      }

      const hash = crypto
        .createHmac('sha1', facebookConfig.APP_SECRET)
        .update(body)
        .digest('hex');

      if (safeCompare(hash, signatureHash)) {
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
      if (!lineConfig.CHANNEL_SECRET) {
        logger.warn('❌ LINE channel secret is missing, cannot verify signature');
        return res.status(403).send('Unauthorized');
      }

      const hash = crypto
        .createHmac('sha256', lineConfig.CHANNEL_SECRET)
        .update(body)
        .digest('base64');

      if (safeCompare(hash, lineSignature)) {
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

  const allowUnsignedWebhook =
    process.env.ALLOW_UNSIGNED_WEBHOOKS === 'true' && process.env.NODE_ENV !== 'production';

  if (allowUnsignedWebhook) {
    logger.info('ℹ️  No known signature header present - allowing request by development override');
    return next();
  }

  logger.warn('❌ No known signature header present');
  return res.status(403).send('Unauthorized');
};

module.exports = verifySignature;
