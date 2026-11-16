# Homework – Contingency tables, independence and the χ² test

Live page: open `index.html` (published with GitHub Pages).

- Builds the contingency table by counting raw records (Titanic, n = 2201, or simulated data, or any CSV)
- Marginal, joint relative and conditional (row / column) frequencies
- Expected frequencies under independence, Pearson χ², degrees of freedom, p-value (regularised incomplete gamma, no libraries), Cramér's V, Pearson residuals
- Permutation test as a check on the asymptotic p-value
- Theory of independence and a discussion of association vs causality (confounding by sex, Simpson's paradox)

Results cross-checked with `scipy.stats.chi2_contingency`: Class × Survived gives χ² = 190.401, ν = 3, p = 5.00e-41.

## Structure

```
index.html      page content (theory, tables, charts, discussion)
css/style.css   styles (light and dark mode)
js/stats.js     core statistics – pure functions, no DOM
js/data.js      datasets: Titanic, simulated data, CSV parser, binning
js/app.js       UI and rendering
```
Scripts are plain (non-module) JS loaded in order, so the page also works when opened locally from disk.
