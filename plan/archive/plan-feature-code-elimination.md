## **1  Overview  (Updated)**

The **whisper‑transcribe** project is a small, early‑stage, pure‑JavaScript web application (\~13 ES‑module files, no framework or bundler yet) delivered directly to modern browsers. Because the footprint is still modest, we have a window to put strong hygiene in place before scale creates inertia. The primary goal of this initiative is to delete latent or duplicate code **and** put automated guards (linting, static analysis, minimal CI) around the leaner core so future additions remain lightweight and understandable.

---

## **2  Objectives  (Updated & Prioritised)**

| #       | Objective                                             | Key Deliverables                                                                                                                                                                                            |
| ------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **2.1** | **Surface and remove unused code paths**              | *ESLint* with `eslint-plugin-import/no-unused-modules` and `eslint-plugin-unused-imports` rules turned on to flag unused exports and imports automatically ([github.com][1], [npmjs.com][2])                |
| **2.2** | **Eliminate orphaned or duplicate dependencies**      | Run **depcheck** (with an ignore‑list for ESM export maps) each sprint to detect packages that no file actually requires ([github.com][3], [github.com][4])                                                 |
| **2.3** | **Introduce a lightweight, future‑proof test runner** | Pilot **Vitest** (Jest‑compatible API, faster watch mode) and compare with Jest on one module; decide and standardise before wider refactor ([speakeasy.com][5], [betterstack.com][6])                      |
| **2.4** | **Set a safety net for continuing work**              | • Baseline coverage with `vitest --coverage` (or Jest) and enforce an 80 % line/branch minimum.<br>• Add Git pre‑push hook running `npm run lint && npm test` (CI will come later when the pipeline grows). |
| **2.5** | **Measure bundle health early**                       | Even without a bundler, capture a baseline of delivered JS + CSS (gzip size) via `npx bundlesize` so future PRs can quantify wins or regressions.                                                           |

---

## **3  Scope  (Sharpened)**

**Included**

1. **JavaScript sources (`/js/`)** – 13 ESM files, ranging from 24 to 637 LOC.
2. **Front‑end assets**

   * `css/styles.css` (≈ 700 LOC – global styles)
   * `index.html` (static markup)
3. **Build & tooling artefacts**

   * `package.json`, `package-lock.json` – remove unused deps, add tooling deps only (ESLint, Vitest/Jest, depcheck).
   * Optional: a minimal Vite config if bundling becomes desirable later, but **initial elimination work will operate on raw source**.
4. **Tests** – migrate or create unit tests for any code touched by deletions; existing Jest tests will be run by whichever runner is chosen.
5. **CI hooks** – *pre‑push* Git hook (Husky) for lint & tests; remote CI integration deferred until the project grows.

**Out‑of‑scope (for now)**

* TypeScript migration (not currently needed; revisit when API surface expands).
* CSS modularisation / PostCSS; focus is on code pruning rather than styling overhaul.
* Full GitHub Actions test matrix; local hooks suffice until test suite size justifies remote runners.

---

## Strategy

### 1  Inventory & Metrics

* **Static‑analysis sweep**

  1. Add ESLint with two purpose‑built plugins:

     ```jsonc
     // .eslintrc.cjs
     {
       "plugins": ["unused-imports", "import"],
       "extends": ["eslint:recommended"],
       "rules": {
         "unused-imports/no-unused-imports": "error",
         "import/no-unused-modules": ["error", { "unusedExports": true }]
       }
     }
     ```

     `unused-imports` cleans up unused *imports* automatically, while `import/no-unused-modules` flags exported functions never consumed anywhere else ([npmjs.com][1], [github.com][2]).

  2. Run `vitest --coverage` (or `jest --coverage`) once to get an initial branch/line coverage baseline; we’ll set the gate after we see real numbers.

* **Dependency audit**

  ```bash
  npx depcheck --json > depcheck-report.json
  ```

  `depcheck` occasionally mis‑labels packages that expose only ESM export maps; keep a short **ignore list** (`package.json#depcheck.ignore`) rather than false‑removing needed deps ([sciencedirect.com][3]).

* **Bundle health snapshot**

  ```bash
  npx bundlesize --analyze
  ```

  Stores current gzipped JS + CSS size; future PRs must not regress without a clear rationale ([npmjs.com][4]).

---

### 2  Prioritisation

1. **Quick wins first** – purge commented‑out code, `console.log` debugging, unused constants flagged by step 1.
2. **Dependency removals next** – unused npm packages often unlock further dead paths.
3. **Module‑by‑module focus** – choose one file at a time (smallest → largest) so review diffs stay readable.
4. **Brittle areas on hold** – defer anything tied to upcoming feature work until after the freeze to avoid thrash.

*Tip:* After each cleaned module, run a production build with the `sideEffects` flag enabled; Webpack/Vite tree‑shaking reveals exports still leaking into the bundle, highlighting hidden dependencies ([webpack.js.org][5]).

---

### 3  Extraction & Consolidation

* **Automated codemods** – write small jscodeshift scripts for patterns like repetitive `document.querySelector` chains; this prevents “find‑and‑replace fatigue” and leaves an audit trail.
* **Shared utilities** – collect new helpers in `/js/core/` with the **Rule of Three**: only extract when used ≥ 3 times.
* **Native first** – swap custom wrappers for standards (e.g., `fetch` over `XMLHttpRequest`, `Intl.DateTimeFormat` over date libs).
* **Constants tidy‑up** – split the 316‑line `constants.js` into domain‑focused sub‑modules to cut import‑surface per bundle.

---

### 4  Safe Deletion

1. **Red‑green‑refactor** – write or extend unit tests *before* you rip code out so you’re deleting with confidence.
2. **Mutation testing pilot** – run Stryker on one core file to see if existing tests fail when logic mutates; expand project‑wide once value is proven ([stryker-mutator.io][6]).
3. **Feature branches + PR reviews** – limit PRs to < 300 LOC and require one peer review.
4. **Commit hygiene** – use `git commit --fixup` plus `git rebase --autosquash` so history narrates *why* deletions happened.

---

### 5  Continuous Validation

#### 5.1  Local hooks (immediate)

```bash
npx husky-init && npm install
npx husky add .husky/pre-push "npm run lint && npm test"
```

Running lint + tests on `git push` keeps CI simple for now ([medium.com][7]).

#### 5.2  Coverage gate

```jsonc
// package.json
"vitest": {
  "coverage": {
    "statements": 80,
    "branches": 80,
    "functions": 80,
    "lines": 80
  }
}
```


---

## Phases

### **Phase 1  Setup & Reporting**

1. **Tool bootstrap**

   ```bash
   npm i -D eslint eslint-plugin-unused-imports eslint-plugin-import \
           depcheck vitest c8
   ```
2. **ESLint configuration**

   * `.eslintrc.cjs` adds:

     ```js
     plugins: ['unused-imports','import'],
     rules: {
       'unused-imports/no-unused-imports': 'error',
       'import/no-unused-modules': ['error', { unusedExports: true }],
     }
     ```

     *`unused-imports` auto‑deletes dead `import` lines on `eslint --fix`; `import/no-unused-modules` flags exported symbols nobody imports.* ([stackoverflow.com][1], [simondosda.github.io][2])
3. **Baseline metrics**

   ```bash
   # Coverage snapshot
   npx vitest run --coverage                     # HTML & text report  :contentReference[oaicite:1]{index=1}
   # Dependency audit
   npx depcheck --json > depcheck-report.json    # Ignore ESM‑map noise  :contentReference[oaicite:2]{index=2}
   # Bundle size (gzip)
   npx bundlesize --analyze                      # Saves size‑baseline.json  :contentReference[oaicite:3]{index=3}
   ```
4. **Share findings** – Commit the three reports to a “metrics/” folder; reviewers now have an exact before‑state.

---

### **Phase 2  Dead‑Code Removal**

1. **Automated sweep**

   * Run `eslint --fix` to strip unused imports automatically.
   * Delete flagged exports, unreachable branches, and commented‑out blocks.
2. **Manual spot‑check** – Grep for `console.log` / `TODO` and purge or ticket accordingly.
3. **Red/green tests** – Re‑run `npm test`; ensure coverage percentage ≥ baseline.
4. **Bundle diff** – `bundlesize` should report a net reduction; call it out in the PR summary.

---

### **Phase 3  Duplicate‑Logic Consolidation**

1. **Pattern search** – Use VS Code “Find in Workspace” for common snippets (`document.querySelector`, repeated regexes, etc.).
2. **Codemods** – Where patterns are widespread, author a *jscodeshift* script so the transform is repeatable and reviewable.
3. **Helper modules** – Extract shared utilities into `/js/core/` only after the **Rule of Three** (≥ 3 uses).
4. **Native replacements** – Swap custom shims for browser APIs (`Intl`, `URLSearchParams`, `AbortController`) where possible.

---

### **Phase 4  Abstraction Simplification**

1. **Flatten call stacks** – Inline functions used once; collapse nested `if/else` where a guard clause suffices.
2. **Constants refactor** – Split the 316‑line `constants.js` into domain‑focused slices (e.g., `audio.js`, `ui.js`) so each consumer imports only what it needs.
3. **Delete wrapper layers** – Remove one‑line proxy files (re‑exporters) and update imports.

---

### **Phase 5  Dependency Cleanup**

1. **Second `depcheck` pass** – With dead code gone, rerun: `npx depcheck`.
2. **Prune packages**

   ```bash
   npm rm <unused-packages>
   npm prune
   ```
3. **Bundlephobia spot‑check** – For any new packages you *add*, confirm gzip size & install cost via bundlephobia.com ([bundlephobia.com][3]).

---

## Verification & Testing  (continuous)

| Guard                   | Implementation                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| **Unit tests**          | Vitest (Jest‑compatible API). All touched modules require tests or test updates.                       |
| **Coverage gate**       | `vitest --coverage` must stay ≥ 80 % for lines, branches, funcs (configurable once baseline is known). |
| **Mutation smoke‑test** | Pilot **StrykerJS** on one module; expand if it reveals untested logic ([stryker-mutator.io][4]).      |
| **Local pre‑push hook** | Husky runs `npm run lint && npm test`; stops a push on failure ([stackoverflow.com][5]).               |
| **Peer review**         | PRs < 300 LOC, at least one reviewer signs off; changelog entry required for every phase.              |

---

## Risks & Mitigations  (refreshed)

| Risk                                                                  | Likely Phase | Mitigation                                                                                                   |
| --------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Dynamic imports or string‑based `require()`** mis‑flagged as unused | 2, 5         | Add files to ESLint/depcheck *ignore lists* until refactored to static imports.                              |
| **Coverage drop after deletions**                                     | 2‑4          | Coverage threshold in `vitest.config.js` blocks merge; Stryker highlights superficial tests.                 |
| **Merge conflicts**                                                   | All          | Keep PRs topical; rebase daily; use Git `--fixup` to maintain a linear history.                              |
| **False‑positive depcheck on ESM export maps**                        | 1, 5         | Maintain a short `.depcheckrc` ignore array; verify with manual `import()` before removal ([github.com][6]). |
