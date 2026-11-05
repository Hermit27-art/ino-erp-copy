# Phase 1 Report — Supabase Schema + Audit + RLS + Ingest RPC

**Tanggal:** 24 Okt 2026
**Branch:** `migration-supabase`
**Commit:** `d835c6a`

---

## ✅ Done (Work Items Completed)

| ID | Work Item | Status | Commit |
|---|---|---|---|
| W1.1 | Create Phase 1 migration SQL (`supabase/migrations/20261024000000_initial_schema.sql`) | **DONE** | `d835c6a` |

### Migration Contents

**Tables Created:**
- Master: `cabang`, `coa`, `produk`, `pelanggan`, `supplier`, `metode_bayar`
- Transaksional: `tx_header`, `tx_item`, `po_header`, `po_item`, `cash_ledger`
- General Ledger: `gl_entry` (append-only, `reversal_of` for edits)
- Audit: `audit_log` (universal), `ingest_conflict` (hash mismatch tracking)

**Triggers:**
- `audit_trigger_fn()` — generic AFTER INSERT/UPDATE/DELETE on ALL tables
  - Enforces `SET LOCAL app.audit_reason` for UPDATE/DELETE
  - Captures old/new JSONB, changed_by, reason
- `gl_post_tx()` — AFTER INSERT on `tx_header` → auto-posts GL entries
  - Kas/Bank, Piutang/Pendapatan+PPN, HPP+Persediaan
- `gl_post_cash()` — AFTER INSERT on `cash_ledger` → GL entry

**RPC Functions (SECURITY DEFINER):**
- `ingest_jeking(jsonb)` — JeKing ingest, **ingestor role only**
  - Idempotent: same `external_ref` + same `hash_asli` = NOOP (no audit row)
  - Conflict: same `external_ref` + different `hash_asli` → `ingest_conflict`, never overwrite
- `create_tx_manual(jsonb)` — Manual sales entry (authenticated)
- `void_tx(uuid, text)` — Void with reversal GL entries (authenticated, Admin+)
- `create_cash_manual(jsonb)` — Manual kas entry (authenticated)
- Settings CRUD: `create_coa`, `update_coa`, `void_coa`, `create_metode_bayar`, `update_metode_bayar`, `void_metode_bayar`, `create_produk`, `update_produk`, `void_produk`, `create_pelanggan`, `update_pelanggan`, `void_pelanggan`

**Views:**
- `v_gl_balance` — saldo per COA (excludes reversals)
- `v_trial_balance` — neraca saldo
- `v_pl` — P&L (Pendapatan vs Beban)
- `v_stock_on_hand` — stok real-time (PO received - TX shipped)

**Seed Data:**
- Default cabang `PUSAT`

**Grants (Documented — run manually in Supabase Dashboard):**
- Role `ingestor` with SELECT/INSERT on ingest tables, EXECUTE on `ingest_jeking`

---

## ❌ Not Verified (Blocked)

| Item | Blocker |
|---|---|
| `supabase start` (local Supabase) | **Docker not installed** — requires admin rights to install Docker Desktop |
| `supabase migration up` | Requires running Supabase stack |
| RPC function tests (`ingest_jeking`, `create_tx_manual`, etc.) | Requires running database |
| RLS policy verification | Requires running database + `ingestor` role creation |
| GL trigger verification (auto-posting) | Requires running database |
| Audit trigger enforcement (`app.audit_reason`) | Requires running database |

---

## 🚫 Blockers

### Blocker 1: Docker Not Available
- **Issue:** `supabase start` requires Docker Desktop or Podman. Neither is installed.
- **Attempted Fixes:**
  - `choco install docker-desktop` → fails (non-admin shell, lock file access denied)
  - `choco install postgresql` → package not found
  - `winget install PostgreSQL.PostgreSQL` → no package found
- **Impact:** Cannot run local Supabase, cannot apply migration, cannot verify RPC/trigger/RLS behavior.
- **Resolution Required:** User must install Docker Desktop (Run as Administrator) on the development machine, then run:
  ```bash
  cd "D:/Downloads/ino-erp (10) - Copy"
  supabase start
  supabase migration up
  ```

### Blocker 2: Supabase `ingestor` Role Creation
- The migration documents the GRANT statements but they must be run **after** `supabase start` in the Supabase Dashboard SQL Editor or via `psql`:
  ```sql
  CREATE ROLE ingestor NOINHERIT;
  GRANT USAGE ON SCHEMA public TO ingestor;
  GRANT SELECT, INSERT ON tx_header, tx_item, cash_ledger, ingest_conflict TO ingestor;
  GRANT SELECT ON cabang, pelanggan, produk, metode_bayar TO ingestor;
  GRANT EXECUTE ON FUNCTION ingest_jeking(jsonb) TO ingestor;
  ```
- RLS policies for `ingestor` also need to be created after role exists.

---

## 📋 Next Steps (When Docker Available)

1. **Install Docker Desktop** (Run as Administrator on Windows)
2. **Start local Supabase:**
   ```bash
   supabase start
   ```
3. **Apply migration:**
   ```bash
   supabase migration up
   ```
4. **Create `ingestor` role & RLS policies** in Supabase Dashboard SQL Editor
5. **Verify:**
   - `psql -c "SELECT ingest_jeking('{\"external_ref\":\"test-1\",\"hash_asli\":\"abc\",\"cabang\":\"PUSAT\",\"tanggal\":\"2026-10-24\",\"nomor\":\"TX-001\",\"pelanggan_kode\":\"CUST-001\",\"metode_bayar\":\"TUNAI\",\"subtotal\":100000,\"ppn\":11000,\"total\":111000,\"items\":[]}')"`

---

## 📁 Files Changed in This Phase

```
supabase/migrations/20261024000000_initial_schema.sql  (804 lines)
```

---

## ⚠️ Notes

- All mutations designed to go through RPC (audit trail enforced via `SET LOCAL app.audit_reason`)
- `service_role` key never used in frontend/Go exe — only `anon` key (frontend) and `ingestor` role (Go exe)
- Phase 0 (Go exe PoC on real Win7 PC) not started — depends on Supabase RPC being live
- Phase 2 (Go exe production) and Phase 3 (React dataService swap) blocked on Phase 1 verification

---

**Status:** **BLOCKED** — Waiting for Docker installation to run local Supabase and verify migration.