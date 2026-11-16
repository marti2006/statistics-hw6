/* app.js – UI and rendering: tables, charts, interpretation, code panel. Depends on stats.js and data.js.
 * Homework – Contingency tables, independence and the chi-square test
 */
"use strict";

/* =====================================================================
   3. UI / RENDERING
   ===================================================================== */
const $ = id => document.getElementById(id);
const SERIES = ["--s1", "--s2", "--s3", "--s4", "--s5", "--s6", "--s7", "--s8"];
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmtInt = v => v.toLocaleString("en-US");
const fmt = (v, d = 3) => Number.isFinite(v) ? v.toFixed(d) : "—";
const pct = v => Number.isFinite(v) ? (100 * v).toFixed(1) + "%" : "—";
function fmtP(p) {
  if (!Number.isFinite(p)) return "—";
  if (p === 0) return "< 1e-300";
  if (p < 1e-4) { const e = Math.floor(Math.log10(p)); return (p / 10 ** e).toFixed(2) + "·10<sup>" + e + "</sup>"; }
  return p.toFixed(4);
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));

const state = { dataset: "titanic", recs: [], vars: [], levels: {}, x: null, f: null, res: null, ct: null, view: "abs" };

function loadDataset() {
  const ds = $("dsSel").value; state.dataset = ds;
  document.querySelectorAll(".simopt").forEach(el => el.classList.toggle("hidden", !ds.startsWith("sim")));
  $("csvBox").classList.toggle("hidden", ds !== "csv");
  $("titanicDisc").classList.toggle("hidden", ds !== "titanic");
  if (ds === "titanic") {
    state.recs = titanicRecords(); state.vars = ["Class", "Sex", "Age", "Survived"]; state.levels = TITANIC_LEVELS;
    setVarOptions("Class", "Survived");
    $("dsInfo").innerHTML = "2201 records, one per person on board (1316 passengers + 885 crew). Four categorical variables: Class (1st, 2nd, 3rd, Crew), Sex, Age (Child/Adult), Survived (No/Yes). Try also Sex × Survived or Class × Sex.";
  } else if (ds.startsWith("sim")) {
    const dep = ds === "simdep";
    const s = simulated(Math.max(20, +$("simN").value || 600), +$("simSeed").value || 1, dep);
    state.recs = s.recs; state.vars = ["Region", "Income"]; state.levels = s.levels;
    setVarOptions("Region", "Income");
    $("dsInfo").innerHTML = dep
      ? "Synthetic data in which the income band distribution <b>changes</b> with the region (P(F|X) differs by row), so H<sub>0</sub> is false by construction. Lower n to see how power drops."
      : "Synthetic data where Region and Income band are drawn <b>independently</b> (same P(F) in every region), so H<sub>0</sub> is true by construction. Changing the seed shows the p-value varying uniformly; roughly 5% of seeds reject at α = 0.05.";
  } else {
    loadCSV();
  }
}

function loadCSV() {
  try {
    const { header, recs } = parseCSV($("csvText").value);
    if (header.length < 2 || recs.length < 2) throw new Error("need at least two columns and two rows");
    const levels = {}, notes = [];
    for (const h of header) {
      const vals = recs.map(r => r[h]).filter(v => v !== "");
      const numeric = vals.length && vals.every(v => Number.isFinite(+v));
      const distinct = new Set(vals).size;
      if ($("binChk").checked && numeric && distinct > 8) {
        levels[h] = binNumeric(recs, h, +$("binK").value); notes.push(`${esc(h)} binned into ${levels[h].length} quantile classes`);
      }
    }
    state.recs = recs; state.vars = header; state.levels = levels;
    setVarOptions(header[0], header[1]);
    $("dsInfo").innerHTML = `${recs.length} records, ${header.length} columns.` + (notes.length ? " " + notes.join("; ") + "." : "");
  } catch (e) {
    $("dsInfo").innerHTML = `<span class="warn">Could not parse the CSV: ${esc(e.message)}</span>`;
    state.recs = [];
  }
}

function setVarOptions(dx, df) {
  const opts = state.vars.map(v => `<option>${esc(v)}</option>`).join("");
  $("xSel").innerHTML = opts; $("fSel").innerHTML = opts;
  $("xSel").value = dx; $("fSel").value = df;
}

function run() {
  if (!state.recs.length) return;
  const x = $("xSel").value, f = $("fSel").value;
  state.x = x; state.f = f;
  const lv = { x: state.levels[x], f: state.levels[f] };
  const ct = buildContingency(state.recs, x, f, lv);
  state.ct = ct;
  renderRaw();
  if (x === f) { $("ctOut").innerHTML = '<p class="warn">Choose two different variables.</p>'; return; }
  const res = chiSquareTest(ct.n); state.res = res;
  renderCT(); renderProfiles(); renderChi(); renderInterp(); renderStrata();
  $("permRes").textContent = ""; $("permChart").innerHTML = ""; $("permLegend").innerHTML = "";
  runPermutation();
}

function renderRaw() {
  const k = Math.min(6, state.recs.length);
  const cols = state.vars;
  let h = '<table class="ct"><thead><tr><th class="corner">#</th>' + cols.map(c => `<th>${esc(c)}</th>`).join("") + "</tr></thead><tbody>";
  // show a spread of records, not only the first block (Titanic is sorted)
  const idx = Array.from({ length: k }, (_, t) => Math.floor(t * (state.recs.length - 1) / Math.max(1, k - 1)));
  for (const i of idx) h += `<tr><th>${i + 1}</th>` + cols.map(c => `<td>${esc(state.recs[i][c])}</td>`).join("") + "</tr>";
  h += "</tbody></table>";
  $("rawPreview").innerHTML = h + `<p class="caption">${k} of ${fmtInt(state.recs.length)} records, evenly spaced through the file${state.ct?.dropped ? ` · ${state.ct.dropped} records with missing X or F excluded` : ""}.</p>`;
}

/** generic table: values[i][j], row margins, col margins, total, formatter */
function tableHTML(ct, cell, rowM, colM, total, cls = () => "") {
  let h = `<table class="ct"><thead><tr><th class="corner">${esc(state.x)} \\ ${esc(state.f)}</th>`;
  h += ct.fLevels.map(l => `<th>${esc(l)}</th>`).join("");
  if (rowM) h += '<th class="marg">Total</th>';
  h += "</tr></thead><tbody>";
  ct.xLevels.forEach((xl, i) => {
    h += `<tr><th>${esc(xl)}</th>` + ct.fLevels.map((_, j) => `<td class="${cls(i, j)}" ${cls(i, j) ? `style="${cellStyle(i, j)}"` : ""}>${cell(i, j)}</td>`).join("");
    if (rowM) h += `<td class="marg">${rowM(i)}</td>`;
    h += "</tr>";
  });
  if (colM) {
    h += '<tr class="total"><th>Total</th>' + ct.fLevels.map((_, j) => `<td class="marg">${colM(j)}</td>`).join("");
    if (rowM) h += `<td class="marg">${total}</td>`;
    h += "</tr>";
  }
  return h + "</tbody></table>";
}
let cellStyle = () => "";

function renderCT() {
  const R = state.res, ct = state.ct, v = state.view;
  let html, cap;
  if (v === "abs") {
    html = tableHTML(ct, (i, j) => fmtInt(ct.n[i][j]), i => fmtInt(R.rowTot[i]), j => fmtInt(R.colTot[j]), fmtInt(R.N));
    cap = "Joint absolute frequencies n<sub>ij</sub>; the margins are n<sub>i·</sub> (right) and n<sub>·j</sub> (bottom).";
  } else if (v === "rel") {
    html = tableHTML(ct, (i, j) => pct(R.rel[i][j]), i => pct(R.rowMarg[i]), j => pct(R.colMarg[j]), "100%");
    cap = "Joint relative frequencies f<sub>ij</sub> = n<sub>ij</sub>/n, with the marginal distributions of X (right) and F (bottom).";
  } else if (v === "row") {
    html = tableHTML(ct, (i, j) => pct(R.rowProf[i][j]), () => "100%", j => pct(R.colMarg[j]), "100%");
    cap = `Conditional distribution of ${esc(state.f)} given each level of ${esc(state.x)}: f(y<sub>j</sub> | x<sub>i</sub>) = n<sub>ij</sub>/n<sub>i·</sub>. Each row sums to 100%; the bottom row is the marginal of ${esc(state.f)}. Under independence every row equals the bottom row.`;
  } else {
    html = tableHTML(ct, (i, j) => pct(R.colProf[i][j]), i => pct(R.rowMarg[i]), () => "100%", "100%");
    cap = `Conditional distribution of ${esc(state.x)} given each level of ${esc(state.f)}: f(x<sub>i</sub> | y<sub>j</sub>) = n<sub>ij</sub>/n<sub>·j</sub>. Each column sums to 100%; the right column is the marginal of ${esc(state.x)}.`;
  }
  $("ctOut").innerHTML = html; $("ctCap").innerHTML = cap;
}

function renderProfiles() {
  const R = state.res, ct = state.ct, svg = $("profChart");
  const cols = ct.fLevels.map((_, j) => css(SERIES[j % SERIES.length]));
  if (ct.fLevels.length > 8) {
    $("profLegend").innerHTML = '<span class="note">More than 8 categories in F: the chart is omitted, see the row-profile table in §3.</span>'; svg.innerHTML = ""; svg.setAttribute("height", 0); return;
  }
  $("profLegend").innerHTML = ct.fLevels.map((l, j) => `<span><span class="sw" style="background:${cols[j]}"></span>${esc(l)}</span>`).join("");
  const rows = ct.xLevels.map((l, i) => ({ label: l, prof: R.rowProf[i], n: R.rowTot[i] }));
  rows.push({ label: "All", prof: R.colMarg, n: R.N, all: true });
  const W = svg.clientWidth || 860, left = 110, right = 70, barH = 26, gap = 14, top = 6;
  const H = top + rows.length * (barH + gap) + 30 + 8;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  const pw = W - left - right, sx = v => left + v * pw;
  let g = "";
  [0, .25, .5, .75, 1].forEach(t => {
    g += `<line class="gridl" x1="${sx(t)}" x2="${sx(t)}" y1="${top}" y2="${H - 30}"/>`;
    g += `<text x="${sx(t)}" y="${H - 12}" text-anchor="middle">${t * 100}%</text>`;
  });
  rows.forEach((row, k) => {
    const y = top + k * (barH + gap) + (row.all ? 6 : 0);
    if (row.all) g += `<line class="axis" x1="${left - 100}" x2="${W - right + 60}" y1="${y - 10}" y2="${y - 10}" stroke-dasharray="3 3"/>`;
    g += `<text x="${left - 10}" y="${y + barH / 2 + 4}" text-anchor="end" style="font-weight:${row.all ? 700 : 500};fill:var(--ink)">${esc(row.label)}</text>`;
    g += `<text x="${W - right + 8}" y="${y + barH / 2 + 4}">n=${fmtInt(row.n)}</text>`;
    let acc = 0;
    row.prof.forEach((p, j) => {
      if (!(p > 0)) return;
      const x0 = sx(acc), w = Math.max(0, p * pw - (j < row.prof.length - 1 ? 2 : 0));
      const tip = `<b>${esc(state.x)} = ${esc(row.label)}</b><br>${esc(state.f)} = ${esc(ct.fLevels[j])}: ${pct(p)}` +
        (row.all ? "" : `<br>marginal: ${pct(R.colMarg[j])} · n<sub>ij</sub> = ${fmtInt(ct.n[k][j])}`);
      g += `<rect class="hit" data-tip="${esc(tip)}" x="${x0}" y="${y}" width="${w}" height="${barH}" rx="3" fill="${cols[j]}"/>`;
      if (p * pw > 44) g += `<text x="${x0 + w / 2}" y="${y + barH / 2 + 4}" text-anchor="middle" style="fill:${j === 3 ? "#0b0b0b" : "#fff"};font-weight:600;pointer-events:none">${(p * 100).toFixed(0)}%</text>`;
      acc += p;
    });
  });
  svg.innerHTML = g;
}

function divColor(e, maxAbs) {
  const t = Math.min(1, Math.abs(e) / Math.max(maxAbs, 2));
  const a = e >= 0 ? css("--div-pos") : css("--div-neg"), m = css("--div-mid");
  return `color-mix(in oklab, ${a} ${(t * 85).toFixed(0)}%, ${m})`;
}

function renderChi() {
  const R = state.res, ct = state.ct, alpha = +$("alphaSel").value;
  cellStyle = () => "";
  $("expOut").innerHTML = tableHTML(ct, (i, j) => fmt(R.expected[i][j], 2), i => fmtInt(R.rowTot[i]), j => fmtInt(R.colTot[j]), fmtInt(R.N));
  $("contribOut").innerHTML = tableHTML(ct, (i, j) => fmt(R.contrib[i][j], 3), i => fmt(R.contrib[i].reduce((a, b) => a + b, 0), 3),
    j => fmt(R.contrib.reduce((a, row) => a + row[j], 0), 3), "<b>χ² = " + fmt(R.chi2, 3) + "</b>");
  const maxAbs = Math.max(...R.resid.flat().map(Math.abs));
  cellStyle = (i, j) => `background:${divColor(R.resid[i][j], maxAbs)}`;
  $("residOut").innerHTML = tableHTML(ct, (i, j) => (R.resid[i][j] >= 0 ? "+" : "−") + fmt(Math.abs(R.resid[i][j]), 2), null, null, null, () => "hm");
  cellStyle = () => "";
  const crit = R.df > 0 ? chiSquareQuantile(alpha, R.df) : NaN;
  const stats = [
    ["χ² statistic", fmt(R.chi2, 3)], ["degrees of freedom ν", R.df], ["p-value", fmtP(R.pValue)],
    [`critical value χ²<sub>ν, ${1 - alpha}</sub>`, fmt(crit, 3)], ["Cramér’s V", fmt(R.cramerV, 3)], ["n", fmtInt(R.N)]
  ];
  $("statsOut").innerHTML = stats.map(([k, v]) => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");
  const ok = R.small5 <= 0.2 && R.minExp >= 1;
  $("assumpOut").innerHTML = `<p class="${ok ? "note" : "warn"}" style="margin:4px 0">${ok ? "✓" : "⚠"} Expected counts: minimum ñ<sub>ij</sub> = ${fmt(R.minExp, 2)}, ${pct(R.small5)} of cells below 5. ` +
    (ok ? "Cochran’s condition holds, so the χ² approximation is reliable." : "Cochran’s condition is violated, so the asymptotic p-value may be inaccurate. Rely on the permutation p-value in §6, or merge sparse categories.") + "</p>";
  const dep = R.pValue < alpha;
  $("verdictOut").innerHTML = `<div class="verdict ${dep ? "dep" : "ind"}"><div class="ic">${dep ? "✕" : "✓"}</div><div>` +
    (dep ? `<b>Reject H<sub>0</sub> at α = ${alpha}.</b> χ² = ${fmt(R.chi2, 2)} &gt; ${fmt(crit, 2)} (p = ${fmtP(R.pValue)}): ${esc(state.x)} and ${esc(state.f)} are statistically <b>dependent</b>.`
         : `<b>Do not reject H<sub>0</sub> at α = ${alpha}.</b> χ² = ${fmt(R.chi2, 2)} ≤ ${fmt(crit, 2)} (p = ${fmtP(R.pValue)}): the data are <b>compatible with independence</b> of ${esc(state.x)} and ${esc(state.f)}.`) +
    "</div></div>";
}

function strength(v) { return v < 0.1 ? "negligible" : v < 0.2 ? "weak" : v < 0.4 ? "moderate" : v < 0.6 ? "relatively strong" : "strong"; }

function renderInterp() {
  const R = state.res, ct = state.ct, alpha = +$("alphaSel").value;
  const cells = [];
  R.resid.forEach((row, i) => row.forEach((e, j) => cells.push({ i, j, e })));
  cells.sort((a, b) => Math.abs(b.e) - Math.abs(a.e));
  const top = cells.slice(0, 3).filter(c => Math.abs(c.e) > 2);
  const dep = R.pValue < alpha;
  // largest gap between conditional proportions of the F category with biggest spread
  let best = { j: 0, gap: 0 };
  ct.fLevels.forEach((_, j) => { const col = R.rowProf.map(r => r[j]).filter(Number.isFinite); const gap = Math.max(...col) - Math.min(...col); if (gap > best.gap) best = { j, gap }; });
  const colj = R.rowProf.map(r => r[best.j]);
  const iMax = colj.indexOf(Math.max(...colj)), iMin = colj.indexOf(Math.min(...colj));
  let h = `<h3 style="margin-top:0">Result for ${esc(state.x)} × ${esc(state.f)}</h3>`;
  h += `<p>With n = ${fmtInt(R.N)} and a ${ct.xLevels.length}×${ct.fLevels.length} table (ν = ${R.df}), χ² = ${fmt(R.chi2, 2)} and p = ${fmtP(R.pValue)}. `;
  h += dep ? `At α = ${alpha} we <b>reject independence</b>. The conditional distributions of ${esc(state.f)} differ across levels of ${esc(state.x)} by more than sampling variability would explain. `
           : `At α = ${alpha} we <b>do not reject independence</b>. The differences between the conditional distributions are of the size expected from sampling noise alone. This does not prove independence; it means the data give no evidence against it. `;
  h += `Cramér’s V = ${fmt(R.cramerV, 3)} indicates a <b>${strength(R.cramerV)}</b> association.</p>`;
  h += `<p>The largest spread is in the share of “${esc(ct.fLevels[best.j])}”: it ranges from ${pct(colj[iMin])} for ${esc(state.x)} = ${esc(ct.xLevels[iMin])} to ${pct(colj[iMax])} for ${esc(state.x)} = ${esc(ct.xLevels[iMax])} (marginal: ${pct(R.colMarg[best.j])}).</p>`;
  if (top.length) h += `<p>Cells with |e<sub>ij</sub>| &gt; 2: ` + top.map(c => `(${esc(ct.xLevels[c.i])}, ${esc(ct.fLevels[c.j])}) e = ${(c.e > 0 ? "+" : "") + fmt(c.e, 2)}, ${c.e > 0 ? "over" : "under"}-represented`).join("; ") + `.</p>`;
  if (R.N > 5000 && dep && R.cramerV < 0.1) h += `<p class="warn">Large n with a small V: the result is statistically significant but the association is weak in practical terms.</p>`;
  h += `<p class="note">Whatever the outcome, this is a statement about association in the data, not about cause and effect (see §7.2).</p>`;
  $("interpOut").innerHTML = h;
}

function renderStrata() {
  if (state.dataset !== "titanic") return;
  const out = [];
  for (const sex of ["Male", "Female"]) {
    const sub = state.recs.filter(r => r.Sex === sex);
    const ct = buildContingency(sub, "Class", "Survived", { x: TITANIC_LEVELS.Class, f: TITANIC_LEVELS.Survived });
    const R = chiSquareTest(ct.n);
    let h = `<div class="card"><h3 style="margin-top:0;font-size:15px">${sex === "Male" ? "Men" : "Women"} (n = ${fmtInt(R.N)})</h3>`;
    h += '<table class="ct"><thead><tr><th class="corner">Class</th><th>n</th><th>survived</th><th>% survived</th></tr></thead><tbody>';
    ct.xLevels.forEach((l, i) => { h += `<tr><th>${l}</th><td>${fmtInt(R.rowTot[i])}</td><td>${fmtInt(ct.n[i][1])}</td><td>${pct(R.rowProf[i][1])}</td></tr>`; });
    h += `<tr class="total"><th>All</th><td class="marg">${fmtInt(R.N)}</td><td class="marg">${fmtInt(R.colTot[1])}</td><td class="marg">${pct(R.colMarg[1])}</td></tr></tbody></table>`;
    h += `<p class="caption">χ² = ${fmt(R.chi2, 1)}, ν = ${R.df}, p = ${fmtP(R.pValue)}, V = ${fmt(R.cramerV, 2)}</p></div>`;
    out.push(h);
  }
  const all = buildContingency(state.recs, "Class", "Sex", { x: TITANIC_LEVELS.Class, f: TITANIC_LEVELS.Sex });
  const RA = chiSquareTest(all.n);
  const sexAll = chiSquareTest(buildContingency(state.recs, "Sex", "Survived", { x: TITANIC_LEVELS.Sex, f: TITANIC_LEVELS.Survived }).n);
  out.push(`<p class="note" style="grid-column:1/-1;margin:0">Share of women by class: ${all.xLevels.map((l, i) => `${l} ${pct(RA.rowProf[i][1])}`).join(", ")}. ` +
    `Sex × Survived: χ² = ${fmt(sexAll.chi2, 1)}, V = ${fmt(sexAll.cramerV, 2)}, survival rates ${pct(sexAll.rowProf[0][1])} (men) vs ${pct(sexAll.rowProf[1][1])} (women).</p>`);
  $("strataOut").innerHTML = out.join("");
}

function runPermutation() {
  const R = state.res, ct = state.ct, B = +$("permB").value;
  if (!R || R.df < 1) return;
  const xi = new Map(ct.xLevels.map((v, i) => [v, i])), fj = new Map(ct.fLevels.map((v, j) => [v, j]));
  const xs = [], fs = [];
  for (const r of state.recs) { const i = xi.get(r[state.x]), j = fj.get(r[state.f]); if (i !== undefined && j !== undefined) { xs.push(i); fs.push(j); } }
  const t0 = performance.now();
  const { stats, pPerm } = permutationTest(xs, fs, ct.xLevels.length, ct.fLevels.length, R.expected, R.chi2, B, mulberry32(2024));
  const ms = performance.now() - t0;
  const pTxt = pPerm <= 1 / (B + 1) + 1e-12 ? `&lt; ${fmt(1 / (B + 1) * 1.0001, 5).replace(/0+$/, "")} (no permuted χ² reached the observed value)` : fmt(pPerm, 4);
  $("permRes").innerHTML = `permutation p-value = ${pTxt} · asymptotic p = ${fmtP(R.pValue)} · ${B} permutations in ${ms.toFixed(0)} ms`;
  drawPerm(stats, R.chi2, R.df);
}

function drawPerm(stats, obs, df) {
  const svg = $("permChart"), W = svg.clientWidth || 860, H = 260, L = 48, Rm = 20, T = 12, Bm = 36;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.setAttribute("height", H);
  const sorted = Float64Array.from(stats).sort();
  const q999 = sorted[Math.floor(0.999 * (sorted.length - 1))];
  const xmax = Math.max(q999, chiSquareQuantile(0.001, df)) * 1.08;
  const obsInside = obs <= xmax * 1.6;
  const xMaxPlot = obsInside ? Math.max(xmax, obs * 1.08) : xmax;
  const nb = 40, bw = xMaxPlot / nb, bins = new Array(nb).fill(0);
  for (const s of stats) { const b = Math.min(nb - 1, Math.floor(s / bw)); bins[b]++; }
  const dens = bins.map(c => c / (stats.length * bw));
  const curve = Array.from({ length: 200 }, (_, k) => { const x = (k + 0.5) * xMaxPlot / 200; return [x, chiSquarePdf(x, df)]; });
  const ymax = Math.max(...dens, ...curve.map(p => Number.isFinite(p[1]) ? p[1] : 0).slice(2)) * 1.1;
  const sx = x => L + x / xMaxPlot * (W - L - Rm), sy = y => H - Bm - Math.min(y, ymax) / ymax * (H - Bm - T);
  const c1 = css("--s1"), c2 = css("--s2");
  let g = "";
  for (let t = 0; t <= 4; t++) { const y = ymax * t / 4; g += `<line class="gridl" x1="${L}" x2="${W - Rm}" y1="${sy(y)}" y2="${sy(y)}"/><text x="${L - 6}" y="${sy(y) + 4}" text-anchor="end">${y.toFixed(y < 0.1 ? 3 : 2)}</text>`; }
  const step = niceStep(xMaxPlot / 6);
  for (let x = 0; x <= xMaxPlot; x += step) g += `<text x="${sx(x)}" y="${H - Bm + 16}" text-anchor="middle">${+x.toFixed(2)}</text>`;
  g += `<text x="${(L + W - Rm) / 2}" y="${H - 4}" text-anchor="middle">χ² under H₀</text>`;
  bins.forEach((c, b) => {
    const x0 = sx(b * bw) + 1, w = Math.max(0, sx((b + 1) * bw) - sx(b * bw) - 2);
    if (c) g += `<rect class="hit" data-tip="χ² in [${(b * bw).toFixed(2)}, ${((b + 1) * bw).toFixed(2)}): ${c} of ${stats.length} permutations" x="${x0}" y="${sy(dens[b])}" width="${w}" height="${sy(0) - sy(dens[b])}" rx="2" fill="${c1}" opacity="0.85"/>`;
  });
  g += `<polyline fill="none" stroke="${c2}" stroke-width="2" points="${curve.filter(p => Number.isFinite(p[1])).map(p => `${sx(p[0])},${sy(p[1])}`).join(" ")}"/>`;
  g += `<line class="axis" x1="${L}" x2="${W - Rm}" y1="${sy(0)}" y2="${sy(0)}"/>`;
  if (obsInside) {
    g += `<line x1="${sx(obs)}" x2="${sx(obs)}" y1="${T}" y2="${sy(0)}" stroke="var(--ink)" stroke-width="2" stroke-dasharray="4 3"/>`;
    g += `<text x="${sx(obs) + (sx(obs) > W * 0.75 ? -6 : 6)}" y="${T + 12}" text-anchor="${sx(obs) > W * 0.75 ? "end" : "start"}" style="fill:var(--ink);font-weight:600">observed χ² = ${obs.toFixed(2)}</text>`;
  } else {
    g += `<text x="${W - Rm}" y="${T + 12}" text-anchor="end" style="fill:var(--ink);font-weight:600">observed χ² = ${obs.toFixed(1)} → far off the axis (max permuted = ${sorted[sorted.length - 1].toFixed(1)})</text>`;
  }
  svg.innerHTML = g;
  $("permLegend").innerHTML = `<span><span class="sw" style="background:${c1}"></span>permuted χ² (density histogram)</span><span><span class="sw" style="background:${c2};height:3px;vertical-align:3px"></span>theoretical χ²<sub>${df}</sub> density</span><span><span class="sw" style="background:transparent;border-top:2px dashed var(--ink);height:0;border-radius:0;vertical-align:3px"></span>observed value</span>`;
}
function niceStep(raw) { const p = 10 ** Math.floor(Math.log10(raw)); const m = raw / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }

/* ---------- code panel: print the real functions ---------- */
const CODE_FNS = { buildContingency, frequencies, chiSquareTest, gammaQ, chiSquareSurvival, chiSquareQuantile, permutationTest, lnGamma };
function renderCode() {
  const names = Object.keys(CODE_FNS);
  $("codeTabs").innerHTML = names.map((n, k) => `<button role="tab" data-fn="${n}" aria-selected="${k === 0}">${n}</button>`).join("");
  const show = n => { $("codeOut").textContent = CODE_FNS[n].toString(); document.querySelectorAll("#codeTabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.fn === n)); };
  $("codeTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.fn); });
  show(names[0]);
}

/* ---------- tooltip ---------- */
const tip = $("tip");
document.addEventListener("mousemove", e => {
  const t = e.target.closest?.("[data-tip]");
  if (!t) { tip.style.opacity = 0; return; }
  tip.innerHTML = t.getAttribute("data-tip"); tip.style.opacity = 1;
  const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
  tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
});

/* ---------- wiring ---------- */
$("dsSel").addEventListener("change", () => { loadDataset(); run(); });
$("xSel").addEventListener("change", run);
$("fSel").addEventListener("change", run);
$("alphaSel").addEventListener("change", run);
$("runBtn").addEventListener("click", () => { if (state.dataset.startsWith("sim")) loadDataset(); run(); });
$("csvLoad").addEventListener("click", () => { loadCSV(); run(); });
$("csvFile").addEventListener("change", e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => { $("csvText").value = t; loadCSV(); run(); }); });
$("permBtn").addEventListener("click", runPermutation);
$("ctTabs").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.view = b.dataset.v;
  document.querySelectorAll("#ctTabs button").forEach(x => x.setAttribute("aria-selected", x === b)); renderCT(); });
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", run);
let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (state.res) { renderProfiles(); runPermutation(); } }, 200); });

loadDataset(); run(); renderCode();
