# Claude Code rules for INO ERP

@AGENTS.md

Owner-facing docs in `docs/` are in Indonesian. Read them in this order before any work:
1. `docs/DECISIONS_MULTI_CABANG.md`: decisions. `OPEN-*` means ask the owner, never guess.
2. `docs/PRD_ADDENDUM_M1.md`: the only phase you may work on now.
3. `docs/02-data-org-auth.md`: schema and role matrix.
4. `docs/03-audit-indikator.md`: read only to know which data must be captured. Do not build indicators yet.

## Precedence
Where `AGENTS.md` or the PRD say single-company / not multi-tenant (DEC-01) or use the roles Admin/Kasir, the multi-branch decisions win (DEC-18, 22, 35, 37). Report any other conflict; do not pick silently.

## Your lane
You own `Code_ERP.gs`, `setup_sheets.gs`, `src/dataService.ts`, domain logic, tests, and wiring UI to data.
Codex owns visual design: `src/ui/`, `src/ui/tokens.css`, `docs/DESIGN_SYSTEM.md`. Do not edit those. If a screen needs data a component does not accept, write it in `docs/ui-contract.md` and tell the owner.

## Always
- Work on a test copy of the Sheet only.
- Derive `id_usaha`, `id_cabang`, user, timestamps, IDs, and prices on the server from the session.
- One door for data: every business tab is read and written through `rows_`. Every public function calls `can_(session, action, owner)` first.
- Posted documents are immutable. Corrections are reversal documents with a reason (DEC-40). No edit or delete endpoint for posted documents or stock.
- Stock is the append-only `MutasiStok` ledger, never a field you update (DEC-29).
- Every document carries `sumber` and `external_ref` (DEC-45).
- Log sensitive actions to `AuditLog`: who, when, before/after, reason.

## Never
- Supabase, Postgres, or any server outside Google Apps Script and Sheets (DEC-19).
- Trust `id_usaha`, `id_cabang`, or role sent by the browser.
- Build outside the current phase. Purchasing, finance, HR, audit indicators, and Jeking integration are later phases (DEC-45). Jeking is on hold (OPEN-09).
- Change legacy tabs or migrate legacy data without the owner's approval (OPEN-13).
- Add dependencies, rewrite `src/App.tsx`, or touch production.

## Done
Run `npm run lint`, `npm run build`, `npm test`, then the `pre-handoff-review` skill. State what you could not verify.
