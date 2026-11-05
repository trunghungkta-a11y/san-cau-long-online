"""Kiểm tra điều khiển điện thoại (chế độ cục bộ): tự chạy + vuốt để đánh với đối thủ máy,
khán giả hiện ở rìa sân, bình luận bậy bị che chữ và sét đánh."""
import os, re, sys, subprocess, time, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR = os.environ['VENDOR']; OUT = os.environ['OUT']; DURATION = int(os.environ.get('DURATION', '40'))
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8769', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
BASE = 'http://127.0.0.1:8769/index.html?local=1'

def rt(r):
    m = re.search(r'three@0\.160\.0/(.*)$', r.request.url)
    r.fulfill(path=os.path.join(VENDOR, 'node_modules', 'three', m.group(1)), content_type='application/javascript')

# Ngón tay giả: khi cầu sắp vào tầm thì vuốt lên ở nửa phải, nhả ở thời điểm tStar (hoặc sớm 0,3 s mỗi cú thứ 3
# để thử phần đệm nhả sớm). Không điều khiển di chuyển: để "Tự chạy" làm.
DRIVER = r"""
(() => {
  const B = window.__bm, pad = document.querySelector('#touch');
  const fire = (type, x, y) => pad.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, isPrimary: true }));
  const st = { seq: -1, n: 0 }; window.__drv = { swipes: 0, early: 0 };
  const rel = () => (B.S.be.now() - B.S.shot.t0) / 1000;
  setInterval(() => {
    const info = B.myInfo(); if (!info) return;
    const { G } = info, S = B.S, W = innerWidth, H = innerHeight;
    const swipe = (delayMs) => {
      const x0 = W * 0.75, y0 = H * 0.62, dx = (Math.random() * 2 - 1) * W * 0.12, dy = -H * (0.08 + Math.random() * 0.2);
      fire('pointerdown', x0, y0);
      setTimeout(() => fire('pointermove', x0 + dx / 2, y0 + dy / 2), Math.max(0, delayMs / 2));
      setTimeout(() => { fire('pointermove', x0 + dx, y0 + dy); fire('pointerup', x0 + dx, y0 + dy); window.__drv.swipes++; }, Math.max(0, delayMs));
    };
    if (G.phase === 'serve' && info.key === G.serverPid) {
      if (!S.shot) { if (!st.toss) { st.toss = true; swipe(120); } }
      else if (S.shot.kind === 'toss') {
        st.toss = false;
        const hc = B.hitContext(info, rel());
        if (hc && hc.w && st.seq !== S.shot.seq && rel() >= hc.w.tStar - 0.2) { st.seq = S.shot.seq; swipe((hc.w.tStar - rel()) * 1000); }
      }
    } else if (G.phase === 'rally' && S.shot && S.shot.team !== info.team && S.traj && S.traj.land && st.seq !== S.shot.seq) {
      const hc = B.hitContext(info, rel());
      const early = (++st.n % 3 === 0);
      if (hc && hc.w && rel() >= hc.w.tStar - 0.45) {
        st.seq = S.shot.seq;
        if (early) window.__drv.early++;
        swipe(Math.max(0, (hc.w.tStar - (early ? 0.3 : 0) - rel()) * 1000));
      }
    }
  }, 8);
})();
"""

errors = []
with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = br.new_context(viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, device_scale_factor=2)
    ctx.route('**/cdn.jsdelivr.net/npm/three@0.160.0/**', rt)

    def page(c, name, tag):
        pg = c.new_page()
        pg.on('pageerror', lambda e: errors.append(f'[{tag}] {e}'))
        pg.on('console', lambda m: errors.append(f'[{tag}] {m.text}') if m.type == 'error' else None)
        pg.add_init_script(f"localStorage.bm_name = {json.dumps(name)};")
        pg.goto(BASE); pg.wait_for_selector('body[data-ready="1"]', timeout=20000)
        return pg

    ph = page(ctx, 'Hưng', 'phone')
    print('chế độ cảm ứng:', ph.evaluate("document.body.classList.contains('touch')"), '| chat ẩn sẵn:', ph.evaluate("document.querySelector('#chat').hidden"))
    ph.tap('[data-court="0"]'); ph.wait_for_selector('#claimGo'); ph.tap('#claimGo'); ph.wait_for_selector('#roster')
    ph.tap('#roster [data-act="addbot"][data-k="t1p0"]'); ph.wait_for_timeout(300)

    # khán giả: 3 tab máy tính vào xem sân 1 (BroadcastChannel chỉ nối các tab cùng context, nên dùng context điện thoại)
    specs = []
    for n in ('Lan', 'Minh', 'Tuấn'):
        sp = page(ctx, n, n); sp.wait_for_timeout(300)
        sp.tap('[data-court="0"]'); sp.wait_for_selector('.opt[data-k="spec"]'); sp.tap('.opt[data-k="spec"]'); sp.wait_for_timeout(300)
        specs.append(sp)
    ph.bring_to_front(); ph.wait_for_timeout(500)
    print('khán giả trong bảng:', ph.inner_text('#roster .specs') if ph.query_selector('#roster .specs') else '(không có)')
    print('avatar khán giả trong cảnh:', ph.evaluate("Object.keys(window.__bm.S.scene.courts[0].avatars).filter(k => k.startsWith('s_')).length"))

    ph.tap('#roster [data-act="start"]'); ph.wait_for_selector('#playHud:not([hidden])', timeout=8000)
    ph.wait_for_timeout(600)
    print('lớp cảm ứng hiện:', not ph.evaluate("document.querySelector('#touch').hidden"), '| dải cú đánh:', ph.inner_text('#shotBar').replace('\n', ' '))
    ph.evaluate(DRIVER)
    ph.evaluate("(() => { window.__mine = { hit: 0, q: [0,0,0,0] }; window.__bm.S.be.on('shots/0', (v) => { if (v && v.pid === 't0p0' && v.kind !== 'toss' && v.seq !== window.__lastSeq) { window.__lastSeq = v.seq; window.__mine.hit++; if (v.q != null) window.__mine.q[v.q]++; } }); })()")
    t0 = time.time(); seen = set(); shot = 0
    while time.time() - t0 < DURATION:
        ph.wait_for_timeout(500)
        st = ph.evaluate("(() => { const C = window.__bm.S.courts[0]; const G = C && C.game; return G ? { score: G.score, msg: G.msg, phase: G.phase, state: C.state } : null })()")
        if st and st['msg'] and st['msg'] not in seen:
            seen.add(st['msg']); print(f"[{time.time()-t0:4.0f}s] {st['msg']}")
        if shot < 2 and time.time() - t0 > 8 + shot * 12:
            shot += 1; ph.screenshot(path=f'{OUT}/m-play-{shot}.png')
        if st and st['state'] == 'finished': break
    drv = ph.evaluate('window.__drv')
    hits = ph.evaluate("window.__bm.S.shot ? window.__bm.S.shot.seq : 0")
    print('vuốt:', drv, '| cú đánh được tính của người chơi:', ph.evaluate('window.__mine'), '(q: yếu/khá/tốt/hoàn hảo)')

    # bình luận bậy từ khán giả Lan → sét đánh Lan ở rìa sân
    lan = specs[0]; lan.bring_to_front()
    lan.tap('#chatBtn'); lan.fill('#chatIn', 'Đánh như đm ấy'); lan.press('#chatIn', 'Enter')
    ph.bring_to_front(); ph.wait_for_timeout(120)
    ph.screenshot(path=f'{OUT}/m-strike.png')
    print('toast:', ph.inner_text('#toast'))
    lan.wait_for_timeout(200)
    print('chữ trong khung chat của Lan:', lan.inner_text('#chatList'))
    zap = ph.evaluate("(() => { const a = Object.values(window.__bm.S.scene.courts[0].avatars).find(a => a.userData.name === 'Lan'); return a ? a.userData.zap : null })()")
    print('avatar Lan đang cháy đen (giây còn lại):', zap)

    # nhìn toàn sân từ góc khán giả (Minh), cỡ màn hình máy tính
    mi = specs[1]; mi.bring_to_front(); mi.set_viewport_size({'width': 1280, 'height': 760}); mi.wait_for_timeout(1500)
    mi.screenshot(path=f'{OUT}/m-specs-view.png')
    br.close()
srv.terminate()
print('--- lỗi trình duyệt:', len(errors))
for e in errors[:15]: print(e)
