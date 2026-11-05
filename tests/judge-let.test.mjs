// Hai trọng tài người gọi khác nhau → "đánh lại" (không đổi điểm, cùng người giao).
import { createBackend } from '../js/backend.js';
import { Host } from '../js/host.js';
const be = await createBackend({ forceLocal: true });
const C = { owner: { id: 'x' }, cfg: { mode: 'singles', target: 11 }, state: 'playing',
  players: { t0p0: { bot: 1, name: 'A' }, t1p0: { bot: 1, name: 'B' } },
  judges: { j0: { id: 'j0', name: 'TT1' }, j1: { id: 'j1', name: 'TT2' } } };
await be.set('courts/0', C);
const host = new Host(be, 0);
host.planBots = () => {};            // bot đỡ không đánh trả: cầu rơi ngay sau giao cầu
host.start(C);
const seen = [];
be.on('courts/0/game', (g) => {
  if (!g) return;
  host.setCalls({ j0: { mid: g.mid, rid: g.rid, v: 'in' }, j1: { mid: g.mid, rid: g.rid, v: 'out' } });
  if (g.msgSeq && !seen.includes(g.msgSeq)) seen.push(g.msgSeq), console.log('•', g.msg, '| điểm', g.score, '| rid', g.rid);
});
await new Promise((r) => setTimeout(r, 30000));
const g = await be.get('courts/0/game');
console.log('điểm cuối', g.score, 'rid', g.rid);
const ok = seen.length && g.score[0] === 0 && g.score[1] === 0 && g.rid > 1;
console.log(ok ? 'ĐẠT: bất đồng → đánh lại, điểm không đổi, giao lại' : 'KHÔNG ĐẠT');
host.stop(); process.exit(ok ? 0 : 1);
