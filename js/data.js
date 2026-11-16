/* data.js – datasets: Titanic records, simulated data, CSV parsing and numeric binning. Depends on stats.js (mulberry32, sampleCat).
 * Homework – Contingency tables, independence and the chi-square test
 */
"use strict";

/* =====================================================================
   2. DATASETS
   ===================================================================== */

/** Titanic: expand the 4-way table into one record per person. */
function titanicRecords() {
  const cls = ["1st", "2nd", "3rd", "Crew"];
  // counts[Survived][Age][Sex][Class]  (R datasets::Titanic)
  const counts = {
    No:  { Child: { Male: [0, 0, 35, 0],    Female: [0, 0, 17, 0] },
           Adult: { Male: [118, 154, 387, 670], Female: [4, 13, 89, 3] } },
    Yes: { Child: { Male: [5, 11, 13, 0],   Female: [1, 13, 14, 0] },
           Adult: { Male: [57, 14, 75, 192], Female: [140, 80, 76, 20] } }
  };
  const recs = [];
  for (const sv in counts) for (const age in counts[sv]) for (const sex in counts[sv][age])
    counts[sv][age][sex].forEach((k, ci) => {
      for (let t = 0; t < k; t++) recs.push({ Class: cls[ci], Sex: sex, Age: age, Survived: sv });
    });
  return recs;
}
const TITANIC_LEVELS = { Class: ["1st", "2nd", "3rd", "Crew"], Sex: ["Male", "Female"], Age: ["Child", "Adult"], Survived: ["No", "Yes"] };

/** Simulated data. Independent: P(F|X) identical for every X. Dependent: P(F|X) shifts with X. */
function simulated(nObs, seed, dependent) {
  const rng = mulberry32(seed);
  const X = ["North", "Centre", "South", "Islands"], F = ["Low", "Medium", "High"];
  const px = [0.35, 0.25, 0.28, 0.12];
  const pfIndep = [0.30, 0.45, 0.25];
  const pfDep = [[0.18, 0.42, 0.40], [0.27, 0.45, 0.28], [0.40, 0.42, 0.18], [0.45, 0.40, 0.15]];
  const recs = [];
  for (let k = 0; k < nObs; k++) {
    const i = sampleCat(px, rng());
    const j = sampleCat(dependent ? pfDep[i] : pfIndep, rng());
    recs.push({ Region: X[i], Income: F[j] });
  }
  return { recs, levels: { Region: X, Income: F } };
}

/** Minimal CSV parser (quotes, , ; or tab). */
function parseCSV(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = []; let row = [], cur = "", q = false;
  for (let k = 0; k < text.length; k++) {
    const ch = text[k];
    if (q) { if (ch === '"') { if (text[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[k + 1] === "\n") k++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter(r => r.some(v => v.trim() !== ""));
  const header = clean[0].map(h => h.trim());
  return { header, recs: clean.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()]))) };
}

/** Bin a numeric column into k quantile classes (labels keep the order). */
function binNumeric(recs, key, k) {
  const vals = recs.map(r => parseFloat(r[key])).filter(Number.isFinite).sort((a, b) => a - b);
  const q = p => vals[Math.min(vals.length - 1, Math.floor(p * (vals.length - 1)))];
  const cuts = [...new Set(Array.from({ length: k - 1 }, (_, t) => q((t + 1) / k)))];
  const fmt = v => +v.toPrecision(4);
  const edges = [vals[0], ...cuts, vals[vals.length - 1]];
  const labels = edges.slice(0, -1).map((e, t) => `${t + 1}: ${t === 0 ? "[" : "("}${fmt(e)}, ${fmt(edges[t + 1])}]`);
  for (const r of recs) {
    const v = parseFloat(r[key]);
    if (!Number.isFinite(v)) { r[key] = ""; continue; }
    let t = cuts.findIndex(cp => v <= cp); if (t === -1) t = cuts.length;
    r[key] = labels[t];
  }
  return labels;
}

