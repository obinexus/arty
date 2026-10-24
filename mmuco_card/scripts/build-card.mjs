// Lays out the OBINexus MMUCO business card in VectorCraft from seal.svg.
//
//   node mmuco_card/scripts/build-seal.mjs   (first, to refresh seal.svg)
//   node mmuco_card/scripts/build-card.mjs
//
// Writes, in mmuco_card/:
//   seal.vectorcraft, seal.pdf, seal.png       the seal on its own
//   card.vectorcraft, card.pdf, card-*.png     85 x 55 mm card, front and back

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VC = process.env.VECTORCRAFT_CLI || "C:\\Program Files\\VectorCraft\\vectorcraft-cli.exe";
const DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const p = (name) => join(DIR, name);

const MM = 72 / 25.4;
const CARD_W = 85 * MM, CARD_H = 55 * MM, GAP = 20 * MM;
const BACK_X = CARD_W + GAP; // artboard 2's left edge (artboards sit in a row)
const INK = "#000000";

function vc(args) {
  const r = spawnSync(VC, args, { encoding: "utf8" });
  const lines = (r.stdout || "").trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    let step;
    try { step = JSON.parse(line); } catch { console.log(line); continue; }
    const brief = JSON.stringify(step.result ?? step).slice(0, 160);
    console.log(`  ${step.command || step.step || args[0]}: ${brief}`);
    if (step.error || step.ok === false) throw new Error(`${step.command}: ${JSON.stringify(step.error ?? step)}`);
  }
  if (r.status !== 0) throw new Error(`vectorcraft-cli ${args[0]} exited ${r.status}: ${r.stderr}`);
}

const cmd = (id, params) => (params ? ["--cmd", id, "--params", JSON.stringify(params)] : ["--cmd", id]);

// --- the seal on its own -----------------------------------------------------
console.log("seal");
vc(["convert", p("seal.svg"), p("seal.vectorcraft")]);
vc(["convert", p("seal.vectorcraft"), p("seal.pdf")]);
vc(["convert", p("seal.vectorcraft"), p("seal.png"), "--scale", "3"]);

// --- the card ------------------------------------------------------------------
const square = (cx, top, size) => [cx - size / 2, top, size, size];
const frontSeal = 47 * MM;
const backSeal = 22 * MM;
const backCx = BACK_X + CARD_W / 2;

const text = (y, content, size, font, style) =>
  cmd("text.create", { x: backCx, y, text: content, size, font, ...(style && { style }), color: INK, justify: "center" });

console.log("card");
vc([
  "run",
  ...cmd("file.new", {
    name: "OBINexus MMUCO Business Card", width: "85 mm", height: "55 mm", units: "Millimeters",
    artboards: 2, artboardLayout: { layout: "row", spacing: GAP }, bleed: 3 * MM, backgroundContents: "white",
  }),
  ...cmd("artboard.setProps", { artboards: [{ index: 0, name: "Front" }, { index: 1, name: "Back" }] }),
  ...cmd("layer.setProps", { id: 1, name: "Seal" }),
  // Front: the seal, centred.
  ...cmd("file.place", { path: p("seal.svg"), link: false, rect: square(CARD_W / 2, (CARD_H - frontSeal) / 2, frontSeal) }),
  // Back: a small seal over the name, organisation and email.
  ...cmd("file.place", { path: p("seal.svg"), link: false, rect: square(backCx, 7 * MM, backSeal) }),
  ...cmd("select.none"),
  ...cmd("layer.new", { name: "Type", top: true }),
  ...text(37 * MM, "Nnamdi Michael Okpala", 12.5, "Source Serif 4"),
  ...text(42.6 * MM, "OBINexus MMUCO", 7.5, "Source Sans 3", "Semibold"),
  ...cmd("text.setStyle", { tracking: 140 }),
  ...text(47.9 * MM, "support@obinexus.org", 8, "Source Sans 3"),
  ...cmd("select.none"),
  ...cmd("document.save", { path: p("card.vectorcraft") }),
  ...cmd("document.export", { path: p("card.pdf"), format: "pdf" }),
  ...cmd("document.export", { path: p("card.png"), format: "png", ppi: 300, useArtboards: true, background: "white" }),
]);
console.log("done");
