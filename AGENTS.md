# INO ERP: agent rules (always on)

No frontmatter by design. Keep this file short. Detailed rules live in `.agents/rules/` and load on demand.

## What this is

A multi-business, multi-branch retail operations ERP (scope: `docs/DECISIONS_MULTI_CABANG.md`, which overrides DEC-01) (sales, purchasing, stock, receivables/payables, cash and bank accounts) plus a POS ("re-feel"). Frontend: React 19, Vite, Tailwind 4, Recharts 3, built into one HTML file and hosted in Google Apps Script. Backend: `Code_ERP.gs` with Google Sheets as the database. It is a portfolio project meant for international use.

## Source of truth

`PRD_INO_ERP_Antigravity.md` defines scope, order, and acceptance criteria.

Multi-branch scope is defined by `docs/DECISIONS_MULTI_CABANG.md` and `docs/PRD_ADDENDUM_M1.md`; they override the PRD where they conflict. Visual design is owned by the design agent; see `docs/DESIGN_BRIEF.md`.

- Work only on items the PRD lists, in phase order, and one phase per session.
- If a request is not in the PRD, say so and ask before building it.
- If the PRD and the code disagree, report it. Do not silently pick one.
- Respect the Decision Log. An empty answer means use the stated default and mark it `// DECISION-xx: default used`.

## Hard rules

1. **Never touch the production Sheet or deployment.** Work on a test copy only. Never run `resetSemuaData`, `runDummyCleanupMigration`, or `saveAll*` against real data.
2. **The server is the source of truth.** The client sends intent. The server computes prices, totals, stock, balances, identity, IDs, and timestamps.
3. **Every public Apps Script function starts with an auth and role check.** A function name without a trailing underscore is callable from any browser console.
4. **No silent data loss.** No dropping unknown fields, no whole-table overwrite on hot paths, no unawaited saves, no optimistic UI without rollback.
5. **No new dependency** unless the PRD allows it (`vitest`, and what the owner-approved dashboard template needs). List and justify each one in the commit message.
6. **Do not rewrite `src/App.tsx`** (about 9,400 lines) and do not add `useState` to it. New logic goes in new modules; touch `App.tsx` only to wire things up.
7. **No secrets, peppers, password hashes, or deployment URLs** in the repo, logs, or browser storage.
8. **Stop and ask** when money or tax semantics are unclear, when a schema change affects existing data, before deleting files, before touching production, or when the PRD conflicts with itself.

## Before you say "done"

Run `npm run lint`, `npm run build`, and `npm test`, and exercise the changed behavior on the test copy. Then run the `pre-handoff-review` skill. State what you could not verify.

## Rules that load on demand

`security-trust-boundary`, `google-apps-script`, `react-typescript`, `money-stock-integrity`, `ui-dashboard-i18n`, `testing-and-done`, `git-and-reporting`. Skills: `execute-prd-phase`, `pre-handoff-review`.

## Language

Code, comments, commits, and docs: English. When replying to the owner in chat, use the language the owner writes in.
