import os, re, json
from playwright.sync_api import sync_playwright
VENDOR = os.environ['VENDOR']; OUT = os.environ['OUT']
def route_three(route):
    m = re.search(r'three@0\.160\.0/(.*)$', route.request.url)
    route.fulfill(path=os.path.join(VENDOR, 'node_modules', 'three', m.group(1)), content_type='application/javascript')
with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    ctx = br.new_context(viewport={'width': 390, 'height': 780}, has_touch=True, is_mobile=True, device_scale_factor=1)
    ctx.route('**/cdn.jsdelivr.net/npm/three@0.160.0/**', route_three)
    errs = []
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script("localStorage.bm_name = 'Hưng'")
    pg.goto('http://127.0.0.1:8765/index.html?local=1'); pg.wait_for_selector('body[data-ready="1"]'); pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/m1-hall.png')
    pg.tap('[data-court="4"]'); pg.wait_for_selector('#claimGo'); pg.tap('#claimGo'); pg.wait_for_selector('#roster')
    pg.tap('#roster [data-act="addbot"][data-k="t1p0"]'); pg.wait_for_timeout(300)
    pg.screenshot(path=f'{OUT}/m2-lobby.png')
    pg.tap('#roster [data-act="start"]'); pg.wait_for_selector('#playHud:not([hidden])'); pg.wait_for_timeout(2500)
    pg.screenshot(path=f'{OUT}/m3-play.png')
    print('touch hiện:', not pg.evaluate("document.querySelector('#touch').hidden"), '| lỗi:', errs)
    br.close()
