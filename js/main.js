import { TimeSim } from './time.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches, TAU = Math.PI * 2, D = Math.PI / 180;
const sim = new TimeSim();
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Camera Presets for each section (tuned for large, commanding luxury watch presence)
const PRE = {
  reveal:  { a: -.48, e: .42, d: 9.8,  E: 0, y: 0,    sx: .28 },
  time:    { a: 0,    e: 1.18, d: 7.6,  E: 0, y: 0,    sx: -.28 },
  inside:  { a: .56,  e: .52, d: 8.8,  E: 0, y: .05,  sx: .22 },
  explode: { a: .78,  e: .34, d: 18.0, E: 1, y: .45,  sx: -.30 },
  craft:   { a: -1.02, e: .30, d: 6.9, E: 0, y: .10,  sx: .28 }
};

const cam = RM ? { ...PRE.reveal, ua: 0, ue: 0, uz: 1 } : { a: -1.35, e: .22, d: 14.5, E: 0, y: 0, sx: 0, ua: 0, ue: 0, uz: 1 };
const st = { cur: 'reveal', mE: null, intro: RM ? 1 : 0 };
const A = { h: 0, m: 0, s: 0, a: 0, bal: 0 };

// ---------- Matrix mathematics with pooling ----------
const MAT_POOL = [];
const getMat = () => MAT_POOL.length > 0 ? MAT_POOL.pop() : new Float32Array(16);
const releaseMat = m => { if (MAT_POOL.length < 50) MAT_POOL.push(m); };
const mul = (a, b, out = getMat()) => {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return out;
};
const I = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const T = (x, y, z, out = getMat()) => { out.set(I); out[12] = x; out[13] = y; out[14] = z; return out; };
const RY = (a, out = getMat()) => { const c = Math.cos(a), s = Math.sin(a); out.set([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); return out; };
const RZ = (a, out = getMat()) => { const c = Math.cos(a), s = Math.sin(a); out.set([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); return out; };
const RX = (a, out = getMat()) => { const c = Math.cos(a), s = Math.sin(a); out.set([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); return out; };
const persp = (f, a, n, r, out = getMat()) => {
  const t = 1 / Math.tan(f / 2), i = 1 / (n - r);
  out.set([t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (r + n) * i, -1, 0, 0, 2 * r * n * i, 0]);
  return out;
};
const look = (e, c, out = getMat()) => {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  let xx = zz, xz = -zx, l2 = Math.hypot(xx, xz);
  xx /= l2; xz /= l2;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
  const dx = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  out.set([xx, yx, zx, 0, 0, yy, zy, 0, xz, yz, zz, 0, -dx([xx, 0, xz], e), -dx([yx, yy, yz], e), -dx([zx, zy, zz], e), 1]);
  return out;
};

// ---------- Procedural geometry primitives ----------
function lathe(P, S = 72, sm = 0, a0 = 0, a1 = TAU) {
  const full = a1 - a0 >= TAU - 1e-6, p = [], n = [], ix = [], nk = [], R = [];
  for (let k = 0; k < P.length - 1; k++) {
    const dr = P[k + 1][0] - P[k][0], dy = P[k + 1][1] - P[k][1], l = Math.hypot(dr, dy) || 1;
    nk.push([dy / l, -dr / l]);
  }
  if (sm) {
    P.forEach((q, j) => {
      const a = nk[Math.max(0, j - 1)], b = nk[Math.min(nk.length - 1, j)], x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      R.push([q, [x / l, y / l]]);
    });
  } else {
    nk.forEach((v, k) => R.push([P[k], v], [P[k + 1], v]));
  }
  const steps = Math.max(2, Math.round(S * (a1 - a0) / TAU)), cols = full ? steps : steps + 1;
  R.forEach(([q, v]) => {
    for (let s = 0; s < cols; s++) {
      const a = a0 + (a1 - a0) * s / steps, c = Math.cos(a), si = Math.sin(a);
      p.push(q[0] * c, q[1], q[0] * si);
      n.push(v[0] * c, v[1], v[0] * si);
    }
  });
  for (let r = 0; r < R.length - 1; r++) {
    if (sm || r % 2 === 0) {
      for (let s = 0; s < steps; s++) {
        const s1 = full ? (s + 1) % cols : s + 1, a = r * cols + s, b = a + cols, a2 = r * cols + s1, b2 = b - s + s1;
        ix.push(a, b, a2, a2, b, b2);
      }
    }
  }
  if (!full) {
    let cr = 0, cy = 0;
    P.forEach(q => { cr += q[0] / P.length; cy += q[1] / P.length; });
    [0, 1].forEach(ei => {
      const a = ei ? a1 : a0, c = Math.cos(a), si = Math.sin(a), nx = ei ? -Math.sin(a) : Math.sin(a), nz = ei ? Math.cos(a) : -Math.cos(a), k = P.length, base = p.length / 3;
      p.push(cr * c, cy, cr * si); n.push(nx, 0, nz);
      P.forEach(q => { p.push(q[0] * c, q[1], q[0] * si); n.push(nx, 0, nz); });
      for (let j = 0; j < k; j++) {
        const j2 = (j + 1) % k;
        ei ? ix.push(base, base + 1 + j2, base + 1 + j) : ix.push(base, base + 1 + j, base + 1 + j2);
      }
    });
  }
  return { p, n, i: ix };
}

function extrude(poly, h) {
  const g = { p: [], n: [], i: [] }, k = poly.length;
  let cx = 0, cz = 0;
  poly.forEach(q => { cx += q[0] / k; cz += q[1] / k; });
  const add = (x, y, z, nx, ny, nz) => { g.p.push(x, y, z); g.n.push(nx, ny, nz); return g.p.length / 3 - 1; };
  [[h / 2, 1], [-h / 2, -1]].forEach(([y, s]) => {
    const c = add(cx, y, cz, 0, s, 0), b = poly.map(q => add(q[0], y, q[1], 0, s, 0));
    for (let j = 0; j < k; j++) g.i.push(c, b[j], b[(j + 1) % k]);
  });
  for (let j = 0; j < k; j++) {
    const a = poly[j], b = poly[(j + 1) % k], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l;
    const v = [add(a[0], h / 2, a[1], nx, 0, nz), add(b[0], h / 2, b[1], nx, 0, nz), add(b[0], -h / 2, b[1], nx, 0, nz), add(a[0], -h / 2, a[1], nx, 0, nz)];
    g.i.push(v[0], v[1], v[2], v[0], v[2], v[3]);
  }
  return g;
}

const merge = gs => {
  const o = { p: [], n: [], i: [] };
  gs.forEach(g => {
    const b = o.p.length / 3;
    o.p.push(...g.p);
    o.n.push(...g.n);
    g.i.forEach(i => o.i.push(i + b));
  });
  return o;
};

const shift = (g, x, y, z) => {
  for (let i = 0; i < g.p.length; i += 3) {
    g.p[i] += x; g.p[i + 1] += y; g.p[i + 2] += z;
  }
  return g;
};

const bake = (g, M) => {
  for (let i = 0; i < g.p.length; i += 3) {
    const x = g.p[i], y = g.p[i + 1], z = g.p[i + 2], nx = g.n[i], ny = g.n[i + 1], nz = g.n[i + 2];
    g.p[i] = M[0] * x + M[4] * y + M[8] * z + M[12];
    g.p[i + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
    g.p[i + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    g.n[i] = M[0] * nx + M[4] * ny + M[8] * nz;
    g.n[i + 1] = M[1] * nx + M[5] * ny + M[9] * nz;
    g.n[i + 2] = M[2] * nx + M[6] * ny + M[10] * nz;
  }
  return g;
};

const ring = (r0, r1, y0, y1, S = 64) => lathe([[r0, y0], [r1, y0], [r1, y1], [r0, y1]], S);
const rect = (w, h) => [[-w, -h], [w, -h], [w, h], [-w, h]];

// Chamfered Beveled Box for jewelry-grade bracelet links
function beveledBox(w, h, d, bevel = 0.016) {
  const g = { p: [], n: [], i: [] };
  const add = (x, y, z, nx, ny, nz) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    g.p.push(x, y, z); g.n.push(nx / l, ny / l, nz / l);
    return g.p.length / 3 - 1;
  };
  const b = bevel;
  const xw = Math.max(0.001, w - b), yh = Math.max(0.001, h - b), zd = Math.max(0.001, d - b);
  const addQuad = (p0, p1, p2, p3) => g.i.push(p0, p1, p2, p0, p2, p3);

  // Top Face (y = +h)
  const t0 = add(-xw, h, -zd, 0, 1, 0), t1 = add(xw, h, -zd, 0, 1, 0), t2 = add(xw, h, zd, 0, 1, 0), t3 = add(-xw, h, zd, 0, 1, 0);
  addQuad(t0, t1, t2, t3);
  // Bottom Face (y = -h)
  const b0 = add(-xw, -h, -zd, 0, -1, 0), b1 = add(xw, -h, -zd, 0, -1, 0), b2 = add(xw, -h, zd, 0, -1, 0), b3 = add(-xw, -h, zd, 0, -1, 0);
  addQuad(b0, b3, b2, b1);
  // Front Face (z = +d)
  const f0 = add(-xw, -yh, d, 0, 0, 1), f1 = add(xw, -yh, d, 0, 0, 1), f2 = add(xw, yh, d, 0, 0, 1), f3 = add(-xw, yh, d, 0, 0, 1);
  addQuad(f0, f1, f2, f3);
  // Back Face (z = -d)
  const k0 = add(-xw, -yh, -d, 0, 0, -1), k1 = add(xw, -yh, -d, 0, 0, -1), k2 = add(xw, yh, -d, 0, 0, -1), k3 = add(-xw, yh, -d, 0, 0, -1);
  addQuad(k0, k3, k2, k1);
  // Left Face (x = -w)
  const l0 = add(-w, -yh, -zd, -1, 0, 0), l1 = add(-w, yh, -zd, -1, 0, 0), l2 = add(-w, yh, zd, -1, 0, 0), l3 = add(-w, -yh, zd, -1, 0, 0);
  addQuad(l0, l1, l2, l3);
  // Right Face (x = +w)
  const r0 = add(w, -yh, -zd, 1, 0, 0), r1 = add(w, yh, -zd, 1, 0, 0), r2 = add(w, yh, zd, 1, 0, 0), r3 = add(w, -yh, zd, 1, 0, 0);
  addQuad(r0, r3, r2, r1);

  // 4 Top Bevel Chamfer Edge Strips
  addQuad(add(xw, h, -zd, 1, 1, 0), add(xw, h, zd, 1, 1, 0), add(w, yh, zd, 1, 1, 0), add(w, yh, -zd, 1, 1, 0));
  addQuad(add(-xw, h, -zd, -1, 1, 0), add(-xw, h, zd, -1, 1, 0), add(-w, yh, zd, -1, 1, 0), add(-w, yh, -zd, -1, 1, 0));
  addQuad(add(-xw, h, zd, 0, 1, 1), add(xw, h, zd, 0, 1, 1), add(xw, yh, d, 0, 1, 1), add(-xw, yh, d, 0, 1, 1));
  addQuad(add(-xw, h, -zd, 0, 1, -1), add(xw, h, -zd, 0, 1, -1), add(xw, yh, -d, 0, 1, -1), add(-xw, yh, -d, 0, 1, -1));

  return g;
}

