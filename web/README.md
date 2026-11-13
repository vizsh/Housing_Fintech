# Naksha console (`web/`)

React 19 + Vite + TypeScript. three.js via react-three-fiber, deck.gl + MapLibre, and framer-motion.

**Prerequisite:** the engine running on port 8000. Override its address with `VITE_API`.

To run, install the dependencies and start the dev server on http://localhost:5173:

```bash
npm install
```

```bash
npm run dev
```

To type-check and build for production:

```bash
npm run build
```

## Code map

| Folder or file | What it holds |
|---|---|
| `src/sheets/` | One file per tab: Valuation, Commercial income, Market surface, Model evidence |
| `src/components/` | Drawings and panels |
| `src/arch.ts` | Pure architecture maths: solar position, facade sun hours, unit layout, RERA area statement, construction-linked payment stages |
| `src/index.css` | *Sanction Blueprint* tokens. The design rules are in [../DESIGN.md](../DESIGN.md). |

Architecture overview: [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).
