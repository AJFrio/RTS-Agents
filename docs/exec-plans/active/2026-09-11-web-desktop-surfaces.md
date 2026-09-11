# Web vs desktop surfaces + Cloudflare build

## Goal

Make Cloudflare Worker deploys produce `dist/renderer` via Wrangler
`build.command`, and hide desktop-only UI on the website.

## Acceptance criteria

- [x] `wrangler.jsonc` runs `npm run build` before asset upload
- [x] Runtime capability flags in `src/renderer/platform/runtime.mjs`
- [x] Settings / Plugins / New Task / Create Repo / Devices gated
- [x] Spec + unit tests

## Progress log

| Date | Note |
|------|------|
| 2026-09-11 | Implemented runtime gating and Wrangler custom build |
