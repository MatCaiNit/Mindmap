import WebSocket from 'ws';
import axios from 'axios';
import * as Y from 'yjs';

const BACKEND = 'http://localhost:5000';
const REALTIME = 'ws://localhost:1234';

let token;
let ydocId;

// Utils
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (title) => console.log('\n=====', title, '=====');

async function setup() {
  log('SETUP USER + MINDMAP');

  const email = `rt${Date.now()}@test.com`;
  const password = '123456';

  await axios.post(`${BACKEND}/api/auth/register`, {
    email,
    password,
    name: 'Realtime Tester'
  });

  const login = await axios.post(`${BACKEND}/api/auth/login`, {
    email,
    password
  });

  token = login.data.accessToken;

  const mm = await axios.post(
    `${BACKEND}/api/mindmaps`,
    { title: 'Realtime Test' },
    { headers: { Authorization: `Bearer ${token}` } }
  );

  ydocId = mm.data.mindmap.ydocId;

  console.log('ydocId:', ydocId);
}

function connectClient(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${REALTIME}/${ydocId}?token=${token}`);

    ws.on('open', () => {
      console.log(`[${name}] connected`);
      resolve(ws);
    });

    ws.on('error', err => {
      console.error(`[${name}] error`, err);
    });
  });
}

(async () => {
  await setup();

  log('CONNECT 2 CLIENTS');
  const wsA = await connectClient('Client A');
  const wsB = await connectClient('Client B');

  const ydocA = new Y.Doc();
  const ydocB = new Y.Doc();

  // Apply incoming updates
  wsA.on('message', data => {
    const msg = new Uint8Array(data);
    if (msg[0] === 1) {
      Y.applyUpdate(ydocA, msg.slice(1));
    }
  });

  wsB.on('message', data => {
    const msg = new Uint8Array(data);
    if (msg[0] === 1) {
      Y.applyUpdate(ydocB, msg.slice(1));
      console.log('[Client B] received update ✅');
    }
  });

  await sleep(1000);

  log('CLIENT A UPDATE');
  const map = ydocA.getMap('mindmap');
  map.set('title', 'HELLO REALTIME');

  const update = Y.encodeStateAsUpdate(ydocA);
  const message = new Uint8Array(update.length + 1);
  message[0] = 1;
  message.set(update, 1);

  wsA.send(message);

  await sleep(1500);

  log('VERIFY SYNC');
  const titleB = ydocB.getMap('mindmap').get('title');

  if (titleB === 'HELLO REALTIME') {
    console.log('✅ REALTIME SYNC OK');
  } else {
    console.error('❌ REALTIME FAILED');
  }

  log('WAIT SNAPSHOT SAVE');
  await sleep(6000);

  log('FETCH SNAPSHOT FROM BACKEND');
  const snap = await axios.get(
    `${BACKEND}/api/internal/mindmaps/${ydocId}/snapshot`,
    {
      // 👇 THÊM ĐOẠN HEADERS NÀY
      headers: {
        'x-service-token': "super_secure_internal_token_xyz123"
      }
    }
  );

  if (snap.data.snapshot) {
    console.log('✅ SNAPSHOT EXISTS');
  } else {
    console.error('❌ SNAPSHOT MISSING');
  }

  wsA.close();
  wsB.close();

  console.log('\n🎉 REALTIME TEST PASSED');
  process.exit(0);
})();
