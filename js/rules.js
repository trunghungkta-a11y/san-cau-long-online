// Luật cầu lông: tính điểm rally, luân phiên giao cầu, vị trí xuất phát. Module thuần.
import { rightX, teamDir } from './physics.js';

export const slotKey = (team, idx) => `t${team}p${idx}`;
export const slotsOf = (mode) =>
  mode === 'doubles' ? ['t0p0', 't0p1', 't1p0', 't1p1'] : ['t0p0', 't1p0'];
export const teamOfSlot = (key) => Number(key[1]);
export const idxOfSlot = (key) => Number(key[3]);

export function newGame(mode, target) {
  return {
    mode, target,
    score: [0, 0],
    srv: 0,                      // đội đang giao
    pos: [[0, 1], [0, 1]],       // pos[đội][0=ô phải,1=ô trái] = chỉ số người đứng ở ô đó
    rid: 0,
    phase: 'serve',
    winner: null,
  };
}

/** Người giao cầu: đứng ở ô phải khi điểm đội giao chẵn, ô trái khi lẻ. */
export function serverSlot(g) {
  const court = g.score[g.srv] % 2;
  const idx = g.mode === 'doubles' ? g.pos[g.srv][court] : 0;
  return slotKey(g.srv, idx);
}

/** Người đỡ giao cầu: đứng ở ô chéo (cùng chỉ số ô phải/trái tính theo điểm đội giao). */
export function receiverSlot(g) {
  const court = g.score[g.srv] % 2;
  const u = 1 - g.srv;
  const idx = g.mode === 'doubles' ? g.pos[u][court] : 0;
  return slotKey(u, idx);
}

/** Dấu x của ô giao cầu (phía tay phải của đội giao nếu điểm chẵn). */
export function serveSide(g) {
  const s = rightX(g.srv);
  return g.score[g.srv] % 2 === 0 ? s : -s;
}

/** Đội `w` thắng rally. Đội giao thắng thì đổi ô, đội đỡ thắng thì giành quyền giao. */
export function pointWon(g, w) {
  g.score[w] += 1;
  if (w === g.srv) {
    if (g.mode === 'doubles') g.pos[w] = [g.pos[w][1], g.pos[w][0]];
  } else {
    g.srv = w;
  }
  const o = 1 - w, cap = g.target + 9;
  const a = g.score[w], b = g.score[o];
  if ((a >= g.target && a - b >= 2) || a >= cap) { g.phase = 'over'; g.winner = w; }
  return g;
}

/** Vị trí xuất phát (x,z trong hệ toạ độ sân) cho từng người ở lượt giao hiện tại. */
export function setupPositions(g) {
  const out = {};
  const t = g.srv, u = 1 - t;
  const xs = serveSide(g);
  const zt = -teamDir(t), zu = -teamDir(u);       // dấu z nửa sân của mỗi đội
  const srv = serverSlot(g), rec = receiverSlot(g);
  out[srv] = [xs * 1.5, zt * 2.4];
  out[rec] = [-xs * 1.5, zu * 3.2];
  if (g.mode === 'doubles') {
    out[slotKey(t, 1 - Number(srv[3]))] = [-xs * 1.5, zt * 2.2];
    out[slotKey(u, 1 - Number(rec[3]))] = [xs * 1.5, zu * 1.8];
  }
  return out;
}
