import { createBackend } from '../js/backend.js';
import { Host } from '../js/host.js';
const mode = process.argv[2] || 'singles';
const secs = Number(process.argv[3] || 50);
const be = await createBackend({ forceLocal: true });
const ci = 0;
const players = mode === 'doubles'
  ? { t0p0:{bot:1,name:'A1'}, t0p1:{bot:1,name:'A2'}, t1p0:{bot:1,name:'B1'}, t1p1:{bot:1,name:'B2'} }
  : { t0p0:{bot:1,name:'A'}, t1p0:{bot:1,name:'B'} };
const C = { owner:{id:'x'}, cfg:{mode,target:11}, state:'playing', players, judges:{} };
await be.set(`courts/${ci}`, C);
const host = new Host(be, ci);
host.start(C);
let lastMsg = 0, shots = 0, t0 = Date.now();
be.on(`courts/${ci}/game`, g => {
  if (g && g.msgSeq !== lastMsg) { lastMsg = g.msgSeq; console.log(`[${((Date.now()-t0)/1000).toFixed(1)}s] ${g.msg}  | giao: ${g.serverPid} ${g.phase}`); }
});
be.on(`shots/${ci}`, s => { if (s && s.kind !== 'toss') shots++; });
await new Promise(r => setTimeout(r, secs*1000));
const g = await be.get(`courts/${ci}/game`);
console.log('--- điểm', g.score, 'phase', g.phase, 'số cú đánh', shots, 'thắng', g.winner);
host.stop(); process.exit(0);
