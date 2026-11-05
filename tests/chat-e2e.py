"""Kiểm tra khung bình luận (chế độ cục bộ): kênh Sảnh, kênh sân, số chưa đọc, gõ dấu cách không kích hoạt đánh."""
import os, re, sys, subprocess, time
from playwright.sync_api import sync_playwright
V = os.environ['VENDOR']; OUT = os.environ['OUT']; BASE = 'http://127.0.0.1:8768/index.html?local=1'
def rt(r):
    r.fulfill(path=os.path.join(V, 'node_modules', 'three', re.search(r'three@0\.160\.0/(.*)$', r.request.url).group(1)), content_type='application/javascript')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.makedirs(OUT, exist_ok=True)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8768', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errs = []
with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
    c = br.new_context(viewport={'width': 1280, 'height': 760}); c.route('**/cdn.jsdelivr.net/npm/three@0.160.0/**', rt)
    def pg(n, vp=None):
        x = c.new_page()
        if vp: x.set_viewport_size(vp)
        x.on('pageerror', lambda e: errs.append(f'{n}: {e}'))
        x.add_init_script(f"localStorage.bm_name={n!r}"); x.goto(BASE); x.wait_for_selector('body[data-ready="1"]'); return x
    a = pg('Hưng'); a.wait_for_timeout(300); b = pg('Lan'); b.wait_for_timeout(400)
    print('chat mở sẵn ở A:', not a.evaluate("document.querySelector('#chat').hidden"))
    a.fill('#chatIn', 'Chào cả nhà <b>x</b>'); a.press('#chatIn', 'Enter'); a.wait_for_timeout(300)
    print('B thấy:', b.inner_text('#chatList'))
    b.click('#chatClose'); a.wait_for_timeout(1600); a.fill('#chatIn', 'Ai đánh sân 1 không?'); a.press('#chatIn', 'Enter'); b.wait_for_timeout(300)
    print('badge B:', b.inner_text('#chatBadge'), '| ẩn:', b.evaluate("document.querySelector('#chatBadge').hidden"))
    b.click('#chatBtn')
    a.click('[data-court="0"]'); a.click('#claimGo'); a.wait_for_selector('#roster')
    a.click('#roster [data-act="addbot"][data-k="t1p0"]')
    b.wait_for_timeout(400); b.click('[data-court="0"]'); b.click('.opt[data-k="spec"]'); b.wait_for_timeout(500)
    print('tabs B:', b.inner_text('#chatTabs').replace('\n', ' / '))
    b.fill('#chatIn', 'Cố lên!'); b.press('#chatIn', 'Enter'); a.wait_for_timeout(300)
    print('A sân 1:', a.inner_text('#chatList'))
    a.click('#roster [data-act="start"]'); a.wait_for_selector('#playHud:not([hidden])'); a.wait_for_timeout(500)
    a.click('#chatIn'); a.keyboard.type('go co dau cach'); print('hold sau khi gõ:', a.evaluate('window.__bm.ctl.hold'), '| ô:', a.input_value('#chatIn'))
    a.wait_for_timeout(1600); a.press('#chatIn', 'Enter'); a.wait_for_timeout(1500)
    a.screenshot(path=f'{OUT}/chat-court.png'); b.screenshot(path=f'{OUT}/chat-spec.png')
    a.click('#leaveBtn'); a.wait_for_timeout(500); print('A sau rời, tabs:', a.inner_text('#chatTabs'))
    a.screenshot(path=f'{OUT}/chat-hall.png')
    m = pg('M', {'width': 390, 'height': 780}); m.wait_for_timeout(500)
    print('điện thoại: chat ẩn mặc định:', m.evaluate("document.querySelector('#chat').hidden"))
    m.click('#chatBtn'); m.wait_for_timeout(300); m.screenshot(path=f'{OUT}/chat-mobile.png')
    br.close()
print('lỗi:', errs)
srv.terminate()
