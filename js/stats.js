/* stats.js – core statistics: contingency table, frequencies, chi-square, p-value, permutation test. Pure functions, no DOM.
 * Homework – Contingency tables, independence and the chi-square test
 */
"use strict";

/* =====================================================================
   1. CORE STATISTICS (pure functions — no DOM)
   ===================================================================== */

/** Build an r×c contingency table by counting raw records.
 *  records: array of objects; xKey/fKey: variable names;
 *  levels (optional): {x:[...], f:[...]} to impose an order. */
function buildContingency(records, xKey, fKey, levels) {
  const xLv = levels?.x ?? uniqueSorted(records.map(r => r[xKey]));
  const fLv = levels?.f ?? uniqueSorted(records.map(r => r[fKey]));
  const xi = new Map(xLv.map((v, i) => [v, i]));
  const fj = new Map(fLv.map((v, j) => [v, j]));
  const n = xLv.map(() => fLv.map(() => 0));
  let dropped = 0;
  for (const rec of records) {
    const i = xi.get(rec[xKey]), j = fj.get(rec[fKey]);
    if (i === undefined || j === undefined) { dropped++; continue; } // missing values
    n[i][j] += 1;
  }
  return { xLevels: xLv, fLevels: fLv, n, dropped };
}

/** Marginal, relative and conditional frequencies. */
function frequencies(n) {
  const r = n.length, c = n[0].length;
  const rowTot = n.map(row => row.reduce((a, b) => a + b, 0));          // n_i.
  const colTot = Array.from({ length: c }, (_, j) => n.reduce((a, row) => a + row[j], 0)); // n_.j
  const N = rowTot.reduce((a, b) => a + b, 0);
  const rel = n.map(row => row.map(v => v / N));                        // n_ij / n
  const rowProf = n.map((row, i) => row.map(v => rowTot[i] ? v / rowTot[i] : NaN)); // f(F=j | X=i)
  const colProf = n.map(row => row.map((v, j) => colTot[j] ? v / colTot[j] : NaN)); // f(X=i | F=j)
  return { N, r, c, rowTot, colTot,
           rowMarg: rowTot.map(v => v / N), colMarg: colTot.map(v => v / N),
           rel, rowProf, colProf };
}

/** Expected counts under independence, chi-square, residuals, Cramér's V, p-value. */
function chiSquareTest(n) {
  const fr = frequencies(n);
  const { N, r, c, rowTot, colTot } = fr;
  const expected = rowTot.map(ri => colTot.map(cj => ri * cj / N));      // ñ_ij = n_i. n_.j / n
  let chi2 = 0;
  const contrib = n.map((row, i) => row.map((o, j) => {
    const e = expected[i][j];
    const v = e > 0 ? (o - e) ** 2 / e : 0;
    chi2 += v;
    return v;
  }));
  const resid = n.map((row, i) => row.map((o, j) =>
    expected[i][j] > 0 ? (o - expected[i][j]) / Math.sqrt(expected[i][j]) : 0));
  // degrees of freedom: count only non-empty rows/cols
  const rEff = rowTot.filter(v => v > 0).length, cEff = colTot.filter(v => v > 0).length;
  const df = (rEff - 1) * (cEff - 1);
  const pValue = df > 0 ? chiSquareSurvival(chi2, df) : NaN;
  const cramerV = Math.sqrt(chi2 / (N * (Math.min(rEff, cEff) - 1)));
  const flat = expected.flat();
  const small5 = flat.filter(e => e < 5).length / flat.length;
  const minExp = Math.min(...flat);
  return { ...fr, expected, contrib, resid, chi2, df, pValue, cramerV, small5, minExp };
}

/** ln Γ(z) — Lanczos approximation (g = 7, n = 9). */
function lnGamma(z) {
  const g = 7, p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) x += p[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Regularised upper incomplete gamma Q(a, x) = Γ(a, x)/Γ(a).
 *  Series for x < a+1, Lentz continued fraction otherwise (accurate for tiny tails). */
function gammaQ(a, x) {
  if (x <= 0) return 1;
  const lnPre = -x + a * Math.log(x) - lnGamma(a);
  if (x < a + 1) {                       // P(a,x) by series, Q = 1 - P
    let sum = 1 / a, term = sum;
    for (let k = 1; k < 1000; k++) {
      term *= x / (a + k); sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return 1 - sum * Math.exp(lnPre);
  }
  const tiny = 1e-300;                   // continued fraction (modified Lentz)
  let b = x + 1 - a, cc = 1 / tiny, d = 1 / b, h = d;
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    cc = b + an / cc; if (Math.abs(cc) < tiny) cc = tiny;
    d = 1 / d;
    const del = d * cc; h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(lnPre) * h;
}

/** P(χ²_df ≥ x): the p-value. */
function chiSquareSurvival(x, df) { return gammaQ(df / 2, x / 2); }

/** χ²_df density (used to overlay the theoretical curve). */
function chiSquarePdf(x, df) {
  if (x <= 0) return df === 2 ? 0.5 : (df < 2 ? Infinity : 0);
  const k = df / 2;
  return Math.exp((k - 1) * Math.log(x) - x / 2 - k * Math.log(2) - lnGamma(k));
}

/** Critical value χ²_{df,1-α} by bisection on the survival function. */
function chiSquareQuantile(alpha, df) {
  let lo = 0, hi = Math.max(10, df * 10);
  while (chiSquareSurvival(hi, df) > alpha) hi *= 2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (chiSquareSurvival(mid, df) > alpha) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Permutation test: shuffle F labels, keep both margins fixed. */
function permutationTest(xCodes, fCodes, r, c, expected, chi2Obs, B, rng) {
  const f = Int32Array.from(fCodes), m = f.length, stats = new Float64Array(B);
  const counts = new Float64Array(r * c);
  let geq = 0;
  for (let b = 0; b < B; b++) {
    for (let k = m - 1; k > 0; k--) {            // Fisher–Yates shuffle
      const s = Math.floor(rng() * (k + 1)); const t = f[k]; f[k] = f[s]; f[s] = t;
    }
    counts.fill(0);
    for (let k = 0; k < m; k++) counts[xCodes[k] * c + f[k]]++;
    let x2 = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) {
      const e = expected[i][j]; if (e > 0) x2 += (counts[i * c + j] - e) ** 2 / e;
    }
    stats[b] = x2;
    if (x2 >= chi2Obs - 1e-9) geq++;
  }
  return { stats, pPerm: (geq + 1) / (B + 1) };
}

/* ---------- helpers ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function uniqueSorted(arr) {
  const u = [...new Set(arr.filter(v => v !== undefined && v !== null && v !== ""))];
  return u.sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
}
function sampleCat(probs, u) { let acc = 0; for (let k = 0; k < probs.length; k++) { acc += probs[k]; if (u < acc) return k; } return probs.length - 1; }

