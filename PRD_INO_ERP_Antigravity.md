# PRD — INO Finance/Ledger: JeKing → Supabase Migration

| | |
|---|---|
| **Versi** | 2.0 — 24 Okt 2026 |
| **Repo** | `Hermit27-art/ino-erp` (branch `migration-supabase`) |
| **Eksekutor** | Antigravity (agent) |
| **Dasar** | Arsitektur target: JeKing CSV → Go exe (Win7/386) → Supabase REST → React (Vercel) |
| **Status** | Fase 0 siap dikerjakan. Fase 1–3 bergantung pada Phase 0 PoC lolos. |

---

## 0. Aturan Eksekusi untuk Antigravity (wajib baca)

1. **Jangan menghapus file** sebelum daftar *keep/delete* disetujui pemilik.
2. **Satu work item = satu commit kecil.** Setelah tiap item: `npm run lint && npm run build` lolos; tempel hasil di pesan commit.
3. **Jangan menulis ulang `src/App.tsx`** (~9.4k baris). Sentuh hanya fungsi yang disebut di work item.
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
┌─────────────┐    CSV Export    ┌──────────────┐    HTTPS/REST     ┌─────────────┐
│  JeKing     │ ──────────────▶  │  Go Exe      │ ──────────────▶  │  Supabase   │
│  (Win7,     │   (manual/auto)  │  (stdlib,    │   (idempotent    │  (PostgreSQL,│
│   local DB) │                  │   GOARCH=386)│    upsert RPC)   │   RLS,      │
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
1. **Fase 0:** Win7 PoC — Go exe compile 386, baca CSV, POST ke Supabase RPC, response OK.
2. **Fase 1:** Supabase schema lengkap (tables, audit trigger, RLS, RPC ingest, GL trigger, COA, helpers).
3. **Fase 2:** Go exe production-ready (retry, logging, config file, health check, idempotent upsert).
4. **Fase 3:** React `dataService.ts` → Supabase JS SDK; hapus `google.script.run`; auth → Supabase Auth; UI manual entry tetap jalan.

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
| W0.1 | Setup Supabase project baru (region `sg1`). Buat tabel `ingest_staging` (raw JSONB) + RPC `ingest_jeking(jsonb)` yang UPSERT ke `Tx_Header` + `Tx_Item` + `audit_log`. | `curl -X POST <RPC>` dengan sample JSON → row masuk, idempotent (POST 2× = 1 row). |
| W0.2 | Go exe: `main.go` (stdlib only, Go 1.20, `GOARCH=386 GOOS=windows`). Baca CSV (config path), validasi required columns, build payload JSON canonical, POST ke RPC dengan API key (anon key). | Build `.exe` jalan di Win7 VM; `./ingo.exe -csv sample.csv -url $SUPABASE_URL -key $ANON_KEY` → sukses, log JSON structured. |
| W0.3 | Idempotency test: jalankan exe 2× same CSV → `Tx_Header` count = 1, `audit_log` action `INSERT` lalu `UPSERT_NO_CHANGE`. | Log menunjukkan deduplication kerja. |
| W0.4 | Error handling: CSV kolom kurang, FK gagal (produk/pelanggan tidak ada), jaringan timeout → exit code non-zero, log error detail, **tidak panic**. | Unit test (Go `testing`) lolos skenario error. |

---

### Fase 1 — Supabase Schema + Audit + RLS + Ingest RPC (Core DB)

**Semua migrasi via Supabase CLI (`supabase migration new`). Semua tabel `uuid` PK kecuali lookup.**

#### 4.1 Tabel Master & Dimensi

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `cabang` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `aktif boolean DEFAULT true` | Seed 1 row default |
| `coa` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `tipe enum('Aset','Liabilitas','Ekuitas','Pendapatan','Beban')`, `induk_id uuid FK→coa`, `aktif boolean` | User-managed via Settings |
| `produk` | `id uuid PK`, `sku text UNIQUE`, `nama text`, `satuan text`, `hpp numeric`, `aktif boolean` | Upsert via RPC ingest & manual |
| `pelanggan` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `telepon text`, `aktif boolean` | Upsert via RPC ingest & manual |
| `supplier` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `aktif boolean` | Untuk PO masa depan |
| `metode_bayar` | `id uuid PK`, `kode text UNIQUE`, `nama text`, `coa_id uuid FK→coa` (kas/bank), `aktif boolean` | Mapping metode → akun kas |

#### 4.2 Tabel Transaksional (Operasional)

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `tx_header` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text CHECK IN ('jeking','manual')`, `hash_asli char(64)`, `cabang_id uuid FK`, `tanggal date`, `nomor text`, `pelanggan_id uuid FK`, `metode_bayar_id uuid FK`, `subtotal numeric`, `ppn numeric`, `total numeric`, `status_bayar text`, `status_logistik text`, `void boolean DEFAULT false`, `void_alasan text`, `void_oleh uuid`, `void_pada timestamptz`, `created_at timestamptz DEFAULT now()`, `created_by uuid` | **No UPDATE on financial cols**; void = reversal |
| `tx_item` | `id uuid PK`, `tx_header_id uuid FK`, `produk_id uuid FK`, `qty numeric`, `harga numeric`, `diskon numeric`, `ppn numeric`, `hpp_snapshot numeric`, `subtotal numeric` | HPP disnapshot saat INSERT |
| `po_header` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text`, `hash_asli char(64)`, `cabang_id uuid`, `tanggal date`, `nomor text`, `supplier_id uuid FK`, `status_logistik text`, `status_bayar text`, `void boolean`, `created_at`, `created_by` | Manual entry only (Fase 1) |
| `po_item` | `id uuid PK`, `po_header_id uuid FK`, `produk_id uuid FK`, `qty numeric`, `harga numeric`, `hpp_snapshot numeric` | |
| `cash_ledger` | `id uuid PK`, `external_ref text UNIQUE`, `sumber text`, `hash_asli char(64)`, `cabang_id uuid`, `tanggal date`, `coa_id uuid FK` (kas/bank), `metode_bayar_id uuid FK`, `arah text CHECK IN ('masuk','keluar')`, `jumlah numeric`, `keterangan text`, `ref_tipe text`, `ref_id uuid`, `void boolean`, `created_at`, `created_by` | Mutasi kas/bank |

#### 4.3 General Ledger (Append-Only)

| Tabel | Kolom Kunci | Catatan |
|---|---|---|
| `gl_entry` | `id uuid PK`, `tx_id uuid` (FK ke `tx_header`/`po_header`/`cash_ledger`), `tx_tipe text CHECK IN ('tx','po','cash')`, `coa_id uuid FK`, `debit numeric DEFAULT 0`, `kredit numeric DEFAULT 0`, `memo text`, `created_at timestamptz DEFAULT now()`, `created_by uuid`, `reversal_of uuid FK→gl_entry` | **No UPDATE/DELETE**. Edit = `reversal_of` + entry baru. Trigger auto-populate dari `tx_header`/`tx_item`/`cash_ledger`. |

#### 4.4 Audit Log (Universal)

```sql
CREATE TABLE audit_log (
  id uuid PK DEFAULT gen_random_uuid(),
  tabel text NOT NULL,
  pk_value jsonb NOT NULL,           -- {"id": "..."} atau composite
  action text CHECK IN ('INSERT','UPDATE','DELETE','UPSERT_NO_CHANGE'),
  old_data jsonb,                    -- NULL untuk INSERT
  new_data jsonb,                    -- NULL untuk DELETE
  changed_by uuid,                   -- auth.uid() atau service role
  changed_at timestamptz DEFAULT now(),
  reason text                        -- MANDATORY untuk UPDATE/DELETE
);
-- RLS: SELECT all authenticated; INSERT service_role only; NO UPDATE/DELETE policy
-- Trigger: AFTER INSERT/UPDATE/DELETE ON ALL transactional/master tables
--          EXECUTE PROCEDURE audit_trigger_fn();
```

**Trigger `audit_trigger_fn()`**: Generic, pakai `TG_TABLE_NAME`, `TG_OP`, `OLD`, `NEW`. Untuk UPDATE/DELETE wajib `reason` di `current_setting('app.audit_reason')` (SET LOCAL di RPC/client sebelum mutasi).

#### 4.5 RPC Ingest (JeKing)

```sql
CREATE OR REPLACE FUNCTION ingest_jeking(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_header_id uuid;
  v_hash text := encode(sha256(p_payload::text::bytea), 'hex');
BEGIN
  -- Idempotency: cek external_ref
  SELECT id INTO v_header_id FROM tx_header
   WHERE external_ref = p_payload->>'external_ref' AND sumber = 'jeking';
  
  IF v_header_id IS NOT NULL THEN
    -- Upsert no-change audit
    INSERT INTO audit_log (tabel, pk_value, action, new_data, changed_by)
    VALUES ('tx_header', jsonb_build_object('id', v_header_id), 'UPSERT_NO_CHANGE', p_payload, current_setting('app.service_uid')::uuid);
    RETURN jsonb_build_object('status', 'DUPLICATE', 'id', v_header_id);
  END IF;

  -- Insert header + items dalam 1 transaksi
  INSERT INTO tx_header (...) VALUES (...) RETURNING id INTO v_header_id;
  INSERT INTO tx_item (...) SELECT ... FROM jsonb_array_elements(p_payload->'items');
  INSERT INTO cash_ledger (...) VALUES (...); -- mutasi kas/bank
  -- GL entries dibuat oleh trigger AFTER INSERT tx_header+tx_item+cash_ledger

  RETURN jsonb_build_object('status', 'OK', 'id', v_header_id);
END; $$;
```

**RLS**: `ingest_jeking` hanya bisa dipanggil oleh `anon` key (via `SECURITY DEFINER` + check `current_setting('role') = 'anon'`). **Tidak pernah** pakai `service_role` key di exe.

#### 4.6 RPC Manual Entry (React App)

- `create_tx_manual(p_payload jsonb)` — validasi COA, hitung PPN, insert `tx_header` + `tx_item` + `cash_ledger` + audit.
- `void_tx(p_id uuid, p_alasan text)` — set `void=true`, insert reversal `gl_entry`, audit `reason=p_alasan`.
- `create_cash_manual(p_payload jsonb)` — kas masuk/keluar manual.

#### 4.7 Helper Views (untuk Dashboard)

- `v_gl_balance(coa_id, periode_awal, periode_akhir)` — saldo per akun.
- `v_trial_balance(periode_awal, periode_akhir)` — neraca saldo.
- `v_pl(periode_awal, periode_akhir)` — P&L (Pendapatan - Beban).
- `v_stock_on_hand(produk_id)` — stok real-time (tx_item IN - OUT + PO receipt - retur).

---

### Fase 2 — Go Exe Production-Ready

| ID | Pekerjaan | Kriteria Terima |
|---|---|---|
| W2.1 | Config file `config.yaml` (path CSV, Supabase URL, anon key, log level, schedule). | Exe jalan dengan `--config config.yaml` tanpa flag CLI. |
| W2.2 | Retry exponential backoff (max 3×, base 2s) + circuit breaker (5 gagal berturut = stop 10 menit). | Simulasi network flaky → exe recover otomatis. |
| W2.3 | Structured logging (JSON) ke stdout + rotating file (max 10MB, 5 files). | Log parseable oleh Loki/Promtail. |
| W2.4 | Health endpoint HTTP `:8080/health` (GET → `{"status":"ok","last_run":"...","last_status":"OK"}`). | `curl localhost:8080/health` return 200. |
| W2.5 | Idempotent upsert: payload canonical JSON (sorted keys) → `hash_asli` konsisten. | Hash same CSV = same `hash_asli`. |
| W2.6 | Build script: `GOOS=windows GOARCH=386 go build -ldflags="-s -w" -o ingo.exe .` | Binary < 10MB, jalan di Win7 SP1 tanpa VC++ redist. |

---

### Fase 3 — React App: Swap dataService.ts → Supabase

| ID | Pekerjaan | Kriteria Terima |
|---|---|---|
| W3.1 | Hapus `google.script.run` di `src/dataService.ts`. Ganti dengan `@supabase/supabase-js` client (anon key di env). | `npm run build` lolos, no `google.script.run` reference. |
| W3.2 | Auth: ganti custom token → Supabase Auth (email/password + magic link). `src/authService.ts` rewrite. | Login/logout jalan, session persist, RLS enforced. |
| W3.3 | Manual Entry UI (Tx, PO, Cash) memakai RPC `create_tx_manual`, `create_cash_manual`. | Form submit → row di Supabase + audit_log + GL entry. |
| W3.4 | Dashboard/Reports: query view `v_pl`, `v_trial_balance`, `v_stock_on_hand` via Supabase client. | Angka cocok dengan GL append-only. |
| W3.5 | Void/Retur UI: panggil `void_tx` dengan `reason` mandatory. Reversal GL terlihat di `gl_entry`. | Void → saldo GL benar, `audit_log` ada reason. |
| W3.6 | Settings: CRUD `coa`, `metode_bayar`, `produk`, `pelanggan` via Supabase (RLS Superadmin only). | UI Settings fungsi penuh tanpa GAS. |
| W3.7 | Hapus `src/utils/migration.ts` (old), `src/domain/voidRetur.ts` (diganti RPC), `src/stores/useAppStore.ts` (unused). | `grep -r "saveAll\|google.script.run\|useAppStore" src/` → kosong. |

---

## 5. Verifikasi & Definisi Selesai (Per Fase)

| Fase | Verifikasi Wajib |
|---|---|
| 0 | Exe jalan Win7, RPC idempotent, audit_log terisi, 0 panic Go. |
| 1 | `supabase db diff` clean; semua tabel punya audit trigger; RLS enable; RPC ingest hanya anon; GL trigger generate entry benar (test manual INSERT → cek `gl_entry`). |
| 2 | Exe + config.yaml + health endpoint + retry + logging; 1000 CSV rows < 30s; idempotent 10× run = 1 row. |
| 3 | `npm run lint && npm run build && npm test` hijau; login Supabase; manual entry → GL benar; void → reversal; dashboard angka match view; **no GAS code remains**. |

---

## 6. Lampiran — File Retention / Deletion List (WAIT FOR CONFIRMATION)

### KEEP (Adapt & Extend)
```
src/App.tsx                    # KEEP AS-IS (per rule), wire new dataService only
src/main.tsx                   # Entry point
src/index.css                  # Tailwind 4 styles
src/types.ts                   # UPDATE: add Supabase types, GL, audit types
src/components/                # ALL reusable UI components (Button, Card, Table, Badge, SearchableSelect, EmptyState, TableActions)
src/hooks/                     # useDebounce, useToast
src/tabs/                      # UPDATE: SalesOrderTab→TxTab, PurchaseOrderTab→POTab, CashLedgerTab, ReportsTab→GLTab, SettingsTab
src/dataService.ts             # REPLACE ENTIRELY with Supabase client
src/authService.ts             # REPLACE: Supabase Auth
src/domain/voidRetur.test.ts   # KEEP: test patterns for void logic
```

### UPDATE (Config & Rules)
```
package.json                   # ADD: @supabase/supabase-js, vitest; REMOVE: vite-plugin-singlefile, gas-related
tsconfig.json                  # UPDATE: paths for new domain/
vite.config.ts                 # REMOVE: singlefile plugin
README.md                      # REWRITE: new architecture, deploy steps
AGENTS.md                      # THIS FILE (updated below)
.env.example                   # NEW: SUPABASE_URL, SUPABASE_ANON_KEY
supabase/                      # NEW: migrations/, config.toml, seed.sql
go/                            # NEW: main.go, config.yaml, go.mod, go.sum
.agents/rules/                 # UPDATE: remove google-apps-script.md; add supabase-rls.md, audit-trail.md, go-stdlib.md
.agents/skills/                # NEW: execute-migration-phase, pre-handoff-review (updated)
```

### DELETE (Out of Scope / Legacy / Trash)
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
index.html

# Old PRD & Specs
PRD_INO_ERP_Antigravity.md      # REPLACED by this file
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

# Old Skills (replaced by migration skills)
.agents/skills/execute-prd-phase/
.agents/skills/pre-handoff-review/
```

---

## 7. Catatan Operasional

- **Deploy Supabase**: `supabase link --project-ref <ref>` → `supabase db push` (migrations), `supabase functions deploy` (RPC).
- **Deploy Vercel**: Connect GitHub repo, env vars `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE` (server-only).
- **Go Exe Distribution**: Binary + `config.yaml` dikirim ke cabang via USB/SharePoint. Task Scheduler: `0 2 * * * C:\ino\ingo.exe --config C:\ino\config.yaml`.
- **Rollback**: Supabase migration down (`supabase migration down`); Go exe rollback = replace binary; React rollback = Vercel instant rollback.
- **Monitoring**: Supabase logs (RPC errors), Vercel analytics, Go exe health endpoint scrape.