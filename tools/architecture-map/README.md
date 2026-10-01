# Architecture map

An interactive isometric map of Whisper Transcribe: every building is a real
subsystem sized by its real line count, every line is a call path that exists
in the code, and every flow is a payload the app actually ships.

This is a standalone tool. It has its own `package.json` (React, Vite and
TypeScript as dev dependencies here only) and is not part of the app bundle,
the root lint, the Knip gates, or the size budgets. The app keeps its single
production dependency.

## Run it

```bash
cd tools/architecture-map
npm ci
npm run dev        # http://127.0.0.1:4180/
npm run build      # static output in tools/architecture-map/dist/
```

## Keep it honest

The map has two halves.

- **Measured**: file counts, line totals, building heights, shapes and the
  packed layout. `npm run sync` (from this directory) rescans the repository
  using `architecture.config.json` at the repo root and rewrites
  `src/architecture/measured.generated.ts`. `npm run sync:check` fails when the
  map is behind the code. A file no node claims shows up as "unmapped" in the
  page header.
- **Authored**: `src/architecture/graph.ts`. Groups, what each subsystem does
  and how it is built, the edges, and the flows. Edit this when the code's
  story changes. Do not draw an edge you cannot point at in the code.

When a new source file appears, add it to `src/architecture/coverage.json`
under the node that owns it, or add a node, then run the sync.

## Theme

`vite.config.ts` lifts only the design-token blocks (`:root`, `.dark-theme`,
and the `[data-palette]` variants) out of `css/styles.css` at build time, so
the map follows the app's light, dark and palette themes with no duplicated
values. The controls in the bottom-right corner set the same class and
attribute on `<html>` that the app sets.

`src/architecture/components/theme.ts` is the only file that knows the app's
token names.
