// Vật lý quả cầu + hình học sân. Module thuần (không phụ thuộc trình duyệt) để cả
// chủ sân (host) lẫn mọi client mô phỏng ra cùng một quỹ đạo từ cùng một sự kiện đánh.

export const G = 9.81;
export const K_DRAG = 0.21;          // cản không khí bậc hai: vận tốc rơi tới hạn ≈ 6.8 m/s
export const DT = 1 / 120;

export const COURT = {
  HL: 6.7,          // nửa chiều dài sân (13.4 m)
  HW: 3.05,         // nửa chiều rộng sân đôi (6.1 m)
  HSW: 2.59,        // nửa chiều rộng sân đơn (5.18 m)
  SSL: 1.98,        // vạch giao cầu ngắn
  LSL_D: 5.94,      // vạch giao cầu dài (đôi)
  NET_MID: 1.524,
  NET_POST: 1.55,
};

export const HIT_RALLY = { R: 1.6, ymin: 0.25, ymax: 3.0, hpref: 1.8, tmin: 0.15, descOnly: false };
export const HIT_SERVE = { R: 0.9, ymin: 0.15, ymax: 1.15, hpref: 0.85, tmin: 0.2, descOnly: true };

export const SPEED_MIN = 7;
export const SPEED_MAX = 76;

export const teamDir = (t) => (t === 0 ? -1 : 1);     // hướng z mà đội t đánh tới
export const rightX = (t) => (t === 0 ? 1 : -1);      // phía "tay phải" của đội t trên trục x

export function netTop(x) {
  return COURT.NET_MID + (COURT.NET_POST - COURT.NET_MID) * Math.min(1, Math.abs(x) / COURT.HW) + 0.03;
}

/** Mô phỏng quỹ đạo từ p=[x,y,z], v=[vx,vy,vz]. Trả về {pts,n,land,net}. */
export function simulate(p, v, { maxT = 10, net = true } = {}) {
  let [x, y, z] = p;
  let [vx, vy, vz] = v;
  const pts = [x, y, z];
  let land = null;
  let netHit = false;
  const steps = Math.floor(maxT / DT);
  for (let i = 1; i <= steps; i++) {
    const sp = Math.hypot(vx, vy, vz);
    vx += -K_DRAG * sp * vx * DT;
    vy += (-G - K_DRAG * sp * vy) * DT;
    vz += -K_DRAG * sp * vz * DT;
    let nx = x + vx * DT, ny = y + vy * DT, nz = z + vz * DT;

    if (net && !netHit && z !== 0 && (z > 0) !== (nz > 0)) {
      const f = z / (z - nz);
      const xc = x + (nx - x) * f, yc = y + (ny - y) * f;
      if (yc < netTop(xc) && Math.abs(xc) < COURT.HW + 0.1) {
        netHit = true;
        nx = xc; ny = yc; nz = Math.sign(z) * 0.03;
        vx *= 0.1; vz = 0; vy = Math.min(vy, 0);
      }
    }
    if (ny <= 0) {
      const f = y / (y - ny || 1e-9);
      const lx = x + (nx - x) * f, lz = z + (nz - z) * f;
      pts.push(lx, 0, lz);
      land = { t: (i - 1 + f) * DT, x: lx, z: lz };
      break;
    }
    x = nx; y = ny; z = nz;
    pts.push(x, y, z);
  }
  const arr = Float32Array.from(pts);
  return { pts: arr, n: arr.length / 3, land, net: netHit };
}

/** Vị trí cầu tại thời điểm t (giây kể từ lúc đánh). Sau khi chạm đất thì nằm yên. */
export function at(traj, t, out = [0, 0, 0]) {
  const f = Math.max(0, t) / DT;
  const i = Math.min(traj.n - 1, Math.floor(f));
  const j = Math.min(traj.n - 1, i + 1);
  const a = f - i, P = traj.pts;
  out[0] = P[3 * i] + (P[3 * j] - P[3 * i]) * a;
  out[1] = P[3 * i + 1] + (P[3 * j + 1] - P[3 * i + 1]) * a;
  out[2] = P[3 * i + 2] + (P[3 * j + 2] - P[3 * i + 2]) * a;
  return out;
}

export function launchVel(speed, thetaDeg, dx, dz) {
  const th = (thetaDeg * Math.PI) / 180;
  const h = Math.hypot(dx, dz) || 1;
  const c = Math.cos(th) * speed;
  return [(dx / h) * c, Math.sin(th) * speed, (dz / h) * c];
}

/** Tìm tốc độ để cầu rơi cách điểm đánh đúng `dist` mét theo phương ngang (bỏ qua lưới). */
export function solveSpeed(p, dx, dz, thetaDeg, dist) {
  let lo = SPEED_MIN, hi = SPEED_MAX * 1.15;
  const range = (s) => {
    const tr = simulate(p, launchVel(s, thetaDeg, dx, dz), { net: false, maxT: 8 });
    return tr.land ? Math.hypot(tr.land.x - p[0], tr.land.z - p[2]) : 99;
  };
  if (range(hi) < dist) return hi;
  if (range(lo) > dist) return lo;
  for (let k = 0; k < 22; k++) {
    const mid = (lo + hi) / 2;
    if (range(mid) < dist) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export function powerToSpeed(power) {
  const p = Math.max(0, Math.min(1, power));
  return SPEED_MIN + (SPEED_MAX - SPEED_MIN) * Math.pow(p, 1.6);
}

/**
 * Trợ lực: từ góc `el` tối thiểu, tăng dần góc cho tới khi cầu qua lưới, rồi giải tốc độ để rơi đúng `dist`.
 * Trả {speed, el, ok}. ok=false nếu không thể qua lưới hoặc không với tới điểm đó.
 */
export function assistSolve(p, dx, dz, el, dist) {
  let last = null;
  for (let e = el; e <= 80; e += 2) {
    const speed = solveSpeed(p, dx, dz, e, dist);
    const tr = simulate(p, launchVel(speed, e, dx, dz));
    last = { speed, el: e, ok: false };
    if (tr.net || !tr.land) continue;
    const d = Math.hypot(tr.land.x - p[0], tr.land.z - p[2]);
    last.ok = Math.abs(d - dist) < Math.max(0.35, dist * 0.06);
    return last;
  }
  return last;
}

/**
 * Cửa sổ có thể đánh: những thời điểm mà cầu nằm trong tầm với của người chơi đứng ở (px,pz).
 * tStar là thời điểm đánh tốt nhất (gần nhất + độ cao ưa thích).
 */
export function windowFor(traj, px, pz, o) {
  let t1 = -1, t2 = -1, best = Infinity, tStar = -1;
  const P = traj.pts;
  for (let i = Math.ceil(o.tmin / DT); i < traj.n; i++) {
    const x = P[3 * i], y = P[3 * i + 1], z = P[3 * i + 2];
    if (y < o.ymin || y > o.ymax) continue;
    if (o.side && z * o.side < -0.05) continue;     // không với qua lưới
    if (o.descOnly && i + 1 < traj.n && P[3 * i + 4] > y) continue;
    const dh = Math.hypot(x - px, z - pz);
    if (dh > o.R) continue;
    const t = i * DT;
    if (t1 < 0) t1 = t;
    t2 = t;
    const c = dh + 0.15 * Math.abs(y - o.hpref);
    if (c < best) { best = c; tStar = t; }
  }
  return t1 < 0 ? null : { t1, t2, tStar };
}

export function qualityOf(dt) {
  const a = Math.abs(dt);
  if (a < 0.07) return 3;   // hoàn hảo
  if (a < 0.16) return 2;   // tốt
  if (a < 0.30) return 1;   // khá
  return 0;                 // yếu
}
export const QUALITY_NAME = ['Yếu', 'Khá', 'Tốt', 'Hoàn hảo'];
export const QUALITY_NOISE = [
  { az: 10, el: 12, sp: 0.12 },
  { az: 5, el: 6, sp: 0.07 },
  { az: 2, el: 2, sp: 0.03 },
  { az: 0.5, el: 0.5, sp: 0.01 },
];

/** Cầu rơi tại (x,z) có hợp lệ không? Trả 'in' | 'out'. serverSide = dấu x của người giao (chỉ dùng khi isServe). */
export function judgeLanding(land, hitterTeam, mode, isServe, serverSide) {
  const opp = teamDir(hitterTeam);               // nửa sân đối phương có dấu z = opp
  if (land.z * opp <= 0) return 'out';
  const hx = mode === 'singles' ? COURT.HSW : COURT.HW;
  const az = Math.abs(land.z), ax = Math.abs(land.x);
  if (ax > hx || az > COURT.HL) return 'out';
  if (isServe) {
    if (az < COURT.SSL) return 'out';
    if (mode === 'doubles' && az > COURT.LSL_D) return 'out';
    if (land.x * -serverSide < 0) return 'out';  // phải rơi ở ô chéo
  }
  return 'in';
}
