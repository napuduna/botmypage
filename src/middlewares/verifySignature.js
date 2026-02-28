const crypto = require('crypto');
const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');

/**
 * Middleware: Verify X-Hub-Signature from Facebook
 * ตรวจสอบว่าข้อมูลมาจากFacebook จริง ๆ
 */
const verifySignature = (req, res, next) => {
  const signature = req.headers['x-hub-signature'];

  if (!signature) {
    logger.warn('❌ No signature provided');
    res.status(403).send('Unauthorized');
    return;
  }

  const body = req.rawBody || JSON.stringify(req.body);
  const hash = crypto
    .createHmac('sha1', facebookConfig.APP_SECRET)
    .update(body)
    .digest('hex');

  const signatureHash = signature.split('=')[1];

  if (hash === signatureHash) {
    logger.info('✅ Signature verified');
    next();
  } else {
    logger.warn('❌ Signature mismatch');
    res.status(403).send('Unauthorized');
  }
};

module.exports = verifySignature;
