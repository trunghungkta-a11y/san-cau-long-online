import assert from 'node:assert/strict';
import { newGame, pointWon, serverSlot, receiverSlot, serveSide, setupPositions } from '../js/rules.js';
import { judgeLanding, simulate, launchVel, netTop, windowFor, HIT_RALLY, at } from '../js/physics.js';

// --- Đơn: người giao đứng ô phải khi chẵn, ô trái khi lẻ; ô giao luôn chéo
let g = newGame('singles', 21);
assert.equal(serverSlot(g), 't0p0');
assert.equal(serveSide(g), 1);                // đội 0 (z>0) tay phải = +x
pointWon(g, 0);                               // đội giao thắng → giao tiếp, ô trái
assert.equal(g.srv, 0); assert.equal(serveSide(g), -1);
pointWon(g, 1);                               // đội đỡ thắng → đổi giao, đội 1 có 1 điểm → ô trái
assert.equal(g.srv, 1);
assert.equal(serveSide(g), -(-1));            // rightX(1)=-1, điểm lẻ → +1
assert.deepEqual(g.score, [1, 1]);

// --- Đôi: đội giao thắng thì hai người đổi ô; đội đỡ thắng thì không đổi
g = newGame('doubles', 21);
assert.equal(serverSlot(g), 't0p0'); assert.equal(receiverSlot(g), 't1p0');
pointWon(g, 0);
assert.deepEqual(g.pos[0], [1, 0]);
assert.equal(serverSlot(g), 't0p0');          // điểm lẻ → ô trái, người ở ô trái giờ là p0 (đã đổi)
assert.equal(receiverSlot(g), 't1p1');        // ô trái của đội 1
pointWon(g, 1);                               // đội 1 giành giao, đội 1 có 1 điểm → ô trái → người ở ô trái = p1
assert.equal(g.srv, 1); assert.equal(serverSlot(g), 't1p1');
assert.deepEqual(g.pos[1], [0, 1]);

// --- Kết thúc ván: 21 cách 2, và trần 30
g = newGame('singles', 21);
g.score = [20, 20]; pointWon(g, 0); assert.equal(g.phase, 'serve');
pointWon(g, 0); assert.equal(g.phase, 'over'); assert.equal(g.winner, 0);
g = newGame('singles', 21); g.score = [29, 29]; pointWon(g, 1); assert.equal(g.phase, 'over');
g = newGame('singles', 11); g.score = [10, 10]; pointWon(g, 0); assert.equal(g.phase, 'serve');

// --- Vị trí xuất phát: người giao ở nửa sân của mình, người đỡ ở ô chéo
g = newGame('doubles', 21);
const sp = setupPositions(g);
assert.ok(sp.t0p0[1] > 0 && sp.t1p0[1] < 0);
assert.ok(sp.t0p0[0] * sp.t1p0[0] < 0, 'người giao và người đỡ phải ở hai phía x đối nhau');
assert.equal(Object.keys(sp).length, 4);

// --- Chấm điểm vị trí rơi
const L = (x, z) => ({ x, z });
assert.equal(judgeLanding(L(0, -6.6), 0, 'singles', false, 1), 'in');
assert.equal(judgeLanding(L(2.6, -3), 0, 'singles', false, 1), 'out');   // ngoài biên dọc đơn
assert.equal(judgeLanding(L(2.6, -3), 0, 'doubles', false, 1), 'in');    // trong biên đôi
assert.equal(judgeLanding(L(0, 3), 0, 'singles', false, 1), 'out');      // rơi nửa sân mình
assert.equal(judgeLanding(L(0, -6.8), 0, 'singles', false, 1), 'out');   // ngoài vạch cuối
// giao cầu: đội 0 ở x>0 phải giao sang x<0 (ô chéo), qua vạch giao ngắn
assert.equal(judgeLanding(L(-1, -3), 0, 'doubles', true, 1), 'in');
assert.equal(judgeLanding(L(1, -3), 0, 'doubles', true, 1), 'out');      // cùng bên
assert.equal(judgeLanding(L(-1, -1.5), 0, 'doubles', true, 1), 'out');   // chưa qua vạch giao ngắn
assert.equal(judgeLanding(L(-1, -6.3), 0, 'doubles', true, 1), 'out');   // quá vạch giao dài đôi
assert.equal(judgeLanding(L(-1, -6.3), 0, 'singles', true, 1), 'in');    // đơn: được giao sâu

// --- Lưới
const tr = simulate([0, 1.0, 2.4], launchVel(20, 5, 0, -1));
assert.ok(tr.net, 'cầu thấp phải dính lưới');
assert.ok(netTop(0) > 1.52);
const hi = simulate([0, 1.8, 3], launchVel(30, 45, 0, -1));
assert.ok(!hi.net && hi.land.z < 0);

// --- Cửa sổ đánh: người đứng đúng dưới quỹ đạo thì có cửa sổ, đứng xa thì không
const rally = simulate([0, 2, 5.5], launchVel(45, 45, 0, 1)); // đội 1 đánh về +z? (z tăng) → rơi nửa sân đội 0
const land = rally.land;
const w1 = windowFor(rally, land.x, land.z, HIT_RALLY);
assert.ok(w1 && w1.t2 <= land.t && w1.tStar >= w1.t1 && w1.tStar <= w1.t2);
assert.equal(windowFor(rally, land.x + 6, land.z, HIT_RALLY), null);
const mid = at(rally, w1.tStar);
assert.ok(mid[1] >= 0.25 && mid[1] <= 3.0);

console.log('rules + physics: tất cả test đạt');
