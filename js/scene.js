// Cảnh 3D: nhà thi đấu 9 sân (lưới 3×3), vận động viên, trọng tài biên, quả cầu.
// Toạ độ trong mỗi sân: x ngang sân, z dọc sân, lưới ở z=0, y hướng lên.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COURT } from './physics.js';

export const HALL = { cols: 3, dx: 11.2, dz: 21 };
export const courtOrigin = (i) => ({
  x: ((i % HALL.cols) - 1) * HALL.dx,
  z: (Math.floor(i / HALL.cols) - 1) * HALL.dz,
});
export const JUDGE_POS = { j0: [4.2, -7.9], j1: [-4.2, 7.9] };
export const STANDBY = {
  t0p0: [0, 4.6], t0p1: [2.0, 4.6], t1p0: [0, -4.6], t1p1: [-2.0, -4.6],
};
export const TEAM_COLOR = [0xd9433f, 0x2e74d6];
export const SPEC_COLOR = 0x8a63d2;
// Chỗ đứng của khán giả: hai biên dọc ngoài sân, mỗi bên 9 chỗ cách nhau 1,5 m
export const SPEC_X = 5.15, SPEC_PER_SIDE = 9;
export const specPos = (k) => {
  const side = k % 2 === 0 ? 1 : -1, idx = Math.floor(k / 2);
  return [side * SPEC_X, -6 + idx * 1.5];
};

const PX = 64;                                // điểm ảnh / mét của texture sân
const FLOOR_W = 9.4, FLOOR_L = 17.8;

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function courtTexture() {
  return canvasTex(Math.round(FLOOR_W * PX), Math.round(FLOOR_L * PX), (g, w, h) => {
    const X = (x) => (x + FLOOR_W / 2) * PX, Y = (z) => (z + FLOOR_L / 2) * PX;
    g.fillStyle = '#26466b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2f8056'; g.fillRect(X(-COURT.HW), Y(-COURT.HL), 2 * COURT.HW * PX, 2 * COURT.HL * PX);
    g.strokeStyle = '#f4f4f0'; g.lineWidth = 4; g.lineCap = 'butt';
    const line = (x1, z1, x2, z2) => { g.beginPath(); g.moveTo(X(x1), Y(z1)); g.lineTo(X(x2), Y(z2)); g.stroke(); };
    g.strokeRect(X(-COURT.HW), Y(-COURT.HL), 2 * COURT.HW * PX, 2 * COURT.HL * PX);
    line(-COURT.HSW, -COURT.HL, -COURT.HSW, COURT.HL);
    line(COURT.HSW, -COURT.HL, COURT.HSW, COURT.HL);
    for (const s of [-1, 1]) {
      line(-COURT.HW, s * COURT.SSL, COURT.HW, s * COURT.SSL);
      line(-COURT.HW, s * COURT.LSL_D, COURT.HW, s * COURT.LSL_D);
      line(0, s * COURT.SSL, 0, s * COURT.HL);
    }
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; line(-COURT.HW, 0, COURT.HW, 0);
  });
}

function netTexture() {
  return canvasTex(512, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(20,20,20,.85)'; g.lineWidth = 1.5;
    for (let x = 0; x <= w; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#fafafa'; g.fillRect(0, 0, w, 8);
  });
}

function labelSprite(w = 512, h = 192, scale = 5.6) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(scale, (scale * h) / w, 1);
  sp.userData = { ctx: c.getContext('2d'), tex, w, h };
  return sp;
}

function drawBoard(sp, { title, line1, line2, color }) {
  const { ctx: g, tex, w, h } = sp.userData;
  g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(10,16,28,.82)';
  g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 22); g.fill();
  g.fillStyle = color; g.fillRect(4, 4, 16, h - 8);
  g.fillStyle = '#fff'; g.font = 'bold 54px system-ui, sans-serif'; g.textBaseline = 'middle';
  g.fillText(title, 42, 52);
  g.fillStyle = '#cdd6e6'; g.font = '34px system-ui, sans-serif';
  g.fillText(line1 || '', 42, 108);
  g.fillText(line2 || '', 42, 150);
  tex.needsUpdate = true;
}

function drawTag(sp, text, color) {
  const { ctx: g, tex, w, h } = sp.userData;
  g.clearRect(0, 0, w, h);
  if (!text) { tex.needsUpdate = true; return; }
  g.fillStyle = 'rgba(10,16,28,.7)'; g.beginPath(); g.roundRect(2, 8, w - 4, h - 16, 14); g.fill();
  g.fillStyle = color; g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text.length > 16 ? text.slice(0, 15) + '…' : text, w / 2, h / 2 + 1);
  tex.needsUpdate = true;
}
function nameTag(text, color = '#fff', scale = 1.9) {
  const sp = labelSprite(256, 64, scale);
  drawTag(sp, text, color);
  return sp;
}

function makeAvatar(color, name, judge, opt = {}) {
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf0c9a4, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x222831, roughness: 0.9 });
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.85, 12), dark);
  legs.position.y = 0.43;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.27, 0.7, 14), mat);
  body.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), skin);
  head.position.y = 1.72;
  grp.add(legs, body, head);
  const arm = new THREE.Group();
  arm.position.set(0.3, 1.45, 0);
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 8), skin);
  upper.position.y = 0.0; upper.rotation.x = Math.PI / 2; upper.position.z = 0.27;
  arm.add(upper);
  if (opt.spec) {
    upper.rotation.x = 0.2; upper.position.set(0, -0.25, 0.05);     // tay buông, không vợt
  } else if (!judge) {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), dark);
    handle.rotation.x = Math.PI / 2; handle.position.z = 0.7;
    const head2 = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 6, 20), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
    head2.scale.set(0.85, 1.25, 1); head2.position.set(0, 0, 1.05); head2.rotation.y = Math.PI / 2;
    arm.add(handle, head2);
  } else {
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.28), new THREE.MeshBasicMaterial({ color: 0xffe14d, side: THREE.DoubleSide }));
    flag.position.set(0, 0.2, 0.6);
    arm.add(flag);
  }
  arm.rotation.x = -0.4;
  grp.add(arm);
  const tag = nameTag(name, opt.tagColor || (judge ? '#ffe14d' : '#fff'), opt.tagScale);
  tag.position.y = opt.spec ? 2.05 : 2.25;
  grp.add(tag);
  if (opt.spec) grp.scale.setScalar(0.88);
  grp.userData = { arm, tag, swingT: 9, x: 0, z: 0, tx: 0, tz: 0, name, judge, spec: !!opt.spec, pid: opt.pid || null, zap: 0, mats: null };
  return grp;
}

const UPV = new THREE.Vector3(0, 1, 0);
function makeBolt(a, b) {
  const g = new THREE.Group();
  const core = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0x8fb0ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
  const rnd = (v) => (Math.random() * 2 - 1) * v;
  const seg = (p, q, r) => {
    const d = q.clone().sub(p), len = d.length(), mid = p.clone().addScaledVector(d, 0.5); d.normalize();
    for (const [rr, m] of [[r, core], [r * 4, glow]]) {
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, len, 5, 1, true), m);
      cyl.position.copy(mid); cyl.quaternion.setFromUnitVectors(UPV, d); g.add(cyl);
    }
  };
  const path = (p, q, n, amp, r, branch) => {
    let prev = p.clone();
    for (let i = 1; i <= n; i++) {
      const pt = p.clone().lerp(q, i / n);
      if (i < n) { pt.x += rnd(amp); pt.z += rnd(amp); pt.y += rnd(amp) * 0.3; }
      seg(prev, pt, r);
      if (branch && i > 1 && i < n - 3 && Math.random() < 0.35) {
        path(pt, pt.clone().add(new THREE.Vector3(rnd(3), -2 - Math.random() * 2, rnd(3))), 4, amp * 0.6, r * 0.6, false);
      }
      prev = pt;
    }
  };
  path(a, b, 14, 0.8, 0.07, true);
  g.userData = { core, glow };
  return g;
}
function disposeBolt(g) {
  g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  g.userData.core.dispose(); g.userData.glow.dispose();
}
function charAvatar(a, mat, on) {
  a.traverse((o) => {
    if (!o.isMesh) return;
    if (on) { if (!o.userData.mat0) o.userData.mat0 = o.material; o.material = mat; }
    else if (o.userData.mat0) { o.material = o.userData.mat0; o.userData.mat0 = null; }
  });
}

export class Scene3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 2 });
    this.r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e1626);
    this.scene.fog = new THREE.Fog(0x0e1626, 80, 220);
    this.cam = new THREE.PerspectiveCamera(52, 1, 0.1, 400);
    this.controls = new OrbitControls(this.cam, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.minDistance = 12; this.controls.maxDistance = 140;
    this.mode = 'hall'; this.ci = -1;
    this.courts = [];
    this.onPickCourt = null;
    this.camPos = new THREE.Vector3(); this.camLook = new THREE.Vector3();
    this._ray = new THREE.Raycaster(); this._v = new THREE.Vector3();
    this.build();
    this.hallView();
    addEventListener('resize', () => this.resize());
    this.resize();
    // chọn sân trong sảnh
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (this.mode !== 'hall' || !down) return;
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
      const i = this.pickCourt(e.clientX, e.clientY);
      if (i >= 0 && this.onPickCourt) this.onPickCourt(i);
    });
  }

  build() {
    const S = this.scene;
    this.hemi = new THREE.HemisphereLight(0xdfe9ff, 0x3a3326, 1.05);
    S.add(this.hemi);
    this.strikeLight = new THREE.PointLight(0xbfd2ff, 0, 30, 1.6);
    S.add(this.strikeLight);
    this.bolts = []; this.flashAmt = 0;
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x15110f, roughness: 1 });
    const sun = new THREE.DirectionalLight(0xffffff, 1.1);
    sun.position.set(20, 60, 30); S.add(sun);
    const hall = new THREE.Mesh(new THREE.PlaneGeometry(76, 112), new THREE.MeshStandardMaterial({ color: 0x8c6b43, roughness: 0.9 }));
    hall.rotation.x = -Math.PI / 2; hall.position.y = -0.02; S.add(hall);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1b2638, roughness: 1, side: THREE.DoubleSide });
    for (const [w, x, z, ry] of [[76, 0, -56, 0], [76, 0, 56, 0], [112, -38, 0, Math.PI / 2], [112, 38, 0, Math.PI / 2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9), wallMat);
      m.position.set(x, 4.5, z); m.rotation.y = ry; S.add(m);
    }
    const floorTex = courtTexture(), netTex = netTexture();
    const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.75 });
    const netMat = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x9aa3b2, metalness: 0.4, roughness: 0.5 });
    for (let i = 0; i < 9; i++) {
      const o = courtOrigin(i);
      const group = new THREE.Group();
      group.position.set(o.x, 0, o.z);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR_W, FLOOR_L), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.userData.court = i; group.add(floor);
      const net = new THREE.Mesh(new THREE.PlaneGeometry(2 * COURT.HW, 0.76), netMat);
      net.position.y = 1.17; group.add(net);
      for (const s of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 1.55, 10), postMat);
        post.position.set(s * (COURT.HW + 0.02), 0.775, 0); group.add(post);
      }
      const board = labelSprite();
      board.position.set(0, 4.6, 0); group.add(board);
      drawBoard(board, { title: `SÂN ${i + 1}`, line1: 'Trống', line2: 'Bấm để vào sân', color: '#5b6b86' });
      S.add(group);
      this.courts.push({ group, board, avatars: {}, floor, rosterKey: '' });
    }
    // quả cầu + bóng + vòng điểm rơi + đường ngắm
    const sh = new THREE.Group();
    const feather = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.6 }));
    feather.position.y = -0.04;
    const cork = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8c48f }));
    cork.position.y = 0.075;
    sh.add(feather, cork); sh.visible = false;
    this.shuttle = sh;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }));
    this.shadow.rotation.x = -Math.PI / 2; this.shadow.visible = false;
    const ring = (c, r0, r1) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false; return m;
    };
    this.predRing = ring(0x4de3ff, 0.2, 0.28);
    this.markRing = ring(0xffd23f, 0.12, 0.2);
    this.reachRing = ring(0xffffff, 1.52, 1.6); this.reachRing.material.opacity = 0.25;
    this.aimRing = ring(0xffffff, 0.22, 0.3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 420), 3));
    lg.setDrawRange(0, 0);
    this.arc = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0x7dff9b, transparent: true, opacity: 0.9 }));
    this.arc.frustumCulled = false; this.arc.visible = false;
    this.fx = [this.shuttle, this.shadow, this.predRing, this.markRing, this.reachRing, this.aimRing, this.arc];
    this.fxParent = null;
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.fov = this.cam.aspect < 0.8 ? 68 : 52;            // điện thoại dọc: mở rộng góc nhìn để thấy hết bề ngang sân
    this.cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ camera / chế độ
  hallView() {
    this.mode = 'hall'; this.ci = -1;
    this.controls.enabled = true;
    for (const c of this.courts) c.board.visible = true;
    this.cam.position.set(0, 58, 47);
    this.controls.target.set(0, 0, 3);
    this.controls.update();
    this.attachFx(null);
  }
  enterCourt(i) {
    this.mode = 'court'; this.ci = i;
    this.controls.enabled = false;
    this.attachFx(this.courts[i].group);
    for (const c of this.courts) c.board.visible = false;
    const o = courtOrigin(i);
    this.camPos.set(o.x, 8, o.z + 14); this.camLook.set(o.x, 0.5, o.z);
    this.cam.position.copy(this.camPos);
  }
  attachFx(parent) {
    for (const o of this.fx) { if (o.parent) o.parent.remove(o); if (parent) parent.add(o); o.visible = false; }
    this.fxParent = parent;
  }
  /** Đặt camera mong muốn (toạ độ sân). smooth: hệ số nội suy mỗi khung hình. */
  followCamera(pos, look, smooth = 0.08) {
    if (this.ci < 0) return;
    const o = courtOrigin(this.ci);
    this._v.set(o.x + pos[0], pos[1], o.z + pos[2]);
    this.camPos.lerp(this._v, smooth);
    this._v.set(o.x + look[0], look[1], o.z + look[2]);
    this.camLook.lerp(this._v, smooth * 1.6);
    this.cam.position.copy(this.camPos);
    this.cam.lookAt(this.camLook);
  }

  // ------------------------------------------------------------ chọn / ngắm
  pickCourt(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    this._ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, this.cam);
    const hit = this._ray.intersectObjects(this.courts.map((c) => c.floor), false)[0];
    return hit ? hit.object.userData.court : -1;
  }
  /** Chiếu con trỏ xuống mặt sàn của sân hiện tại → [x,z] trong toạ độ sân. */
  pointerToCourt(cx, cy) {
    if (this.ci < 0) return null;
    const r = this.canvas.getBoundingClientRect();
    this._ray.setFromCamera({ x: ((cx - r.left) / r.width) * 2 - 1, y: -((cy - r.top) / r.height) * 2 + 1 }, this.cam);
    const o = courtOrigin(this.ci), d = this._ray.ray.direction, p = this._ray.ray.origin;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = -p.y / d.y;
    if (t < 0) return null;
    return [p.x + d.x * t - o.x, p.z + d.z * t - o.z];
  }

  // ------------------------------------------------------------ bảng điểm / vận động viên
  setBoard(i, info) { drawBoard(this.courts[i].board, info); }

  /** roster: { players:{slot:{name,bot,team}}, judges:{j0:name|null,j1:name|null}, selfKey } */
  setRoster(i, roster) {
    const c = this.courts[i];
    const want = {};
    const self = roster.selfId;
    for (const [k, p] of Object.entries(roster.players || {})) {
      want[k] = { name: p.bot ? `${p.name || 'Máy'} 🤖` : p.name, color: TEAM_COLOR[Number(k[1])], judge: false, pid: p.id };
    }
    for (const j of ['j0', 'j1']) {
      const n = roster.judges?.[j];
      want[j] = { name: n ? n.name : 'TT biên (máy)', color: n ? 0xffd23f : 0x8d97a8, judge: true, pid: n?.id };
    }
    // khán giả: xếp theo thời điểm vào xem (rồi theo id) để chỗ đứng ổn định
    const specs = Object.values(roster.specs || {}).filter((p) => p && p.id)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id < b.id ? -1 : 1));
    const maxSpec = SPEC_PER_SIDE * 2;
    specs.slice(0, specs.length > maxSpec ? maxSpec - 1 : maxSpec).forEach((p, k) => {
      want[`s_${p.id}`] = { name: p.name || 'Khách', color: SPEC_COLOR, spec: true, pid: p.id, pos: specPos(k), me: p.id === self };
    });
    const extra = specs.length > maxSpec ? specs.length - (maxSpec - 1) : 0;
    for (const [k, a] of Object.entries(c.avatars)) {
      const w = want[k];
      if (!w || a.userData.name !== w.name || a.userData.me !== !!w.me) { c.group.remove(a); delete c.avatars[k]; }
    }
    for (const [k, w] of Object.entries(want)) {
      let a = c.avatars[k];
      if (!a) {
        a = makeAvatar(w.color, w.name, w.judge, w.spec ? { spec: true, tagScale: 1.75, tagColor: w.me ? '#c8f542' : '#e3d7ff', pid: w.pid } : { pid: w.pid });
        const [x, z] = w.spec ? w.pos : w.judge ? JUDGE_POS[k] : STANDBY[k];
        Object.assign(a.userData, { x, z, tx: x, tz: z, me: !!w.me });
        a.position.set(x, 0, z);
        a.rotation.y = this.faceFor(k, x, z);
        c.group.add(a); c.avatars[k] = a;
      }
      a.userData.pid = w.pid || null;
      if (w.spec) { a.userData.tx = w.pos[0]; a.userData.tz = w.pos[1]; a.rotation.y = this.faceFor(k, w.pos[0], w.pos[1]); }
    }
    // "+N" khi quá 18 khán giả
    if (extra) {
      if (!c.more) { c.more = nameTag('', '#e3d7ff', 1.75); c.group.add(c.more); }
      const [x, z] = specPos(maxSpec - 1);
      c.more.position.set(x, 1.0, z);
      if (c.moreN !== extra) { c.moreN = extra; drawTag(c.more, `+${extra} người xem`, '#e3d7ff'); }
      c.more.visible = true;
    } else if (c.more) c.more.visible = false;
  }
  faceFor(k, x, z) {
    if (k[0] === 'j') return Math.atan2(-x, -z);
    if (k[0] === 's') return x > 0 ? -Math.PI / 2 : Math.PI / 2;      // khán giả nhìn vào giữa sân
    return k[1] === '0' ? Math.PI : 0;
  }
  /** Tìm avatar theo id người dùng → {ci, key} */
  findPerson(pid) {
    if (!pid) return null;
    for (let i = 0; i < this.courts.length; i++) {
      for (const [k, a] of Object.entries(this.courts[i].avatars)) if (a.userData.pid === pid) return { ci: i, key: k };
    }
    return null;
  }
  setAvatarTarget(i, k, x, z, instant) {
    const a = this.courts[i].avatars[k];
    if (!a) return;
    a.userData.tx = x; a.userData.tz = z;
    if (instant) { a.userData.x = x; a.userData.z = z; }
  }
  swing(i, k) { const a = this.courts[i]?.avatars[k]; if (a) a.userData.swingT = 0; }
  avatarPos(i, k) { const a = this.courts[i]?.avatars[k]; return a ? [a.userData.x, a.userData.z] : null; }

  // ------------------------------------------------------------ hiệu ứng
  setShuttle(vis, p, v) {
    this.shuttle.visible = vis; this.shadow.visible = vis;
    if (!vis) return;
    this.shuttle.position.set(p[0], p[1], p[2]);
    if (v) {
      this._v.set(v[0], v[1], v[2]);
      if (this._v.lengthSq() > 1e-4) this.shuttle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), this._v.normalize());
    }
    this.shadow.position.set(p[0], 0.015, p[2]);
    const s = Math.max(0.4, 1.2 - p[1] * 0.12);
    this.shadow.scale.set(s, s, s);
  }
  setRing(ring, p, colorHex) {
    const r = { pred: this.predRing, mark: this.markRing, aim: this.aimRing, reach: this.reachRing }[ring];
    r.visible = !!p;
    if (p) r.position.set(p[0], 0.02, p[1]);
    if (p && colorHex !== undefined) r.material.color.setHex(colorHex);
  }
  setArc(points, color) {
    if (!points) { this.arc.visible = false; return; }
    const attr = this.arc.geometry.attributes.position;
    const n = Math.min(points.length / 3, 420);
    attr.array.set(points.subarray ? points.subarray(0, n * 3) : points.slice(0, n * 3));
    attr.needsUpdate = true;
    this.arc.geometry.setDrawRange(0, n);
    this.arc.material.color.setHex(color);
    this.arc.visible = true;
  }

  // ------------------------------------------------------------ sét đánh người nói bậy
  /** Giáng sét xuống avatar `key` ở sân `ci`. Trả false nếu không tìm thấy avatar. */
  strike(ci, key) {
    const c = this.courts[ci], a = c?.avatars[key];
    if (!a) { this.flashAmt = 1; return false; }
    const o = courtOrigin(ci), sc = a.scale.x;
    const head = new THREE.Vector3(o.x + a.userData.x, 1.85 * sc, o.z + a.userData.z);
    const top = head.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 17, (Math.random() - 0.5) * 3));
    const bolt = makeBolt(top, head);
    this.scene.add(bolt);
    this.bolts.push({ bolt, t: 0, a });
    this.strikeLight.position.set(head.x, 3, head.z);
    if (!a.userData.zap) charAvatar(a, this.charMat, true);
    a.userData.zap = 3.2;
    return true;
  }
  /** Chớp sáng cả nhà thi đấu (khi người nói bậy không đứng ở sân nào). */
  flash() { this.flashAmt = 1; }

  updateFx(dt) {
    for (let n = this.bolts.length - 1; n >= 0; n--) {
      const b = this.bolts[n];
      b.t += dt;
      const on = b.t < 0.75 && Math.floor(b.t * 16) % 3 !== 2;
      b.bolt.visible = on;
      if (on) this.flashAmt = 1;
      this.strikeLight.intensity = on ? 40 : 0;
      if (b.t > 0.8) { this.scene.remove(b.bolt); disposeBolt(b.bolt); this.bolts.splice(n, 1); }
    }
    for (const c of this.courts) {
      for (const a of Object.values(c.avatars)) {
        const u = a.userData;
        if (u.zap > 0) {
          u.zap -= dt;
          a.position.y = u.zap > 2.6 ? Math.abs(Math.sin(u.zap * 40)) * 0.08 : 0;   // giật nảy lúc trúng sét
          if (u.zap <= 0) { u.zap = 0; a.position.y = 0; charAvatar(a, null, false); }
        }
      }
    }
    this.flashAmt = Math.max(0, this.flashAmt - dt * 4);
    this.hemi.intensity = 1.05 + this.flashAmt * 1.6;
  }

  update(dt) {
    this.updateFx(dt);
    const k = 1 - Math.exp(-11 * dt);
    for (const c of this.courts) {
      for (const [key, a] of Object.entries(c.avatars)) {
        const u = a.userData;
        u.x += (u.tx - u.x) * k; u.z += (u.tz - u.z) * k;
        a.position.x = u.x; a.position.z = u.z;
        if (u.swingT < 0.4) {
          u.swingT += dt;
          const f = Math.min(1, u.swingT / 0.22);
          u.arm.rotation.x = -2.4 + 3.2 * f;
        } else u.arm.rotation.x = -0.4;
        if (key[0] === 'j') a.rotation.y = this.faceFor(key, u.x, u.z);
      }
    }
    if (this.mode === 'hall') this.controls.update();
  }
  render() { this.r.render(this.scene, this.cam); }
}
