"""Kiểm tra E2E: chủ sân (người chơi giả lập) vs bot, 2 trọng tài biên là 2 tab khác (chế độ cục bộ)."""
import sys, time, json, subprocess, os, re
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.environ['VENDOR']            # thư mục chứa node_modules/three
OUT = os.environ['OUT']
DURATION = int(os.environ.get('DURATION', '70'))
MODE = os.environ.get('MODE', 'singles')
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

DRIVER = r"""
(() => {
  const B = window.__bm; const st = { seq: -1 };
  const key = (t) => window.dispatchEvent(new KeyboardEvent(t, { code: 'Space', key: ' ' }));
  window.__drv = { hits: 0, tosses: 0 };
  const rel = (S) => (S.be.now() - S.shot.t0) / 1000;
  setInterval(() => {
    const info = B.myInfo(); if (!info) return;
    const { G } = info, S = B.S, ctl = B.ctl;
    if (G.phase === 'serve' && info.key === G.serverPid) {
      if (!S.shot) {
        if (!st.toss) { st.toss = true; key('keydown'); setTimeout(() => { key('keyup'); window.__drv.tosses++; }, 140); }
      } else if (S.shot.kind === 'toss') {
        st.toss = false;
        const hc = B.hitContext(info, rel(S));
        if (hc && hc.w && st.seq !== S.shot.seq && rel(S) >= hc.w.tStar - 0.2) {
          st.seq = S.shot.seq; key('keydown');
          setTimeout(() => { key('keyup'); window.__drv.hits++; }, Math.max(0, (hc.w.tStar + 0.01 - rel(S)) * 1000));
        }
      }
    } else if (G.phase === 'rally' && S.shot && S.shot.team !== info.team && S.traj && S.traj.land && st.seq !== S.shot.seq) {
      const L = S.traj.land, half = info.team === 0 ? 1 : -1;
      ctl.x = Math.max(-3.6, Math.min(3.6, L.x));
      ctl.z = Math.sign(L.z) === half ? half * Math.max(0.6, Math.min(7.2, Math.abs(L.z))) : half * 1.0;
      ctl.aim = [(Math.random() * 2 - 1) * 2.2, -half * (2.5 + Math.random() * 3.5)];
      ctl.el = [8, 22, 45][Math.floor(Math.random() * 3)];
      const hc = B.hitContext(info, rel(S));
      if (hc && hc.w && rel(S) >= hc.w.tStar - 0.35) {
        st.seq = S.shot.seq;
        key('keydown');
        const jit = (S.shot.seq % 3 === 0) ? 0.12 : 0.02;
        setTimeout(() => { key('keyup'); window.__drv.hits++; }, Math.max(0, (hc.w.tStar + jit - rel(S)) * 1000));
      }
    }
  }, 8);
})();
"""

JUDGE = r"""
(async () => {
  const P = await import('/js/physics.js');
  const B = window.__bm; let lastRid = -1; window.__calls = 0;
  setInterval(() => {
    const cur = B.S.cur; if (!cur || cur.role !== 'judge') return;
    const C = B.S.courts[cur.ci], G = C && C.game;
    if (!G || G.phase !== 'judging' || !G.landing || B.ctl.callRid === G.rid) return;
    const truth = P.judgeLanding(G.landing, G.landing.hitter, G.mode, G.landing.serve, G.side);
    setTimeout(() => { window.dispatchEvent(new KeyboardEvent('keydown', { code: truth === 'in' ? 'KeyZ' : 'KeyX' })); window.__calls++; }, 400 + Math.random() * 800);
  }, 120);
})();
"""

errors = []
def hook(page, tag):
    page.on('pageerror', lambda e: errors.append(f'[{tag}] pageerror: {e}'))
    page.on('console', lambda m: errors.append(f'[{tag}] console.{m.type}: {m.text}') if m.type in ('error',) else None)

def route_three(route):
    url = route.request.url
    m = re.search(r'three@0\.160\.0/(.*)$', url)
    path = os.path.join(VENDOR, 'node_modules', 'three', m.group(1))
    route.fulfill(path=path, content_type='application/javascript')

with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'])
    ctx = br.new_context(viewport={'width': 960, 'height': 540})
    ctx.route('**/cdn.jsdelivr.net/npm/three@0.160.0/**', route_three)

    def new_page(name, tag):
        pg = ctx.new_page(); hook(pg, tag)
        pg.add_init_script(f"localStorage.bm_name = {json.dumps(name)};")
        pg.goto('http://127.0.0.1:8765/index.html?local=1')
        pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
        return pg

    owner = new_page('Hưng', 'owner')
    owner.wait_for_timeout(600)
    owner.screenshot(path=f'{OUT}/01-hall.png')
    owner.click('[data-court="0"]'); owner.wait_for_selector('#claimGo')
    owner.click('#claimGo'); owner.wait_for_selector('#roster')
    if MODE == 'doubles':
        owner.click('#roster [data-act="mode"][data-v="doubles"]'); owner.wait_for_selector('#roster [data-act="addbot"][data-k="t0p1"]')
        for k in ('t0p1', 't1p0', 't1p1'): owner.click(f'#roster [data-act="addbot"][data-k="{k}"]')
    else:
        owner.click('#roster [data-act="addbot"][data-k="t1p0"]')
    owner.wait_for_selector('#roster [data-act="start"]:not([disabled])')
    owner.wait_for_timeout(400)
    owner.screenshot(path=f'{OUT}/02-lobby.png')

    j1 = new_page('TT Một', 'judge1'); j1.wait_for_timeout(500)
    j1.click('[data-court="0"]'); j1.wait_for_selector('.opt[data-k="j0"]'); j1.click('.opt[data-k="j0"]')
    j1.wait_for_selector('#judgeHud:not([hidden])')
    j2 = new_page('TT Hai', 'judge2'); j2.wait_for_timeout(500)
    j2.click('[data-court="0"]'); j2.wait_for_selector('.opt[data-k="j1"]'); j2.click('.opt[data-k="j1"]')
    j2.wait_for_selector('#judgeHud:not([hidden])')
    for j in (j1, j2): j.evaluate(JUDGE)
    owner.wait_for_timeout(500)
    owner.screenshot(path=f'{OUT}/03-lobby-with-judges.png')

    owner.click('#roster [data-act="start"]')
    owner.wait_for_selector('#playHud:not([hidden])', timeout=8000)
    owner.evaluate(DRIVER)
    fps = owner.evaluate("new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })")
    print('FPS (render phần mềm):', fps)
    t0 = time.time(); shots = 0; snap = 0; seen = set(); pushed = False
    while time.time() - t0 < DURATION:
        owner.wait_for_timeout(500)
        st = owner.evaluate("(() => { const B = window.__bm; const C = B.S.courts[0]; const G = C && C.game; return G ? {score: G.score, phase: G.phase, rid: G.rid, srv: G.srv, msg: G.msg, state: C.state, d: window.__drv} : null })()")
        if st and st['msg'] and st['msg'] not in seen:
            seen.add(st['msg']); print(f"[{time.time()-t0:4.0f}s] {st['msg']}   (rid {st['rid']}, {st['phase']})")
        if not pushed and time.time() - t0 > 22:
            pushed = True
            owner.evaluate("(() => { const h = window.__bm.S.host; h.g.score = [19, 19]; h.publish(); })()")
            print(f"[{time.time()-t0:4.0f}s] (test) đặt điểm 19-19 để thử luật hơn 2 điểm")
        if snap < 4 and time.time() - t0 > 6 + snap * 12:
            snap += 1
            owner.screenshot(path=f'{OUT}/10-play-{snap}.png'); j1.bring_to_front(); j1.wait_for_timeout(250); j1.screenshot(path=f'{OUT}/11-judge-{snap}.png'); owner.bring_to_front()
        if st and st['state'] == 'finished': break
    st = owner.evaluate("(() => { const B = window.__bm; const C = B.S.courts[0]; return {score: C.game.score, state: C.state, phase: C.game.phase, drv: window.__drv, judgeCalls: 0} })()")
    calls = [j.evaluate('window.__calls') for j in (j1, j2)]
    print('KẾT QUẢ', json.dumps(st, ensure_ascii=False), 'số lần TT gọi', calls)
    owner.screenshot(path=f'{OUT}/20-end.png')
    if st['state'] == 'finished':
        owner.click('#roster [data-act="rematch"]'); owner.wait_for_timeout(600)
        print('Sau "Chơi lại":', owner.evaluate("window.__bm.S.courts[0].state"), '| game =', owner.evaluate("window.__bm.S.courts[0].game"))
    # sảnh sau khi thoát
    owner.click('#leaveBtn'); owner.wait_for_selector('#hall:not([hidden])'); owner.wait_for_timeout(400)
    owner.screenshot(path=f'{OUT}/30-hall-after.png')
    left = owner.evaluate("window.__bm.S.courts[0]")
    print('Sân 1 sau khi chủ sân rời:', left)
    br.close()
srv.terminate()
print('--- lỗi trình duyệt:', len(errors))
for e in errors[:15]: print(e)
