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
      await sessionModel.updateState(senderId, this.STATES.INIT);
      return this.sendCategory(senderId);
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

      case this.STATES.COMPLETED:
        await sessionModel.updateState(senderId, this.STATES.INIT);
        return this.sendCategory(senderId);

      default:
        await sessionModel.updateState(senderId, this.STATES.INIT);
        return this.sendCategory(senderId);
    }
  }

  async sendCategory(senderId) {
    await sessionModel.updateState(senderId, this.STATES.SELECT_CATEGORY);

    return messengerService.sendQuickReply(senderId, 'สวัสดีครับ กรุณาเลือกประเภทลูกค้า', [
      { title: 'นักศึกษา', payload: 'STUDENT' },
      { title: 'ผู้ประกอบการ', payload: 'BUSINESS' },
    ]);
  }

  async handleCategory(senderId, message) {
    if (!message.quick_reply) return;

    const payload = message.quick_reply.payload;
    const type = payload === 'STUDENT' ? 'student' : 'real';

    await sessionModel.updateData(senderId, { type });
    await sessionModel.updateState(senderId, this.STATES.SELECT_SERVICE);

    return messengerService.sendQuickReply(senderId, 'กรุณาเลือกประเภทงานที่ต้องการ', [
      { title: 'เว็บไซต์', payload: 'SERVICE_WEBSITE' },
      { title: 'โปรแกรม', payload: 'SERVICE_PROGRAM' },
      { title: 'Arduino', payload: 'SERVICE_ARDUINO' },
      { title: 'IOT', payload: 'SERVICE_IOT' },
      { title: 'บอท', payload: 'SERVICE_BOT' },
      { title: 'แก้ไขงาน', payload: 'SERVICE_FIX' },
      { title: 'เขียนวงจร', payload: 'SERVICE_CIRCUIT' },
      { title: 'Flexsim', payload: 'SERVICE_FLEXSIM' },
      { title: 'อื่นๆ', payload: 'SERVICE_OTHER' },
    ]);
  }

  async handleService(senderId, message) {
    if (!message.quick_reply) return;

    const payload = message.quick_reply.payload;

    if (payload === 'SERVICE_OTHER') {
      await sessionModel.updateState(senderId, this.STATES.ASK_CUSTOM_SERVICE);
      return messengerService.sendMessage(senderId, 'กรุณาระบุประเภทงานที่ต้องการ');
    }

    const serviceMap = {
      SERVICE_WEBSITE: 'เว็บไซต์',
      SERVICE_PROGRAM: 'โปรแกรม',
      SERVICE_ARDUINO: 'Arduino',
      SERVICE_IOT: 'IOT',
      SERVICE_BOT: 'บอท',
      SERVICE_FIX: 'แก้ไขงาน',
      SERVICE_CIRCUIT: 'เขียนวงจร',
      SERVICE_FLEXSIM: 'Flexsim',
    };

    await sessionModel.updateData(senderId, { service: serviceMap[payload] });
    await sessionModel.updateState(senderId, this.STATES.ASK_BUDGET);

    return messengerService.sendMessage(senderId, 'มีงบประมาณไม่เกินเท่าไหร่ครับ? (กรุณาระบุตัวเลข เช่น 3000)');
  }

  async handleCustomService(senderId, message) {
    if (!message.text) return;

    await sessionModel.updateData(senderId, { service: message.text });
    await sessionModel.updateState(senderId, this.STATES.ASK_BUDGET);

    return messengerService.sendMessage(senderId, 'มีงบประมาณไม่เกินเท่าไหร่ครับ? (กรุณาระบุตัวเลข เช่น 3000)');
  }

  async handleBudget(senderId, message) {
    if (!message.text || isNaN(message.text)) {
      return messengerService.sendMessage(senderId, 'กรุณาระบุตัวเลขงบประมาณให้ถูกต้อง');
    }

    const budget = parseInt(message.text, 10);
    await sessionModel.updateData(senderId, { budget });
    await sessionModel.updateState(senderId, this.STATES.ASK_URGENT);

    return messengerService.sendQuickReply(senderId, 'ต้องการงานด่วนภายในกี่วันครับ?', [
      { title: '3 วัน', payload: 'URGENT_3' },
      { title: '7 วัน', payload: 'URGENT_7' },
      { title: '14 วัน', payload: 'URGENT_14' },
    ]);
  }

  async handleUrgent(senderId, message) {
    if (!message.quick_reply) return;

    const urgentMap = {
      URGENT_3: '3 วัน',
      URGENT_7: '7 วัน',
      URGENT_14: '14 วัน',
    };

    await sessionModel.updateData(senderId, { urgent: urgentMap[message.quick_reply.payload] });
    await sessionModel.updateState(senderId, this.STATES.ASK_DETAIL);

    return messengerService.sendMessage(
      senderId,
      'ขอบคุณที่ติดต่อมานะครับ 🙏\nรบกวนทิ้งรายละเอียดงานไว้เพื่อการเสนอราคางานของคุณ\nแอดมินจะกลับมาโดยเร็วที่สุด!!!'
    );
  }

  async handleDetail(senderId, message) {
    if (!message.text) return;

    await sessionModel.updateData(senderId, { detail: message.text });

    const finalData = await sessionModel.getSession(senderId);

    // finalData.tempData contains collected fields
    const payload = finalData.tempData || {};

    // Normalize type stored earlier as 'student'|'real'
    const type = payload.type || 'real';

    // Save customer using existing customer.service API
    await customerService.saveCustomerDetail(senderId, type, {
      service: payload.service,
      budget: payload.budget,
      urgent: payload.urgent,
      detail: payload.detail || message.text,
    });

    // Send notification to LINE owner
    try {
      const text = `📌 ข้อมูลลูกค้าใหม่\nFacebook ID: ${senderId}\nประเภท: ${type}\nข้อมูล: ${JSON.stringify(
        payload,
        null,
        2
      )}`;

      const msg = lineService.createTextMessage(text);
      await lineService.pushMessage(this.OWNER_LINE_USER_ID, msg);
    } catch (err) {
      logger.error('Error sending LINE notification', err);
    }

    await sessionModel.updateState(senderId, this.STATES.COMPLETED);
    return messengerService.sendMessage(senderId, 'ข้อมูลถูกส่งเรียบร้อยแล้วครับ ✅');
  }
}
const flowInstance = new FlowService();

// Compatibility wrapper for older code expecting processMessage(senderId, messaging)
flowInstance.processMessage = async function (senderId, messaging) {
  // Facebook payload shape: messaging.message may exist
  const message = messaging?.message || messaging;
  return this.handleEvent(senderId, message);
};

module.exports = flowInstance;
