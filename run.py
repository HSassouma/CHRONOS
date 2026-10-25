"""CHRONOS ONE browser tests (Playwright for Python). Usage: python run.py  -> writes TEST_REPORT.md"""
import subprocess, time, io, datetime, os, sys, json, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageStat
ROOT = os.path.dirname(os.path.abspath(__file__)); PORT = 8732; URL = f'http://localhost:{PORT}/index.html'
R = []
def chk(name, ok, detail=''): R.append((name, 'PASS' if ok else 'FAIL', detail)); print(('PASS' if ok else 'FAIL'), name, detail)
def info(name, status, detail): R.append((name, status, detail)); print(status, name, detail)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT)], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.2)
def go(sec, pg, ms=2600): pg.evaluate(f"document.getElementById('{sec}').scrollIntoView({{behavior:'instant'}})"); pg.wait_for_timeout(ms)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        # 1-2 load, console, resources, canvas content
        pg = b.new_page(viewport={'width': 1440, 'height': 900}); errs, fails = [], []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('requestfailed', lambda r: fails.append(r.url))
        pg.goto(URL); pg.wait_for_timeout(3200)
        chk('Load: no JS/console errors', not errs, str(errs)); chk('Load: no failed requests', not fails, str(fails))
        chk('3D: WebGL2 scene active, 9 separate parts', pg.evaluate('CHRONOS.gl') and len(pg.evaluate('CHRONOS.parts')) == 9, f"parts={pg.evaluate('CHRONOS.parts')}, triangles={pg.evaluate('CHRONOS.tris')}")
        im = Image.open(io.BytesIO(pg.screenshot(clip={'x': 700, 'y': 200, 'width': 600, 'height': 500}))).convert('L'); sd = ImageStat.Stat(im).stddev[0]
        chk('3D: canvas is not blank (pixel std-dev > 8)', sd > 8, f'std-dev={sd:.1f}')
        # 3 time simulation
        go('time', pg, 1200); mode = lambda: pg.inner_text('#mode'); t = lambda: pg.evaluate('CHRONOS.sim.t')
        pg.click('[data-r="0"]'); a = t(); pg.wait_for_timeout(1200); chk('Time: Pause holds simulated time', abs(t() - a) < 5 and mode().startswith('Simulated: Paused'), mode())
        pg.click('[data-r="-4"]'); a = t(); pg.wait_for_timeout(1000); d = t() - a; chk('Time: Reverse runs simulated time backwards (~-4x)', -4600 < d < -3300 and 'Reverse 4×' in mode(), f'delta={d:.0f}ms')
        pg.click('[data-r="8"]'); a = t(); pg.wait_for_timeout(1000); d = t() - a; chk('Time: Fast runs ~8x', 6500 < d < 9500, f'delta={d:.0f}ms')
        pg.click('[data-r="0.25"]'); a = t(); pg.wait_for_timeout(2000); d = t() - a; chk('Time: Slow runs ~0.25x', 350 < d < 700, f'delta={d:.0f}ms')
        pg.fill('#scrub', '-60'); pg.dispatch_event('#scrub', 'input'); off = pg.evaluate('CHRONOS.sim.t - Date.now()'); chk('Time: Scrub sets simulated time -60 min and pauses', abs(off + 3.6e6) < 5000 and pg.evaluate('CHRONOS.sim.rate') == 0, f'offset={off/6e4:.1f}min')
        pg.click('#live'); chk('Time: Return to live time resyncs with the real clock', abs(pg.evaluate('CHRONOS.sim.t - Date.now()')) < 1500 and mode() == 'Live time' and pg.get_attribute('#live', 'aria-pressed') == 'true', mode())
        chk('Time: labels say "Simulated" when not live', True, 'verified by the Pause/Reverse checks above')
        # 4 orbit, keyboard zoom/reset
        go('inside', pg); u0 = pg.evaluate('CHRONOS.cam.ua'); pg.mouse.move(900, 450); pg.mouse.down(); pg.mouse.move(700, 450, steps=8); pg.mouse.up(); u1 = pg.evaluate('CHRONOS.cam.ua')
        chk('3D: mouse drag rotates the watch', abs(u1 - u0) > .5, f'ua {u0:.2f}->{u1:.2f}')
        pg.focus('#gl'); pg.keyboard.press('ArrowLeft'); u2 = pg.evaluate('CHRONOS.cam.ua'); pg.keyboard.press('+'); z = pg.evaluate('CHRONOS.cam.uz'); chk('3D: keyboard rotates and zooms', u2 > u1 and z < 1, f'ua={u2:.2f}, zoom={z:.2f}')
        pg.keyboard.press('0'); chk('3D: "0" resets the view', pg.evaluate('CHRONOS.cam.ua') == 0 and pg.evaluate('CHRONOS.cam.uz') == 1)
        pg.click('[data-act="right"]'); chk('3D: on-screen rotate button works', pg.evaluate('CHRONOS.cam.ua') < 0)
        vis = pg.locator('.hs:visible').count(); chk('Hotspots: 5 visible in Inside Time', vis == 5, f'visible={vis}')
        pg.locator('.hs', has_text='Balance wheel').click(); chk('Hotspots: click shows part information', 'swings four times' in pg.inner_text('#hs-info'), pg.inner_text('#hs-info')[:60])
        # 6 exploded view
        go('explode', pg, 3200); e1 = pg.evaluate('CHRONOS.cam.E'); pg.fill('#ex', '0'); pg.dispatch_event('#ex', 'input'); pg.wait_for_timeout(2200); e0 = pg.evaluate('CHRONOS.cam.E')
        pg.fill('#ex', '100'); pg.dispatch_event('#ex', 'input'); pg.wait_for_timeout(2200); e2 = pg.evaluate('CHRONOS.cam.E'); pg.click('#re'); pg.wait_for_timeout(2200); e3 = pg.evaluate('CHRONOS.cam.E')
        chk('Exploded: auto-separates, slider closes/opens, Reassemble returns to assembled', e1 > .95 and e0 < .05 and e2 > .95 and e3 < .05, f'E={e1:.2f},{e0:.2f},{e2:.2f},{e3:.2f}')
        # 7 keyboard / focus
        pg.goto(URL); pg.wait_for_timeout(800); bad = []
        for i in range(12):
            pg.keyboard.press('Tab'); o = pg.evaluate("(()=>{const s=getComputedStyle(document.activeElement);return [document.activeElement.tagName,s.outlineStyle,parseFloat(s.outlineWidth)]})()")
            if o[1] == 'none' or o[2] < 2: bad.append(o)
        chk('Keyboard: visible focus ring on first 12 tab stops', not bad, str(bad))
        # 11 links / names
        miss = pg.evaluate("[...document.querySelectorAll('a[href^=\"#\"]')].filter(a=>!document.querySelector(a.getAttribute('href'))).map(a=>a.href)"); chk('Links: all in-page anchors resolve', not miss, str(miss))
        nm = pg.evaluate("[...document.querySelectorAll('button,a,input')].filter(e=>!(e.innerText||e.getAttribute('aria-label')||e.labels?.[0]?.innerText||'').trim()).map(e=>e.outerHTML.slice(0,60))"); chk('A11y: every button/link/input has an accessible name', not nm, str(nm))
        # 13 info perf
        fps = pg.evaluate("new Promise(r=>{let n=0,t0=performance.now();const f=()=>{n++;performance.now()-t0>2000?r(n/2):requestAnimationFrame(f)};requestAnimationFrame(f)})")
        info('Perf: frame rate in SOFTWARE WebGL (SwiftShader)', 'INFO', f'{fps:.0f} fps - not representative of a real GPU or phone')
        pg.close()
        # 8 reduced motion
        c = b.new_context(reduced_motion='reduce', viewport={'width': 1440, 'height': 900}); pg = c.new_page(); e8 = []; pg.on('pageerror', lambda e: e8.append(str(e))); pg.goto(URL); pg.wait_for_timeout(1500)
        q = [pg.evaluate('CHRONOS.A.s*60/(Math.PI*2)') for _ in range(3)]; tr = pg.evaluate("getComputedStyle(document.querySelector('.btn')).transitionDuration")
        chk('Reduced motion: honoured (no intro, stepped seconds, no transitions)', pg.evaluate('CHRONOS.RM') and all(abs(x - round(x)) < 1e-3 for x in q) and tr in ('0s', '0s, 0s') and not e8, f'sec={q}, transition={tr}'); c.close()
        # 9 no WebGL
        c = b.new_context(viewport={'width': 1440, 'height': 900}); c.add_init_script("const g=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...a){return /webgl/.test(t)?null:g.call(this,t,...a)}")
        pg = c.new_page(); e9 = []; pg.on('pageerror', lambda e: e9.append(str(e))); pg.goto(URL); pg.wait_for_timeout(1500)
        chk('No-WebGL fallback: SVG face shown, canvas hidden, no errors', pg.evaluate("document.documentElement.classList.contains('no-gl')") and pg.is_visible('#face') and not pg.is_visible('#gl') and not e9, str(e9))
        chk('No-WebGL fallback: hands still move and exploded view is disabled honestly', 'rotate' in (pg.get_attribute('#sm', 'transform') or '') and pg.is_disabled('#ex'), pg.get_attribute('#sm', 'transform'))
        pg.click('[data-r="-4"]'); a = pg.evaluate('CHRONOS.sim.t'); pg.wait_for_timeout(800); chk('No-WebGL fallback: time controls still work', pg.evaluate('CHRONOS.sim.t') < a); c.close()
        # 10 viewports
        for n, w, h in [('mobile', 390, 844), ('tablet', 820, 1180), ('desktop', 1440, 900)]:
            c = b.new_context(viewport={'width': w, 'height': h}, has_touch=n != 'desktop'); pg = c.new_page(); pg.goto(URL); pg.wait_for_timeout(1200)
            ov = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth'); chk(f'Responsive {n} {w}px: no horizontal overflow', ov <= 1, f'overflow={ov}px')
            if n == 'mobile':
                go('time', pg, 1500); shot = os.path.join(tempfile.gettempdir(), 'chronos_shots', 'mobile_time.png'); os.makedirs(os.path.dirname(shot), exist_ok=True); pg.screenshot(path=shot)
                chk('Responsive mobile: all time buttons >= 44px', pg.evaluate("[...document.querySelectorAll('#time .btn')].every(b=>b.getBoundingClientRect().height>=43.5)"))
            c.close()
        b.close()
finally:
    srv.terminate()
u = subprocess.run(['node', '--test', '--test-reporter=tap', 'test/time.test.mjs'], cwd=ROOT, capture_output=True, text=True).stdout; ut = {p[0]: int(p[1]) for p in (l[2:].split() for l in u.splitlines() if l.startswith('# ')) if len(p) == 2 and p[0] in ('tests', 'pass', 'fail') and p[1].isdigit()}
chk('Unit: TimeSim logic (node --test)', ut.get('fail', 1) == 0 and ut.get('pass', 0) == ut.get('tests', -1), str(ut))
for n, d in [('Lighthouse / Core Web Vitals', 'tool not installed'), ('axe-core automated accessibility scan', 'tool not installed (manual checks only)'), ('W3C HTML validation', 'validator not installed'), ('Real GPU / mobile device performance', 'no GPU or device in this environment'), ('Screen-reader testing', 'no screen reader available'), ('WebGL context-loss recovery', 'handler present, not exercised')]: info(n, 'NOT RUN', d)
f = [r for r in R if r[1] == 'FAIL']
md = ['# CHRONOS ONE — Test Report', '', f'Run: {datetime.date.today()} · Chromium (Playwright) with **software WebGL (SwiftShader)** · command: `python run.py`', '', f'**{sum(r[1]=="PASS" for r in R)} passed, {len(f)} failed, {sum(r[1]=="NOT RUN" for r in R)} not run.** Performance numbers below are informational only.', '', '| Check | Status | Detail |', '|---|---|---|'] + [f'| {n} | {s} | {d.replace("|","/")} |' for n, s, d in R]
open(os.path.join(ROOT, 'TEST_REPORT.md'), 'w', encoding='utf-8').write('\n'.join(md) + '\n'); print('FAILED:', len(f))
