const axios = require('axios');
const logger = require('../utils/logger');
const facebookConfig = require('../config/facebook.config');

/**
 * Messenger Service
 * ส่งข้อความไปยัง Facebook
 */

/**
 * ส่ง Quick Reply
 */
const sendQuickReply = async (recipientId, text, quickReplies) => {
  const messageData = {
    recipient: { id: recipientId },
    message: {
      text: text,
      quick_replies: quickReplies.map((reply) => ({
        content_type: 'text',
        title: reply.title,
        payload: reply.payload,
      })),
    },
  };

  return callSendAPI(messageData);
};

/**
 * ส่งข้อความธรรมชาติ
 */
const sendMessage = async (recipientId, text) => {
  const messageData = {
    recipient: { id: recipientId },
    message: { text: text },
  };

  return callSendAPI(messageData);
};

/**
 * ส่ง Generic Template (Card)
 */
const sendGenericTemplate = async (recipientId, elements) => {
  const messageData = {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'generic',
          elements: elements,
        },
      },
    },
  };

  return callSendAPI(messageData);
};

/**
 * ส่ง Button Template
 */
const sendButtonTemplate = async (recipientId, text, buttons) => {
  const messageData = {
    recipient: { id: recipientId },
    message: {
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: text,
          buttons: buttons,
        },
      },
    },
  };

  return callSendAPI(messageData);
};

/**
 * Core function: Call Facebook Send API
 */
const callSendAPI = async (messageData) => {
  try {
    const response = await axios.post(
      `${facebookConfig.SEND_API_ENDPOINT}?access_token=${facebookConfig.PAGE_ACCESS_TOKEN}`,
      messageData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info(`✅ Message sent to ${messageData.recipient.id}`);
    return response.data;
  } catch (error) {
    logger.error(`❌ Error sending message:`, error.response?.data || error.message);
    throw error;
  }
};

module.exports = {
  sendMessage,
  sendQuickReply,
  sendGenericTemplate,
  sendButtonTemplate,
  callSendAPI,
};
