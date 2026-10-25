const fs = require('fs');
const path = require('path');

function read(p){ return fs.readFileSync(p,'utf8'); }

const root = __dirname;
const indexPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'css/style.css');
const mainJsPath = path.join(root, 'js/main.js');
const timeJsPath = path.join(root, 'js/time.js');

let html;
try { html = read(indexPath); } catch(e){ console.error('Cannot read index.html'); process.exit(2); }

function report(name, ok, detail){ console.log((ok?'PASS':'FAIL'), name, detail||''); if(!ok) process.exitCode = 1; }

// 1) Asset existence
try { fs.accessSync(cssPath); report('Assets: CSS exists', true); } catch(e){ report('Assets: CSS exists', false, 'css/style.css missing'); }
try { fs.accessSync(mainJsPath); report('Assets: main.js exists', true); } catch(e){ report('Assets: main.js exists', false, 'js/main.js missing'); }
try { fs.accessSync(timeJsPath); report('Assets: time.js exists', true); } catch(e){ report('Assets: time.js exists', false, 'js/time.js missing'); }

// 1b) Bundled fonts (no CDN dependency)
try {
  const fontDir = path.join(root, 'fonts');
  const fontFiles = fs.readdirSync(fontDir).filter(f => f.endsWith('.woff2'));
  const cssHasFaces = (fs.readFileSync(cssPath, 'utf8').match(/@font-face/g) || []).length;
  report('Fonts: bundled woff2 files present', fontFiles.length >= 5, fontFiles.join(', '));
  report('Fonts: @font-face rules in CSS', cssHasFaces >= 5, cssHasFaces + ' @font-face rules');
  const htmlHasPreload = html.includes('fonts/') && html.includes('rel="preload"');
  report('Fonts: preload hints in HTML', htmlHasPreload, 'font preloads linked');
} catch(e){ report('Fonts: bundled woff2 files present', false, 'fonts/ directory missing or unreadable'); }

// 2) HTML references
report('HTML: link href css/style.css present', html.includes('href="css/style.css"') || html.includes("href='css/style.css'"), 'css/style.css linked');
report('HTML: script src main.js present', html.includes('js/main.js'), 'main.js linked');
report('HTML: script type=module main.js present', html.includes('type="module"') && html.includes('js/main.js'), 'main.js module script');
report('HTML: script src time.js present', html.includes('js/time.js'), 'time.js linked');

// 3) Duplicate IDs
const idMatches = [...html.matchAll(/id\s*=\s*"([^"]+)"/g)].map(m=>m[1]);
const dupes = idMatches.filter((v,i,a)=> a.indexOf(v) !== i);
report('DOM: duplicate IDs', dupes.length===0, dupes.length? 'duplicates: '+dupes.join(',') : 'none');

// 4) Anchors reference check
const hrefs = html.match(/href\s*=\s*"#([^"]+)"/g) || [];
const missingAnchors = [];
for (const h of hrefs) { const id = h.match(/#([^\"]+)/)[1]; if (!html.includes(`id=\"${id}\"`) && !html.includes(`id='${id}'`)) missingAnchors.push(id); }
report('Anchors: in-page links resolve', missingAnchors.length===0, missingAnchors.length? 'missing ids: '+missingAnchors.join(',') : 'all resolved');

// 5) WebGL2 usage presence
let mainJs = '';
try { mainJs = read(mainJsPath); } catch(e) { mainJs = ''; }
report('WebGL2: getContext used', mainJs.includes("getContext('webgl2')") || html.includes('getContext(') || mainJs.includes('webgl2'), 'WebGL2 init in code');

// 6) Keyboard handlers presence
report('Keyboard: keydown handler in code', mainJs.includes('keydown') || html.includes('keydown'), 'keyboard navigation support');

// 7) Reduced motion handling presence
let cssContent = '';
try { cssContent = read(cssPath); } catch(e) { cssContent = ''; }
const reducedMotionPresent = mainJs.includes('prefers-reduced-motion') || cssContent.includes('prefers-reduced-motion') || html.includes('prefers-reduced-motion');
report('Reduced motion: CSS/JS support', reducedMotionPresent, 'reduced motion support');

// 8) Section IDs presence
const sections = ['reveal','time','inside','explode','craft'];
sections.forEach(s => {
  const ok = html.includes(`section id=\"${s}\"`) || html.includes(`section id='${s}'`);
  report('DOM: section #'+s+' present', ok, 'check in index.html');
});

// 9) Hotspots and controls presence
const hotspots = (html.match(/button[^>]+class=\"hs\"/g) || []);
report('UI: 5 hotspots present', hotspots.length === 5, `found ${hotspots.length}`);
report('UI: time controls exist', html.includes('data-r="-4"') && html.includes('data-r="0"') && html.includes('data-r="0.25"') && html.includes('data-r="1"') && html.includes('data-r="8"'));

console.log('\nSummary:');
console.log('Exit code: ', process.exitCode ?? 0);
