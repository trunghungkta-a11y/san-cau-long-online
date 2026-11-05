// Bộ điều hành trận đấu chạy trên máy của chủ sân. Người chơi chỉ gửi "ý định" (intent);
// host kiểm tra, tạo sự kiện cú đánh (shot) cho mọi người cùng mô phỏng, rồi xử lý điểm rơi,
// phán quyết của 2 trọng tài biên và tính điểm.
import {
  simulate, at, launchVel, assistSolve, powerToSpeed, windowFor, qualityOf, judgeLanding,
  HIT_RALLY, HIT_SERVE, QUALITY_NOISE, QUALITY_NAME, COURT, teamDir,
} from './physics.js';
import {
  newGame, pointWon, serverSlot, receiverSlot, serveSide, setupPositions, teamOfSlot, slotsOf,
} from './rules.js';

const TICK_MS = 40;
const JUDGE_WAIT_MS = 4500;
const BETWEEN_MS = 2800;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const num = (v, d) => (Number.isFinite(v) ? v : d);
const halfSign = (team) => -teamDir(team);               // dấu z của nửa sân đội `team`

export class Host {
  constructor(be, ci) {
    this.be = be; this.ci = ci;
    this.g = null; this.C = null;
    this.shot = null; this.traj = null; this.seq = 0;
    this.pending = null; this.lastTeam = -1; this.isServe = false;
    this.landing = null; this.calls = {}; this.lastIntent = {};
    this.bots = {}; this.botHit = null; this.botServeAt = 0;
    this.phaseUntil = 0; this.judgeDeadline = 0;
    this.timer = null; this.posTick = 0;
  }

  // ---------------------------------------------------------------- vòng đời
  start(C) {
    this.C = C;
    this.g = newGame(C.cfg.mode, C.cfg.target);
    Object.assign(this.g, { msg: '', msgSeq: 0, mid: this.be.now() });
    this.lastIntent = {};
    this.nextServe();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }
  stop() { clearInterval(this.timer); this.timer = null; this.g = null; }
  get active() { return !!this.g; }

  setCourt(C) {
    this.C = C;
    if (!this.g || !C || this.g.phase === 'over') return;
    // thiếu người giữa trận (rời sân/mất kết nối) → huỷ trận
    const missing = slotsOf(C.cfg.mode).filter((k) => !(C.players && C.players[k]));
    if (missing.length) this.abort('Có người rời sân, trận bị huỷ');
  }
  setCalls(c) { this.calls = c || {}; }
  setIntents(map) {
    if (!map || !this.g) return;
    for (const [pid, it] of Object.entries(map)) {
      if (!it || it.seq === undefined || it.mid !== this.g.mid || it.seq <= (this.lastIntent[pid] ?? -1)) continue;
      this.lastIntent[pid] = it.seq;
      this.onIntent(pid, it);
    }
  }

  abort(text) {
    const ci = this.ci;
    this.stop();
    this.be.remove(`shots/${ci}`);
    this.be.update(`courts/${ci}`, { state: 'lobby', game: null, notice: text });
  }

  publish() { this.be.set(`courts/${this.ci}/game`, this.g); }
  say(text) { this.g.msg = text; this.g.msgSeq = (this.g.msgSeq || 0) + 1; }
  playerOf(pid) { return this.C?.players?.[pid]; }
  isBot(pid) { return !!this.playerOf(pid)?.bot; }

  // ---------------------------------------------------------------- lượt giao
  nextServe() {
    const g = this.g;
    g.rid += 1; g.phase = 'serve'; g.serveFails = 0; g.landing = null; g.judge = null;
    g.serverPid = serverSlot(g); g.receiverPid = receiverSlot(g);
    g.side = serveSide(g); g.setup = setupPositions(g);
    this.shot = null; this.traj = null; this.pending = null; this.landing = null;
    this.lastTeam = -1; this.isServe = false; this.botHit = null;
    this.be.remove(`shots/${this.ci}`);
    // bot về vị trí xuất phát
    for (const [pid, [x, z]] of Object.entries(g.setup)) {
      if (this.isBot(pid)) this.bots[pid] = { x, z, tx: x, tz: z };
    }
    this.botServeAt = this.be.now() + 1300;
    this.publish();
    this.pushBotPos(true);
  }

  // ---------------------------------------------------------------- ý định từ người chơi
  onIntent(pid, it) {
    const g = this.g;
    if (!g || g.phase === 'over' || !this.playerOf(pid)) return;
    if (it.k === 'toss') this.handleToss(pid, it);
    else if (it.k === 'hit') this.handleHit(pid, it);
  }

  params(it) {
    return {
      power: clamp(num(it.power, 0.5), 0, 1),
      tx: clamp(num(it.tx, 0), -12, 12), tz: clamp(num(it.tz, 0), -12, 12),
      el: clamp(num(it.el, 30), -35, 80),
      assist: !!it.assist,
    };
  }

  handleToss(pid, it) {
    const g = this.g;
    if (g.phase !== 'serve' || pid !== g.serverPid || this.pending) return;
    const [sx, sz] = g.setup[pid];
    const px = clamp(num(it.px, sx), sx - 1.5, sx + 1.5), pz = clamp(num(it.pz, sz), sz - 1.5, sz + 1.5);
    this.pending = { pid, x: px, z: pz, ...this.params(it) };
    this.launch({ kind: 'toss', pid, team: teamOfSlot(pid), p: [px, 1.0, pz], v: [0, 3.3, 0] });
  }

  handleHit(pid, it) {
    const g = this.g, team = teamOfSlot(pid);
    if (!this.shot || !this.traj) return;
    const tRel = (num(it.t, this.be.now()) - this.shot.t0) / 1000;
    const land = this.traj.land;
    if (!land || tRel < 0.05 || tRel > land.t) return;

    // --- phát cầu: đánh quả cầu vừa tung
    if (g.phase === 'serve') {
      const pd = this.pending;
      if (!pd || pid !== pd.pid || this.shot.kind !== 'toss') return;
      const w = windowFor(this.traj, pd.x, pd.z, HIT_SERVE);
      if (!w || tRel < w.t1 - 0.08 || tRel > w.t2 + 0.08) return;
      const S = at(this.traj, clamp(tRel, w.t1, w.t2));
      g.phase = 'rally'; this.isServe = true; this.lastTeam = team;
      this.hitFrom(S, team, pid, pd, tRel - w.tStar, tRel);
      this.publish();
      return;
    }

    // --- rally
    if (g.phase !== 'rally' || team === this.lastTeam) return;
    if (this.isServe && pid !== g.receiverPid) return;
    const o = { ...HIT_RALLY, side: halfSign(team) };
    const px = num(it.px, 0), pz = num(it.pz, 0);
    if (pz * halfSign(team) < 0) return;
    const w = windowFor(this.traj, px, pz, o);
    if (!w || tRel < w.t1 - 0.03 || tRel > w.t2 + 0.03) return;      // đánh hụt
    const S = at(this.traj, tRel);
    this.lastTeam = team; this.isServe = false; this.botHit = null;
    this.hitFrom(S, team, pid, this.params(it), tRel - w.tStar, tRel);
  }

  /** Tính vận tốc xuất phát từ lực/hướng/góc người chơi chọn và chất lượng căn giờ. */
  hitFrom(S, team, pid, P, dtErr, tRel) {
    const q = qualityOf(dtErr), nz = QUALITY_NOISE[q];
    const dir = teamDir(team);
    let dx = P.tx - S[0], dz = P.tz - S[2];
    if (dz * dir < 0.6) dz = dir * 0.6;                    // luôn đánh về phía đối phương
    const dist = Math.hypot(dx, dz);
    const rot = (gauss() * nz.az * Math.PI) / 180;
    const c = Math.cos(rot), s = Math.sin(rot);
    [dx, dz] = [dx * c - dz * s, dx * s + dz * c];
    let el = P.el - dtErr * 20 + gauss() * nz.el;
    let speed;
    if (P.assist) {
      const r = assistSolve(S, dx, dz, el, dist);
      speed = r.speed; el = r.el;
    } else speed = powerToSpeed(P.power);
    speed *= 1 + gauss() * nz.sp;
    const t0 = this.shot.t0 + tRel * 1000;
    this.launch({
      kind: this.isServe && this.g.phase === 'rally' && this.shot.kind === 'toss' ? 'serve' : 'hit',
      pid, team, p: [S[0], S[1], S[2]], v: launchVel(speed, el, dx, dz), q, t0,
    });
    this.planBots();
  }

  launch({ kind, pid, team, p, v, q = null, t0 }) {
    const shot = {
      seq: ++this.seq, kind, pid, team, t0: t0 ?? this.be.now(),
      p: p.map((n) => +n.toFixed(4)), v: v.map((n) => +n.toFixed(4)), q,
    };
    this.shot = shot;
    this.traj = simulate(shot.p, shot.v, { net: kind !== 'toss' });
    this.be.set(`shots/${this.ci}`, shot);
  }

  // ---------------------------------------------------------------- vòng lặp
  tick() {
    const g = this.g;
    if (!g) return;
    const now = this.be.now();

    if (g.phase === 'serve' || g.phase === 'rally') {
      if (this.shot && this.traj?.land && now >= this.shot.t0 + this.traj.land.t * 1000) {
        if (this.shot.kind === 'toss') this.tossMissed(); else this.landed(now);
        return;
      }
      this.runBots(now);
    } else if (g.phase === 'judging') {
      this.checkJudging(now);
    } else if (g.phase === 'between' && now >= this.phaseUntil) {
      this.nextServe();
    }
  }

  tossMissed() {
    const g = this.g;
    g.serveFails += 1;
    if (g.serveFails < 3) {
      this.say(`Hỏng giao cầu (${g.serveFails}/3) — giao lại`);
      this.shot = null; this.traj = null; this.pending = null; this.botServeAt = this.be.now() + 900;
      this.be.remove(`shots/${this.ci}`);
      this.publish();
    } else {
      this.endRally(1 - teamOfSlot(g.serverPid), 'Lỗi giao cầu');
    }
  }

  landed(now) {
    const g = this.g, sh = this.shot, tr = this.traj;
    if (tr.net) { this.endRally(1 - sh.team, 'Cầu vào lưới'); return; }
    const land = { x: +tr.land.x.toFixed(3), z: +tr.land.z.toFixed(3) };
    const truth = judgeLanding(land, sh.team, g.mode, this.isServe, g.side);
    this.landing = { truth, hitter: sh.team, at: now };
    this.judgeDeadline = now + JUDGE_WAIT_MS;
    g.phase = 'judging';
    g.landing = { ...land, hitter: sh.team, serve: this.isServe };
    g.judge = null;
    this.publish();
  }

  checkJudging(now) {
    const g = this.g, L = this.landing;
    const c = [null, null], auto = [false, false];
    let waiting = false;
    for (let j = 0; j < 2; j++) {
      const human = this.C?.judges?.[`j${j}`];
      const call = this.calls?.[`j${j}`];
      if (human && call && call.mid === g.mid && call.rid === g.rid && (call.v === 'in' || call.v === 'out')) c[j] = call.v;
      else if (human) waiting = true;
      else { c[j] = L.truth; auto[j] = true; }
    }
    if (waiting && now < this.judgeDeadline) return;
    for (let j = 0; j < 2; j++) if (c[j] === null) { c[j] = L.truth; auto[j] = true; }
    const final = c[0] === c[1] ? c[0] : 'let';
    g.judge = { c, auto, final };
    const calls = `TT1 ${c[0].toUpperCase()}${auto[0] ? ' (máy)' : ''} · TT2 ${c[1].toUpperCase()}${auto[1] ? ' (máy)' : ''}`;
    if (final === 'in') this.endRally(L.hitter, `${calls} → IN`);
    else if (final === 'out') this.endRally(1 - L.hitter, `${calls} → OUT`);
    else this.endRally(null, `${calls} → bất đồng, đánh lại`);
  }

  endRally(winner, text) {
    const g = this.g;
    if (winner === null) {
      this.say(text);
    } else {
      pointWon(g, winner);
      this.say(`${text} — ${g.score[0]}:${g.score[1]}`);
    }
    if (g.phase === 'over') {
      this.publish();
      this.be.update(`courts/${this.ci}`, { state: 'finished' });
      clearInterval(this.timer); this.timer = null;
      return;
    }
    g.phase = 'between';
    this.phaseUntil = this.be.now() + BETWEEN_MS;
    this.publish();
  }

  // ---------------------------------------------------------------- bot
  pushBotPos(force) {
    const upd = {};
    for (const [pid, b] of Object.entries(this.bots)) {
      if (!this.isBot(pid)) continue;
      if (force || b.dirty) { upd[pid] = { x: +b.x.toFixed(2), z: +b.z.toFixed(2) }; b.dirty = false; }
    }
    if (Object.keys(upd).length) this.be.update(`pos/${this.ci}`, upd);
  }

  runBots(now) {
    const g = this.g;
    // di chuyển
    for (const [pid, b] of Object.entries(this.bots)) {
      if (!this.isBot(pid)) continue;
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      if (d > 0.02) {
        const step = Math.min(d, 5.0 * (TICK_MS / 1000));
        b.x += (dx / d) * step; b.z += (dz / d) * step; b.dirty = true;
      }
    }
    if (++this.posTick % 3 === 0) this.pushBotPos(false);

    // bot giao cầu
    if (g.phase === 'serve' && this.isBot(g.serverPid)) {
      if (!this.pending && now >= this.botServeAt) {
        const team = teamOfSlot(g.serverPid), b = this.bots[g.serverPid];
        const deep = g.mode === 'singles' ? 4.2 + Math.random() * 2 : 3.0 + Math.random() * 2.2;
        this.onIntent(g.serverPid, {
          k: 'toss', px: b.x, pz: b.z, power: 0.5, assist: true, el: 28,
          tx: -g.side * (0.8 + Math.random() * 1.6), tz: teamDir(team) * deep,
        });
        const w = this.pending && this.traj ? windowFor(this.traj, this.pending.x, this.pending.z, HIT_SERVE) : null;
        if (w) this.botHit = { pid: g.serverPid, at: this.shot.t0 + (w.tStar + gauss() * 0.03) * 1000, P: this.pending, seq: this.shot.seq };
      }
    }
    // bot đánh
    const bh = this.botHit;
    if (bh && this.shot && bh.seq === this.shot.seq && now >= bh.at) {
      this.botHit = null;
      const b = this.bots[bh.pid];
      this.onIntent(bh.pid, { k: 'hit', t: bh.at, px: b.x, pz: b.z, ...bh.P });
    }
  }

  /** Sau mỗi cú đánh, bot ở đội đối diện lập kế hoạch: chạy tới điểm cầu rơi tới tầm và đánh trả. */
  planBots() {
    const g = this.g;
    this.botHit = null;
    if (!this.shot || this.shot.kind === 'toss' || !this.traj?.land) return;
    const recvTeam = 1 - this.shot.team;
    const hs = halfSign(recvTeam), hx = g.mode === 'singles' ? COURT.HSW : COURT.HW;
    const land = this.traj.land;
    // bot bỏ qua cầu sẽ rơi ngoài rõ ràng
    const out = judgeLanding(land, this.shot.team, g.mode, this.isServe, g.side) === 'out';
    if (out && (Math.abs(land.x) > hx + 0.35 || Math.abs(land.z) > COURT.HL + 0.35 || land.z * hs <= 0)) return;

    // điểm dự kiến đánh: mẫu đầu tiên sau đỉnh quỹ đạo có độ cao ≤ 1.9 m
    const P = this.traj.pts;
    let idx = -1;
    for (let i = Math.ceil(0.2 * 120); i < this.traj.n - 1; i++) {
      if (P[3 * i + 1] <= 1.9 && P[3 * i + 1] >= 0.5 && P[3 * i + 2] * hs > 0.2) { idx = i; break; }
    }
    if (idx < 0) return;
    const tx = clamp(P[3 * idx], -(COURT.HW + 0.4), COURT.HW + 0.4);
    const rz = P[3 * idx + 2];
    const tz = hs > 0 ? clamp(rz, 0.4, 7.2) : clamp(rz, -7.2, -0.4);
    let best = null;
    for (const pid of slotsOf(g.mode)) {
      if (teamOfSlot(pid) !== recvTeam || !this.isBot(pid)) continue;
      if (this.isServe && pid !== g.receiverPid) continue;
      const b = this.bots[pid] || (this.bots[pid] = { x: 0, z: hs * 3, tx: 0, tz: hs * 3 });
      const d = Math.hypot(b.x - tx, b.z - tz);
      if (!best || d < best.d) best = { pid, b, d };
    }
    if (!best) return;
    best.b.tx = tx; best.b.tz = tz;
    const w = windowFor(this.traj, tx, tz, { ...HIT_RALLY, side: hs });
    if (!w) return;
    const el = [10, 24, 40, 48][Math.floor(Math.random() * 4)];
    const depth = 2.6 + Math.random() * 3.9;
    const P2 = {
      power: 0.6, assist: true, el,
      tx: (Math.random() * 2 - 1) * (hx - 0.6), tz: teamDir(recvTeam) * depth,
    };
    P2.tx += gauss() * 0.7; P2.tz += gauss() * 0.7;
    this.botHit = { pid: best.pid, at: this.shot.t0 + (w.tStar + gauss() * 0.09) * 1000, P: P2, seq: this.shot.seq };
  }
}
