// Lớp truy cập dữ liệu thời gian thực. Hai cài đặt cùng một giao diện:
//  - Firebase Realtime Database (chơi qua mạng)
//  - Cục bộ qua BroadcastChannel (nhiều tab cùng trình duyệt; dùng để thử và kiểm tra)
import { FIREBASE_CONFIG, DB_ROOT, FIREBASE_SDK } from './config.js';

const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
const split = (p) => p.split('/').filter(Boolean);

export async function createBackend({ forceLocal = false } = {}) {
  const ok = FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.databaseURL;
  let reason = ok ? '' : 'chuaCauHinh';
  if (ok && !forceLocal) {
    try { return await firebaseBackend(); } catch (e) {
      console.warn('Firebase lỗi, chuyển sang chế độ cục bộ', e);
      const code = String(e?.code || e?.message || '');
      reason = /operation-not-allowed|admin-restricted/.test(code) ? 'anonTat'
        : /unauthorized-domain/.test(code) ? 'tenMien'
        : /permission|PERMISSION_DENIED/i.test(code) ? 'rules' : 'khongTai';
    }
  }
  const be = localBackend();
  be.reason = forceLocal ? '' : reason;
  return be;
}

// ------------------------------------------------------------------ Firebase
async function firebaseBackend() {
  const [{ initializeApp }, auth, db] = await Promise.all([
    import(`${FIREBASE_SDK}/firebase-app.js`),
    import(`${FIREBASE_SDK}/firebase-auth.js`),
    import(`${FIREBASE_SDK}/firebase-database.js`),
  ]);
  const app = initializeApp(FIREBASE_CONFIG, 'badminton');
  // Đăng nhập ẩn danh như chùa online, để Rules có thể yêu cầu auth != null
  await auth.signInAnonymously(auth.getAuth(app));
  const d = db.getDatabase(app);
  const R = (p) => db.ref(d, `${DB_ROOT}/${p}`);
  await db.get(R('courts'));                 // thử quyền đọc: lỗi PERMISSION_DENIED nếu Rules chưa có nhánh badminton
  let offset = 0;
  db.onValue(db.ref(d, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  return {
    mode: 'firebase',
    now: () => Date.now() + offset,
    key: () => db.push(R('_k')).key,
    set: (p, v) => db.set(R(p), v === undefined ? null : v),
    update: (p, o) => db.update(R(p), o),
    remove: (p) => db.remove(R(p)),
    get: async (p) => (await db.get(R(p))).val(),
    on: (p, cb) => db.onValue(R(p), (s) => cb(s.val())),
    onDisconnectRemove: (p) => {
      const od = db.onDisconnect(R(p));
      od.remove();
      return () => od.cancel();
    },
    transaction: async (p, fn) => {
      const r = await db.runTransaction(R(p), (cur) => fn(cur));
      return r.committed;
    },
  };
}

// ------------------------------------------------------------------ Cục bộ
function localBackend() {
  const id = Math.random().toString(36).slice(2);
  let tree = {};
  const listeners = new Set();
  const disc = new Set();
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('badminton-local-v1') : null;
  let synced = false;

  const getAt = (path) => {
    let n = tree;
    for (const k of split(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  };
  const setAt = (path, val) => {
    const ks = split(path);
    if (!ks.length) { tree = val || {}; return; }
    let n = tree;
    for (let i = 0; i < ks.length - 1; i++) {
      if (n[ks[i]] == null || typeof n[ks[i]] !== 'object') n[ks[i]] = {};
      n = n[ks[i]];
    }
    const last = ks[ks.length - 1];
    if (val == null) delete n[last]; else n[last] = clone(val);
    // dọn các nút cha rỗng
    for (let d = ks.length - 1; d > 0; d--) {
      const parent = getAt(ks.slice(0, d).join('/'));
      if (parent && typeof parent === 'object' && !Object.keys(parent).length) {
        const gp = getAt(ks.slice(0, d - 1).join('/')) || tree;
        delete gp[ks[d - 1]];
      } else break;
    }
  };
  const related = (a, b) => a === b || a.startsWith(b + '/') || b.startsWith(a + '/') || a === '' || b === '';
  const notify = (changed) => {
    for (const l of [...listeners]) if (related(l.path, changed)) l.cb(clone(getAt(l.path)));
  };
  const apply = (ops, fromRemote) => {
    for (const o of ops) setAt(o.path, o.val);
    for (const o of ops) notify(o.path);
    if (!fromRemote && bc) bc.postMessage({ k: 'op', from: id, ops });
  };

  if (bc) {
    bc.onmessage = (e) => {
      const m = e.data;
      if (m.from === id) return;
      if (m.k === 'op') apply(m.ops, true);
      else if (m.k === 'hello' && synced) bc.postMessage({ k: 'snap', from: id, to: m.from, tree });
      else if (m.k === 'snap' && m.to === id && !synced) {
        tree = m.tree || {}; synced = true;
        for (const l of [...listeners]) l.cb(clone(getAt(l.path)));
      }
    };
    bc.postMessage({ k: 'hello', from: id });
  }
  setTimeout(() => { synced = true; }, 150);
  const onLeave = () => { const ops = [...disc].map((p) => ({ path: p, val: null })); if (ops.length) apply(ops); };
  if (typeof addEventListener !== 'undefined') addEventListener('pagehide', onLeave);

  return {
    mode: 'local',
    now: () => Date.now(),
    key: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
    set: async (p, v) => apply([{ path: p, val: v === undefined ? null : v }]),
    update: async (p, o) => apply(Object.entries(o).map(([k, v]) => ({ path: `${p}/${k}`, val: v === undefined ? null : v }))),
    remove: async (p) => apply([{ path: p, val: null }]),
    get: async (p) => clone(getAt(p)),
    on: (p, cb) => {
      const l = { path: split(p).join('/'), cb };
      listeners.add(l);
      queueMicrotask(() => { if (listeners.has(l)) cb(clone(getAt(l.path))); });
      return () => listeners.delete(l);
    },
    onDisconnectRemove: (p) => { disc.add(p); return () => disc.delete(p); },
    transaction: async (p, fn) => {
      const next = fn(clone(getAt(p)));
      if (next === undefined) return false;
      apply([{ path: p, val: next }]);
      return true;
    },
  };
}
