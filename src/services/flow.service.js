const messengerService = require('./messenger.service');
const lineService = require('./line.service');
const customerService = require('./customer.service');
const sessionModel = require('../models/session.model');
const logger = require('../utils/logger');

/**
 * ปรับ FlowService ให้ใช้ API ปัจจุบัน
 */
class FlowService {
  constructor() {
    this.STATES = {
      INIT: 'INIT',
      SELECT_CATEGORY: 'SELECT_CATEGORY',
      SELECT_SERVICE: 'SELECT_SERVICE',
      ASK_CUSTOM_SERVICE: 'ASK_CUSTOM_SERVICE',
      ASK_BUDGET: 'ASK_BUDGET',
      ASK_URGENT: 'ASK_URGENT',
      ASK_DETAIL: 'ASK_DETAIL',
      COMPLETED: 'COMPLETED',
    };

    // Define service mapping once to avoid duplication
    this.SERVICE_MAP = {
      SERVICE_WEBSITE: 'เว็บไซต์',
      SERVICE_PROGRAM: 'โปรแกรม',
      SERVICE_ARDUINO: 'Arduino',
      SERVICE_IOT: 'IOT',
      SERVICE_BOT: 'บอท',
      SERVICE_FIX: 'แก้ไขงาน',
      SERVICE_CIRCUIT: 'เขียนวงจร',
      SERVICE_FLEXSIM: 'Flexsim',
    };

    this.OWNER_LINE_USER_ID = process.env.LINE_OWNER_ID || 'U0000000000000000000000';
  }

  async handleEvent(senderId, message) {
    let session = await sessionModel.getSession(senderId);

    if (!session) {
      session = await sessionModel.createSession(senderId, this.STATES.INIT);
    }

    const state = session.state;

    // reset command
    if (message.text && message.text.toLowerCase() === 'reset') {
      // Reset state, clear completed-notice flag, and re-enable bot (clear admin takeover)
      await sessionModel.updateState(senderId, this.STATES.INIT);
      await sessionModel.updateData(senderId, { completedNoticeSent: false });
      await sessionModel.setAdminTakeover(senderId, false);
      return this.sendCategory(senderId);
    }

    // If admin has taken over, block bot from responding
    if (session.adminTakenOver) {
      return this._sendAdminTakeoverNotice(senderId);
    }

    // If conversation already completed, block further submissions until admin responds
    if (state === this.STATES.COMPLETED) {
      return this._sendCompletedNotice(senderId);
    }

    switch (state) {
      case this.STATES.INIT:
        return this.sendCategory(senderId);

      case this.STATES.SELECT_CATEGORY:
        return this.handleCategory(senderId, message);

      case this.STATES.SELECT_SERVICE:
        return this.handleService(senderId, message);

      case this.STATES.ASK_CUSTOM_SERVICE:
        return this.handleCustomService(senderId, message);

      case this.STATES.ASK_BUDGET:
        return this.handleBudget(senderId, message);

      case this.STATES.ASK_URGENT:
        return this.handleUrgent(senderId, message);

      case this.STATES.ASK_DETAIL:
        return this.handleDetail(senderId, message);

      default:
        await sessionModel.updateState(senderId, this.STATES.INIT);
        return this.sendCategory(senderId);
    }
  }

  // Helper method to avoid code duplication for admin takeover notice
  async _sendAdminTakeoverNotice(senderId) {
    try {
      const sess = await sessionModel.getSession(senderId);
      const alreadyNotified = !!(sess && sess.tempData && sess.tempData.adminTakeoverNoticeSent);

      if (!alreadyNotified) {
        await messengerService.sendMessage(
          senderId,
          '👨‍💼 แอดมินกำลังดูแลคุณอยู่ ขอเวลาสักครู่นะครับ 🙏'
        );
        await sessionModel.updateData(senderId, { adminTakeoverNoticeSent: true });
      }
    } catch (e) {
      logger.error(`Error sending admin takeover notice to ${senderId}:`, e);
    }
  }

  // Helper method to avoid code duplication for completed notice
  async _sendCompletedNotice(senderId) {
    try {
      const sess = await sessionModel.getSession(senderId);
      const alreadyNotified = !!(sess && sess.tempData && sess.tempData.completedNoticeSent);

      if (!alreadyNotified) {
        await messengerService.sendMessage(
          senderId,
          'ขอบคุณที่ฝากงานนะครับ กรุณารอสักครู่ แอดมินจะติดต่อกลับ 😊\nหากต้องการส่งงานใหม่ พิมพ์ "reset"'
        );
        await sessionModel.updateData(senderId, { completedNoticeSent: true });
      }
    } catch (e) {
      logger.error(`Error sending completed notice to ${senderId}:`, e);
    }
  }

  async sendCategory(senderId) {
    try {
      // Clear the prompt flag when explicitly sending category prompt
      await sessionModel.updateData(senderId, { categoryPromptSent: false });
      await sessionModel.updateState(senderId, this.STATES.SELECT_CATEGORY);

      return messengerService.sendQuickReply(
        senderId,
        '👋 สวัสดีครับ! กรุณาเลือกประเภทลูกค้า',
        [
          { title: '👨‍🎓 นักศึกษา', payload: 'STUDENT' },
          { title: '💼 ผู้ประกอบการ', payload: 'BUSINESS' },
        ]
      );
    } catch (error) {
      logger.error(`Error sending category for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleCategory(senderId, message) {
    try {
      // Handle quick_reply or postback
      const payload = message.quick_reply?.payload || message.postback?.payload;
      if (!payload) {
        logger.warn(`[WARN] handleCategory: no payload found in message`);
        
        // Check if we've already sent the category prompt
        const sess = await sessionModel.getSession(senderId);
        const alreadyNotified = !!(sess && sess.tempData && sess.tempData.categoryPromptSent);

        if (!alreadyNotified) {
          // First time - send the category prompt
          await sessionModel.updateData(senderId, { categoryPromptSent: true });
          return messengerService.sendQuickReply(senderId, '👋 สวัสดีครับ! กรุณาเลือกประเภทลูกค้า', [
            { title: '👨‍🎓 นักศึกษา', payload: 'STUDENT' },
            { title: '💼 ผู้ประกอบการ', payload: 'BUSINESS' },
          ]);
        } else {
          // User sent another message without selecting - remind about reset
          return messengerService.sendMessage(senderId, '⚠️ กรุณาเลือกประเภทลูกค้าจากปุ่มด้านบน หรือพิมพ์ "reset" เพื่อเริ่มใหม่');
        }
      }

      const type = payload === 'STUDENT' ? 'student' : 'real';
      logger.info(`[DEBUG] handleCategory: payload=${payload}, type=${type}`);

      // Clear the prompt flag when user selects
      await sessionModel.updateData(senderId, { type, categoryPromptSent: false });
      await sessionModel.updateState(senderId, this.STATES.SELECT_SERVICE);

      return messengerService.sendQuickReply(senderId, '🔎 กรุณาเลือกประเภทงานที่ต้องการ', [
        { title: '🌐 เว็บไซต์', payload: 'SERVICE_WEBSITE' },
        { title: '💻 โปรแกรม', payload: 'SERVICE_PROGRAM' },
        { title: '🤖 Arduino', payload: 'SERVICE_ARDUINO' },
        { title: '📡 IOT', payload: 'SERVICE_IOT' },
        { title: '🤖 บอท', payload: 'SERVICE_BOT' },
        { title: '🔧 แก้ไขงาน', payload: 'SERVICE_FIX' },
        { title: '🔌 เขียนวงจร', payload: 'SERVICE_CIRCUIT' },
        { title: '📊 Flexsim', payload: 'SERVICE_FLEXSIM' },
        { title: '✏️ อื่นๆ', payload: 'SERVICE_OTHER' },
      ]);
    } catch (error) {
      logger.error(`Error handling category for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleService(senderId, message) {
    try {
      // Handle quick_reply or postback
      const payload = message.quick_reply?.payload || message.postback?.payload;
      // If payload missing, try to infer from message.text (user may type the option)
      let resolvedPayload = payload;
      const text = message.text && String(message.text).trim();

      // Try to map typed text to a payload key
      if (!resolvedPayload && text) {
        const found = Object.entries(this.SERVICE_MAP).find(([, v]) => {
          if (!v) return false;
          const a = String(v).toLowerCase();
          const b = String(text).toLowerCase();
          return a === b || b.includes(a) || a.includes(b);
        });

        if (found) {
          resolvedPayload = found[0];
          logger.info(`[DEBUG] handleService: resolved payload from text -> ${resolvedPayload}`);
        } else {
          // Treat as custom service text
          await sessionModel.updateData(senderId, { service: text });
          await sessionModel.updateState(senderId, this.STATES.ASK_BUDGET);
          return messengerService.sendMessage(
            senderId,
            '💸 มีงบประมาณไม่เกินเท่าไหร่ครับ? (กรุณาระบุตัวเลข เช่น 3000)'
          );
        }
      }

      if (resolvedPayload === 'SERVICE_OTHER') {
        await sessionModel.updateState(senderId, this.STATES.ASK_CUSTOM_SERVICE);
        return messengerService.sendMessage(senderId, 'กรุณาระบุประเภทงานที่ต้องการ');
      }

      // Use the singleton SERVICE_MAP instead of defining it again
      await sessionModel.updateData(senderId, { service: this.SERVICE_MAP[resolvedPayload] });
      logger.info(`[SESSION] saved service for ${senderId}: ${this.SERVICE_MAP[resolvedPayload]}`);
      await sessionModel.updateState(senderId, this.STATES.ASK_BUDGET);

      return messengerService.sendMessage(
        senderId,
        '💸 มีงบประมาณไม่เกินเท่าไหร่ครับ? (กรุณาระบุตัวเลข เช่น 3000)'
      );
    } catch (error) {
      logger.error(`Error handling service for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleCustomService(senderId, message) {
    if (!message.text) return;

    try {
      await sessionModel.updateData(senderId, { service: message.text });
      await sessionModel.updateState(senderId, this.STATES.ASK_BUDGET);

      return messengerService.sendMessage(
        senderId,
        '💸 มีงบประมาณไม่เกินเท่าไหร่ครับ? (กรุณาระบุตัวเลข เช่น 3000)'
      );
    } catch (error) {
      logger.error(`Error handling custom service for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleBudget(senderId, message) {
    if (!message.text || isNaN(message.text)) {
      return messengerService.sendMessage(senderId, 'กรุณาระบุตัวเลขงบประมาณให้ถูกต้อง');
    }

    try {
      const budget = parseInt(message.text, 10);
      await sessionModel.updateData(senderId, { budget });
      logger.info(`[SESSION] saved budget for ${senderId}: ${budget}`);
      await sessionModel.updateState(senderId, this.STATES.ASK_URGENT);

      return messengerService.sendQuickReply(senderId, '⏱️ ต้องการงานด่วนภายในกี่วันครับ?', [
        { title: '⚡ 3 วัน', payload: 'URGENT_3' },
        { title: '📅 7 วัน', payload: 'URGENT_7' },
        { title: '📆 14 วัน', payload: 'URGENT_14' },
      ]);
    } catch (error) {
      logger.error(`Error handling budget for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleUrgent(senderId, message) {
    try {
      // Handle quick_reply or postback
      let payload = message.quick_reply?.payload || message.postback?.payload;
      const text = message.text && String(message.text).trim().toLowerCase();

      // Fallback: if user typed a number/word instead of clicking quick reply
      if (!payload && text) {
        if (text.includes('3')) payload = 'URGENT_3';
        else if (text.includes('7')) payload = 'URGENT_7';
        else if (text.includes('14') || text.includes('14 วัน')) payload = 'URGENT_14';
        if (payload) logger.info(`[DEBUG] handleUrgent: resolved payload from text -> ${payload}`);
      }
      if (!payload) {
        logger.warn(`[WARN] handleUrgent: no payload found in message`);
        return messengerService.sendMessage(senderId, 'กรุณาคลิกปุ่มด้านล่างเพื่อเลือกความเร่งด่วน');
      }
      logger.info(`[DEBUG] handleUrgent: payload=${payload}`);

      const urgentMap = {
        URGENT_3: '3 วัน',
        URGENT_7: '7 วัน',
        URGENT_14: '14 วัน',
      };

      await sessionModel.updateData(senderId, { urgent: urgentMap[payload] });
      await sessionModel.updateState(senderId, this.STATES.ASK_DETAIL);

      return messengerService.sendMessage(
        senderId,
        'รบกวนทิ้งรายละเอียดงานไว้เพื่อการเสนอราคางานของคุณ'
      );
    } catch (error) {
      logger.error(`Error handling urgent for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async handleDetail(senderId, message) {
    if (!message.text) return;

    try {
      await sessionModel.updateData(senderId, { detail: message.text });

      const finalData = await sessionModel.getSession(senderId);

      // finalData.tempData contains collected fields
      const payload = finalData.tempData || {};

      logger.debug(`[DEBUG] Session tempData before LINE push:`, JSON.stringify(payload));
      logger.info(`[DETAIL] Collected: type=${payload.type}, service=${payload.service}, budget=${payload.budget}, urgent=${payload.urgent}, detail=${message.text}`);

      // Normalize type stored earlier as 'student'|'real'
      const type = payload.type || 'real';

      // Save customer using existing customer.service API
      await customerService.saveCustomerDetail(senderId, type, {
        service: payload.service,
        budget: payload.budget,
        urgent: payload.urgent,
        detail: payload.detail || message.text,
      });

      // Send thank you message to customer
      await messengerService.sendMessage(
        senderId,
        '🙏 ขอบคุณที่ติดต่อมานะครับ\nแอดมินจะติดต่อกลับโดยเร็วที่สุดครับ 🎯'
      );

      // Send notification to LINE owner (Flex message)
      try {
        const flex = {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '📌 ลูกค้าใหม่', weight: 'bold', size: 'md' },
            ],
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: `Facebook ID: ${senderId}`, wrap: true },
              { type: 'text', text: `ประเภท: ${type}`, wrap: true },
              { type: 'text', text: `บริการ: ${payload.service || '-'} `, wrap: true },
              { type: 'text', text: `งบประมาณ: ${payload.budget || '-'} บาท`, wrap: true },
              { type: 'text', text: `ความเร่งด่วน: ${payload.urgent || '-'}`, wrap: true },
              { type: 'separator' },
              { type: 'text', text: 'รายละเอียด:', weight: 'bold' },
              { type: 'text', text: payload.detail || message.text || '-', wrap: true },
            ],
          },
        };

        const msg = lineService.createFlexMessage('ข้อมูลลูกค้าใหม่', flex);
        await lineService.pushMessage(this.OWNER_LINE_USER_ID, msg);
      } catch (err) {
        logger.error('Error sending LINE notification', err);
      }

      // Set state to COMPLETED and wait for admin response
      await sessionModel.updateState(senderId, this.STATES.COMPLETED);
    } catch (error) {
      logger.error(`Error handling detail for ${senderId}:`, error);
      return messengerService.sendMessage(senderId, 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
    }
  }

  async scheduleAdminResponseTimeout(senderId, deadline) {
    const now = new Date();
    const delayMs = Math.max(0, deadline.getTime() - now.getTime());

    logger.info(`[TIMEOUT] Scheduled admin response check for ${senderId} in ${Math.round(delayMs / 1000 / 60)} minutes`);

    setTimeout(async () => {
      try {
        const session = await sessionModel.getSession(senderId);
        
        // Check if admin has already responded to new messages or if admin takeover was cleared
        if (session && !session.adminTakenOver) {
          logger.info(`[TIMEOUT] Admin takeover was cleared for ${senderId}, no reset needed`);
          return;
        }

        // Admin still hasn't engaged after 12 hours - reset bot to allow new submissions
        logger.warn(`[TIMEOUT] Admin didn't engage for ${senderId} within 12 hours - resetting bot`);
        
        await sessionModel.setAdminTakeover(senderId, false);
        await sessionModel.updateState(senderId, this.STATES.INIT);
        await sessionModel.updateData(senderId, { 
          completedNoticeSent: false,
          adminTakeoverNoticeSent: false
        });

        // Send message to customer
        await messengerService.sendMessage(
          senderId,
          'ยังไม่ได้รับการติดต่อกลับใช่ไหมครับ? 😊\nถ้าต้องการฝากงานใหม่ สามารถส่งข้อความมาได้เลยครับ'
        );

      } catch (err) {
        logger.error(`[TIMEOUT] Error handling admin response timeout for ${senderId}:`, err);
      }
    }, delayMs);
  }
}

const flowInstance = new FlowService();

// Compatibility wrapper for older code expecting processMessage(senderId, messaging)
// `messaging` here is already messaging.message OR messaging.postback from webhook.controller
flowInstance.processMessage = async function (senderId, messaging) {
  // messaging.message scenario: { text, quick_reply, ... }
  // messaging.postback scenario: { payload, title }
  // Normalize into the shape handleEvent expects:
  //   message.text / message.quick_reply?.payload / message.postback?.payload
  let message;
  if (messaging && messaging.payload && !messaging.quick_reply) {
    // This is a raw postback object {payload, title} — wrap it
    message = { postback: messaging };
  } else {
    message = messaging;
  }
  return this.handleEvent(senderId, message || {});
};

module.exports = flowInstance;
