const axios = require('axios');
const logger = require('../utils/logger');
const lineConfig = require('../config/line.config');

/**
 * LINE Service
 * ส่งข้อความไปยัง LINE
 */

/**
 * ส่ง Push Message (ส่งข้อความตรง ๆ ไปหา user)
 */
const pushMessage = async (lineUserId, messages) => {
  try {
    const payload = {
      to: lineUserId,
      messages: Array.isArray(messages) ? messages : [messages],
    };

    const response = await axios.post(lineConfig.PUSH_MESSAGE_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lineConfig.CHANNEL_ACCESS_TOKEN}`,
      },
    });

    logger.info(`✅ LINE message pushed to ${lineUserId}`);
    return response.data;
  } catch (error) {
    logger.error(`❌ Error pushing LINE message:`, error.response?.data || error.message);
    throw error;
  }
};

/**
 * สร้าง Text Message Object
 */
const createTextMessage = (text) => {
  return {
    type: 'text',
    text: text,
  };
};

/**
 * สร้าง Flex Message Object (จอมือถือแบบสวย ๆ)
 */
const createFlexMessage = (altText, contentJson) => {
  return {
    type: 'flex',
    altText: altText,
    contents: contentJson,
  };
};

/**
 * สร้าง Button Template
 */
const createButtonMessage = (title, text, buttons) => {
  return {
    type: 'template',
    altText: title,
    template: {
      type: 'buttons',
      title: title,
      text: text,
      actions: buttons,
    },
  };
};

/**
 * ส่งข้อมูลลูกค้าไปที่ LINE (Broadcast)
 */
const broadcastCustomer = async (message) => {
  try {
    const response = await axios.post(
      `${lineConfig.API_ENDPOINT}/bot/message/broadcast`,
      { messages: [message] },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${lineConfig.CHANNEL_ACCESS_TOKEN}`,
        },
      }
    );

    logger.info('✅ Broadcast message sent');
    return response.data;
  } catch (error) {
    logger.error(`❌ Error broadcasting:`, error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  pushMessage,
  broadcastCustomer,
  createTextMessage,
  createFlexMessage,
  createButtonMessage,
};
