// Builds the OBINexus MMUCO seal as flat SVG geometry from the nsibidi glyph
// sources in arty/projects/src (the contents of src.zip).
//
//   node mmuco_card/scripts/build-seal.mjs
//
// Output: mmuco_card/seal.svg (1000 x 1000), which VectorCraft converts to the
// native .vectorcraft document (see build-card.mjs).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const SRC = join(ROOT, "arty", "projects", "src");
const OUT = join(ROOT, "mmuco_card", "seal.svg");

const INK = "#000000";
const C = 500; // centre of the 1000 x 1000 seal

// ---------------------------------------------------------------- path maths

function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvCcSsQqZz]|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) || [];
  const segs = [];
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, lastC = null;
  const num = () => parseFloat(tokens[i++]);
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    switch (cmd.toUpperCase()) {
      case "M": {
        x = ox + num(); y = oy + num(); sx = x; sy = y;
        segs.push({ c: "M", p: [x, y] });
        cmd = rel ? "l" : "L"; // implicit lineto after moveto
        lastC = null; break;
      }
      case "L": x = ox + num(); y = oy + num(); segs.push({ c: "L", p: [x, y] }); lastC = null; break;
      case "H": x = (rel ? x : 0) + num(); segs.push({ c: "L", p: [x, y] }); lastC = null; break;
      case "V": y = (rel ? y : 0) + num(); segs.push({ c: "L", p: [x, y] }); lastC = null; break;
      case "C": {
        const p = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()];
        segs.push({ c: "C", p }); x = p[4]; y = p[5]; lastC = [p[2], p[3]]; break;
      }
      case "S": {
        const c1 = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        const p = [c1[0], c1[1], ox + num(), oy + num(), ox + num(), oy + num()];
        segs.push({ c: "C", p }); x = p[4]; y = p[5]; lastC = [p[2], p[3]]; break;
      }
      case "Q": {
        const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num();
        segs.push({ c: "C", p: [x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey] });
        x = ex; y = ey; lastC = null; break;
      }
      case "Z": segs.push({ c: "Z", p: [] }); x = sx; y = sy; lastC = null; break;
      default: throw new Error(`unsupported path command ${cmd}`);
    }
  }
  return segs;
}

const rectPath = (x, y, w, h) => [
  { c: "M", p: [x, y] }, { c: "L", p: [x + w, y] }, { c: "L", p: [x + w, y + h] },
  { c: "L", p: [x, y + h] }, { c: "Z", p: [] },
];

const mul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (tx, ty) => [1, 0, 0, 1, tx, ty];
const scale = (s) => [s, 0, 0, s, 0, 0];
const rotate = (deg) => { const r = (deg * Math.PI) / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; };
const compose = (...ms) => ms.reduce((a, b) => mul(a, b));

function transformSegs(segs, m) {
  return segs.map(({ c, p }) => {
    const q = [];
    for (let k = 0; k < p.length; k += 2) q.push(m[0] * p[k] + m[2] * p[k + 1] + m[4], m[1] * p[k] + m[3] * p[k + 1] + m[5]);
    return { c, p: q };
  });
}

function bbox(segs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, px = 0, py = 0;
  const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const { c, p } of segs) {
    if (c === "C") {
      for (let t = 0; t <= 1; t += 1 / 32) {
        const u = 1 - t;
        add(u * u * u * px + 3 * u * u * t * p[0] + 3 * u * t * t * p[2] + t * t * t * p[4],
            u * u * u * py + 3 * u * u * t * p[1] + 3 * u * t * t * p[3] + t * t * t * p[5]);
      }
    }
    if (p.length) { px = p[p.length - 2]; py = p[p.length - 1]; add(px, py); }
  }
  return { x0, y0, x1, y1 };
}

const f = (n) => (Math.abs(n) < 5e-4 ? "0" : n.toFixed(3).replace(/\.?0+$/, ""));
const toD = (segs) => segs.map(({ c, p }) => c + p.map(f).join(" ")).join(" ");

// ------------------------------------------------------------ glyph sources

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function styleOf(tag) {
  const s = {};
  for (const kv of (attr(tag, "style") || "").split(";")) {
    const [k, v] = kv.split(":").map((t) => t && t.trim());
    if (k) s[k] = v;
  }
  return s;
}

// Every <path> and <rect> of a glyph file, in document order, skipping the
// invisible artboard rectangle that each Affinity export starts with.
function loadShapes(file) {
  const svg = readFileSync(join(SRC, file), "utf8");
  const shapes = [];
  for (const tag of svg.match(/<(path|rect)\b[^>]*>/g)) {
    const st = styleOf(tag);
    const fill = st.fill && st.fill !== "none";
    const stroke = st.stroke && st.stroke !== "none";
    if (!fill && !stroke) continue;
    const segs = tag.startsWith("<rect")
      ? rectPath(+attr(tag, "x"), +attr(tag, "y"), +attr(tag, "width"), +attr(tag, "height"))
      : parsePath(attr(tag, "d"));
    shapes.push({ segs, fill, strokeWidth: stroke ? parseFloat(st["stroke-width"]) : 0, key: tag });
  }
  // man.svg repeats its top hook twice.
  return shapes.filter((s, k) => shapes.findIndex((o) => o.key === s.key) === k);
}

const child = loadShapes("Child.svg");     // [big I, small I]
const unity = loadShapes("Unity.svg");      // brackets + figure, split below
const GLYPHS = {
  ibeam: [child[0]],                        // the plain I-beam
  child: child,                             // I-beam with the small I
  man: loadShapes("man.svg"),               // hooked arc
  voyage: loadShapes("Voyage.svg"),         // two rows of chevron arrows
  king: loadShapes("King.svg"),             // star cross with chevron ends
  unityBrackets: [unity[1], unity[2], unity[8], unity[9]],
  unityFigure: [unity[0], unity[3], unity[4], unity[5], unity[6], unity[7]],
  // Nested box with a hash through it (drawn twice in the sketch, at 10:30 and
  // 3:30); no source file has it, so it is built here on the same 52-unit line.
  box: [
    { segs: rectPath(-500, -320, 1000, 640), fill: false, strokeWidth: 52 },
    { segs: rectPath(-380, -200, 760, 400), fill: false, strokeWidth: 52 },
    { segs: parsePath("M-170 -440 V440 M170 -440 V440 M-620 0 H620"), fill: false, strokeWidth: 52 },
  ],
};

// ------------------------------------------------------------------ layout

const R_OUTER = 480;
const R_INNER = 322;
const R_GLYPH = 384;   // centre line of the glyph band
const GLYPH_H = 90;    // radial room per glyph
const GLYPH_W = 125;   // tangential room per glyph

// Clockwise from 12 o'clock, as read off the pencil sketch. Every arrow row
// points clockwise: the journey round the frame.
const RING = [
  "ibeam", "voyage", "man", "child", "voyage", "box", "king", "unityBrackets",
  "child", "voyage", "man", "king", "child", "voyage", "box", "unityFigure",
];

const out = [];
const pathEl = (segs, { fill = false, sw = 0, cap = "round" } = {}) =>
  `<path d="${toD(segs)}" fill="${fill ? INK : "none"}"` +
  (sw ? ` stroke="${INK}" stroke-width="${f(sw)}" stroke-linecap="${cap}" stroke-linejoin="round"` : "") +
  (fill ? ` fill-rule="evenodd"` : "") + `/>`;

// Frame: outer and inner circles, as paths so VectorCraft keeps them editable.
const circle = (r) => parsePath(
  `M${C - r} ${C} C${C - r} ${C - 0.5523 * r} ${C - 0.5523 * r} ${C - r} ${C} ${C - r}` +
  ` C${C + 0.5523 * r} ${C - r} ${C + r} ${C - 0.5523 * r} ${C + r} ${C}` +
  ` C${C + r} ${C + 0.5523 * r} ${C + 0.5523 * r} ${C + r} ${C} ${C + r}` +
  ` C${C - 0.5523 * r} ${C + r} ${C - r} ${C + 0.5523 * r} ${C - r} ${C} Z`);
out.push(`<g id="Frame">`, pathEl(circle(R_OUTER), { sw: 6 }), pathEl(circle(R_INNER), { sw: 5 }), `</g>`);

// Teeth: small chevrons just inside the outer circle, apex toward the centre.
{
  const N = 80, apexR = 447, footR = 466, spread = 1.5;
  const polar = (r, deg) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];
  const teeth = [];
  for (let k = 0; k < N; k++) {
    const a = (360 / N) * (k + 0.5);
    const [lx, ly] = polar(footR, a - spread), [ax, ay] = polar(apexR, a), [rx, ry] = polar(footR, a + spread);
    // 4.2 keeps the teeth at least 0.25 pt on the 22 mm seal on the card's back.
    teeth.push(pathEl(parsePath(`M${lx} ${ly} L${ax} ${ay} L${rx} ${ry}`), { sw: 4.2 }));
  }
  out.push(`<g id="Teeth">`, ...teeth, `</g>`);
}

// Glyph band: each glyph scaled into its slot, upright = outward.
{
  const band = [];
  RING.forEach((name, k) => {
    const shapes = GLYPHS[name];
    const all = shapes.flatMap((s) => s.segs);
    const b = bbox(all);
    const pad = Math.max(...shapes.map((s) => s.strokeWidth)) / 2;
    const w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
    const s = Math.min(GLYPH_H / h, GLYPH_W / w);
    const deg = (360 / RING.length) * k;
    const px = C + R_GLYPH * Math.sin((deg * Math.PI) / 180);
    const py = C - R_GLYPH * Math.cos((deg * Math.PI) / 180);
    const m = compose(translate(px, py), rotate(deg), scale(s), translate(-(b.x0 + b.x1) / 2, -(b.y0 + b.y1) / 2));
    band.push(`<g id="${name}-${k + 1}">`);
    for (const sh of shapes) band.push(pathEl(transformSegs(sh.segs, m), { fill: sh.fill, sw: sh.strokeWidth * s }));
    band.push(`</g>`);
  });
  out.push(`<g id="Nsibidi band">`, ...band, `</g>`);
}

// Centre motif: one closed outline. Two raised towers (or fists) with three
// round merlons each, a central arch, the stem and a grooved plinth. Measured
// off the sketch and made symmetric; units are sketch pixels, x = 0 on the
// axis, y = 0 at the merlon tops.
{
  const HEAD_OUT = 272, HEAD_IN = 114, HEAD_TOP_SPRING = 26, HEAD_BOTTOM = 185;
  const ARM_OUT = 192, ARM_IN = 140, SHOULDER = 350, BODY = 420;
  const ARCH_HALF = 52, ARCH_SPRING = 230, STEM = 85, STEM_BOTTOM = 615;

  // Three round merlons across a head, left to right from xa to xb.
  const merlons = (xa, xb) => {
    const w = (xb - xa) / 3, r = w / 2, k = 0.5523 * r;
    let d = "";
    for (let j = 0; j < 3; j++) {
      const x = xa + j * w;
      d += ` C${x} ${HEAD_TOP_SPRING - k} ${x + r - k} 0 ${x + r} 0 C${x + r + k} 0 ${x + w} ${HEAD_TOP_SPRING - k} ${x + w} ${HEAD_TOP_SPRING}`;
    }
    return d;
  };
  const archK = 0.5523 * ARCH_HALF;
  const outline =
    `M${-STEM} ${STEM_BOTTOM} L${-STEM} ${BODY} L${-ARM_OUT} ${BODY} L${-ARM_OUT} ${HEAD_BOTTOM}` +
    ` L${-HEAD_OUT} ${HEAD_BOTTOM} L${-HEAD_OUT} ${HEAD_TOP_SPRING}` + merlons(-HEAD_OUT, -HEAD_IN) +
    ` L${-HEAD_IN} ${HEAD_BOTTOM} L${-ARM_IN} ${HEAD_BOTTOM} L${-ARM_IN} ${SHOULDER} L${-ARCH_HALF} ${SHOULDER}` +
    ` L${-ARCH_HALF} ${ARCH_SPRING} C${-ARCH_HALF} ${ARCH_SPRING - archK} ${-archK} ${ARCH_SPRING - ARCH_HALF} 0 ${ARCH_SPRING - ARCH_HALF}` +
    ` C${archK} ${ARCH_SPRING - ARCH_HALF} ${ARCH_HALF} ${ARCH_SPRING - archK} ${ARCH_HALF} ${ARCH_SPRING}` +
    ` L${ARCH_HALF} ${SHOULDER} L${ARM_IN} ${SHOULDER} L${ARM_IN} ${HEAD_BOTTOM} L${HEAD_IN} ${HEAD_BOTTOM}` +
    ` L${HEAD_IN} ${HEAD_TOP_SPRING}` + merlons(HEAD_IN, HEAD_OUT) +
    ` L${HEAD_OUT} ${HEAD_BOTTOM} L${ARM_OUT} ${HEAD_BOTTOM} L${ARM_OUT} ${BODY} L${STEM} ${BODY} L${STEM} ${STEM_BOTTOM} Z`;

  // Finger slits between the merlons, the belt line and the plinth.
  const slitW = (HEAD_OUT - HEAD_IN) / 3;
  let details = "";
  for (const sgn of [-1, 1]) for (const j of [1, 2]) {
    const x = sgn * (HEAD_IN + j * slitW);
    details += ` M${x} ${HEAD_TOP_SPRING} L${x} 82`;
  }
  details += ` M${-STEM} 565 L${STEM} 565`;
  const plinth = `M-100 615 L100 615 L125 640 L100 665 L-100 665 L-125 640 Z M-50 615 L-50 665 M0 615 L0 665 M50 615 L50 665`;

  const k = 0.72, H = 665;
  const m = compose(translate(C, C), scale(k), translate(0, -H / 2));
  out.push(
    `<g id="Centre motif">`,
    pathEl(transformSegs(parsePath(outline), m), { sw: 6.5 }),
    pathEl(transformSegs(parsePath(details), m), { sw: 5 }),
    pathEl(transformSegs(parsePath(plinth), m), { sw: 5.5 }),
    `</g>`,
  );
}

const svg =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">\n` +
  `<title>OBINexus MMUCO seal</title>\n` +
  out.join("\n") + `\n</svg>\n`;
writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${svg.length} bytes)`);
