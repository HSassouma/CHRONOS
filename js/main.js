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

