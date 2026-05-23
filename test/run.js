const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function clearProjectModule(relativePath) {
  const resolved = require.resolve(path.join(projectRoot, relativePath));
  delete require.cache[resolved];
  return resolved;
}

function setMock(relativePath, exportsObject) {
  const resolved = clearProjectModule(relativePath);
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: exportsObject,
  };
}

function loadFlowWithMocks() {
  const sessions = {};
  const sent = [];
  const savedCustomers = [];

  const messengerService = {
    sendQuickReply: async (recipientId, text, quickReplies) => {
      sent.push({ type: 'quickReply', recipientId, text, quickReplies });
    },
    sendMessage: async (recipientId, text) => {
      sent.push({ type: 'message', recipientId, text });
    },
  };

  const lineService = {
    pushMessage: async (lineUserId, message) => {
      sent.push({ type: 'line', lineUserId, message });
    },
    createFlexMessage: (altText, contents) => ({ type: 'flex', altText, contents }),
  };

  const customerService = {
    saveCustomerDetail: async (facebookId, type, detail) => {
      const customer = { facebookId, type, detail };
      savedCustomers.push(customer);
      return customer;
    },
  };

  const sessionModel = {
    getSession: async (facebookId) => sessions[facebookId] || null,
    createSession: async (facebookId, state = 'INIT') => {
      sessions[facebookId] = { facebookId, state, tempData: {}, adminTakenOver: false };
      return sessions[facebookId];
    },
    updateState: async (facebookId, state) => {
      sessions[facebookId] = sessions[facebookId] || { facebookId, tempData: {}, adminTakenOver: false };
      sessions[facebookId].state = state;
      return sessions[facebookId];
    },
    updateData: async (facebookId, data = {}) => {
      sessions[facebookId] = sessions[facebookId] || { facebookId, tempData: {}, adminTakenOver: false };
      sessions[facebookId].tempData = Object.assign({}, sessions[facebookId].tempData || {}, data);
      return sessions[facebookId];
    },
    setAdminTakeover: async (facebookId, value) => {
      sessions[facebookId] = sessions[facebookId] || { facebookId, tempData: {} };
      sessions[facebookId].adminTakenOver = value;
      return sessions[facebookId];
    },
  };

  setMock('src/services/messenger.service.js', messengerService);
  setMock('src/services/line.service.js', lineService);
  setMock('src/services/customer.service.js', customerService);
  setMock('src/models/session.model.js', sessionModel);
  clearProjectModule('src/services/flow.service.js');

  const flow = require(path.join(projectRoot, 'src/services/flow.service.js'));
  return { flow, sessions, sent, savedCustomers };
}

function withEnv(env, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function loadVerifySignature(env) {
  const mergedEnv = {
    FB_PAGE_ACCESS_TOKEN: 'test-page-token',
    FB_VERIFY_TOKEN: 'test-verify-token',
    LINE_CHANNEL_ACCESS_TOKEN: 'test-line-token',
    ...env,
  };

  for (const [key, value] of Object.entries(mergedEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  clearProjectModule('src/config/facebook.config.js');
  clearProjectModule('src/config/line.config.js');
  clearProjectModule('src/middlewares/verifySignature.js');
  return require(path.join(projectRoot, 'src/middlewares/verifySignature.js'));
}

function loadWebhookControllerWithMocks() {
  const sessions = {};
  const processedEvents = {};
  const flowCalls = [];
  const takeoverCalls = [];
  const timeoutCalls = [];

  const flowService = {
    processMessage: async (senderId, messageData) => {
      flowCalls.push({ senderId, messageData });
    },
    scheduleAdminResponseTimeout: (senderId, deadline) => {
      timeoutCalls.push({ senderId, deadline });
    },
  };

  const sessionModel = {
    getSession: async (facebookId) => sessions[facebookId] || null,
    setAdminTakeover: async (facebookId, value) => {
      sessions[facebookId] = sessions[facebookId] || { facebookId, state: 'INIT', tempData: {} };
      sessions[facebookId].adminTakenOver = value;
      takeoverCalls.push({ facebookId, value });
      return sessions[facebookId];
    },
    markEventProcessed: async (facebookId, eventId) => {
      processedEvents[facebookId] = processedEvents[facebookId] || new Set();
      if (processedEvents[facebookId].has(eventId)) {
        return false;
      }
      processedEvents[facebookId].add(eventId);
      return true;
    },
  };

  setMock('src/services/flow.service.js', flowService);
  setMock('src/models/session.model.js', sessionModel);
  clearProjectModule('src/config/facebook.config.js');
  clearProjectModule('src/controllers/webhook.controller.js');

  const controller = require(path.join(projectRoot, 'src/controllers/webhook.controller.js'));
  return { controller, sessions, flowCalls, takeoverCalls, timeoutCalls };
}

async function callWebhookController(controller, body) {
  const response = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(bodyValue) {
      this.body = bodyValue;
      return this;
    },
  };

  await controller.handleMessage({ body }, response);
  return response;
}

function runMiddleware(middleware, { headers = {}, rawBody = '{"ok":true}', body = { ok: true } } = {}) {
  let nextCalled = false;
  const response = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(bodyValue) {
      this.body = bodyValue;
      return this;
    },
  };

  middleware({ headers, rawBody, body }, response, () => {
    nextCalled = true;
  });

  return { nextCalled, response };
}

function runChild(code) {
  const result = spawnSync(process.execPath, ['-e', code], {
    cwd: projectRoot,
    env: {
      ...process.env,
      DATABASE_URL: '',
      PORT: '0',
      FB_PAGE_ACCESS_TOKEN: 'test-page-token',
      FB_VERIFY_TOKEN: 'test-verify-token',
      FB_APP_SECRET: 'test-app-secret',
      LINE_CHANNEL_ACCESS_TOKEN: 'test-line-token',
      LINE_CHANNEL_SECRET: 'test-line-secret',
      NODE_ENV: 'test',
      ALLOW_UNSIGNED_WEBHOOKS: 'false',
    },
    encoding: 'utf8',
    timeout: 5000,
  });

  assert.strictEqual(
    result.status,
    0,
    `child process failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
}

test('flow completes the valid Messenger intake path', async () => {
  const { flow, sessions, savedCustomers } = loadFlowWithMocks();

  await flow.handleEvent('happy-user', {});
  await flow.handleEvent('happy-user', { quick_reply: { payload: 'STUDENT' } });
  await flow.handleEvent('happy-user', { quick_reply: { payload: 'SERVICE_WEBSITE' } });
  await flow.handleEvent('happy-user', { text: '5000' });
  await flow.handleEvent('happy-user', { quick_reply: { payload: 'URGENT_7' } });
  await flow.handleEvent('happy-user', { text: 'ต้องการเว็บไซต์สำหรับโปรเจคจบ' });

  assert.strictEqual(sessions['happy-user'].state, 'COMPLETED');
  assert.deepStrictEqual(savedCustomers[0], {
    facebookId: 'happy-user',
    type: 'student',
    detail: {
      service: 'เว็บไซต์',
      budget: 5000,
      urgent: '7 วัน',
      detail: 'ต้องการเว็บไซต์สำหรับโปรเจคจบ',
    },
  });
});

test('flow keeps invalid category payloads in SELECT_CATEGORY', async () => {
  const { flow, sessions } = loadFlowWithMocks();

  await flow.handleEvent('category-user', {});
  await flow.handleEvent('category-user', { quick_reply: { payload: 'NOT_A_CATEGORY' } });

  assert.strictEqual(sessions['category-user'].state, 'SELECT_CATEGORY');
  assert.strictEqual(sessions['category-user'].tempData.type, undefined);
});

test('flow keeps invalid service payloads in SELECT_SERVICE', async () => {
  const { flow, sessions } = loadFlowWithMocks();

  await flow.handleEvent('service-user', {});
  await flow.handleEvent('service-user', { quick_reply: { payload: 'STUDENT' } });
  await flow.handleEvent('service-user', { quick_reply: { payload: 'NOT_A_SERVICE' } });

  assert.strictEqual(sessions['service-user'].state, 'SELECT_SERVICE');
  assert.strictEqual(sessions['service-user'].tempData.service, undefined);
});

for (const invalidBudget of [' ', 'Infinity', '0', '-1', '10.5']) {
  test(`flow rejects invalid budget input ${JSON.stringify(invalidBudget)}`, async () => {
    const { flow, sessions } = loadFlowWithMocks();

    await flow.handleEvent(`budget-user-${invalidBudget}`, {});
    await flow.handleEvent(`budget-user-${invalidBudget}`, { quick_reply: { payload: 'STUDENT' } });
    await flow.handleEvent(`budget-user-${invalidBudget}`, { quick_reply: { payload: 'SERVICE_WEBSITE' } });
    await flow.handleEvent(`budget-user-${invalidBudget}`, { text: invalidBudget });

    assert.strictEqual(sessions[`budget-user-${invalidBudget}`].state, 'ASK_BUDGET');
    assert.strictEqual(sessions[`budget-user-${invalidBudget}`].tempData.budget, undefined);
  });
}

test('flow keeps invalid urgent payloads in ASK_URGENT', async () => {
  const { flow, sessions } = loadFlowWithMocks();

  await flow.handleEvent('urgent-user', {});
  await flow.handleEvent('urgent-user', { quick_reply: { payload: 'STUDENT' } });
  await flow.handleEvent('urgent-user', { quick_reply: { payload: 'SERVICE_WEBSITE' } });
  await flow.handleEvent('urgent-user', { text: '5000' });
  await flow.handleEvent('urgent-user', { quick_reply: { payload: 'URGENT_99' } });

  assert.strictEqual(sessions['urgent-user'].state, 'ASK_URGENT');
  assert.strictEqual(sessions['urgent-user'].tempData.urgent, undefined);
});

test('flow sends completed notice only once', async () => {
  const { flow, sessions, sent } = loadFlowWithMocks();
  sessions['completed-user'] = {
    facebookId: 'completed-user',
    state: 'COMPLETED',
    tempData: {},
    adminTakenOver: false,
  };

  await flow.handleEvent('completed-user', { text: 'hello' });
  await flow.handleEvent('completed-user', { text: 'hello again' });

  const notices = sent.filter((message) => message.type === 'message' && message.recipientId === 'completed-user');
  assert.strictEqual(notices.length, 1);
  assert.strictEqual(sessions['completed-user'].tempData.completedNoticeSent, true);
});

test('Facebook/LINE signature middleware rejects unsigned POSTs by default', () => {
  const verifySignature = loadVerifySignature({
    NODE_ENV: 'production',
    ALLOW_UNSIGNED_WEBHOOKS: undefined,
    FB_APP_SECRET: 'facebook-secret',
    LINE_CHANNEL_SECRET: 'line-secret',
  });

  const { nextCalled, response } = runMiddleware(verifySignature);
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(response.statusCode, 403);
});

test('Facebook/LINE signature middleware allows unsigned POSTs only with dev override', () => {
  const verifySignature = loadVerifySignature({
    NODE_ENV: 'development',
    ALLOW_UNSIGNED_WEBHOOKS: 'true',
    FB_APP_SECRET: 'facebook-secret',
    LINE_CHANNEL_SECRET: 'line-secret',
  });

  const { nextCalled, response } = runMiddleware(verifySignature);
  assert.strictEqual(nextCalled, true);
  assert.strictEqual(response.statusCode, 200);
});

test('Facebook signature middleware rejects invalid signatures', () => {
  const verifySignature = loadVerifySignature({
    NODE_ENV: 'production',
    ALLOW_UNSIGNED_WEBHOOKS: 'false',
    FB_APP_SECRET: 'facebook-secret',
    LINE_CHANNEL_SECRET: 'line-secret',
  });

  const { nextCalled, response } = runMiddleware(verifySignature, {
    headers: { 'x-hub-signature': 'sha1=bad-signature' },
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(response.statusCode, 403);
});

test('LINE signature middleware rejects signatures when LINE secret is missing', () => {
  const rawBody = '{"ok":true}';
  const lineSignature = crypto.createHmac('sha256', '').update(rawBody).digest('base64');
  const verifySignature = loadVerifySignature({
    NODE_ENV: 'production',
    ALLOW_UNSIGNED_WEBHOOKS: 'false',
    FB_APP_SECRET: 'facebook-secret',
    LINE_CHANNEL_SECRET: undefined,
  });

  const { nextCalled, response } = runMiddleware(verifySignature, {
    rawBody,
    headers: { 'x-line-signature': lineSignature },
  });
  assert.strictEqual(nextCalled, false);
  assert.strictEqual(response.statusCode, 403);
});

test('Facebook webhook processes duplicate message.mid only once', async () => {
  const { controller, flowCalls } = loadWebhookControllerWithMocks();
  const body = {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        messaging: [
          {
            sender: { id: 'CUSTOMER_ID' },
            recipient: { id: 'PAGE_ID' },
            timestamp: 1700000000000,
            message: { mid: 'm_dup_1', text: 'hello' },
          },
        ],
      },
    ],
  };

  await callWebhookController(controller, body);
  await callWebhookController(controller, body);

  assert.strictEqual(flowCalls.length, 1);
  assert.strictEqual(flowCalls[0].senderId, 'CUSTOMER_ID');
});

test('Facebook webhook treats Page-sent messages as admin takeover even without is_echo', async () => {
  const { controller, flowCalls, takeoverCalls, timeoutCalls, sessions } = loadWebhookControllerWithMocks();

  await callWebhookController(controller, {
    object: 'page',
    entry: [
      {
        id: 'PAGE_ID',
        messaging: [
          {
            sender: { id: 'PAGE_ID' },
            recipient: { id: 'CUSTOMER_ID' },
            timestamp: 1700000000000,
            message: { mid: 'admin_mid_1', text: 'admin replied' },
          },
        ],
      },
    ],
  });

  assert.strictEqual(flowCalls.length, 0);
  assert.deepStrictEqual(takeoverCalls, [{ facebookId: 'CUSTOMER_ID', value: true }]);
  assert.strictEqual(timeoutCalls.length, 1);
  assert.strictEqual(sessions['CUSTOMER_ID'].adminTakenOver, true);
});

test('Facebook webhook schedules admin takeover once for duplicate admin echo mid', async () => {
  const { controller, takeoverCalls, timeoutCalls } = loadWebhookControllerWithMocks();
  const echoEvent = {
    sender: { id: 'PAGE_ID' },
    recipient: { id: 'CUSTOMER_ID' },
    timestamp: 1700000000000,
    message: { mid: 'admin_dup_mid_1', is_echo: true, text: 'admin replied' },
  };

  await callWebhookController(controller, {
    object: 'page',
    entry: [{ id: 'PAGE_ID', messaging: [echoEvent, echoEvent] }],
  });

  assert.strictEqual(takeoverCalls.length, 1);
  assert.strictEqual(timeoutCalls.length, 1);
});

test('importing src/app does not start an HTTP server', () => {
  runChild(`
    require('./src/app');
    setTimeout(() => {
      const servers = process._getActiveHandles().filter((handle) => handle.constructor && handle.constructor.name === 'Server');
      if (servers.length > 0) {
        console.error('server handles after import:', servers.length);
        process.exit(1);
      }
      process.exit(0);
    }, 200);
  `);
});

test('app returns 400 for malformed JSON request bodies', () => {
  runChild(`
    const http = require('http');
    const app = require('./src/app');
    const server = app.listen(0, () => {
      const request = http.request({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/webhook',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': '1'
        }
      }, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => { body += chunk; });
        response.on('end', () => {
          server.close(() => {
            if (response.statusCode !== 400 || !body.includes('Invalid JSON body')) {
              console.error('unexpected response', response.statusCode, body);
              process.exit(1);
            }
            process.exit(0);
          });
        });
      });
      request.on('error', (error) => {
        console.error(error);
        server.close(() => process.exit(1));
      });
      request.end('{');
    });
  `);
});

(async () => {
  let failures = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`ok - ${name}`);
    } catch (error) {
      failures += 1;
      console.error(`not ok - ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }

  console.log(`\n${tests.length} test(s) passed`);
})();
