const messengerService = require('./messenger.service');
const lineService = require('./line.service');
const customerService = require('./customer.service');
const Session = require('../models/session.model');
const logger = require('../utils/logger');

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
  WAIT_TYPE_SELECTION: 'WAIT_TYPE_SELECTION',
  WAIT_DETAIL: 'WAIT_DETAIL',
  COMPLETED: 'COMPLETED',
};

/**
 * แสดงปุ่มเลือก Type
 */
const showTypeSelection = async (senderId) => {
  const quickReplies = [
    {
      title: '👨‍🎓 นักเรียน/นักศึกษา',
      payload: 'TYPE_STUDENT',
    },
    {
      title: '💼 ผู้ประกอบการ',
      payload: 'TYPE_REAL',
    },
  ];

  await messengerService.sendQuickReply(
    senderId,
    'คุณเป็นนักเรียน หรือ ผู้ประกอบการ?',
    quickReplies
  );
};

/**
 * ถามรายละเอียด สำหรับ Student
 */
const askStudentDetail = async (senderId) => {
  const quickReplies = [
    { title: '📚 โครงการเรียน', payload: 'STUDENT_PROJECT' },
    { title: '💻 Hackathon', payload: 'STUDENT_HACKATHON' },
    { title: '🎓 CapStone', payload: 'STUDENT_CAPSTONE' },
  ];

  await messengerService.sendQuickReply(
    senderId,
    'บอกหน่อยว่าโครงการของคุณเป็นแบบไหน?',
    quickReplies
  );
};

/**
 * ถามรายละเอียด สำหรับ Business
 */
const askBusinessDetail = async (senderId) => {
  await messengerService.sendMessage(
    senderId,
    'โปรดบอกชื่อธุรกิจของคุณ' +
      '\n\nตัวอย่าง: ร้านขนมเค้ก, บริษัทโฆษณา, ซ่อมมือถือ'
  );
};

/**
 * บันทึก Student Detail
 */
const saveStudentResponse = async (senderId, projectType) => {
  const projectNames = {
    STUDENT_PROJECT: 'โครงการเรียน',
    STUDENT_HACKATHON: 'Hackathon',
    STUDENT_CAPSTONE: 'CapStone',
  };

  await customerService.saveCustomerDetail(senderId, 'student', {
    projectTopic: projectNames[projectType] || projectType,
  });

  await messengerService.sendMessage(
    senderId,
    '✅ ขอบคุณครับ! ข้อมูลของคุณได้บันทึกแล้ว\n' +
      'เราจะติดต่อคุณผ่านช่องทาง LINE เร็ว ๆ นี้ครับ'
  );

  // ส่งข้อมูลไปยัง LINE
  await sendToLineChannel(senderId);
};

/**
 * บันทึก Business Detail
 */
const saveBusinessResponse = async (senderId, businessName, businessDetails = '') => {
  await customerService.saveCustomerDetail(senderId, 'real', {
    businessName: businessName,
    businessDescription: businessDetails,
  });

  await messengerService.sendMessage(
    senderId,
    `✅ ขอบคุณครับ! ได้บันทึง "${businessName}"\n` +
      'เราจะติดต่อคุณผ่านช่องทาง LINE เร็ว ๆ นี้ครับ'
  );

  // ส่งข้อมูลไปยัง LINE
  await sendToLineChannel(senderId);
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
    const session = await getSession(senderId);
    const currentState = session.state;

    logger.info(`🔄 Processing: ${senderId} | State: ${currentState}`);

    // ===== STATE: INIT =====
    if (currentState === STATES.INIT) {
      await updateSessionState(senderId, STATES.WAIT_TYPE_SELECTION);
      await showTypeSelection(senderId);
      return;
    }

    // ===== STATE: WAIT_TYPE_SELECTION =====
    if (currentState === STATES.WAIT_TYPE_SELECTION) {
      const quickReply = messaging.message?.quick_reply;

      if (quickReply) {
        const payload = quickReply.payload;

        if (payload === 'TYPE_STUDENT') {
          await updateSessionState(senderId, STATES.WAIT_DETAIL, {
            selectedType: 'student',
          });
          await askStudentDetail(senderId);
        } else if (payload === 'TYPE_REAL') {
          await updateSessionState(senderId, STATES.WAIT_DETAIL, {
            selectedType: 'real',
          });
          await askBusinessDetail(senderId);
        }
      }
      return;
    }

    // ===== STATE: WAIT_DETAIL =====
    if (currentState === STATES.WAIT_DETAIL) {
      const selectedType = session.tempData?.selectedType;
      const text = messaging.message?.text || '';

      if (selectedType === 'student') {
        // ตอนนี้ลูกค้าอาจจะตอบปุ่มหรือพิมพ์เอง
        if (messaging.message?.quick_reply) {
          await saveStudentResponse(senderId, messaging.message.quick_reply.payload);
        } else {
          await saveStudentResponse(senderId, text);
        }
      } else if (selectedType === 'real') {
        // บันทึกชื่อธุรกิจ
        await saveBusinessResponse(senderId, text);
      }

      await updateSessionState(senderId, STATES.COMPLETED);
      return;
    }

    // ===== STATE: COMPLETED =====
    if (currentState === STATES.COMPLETED) {
      await messengerService.sendMessage(
        senderId,
        'ขอบคุณสำหรับข้อมูลครับ! 😊\n' +
          'หากมีข้อมูลต่อเติมพิมพ์ "reset" เพื่อเริ่มใหม่'
      );

      // ถ้า user พิมพ์ "reset" ให้รีเซ็ต session
      if (messaging.message?.text?.toLowerCase() === 'reset') {
        await updateSessionState(senderId, STATES.INIT);
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
