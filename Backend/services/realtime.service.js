import axios from 'axios';
const REALTIME_URL = process.env.REALTIME_NOTIFY_URL || 'http://localhost:1234/_notify';

export async function notifyRealtime(mindmapId, payload) {
  try {
    await axios.post(REALTIME_URL, { mindmapId, payload }, { timeout: 2000 }).catch(()=>{});
  } catch (err) { console.warn('notifyRealtime failed', err?.message); }
}
