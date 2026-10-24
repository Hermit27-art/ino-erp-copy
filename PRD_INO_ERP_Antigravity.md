# PRD — INO Finance/Ledger: JeKing → Supabase Migration

| | |
|---|---|
| **Versi** | 2.1 — 24 Okt 2026 |
| **Repo** | `Hermit27-art/ino-erp` (branch `migration-supabase`) |
| **Eksekutor** | Antigravity (agent) |
| **Dasar** | Arsitektur target: JeKing CSV → Go exe (Win7/386) → Supabase RPC → React (Vercel) |
| **Status** | Fase 0 siap dikerjakan. Fase 1–3 bergantung pada Phase 0 PoC lolos. |

---

## 0. Aturan Eksekusi untuk Antigravity (wajib baca)

1. **Jangan menghapus file** sebelum daftar *keep/delete* disetujui pemilik.
2. **Satu work item = satu commit kecil.** Setelah tiap item: `npm run lint && npm run build` lolos; tempel hasil di pesan commit.
3. **Jangan menulis ulang `src/App.tsx`** (~9.4k baris). Sentuh hanya fungsi yang disebut di work item. **Boleh mengubah call sites `saveAll*` / `dataService`** (tanpa refactor logika bisnis).
4. **Tidak ada dependency baru** kecuali yang eksplisit di PRD (`@supabase/supabase-js`, `vitest`, Go stdlib only). Setiap tambahan wajib didaftar & dibenarkan di commit message.
5. **Server (Supabase) adalah source of truth.** Client hanya kirim intent; Supabase (RLS, trigger, RPC) menghitung GL, stok, saldo, ID, timestamp.
6. **Audit trail wajib:** Semua tabel transaksional & master punya trigger audit → `audit_log` (append-only, no UPDATE/DELETE untuk role manapun).
7. **No hard deletes:** Gunakan `void` / `aktif` flag. `General_Ledger` append-only (edit = reversal + entry baru).
8. **`Tx_Header` wajib punya** `sumber` (`'jeking'|'manual'`) dan `hash_asli` (SHA-256 payload asli).
9. **Ganti semua `saveAll*`** (whole-table overwrite) dengan **per-row upsert** (idempotent via `externalRef` / PK).
10. **Stop dan tanya** saat logika uang/pajak/stok ambigu, schema change berdampak data existing, atau PRD konflik dengan itself.

---

## 1. Ringkasan Arsitektur Target

```
┌─────────────┐    CSV Export    ┌──────────────┐    HTTPS/RPC     ┌─────────────┐
│  JeKing     │ ──────────────▶  │  Go Exe      │ ──────────────▶  │  Supabase   │
│  (Win7,     │   (manual/auto)  │  (stdlib,    │   (ingest_jeking │  (PostgreSQL,│
│   local DB) │                  │   GOARCH=386)│    RPC, auth)   │   RLS,      │
└─────────────┘                  └──────────────┘                  │   Triggers) │
                                                                   └──────┬──────┘
                                                                          │
                                                                          ▼
┌─────────────┐    HTTPS/REST     ┌─────────────────────────────────────────────┐
│  React App  │ ◀──────────────── │  Vercel (SSR/SSG, Supabase JS SDK, RLS)     │
│  (Vercel)   │   (Supabase JS)  │  Dashboard, GL, P&L, Inventory, Manual Entry  │
└─────────────┘                  └─────────────────────────────────────────────┘
```

**Prinsip Kunci:** Data dari Go exe **tidak dijamin benar** (user bisa edit manual di INO). Oleh karena itu:
- **Audit trail** = kebenaran, bukan read-only replica
- **Manual entry** tetap first-class citizen (sumber `'manual'`)
- **Void/retur** = reversal entries, bukan hapus data

---

## 2. Decision Log (Pemilik isi kolom *Jawaban*)

| ID | Pertanyaan Kebijakan | Default | Jawaban |
|---|---|---|---|
| DEC-01 | JeKing CSV: format kolom pasti? Contoh file ada? | Header: `tanggal,no_transaksi,pelanggan,produk,qty,harga,total,metode_bayar,cabang` | |
| DEC-02 | COA (Chart of Accounts) struktur: flat atau hierarkis? | Flat, user-defined via UI (Settings → COA) | |
| DEC-03 | GL posting rule: per-transaksi atau batch harian? | Per-transaksi (real-time via trigger) | |
| DEC-04 | PPN handling: INO hitung atau JeKing sudah include? | INO hitung (taxMode per Tx_Header: INCLUDE/EXCLUDE/NONE) | |
| DEC-05 | `hash_asli` algoritma & encoding? | SHA-256 hex dari JSON canonical (sorted keys) payload Go | |
| DEC-06 | Idempotency key: `externalRef` format? | `jeking-{cabang}-{no_transaksi}-{tanggal}` | |
| DEC-07 | RLS policy: multi-cabang isolation? | **Out of scope** (single-cabang dulu); `cabang_id` column siap tapi policy `true` | |
| DEC-08 | Go exe scheduling: Task Scheduler atau manual run? | Task Scheduler (daily 02:00), manual trigger via CLI flag | |
| DEC-09 | Supabase project region? | `sg1` (Singapore) | |
| DEC-10 | Vercel deployment: preview/prod branch mapping? | `main` → prod, `preview/*` → preview | |

---

## 3. Sasaran & Non-Sasaran

### Sasaran (In Scope)
1. **Fase 0:** Win7 PoC — Go exe compile 386, baca CSV, POST ke Supabase RPC `ingest_jeking`, response OK. **Harus jalan di PC kasir Win7 asli**, bukan VM patched.
2. **Fase 1:** Supabase schema lengkap (tables, audit trigger, RLS, RPC ingest, GL trigger, COA, helpers).
3. **Fase 2:** Go exe production-ready (config.json, logging ke error.log, idempotent upsert).
3. **Fase 3:** React `dataService.ts` → Supabase JS SDK; hapus `google.script.run`; auth → Supabase Auth; UI manual entry tetap jalan.

### Non-Sasaran (Explicitly Out)
- POS UI (`index_POS.html`, POS logic)
- Google Apps Script backend (`Code_ERP.gs`, `setup_sheets.gs`)
- Konsinyasi, BOM/Produksi, Wastage, multi-platform (Tokopedia dll.)
- Multi-cabang / multi-tenant (schema siap, policy `true` dulu)
- Historical backfill (hanya data forward dari go-live)
- Direct `.mdb` access (JeKing → CSV export manual/OTOMATIS di sisi JeKing)
- Windows Service (Task Scheduler saja)
- HR, CRM, Payroll, Fixed Assets, General Ledger full accounting (hanya GL dari transaksi operasional)

---

## 4. Rencana Kerja per Fase (Satu Fase = Satu Sesi)

### Fase 0 — Win7 PoC (Go Exe + Supabase RPC Minimal)

| ID | Pekerjaan | Kriteria Terima |
|---|---|---|
| W0.1 | Setup Supabase **local** (`supabase start`). Buat tabel `ingest_staging` (raw JSONB) + RPC `ingest_jeking(jsonb)` + role `ingestor` + `GRANT EXECUTE`. | `supabase status` hijau; `psql -c "SELECT ingest_jeking('{}')"` error auth (bukan anon). |
| W0.2 | Go exe: `main.go` (stdlib only, Go 1.20, `GOARCH=386 GOOS=windows`). Config `config.json` (csv_path, supabase_url, ingestor_email, ingestor_password). Baca CSV, validasi required columns, build payload JSON canonical + `hash_asli`, login Supabase Auth sebagai `ingestor`, POST ke RPC `ingest_jeking`. | Build `.exe` jalan di **Win7 PC kasir asli**; `./ingo.exe --config config.json` → sukses, append log ke `error.log`. |
| W0.3 | Idempotency & conflict: jalankan exe 2× same CSV → `Tx_Header` count = 1, **no audit row** untuk same hash. Different hash same `external_ref` → row ke `ingest_conflict`, **tidak overwrite**. | Log menunjukkan deduplication & conflict detection kerja. |
| W0.4 | Error handling: CSV kolom kurang, FK gagal (produk/pelanggan tidak ada), jaringan timeout → exit code non-zero, append detail ke `error.log`, **tidak panic**. | Unit test (Go `testing`) lolos skenario error. |

---

### Fase 1 — Supabase Schema + Audit + RLS + Ingest RPC (Core DB)

**Semua migrasi via Supabase CLI (`supabase migration new`). Semua tabel `uuid` PK kecuali lookup. Hanya local Supabase (`supabase start`).**

#### 4.1 Auth & Role Setup

```sql
-- Role untuk Go exe (ingestor)
CREATE ROLE ingestor NOINHERIT;
-- User ingestor dibuat via Supabase Auth Dashboard / CLI
-- GRANT EXECUTE ON FUNCTION ingest_jeking(jsonb) TO ingestor;
-- RLS policies: ingestor bisa SELECT/INSERT tx_header, tx_item, cash_ledger, ingest_conflict
--               TIDAK bisa UPDATE/DELETE
```

#### 4.2 Tabel Master & Dimensi

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `cabang` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `aktif boolean DEFAULT true` | Seed 1 row default |
| `coa` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `tipe enum('Aset','Liabilitas','Ekuitas','Pendapatan','Beban')`, `induk_id uuid FK→coa`, `aktif boolean` | User-managed via Settings |
| `produk` | `id uuid PK`, `sku text UNIQUE`, `nama text`, `satuan text`, `hpp numeric`, `aktif boolean` | Upsert via RPC ingest & manual |
| `pelanggan` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `telepon text`, `aktif boolean` | Upsert via RPC ingest & manual |
| `supplier` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `aktif boolean` | Untuk PO masa depan |
| `metode_bayar` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `coa_id uuid FK→coa` (kas/bank), `aktif boolean` | Mapping metode → akun kas |

#### 4.3 Tabel Transaksional (Operasional)

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `tx_header` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text CHECK IN ('jeking','manual')`, `hash_asli char(64)`, `cabang_id uuid FK`, `tanggal date`, `nomor text`, `pelanggan_id uuid FK`, `metode_bayar_id uuid FK`, `subtotal numeric`, `ppn numeric`, `total numeric`, `status_bayar text`, `status_logistik text`, `void boolean DEFAULT false`, `void_alasan text`, `void_oleh uuid`, `void_pada timestamptz`, `created_at timestamptz DEFAULT now()`, `created_by uuid` | **No UPDATE on financial cols**; void = reversal |
| `tx_item` | `id uuid PK`, `tx_header_id uuid FK`, `produk_id uuid FK`, `qty numeric`, `harga numeric`, `diskon numeric`, `ppn numeric`, `hpp_snapshot numeric`, `subtotal numeric` | HPP disnapshot saat INSERT |
| `po_header` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text`, `hash_asli char(64)`, `cabang_id uuid`, `tanggal date`, `nomor text`, `supplier_id uuid FK`, `status_logistik text`, `status_bayar text`, `void boolean`, `created_at`, `created_by` | Manual entry only (Fase 1) |
| `po_item` | `id uuid PK`, `po_header_id uuid FK`, `produk_id uuid FK`, `qty numeric`, `harga numeric`, `hpp_snapshot numeric` | |
| `cash_ledger` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text`, `hash_asli char(64)`, `cabang_id uuid`, `tanggal date`, `coa_id uuid FK` (kas/bank), `metode_bayar_id uuid FK`, `arah text CHECK IN ('masuk','keluar')`, `jumlah numeric`, `keterangan text`, `ref_tipe text`, `ref_id uuid`, `void boolean`, `created_at`, `created_by` | Mutasi kas/bank |

#### 4.4 Tabel Conflict & Audit

```sql
-- Conflict table untuk hash mismatch same external_ref
CREATE TABLE ingest_conflict (
  id uuid PK DEFAULT gen_random_uuid(),
  external_ref text NOT NULL,
  hash_asli char(64) NOT NULL,        -- hash dari payload baru
  hash_existing char(64) NOT NULL,    -- hash yang sudah ada di tx_header
  payload_new jsonb NOT NULL,
  payload_existing jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX ON ingest_conflict (external_ref, hash_asli);

-- Universal audit_log
CREATE TABLE audit_log (
  id uuid PK DEFAULT gen_random_uuid(),
  tabel text NOT NULL,
  pk_value jsonb NOT NULL,
  action text CHECK IN ('INSERT','UPDATE','DELETE','UPSERT_NO_CHANGE'),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz DEFAULT now(),
  reason text                        -- MANDATORY untuk UPDATE/DELETE
);
-- RLS: SELECT all authenticated; INSERT via RPC only; NO UPDATE/DELETE policy
-- Trigger: AFTER INSERT/UPDATE/DELETE ON ALL transactional/master tables
--          EXECUTE PROCEDURE audit_trigger_fn();
```

**Trigger `audit_trigger_fn()`**: Generic, pakai `TG_TABLE_NAME`, `TG_OP`, `OLD`, `NEW`. Untuk UPDATE/DELETE wajib `reason` di `current_setting('app.audit_reason')` (SET LOCAL di RPC sebelum mutasi).

#### 4.5 RPC Ingest (JeKing) — **auth: ingestor role only**

```sql
CREATE OR REPLACE FUNCTION ingest_jeking(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_header_id uuid;
  v_hash_asli text := p_payload->>'hash_asli';  -- hash dihitung Go, dikirim client
  v_external_ref text := p_payload->>'external_ref';
BEGIN
  -- Validasi hash_asli ada
  IF v_hash_asli IS NULL OR v_external_ref IS NULL THEN
    RAISE EXCEPTION 'hash_asli dan external_ref wajib ada';
  END IF;

  -- Cek existing
  SELECT id, hash_asli INTO v_header_id, v_hash_existing
  FROM tx_header
  WHERE external_ref = v_external_ref AND sumber = 'jeking';

  IF v_header_id IS NOT NULL THEN
    -- Same hash = no-op, TIDAK ada audit row
    IF v_hash_existing = v_hash_asli THEN
      RETURN jsonb_build_object('status', 'NOOP', 'id', v_header_id);
    END IF;
    -- Different hash = conflict, insert ke ingest_conflict, TIDAK overwrite
    INSERT INTO ingest_conflict (external_ref, hash_asli, hash_existing, payload_new, payload_existing)
    VALUES (v_external_ref, v_hash_asli, v_hash_existing, p_payload, 
            (SELECT to_jsonb(t) FROM tx_header t WHERE t.id = v_header_id));
    RETURN jsonb_build_object('status', 'CONFLICT', 'id', v_header_id);
  END IF;

  -- Insert header + items + cash_ledger dalam 1 transaksi
  -- GL entries dibuat oleh trigger AFTER INSERT
  INSERT INTO tx_header (external_ref, sumber, hash_asli, cabang_id, tanggal, nomor, 
                         pelanggan_id, metode_bayar_id, subtotal, ppn, total, 
                         status_bayar, status_logistik, created_by)
  VALUES (v_external_ref, 'jeking', v_hash_asli, 
          (SELECT id FROM cabang WHERE kode = (p_payload->>'cabang') LIMIT 1),
          (p_payload->>'tanggal')::date, p_payload->>'nomor',
          (SELECT id FROM pelanggan WHERE kode = (p_payload->>'pelanggan_kode') LIMIT 1),
          (SELECT id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1),
          (p_payload->>'subtotal')::numeric, (p_payload->>'ppn')::numeric, (p_payload->>'total')::numeric,
          'Lunas', 'Selesai', current_setting('app.service_uid')::uuid)
  RETURNING id INTO v_header_id;

  INSERT INTO tx_item (tx_header_id, produk_id, qty, harga, diskon, ppn, hpp_snapshot, subtotal)
  SELECT v_header_id, p.id, (item->>'qty')::numeric, (item->>'harga')::numeric,
         COALESCE((item->>'diskon')::numeric, 0), (item->>'ppn')::numeric,
         p.hpp, ((item->>'qty')::numeric * (item->>'harga')::numeric)
  FROM jsonb_array_elements(p_payload->'items') item
  JOIN produk p ON p.sku = item->>'produk_sku';

  INSERT INTO cash_ledger (external_ref, sumber, hash_asli, cabang_id, tanggal, coa_id, metode_bayar_id, 
                           arah, jumlah, keterangan, ref_tipe, ref_id, created_by)
  VALUES (v_external_ref, 'jeking', v_hash_asli,
          (SELECT id FROM cabang WHERE kode = (p_payload->>'cabang') LIMIT 1),
          (p_payload->>'tanggal')::date,
          (SELECT coa_id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1),
          (SELECT id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1),
          'masuk', (p_payload->>'total')::numeric,
          'Penjualan ' || v_external_ref, 'tx', v_header_id, current_setting('app.service_uid')::uuid);

  RETURN jsonb_build_object('status', 'OK', 'id', v_header_id);
END; $$;

GRANT EXECUTE ON FUNCTION ingest_jeking(jsonb) TO ingestor;
```

#### 4.6 RPC Manual Entry (React App) — **auth: authenticated, all mutations via RPC**

```sql
-- create_tx_manual: SET LOCAL app.audit_reason = '...' BEFORE CALL
CREATE OR REPLACE FUNCTION create_tx_manual(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Validasi COA, hitung PPN per taxMode, insert tx_header + tx_item + cash_ledger
  -- audit_log via trigger (reason dari app.audit_reason)
  -- GL via trigger
END; $$;

-- void_tx: SET LOCAL app.audit_reason = '...' BEFORE CALL
CREATE OR REPLACE FUNCTION void_tx(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Set void=true, insert reversal gl_entry (reversal_of), audit_log
END; $$;

-- create_cash_manual: SET LOCAL app.audit_reason = '...' BEFORE CALL
CREATE OR REPLACE FUNCTION create_cash_manual(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Insert cash_ledger + gl_entry + audit_log
END; $$;

-- Settings CRUD (Superadmin only via RLS): create_coa, update_coa, void_coa, create_metode_bayar, etc.
-- SEMUA lewat RPC dengan audit_reason.
```

#### 4.7 General Ledger (Append-Only)

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `gl_entry` | `id uuid PK`, `tx_id uuid` (FK ke `tx_header`/`po_header`/`cash_ledger`), `tx_tipe text CHECK IN ('tx','po','cash')`, `coa_id uuid FK`, `debit numeric DEFAULT 0`, `kredit numeric DEFAULT 0`, `memo text`, `created_at timestamptz DEFAULT now()`, `created_by uuid`, `reversal_of uuid FK→gl_entry` | **No UPDATE/DELETE**. Edit = `reversal_of` + entry baru. Trigger auto-populate dari `tx_header`/`tx_item`/`cash_ledger`. |

**Trigger GL**: AFTER INSERT ON `tx_header`/`tx_item`/`cash_ledger` → insert `gl_entry` per aturan posting (D/C per COA). TaxMode (INCLUDE/EXCLUDE/NONE) & PPN per DEC-04.

#### 4.8 Helper Views (untuk Dashboard)

- `v_gl_balance(coa_id, periode_awal, periode_akhir)` — saldo per akun.
- `v_trial_balance(periode_awal, periode_akhir)` — neraca saldo.
- `v_pl(periode_awal, periode_akhir)` — P&L (Pendapatan - Beban).
- `v_stock_on_hand(produk_id)` — stok real-time (tx_item IN - OUT + PO receipt - retur).

---

### Fase 2 — Go Exe Production-Ready

| ID | Pekerjaan | Kriteria Terima |
|---|---|---|
| W2.1 | Config file `config.json` (csv_path, supabase_url, ingestor_email, ingestor_password, log_level). | Exe jalan dengan `--config config.json` tanpa flag CLI. |
| W2.2 | Login Supabase Auth sebagai `ingestor` (email/password), simpan access token, refresh otomatis. | Token refresh otomatis saat expired. |
| W2.3 | Structured logging (JSON lines) ke `error.log` (append only, no rotation). | Log parseable, append only. |
| W2.4 | Payload canonical JSON (sorted keys) → `hash_asli` (SHA-256 hex) konsisten. | Hash same CSV = same `hash_asli`. |
| W2.5 | Build script: `GOOS=windows GOARCH=386 go build -ldflags="-s -w" -o ingo.exe .` | Binary < 10MB, jalan di Win7 SP1 tanpa VC++ redist. |

---

### Fase 3 — React App: Swap dataService.ts → Supabase

| ID | Pekerjaan | Kriteria Terima |
|---|---|---|
| W3.1 | Hapus `google.script.run` di `src/dataService.ts`. Ganti dengan `@supabase/supabase-js` client (env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). **service_role tidak pernah di frontend/Vercel**. | `npm run build` lolos, no `google.script.run` reference. |
| W3.2 | Auth: ganti custom token → Supabase Auth (email/password + magic link). `src/authService.ts` rewrite. | Login/logout jalan, session persist, RLS enforced. |
| W3.3 | Manual Entry UI (Tx, PO, Cash) memakai RPC `create_tx_manual`, `create_cash_manual`, `void_tx` dengan `SET LOCAL app.audit_reason`. | Form submit → row di Supabase + audit_log + GL entry. |
| W3.4 | Dashboard/Reports: query view `v_pl`, `v_trial_balance`, `v_stock_on_hand` via Supabase client. | Angka cocok dengan GL append-only. |
| W3.5 | Void/Retur UI: panggil `void_tx` dengan `reason` mandatory. **Void ≠ Retur** (carry over: void = reversal, tidak dihitung laporan; retur = barang kembali). Reversal GL terlihat di `gl_entry`. | Void → saldo GL benar, `audit_log` ada reason. |
| W3.6 | Settings: CRUD `coa`, `metode_bayar`, `produk`, `pelanggan` **via RPC** (bukan direct table access). RLS Superadmin only. | UI Settings fungsi penuh tanpa GAS. |
| W3.7 | Hapus `src/utils/migration.ts` (old), `src/domain/voidRetur.ts` (diganti RPC), `src/stores/useAppStore.ts` (unused). | `grep -r "saveAll\|google.script.run\|useAppStore" src/` → kosong. |
| W3.8 | Carry over decisions: **User-controlled tax mode** (taxMode per Tx_Header), **Moving-average HPP** (snapshot di tx_item.hpp_snapshot, update produk.hpp saat PO receipt), **PO flow Pesan→Rilis→Terima→Bayar** (hutang timbul saat Terima). | Semua logic di RPC/trigger, bukan client. |

---

## 5. Verifikasi & Definisi Selesai (Per Fase)

| Fase | Verifikasi Wajib |
|---|---|
| 0 | Exe jalan **Win7 PC kasir asli**, RPC idempotent + conflict detection, `error.log` terisi, 0 panic Go. |
| 1 | `supabase db diff` clean; semua tabel punya audit trigger; RLS enable; RPC ingest hanya role `ingestor`; GL trigger generate entry benar (test manual INSERT → cek `gl_entry`); `ingest_conflict` terisi saat hash mismatch. |
| 2 | Exe + config.json + error.log + login ingestor + token refresh; 1000 CSV rows < 30s; idempotent 10× run = 1 row (NOOP); conflict hash → `ingest_conflict`. |
| 3 | `npm run lint && npm run build && npm test` hijau; login Supabase; manual entry → GL benar; void → reversal; dashboard angka match view; **no GAS code remains**; semua mutasi lewat RPC dengan audit_reason. |

---

## 6. Lampiran — File Retention / Deletion List (CONFIRMED)

### KEEP (Adapt & Extend)
```
src/App.tsx                    # KEEP AS-IS, wire new dataService only (call sites boleh diubah)
src/main.tsx
src/index.css
src/types.ts                   # UPDATE: add Supabase types, GL, audit types
src/components/                # ALL reusable UI components
src/hooks/                     # useDebounce, useToast
src/tabs/                      # UPDATE: SalesOrderTab→TxTab, PurchaseOrderTab→POTab, CashLedgerTab, ReportsTab→GLTab, SettingsTab
src/dataService.ts             # REPLACE ENTIRELY with Supabase client
src/authService.ts             # REPLACE: Supabase Auth
src/domain/voidRetur.test.ts   # KEEP: test patterns
```

### UPDATE (Config & Rules)
```
package.json                   # ADD: @supabase/supabase-js, vitest; REMOVE: vite-plugin-singlefile, gas-related
tsconfig.json
vite.config.ts                 # REMOVE: singlefile plugin
README.md                      # REWRITE: new architecture, deploy steps
AGENTS.md                      # (done)
.env.example                   # NEW: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
supabase/                      # NEW: migrations/, config.toml, seed.sql
go/                            # NEW: main.go, config.json, go.mod, go.sum
.agents/rules/                 # UPDATE: remove google-apps-script.md; add supabase-rls.md, audit-trail.md, go-stdlib.md
.agents/skills/                # NEW: execute-migration-phase; pre-handoff-review (KEEP, update)
```

### DELETE (Out of Scope / Legacy / Trash) — **only files that exist**
```
# Google Apps Script Backend
Code_ERP.gs
Code_ERP_backup.gs
setup_sheets.gs
GOOGLE_SHEETS_SETUP.md

# POS UI (out of scope)
index_POS.html

# GAS Deployment Artifacts
index_ERP_GAS.html

# Old PRD & Specs
spec/decisions.md
spec/tasks.md

# Backup Source (duplicate)
src_backup/                     # ENTIRE DIRECTORY

# Temp / Scratch Files
temp.js
temp_code.js

# Report/Recovery Scripts (one-off, done)
check_braces.cjs
extract_reports.cjs
extract_reports.js
fix_2026.cjs
inject_reports.cjs
recover_reports.cjs
rewrite_handlers.cjs
patch.js

# Old README variant
README 2.md

# Old Agent Rule (GAS specific)
.agents/rules/google-apps-script.md

# Old Skill (replaced by migration skill)
.agents/skills/execute-prd-phase/
```

---

## 7. Catatan Operasional

- **Local Supabase only**: `supabase start` → `supabase migration up` → `supabase db push` (local). **Tidak pernah remote project.**
- **Deploy Vercel**: Connect GitHub repo, env vars `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **service_role tidak di Vercel.**
- **Go Exe Distribution**: Binary + `config.json` dikirim ke cabang via USB/SharePoint. Task Scheduler: `0 2 * * * C:\ino\ingo.exe --config C:\ino\config.json`.
- **Rollback**: Supabase migration down (`supabase migration down`); Go exe rollback = replace binary; React rollback = Vercel instant rollback.
- **Monitoring**: Supabase logs (RPC errors), Vercel analytics, `error.log` di PC cabang.