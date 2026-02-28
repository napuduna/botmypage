const messengerService = require('./messenger.service');
const lineService = require('./line.service');
const customerService = require('./customer.service');
const Session = require('../models/session.model');
const logger = require('../utils/logger');
const validator = require('../utils/validator');

/**
 * Flow Service
 * ⭐ สำคัญที่สุด
 * ควบคุม State Machine ของการ conversation
 */

/**
 * State Machine Enum
 */
const STATES = {
  INIT: 'INIT',
  SELECT_TYPE: 'SELECT_TYPE',
  SELECT_CATEGORY: 'SELECT_CATEGORY',
  ENTER_BUDGET: 'ENTER_BUDGET',
  SELECT_TIMELINE: 'SELECT_TIMELINE',
  COMPLETED: 'COMPLETED',
};

/**
 * Session Timeout: 30 minutes
 */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * STATE: INIT → แสดงปุ่มเลือก A/B
 */
const showTypeSelection = async (senderId) => {
  const quickReplies = [
    {
      title: '👨‍🎓 นักศึกษา',
      payload: 'TYPE_STUDENT',
    },
    {
      title: '💼 ผู้ประกอบการ',
      payload: 'TYPE_BUSINESS',
    },
  ];

  await messengerService.sendQuickReply(
    senderId,
    'สวัสดีครับ 👋\n\nคุณเป็นใครครับ?',
    quickReplies
  );
};

/**
 * STATE: SELECT_CATEGORY → ประเภทงาน
 */
const showCategorySelection = async (senderId, userType) => {
  let categories = [];

  if (userType === 'student') {
    categories = [
      { title: '🌐 เว็บไซต์', payload: 'CAT_WEBSITE' },
      { title: '💻 โปรแกรม', payload: 'CAT_PROGRAM' },
      { title: '🤖 Arduino/IoT', payload: 'CAT_ARDUINO' },
      { title: '🤖 บอท', payload: 'CAT_BOT' },
      { title: '🔧 แก้ไขงาน', payload: 'CAT_FIX' },
    ];
  } else if (userType === 'business') {
    categories = [
      { title: '🌐 เว็บไซต์', payload: 'CAT_WEBSITE' },
      { title: '💻 โปรแกรม', payload: 'CAT_PROGRAM' },
      { title: '🤖 บอท', payload: 'CAT_BOT' },
      { title: '🔧 แก้ไขงาน', payload: 'CAT_FIX' },
      { title: '📊 Flexsim', payload: 'CAT_FLEXSIM' },
    ];
  }

  await messengerService.sendQuickReply(
    senderId,
    'ประเภทงานที่ต้องการครับ?',
    categories
  );
};

/**
 * STATE: ENTER_BUDGET → ขอจำนวนเงิน
 */
const askBudget = async (senderId) => {
  await messengerService.sendMessage(
    senderId,
    'มีงบประมาณเท่าไหร่ครับ? (กรุณาใส่เป็นตัวเลข)\n\nตัวอย่าง: 5000'
  );
};

/**
 * STATE: SELECT_TIMELINE → งบ valid แล้ว ถามเวลา
 */
const showTimelineSelection = async (senderId) => {
  const quickReplies = [
    { title: '⚡ 3 วัน', payload: 'TIME_3DAYS' },
    { title: '📅 7 วัน', payload: 'TIME_7DAYS' },
    { title: '📆 14 วัน', payload: 'TIME_14DAYS' },
  ];

  await messengerService.sendQuickReply(
    senderId,
    'อยากได้งานด่วนแค่ไหน?',
    quickReplies
  );
};

/**
 * STATE: COMPLETED → ขอบคุณและบอกให้ส่งรายละเอียด
 */
const sendThankYouMessage = async (senderId) => {
  await messengerService.sendMessage(
    senderId,
    '✅ ขอบคุณที่ติดต่อมานะครับ 🙏\n\n' +
      'รบกวนทิ้งรายละเอียดงานไว้เพื่อการเสนอราคางานของคุณ\n' +
      'แอดมินจะกลับมาโดยเร็วที่สุด!!!\n\n' +
      '(ข้อมูลของคุณจะหมดอายุใน 30 นาที)'
  );
};

/**
 * ส่งข้อมูล ไปยัง LINE
 */
const sendToLineChannel = async (senderId) => {
  try {
    const customer = await customerService.getCustomerByFacebookId(senderId);

    if (!customer) {
      logger.warn(`No customer found for ${senderId}`);
      return;
    }

    const message = lineService.createTextMessage(
      `📌 ข้อมูลลูกค้าใหม่\n` +
        `Facebook ID: ${senderId}\n` +
        `ประเภท: ${customer.type === 'student' ? '👨‍🎓 นักเรียน' : '💼 ผู้ประกอบการ'}\n` +
        `รายละเอียด: ${JSON.stringify(customer.detail, null, 2)}`
    );

    // ส่งไปยัง owner หรือ admin group ใน LINE
    // เปลี่ยน OWNER_LINE_USER_ID เป็น LINE ID ของตัวเอง
    const OWNER_LINE_USER_ID = process.env.LINE_OWNER_ID || 'U0000000000000000000000';

    await lineService.pushMessage(OWNER_LINE_USER_ID, message);
    logger.info(`✅ Data sent to LINE for ${senderId}`);
  } catch (error) {
    logger.error('Error sending to LINE:', error);
  }
};

/**
 * Update Session State
 */
const updateSessionState = async (senderId, newState, tempData = {}) => {
  try {
    const session = await Session.findOneAndUpdate(
      { facebookId: senderId },
      {
        $set: {
          state: newState,
          tempData,
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true }
    );

    logger.info(`📍 State updated: ${senderId} → ${newState}`);
    return session;
  } catch (error) {
    logger.error('Error updating session:', error);
    throw error;
  }
};

/**
 * Get Current Session
 */
const getSession = async (senderId) => {
  try {
    const session =
      (await Session.findOne({ facebookId: senderId })) ||
      (await updateSessionState(senderId, STATES.INIT));

    return session;
  } catch (error) {
    logger.error('Error getting session:', error);
    throw error;
  }
};

/**
 * ประมวลผล Message เข้ามา (Main Flow)
 */
const processMessage = async (senderId, messaging) => {
  try {
    // ดึง session ปัจจุบัน
    let session = await getSession(senderId);
    let currentState = session.state;

    logger.info(`🔄 Processing: ${senderId} | State: ${currentState}`);

    // ===== ตรวจสอบ Timeout =====
    const lastUpdate = session.updatedAt ? new Date(session.updatedAt).getTime() : 0;
    const now = Date.now();
    const elapsed = now - lastUpdate;

    if (elapsed > SESSION_TIMEOUT_MS && currentState !== STATES.INIT) {
      logger.info(`⏰ Session timeout for ${senderId} - resetting`);
      await updateSessionState(senderId, STATES.INIT);
      await messengerService.sendMessage(
        senderId,
        '⏰ ขออภัยครับ ข้อมูลหมดอายุแล้ว (30 นาที)\n\nเริ่มใหม่อีกครั้งครับ'
      );
      currentState = STATES.INIT;
    }

    // ===== STATE: INIT =====
    if (currentState === STATES.INIT) {
      await updateSessionState(senderId, STATES.SELECT_TYPE);
      await showTypeSelection(senderId);
      return;
    }

    // ===== STATE: SELECT_TYPE =====
    if (currentState === STATES.SELECT_TYPE) {
      const payload = messaging.message?.quick_reply?.payload;

      if (payload === 'TYPE_STUDENT') {
        await updateSessionState(senderId, STATES.SELECT_CATEGORY, {
          userType: 'student',
        });
        await showCategorySelection(senderId, 'student');
        return;
      } else if (payload === 'TYPE_BUSINESS') {
        await updateSessionState(senderId, STATES.SELECT_CATEGORY, {
          userType: 'business',
        });
        await showCategorySelection(senderId, 'business');
        return;
      } else {
        await messengerService.sendMessage(senderId, '⚠️ กรุณาเลือกจากปุ่มด้านล่างครับ');
        return;
      }
    }

    // ===== STATE: SELECT_CATEGORY =====
    if (currentState === STATES.SELECT_CATEGORY) {
      const payload = messaging.message?.quick_reply?.payload;

      if (!payload) {
        await messengerService.sendMessage(senderId, '⚠️ กรุณาเลือกจากปุ่มด้านล่างครับ');
        return;
      }

      // Map payload to category name
      const categoryMap = {
        CAT_WEBSITE: 'เว็บไซต์',
        CAT_PROGRAM: 'โปรแกรม',
        CAT_ARDUINO: 'Arduino/IoT',
        CAT_BOT: 'บอท',
        CAT_FIX: 'แก้ไขงาน',
        CAT_FLEXSIM: 'Flexsim',
      };

      const categoryName = categoryMap[payload] || payload;

      await updateSessionState(senderId, STATES.ENTER_BUDGET, {
        userType: session.tempData?.userType,
        category: categoryName,
      });
      await askBudget(senderId);
      return;
    }

    // ===== STATE: ENTER_BUDGET =====
    if (currentState === STATES.ENTER_BUDGET) {
      const budgetText = messaging.message?.text || '';

      // Validate: ต้องเป็นตัวเลข
      if (!validator.isNumber(budgetText) || budgetText.trim() === '') {
        await messengerService.sendMessage(
          senderId,
          '❌ กรุณาใส่งบประมาณเป็นตัวเลขเท่านั้นครับ\n\nตัวอย่าง: 5000'
        );
        return;
      }

      const budget = parseInt(budgetText);

      await updateSessionState(senderId, STATES.SELECT_TIMELINE, {
        userType: session.tempData?.userType,
        category: session.tempData?.category,
        budget: budget,
      });
      await showTimelineSelection(senderId);
      return;
    }

    // ===== STATE: SELECT_TIMELINE =====
    if (currentState === STATES.SELECT_TIMELINE) {
      const payload = messaging.message?.quick_reply?.payload;

      if (!payload) {
        await messengerService.sendMessage(senderId, '⚠️ กรุณาเลือกจากปุ่มด้านล่างครับ');
        return;
      }

      // Map payload to timeline
      const timelineMap = {
        TIME_3DAYS: '3 วัน',
        TIME_7DAYS: '7 วัน',
        TIME_14DAYS: '14 วัน',
      };

      const timeline = timelineMap[payload] || payload;

      // บันทึกข้อมูลลงฐานข้อมูล
      await customerService.saveCustomerDetail(senderId, session.tempData?.userType, {
        category: session.tempData?.category,
        budget: session.tempData?.budget,
        timeline: timeline,
      });

      // ส่งข้อมูลไป LINE
      await sendToLineChannel(senderId);

      // Update state to COMPLETED
      await updateSessionState(senderId, STATES.COMPLETED);
      await sendThankYouMessage(senderId);
      return;
    }

    // ===== STATE: COMPLETED =====
    if (currentState === STATES.COMPLETED) {
      await messengerService.sendMessage(
        senderId,
        '💬 ขอบคุณสำหรับข้อมูลครับ\n\n' +
          'พิมพ์ "reset" เพื่อเริ่มใหม่'
      );

      // ถ้าพิมพ์ reset ให้เริ่มใหม่
      if (messaging.message?.text?.toLowerCase().trim() === 'reset') {
        await updateSessionState(senderId, STATES.INIT);
        await showTypeSelection(senderId);
      }
      return;
    }
  } catch (error) {
    logger.error(`Error processing message from ${senderId}:`, error);
    await messengerService.sendMessage(
      senderId,
      '❌ มีข้อผิดพลาดเกิดขึ้น โปรดลองใหม่อีกครั้ง'
    );
  }
};

module.exports = {
  STATES,
  processMessage,
  updateSessionState,
  getSession,
  showTypeSelection,
  saveStudentResponse,
  saveBusinessResponse,
  sendToLineChannel,
};
