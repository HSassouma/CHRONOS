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

// Architectural Beveled Horn Lugs with precision 45° chamfers
function sculptedLug(xCenter, zDir) {
  const g = { p: [], n: [], i: [] };
  const add = (x, y, z, nx, ny, nz) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    g.p.push(x, y, z); g.n.push(nx / l, ny / l, nz / l);
    return g.p.length / 3 - 1;
  };
  const isRight = xCenter > 0, sX = isRight ? 1 : -1;
  const z0 = 1.64 * zDir, z1 = 2.62 * zDir;
  const y0 = 0.18, y1 = -0.20;
  const wIn0 = 0.60, wOut0 = 1.08;
  const wIn1 = 0.52, wOut1 = 0.88;
  const thick0 = 0.38, thick1 = 0.24;

  const r_TI = add(sX * wIn0, y0 + thick0 * 0.5, z0, 0, 1, 0);
  const r_TC = add(sX * (wOut0 - 0.09), y0 + thick0 * 0.5, z0, 0, 1, 0);
  const r_CO = add(sX * wOut0, y0 + thick0 * 0.5 - 0.08, z0, sX * 0.707, 0.707, 0);
  const r_BO = add(sX * wOut0, y0 - thick0 * 0.5, z0, sX, 0, 0);
  const r_BI = add(sX * wIn0, y0 - thick0 * 0.5, z0, -sX, 0, 0);

  const t_TI = add(sX * wIn1, y1 + thick1 * 0.5, z1, 0, 1, 0);
  const t_TC = add(sX * (wOut1 - 0.08), y1 + thick1 * 0.5, z1, 0, 1, 0);
  const t_CO = add(sX * wOut1, y1 + thick1 * 0.5 - 0.07, z1, sX * 0.707, 0.707, 0);
  const t_BO = add(sX * wOut1, y1 - thick1 * 0.5, z1, sX, 0, 0);
  const t_BI = add(sX * wIn1, y1 - thick1 * 0.5, z1, -sX, 0, 0);

  const addQuad = (p0, p1, p2, p3) => {
    if ((zDir > 0) !== isRight) g.i.push(p0, p2, p1, p1, p2, p3);
    else g.i.push(p0, p1, p2, p1, p3, p2);
  };

  addQuad(r_TI, r_TC, t_TC, t_TI);
  addQuad(r_TC, r_CO, t_CO, t_TC);
  addQuad(r_CO, r_BO, t_BO, t_CO);
  addQuad(r_BI, r_TI, t_TI, t_BI);
  addQuad(r_BO, r_BI, t_BI, t_BO);

  const tip_c0 = add(sX * (wIn1 + wOut1) * 0.5, y1, z1, 0, 0, zDir);
  const addTipTri = (p0, p1) => {
    if ((zDir > 0) !== isRight) g.i.push(tip_c0, p0, p1);
    else g.i.push(tip_c0, p1, p0);
  };
  addTipTri(t_TI, t_TC);
  addTipTri(t_TC, t_CO);
  addTipTri(t_CO, t_BO);
  addTipTri(t_BO, t_BI);
  addTipTri(t_BI, t_TI);

  return g;
}

// Integrated Articulated Metal Bracelet with Flush Solid End-Links
function buildBracelet(isTop) {
  const outerLinks = [], centerLinks = [];
  const zDir = isTop ? -1 : 1;
  const NUM_ROWS = 6;

  // Solid End-Link flush between the lugs
  const endLink = beveledBox(0.58, 0.16, 0.18, 0.016);
  bake(endLink, T(0, 0.06, 1.82 * zDir));
  outerLinks.push(endLink);
  
  for (let i = 0; i < NUM_ROWS; i++) {
    const t = (i + 0.5) / NUM_ROWS;
    const zBase = (2.05 + i * 0.44) * zDir;
    const yBase = -0.04 - 0.78 * Math.pow(t, 1.6);
    const totalW = 1.05 - 0.20 * t;
    const centerW = totalW * 0.38;
    const outerW = (totalW - centerW - 0.02) * 0.5;
    const linkLen = 0.19, linkThick = 0.052 - 0.008 * t;
    
    const dy = -0.78 * 1.6 * Math.pow(t, 0.6) / NUM_ROWS;
    const dz = 0.44 * zDir;
    const rotX = Math.atan2(-dy, Math.abs(dz)) * zDir;
    const mat = mul(T(0, yBase, zBase), RX(rotX));
    
    // Outer Left Link
    const outL = beveledBox(outerW * 0.5, linkThick, linkLen, 0.014);
    shift(outL, -(centerW * 0.5 + outerW * 0.5 + 0.01), 0, 0);
    bake(outL, mat);
    outerLinks.push(outL);
    
    // Outer Right Link
    const outR = beveledBox(outerW * 0.5, linkThick, linkLen, 0.014);
    shift(outR, (centerW * 0.5 + outerW * 0.5 + 0.01), 0, 0);
    bake(outR, mat);
    outerLinks.push(outR);
    
    // Center Polished Link
    if (i < NUM_ROWS - 1) {
      const zNext = (2.05 + (i + 0.5) * 0.44) * zDir;
      const yNext = -0.04 - 0.78 * Math.pow((i + 1) / NUM_ROWS, 1.6);
      const matC = mul(T(0, yNext, zNext), RX(rotX));
      const cLink = beveledBox(centerW * 0.48, linkThick * 1.08, linkLen * 1.05, 0.015);
      bake(cLink, matC);
      centerLinks.push(cLink);
    }
  }
  return { outer: merge(outerLinks), center: merge(centerLinks) };
}

// Precision applied faceted hour markers
function appliedIndicesGeo() {
  const indices = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, isMajor = i % 3 === 0, is12 = i === 0, r = 1.48;
    if (is12) {
      [-0.048, 0.048].forEach(offset => {
        const marker = extrude([[-0.026, -0.10], [0.026, -0.10], [0.030, 0.10], [-0.030, 0.10]], 0.052);
        bake(marker, mul(T(Math.sin(a) * r + Math.cos(a) * offset, 0.21, -Math.cos(a) * r + Math.sin(a) * offset), RY(-a)));
        indices.push(marker);
      });
    } else if (i === 3) {
      const marker = extrude([[-0.028, -0.05], [0.028, -0.05], [0.030, 0.05], [-0.030, 0.05]], 0.048);
      bake(marker, mul(T(Math.sin(a) * (r + 0.03), 0.21, -Math.cos(a) * (r + 0.03)), RY(-a)));
      indices.push(marker);
    } else {
      const w = isMajor ? 0.036 : 0.026, l = isMajor ? 0.102 : 0.080, h = isMajor ? 0.050 : 0.042;
      const marker = extrude([[-w, -l], [w, -l], [w * 1.12, l], [-w * 1.12, l]], h);
      bake(marker, mul(T(Math.sin(a) * r, 0.21, -Math.cos(a) * r), RY(-a)));
      indices.push(marker);
    }
  }
  return merge(indices);
}

function appliedLumeGeo() {
  const lumes = [];
  for (let i = 0; i < 12; i++) {
    const a = i * Math.PI / 6, is12 = i === 0, r = 1.48;
    if (is12) {
      [-0.048, 0.048].forEach(offset => {
        const lume = extrude(rect(0.012, 0.075), 0.018);
        bake(lume, mul(T(Math.sin(a) * r + Math.cos(a) * offset, 0.245, -Math.cos(a) * r + Math.sin(a) * offset), RY(-a)));
        lumes.push(lume);
      });
    } else if (i === 3) {
      const lume = extrude(rect(0.012, 0.032), 0.018);
      bake(lume, mul(T(Math.sin(a) * (r + 0.03), 0.24, -Math.cos(a) * (r + 0.03)), RY(-a)));
      lumes.push(lume);
    } else {
      const isMajor = i % 3 === 0;
      const lume = extrude(rect(isMajor ? 0.016 : 0.011, isMajor ? 0.070 : 0.054), 0.018);
      bake(lume, mul(T(Math.sin(a) * r, 0.24, -Math.cos(a) * r), RY(-a)));
      lumes.push(lume);
    }
  }
  return merge(lumes);
}

// Date Complication at 3 o'clock — two 7-segment studs reading "28"
function dateDigitGeo(cx, cy, segs) {
  const parts = [], w = 0.052, h = 0.086, t = 0.012;
  const seg = (x, y, sw, sh) => {
    const g = extrude(rect(sw, sh), 0.012);
    shift(g, x, 0.016, y);
    parts.push(g);
  };
  if (segs.includes('a')) seg(cx, h / 2, w, t);
  if (segs.includes('g')) seg(cx, 0, w, t);
  if (segs.includes('d')) seg(cx, -h / 2, w, t);
  if (segs.includes('f')) seg(cx - w / 2, h / 4, t, h / 2 - t);
  if (segs.includes('b')) seg(cx + w / 2, h / 4, t, h / 2 - t);
  if (segs.includes('e')) seg(cx - w / 2, -h / 4, t, h / 2 - t);
  if (segs.includes('c')) seg(cx + w / 2, -h / 4, t, h / 2 - t);
  return merge(parts);
}

function dateWindowGeo() {
  const frame = extrude([[-0.14, -0.11], [0.14, -0.11], [0.14, 0.11], [-0.14, 0.11]], 0.035);
  const disc = extrude(rect(0.11, 0.08), 0.01);
  shift(disc, 0, 0.012, 0);
  const num2 = dateDigitGeo(-0.042, 0, 'abdeg');
  const num8 = dateDigitGeo(0.042, 0, 'abcdefg');

  const mPos = T(1.18, 0.21, 0);
  bake(frame, mPos);
  bake(disc, mPos);
  bake(num2, mPos);
  bake(num8, mPos);
  return { frame, disc, numerals: merge([num2, num8]) };
}

// Open-Heart Escapement Exhibition Aperture Frame (stepped ring, no bridge bar)
function openHeartFrameGeo() {
  const outer = lathe([[.34, .198], [.44, .198], [.44, .228], [.34, .228]], 40);
  const step = lathe([[.30, .203], [.34, .203], [.34, .218], [.30, .218]], 40);
  const pad = () => lathe([[0, .198], [.034, .198], [.034, .214], [0, .214]], 14);
  const pads = merge([bake(pad(), T(0, 0, .39)), bake(pad(), T(0, 0, -.39))]);
  const fTotal = merge([outer, step, pads]);
  bake(fTotal, T(-.52, 0, .48));
  return fTotal;
}

// Astronomical Moonphase Complication at 6 o'clock — gold frame, midnight sky, crescent moon
function moonphaseGeo() {
  const gold = merge([
    lathe([[.225, .196], [.30, .196], [.30, .226], [.225, .226]], 44),
    lathe([[.20, .201], [.225, .201], [.225, .216], [.20, .216]], 44)
  ]);
  const sky = lathe([[0, .202], [.202, .202], [.202, .205], [0, .205]], 40);
  const moon = lathe([[0, .206], [.062, .206], [.062, .2095], [0, .2095]], 30);
  shift(moon, -.042, 0, -.010);
  const mask = lathe([[0, .210], [.060, .210], [.060, .212], [0, .212]], 30);
  shift(mask, -.010, 0, .004);
  const stars = merge([
    (() => { const s = lathe([[0, .206], [.010, .206], [.010, .208], [0, .208]], 10); return shift(s, .055, 0, -.05); })(),
    (() => { const s = lathe([[0, .206], [.009, .206], [.009, .208], [0, .208]], 10); return shift(s, -.045, 0, .058); })(),
    (() => { const s = lathe([[0, .206], [.008, .206], [.008, .208], [0, .208]], 10); return shift(s, .022, 0, .075); })()
  ]);
  const g = merge([gold, moon, stars]);
  bake(g, T(0, 0, 1.05));
  bake(sky, T(0, 0, 1.05));
  bake(mask, T(0, 0, 1.05));
  return { gold: g, sky, mask };
}

// 3D Faceted Dauphine Hand with center ridge (roof-pitched cross section)
function dauphineHand(L, w, hub, h, tipW = 0.008) {
  const g = { p: [], n: [], i: [] };
  const add = (x, y, z, nx, ny, nz) => { g.p.push(x, y, z); g.n.push(nx, ny, nz); return g.p.length / 3 - 1; };
  const nLy = w * 0.75, nLx = -h * 0.8, lL = Math.hypot(nLx, nLy);
  const nLeft = [nLx / lL, nLy / lL, 0], nRight = [-nLx / lL, nLy / lL, 0];
  const r0 = [0, h, hub], r1 = [0, h * 0.7, -L * 0.97], rTip = [0, h * 0.4, -L];
  const lHub = [-w * 0.65, h * 0.15, hub * 0.75], lMid = [-w, h * 0.15, 0], lTip = [-tipW, h * 0.1, -L];
  const rHub = [w * 0.65, h * 0.15, hub * 0.75], rMid = [w, h * 0.15, 0], rTipR = [tipW, h * 0.1, -L];
  const bHub = [0, -h * 0.25, hub * 0.8], bTip = [0, -h * 0.25, -L];

  const p_r0_L = add(r0[0], r0[1], r0[2], nLeft[0], nLeft[1], nLeft[2]);
  const p_r1_L = add(r1[0], r1[1], r1[2], nLeft[0], nLeft[1], nLeft[2]);
  const p_rTip_L = add(rTip[0], rTip[1], rTip[2], nLeft[0], nLeft[1], nLeft[2]);
  const p_lHub_L = add(lHub[0], lHub[1], lHub[2], nLeft[0], nLeft[1], nLeft[2]);
  const p_lMid_L = add(lMid[0], lMid[1], lMid[2], nLeft[0], nLeft[1], nLeft[2]);
  const p_lTip_L = add(lTip[0], lTip[1], lTip[2], nLeft[0], nLeft[1], nLeft[2]);
  g.i.push(p_r0_L, p_lHub_L, p_lMid_L, p_r0_L, p_lMid_L, p_r1_L, p_r1_L, p_lMid_L, p_lTip_L, p_r1_L, p_lTip_L, p_rTip_L);

  const p_r0_R = add(r0[0], r0[1], r0[2], nRight[0], nRight[1], nRight[2]);
  const p_r1_R = add(r1[0], r1[1], r1[2], nRight[0], nRight[1], nRight[2]);
  const p_rTip_R = add(rTip[0], rTip[1], rTip[2], nRight[0], nRight[1], nRight[2]);
  const p_rHub_R = add(rHub[0], rHub[1], rHub[2], nRight[0], nRight[1], nRight[2]);
  const p_rMid_R = add(rMid[0], rMid[1], rMid[2], nRight[0], nRight[1], nRight[2]);
  const p_rTip_R2 = add(rTipR[0], rTipR[1], rTipR[2], nRight[0], nRight[1], nRight[2]);
  g.i.push(p_r0_R, p_rMid_R, p_rHub_R, p_r0_R, p_r1_R, p_rMid_R, p_r1_R, p_rTip_R2, p_rMid_R, p_r1_R, p_rTip_R, p_rTip_R2);

  const p_bHub = add(bHub[0], bHub[1], bHub[2], 0, -1, 0), p_bTip = add(bTip[0], bTip[1], bTip[2], 0, -1, 0);
  const p_lMid_B = add(lMid[0], -h * 0.25, lMid[2], 0, -1, 0), p_rMid_B = add(rMid[0], -h * 0.25, rMid[2], 0, -1, 0);
  g.i.push(p_bHub, p_lMid_B, p_rMid_B, p_lMid_B, p_bTip, p_rMid_B);
  return g;
}

const gearPoly = (n, ro, ri, cutRatio = 0.5) => {
  const q = [], w = TAU / n;
  for (let i = 0; i < n; i++) {
    const f0 = 0.05, f1 = cutRatio * 0.9, f2 = cutRatio, f3 = 0.95;
    [[ro, f0], [ro, f1], [ri, f2], [ri, f3]].forEach(([r, f]) => {
      q.push([r * Math.cos(i * w + f * w), r * Math.sin(i * w + f * w)]);
    });
  }
  return q;
};

// ---------- Material Palettes (Linear Color Space) ----------
const lin = c => c.map(v => v ** 2.2);

const emer = [.015, .32, .18], emerHi = [.04, .52, .26],
  ti = [.45, .46, .50], tiHi = [.60, .62, .68],
  steel = [.74, .76, .82], steelP = [.80, .85, .95], champ = [.84, .70, .38], champHi = [.98, .86, .56],
  rose = [.88, .54, .36], cyanL = [.30, 1.05, 1.15], ruby = [.85, .04, .14], bz = [.72, .50, .26],
  dark = [.03, .03, .05], plateDk = [.14, .15, .20], vioSec = [.62, .45, .98],
  blueScrew = [.14, .26, .72], midBlue = [.015, .04, .18], midBlueHi = [.04, .12, .38],
  whiteDial = [.92, .94, .98];

const parts = [];
const mk = (g, c, m, r, M = I, f = null, a = 1, tC = c, ir = 0, gr = 0, sb = 0) => ({ g, c: lin(c), m, r, M, f, a, t: lin(tC), i: ir, g2: gr, sb });
const part = (id, ex, ms) => parts.push({ id, ex, ms });

// Hand and gear helpers
const hand = (L, w, hub, h, c, key) => mk(dauphineHand(L, w, hub, h), c, 1, 0.12, T(0, 0.38, 0), () => RY(-A[key]), 1, champHi, 0.3);
const lume = (L, y, key, w = 0.016) => mk(extrude([[-w, -0.2], [w, -0.2], [w * 0.75, -L], [-w * 0.75, -L]], 0.02), cyanL, 0, 0.45, T(0, y, 0), () => RY(-A[key]), 1, cyanL, 0.9);
const spin = (n, ro, ri, x, y, z, k, c = steel) => mk(extrude(gearPoly(n, ro, ri), 0.045), c, 0.95, 0.22, T(x, y, z), () => RY(A.a * k));
const crownM = mul(T(2.05, 0, 0), RZ(-Math.PI / 2));

// 1. CRYSTAL (Domed sapphire with AR coating)
part('crystal', [0, 4.6, 0], [
  mk(lathe(Array.from({ length: 16 }, (_, i) => {
    const r = 1.82 * (1 - i / 15);
    return [r, 0.48 + 0.14 * Math.sqrt(Math.max(0, 1 - (r / 1.82) ** 2))];
  }), 72, 1), [.90, .94, 1.0], 0, 0.02, I, null, 0.06, [.35, .25, .95], 0.95)
]);

// 2. BEZEL (Brushed titanium with 45° polished chamfer and 8 hexagonal screws)
part('bezel', [0, 3.6, 0], [
  mk(lathe([[1.78, .36], [2.04, .36], [2.04, .48], [1.78, .48]], 72), ti, .94, .28, I, null, 1, tiHi, .4, .35),
  mk(lathe([[2.04, .48], [2.14, .38], [2.14, .34], [2.04, .34]], 72), steelP, 1, .08, I, null, 1, steelP, .3),
  mk(lathe([[1.70, .22], [1.78, .36], [1.78, .48], [1.70, .22]], 72), steelP, 1, .10, I, null, 1, steelP, .25),
  mk(merge([...Array(8)].map((_, i) => {
    const a = i * TAU / 8, r = 1.94;
    const screwHead = lathe([[0, 0], [0.042, 0], [0.045, 0.016], [0, 0.016]], 16);
    const slot = extrude(rect(0.008, 0.038), 0.01);
    shift(slot, 0, 0.014, 0);
    const sc = merge([screwHead, slot]);
    return bake(sc, mul(T(Math.cos(a) * r, 0.482, Math.sin(a) * r), RY(-a)));
  })), steelP, 1, .12),
  mk(merge([...Array(60)].map((_, i) => {
    const a = i * TAU / 60, is5Min = i % 5 === 0;
    return bake(extrude(rect(is5Min ? .075 : .042, .004), .008), mul(T(Math.cos(a) * 1.86, .484, Math.sin(a) * 1.86), RY(-a)));
  })), dark, .3, .4),
  mk(bake(extrude([[.11, .055], [.11, -.055], [-.12, 0]], .024), mul(T(0, .485, -1.86), RY(Math.PI / 2))), champ, 1, .18),
  mk(bake(lathe([[0, 0], [.032, 0], [.032, .016], [0, .016]], 16), mul(T(0, .495, -1.86), RY(Math.PI / 2))), cyanL, 0, .45)
]);

// 3. HANDS (Faceted 3D Dauphine hands with Super-LumiNova and ruby pinion)
part('hands', [0, 2.8, 0], [
  hand(1.15, .095, .20, .048, champ, 'h'),
  lume(.72, .41, 'h', .016),
  hand(1.62, .076, .20, .048, champ, 'm'),
  lume(1.12, .47, 'm', .013),
  mk(extrude([[-.010, .46], [.010, .46], [.006, -1.70], [-.006, -1.70]], .024), vioSec, 1, .18, T(0, .51, 0), () => RY(-A.s)),
  mk(shift(extrude(rect(.020, .085), .026), 0, 0, -1.65), cyanL, 0, .4, T(0, .51, 0), () => RY(-A.s)),
  mk(shift(lathe([[.030, 0], [.085, 0], [.085, .024], [.030, .024]], 32), 0, 0, .32), champ, 1, .20, T(0, .51, 0), () => RY(-A.s)),
  mk(lathe([[0, 0], [.052, 0], [.052, .022], [0, .022]], 24), rose, 1, .14, T(0, .522, 0)),
  mk(lathe([[0, 0], [.024, 0], [.024, .015], [0, .015]], 16), ruby, .25, .12, T(0, .540, 0))
]);

// 4. DIAL (Deep Imperial Midnight Blue Sunburst, Applied Hour Markers, Date, Moonphase & Open-Heart)
const dateW = dateWindowGeo(), moonP = moonphaseGeo();
part('dial', [0, 1.8, 0], [
  mk(lathe([[0, .16], [1.70, .16], [1.70, .195], [0, .195]], 72), midBlue, .85, .16, I, null, 1, midBlueHi, .7, .85, 1),
  mk(lathe([[1.42, .195], [1.70, .195], [1.70, .225], [1.42, .225]], 72), plateDk, .88, .26, I, null, 1, tiHi, .3, .4),
  mk(merge([ring(1.44, 1.455, .226, .228), ring(1.64, 1.655, .226, .228)]), dark, .3, .4),
  mk(merge([...Array(60)].filter((_, i) => i % 5 !== 0).map((_, i) => {
    const a = (i + Math.floor(i / 4) + 1) * TAU / 60;
    return bake(extrude(rect(.0035, .032), .008), mul(T(Math.cos(a) * 1.55, .227, Math.sin(a) * 1.55), RY(-a)));
  })), steelP, 1, .2),
  mk(merge([...Array(12)].map((_, i) => {
    const a = i * TAU / 12;
    return bake(extrude(rect(.006, .058), .010), mul(T(Math.cos(a) * 1.55, .227, Math.sin(a) * 1.55), RY(-a)));
  })), champHi, 1, .15),
  mk(appliedIndicesGeo(), champ, 1, .12, I, null, 1, champHi, .4),
  mk(appliedLumeGeo(), cyanL, 0, .45, I, null, 1, cyanL, 0.95),
  // Recessed Open-Heart Aperture Cavity
  mk(shift(lathe([[0, .12], [.37, .12], [.37, .194], [0, .194]], 32), -.52, 0, .48), dark, .2, .5),
  mk(openHeartFrameGeo(), champ, 1, .14, I, null, 1, champHi, .35),
  // Astronomical Moonphase Aperture
  mk(moonP.gold, champ, 1, .12, I, null, 1, champHi, .35),
  mk(moonP.sky, midBlue, .85, .18, I, null, 1, midBlueHi, .5),
  mk(moonP.mask, midBlue, .85, .18, I, null, 1, midBlueHi, .5),
  mk(dateW.frame, champ, 1, .14, I, null, 1, champHi, .35),
  mk(dateW.disc, whiteDial, .1, .3),
  mk(dateW.numerals, dark, .3, .5),
  mk(bake(extrude(rect(.16, .050), .018), T(0, .215, -.95)), champ, 1, .16, I, null, 1, champHi, .35)
]);

// 5. MOVEMENT (Haute horlogerie caliber with Geneva stripes, perlage & tourbillon-inspired balance)
part('movement', [0, .9, 0], [
  mk(lathe([[0, -.50], [1.62, -.50], [1.62, -.12], [0, -.12]], 64), plateDk, .75, .42, I, null, 1, [.28, .34, .52], .35),
  mk(lathe([[0, -.3], [.6, -.3], [.6, -.07], [0, -.07]], 48), bz, 1, .26, T(-.537, .05, -.31), null, 1, [.92, .64, .32], .25, .35),
  mk(extrude(gearPoly(36, .58, .51), .022), champ, 1, .20, T(-.537, .075, -.31)),
  mk(merge([...Array(5)].map((_, i) => {
    const a = i * TAU / 5;
    return bake(extrude(rect(.22, .024), .018), mul(T(-.537 + Math.cos(a) * .25, .085, -.31 + Math.sin(a) * .25), RY(-a)));
  })), champ, 1, .18),
  spin(28, .62, .54, -.82, -.06, -.475, -2.2, champ),
  spin(24, .55, .47, .69, -.07, -.4, 2.2, rose),
  spin(18, .38, .31, 0, -.08, 1.05, -3.1, steelP),
  spin(15, .24, .18, .32, -.07, .55, 4.4, steelP),
  // Balance Wheel Assembly inside Open-Heart Aperture at (-0.52, 0.13, 0.48) [matching HS.balance]
  mk(lathe([[.28, -.02], [.36, -.02], [.36, .014], [.28, .014]], 36), champ, 1, .12, T(-.52, .13, .48), () => RY(A.bal)),
  mk(merge([...Array(3)].map((_, i) => {
    const a = i * TAU / 3;
    return bake(extrude(rect(.16, .020), .014), mul(T(Math.cos(a) * .15, .138, Math.sin(a) * .15), RY(-a)));
  })), rose, 1, .22, T(-.52, 0, .48), () => RY(A.bal)),
  mk(merge([...Array(16)].map((_, i) => {
    const a = i * TAU / 16;
    return bake(lathe([[0, 0], [.016, 0], [.016, .018], [0, .018]], 8), T(Math.cos(a) * .35, .135, Math.sin(a) * .35));
  })), champ, 1, .12, T(-.52, 0, .48), () => RY(A.bal)),
  mk(lathe([[.07, .13], [.20, .13], [.20, .138], [.07, .138]], 28), blueScrew, 1, .18, T(-.52, 0, .48), () => RY(A.bal * 1.5)),
  mk(lathe([[0, .13], [.065, .13], [.065, .155], [0, .155]], 20), rose, 1, .16, T(-.52, 0, .48), () => RY(A.bal)),
  mk(lathe([[0, .16], [.028, .16], [.028, .178], [0, .178]], 16), ruby, .25, .12, T(-.52, 0, .48)),
  mk(lathe([[.52, .052], [1.18, .052], [1.18, .078], [.52, .078]], 30, 0, 66 * D, 114 * D), rose, 1, .22, I, null, 1, [1, .72, .48], .3),
  mk(bake(extrude(rect(.32, .038), .024), mul(T(0, .074, .94), RY(Math.PI / 2))), rose, 1, .20, I, null, 1, [1, .72, .48], .3),
  mk(lathe([[.68, -.02], [1.25, -.02], [1.25, .006], [.68, .006]], 30, 0, 188 * D, 232 * D), steel, .95, .24, I, null, 1, [.65, .75, .95], .2),
  mk(merge([
    ...Array(4).fill(0).map((_, i) => {
      const a = (190 + 22 * i) * D;
      return bake(lathe([[0, 0], [.042, 0], [.042, .024], [0, .024]], 14), T(Math.cos(a) * .9, .006, Math.sin(a) * .9));
    }),
    ...Array(4).fill(0).map((_, i) => {
      const a = (60 + 32 * i) * D;
      return bake(lathe([[0, 0], [.04, 0], [.04, .022], [0, .022]], 14), T(Math.cos(a) * .96, .078, Math.sin(a) * .96));
    })
  ]), ruby, .25, .14),
  mk(merge([[202, .006, 1.16], [218, .006, 1.16], [72, .078, 1.05], [108, .078, 1.05], [-0.5, -.06, 0.4], [130, .05, 0.8]].map(([ad, y, r]) => {
    const a = ad * D;
    return bake(lathe([[0, 0], [.048, 0], [.048, .02], [0, .02]], 12), T(Math.cos(a) * r, y, Math.sin(a) * r));
  })), blueScrew, .95, .16)
]);

// 6. CASE (Sculpted 41mm titanium case, beveled anglage & organic curved lugs)
part('case', [0, -.8, 0], [
  mk(lathe([[0, -.46], [1.5, -.44], [1.88, -.34], [2.02, -.18], [2.08, 0], [2.04, .18], [2.08, .26], [1.78, .26], [1.78, -.44], [1.70, -.46], [0, -.46]], 72), ti, .94, .36, I, null, 1, tiHi, .45, .35),
  mk(lathe([[1.74, .24], [2.10, .24], [2.10, .28], [1.74, .28]], 72), steelP, 1, .10),
  mk(ring(1.74, 1.88, -.40, -.34, 64), rose, 1, .22),
  mk(sculptedLug(-0.92, -1), ti, .94, .35, I, null, 1, tiHi, .45, .35),
  mk(sculptedLug(0.92, -1), ti, .94, .35, I, null, 1, tiHi, .45, .35),
  mk(sculptedLug(-0.92, 1), ti, .94, .35, I, null, 1, tiHi, .45, .35),
  mk(sculptedLug(0.92, 1), ti, .94, .35, I, null, 1, tiHi, .45, .35),
  mk(bake(extrude([[1.78, -.20], [2.14, -.16], [2.14, -.05], [1.86, -.05]], .22), T(0, -.03, 0)), ti, .94, .35, I, null, 1, tiHi, .45),
  mk(bake(extrude([[1.78, .05], [2.14, .05], [2.14, .16], [1.86, .20]], .22), T(0, -.03, 0)), ti, .94, .35, I, null, 1, tiHi, .45),
  mk(merge([[1.12, -2.40, -1], [1.12, 2.40, -1], [-1.12, -2.40, 1], [-1.12, 2.40, 1]].map(([x, z, s]) =>
    bake(lathe([[0, 0], [.050, 0], [.050, .022], [0, .022]], 16), mul(T(x, -.10, z), RZ(s * Math.PI / 2)))
  )), steelP, 1, .18)
]);

// 7. STRAP (Integrated Articulated Titanium Bracelet with Polished Center Links & Clasp)
const brTop = buildBracelet(true), brBot = buildBracelet(false);
part('strap', [0, -1.9, 0], [
  mk(merge([brTop.outer, brBot.outer]), ti, .94, .32, I, null, 1, tiHi, .4, .4),
  mk(merge([brTop.center, brBot.center]), champ, 1, .12, I, null, 1, champHi, .35),
  mk(bake(extrude(rect(.82, .18), .14), T(0, -1.05, 4.4)), ti, .94, .30, I, null, 1, tiHi, .4),
  mk(bake(extrude(rect(.22, .06), .04), T(0, -.95, 4.4)), champ, 1, .16)
]);

// 8. CASEBACK (Exhibition sapphire display back with tungsten & 22k gold winding rotor)
part('caseback', [0, -3.4, 0], [
  mk(lathe([[1.20, -.55], [1.68, -.55], [1.68, -.48], [1.20, -.48]], 64), ti, .95, .28, I, null, 1, tiHi, .3),
  mk(ring(1.28, 1.46, -.56, -.53, 64), rose, 1, .24),
  mk(lathe([[0, -.545], [1.22, -.545], [1.22, -.535], [0, -.535]], 40), [.82, .92, 1.0], 0, .04, I, null, .18),
  mk(lathe([[.44, -.53], [1.25, -.53], [1.25, -.50], [.44, -.50]], 36, 0, 0, Math.PI), champ, 1, .20, I, () => RY(A.a * 1.8), 1, champHi, .35),
  mk(merge([...Array(6)].map((_, i) => {
    const a = i * TAU / 6;
    return bake(lathe([[0, -.56], [.042, -.56], [.042, -.54], [0, -.54]], 12), T(Math.cos(a) * 1.54, 0, Math.sin(a) * 1.54));
  })), steelP, 1, .18)
]);

// 9. CROWN (Fluted screw-down titanium crown with emerald cabochon)
part('crown', [1.3, 0, 0], [
  mk(lathe([[0, 0], [.22, 0], [.26, .05], [.26, .38], [.2, .44], [0, .44]], 40), ti, .94, .34, crownM, null, 1, tiHi, .4, .25),
  mk(lathe([[.24, .30], [.28, .30], [.28, .36], [.24, .36]], 40), rose, 1, .22, crownM),
  mk(merge([...Array(28)].map((_, i) => {
    const a = i * TAU / 28;
    return bake(extrude(rect(.038, .012), .075), mul(crownM, mul(T(Math.cos(a) * .27, .21, Math.sin(a) * .27), RY(-a))));
  })), steelP, 1, .14),
  mk(lathe([[0, .44], [.065, .44], [.065, .485], [0, .485]], 24), emer, .2, .10, crownM, null, 1, emerHi, .6)
]);

const HS = {
  crystal: [[0, .58, 0], 'crystal', 'Domed sapphire crystal with multi-layer anti-reflective coating, drawn as a transparent shell over the dial.', [16, 16]],
  hands: [[-.3, .45, -.5], 'hands', 'Faceted 3D Dauphine blades in rose gold and champagne, with cyan Super-LumiNova inlays. The violet needle seconds hand sweeps eight beats a second.', [16, -34]],
  barrel: [[-.537, .05, -.31], 'movement', 'The mainspring barrel, finished in warm brushed bronze with an openworked champagne gold ratchet wheel.', [16, -22]],
  balance: [[-.52, .18, .48], 'movement', 'The balance wheel swings four times a second (28,800 vibrations per hour) inside a tourbillon-inspired steel cage with 16 regulating inertia screws. It cannot run backwards: reverse mode is a visual simulation.', [16, -22]],
  crown: [[2.32, .1, 0], 'crown', 'A screw-down style crown with 28 knurled titanium grip teeth, a rose-gold accent groove, and an inset emerald cabochon.', [16, -22]]
};

const tris = parts.reduce((s, p) => s + p.ms.reduce((t, m) => t + m.g.i.length / 3, 0), 0);

// ---------- WebGL2 Shaders & Physically Based Pipeline ----------
const VS = `#version 300 es
layout(location=0) in vec3 aP;
layout(location=1) in vec3 aN;
uniform mat4 uVP, uM;
out vec3 vN, vW, vL;

void main() {
  vec4 w = uM * vec4(aP, 1.0);
  vW = w.xyz;
  vL = aP;
  vN = mat3(uM) * aN;
  gl_Position = uVP * w;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vN, vW, vL;
out vec4 o;

uniform vec3 uE, uC, uT, uK;
uniform vec2 uI;
uniform float uS, uHl;

// Studio environment map: key softbox, warm champagne fill, violet kicker, and horizon line
vec3 studioEnv(vec3 d, float ro) {
  float t = d.y * 0.5 + 0.5;
  vec3 envBase = mix(vec3(0.012, 0.015, 0.024), vec3(0.14, 0.16, 0.22), smoothstep(0.1, 0.9, t));
  
  float horizon = exp(-abs(d.y) * 4.2);
  envBase += vec3(0.18, 0.20, 0.26) * horizon * (1.0 - ro * 0.6);

  vec3 keyDir = normalize(vec3(-0.62, 0.78, 0.45));
  float dKey = max(dot(d, keyDir), 0.0);
  float spotKey = pow(dKey, mix(80.0, 4.0, ro));
  vec3 keyLight = vec3(2.2, 2.1, 1.95) * spotKey;

  vec3 fillDir = normalize(vec3(0.65, 0.35, 0.68));
  float dFill = max(dot(d, fillDir), 0.0);
  float spotFill = pow(dFill, mix(56.0, 3.5, ro));
  vec3 fillLight = vec3(1.3, 1.05, 0.75) * spotFill;

  vec3 vioDir = normalize(vec3(0.72, 0.32, -0.68));
  float dVio = max(dot(d, vioDir), 0.0);
  float spotVio = pow(dVio, mix(64.0, 4.5, ro));
  vec3 vioLight = vec3(0.85, 0.75, 1.45) * spotVio;

  vec3 cyanDir = normalize(vec3(-0.45, -0.55, -0.70));
  float dCyan = max(dot(d, cyanDir), 0.0);
  float spotCyan = pow(dCyan, mix(48.0, 3.0, ro));
  vec3 cyanLight = vec3(0.16, 0.58, 0.80) * spotCyan;

  return envBase + keyLight + fillLight + vioLight + cyanLight;
}

// Narkowicz ACES Filmic Tone Mapping curve
vec3 acesFilmic(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(uE - vW);
  if (dot(n, v) < 0.0) n = -n;
  vec3 r = reflect(-v, n);
  float nv = max(dot(n, v), 0.001);
  float inv = 1.0 - nv;

  float me = uK.x, ro = uK.y, al = uK.z;
  vec3 base = uC;
  float rimMul = 1.0;

  // Sapphire Crystal Glass Handling (Alpha Pass)
  if (al < 0.95) {
    float fGlass = pow(inv, 3.5);
    vec3 arCoat = mix(vec3(0.40, 0.18, 0.88), vec3(0.08, 0.65, 0.95), nv);
    vec3 gRef = studioEnv(r, 0.02) * (fGlass * 0.75 + 0.025) + arCoat * (fGlass * 0.40 + 0.012);
    
    vec3 keyDir = normalize(vec3(-0.62, 0.78, 0.45));
    vec3 hKey = normalize(keyDir + v);
    float glint = pow(max(dot(n, hKey), 0.0), 128.0) * 2.2;
    gRef += vec3(1.8, 1.7, 1.6) * glint;
    gRef += vec3(0.52, 0.36, 1.25) * (fGlass * 0.9 + 0.05) * uHl; // interaction highlight

    float glassAlpha = clamp(0.04 + fGlass * 0.55 + glint * 0.35 + uHl * 0.22, 0.0, 0.96);
    vec3 toneCol = acesFilmic(gRef);
    o = vec4(pow(toneCol, vec3(1.0 / 2.2)), glassAlpha);
    return;
  }

  // Anisotropic Radial Sunburst (dial only) — flagged per material with uS.
  // All other flat surfaces with uI.y just get fine brushed grain.
  if (uS > 0.5 && abs(n.y) > 0.65 && length(vL.xz) > 0.08) {
    vec3 tangent = normalize(vec3(-vL.z, 0.0, vL.x));
    float anisoDot = abs(dot(r, tangent));
    float anisoSpec = pow(1.0 - anisoDot, 12.0) * uI.y;

    float theta = atan(vL.z, vL.x);
    float micro = sin(theta * 240.0) * 0.04;
    ro = clamp(ro - anisoSpec * 0.10 + micro, 0.04, 0.95);

    float radius = length(vL.xz);
    vec3 dialNavy = mix(vec3(0.016, 0.050, 0.20), vec3(0.003, 0.011, 0.055), smoothstep(0.20, 1.70, radius));
    base = dialNavy + vec3(0.06, 0.17, 0.55) * anisoSpec * 1.35;
    rimMul = 0.55;
  } else if (uI.y > 0.01) {
    float sp = fract(sin(dot(vW.xz, vec2(12.9898, 78.233))) * 43758.5453);
    ro = clamp(ro + (sp - 0.5) * uI.y * 0.18, 0.04, 0.95);
  }

  // Angle-Dependent Iridescence & Titanium Sheen
  if (uI.x > 0.01 && me > 0.5) {
    float fres = pow(inv, 2.5);
    base = mix(base, uT, fres * uI.x);
  }

  // Ambient Occlusion & Cavity Depth
  float ao = clamp((vW.y + 0.60) * 1.45, 0.35, 1.0);
  if (n.y < -0.1) ao *= 0.68;

  // Physical Fresnel F0 (Metal vs Dielectric)
  vec3 F0 = mix(vec3(0.04), base, me);
  if (me < 0.3 && uC.r > 0.5 && uC.g < 0.1) F0 = vec3(0.08); // Synthetic ruby

  float f5 = pow(inv, 5.0);
  vec3 F = F0 + (1.0 - F0) * f5 * (1.0 - ro * 0.70);

  // Environment Reflection (Split-sum IBL approximation)
  vec3 specEnv = studioEnv(r, ro) * F;

  // Direct Key & Fill Lights (Cook-Torrance GGX approximation)
  vec3 LKey = normalize(vec3(-0.62, 0.78, 0.45));
  float dKey = max(dot(n, LKey), 0.0);
  vec3 LFill = normalize(vec3(0.65, 0.35, 0.68));
  float dFill = max(dot(n, LFill), 0.0);

  vec3 diffuse = base * (1.0 - me) * (studioEnv(n, 1.0) * 0.35 + dKey * vec3(1.3, 1.22, 1.1) * 0.75 + dFill * vec3(0.9, 0.8, 0.6) * 0.45) * ao;

  // Direct Specular Highlight (GGX)
  vec3 hKey = normalize(LKey + v);
  float nhKey = max(dot(n, hKey), 0.0);
  float aRough = max(ro * ro, 0.002);
  float a2 = aRough * aRough;
  float denom = nhKey * nhKey * (a2 - 1.0) + 1.0;
  float D = a2 / (3.14159265 * denom * denom + 1e-5);
  
  float specTerm = D * 0.25 * (1.0 - ro * 0.5);
  vec3 specCol = mix(vec3(1.0), base, me) * specTerm * vec3(2.2, 2.1, 1.95) * dKey;

  // Rim Silhouette Lighting (defines the polished chamfers)
  vec3 rimVioDir = normalize(vec3(0.72, 0.32, -0.68));
  float rimVio = pow(inv, 3.2) * max(dot(n, rimVioDir), 0.0) * 0.9;
  vec3 rimCyanDir = normalize(vec3(-0.45, -0.55, -0.70));
  float rimCyan = pow(inv, 3.2) * max(dot(n, rimCyanDir), 0.0) * 0.55;
  vec3 rimLight = vec3(0.60, 0.44, 1.00) * rimVio + vec3(0.16, 0.48, 0.68) * rimCyan;

  vec3 col = diffuse + specEnv + specCol + rimLight * (1.0 - ro * 0.62) * rimMul;

  // Component interaction highlight: violet rim + faint fill, restrained so materials stay readable
  col += (vec3(0.62, 0.46, 1.15) * pow(inv, 2.3) * 1.05 + vec3(0.10, 0.065, 0.24)) * uHl;

  // Luminous Super-LumiNova Self-Illumination
  if (me < 0.1 && uI.x > 0.8) {
    col += uC * 1.42;
  }

  vec3 mapped = acesFilmic(col);
  o = vec4(pow(mapped, vec3(1.0 / 2.2)), al);
}`;

function initGL() {
  const cv = $('#gl'), gl = cv.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) throw Error('WebGL2 unavailable');
  const sh = (t, s) => {
    const o = gl.createShader(t);
    gl.shaderSource(o, s);
    gl.compileShader(o);
    if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(o));
    return o;
  };
  const pr = gl.createProgram();
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(pr));
  gl.useProgram(pr);

  const U = n => gl.getUniformLocation(pr, n);
  const uVP = U('uVP'), uM = U('uM'), uE = U('uE'), uC = U('uC'), uK = U('uK'), uT = U('uT'), uI = U('uI'), uS = U('uS'), uHl = U('uHl');

  parts.forEach(p => p.ms.forEach(m => {
    m.vao = gl.createVertexArray();
    gl.bindVertexArray(m.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    const n = m.g.p.length / 3, d = new Float32Array(n * 6);
    for (let i = 0; i < n; i++) {
      d.set(m.g.p.slice(i * 3, i * 3 + 3), i * 6);
      d.set(m.g.n.slice(i * 3, i * 3 + 3), i * 6 + 3);
    }
    gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(m.g.i), gl.STATIC_DRAW);
    m.n = m.g.i.length;
  }));

  gl.enable(gl.DEPTH_TEST);
  cv.addEventListener('webglcontextlost', e => { e.preventDefault(); fallback(); });

  const P = getMat(), VP0 = getMat(), VP = getMat(), ex = getMat(), mvp0 = getMat(), mvp = getMat(), mt0 = getMat();
  const EYE = [0, 0, 0], TGT = [0, 0, 0];

  return {
    render() {
      const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (cv.width !== (w * dpr | 0) || cv.height !== (h * dpr | 0)) {
        cv.width = w * dpr | 0; cv.height = h * dpr | 0;
      }
      gl.viewport(0, 0, cv.width, cv.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const asp = w / h, port = asp < .9;
      // Inspection focus: while a component is out, orbit around it and pull back slightly
      const fw = INSP.fw, fx = INSP.focus;
      const d = cam.d * cam.uz * (port ? 1.5 : 1) * (1 + .2 * fw);
      const az = cam.a + cam.ua;
      const el = clamp(cam.e + cam.ue, .05, 1.45);
      const ty = cam.y + (fx[1] - cam.y) * fw;

      EYE[0] = fx[0] * fw + d * Math.cos(el) * Math.sin(az);
      EYE[1] = ty + d * Math.sin(el);
      EYE[2] = fx[2] * fw + d * Math.cos(el) * Math.cos(az);
      TGT[0] = fx[0] * fw; TGT[1] = ty; TGT[2] = fx[2] * fw;

      persp(.52, asp, .5, 80, P);
      P[8] = STAGE.sheet ? 0 : -cam.sx;
      P[9] = STAGE.sheet ? stageY : 0;
      look(EYE, TGT, VP0);
      mul(P, VP0, VP);

      gl.uniformMatrix4fv(uVP, false, VP);
      gl.uniform3fv(uE, EYE);

      // Two-pass rendering: Pass 0 (Opaque & Metals), Pass 1 (Transparent Glass)
      [0, 1].forEach(pass => {
        if (pass) {
          gl.enable(gl.BLEND);
          gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.depthMask(false);
        }
        parts.forEach(p => {
          // World = explode translate · manual pose (p.mm carries pull/lat/rotation about the centroid)
          T(p.ex[0] * cam.E, p.ex[1] * cam.E, p.ex[2] * cam.E, ex);
          const exm = p.mmOn ? mul(ex, p.mm, mt0) : ex;
          const hl = p.ho;
          p.ms.forEach(m => {
            if ((m.a < 1) !== !!pass) return;
            const rot = m.f ? m.f() : I;
            mul(m.M, rot, mvp0);
            if (rot !== I) releaseMat(rot);
            mul(exm, mvp0, mvp);
            gl.uniformMatrix4fv(uM, false, mvp);
            gl.uniform3fv(uC, m.c);
            gl.uniform3fv(uT, m.t);
            gl.uniform2f(uI, m.i, m.g2);
            gl.uniform3f(uK, m.m, m.r, m.a);
            gl.uniform1f(uS, m.sb);
            gl.uniform1f(uHl, hl);
            gl.bindVertexArray(m.vao);
            gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
          });
        });
      });
      gl.disable(gl.BLEND);
      gl.depthMask(true);

      const f = (v, exA, out) => {
        let x, y, z;
        if (exA && exA.ex) { // part mode: manual pose + explode offset, so chips track pulled parts
          const p = exA;
          if (p.mmOn) {
            const m = p.mm;
            x = m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12];
            y = m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13];
            z = m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14];
          } else { x = v[0]; y = v[1]; z = v[2]; }
          x += p.ex[0] * cam.E; y += p.ex[1] * cam.E; z += p.ex[2] * cam.E;
        } else {
          x = v[0] + exA[0] * cam.E; y = v[1] + exA[1] * cam.E; z = v[2] + exA[2] * cam.E;
        }
        const a = VP[0] * x + VP[4] * y + VP[8] * z + VP[12];
        const b = VP[1] * x + VP[5] * y + VP[9] * z + VP[13];
        const c = VP[3] * x + VP[7] * y + VP[11] * z + VP[15];
        out[0] = (a / c * .5 + .5) * w;
        out[1] = (1 - (b / c * .5 + .5)) * h;
        out[2] = c > 0;
        return out;
      };
      f.vp = VP; f.w = w; f.h = h; f.eye = EYE;
      return f;
    }
  };
}
