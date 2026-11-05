// Ứng dụng client: sảnh 9 sân, vào sân/chọn vai, điều khiển thời gian thực, giao diện trọng tài biên.
import { createBackend } from './backend.js';
import { Scene3D, STANDBY } from './scene.js';
import { Host } from './host.js';
import {
  simulate, at, launchVel, assistSolve, powerToSpeed, windowFor, judgeLanding,
  HIT_RALLY, HIT_SERVE, teamDir, rightX, QUALITY_NAME, COURT, DT,
} from './physics.js';
import { slotsOf, teamOfSlot, slotKey, idxOfSlot } from './rules.js';
import { locBay } from './tubay.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MODE_TXT = { singles: 'Đánh đơn', doubles: 'Đánh đôi' };
const TEAM_TXT = ['Đội đỏ', 'Đội xanh'];
const SLOT_ORDER = ['t0p0', 't1p0', 't0p1', 't1p1'];

// Thiết bị cảm ứng (điện thoại, máy tính bảng) hoặc thêm ?touch vào địa chỉ để thử
const TOUCH0 = matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch');
const uid = sessionStorage.bm_uid || (sessionStorage.bm_uid = Math.random().toString(36).slice(2, 10));
const S = {
  be: null, scene: null, me: { id: uid, name: localStorage.bm_name || '' },
  courts: [], cur: null, host: null, subs: [], pos: {}, shot: null, traj: null,
  slotPath: null, slotDisc: null, discs: [], lastRid: -1, lastMsgSeq: 0, lastNotice: '', view: 0,
};
const ctl = {
  x: 0, z: 0, sent: { x: 1e9, z: 1e9, t: 0 }, keys: new Set(), stick: [0, 0],
  aim: [0, 0], el: 45, assist: true, arc: true, hold: false, holdAt: 0, seq: 0,
  tossParams: null, callRid: -1, callVal: null, pvT: 0, pv: null, lastShotSeq: -1,
};

// ------------------------------------------------------------------ tiện ích giao diện
let toastTimer = 0, toastLock = 0;
/** Thông báo nổi. prio=true (sét đánh) giữ chỗ hết thời gian; tin thường đến lúc đó sẽ hiện sau. */
function toast(msg, ms = 2600, prio = false) {
  const now = performance.now();
  if (!prio && now < toastLock) { setTimeout(() => toast(msg, ms), toastLock - now + 50); return; }
  if (prio) toastLock = now + ms;
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms);
}
function flashQuality(q) {
  const f = $('#qflash');
  f.className = ''; void f.offsetWidth;
  f.textContent = `${QUALITY_NAME[q]}!`; f.className = `on q${q}`;
}
function openModal(html, bind) {
  $('#modalBox').innerHTML = html;
  $('#modal').hidden = false;
  if (bind) bind($('#modalBox'));
}
const closeModal = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && S.me.name) closeModal(); });

function askName() {
  return new Promise((res) => {
    openModal(`<h3>Tên của bạn</h3><p class="muted small">Tên hiển thị trên sân và bảng điểm.</p>
      <input type="text" id="nameIn" maxlength="14" placeholder="Ví dụ: Hưng" value="${esc(S.me.name)}">
      <button class="cta" id="nameOk">Vào nhà thi đấu</button>`, (box) => {
      const inp = $('#nameIn', box);
      const ok = () => {
        const n = inp.value.trim().slice(0, 14);
        if (!n) { inp.focus(); return; }
        S.me.name = n; localStorage.bm_name = n; $('#nameBtn').textContent = `👤 ${n}`;
        closeModal(); res();
      };
      $('#nameOk', box).onclick = ok;
      inp.onkeydown = (e) => { if (e.key === 'Enter') ok(); e.stopPropagation(); };
      setTimeout(() => inp.focus(), 50);
    });
  });
}

// ------------------------------------------------------------------ dữ liệu sân
const courtData = (i) => S.courts[i] || null;
const filled = (C) => slotsOf(C.cfg.mode).filter((k) => C.players && C.players[k]).length;
const need = (C) => slotsOf(C.cfg.mode).length;
function teamName(C, t) {
  const names = slotsOf(C.cfg.mode).filter((k) => teamOfSlot(k) === t).map((k) => C.players?.[k]?.name || '…');
  return names.join(' & ');
}
function statusOf(i) {
  const C = courtData(i);
  if (!C) return { cls: '', title: `SÂN ${i + 1}`, l1: 'Trống', l2: 'Bấm để nhận sân', color: '#5b6b86' };
  const mode = MODE_TXT[C.cfg.mode].replace('Đánh ', '');
  if (C.state === 'playing' && C.game) {
    const g = C.game;
    return { cls: 'play', title: `SÂN ${i + 1}`, l1: `${g.score[0]} : ${g.score[1]}`, l2: `Đang đấu · ${mode} · ${C.owner.name}`, color: '#3ddc84' };
  }
  if (C.state === 'finished' && C.game) {
    const g = C.game;
    return { cls: 'done', title: `SÂN ${i + 1}`, l1: `Kết thúc ${g.score[0]} : ${g.score[1]}`, l2: `${mode} · ${C.owner.name}`, color: '#4a8df0' };
  }
  return { cls: 'wait', title: `SÂN ${i + 1}`, l1: `Chờ người · ${filled(C)}/${need(C)}`, l2: `${mode} · chủ sân ${C.owner.name}`, color: '#ffbf47' };
}

function refreshHall() {
  const list = $('#courtList');
  let html = '';
  for (let i = 0; i < 9; i++) {
    const s = statusOf(i), C = courtData(i);
    S.scene.setBoard(i, { title: s.title, line1: s.l1, line2: s.l2, color: s.color });
    S.scene.setRoster(i, { players: C?.players || {}, judges: C?.judges || {}, specs: C?.specs || {}, selfId: S.me.id });
    const live = C?.state === 'playing' && C.game?.setup;
    for (const k of Object.keys(C?.players || {})) {
      const p = live ? C.game.setup[k] : STANDBY[k];
      if (p && !(S.cur?.ci === i && C?.state === 'playing')) S.scene.setAvatarTarget(i, k, p[0], p[1], false);
    }
    const jn = ['j0', 'j1'].filter((j) => C?.judges?.[j]).length;
    const sn = Object.keys(C?.specs || {}).length;
    html += `<button class="card ${s.cls}" data-court="${i}"><b><span class="dot"></span>Sân ${i + 1}</b>
      <div class="st">${esc(s.l1)}</div><div class="st">${C ? `TT biên ${jn}/2 · 👀 ${sn}` : 'Sẵn sàng'}</div></button>`;
  }
  list.innerHTML = html;
}
$('#courtList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-court]');
  if (b) openCourtDialog(Number(b.dataset.court));
});

// ------------------------------------------------------------------ nhận sân / chọn vai
function freeSlot(C) {
  const keys = slotsOf(C.cfg.mode);
  return SLOT_ORDER.find((k) => keys.includes(k) && !C.players?.[k]) || null;
}

function openCourtDialog(i) {
  if (S.cur) return;
  const C = courtData(i);
  if (!C) {
    let mode = 'singles', target = 21;
    openModal(`<h3>Nhận Sân ${i + 1}</h3><p class="muted small">Người đến trước là chủ sân: chọn hình thức thi đấu và bắt đầu trận.</p>
      <div class="field"><label>Hình thức</label><div class="seg" id="mSeg"><button data-v="singles" class="on">Đánh đơn</button><button data-v="doubles">Đánh đôi</button></div></div>
      <div class="field"><label>Thắng khi đạt</label><div class="seg" id="tSeg"><button data-v="11">11</button><button data-v="15">15</button><button data-v="21" class="on">21</button></div></div>
      <button class="cta" id="claimGo">Nhận sân và vào chơi</button>`, (box) => {
      for (const [id, set] of [['#mSeg', (v) => (mode = v)], ['#tSeg', (v) => (target = Number(v))]]) {
        $(id, box).onclick = (e) => {
          const b = e.target.closest('button'); if (!b) return;
          $$$(id, box).forEach((x) => x.classList.toggle('on', x === b)); set(b.dataset.v);
        };
      }
      $('#claimGo', box).onclick = async () => { closeModal(); await claimCourt(i, mode, target); };
    });
    return;
  }
  const slot = C.state === 'lobby' ? freeSlot(C) : null;
  const j0 = !C.judges?.j0, j1 = !C.judges?.j1;
  openModal(`<h3>Sân ${i + 1} · ${MODE_TXT[C.cfg.mode]} · ${C.cfg.target} điểm</h3>
    <p class="muted small">Chủ sân: ${esc(C.owner.name)} · ${esc(statusOf(i).l1)}</p>
    <div class="opts">
      <button class="opt" data-k="player" ${slot ? '' : 'disabled'}><b>Vào thi đấu</b><span>${slot ? 'Còn chỗ trống, vào đội ' + (teamOfSlot(slot) === 0 ? 'đỏ' : 'xanh') : C.state === 'lobby' ? 'Đã đủ người' : 'Trận đang diễn ra'}</span></button>
      <button class="opt" data-k="j0" ${j0 ? '' : 'disabled'}><b>Trọng tài biên 1</b><span>${j0 ? 'Quan sát điểm rơi và gọi IN / OUT' : 'Đã có người'}</span></button>
      <button class="opt" data-k="j1" ${j1 ? '' : 'disabled'}><b>Trọng tài biên 2</b><span>${j1 ? 'Quan sát điểm rơi và gọi IN / OUT' : 'Đã có người'}</span></button>
      <button class="opt" data-k="spec"><b>Xem trận</b><span>Khán giả, đổi góc nhìn tuỳ ý</span></button>
    </div>`, (box) => {
    box.onclick = async (e) => {
      const b = e.target.closest('.opt'); if (!b || b.disabled) return;
      closeModal();
      const k = b.dataset.k;
      if (k === 'player') await takeRole(i, 'player', slot);
      else if (k === 'spec') await takeRole(i, 'spec', null);
      else await takeRole(i, 'judge', k);
    };
  });
}
const $$$ = (s, r = document) => [...r.querySelectorAll(s)];

async function claimCourt(i, mode, target) {
  const be = S.be, me = S.me;
  const rec = {
    owner: { id: me.id, name: me.name }, cfg: { mode, target }, state: 'lobby', ts: be.now(),
    players: { t0p0: { id: me.id, name: me.name } },
  };
  const ok = await be.transaction(`courts/${i}`, (cur) => (cur ? undefined : rec));
  if (!ok) { toast('Sân vừa có người nhận trước'); return; }
  await Promise.all(['pos', 'shots', 'intents', 'calls'].map((p) => be.remove(`${p}/${i}`)));
  S.discs = ['courts', 'pos', 'shots', 'intents', 'calls'].map((p) => be.onDisconnectRemove(`${p}/${i}`));
  S.slotPath = `courts/${i}/players/t0p0`; S.slotDisc = null;
  enter(i, 'player', 't0p0', true);
}

async function takeRole(i, kind, key) {
  const be = S.be, me = S.me;
  const path = kind === 'player' ? `courts/${i}/players/${key}` : kind === 'judge' ? `courts/${i}/judges/${key}` : `courts/${i}/specs/${me.id}`;
  if (S.slotPath === path) return;
  const rec = { id: me.id, name: me.name };
  if (kind === 'spec') rec.ts = be.now();
  const ok = await be.transaction(path, (cur) => (cur ? undefined : rec));
  if (!ok) { toast('Vị trí vừa có người ngồi'); return; }
  const old = { path: S.slotPath, disc: S.slotDisc };
  S.slotPath = path; S.slotDisc = be.onDisconnectRemove(path);
  if (old.path) { old.disc?.(); await be.remove(old.path); }
  if (S.cur) { S.cur.role = kind; S.cur.key = kind === 'spec' ? null : key; resetCtl(); renderAll(); }
  else enter(i, kind, key, false);
}

async function releaseSlot() {
  if (!S.slotPath) return;
  const p = S.slotPath; S.slotPath = null; S.slotDisc?.(); S.slotDisc = null;
  await S.be.remove(p);
}

function enter(i, role, key, owner) {
  const be = S.be;
  S.cur = { ci: i, role, key, since: performance.now() };
  S.pos = {}; S.shot = null; S.traj = null; S.lastRid = -1; S.view = 0;
  S.lastMsgSeq = courtData(i)?.game?.msgSeq ?? 0;
  S.subs = [
    be.on(`pos/${i}`, (v) => { S.pos = v || {}; applyPos(); }),
    be.on(`shots/${i}`, onShot),
  ];
  if (owner) S.subs.push(be.on(`intents/${i}`, (v) => S.host?.setIntents(v)), be.on(`calls/${i}`, (v) => S.host?.setCalls(v)));
  resetCtl();
  S.scene.enterCourt(i);
  $('#hall').hidden = true; $('#courtUI').hidden = false;
  $('#banner').style.display = 'none';
  chatSub(`c${i}`); chat.ch = `c${i}`; markSeen();
  renderAll();
  renderChat(true);
}

function resetCtl() {
  ctl.hold = false; ctl.tossParams = null; ctl.callRid = -1; ctl.callVal = null; ctl.pv = null; ctl.queued = null;
  const key = S.cur?.key;
  const st = key ? STANDBY[key] : null;
  if (st) { ctl.x = st[0]; ctl.z = st[1]; }
  ctl.aim = [0, 0];
}

async function leave(msg, closed) {
  const cur = S.cur; if (!cur) return;
  const C = courtData(cur.ci);
  const owner = C?.owner?.id === S.me.id;
  S.cur = null;
  S.subs.forEach((f) => f()); S.subs = [];
  S.host?.stop(); S.host = null;
  if (owner && !closed) {
    S.discs.forEach((f) => f?.()); S.discs = [];
    S.slotDisc?.(); S.slotDisc = null; S.slotPath = null;
    await Promise.all(['courts', 'pos', 'shots', 'intents', 'calls'].map((p) => S.be.remove(`${p}/${cur.ci}`)));
  } else {
    S.discs.forEach((f) => f?.()); S.discs = [];
    await releaseSlot();
  }
  S.scene.hallView();
  $('#courtUI').hidden = true; $('#hall').hidden = false;
  $('#banner').style.display = '';
  $('#touch').hidden = true; $('#shotBar').hidden = true;
  document.body.classList.remove('playing');
  chatUnsub(`c${cur.ci}`); chat.ch = 'hall';
  refreshHall();
  renderChat(true);
  if (msg) toast(msg, 3200);
}
$('#leaveBtn').onclick = () => leave('Bạn đã rời sân');
$('#viewBtn').onclick = () => { S.view = (S.view + 1) % 4; };

// ------------------------------------------------------------------ đồng bộ dữ liệu sân
function onCourts(v) {
  S.courts = Array.from({ length: 9 }, (_, i) => (v ? v[i] || null : null));
  refreshHall();
  if (S.cur) syncCurrent();
}

function syncCurrent() {
  const cur = S.cur, C = courtData(cur.ci);
  if (!C) {
    if (performance.now() - cur.since > 2500) leave('Chủ sân đã đóng sân', true);
    return;
  }
  const owner = C.owner?.id === S.me.id;
  const lost = (cur.role === 'player' && C.players?.[cur.key]?.id !== S.me.id)
    || (cur.role === 'judge' && C.judges?.[cur.key]?.id !== S.me.id);
  if (lost && performance.now() - cur.since > 1500) {
    cur.role = 'spec'; cur.key = null; S.slotPath = null; S.slotDisc?.(); S.slotDisc = null; resetCtl();
  }
  if (C.notice && C.notice !== S.lastNotice) { S.lastNotice = C.notice; toast(C.notice, 3500); }
  if (!C.notice) S.lastNotice = '';
  if (owner && C.notice) S.be.update(`courts/${cur.ci}`, { notice: null });

  // chủ sân chạy bộ điều hành khi trận bắt đầu
  if (owner) {
    if (C.state === 'playing' && !S.host) { S.host = new Host(S.be, cur.ci); S.host.start(C); }
    else if (S.host && C.state === 'lobby') { S.host.stop(); S.host = null; }
    else if (S.host) S.host.setCourt(C);
  }
  const G = C.game;
  if (G && C.state !== 'lobby') {
    if (G.rid !== S.lastRid) onNewServe(C, G);
    if (G.msgSeq !== S.lastMsgSeq) { S.lastMsgSeq = G.msgSeq; if (G.msg) toast(G.msg, 3000); }
  } else { S.lastRid = -1; if (C.state === 'lobby') { S.shot = null; S.traj = null; } }
  renderAll();
}

function onNewServe(C, G) {
  S.lastRid = G.rid;
  ctl.tossParams = null; ctl.callRid = -1; ctl.callVal = null; ctl.hold = false; ctl.queued = null;
  if (S.cur.role === 'player') {
    const dir = teamDir(teamOfSlot(S.cur.key));
    ctl.aim = S.cur.key === G.serverPid ? [-G.side * 1.5, dir * (C.cfg.mode === 'singles' ? 5.0 : 4.0)] : [0, dir * 4.2];
    ctl.el = S.cur.key === G.serverPid ? 30 : 45;
  }
  for (const [pid, p] of Object.entries(G.setup || {})) S.scene.setAvatarTarget(S.cur.ci, pid, p[0], p[1], true);
  if (S.cur.role === 'player' && G.setup?.[S.cur.key]) {
    [ctl.x, ctl.z] = G.setup[S.cur.key];
    sendPos(true);
  }
}

function applyPos() {
  const cur = S.cur; if (!cur) return;
  const C = courtData(cur.ci);
  if (C?.state !== 'playing') return;
  for (const [k, p] of Object.entries(S.pos)) {
    if (k !== cur.key && p) S.scene.setAvatarTarget(cur.ci, k, p.x, p.z, false);
  }
}

function onShot(v) {
  if (!v) { S.shot = null; S.traj = null; return; }
  if (S.shot && S.shot.seq === v.seq) return;
  S.shot = v;
  S.traj = simulate(v.p, v.v, { net: v.kind !== 'toss' });
  if (v.kind !== 'toss' && S.cur) {
    S.scene.swing(S.cur.ci, v.pid);
    if (v.pid === S.cur.key && v.q !== undefined && v.q !== null) { flashQuality(v.q); if (touchUI.on) navigator.vibrate?.(v.q >= 2 ? 25 : 12); }
  }
}

// ------------------------------------------------------------------ hiển thị bảng điểm + danh sách
function renderAll() { if (!S.cur) return; renderScore(); renderRoster(); }

function renderScore() {
  const C = courtData(S.cur.ci), el = $('#score');
  if (!C) return;
  const g = C.game, show = g && C.state !== 'lobby';
  const sc = show ? g.score : [0, 0];
  const srv = show && g.phase !== 'over' ? g.srv : -1;
  el.innerHTML = `<div class="t t0"><div class="nm ${srv === 0 ? 'srv' : ''}">${srv === 0 ? '● ' : ''}${esc(teamName(C, 0))}</div><div class="pt">${sc[0]}</div></div>
    <div class="mid"><b>Sân ${S.cur.ci + 1}</b><span>${C.cfg.target} điểm</span><span>${MODE_TXT[C.cfg.mode].replace('Đánh ', '')}</span></div>
    <div class="t t1"><div class="nm ${srv === 1 ? 'srv' : ''}">${esc(teamName(C, 1))}${srv === 1 ? ' ●' : ''}</div><div class="pt">${sc[1]}</div></div>`;
}

function slotRow(C, key, owner, canSit) {
  const p = C.players?.[key], mine = p?.id === S.me.id;
  const t = teamOfSlot(key), sw = t === 0 ? 'var(--t0)' : 'var(--t1)';
  let act = '';
  if (!p) {
    if (canSit) act += `<button class="mini" data-act="sit" data-k="${key}">Ngồi vào</button>`;
    if (owner && C.state === 'lobby') act += `<button class="mini" data-act="addbot" data-k="${key}">+ Máy</button>`;
  } else if (p.bot && owner && C.state === 'lobby') act = `<button class="mini" data-act="rmbot" data-k="${key}">Gỡ</button>`;
  return `<div class="slot ${p ? '' : 'empty'} ${mine ? 'me' : ''}"><i class="sw" style="background:${sw}"></i>
    <span class="nm">${p ? esc(p.name) + (p.bot ? ' 🤖' : '') + (C.owner.id === p.id ? ' ★' : '') : 'Còn trống'}</span>${act}</div>`;
}

function renderRoster() {
  const cur = S.cur, C = courtData(cur.ci), el = $('#roster');
  if (!C) return;
  const owner = C.owner.id === S.me.id, lobby = C.state === 'lobby', g = C.game;
  const keys = slotsOf(C.cfg.mode), nSpec = Object.keys(C.specs || {}).length;
  if (S.rosterState !== C.state) { S.rosterState = C.state; S.rosterOpen = undefined; }
  const open = S.rosterOpen ?? (C.state !== 'playing');
  let h = `<h2 data-act="fold" title="Thu gọn / mở rộng">Sân ${cur.ci + 1} <span class="chip">${MODE_TXT[C.cfg.mode]}</span><span class="grow"></span><span class="muted">${open ? '▾' : '▸'}</span></h2>`;
  if (!open) { el.innerHTML = h; return; }
  if (lobby && owner) {
    h += `<div class="field" style="margin-top:0"><div class="seg" id="rMode"><button data-act="mode" data-v="singles" class="${C.cfg.mode === 'singles' ? 'on' : ''}">Đơn</button><button data-act="mode" data-v="doubles" class="${C.cfg.mode === 'doubles' ? 'on' : ''}">Đôi</button></div>
      <div class="seg" style="margin-left:6px">${[11, 15, 21].map((n) => `<button data-act="target" data-v="${n}" class="${C.cfg.target === n ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
  }
  if (C.state === 'finished' && g) {
    const w = g.winner;
    h += `<div class="result" style="color:${w === 0 ? 'var(--t0)' : 'var(--t1)'}">🏆 ${esc(teamName(C, w))}<br><small class="muted">${g.score[0]} : ${g.score[1]}</small></div>`;
    h += owner ? `<button class="cta" data-act="rematch">Chơi lại</button>` : `<p class="muted small">Chờ chủ sân chơi lại.</p>`;
  }
  const canSit = lobby && cur.role !== 'player';
  const canMove = lobby;
  for (const t of [0, 1]) {
    h += `<div class="sec">${TEAM_TXT[t]}</div>`;
    for (const k of keys.filter((x) => teamOfSlot(x) === t)) h += slotRow(C, k, owner, canMove && !C.players?.[k] && (cur.role !== 'player' || cur.key !== k));
  }
  h += `<div class="sec">Trọng tài biên</div>`;
  for (const j of ['j0', 'j1']) {
    const p = C.judges?.[j], mine = p?.id === S.me.id;
    h += `<div class="slot ${p ? '' : 'empty'} ${mine ? 'me' : ''}"><i class="sw" style="background:#ffd23f"></i><span class="nm">${p ? esc(p.name) : 'Máy tự chấm'}</span>
      ${!p ? `<button class="mini" data-act="judge" data-k="${j}">Nhận chân</button>` : ''}</div>`;
  }
  h += `<div class="sec">Khán giả: ${nSpec}</div>`;
  if (nSpec) {
    const names = Object.values(C.specs).sort((a, b) => (a.ts || 0) - (b.ts || 0))
      .map((p) => `<span class="sp${p.id === S.me.id ? ' me' : ''}">${esc(p.name)}</span>`).join('');
    h += `<div class="specs">${names}</div>`;
  }
  if (cur.role !== 'spec') h += `<button class="mini" data-act="spec">Chuyển sang xem</button>`;
  if (lobby && owner) {
    const ready = filled(C) === need(C);
    h += `<button class="cta" data-act="start" ${ready ? '' : 'disabled'}>${ready ? 'Bắt đầu trận' : `Cần đủ ${need(C)} người (có thể thêm máy)`}</button>`;
  } else if (lobby) h += `<p class="muted small" style="margin-top:8px">Chờ chủ sân bắt đầu.</p>`;
  if (owner) h += `<button class="cta ghost" data-act="close">Đóng sân</button>`;
  el.innerHTML = h;
}

$('#roster').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b || !S.cur) return;
  const be = S.be, ci = S.cur.ci, C = courtData(ci), a = b.dataset.act, k = b.dataset.k;
  if (!C) return;
  if (a === 'fold') { S.rosterOpen = !(S.rosterOpen ?? C.state !== 'playing'); renderRoster(); }
  else if (a === 'sit') await takeRole(ci, 'player', k);
  else if (a === 'judge') await takeRole(ci, 'judge', k);
  else if (a === 'spec') await takeRole(ci, 'spec', null);
  else if (a === 'addbot') await be.set(`courts/${ci}/players/${k}`, { id: `bot-${k}`, name: 'Máy', bot: true });
  else if (a === 'rmbot') await be.remove(`courts/${ci}/players/${k}`);
  else if (a === 'mode') {
    const v = b.dataset.v;
    if (v === 'singles') await be.update(`courts/${ci}`, { 'cfg/mode': v, 'players/t0p1': null, 'players/t1p1': null });
    else await be.update(`courts/${ci}`, { 'cfg/mode': v });
  } else if (a === 'target') await be.update(`courts/${ci}`, { 'cfg/target': Number(b.dataset.v) });
  else if (a === 'start') {
    if (filled(C) !== need(C)) return;
    await Promise.all(['shots', 'intents', 'calls'].map((p) => be.remove(`${p}/${ci}`)));
    await be.update(`courts/${ci}`, { state: 'playing', game: null, notice: null });
  } else if (a === 'rematch') {
    await Promise.all(['shots', 'intents', 'calls'].map((p) => be.remove(`${p}/${ci}`)));
    await be.update(`courts/${ci}`, { state: 'lobby', game: null });
  } else if (a === 'close') leave('Đã đóng sân');
});

// ------------------------------------------------------------------ điều khiển
const myInfo = () => {
  const cur = S.cur;
  if (!cur || cur.role !== 'player') return null;
  const C = courtData(cur.ci);
  if (!C || C.state !== 'playing' || !C.game || !C.game.phase) return null;
  return { C, G: C.game, key: cur.key, team: teamOfSlot(cur.key), ci: cur.ci };
};

function sendPos(force) {
  const cur = S.cur; if (!cur || cur.role !== 'player') return;
  const now = performance.now();
  if (!force && (now - ctl.sent.t < 90 || Math.hypot(ctl.x - ctl.sent.x, ctl.z - ctl.sent.z) < 0.03)) return;
  ctl.sent = { x: ctl.x, z: ctl.z, t: now };
  S.be.set(`pos/${cur.ci}/${cur.key}`, { x: +ctl.x.toFixed(2), z: +ctl.z.toFixed(2) });
}

function sendIntent(info, it) {
  for (const k of Object.keys(it)) if (typeof it[k] === 'number' && !Number.isFinite(it[k])) it[k] = 0;
  it.seq = ++ctl.seq; it.mid = info.G.mid;
  S.be.set(`intents/${info.ci}/${info.key}`, it);
}

const ramp = (G) => (G.phase === 'serve' ? 0.7 : 1.0);
const curPower = (info) => (ctl.hold ? clamp((performance.now() - ctl.holdAt) / 1000 / ramp(info.G), 0, 1) : 0);

function startHold() {
  const info = myInfo(); if (!info || info.G.phase === 'over') return;
  if (ctl.hold) return;
  ctl.hold = true; ctl.holdAt = performance.now();
}
function endHold() {
  if (!ctl.hold) return;
  ctl.hold = false;
  const info = myInfo(); if (!info) return;
  const { G, key, ci } = info, now = S.be.now();
  const power = clamp((performance.now() - ctl.holdAt) / 1000 / ramp(G), 0, 1);
  const base = { px: +ctl.x.toFixed(2), pz: +ctl.z.toFixed(2), power, tx: ctl.aim[0], tz: ctl.aim[1], el: ctl.el, assist: ctl.assist };
  const tNow = S.shot ? (now - S.shot.t0) / 1000 : 0;
  if (G.phase === 'serve' && key === G.serverPid) {
    if (!S.shot) { ctl.tossParams = { ...base }; sendIntent(info, { k: 'toss', ...base }); }
    else if (S.shot.kind === 'toss' && S.shot.pid === key) {
      S.scene.swing(ci, key);
      const hc = hitContext(info, tNow);
      if (touchUI.on && hc?.w && tNow < hc.w.t1 - 0.06) { ctl.queued = { serve: true, seq: S.shot.seq, until: performance.now() + 400, base }; return; }
      sendIntent(info, { k: 'hit', t: now });
    }
  } else if (G.phase === 'rally' && S.shot) {
    S.scene.swing(ci, key);
    if (touchUI.on) {
      // Điện thoại: nhả sớm (chưa vào tầm hoặc trước cửa sổ đánh) thì chờ tối đa 0,4 s, cầu vào tầm sẽ tự đánh
      const hc = hitContext(info, tNow);
      if (hc?.kind === 'rally' && !(hc.w && tNow >= hc.w.t1 - 0.03)) { ctl.queued = { serve: false, seq: S.shot.seq, until: performance.now() + 400, base }; return; }
    }
    sendIntent(info, { k: 'hit', t: now, ...base });
  }
}

/** Gửi cú đánh đang chờ khi cầu vào tầm (chỉ dùng trên điện thoại). */
function flushQueued(info, tNow) {
  const q = ctl.queued; if (!q) return;
  if (!S.shot || S.shot.seq !== q.seq || performance.now() > q.until) { ctl.queued = null; return; }
  const hc = hitContext(info, tNow);
  if (!hc?.w) return;
  const lo = hc.w.t1 - (q.serve ? 0.06 : 0.02);
  if (tNow < lo || tNow > hc.w.t2) return;
  ctl.queued = null;
  S.scene.swing(info.ci, info.key);
  if (q.serve) sendIntent(info, { k: 'hit', t: S.be.now() });
  else sendIntent(info, { k: 'hit', t: S.be.now(), ...q.base, px: +ctl.x.toFixed(2), pz: +ctl.z.toFixed(2) });
}

function callLine(v) {
  const cur = S.cur; if (!cur || cur.role !== 'judge') return;
  const C = courtData(cur.ci), G = C?.game;
  if (!G || G.phase !== 'judging' || ctl.callRid === G.rid) return;
  ctl.callRid = G.rid; ctl.callVal = v;
  S.be.set(`calls/${cur.ci}/${cur.key}`, { mid: G.mid, rid: G.rid, v });
}
$('#callIn').onclick = () => callLine('in');
$('#callOut').onclick = () => callLine('out');

const PRESETS = { Digit1: -8, Digit2: 8, Digit3: 22, Digit4: 45, Digit5: 62 };
addEventListener('keydown', (e) => {
  if (!S.cur || e.target?.matches?.('input,textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) startHold(); return; }
  if (e.code.startsWith('Arrow')) e.preventDefault();
  ctl.keys.add(e.code);
  if (PRESETS[e.code] !== undefined) ctl.el = PRESETS[e.code];
  else if (e.code === 'KeyQ') ctl.el = clamp(ctl.el - 5, -35, 80);
  else if (e.code === 'KeyE') ctl.el = clamp(ctl.el + 5, -35, 80);
  else if (e.code === 'KeyZ') callLine('in');
  else if (e.code === 'KeyX') callLine('out');
  else if (e.code === 'KeyV') S.view = (S.view + 1) % 4;
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') { endHold(); return; }
  ctl.keys.delete(e.code);
});
addEventListener('blur', () => { ctl.keys.clear(); ctl.hold = false; });

const canvas = $('#gl');
canvas.addEventListener('pointermove', (e) => {
  if (!S.cur || S.cur.role !== 'player') return;
  const p = S.scene.pointerToCourt(e.clientX, e.clientY);
  if (p) ctl.aim = p;
});
canvas.addEventListener('pointerdown', (e) => {
  if (!S.cur || S.cur.role !== 'player' || e.button > 0 || e.pointerType === 'touch') return;
  const p = S.scene.pointerToCourt(e.clientX, e.clientY); if (p) ctl.aim = p;
  startHold();
});
addEventListener('pointerup', (e) => { if (e.target === canvas) endHold(); });
canvas.addEventListener('wheel', (e) => {
  if (!S.cur) return;
  e.preventDefault(); ctl.el = clamp(ctl.el + (e.deltaY < 0 ? 2.5 : -2.5), -35, 80);
}, { passive: false });
$('#elBtns').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) ctl.el = Number(b.dataset.el); });
$('#optAssist').onchange = (e) => { ctl.assist = e.target.checked; };
$('#optArc').onchange = (e) => { ctl.arc = e.target.checked; };

// ------------------------------------------------------------------ điều khiển điện thoại
// Nửa trái: cần ảo nổi (đặt ngón ở đâu cần hiện ở đó). Nửa phải: vuốt để đánh.
// Vuốt lên = đánh sâu (vuốt càng dài càng sâu), lệch ngang = sang trái/phải, vuốt xuống = đập.
// Chạm rồi nhả không vuốt = giữ hướng cũ. Thời điểm nhả ngón là thời điểm đánh.
const touchUI = { on: false, stickId: null, swipeId: null, s0: [0, 0], base: [0, 0], shot: 'auto', autoRun: true, manualAt: 0 };
const SHOTS = [['auto', 'Tự'], [-8, 'Đập'], [8, 'Tạt'], [22, 'Cắt'], [45, 'Phông'], [62, 'Lốp']];
function setTouchMode(on) {
  if (touchUI.on === on) return;
  touchUI.on = on;
  document.body.classList.toggle('touch', on);
}
setTouchMode(TOUCH0);
addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouchMode(true); }, { capture: true, passive: true });

function renderShotBar() {
  $('#shotBar').innerHTML = SHOTS.map(([v, t]) => `<button type="button" data-shot="${v}" class="${String(v) === String(touchUI.shot) ? 'on' : ''}">${t}</button>`).join('');
}
renderShotBar();
$('#shotBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-shot]'); if (!b) return;
  touchUI.shot = b.dataset.shot === 'auto' ? 'auto' : Number(b.dataset.shot);
  if (touchUI.shot !== 'auto') ctl.el = touchUI.shot;
  renderShotBar();
});
$('#optAuto').onchange = (e) => { touchUI.autoRun = e.target.checked; };

const tNowOf = () => (S.shot ? (S.be.now() - S.shot.t0) / 1000 : 0);

/** Hướng vuốt trên màn hình → điểm rơi mong muốn trên sân đối phương. null nếu chỉ chạm. */
function swipeAim(info, dx, dy) {
  const { G, team } = info, dir = teamDir(team), rx = rightX(team);
  const hx = (G.mode === 'singles' ? COURT.HSW : COURT.HW) - 0.35;
  if (Math.hypot(dx, dy) < 22) return null;
  const lat = clamp(dx / (innerWidth * 0.22), -1, 1);
  let depth, smash = false;
  if (dy < -12) depth = 2.1 + clamp(-dy / (innerHeight * 0.28), 0, 1) * (COURT.HL - 0.4 - 2.1);
  else if (dy > 12) { smash = true; depth = 3.3 + clamp(dy / (innerHeight * 0.25), 0, 1) * 2.6; }
  else depth = 4.2;
  return { aim: [rx * lat * hx, dir * depth], depth, smash };
}
/** Góc đánh: theo nút đã chọn, hoặc "Tự" chọn theo độ sâu, độ cao chạm cầu và kiểu vuốt. */
function pickEl(info, depth, smash) {
  if (touchUI.shot !== 'auto') return Number(touchUI.shot);
  if (info.G.phase === 'serve') return depth < 3.6 ? 12 : 38;
  const hc = hitContext(info, tNowOf()), h = hc?.Pc?.[1] ?? 1.5;
  if (smash) return h >= 1.9 ? -8 : 8;
  if (depth < 3.0) return 22;
  if (depth >= 5.0) return h < 1.3 ? 62 : 45;
  return 8;
}
function updateSwipe(e) {
  const info = myInfo(); if (!info) return;
  const dx = e.clientX - touchUI.s0[0], dy = e.clientY - touchUI.s0[1];
  const sw = swipeAim(info, dx, dy);
  if (sw) { ctl.aim = sw.aim; ctl.el = pickEl(info, sw.depth, sw.smash); }
  else ctl.el = pickEl(info, Math.abs(ctl.aim[1]), false);
  const L = Math.hypot(dx, dy), ln = $('#swipeLine');
  ln.hidden = L < 8;
  ln.style.width = `${L}px`;
  ln.style.transform = `translate(${touchUI.s0[0]}px, ${touchUI.s0[1]}px) rotate(${Math.atan2(dy, dx)}rad)`;
}
{
  const pad = $('#touch'), st = $('#stick'), knob = $('i', st);
  pad.addEventListener('pointerdown', (e) => {
    if (!myInfo()) return;
    e.preventDefault();
    if (e.clientX < innerWidth * 0.45) {
      if (touchUI.stickId !== null) return;
      touchUI.stickId = e.pointerId; touchUI.base = [e.clientX, e.clientY];
      st.style.left = `${e.clientX}px`; st.style.top = `${e.clientY}px`; st.classList.add('on'); knob.style.transform = '';
      ctl.stick = [0, 0];
    } else {
      if (touchUI.swipeId !== null) return;
      touchUI.swipeId = e.pointerId; touchUI.s0 = [e.clientX, e.clientY];
      startHold(); updateSwipe(e);
    }
    try { pad.setPointerCapture(e.pointerId); } catch (err) { /* bỏ qua */ }
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId === touchUI.stickId) {
      let dx = (e.clientX - touchUI.base[0]) / 56, dy = (e.clientY - touchUI.base[1]) / 56;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
      ctl.stick = m < 0.15 ? [0, 0] : [dx, dy];                       // vùng chết ở tâm
      touchUI.manualAt = performance.now();
    } else if (e.pointerId === touchUI.swipeId) updateSwipe(e);
  });
  const end = (e, cancel) => {
    if (e.pointerId === touchUI.stickId) {
      touchUI.stickId = null; ctl.stick = [0, 0]; st.classList.remove('on'); touchUI.manualAt = performance.now();
    } else if (e.pointerId === touchUI.swipeId) {
      if (!cancel) updateSwipe(e);
      touchUI.swipeId = null; $('#swipeLine').hidden = true;
      if (cancel) ctl.hold = false; else endHold();
    }
  };
  pad.addEventListener('pointerup', (e) => end(e, false));
  pad.addEventListener('pointercancel', (e) => end(e, true));
}

/** Tự chạy: tới điểm đón cầu khi đối phương vừa đánh, về giữa nửa sân khi mình vừa đánh. */
function autoTarget(info, tNow) {
  const { G, team, key, ci } = info, sh = S.shot, tr = S.traj, half = -teamDir(team);
  const home = G.mode === 'singles' ? [0, half * 3.6] : [rightX(team) * (idxOfSlot(key) === 0 ? 1.3 : -1.3), half * 3.6];
  if (!sh || !tr?.land) return null;
  if (sh.team === team) return home;
  if (tNow >= tr.land.t || (sh.kind === 'serve' && key !== G.receiverPid)) return null;
  const P = tr.pts;
  let tgt = null;
  for (let i = Math.max(1, Math.ceil(tNow / DT)); i < tr.n - 1; i++) {
    const y = P[3 * i + 1], z = P[3 * i + 2];
    if (y <= 2.0 && y >= 0.5 && P[3 * i + 4] <= y && z * half > 0.3) { tgt = [P[3 * i], z]; break; }
  }
  if (!tgt) tgt = [tr.land.x, tr.land.z];
  if (tgt[1] * half <= 0.2) return home;
  if (G.mode === 'doubles') {
    const pp = S.scene.avatarPos(ci, slotKey(team, 1 - idxOfSlot(key)));
    if (pp && Math.hypot(pp[0] - tgt[0], pp[1] - tgt[1]) + 0.6 < Math.hypot(ctl.x - tgt[0], ctl.z - tgt[1])) return home;
  }
  return [clamp(tgt[0], -4.3, 4.3), tgt[1]];
}

// ------------------------------------------------------------------ xem trước đường bay
function hitContext(info, tNow) {
  const { G, key, team } = info, shot = S.shot, traj = S.traj;
  if (G.phase === 'serve' && key === G.serverPid) {
    if (!shot) return { kind: 'serve0', serve: true, Pc: [ctl.x, 0.95, ctl.z], w: null, P: null };
    if (shot.kind === 'toss' && shot.pid === key) {
      const w = windowFor(traj, shot.p[0], shot.p[2], HIT_SERVE);
      return { kind: 'toss', serve: true, w, Pc: w ? at(traj, w.tStar) : null, P: ctl.tossParams };
    }
    return null;
  }
  if (G.phase === 'rally' && shot && traj?.land && shot.team !== team && (shot.kind !== 'serve' || key === G.receiverPid) && tNow < traj.land.t) {
    const w = windowFor(traj, ctl.x, ctl.z, { ...HIT_RALLY, side: -teamDir(team) });
    return { kind: 'rally', serve: false, w, Pc: w ? at(traj, w.tStar) : null, P: null };
  }
  return null;
}

function computePreview(info, hc, power) {
  if (!hc || !hc.Pc) return null;
  const { G, team, C } = info;
  const P = hc.P || { tx: ctl.aim[0], tz: ctl.aim[1], el: ctl.el, assist: ctl.assist, power };
  const dir = teamDir(team), Pc = hc.Pc;
  let dx = P.tx - Pc[0], dz = P.tz - Pc[2];
  if (dz * dir < 0.6) dz = dir * 0.6;
  const dist = Math.hypot(dx, dz);
  let el = P.el, speed;
  if (P.assist) { const r = assistSolve(Pc, dx, dz, el, dist); speed = r.speed; el = r.el; }
  else speed = powerToSpeed(P.power ?? power);
  const tr = simulate([Pc[0], Pc[1], Pc[2]], launchVel(speed, el, dx, dz));
  let color = 0x7dff9b;
  if (tr.net) color = 0xff5d5d;
  else if (tr.land && judgeLanding(tr.land, team, G.mode, hc.serve, G.side) === 'out') color = 0xffbf47;
  return { pts: tr.pts, color };
}

// ------------------------------------------------------------------ vòng lặp
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.cur) courtFrame(dt, now);
  S.scene.update(dt);
  S.scene.render();
}

function courtFrame(dt, now) {
  const cur = S.cur, ci = cur.ci, sc = S.scene;
  const C = courtData(ci), G = C?.game;
  const info = myInfo();
  const tNow = S.shot ? (S.be.now() - S.shot.t0) / 1000 : 0;

  // --- di chuyển
  if (info && G.phase !== 'over') {
    const fwd = teamDir(info.team), right = rightX(info.team), k = ctl.keys;
    let mx = right * ((k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)) + right * ctl.stick[0];
    let mz = fwd * ((k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)) - fwd * ctl.stick[1];
    if (touchUI.on && touchUI.autoRun && G.phase === 'rally' && touchUI.stickId === null && now - touchUI.manualAt > 500 && Math.hypot(mx, mz) < 0.02) {
      const tg = autoTarget(info, tNow);
      if (tg) {
        const ddx = tg[0] - ctl.x, ddz = tg[1] - ctl.z, d = Math.hypot(ddx, ddz);
        if (d > 0.06) { const f = Math.min(1, d / 0.35) / d; mx = ddx * f; mz = ddz * f; }
      }
    }
    const m = Math.hypot(mx, mz);
    if (m > 1) { mx /= m; mz /= m; }
    if (m > 0.02) {
      const half = -fwd;                                   // dấu z nửa sân của mình
      let nx = clamp(ctl.x + mx * 5.8 * dt, -4.3, 4.3);
      let nz = half > 0 ? clamp(ctl.z + mz * 5.8 * dt, 0.45, 7.6) : clamp(ctl.z + mz * 5.8 * dt, -7.6, -0.45);
      if (G.phase === 'serve' && info.key === G.serverPid && G.setup?.[info.key]) {
        const [sx, sz] = G.setup[info.key];
        nx = clamp(nx, sx - 0.9, sx + 0.9); nz = clamp(nz, sz - 0.9, sz + 0.9);
      }
      ctl.x = nx; ctl.z = nz;
    }
    sc.setAvatarTarget(ci, info.key, ctl.x, ctl.z, true);
    sendPos(false);
  }

  // --- cầu
  const sh = S.shot, tr = S.traj;
  let marked = false;
  if (sh && tr) {
    const L = tr.land ? tr.land.t : 99, tt = clamp(tNow, 0, L);
    const p = at(tr, tt), p2 = at(tr, Math.min(L, tt + 0.012));
    sc.setShuttle(true, p, [p2[0] - p[0], p2[1] - p[1], p2[2] - p[2]]);
    if (tr.land && sh.kind !== 'toss') {
      if (tNow >= L && !tr.net) { sc.setRing('mark', [tr.land.x, tr.land.z]); marked = true; sc.setRing('pred', null); }
      else sc.setRing('pred', [tr.land.x, tr.land.z]);
    } else sc.setRing('pred', null);
  } else if (G && C.state === 'playing' && G.phase === 'serve' && G.serverPid) {
    const a = sc.avatarPos(ci, G.serverPid);
    if (a) sc.setShuttle(true, [a[0] + 0.15, 1.05, a[1] + teamDir(teamOfSlot(G.serverPid)) * 0.5], [0, 1, 0]);
    sc.setRing('pred', null);
  } else { sc.setShuttle(false); sc.setRing('pred', null); }
  if (!marked) sc.setRing('mark', null);

  // --- HUD người chơi
  const hud = $('#playHud'), jh = $('#judgeHud');
  hud.hidden = !info;
  jh.hidden = cur.role !== 'judge';
  const tShow = !!(info && touchUI.on && G.phase !== 'over');
  $('#touch').hidden = !tShow; $('#shotBar').hidden = !tShow;
  document.body.classList.toggle('playing', !!info);
  if (info && ctl.queued) flushQueued(info, tNow);
  if (info) {
    const hc = G.phase === 'over' ? null : hitContext(info, tNow);
    const power = curPower(info);
    if (now - ctl.pvT > 70) { ctl.pvT = now; ctl.pv = ctl.arc ? computePreview(info, hc, power) : null; }
    sc.setArc(ctl.pv ? ctl.pv.pts : null, ctl.pv ? ctl.pv.color : 0);
    sc.setRing('aim', ctl.aim[0] || ctl.aim[1] ? ctl.aim : null);
    if (hc && hc.kind === 'rally') sc.setRing('reach', [ctl.x, ctl.z], hc.w ? 0x7dff9b : 0xffffff); else sc.setRing('reach', null);
    updatePlayHud(info, hc, power, tNow);
  } else { sc.setArc(null); sc.setRing('aim', null); sc.setRing('reach', null); }
  if (cur.role === 'judge') updateJudgeHud(G);

  // --- camera
  cameraFor(info, G, tr);
}

function updatePlayHud(info, hc, power, tNow) {
  const { G, key } = info;
  const tossLive = hc?.kind === 'toss';
  const P = hc?.P;
  const shown = tossLive && P ? P.power : power;
  const assistNow = tossLive && P ? P.assist : ctl.assist;
  $('#powerFill').style.width = `${(assistNow ? 0 : shown) * 100}%`;
  $('#powerTxt').textContent = assistNow ? 'Tự động' : `${Math.round(shown * 100)}%`;
  const el = tossLive && P ? P.el : ctl.el;
  $('#elTxt').textContent = `${Math.round(el)}°`;
  for (const b of $$$('#elBtns button')) b.classList.toggle('on', Math.abs(Number(b.dataset.el) - ctl.el) < 6);
  $('#optAssist').checked = ctl.assist; $('#optArc').checked = ctl.arc;

  const timing = $('.timing'), w = hc?.w;
  timing.classList.toggle('off', !w);
  if (w) {
    const lo = w.t1 - 0.25, hi = w.t2 + 0.12, pc = (t) => clamp(((t - lo) / (hi - lo)) * 100, 0, 100);
    const z1 = $('#tz1'), z2 = $('#tz2');
    z1.style.left = `${pc(w.tStar - 0.07)}%`; z1.style.width = `${pc(w.tStar + 0.07) - pc(w.tStar - 0.07)}%`;
    z2.style.left = `${pc(w.tStar - 0.16)}%`; z2.style.width = `${pc(w.tStar + 0.16) - pc(w.tStar - 0.16)}%`;
    $('#tmark').style.left = `${pc(tNow)}%`;
  }
  let hint = '';
  if (touchUI.on) {
    if (G.phase === 'serve') {
      if (key !== G.serverPid) hint = key === G.receiverPid ? 'Bạn đỡ giao cầu, chờ cầu bay tới' : 'Chờ giao cầu';
      else if (!S.shot) hint = 'Vuốt bên phải để tung cầu (hướng vuốt = hướng giao)';
      else hint = w ? 'Chạm rồi nhả bên phải đúng vạch xanh để đánh' : 'Cầu đang rơi…';
    } else if (G.phase === 'rally') {
      if (!hc) hint = 'Chờ đối phương đánh';
      else if (!w) hint = touchUI.autoRun ? 'Đang tự chạy tới điểm đón cầu…' : 'Kéo bên trái để chạy tới vòng cyan';
      else hint = 'Vuốt bên phải, nhả đúng vạch xanh: lên = sâu, ngang = chéo, xuống = đập';
    } else if (G.phase === 'judging') hint = 'Trọng tài biên đang phán quyết…';
    else if (G.phase === 'over') hint = 'Hết trận';
    $('#hint').textContent = hint;
    return;
  }
  if (G.phase === 'serve') {
    if (key !== G.serverPid) hint = key === G.receiverPid ? 'Bạn đỡ giao cầu — đứng đúng ô chéo, chờ cầu bay tới' : 'Chờ giao cầu';
    else if (!S.shot) hint = ctl.assist ? 'Giao cầu: giữ rồi nhả SPACE để tung cầu' : 'Giao cầu: giữ SPACE để căn lực, nhả để tung cầu';
    else hint = w ? 'Nhấn rồi nhả SPACE đúng vạch xanh để đánh cầu' : 'Cầu đang rơi…';
  } else if (G.phase === 'rally') {
    if (!hc) hint = 'Chờ đối phương đánh';
    else if (!w) hint = 'Ngoài tầm với — chạy tới vòng cyan (điểm rơi)';
    else hint = ctl.assist ? 'Nhả SPACE đúng vạch xanh. Chuột = hướng đánh, Q/E hoặc 1–5 = góc' : 'Giữ SPACE căn lực, nhả đúng vạch xanh. Chuột = hướng, Q/E = góc';
  } else if (G.phase === 'judging') hint = 'Trọng tài biên đang phán quyết…';
  else if (G.phase === 'over') hint = 'Hết trận';
  $('#hint').textContent = hint;
}

function updateJudgeHud(G) {
  const judging = G?.phase === 'judging' && G.landing;
  const called = judging && ctl.callRid === G.rid;
  $('#callIn').disabled = !judging || called; $('#callOut').disabled = !judging || called;
  $('#callIn').classList.toggle('sel', called && ctl.callVal === 'in');
  $('#callOut').classList.toggle('sel', called && ctl.callVal === 'out');
  $('#judgeHint').textContent = !G ? 'Chờ trận bắt đầu' : judging ? (called ? 'Đã gọi — chờ trọng tài còn lại' : 'Cầu đã rơi: nhìn vị trí vòng vàng so với vạch, gọi IN hay OUT') : 'Quan sát cầu bay, vòng vàng đánh dấu điểm rơi';
}

function cameraFor(info, G, tr) {
  const sc = S.scene, cur = S.cur;
  const smooth = 0.07;
  if (info) {
    const fwd = teamDir(info.team);
    if (innerWidth / innerHeight < 0.8) sc.followCamera([ctl.x * 0.4, 9.4, -fwd * 12.6], [ctl.x * 0.15, 0, fwd * 4.4], smooth);   // điện thoại dọc
    else sc.followCamera([ctl.x * 0.45, 7.4, -fwd * 13.8], [ctl.x * 0.15, 0.5, fwd * 3.5], smooth);
    return;
  }
  if (cur.role === 'judge') {
    const jp = cur.key === 'j0' ? [4.2, -7.9] : [-4.2, 7.9];
    if (G?.phase === 'judging' && G.landing) {
      const l = G.landing, sgn = l.z >= 0 ? 1 : -1;
      sc.followCamera([l.x + 2.6, 2.7, l.z + sgn * 3.2], [l.x, 0, l.z], 0.1);
    } else sc.followCamera([jp[0] * 1.5, 4.4, jp[1] * 1.25], [0, 0.4, 0], smooth);
    return;
  }
  const views = [
    [[0, 9.5, 15], [0, 0.4, -1]], [[0, 9.5, -15], [0, 0.4, 1]],
    [[11, 6.5, 0], [0, 0.6, 0]], [[0, 21, 3], [0, 0, 0]],
  ];
  const [p, l] = views[S.view];
  S.scene.followCamera(p, l, smooth);
}

// ------------------------------------------------------------------ bình luận
// Kênh "hall" (Sảnh) chung cho mọi người; kênh "c0".."c8" cho từng sân, chỉ theo dõi khi đang ở sân đó.
const CHAT_N = 60;
const isNarrow = () => matchMedia('(max-width: 760px)').matches;
const chat = { open: !isNarrow() && !TOUCH0, ch: 'hall', data: {}, seen: {}, subs: {}, since: {}, struck: new Set(), lastSend: 0 };
const ROLE_TXT = { player: 'VĐV', judge: 'TT biên', spec: 'Khán giả' };
const chName = (ch) => (ch === 'hall' ? 'Sảnh' : `Sân ${Number(ch.slice(1)) + 1}`);
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; };
const hhmm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

function chatMsgs(ch) {
  return Object.entries(chat.data[ch] || {})
    .map(([k, m]) => ({ k, ...m }))
    .filter((m) => typeof m.t === 'string' && typeof m.n === 'string' && Number.isFinite(m.ts))
    .map((m) => { const lb = locBay(m.t); return { ...m, t: lb.out, bay: !!m.b || lb.hit }; })
    .sort((a, b) => a.ts - b.ts || (a.k < b.k ? -1 : 1))
    .slice(-CHAT_N);
}
const lastTs = (ch) => { const l = chatMsgs(ch); return l.length ? l[l.length - 1].ts : 0; };
const unread = (ch) => chatMsgs(ch).filter((m) => m.ts > (chat.seen[ch] ?? Infinity) && m.u !== S.be.uid).length;
const markSeen = () => { chat.seen[chat.ch] = lastTs(chat.ch); };

function chatSub(ch) {
  if (chat.subs[ch]) return;
  chat.since[ch] = S.be.now() - 5000;
  chat.subs[ch] = S.be.onLast(`chat/${ch}`, CHAT_N, (v) => {
    chat.data[ch] = v || {};
    if (!(ch in chat.seen)) chat.seen[ch] = lastTs(ch);            // lịch sử cũ không tính là chưa đọc
    if (chat.open && ch === chat.ch) markSeen();
    for (const m of chatMsgs(ch)) {                                 // tin bậy mới đến → sét đánh người gửi
      if (m.bay && m.ts >= chat.since[ch] && !chat.struck.has(m.k)) { chat.struck.add(m.k); strikeFor(m); }
    }
    renderChat(false);
  });
}
function chatUnsub(ch) { chat.subs[ch]?.(); delete chat.subs[ch]; delete chat.data[ch]; delete chat.seen[ch]; }

// ---- sét đánh + tiếng sấm
let actx = null;
const wakeAudio = () => {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { actx = null; }
};
addEventListener('pointerdown', wakeAudio, { passive: true });
addEventListener('keydown', wakeAudio);
function noiseBurst(t, freq, q, peak, dur, type) {
  const n = Math.floor(actx.sampleRate * dur), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(actx.destination); src.start(t); src.stop(t + dur);
}
function thunder() {
  if (!actx || actx.state !== 'running') return;
  const t = actx.currentTime;
  noiseBurst(t, 3000, 0.7, 0.5, 0.25, 'highpass'); noiseBurst(t + 0.05, 220, 0.5, 0.9, 2.0, 'lowpass'); noiseBurst(t + 0.35, 90, 0.4, 0.8, 2.8, 'lowpass');
}
function strikeFor(m) {
  const mine = m.u === S.be.uid;
  const at = S.scene.findPerson(m.p);
  if (at) S.scene.strike(at.ci, at.key); else S.scene.flash();
  thunder();
  if (mine) navigator.vibrate?.([60, 40, 120]);
  toast(`⚡ ${mine ? 'Bạn' : m.n} vừa nói bậy và bị sét đánh!`, 3200, true);
}

function chatNote(t) { $('#chatNote').textContent = t; }

function renderChat(toBottom) {
  if (!S.be) return;
  const chans = ['hall', ...(S.cur ? [`c${S.cur.ci}`] : [])];
  if (!chans.includes(chat.ch)) chat.ch = chans[chans.length - 1];
  const total = Object.keys(chat.subs).reduce((a, ch) => a + (chat.open && ch === chat.ch ? 0 : unread(ch)), 0);
  const bd = $('#chatBadge'); bd.hidden = !total; bd.textContent = total > 9 ? '9+' : String(total);
  $('#chat').hidden = !chat.open;
  if (!chat.open) return;
  $('#chatTabs').innerHTML = chans.map((ch) => {
    const n = ch === chat.ch ? 0 : unread(ch);
    return `<button type="button" data-ch="${ch}" class="${ch === chat.ch ? 'on' : ''}">${chName(ch)}${n ? `<b class="cnt">${n}</b>` : ''}</button>`;
  }).join('');
  const box = $('#chatList'), keep = box.scrollTop;
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 48;
  const list = chatMsgs(chat.ch);
  box.innerHTML = list.length ? list.map((m) => {
    const mine = m.u === S.be.uid;
    const col = mine ? '' : ` style="color:hsl(${hue(m.u || m.n)} 70% 70%)"`;
    return `<div class="msg${mine ? ' me' : ''}${m.bay ? ' bay' : ''}">${m.r ? `<span class="rl">${esc(m.r)}</span>` : ''}<span class="who"${col}>${esc(m.n)}</span>${esc(m.t)}<span class="tm">${hhmm(m.ts)}</span>${m.bay ? '<span class="bay-tag">⚡ Nói bậy, đã bị sét đánh</span>' : ''}</div>`;
  }).join('') : `<p class="muted small">Chưa có bình luận ở ${chName(chat.ch)}.</p>`;
  box.scrollTop = toBottom || near ? box.scrollHeight : keep;
  $('#chatIn').placeholder = `Bình luận ở ${chName(chat.ch)}…`;
  fitChat();
}

/** Khung bình luận nằm bên trái, giữa thanh trên (hoặc băng vàng) và bảng chọn sân. */
function fitChat() {
  const c = $('#chat');
  if (c.hidden || isNarrow()) { c.style.top = ''; c.style.height = ''; return; }
  const bn = $('#banner'), br = bn.getBoundingClientRect();
  const top = br.height > 0 && br.left < 14 + 310 ? br.bottom + 8 : 58;
  const hall = $('#hall');
  const bottom = !hall.hidden ? hall.getBoundingClientRect().top - 10 : innerHeight - 14;
  c.style.top = `${top}px`;
  c.style.height = `${Math.max(150, Math.min(S.cur ? 460 : 420, bottom - top))}px`;
}
addEventListener('resize', fitChat);

function chatRole() {
  const cur = S.cur;
  if (!cur || chat.ch !== `c${cur.ci}`) return '';
  if (courtData(cur.ci)?.owner?.id === S.me.id) return 'Chủ sân';
  return ROLE_TXT[cur.role] || '';
}

async function sendChat() {
  const inp = $('#chatIn');
  const t = inp.value.replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!t) return;
  const now = performance.now();
  if (now - chat.lastSend < 1500) { chatNote('Gửi chậm lại một chút.'); return; }
  chat.lastSend = now;
  const lb = locBay(t);
  const msg = { n: S.me.name.slice(0, 14), t: lb.out, ts: Math.round(S.be.now()), u: S.be.uid, p: S.me.id };
  if (lb.hit) msg.b = true;
  const r = chatRole(); if (r) msg.r = r;
  inp.value = ''; chatNote('');
  try { await S.be.push(`chat/${chat.ch}`, msg); }
  catch (e) { console.warn(e); inp.value = t; chatNote('Chưa gửi được. Kiểm tra mạng rồi thử lại.'); }
}

$('#chatBtn').onclick = () => {
  chat.open = !chat.open;
  if (chat.open) markSeen();
  renderChat(true);
  if (chat.open && !isNarrow()) $('#chatIn').focus();
};
$('#chatClose').onclick = () => { chat.open = false; renderChat(false); };
$('#chatTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ch]'); if (!b) return;
  chat.ch = b.dataset.ch; markSeen(); renderChat(true);
});
$('#chatForm').addEventListener('submit', (e) => { e.preventDefault(); sendChat(); });
$('#chatIn').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur(); });

// ------------------------------------------------------------------ khởi động
async function boot() {
  const canv = $('#gl');
  S.scene = new Scene3D(canv);
  S.scene.onPickCourt = (i) => { if (!S.cur && S.me.name) openCourtDialog(i); };
  S.scene.hallView();
  $('#nameBtn').onclick = async () => { await askName(); };
  if (!S.me.name) await askName(); else $('#nameBtn').textContent = `👤 ${S.me.name}`;
  S.be = await createBackend({ forceLocal: new URLSearchParams(location.search).has('local') });
  const nm = $('#netMode');
  nm.textContent = S.be.mode === 'firebase' ? '● Trực tuyến' : '● Cục bộ';
  nm.className = `chip ${S.be.mode === 'firebase' ? 'fb' : 'local'}`;
  if (S.be.mode === 'local') {
    const b = $('#banner'); b.hidden = false;
    const why = {
      chuaCauHinh: 'Dán cấu hình Firebase vào js/config.js để chơi qua mạng.',
      anonTat: 'Firebase chưa bật đăng nhập ẩn danh (Authentication → Sign-in method → Anonymous).',
      tenMien: 'Tên miền này chưa có trong Firebase (Authentication → Settings → Authorized domains).',
      rules: 'Rules của Realtime Database chưa có nhánh "badminton" (xem database.rules.json).',
      khongTai: 'Không kết nối được Firebase, kiểm tra mạng rồi tải lại trang.',
    }[S.be.reason] || '';
    b.textContent = `Chế độ cục bộ: chỉ chơi giữa các tab cùng trình duyệt. ${why}`;
  }
  S.be.on('courts', onCourts);
  chatSub('hall');
  renderChat(true);
  window.__bm = { S, ctl, hitContext, myInfo, computePreview, chat, touchUI, autoTarget };
  requestAnimationFrame(frame);
  document.body.dataset.ready = '1';
}
boot().catch((e) => { console.error(e); document.body.dataset.error = String(e); });
