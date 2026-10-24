# Tasks — INO ERP Hardening (Phase 2, 3, 4)

**Tujuan proyek:** INO ERP aman, integritas data terjamin, aturan bisnis konsisten, siap go-live.

**Jangkar anti-drift:** Satu perusahaan, Google Sheets sebagai DB, React+Vite single-file → GAS, POS "re-feel" terintegrasi.

---

## Phase 2 — Integritas Data (Kritis, gerbang go-live)

- [x] **D1** Delta ops server-side
  - Tujuan: Ganti `saveAll*` di jalur panas dengan `adjustStock`, `adjustBalance`, `appendCashEntry` (LockService + idempotency `opId`)
  - File: `Code_ERP.gs`, `src/dataService.ts`, `src/App.tsx`, `src/tabs/*.tsx`, `index_POS.html`
  - Selesai bila: (a) `adjustStock` tolak stok < 0; (b) `adjustBalance` piutang/hutang; (c) `appendCashEntry` server beri `id` & hitung saldo; (d) tes konkurensi: stok 10 → POS jual 3 → ERP kirim SO 1 = **stok akhir 6**; (e) grep `saveAll(Products|Customers|Suppliers|CashLedger|SalesOrders|PurchaseOrders)` di `src/` hanya tersisa di import Superadmin

- [x] **D2** `await` + error handling + rollback UI
  - Tujuan: Semua pemanggilan simpan di-`await` dalam `try/catch`, gagal → toast error + kembalikan state/muat ulang, tombol disable saat request
  - File: `src/App.tsx`, `src/tabs/*.tsx`, `index_POS.html`
  - Selesai bila: matikan jaringan/paksa error GAS → UI tampil error, tidak menampilkan data tak tersimpan

- [x] **D3** ID server-side berurutan + insert vs upsert
  - Tujuan: ID SO/PO/CSH/CUST/SUP dibuat server (`generateId_`), pisah `create*`/`update*`, hapus 6× `randomUUID().slice(0,4)`
  - File: `Code_ERP.gs`, `src/dataService.ts`, `src/App.tsx`, `src/tabs/*.tsx`
  - Selesai bila: 20 pembuatan SO paralel = 20 ID unik; `create*` gagal jika id exist

- [x] **D4** SCHEMA terpusat + validasi runtime + round-trip
  - Tujuan: Satu `SCHEMA` di `Code_ERP.gs` dipakai `setup_sheets.gs` & validasi runtime; `saveItemToSheet` lempar error field asing; round-trip otomatis semua entitas
  - File: `Code_ERP.gs`, `setup_sheets.gs`, `src/types.ts`
  - Selesai bila: round-trip lulus semua entitas; simpan field asing → error eksplisit

- [x] **D5** Satukan model POS/ERP (SalesOrderItems + vocab status sama)
  - Tujuan: POS tulis ke `SalesOrderItems` (bukan JSON di header), vocab status sama ERP, migrasi POS lama
  - File: `Code_ERP.gs`, `src/dataService.ts`, `index_POS.html`, `src/App.tsx`
  - Selesai bila: order POS muncul di tab Sales Order ERP lengkap item; void POS kembalikan stok benar

- [ ] **D6** Void/retur benar + Void Log + fungsi murni `src/domain/`
  - Tujuan: Void balik kas/piutang/stok idempoten, Retur dokumen lunas = refund/kredit, Void Log (badge, tercatat, dikecualikan laporan), fungsi murni `src/domain/`
  - File: `Code_ERP.gs`, `src/domain/voidRetur.ts`, `src/App.tsx`, `src/tabs/*.tsx`
  - Selesai bila: skenario (Draft→Void, Lunas tunai→Void, Cicilan→Void, retur lalu void, void ganda) stok/piutang/kas benar

- [ ] **D7** `getReconciliationReport` (Admin+)
  - Tujuan: Endpoint baca-saja laporan: saldo kas vs hitung ulang, piutang vs sisa tagihan, hutang vs sisa PO, ID ganda, stok negatif
  - File: `Code_ERP.gs`, `src/dataService.ts`, `src/tabs/SettingsTab.tsx`
  - Selesai bila: laporan muncul di Settings, memunculkan selisih sengaja di Sheet uji

- [ ] **D8** Helper `todayLocal()` (Asia/Makassar), ganti 22× `toISOString()`
  - Tujuan: Satu helper tanggal bisnis lokal, server tetap GMT+8
  - File: `Code_ERP.gs`, `src/App.tsx`, `src/tabs/*.tsx`, `index_POS.html`
  - Selesai bila: pukul 02:00 WITA transaksi baru bertanggal hari itu

---

## Phase 2b — Anti-Tamper (Tamper-Evident + Recoverable)

- [ ] **T1** Proteksi Sheet: Web app "Execute as: Me", Sheet protected, `_BACA_DULU` sheet
- [ ] **T2** Hash chain (`_hash` = SHA-256(prev + field inti)), hash kepala di Script Properties
- [ ] **T3** `verifyIntegrity()` harian + tombol Superadmin + email
- [ ] **T4** Backup harian ke Drive, `resealIntegrity()` manual
- [ ] **T5** `onChange` trigger → `_AuditLog` + email
- [ ] **T6** `GO_LIVE_LOCKED` Script Property

---

## Phase 3 — Aturan Bisnis (Decision Log ✅)

- [ ] **B1** Pajak per dokumen (`taxMode`, `ppnStatus`, `calcTax`), hapus hardcode `0.12`
- [ ] **B2** HPP update saat terima PO, simpan `hpp` item SO, hapus fallback `12000` (7 tempat)
- [ ] **B3** `customerId`/`supplierId` di SO/PO, backfill, hapus auto-create
- [ ] **B4** Enum status terpusat (`statusLogistik`, `statusBayar`), alur Draft→Rilis→Kirim
- [ ] **B5** Satuan case-insensitive (`ml`/`Ml`), no konversi
- [ ] **B6** `kasir`/`operator` dari sesi login
- [ ] **B7** Alur PO: Pesan→Rilis→Terima→Bayar, hutang saat terima, centang "Sudah dibayar"
- [ ] **B8** Sheet `CashAccounts` + `PaymentMethods`, Settings CRUD, form pilih metode, migrasi

---

## Phase 3b — Dashboard (Tunggu DEC-17)

- [ ] **3b** Dashboard "Command Center" pakai template Tremor/Blok (DEC-17 pending)

---

## Phase 3d — i18n

- [ ] **I1** `src/i18n/format.ts` (Intl, locale & currency dari Settings)
- [ ] **I2** Zona waktu perusahaan di Settings, server & klien pakai helper lokal
- [ ] **I3** Katalog bahasa (EN+ID), `lang`/`dir` di `<html>`
- [ ] **I4** CSS logical properties (Tailwind 4), ruang ≥30% terjemahan
- [ ] **I5** Terapkan template DEC-17 konsisten

---

## Phase 3e — CSV Import/Export

- [ ] **J1** Impor CSV via endpoint posting (dry-run, validasi server, idempotensi `externalRef`, batch, audit log)
- [ ] **J2** Ekspor CSV dari setiap tabel/widget (netralkan injeksi rumus)
- [ ] **J3** Kontrak CSV untuk "local data entry tool" (tunggu spesifikasi pemilik)

---

## Phase 4 — Kebersihan & Uji

- [ ] **W4.1** Hapus 20+ file sampah + modul Konsinyasi (`src_backup/`, `.git_corrupted/`, `temp*.js`, `recover_reports.zip` 56MB, dll.)
- [ ] **W4.2** Rewrite `README.md` & `GOOGLE_SHEETS_SETUP.md` sesuai kenyataan
- [ ] **W4.3** Fix/label `deploy.yml` (demo lokal)
- [ ] **W4.4** Tambah `vitest`, ekstrak fungsi murni ke `src/domain/`, tes D6
- [ ] **W4.5** Ganti `any` di jalur uang/stok saja
- [ ] **W4.6** BOM/Platform ke sheet readable
- [ ] **W4.7** README portofolio + mode demo

---

## Catatan

- **Urutan wajib:** Phase 2 → 2b → 3 → 3b/3d/3e → 4
- **Gate tiap task:** Spec (sudah di PRD) → Builder → Reviewer → Verify (skill `verify`) → Centang
- **Single source of truth:** File ini (`spec/tasks.md`) + `spec/decisions.md`
- **Tidak boleh** lanjut ke task berikutnya sebelum task sebelumnya LULUS verify