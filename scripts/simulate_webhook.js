const path = require('path');

// Simple in-memory mocks for services and models to simulate flow without external network/DB
const mockMessenger = {
  sendQuickReply: async (recipientId, text, quickReplies) => {
    console.log(`[MESSAGE][to:${recipientId}] QuickReply: ${text}`);
    quickReplies.forEach((q) => console.log(`  - ${q.title} (${q.payload})`));
  },
  sendMessage: async (recipientId, text) => {
    console.log(`[MESSAGE][to:${recipientId}] Text: ${text}`);
  },
};

const mockLine = {
  pushMessage: async (to, msg) => {
    console.log(`[LINE][to:${to}]`, JSON.stringify(msg, null, 2));
  },
  createTextMessage: (text) => ({ type: 'text', text }),
  createFlexMessage: (altText, contents) => ({ type: 'flex', altText, contents }),
};

// In-memory session store
const sessions = {};
const mockSessionModel = {
  getSession: async (facebookId) => sessions[facebookId] || null,
  createSession: async (facebookId, state = 'INIT') => {
    sessions[facebookId] = { facebookId, state, tempData: {} };
    return sessions[facebookId];
  },
  updateState: async (facebookId, state) => {
    sessions[facebookId] = sessions[facebookId] || { facebookId, tempData: {} };
    sessions[facebookId].state = state;
    return sessions[facebookId];
  },
  updateData: async (facebookId, data = {}) => {
    sessions[facebookId] = sessions[facebookId] || { facebookId, tempData: {} };
    sessions[facebookId].tempData = Object.assign({}, sessions[facebookId].tempData || {}, data);
    return sessions[facebookId];
  },
};

// Mock customer service to capture saved data
const savedCustomers = [];
const mockCustomerService = {
  saveCustomerDetail: async (facebookId, type, detailData) => {
    const entry = { facebookId, type, detail: detailData };
    savedCustomers.push(entry);
    console.log('[DB] saved customer:', entry);
    return entry;
  },
};

// Inject mocks into require cache for the modules used by flow.service
const setMock = (modulePath, exportsObj) => {
  const resolvedPath = path.resolve(__dirname, '..', modulePath);
  const resolved = require.resolve(resolvedPath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObj,
  };
};

// Map project modules to mocks
setMock('./src/services/messenger.service.js', mockMessenger);
setMock('./src/services/line.service.js', mockLine);
setMock('./src/models/session.model.js', mockSessionModel);
setMock('./src/services/customer.service.js', mockCustomerService);

// Require the flow service (will use mocks)
const flow = require('../src/services/flow.service');

const run = async () => {
  const senderId = 'SIM_USER_123';

  console.log('\n--- Start simulation ---\n');

  // 1) initial trigger -> should send category quick replies
  await flow.handleEvent(senderId, {});

  // 2) user selects STUDENT
  await flow.handleEvent(senderId, { quick_reply: { payload: 'STUDENT' } });

  // 3) user selects SERVICE_WEBSITE
  await flow.handleEvent(senderId, { quick_reply: { payload: 'SERVICE_WEBSITE' } });

  // 4) user enters budget
  await flow.handleEvent(senderId, { text: '5000' });

  // 5) user selects urgent 7 days
  await flow.handleEvent(senderId, { quick_reply: { payload: 'URGENT_7' } });

  // 6) user sends detail
  await flow.handleEvent(senderId, { text: 'ต้องการเว็บไซต์สำหรับโปรเจคจบ มีฟอร์มติดต่อและหน้าแสดงผลงาน' });

  console.log('\n--- Simulation finished ---\n');
  console.log('Saved customers:', JSON.stringify(savedCustomers, null, 2));
};

run().catch((err) => console.error(err));
