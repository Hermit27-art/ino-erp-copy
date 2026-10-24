# INO Finance/Ledger: agent rules (always on)

No frontmatter by design. Keep this file short. Detailed rules live in `.agents/rules/` and load on demand.

## What this is

**INO Finance/Ledger** — Single-cabang finance & ledger app fed by JeKing POS CSV exports via a Go middleware, with manual entry as first-class citizen.
- **Pipeline:** JeKing CSV → Go exe (stdlib, Win7/386) → Supabase RPC (idempotent upsert) → React app on Vercel
- **Backend:** Supabase (PostgreSQL) — RLS, triggers, audit_log, General Ledger append-only
- **Frontend:** React 19 + Vite + Tailwind 4 + Recharts 3, deployed on Vercel
- **Auth:** Supabase Auth (email/password + magic link), RLS enforced
- **Core principle:** Go output not guaranteed correct → **audit trail is truth**, not read-only replica. Manual entry = sumber `'manual'`. No hard deletes (void/aktif flag). GL append-only (edits = reversal + new entry).

## Source of truth

`PRD_INO_ERP_Antigravity.md` defines scope, order, and acceptance criteria.

- Work only on items the PRD lists, in phase order, and one phase per session.
- If a request is not in the PRD, say so and ask before building it.
- If the PRD and the code disagree, report it. Do not silently pick one.
- Respect the Decision Log (DEC-01 to DEC-10). Empty answer = use default, mark `// DECISION-xx: default used`.

## Hard rules

1. **Never touch production Supabase project.** Work on a local/dev Supabase instance only. Never run destructive migrations against prod.
2. **The server (Supabase) is the source of truth.** Client sends intent via RPC. Supabase computes GL, stock, balances, IDs, timestamps, audit.
3. **Every mutating RPC requires `SET LOCAL app.audit_reason = '...'`** before the operation. No UPDATE/DELETE on `audit_log` for any role.
4. **No silent data loss.** No dropping unknown fields (RPC validates), no whole-table overwrite (replace all `saveAll*` with per-row upsert), no unawaited saves, no optimistic UI without rollback.
5. **No new dependency** unless PRD allows it (`@supabase/supabase-js`, `vitest`, Go stdlib only). List and justify each in commit message.
6. **Do not rewrite `src/App.tsx`** (~9,400 lines) and do not add `useState` to it. New logic goes in new modules; touch `App.tsx` only to wire things up.
7. **No secrets, service_role keys, or Supabase URLs** in repo, logs, or browser storage. Use `.env.local` (gitignored) for anon key.
8. **Stop and ask** when money/tax/stock semantics are unclear, when a schema change affects existing data, before deleting files, before touching production, or when PRD conflicts with itself.
9. **Go exe: stdlib only, Go 1.20.x, GOARCH=386, GOOS=windows.** No cgo, no external deps. Binary < 10MB.
10. **Idempotency is mandatory.** Every ingest uses `external_ref` + `hash_asli`. Re-running same CSV = no duplicate rows.

## Before you say "done"

Run `npm run lint`, `npm run build`, and `npm test`, and exercise the changed behavior on the dev Supabase instance. Then run the `pre-handoff-review` skill. State what you could not verify.

## Rules that load on demand

`security-trust-boundary`, `supabase-rls`, `audit-trail`, `money-stock-integrity`, `ui-dashboard-i18n`, `testing-and-done`, `git-and-reporting`, `go-stdlib`. Skills: `execute-migration-phase`, `pre-handoff-review`.

## Language

Code, comments, commits, and docs: English. When replying to the owner in chat, use the language the owner writes in.