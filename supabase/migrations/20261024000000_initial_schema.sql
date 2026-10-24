-- Phase 1: Supabase Schema + Audit + RLS + Ingest RPC
-- Run with: supabase migration up (requires local Supabase via `supabase start`)

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. MASTER & DIMENSION TABLES
-- ============================================================

-- Cabang (branch) - single cabang for now, but schema ready
CREATE TABLE cabang (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode text UNIQUE NOT NULL,
    nama text NOT NULL,
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Chart of Accounts (COA)
CREATE TYPE coa_tipe AS ENUM ('Aset', 'Liabilitas', 'Ekuitas', 'Pendapatan', 'Beban');

CREATE TABLE coa (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode text UNIQUE NOT NULL,
    nama text NOT NULL,
    tipe coa_tipe NOT NULL,
    induk_id uuid REFERENCES coa(id),
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Produk (Products)
CREATE TABLE produk (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sku text UNIQUE NOT NULL,
    nama text NOT NULL,
    satuan text NOT NULL,
    hpp numeric DEFAULT 0,
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Pelanggan (Customers)
CREATE TABLE pelanggan (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode text UNIQUE NOT NULL,
    nama text NOT NULL,
    telepon text,
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Supplier (for future PO)
CREATE TABLE supplier (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode text UNIQUE NOT NULL,
    nama text NOT NULL,
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- Metode Bayar (Payment Methods) - maps to COA (kas/bank)
CREATE TABLE metode_bayar (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kode text UNIQUE NOT NULL,
    nama text NOT NULL,
    coa_id uuid REFERENCES coa(id) NOT NULL,
    aktif boolean DEFAULT true,
    created_at timestamptz DEFAULT now()
);

-- ============================================================
-- 2. TRANSACTIONAL TABLES (Operasional)
-- ============================================================

-- TX Header (Sales Transactions - both JeKing & Manual)
CREATE TYPE sumber_transaksi AS ENUM ('jeking', 'manual');

CREATE TABLE tx_header (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref text UNIQUE NOT NULL,
    sumber sumber_transaksi NOT NULL,
    hash_asli char(64) NOT NULL,
    cabang_id uuid REFERENCES cabang(id) NOT NULL,
    tanggal date NOT NULL,
    nomor text NOT NULL,
    pelanggan_id uuid REFERENCES pelanggan(id),
    metode_bayar_id uuid REFERENCES metode_bayar(id) NOT NULL,
    subtotal numeric NOT NULL DEFAULT 0,
    ppn numeric NOT NULL DEFAULT 0,
    total numeric NOT NULL DEFAULT 0,
    status_bayar text NOT NULL DEFAULT 'Lunas',
    status_logistik text NOT NULL DEFAULT 'Selesai',
    void boolean DEFAULT false,
    void_alasan text,
    void_oleh uuid,
    void_pada timestamptz,
    created_at timestamptz DEFAULT now(),
    created_by uuid NOT NULL
);

-- TX Items
CREATE TABLE tx_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_header_id uuid REFERENCES tx_header(id) ON DELETE CASCADE NOT NULL,
    produk_id uuid REFERENCES produk(id) NOT NULL,
    qty numeric NOT NULL,
    harga numeric NOT NULL,
    diskon numeric DEFAULT 0,
    ppn numeric DEFAULT 0,
    hpp_snapshot numeric NOT NULL,
    subtotal numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- PO Header (Purchase Orders - manual entry only in Phase 1)
CREATE TABLE po_header (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref text UNIQUE NOT NULL,
    sumber sumber_transaksi NOT NULL DEFAULT 'manual',
    hash_asli char(64) NOT NULL,
    cabang_id uuid REFERENCES cabang(id) NOT NULL,
    tanggal date NOT NULL,
    nomor text NOT NULL,
    supplier_id uuid REFERENCES supplier(id) NOT NULL,
    status_logistik text NOT NULL DEFAULT 'Dipesan',
    status_bayar text NOT NULL DEFAULT 'Belum Lunas',
    void boolean DEFAULT false,
    void_alasan text,
    void_oleh uuid,
    void_pada timestamptz,
    created_at timestamptz DEFAULT now(),
    created_by uuid NOT NULL
);

-- PO Items
CREATE TABLE po_item (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_header_id uuid REFERENCES po_header(id) ON DELETE CASCADE NOT NULL,
    produk_id uuid REFERENCES produk(id) NOT NULL,
    qty numeric NOT NULL,
    harga numeric NOT NULL,
    hpp_snapshot numeric NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Cash Ledger (Kas/Bank mutations)
CREATE TYPE arah_kas AS ENUM ('masuk', 'keluar');

CREATE TABLE cash_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref text UNIQUE NOT NULL,
    sumber sumber_transaksi NOT NULL,
    hash_asli char(64) NOT NULL,
    cabang_id uuid REFERENCES cabang(id) NOT NULL,
    tanggal date NOT NULL,
    coa_id uuid REFERENCES coa(id) NOT NULL,
    metode_bayar_id uuid REFERENCES metode_bayar(id) NOT NULL,
    arah arah_kas NOT NULL,
    jumlah numeric NOT NULL,
    keterangan text,
    ref_tipe text, -- 'tx', 'po', 'manual'
    ref_id uuid,
    void boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    created_by uuid NOT NULL
);

-- ============================================================
-- 3. GENERAL LEDGER (Append-Only)
-- ============================================================

CREATE TYPE gl_tx_tipe AS ENUM ('tx', 'po', 'cash');

CREATE TABLE gl_entry (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tx_id uuid NOT NULL, -- FK to tx_header/po_header/cash_ledger
    tx_tipe gl_tx_tipe NOT NULL,
    coa_id uuid REFERENCES coa(id) NOT NULL,
    debit numeric DEFAULT 0,
    kredit numeric DEFAULT 0,
    memo text,
    created_at timestamptz DEFAULT now(),
    created_by uuid NOT NULL,
    reversal_of uuid REFERENCES gl_entry(id)
);

-- Index for GL queries
CREATE INDEX idx_gl_entry_tx ON gl_entry(tx_id, tx_tipe);
CREATE INDEX idx_gl_entry_coa ON gl_entry(coa_id);
CREATE INDEX idx_gl_entry_reversal ON gl_entry(reversal_of);

-- ============================================================
-- 4. AUDIT LOG (Universal) & CONFLICT TABLE
-- ============================================================

CREATE TABLE audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tabel text NOT NULL,
    pk_value jsonb NOT NULL,
    action text CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'UPSERT_NO_CHANGE')) NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_by uuid,
    changed_at timestamptz DEFAULT now(),
    reason text -- MANDATORY for UPDATE/DELETE
);

CREATE INDEX idx_audit_log_tabel_pk ON audit_log(tabel, pk_value);
CREATE INDEX idx_audit_log_changed_at ON audit_log(changed_at);

-- Ingest Conflict Table (hash mismatch on same external_ref)
CREATE TABLE ingest_conflict (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    external_ref text NOT NULL,
    hash_asli char(64) NOT NULL,
    hash_existing char(64) NOT NULL,
    payload_new jsonb NOT NULL,
    payload_existing jsonb NOT NULL,
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_ingest_conflict_unique ON ingest_conflict(external_ref, hash_asli);
CREATE INDEX idx_ingest_conflict_external_ref ON ingest_conflict(external_ref);

-- ============================================================
-- 5. AUDIT TRIGGER FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION audit_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_action text;
    v_old_data jsonb;
    v_new_data jsonb;
    v_pk_value jsonb;
    v_reason text;
BEGIN
    -- Determine action
    v_action := TG_OP;

    -- Build pk_value (assuming single-column PK named 'id')
    IF TG_OP = 'DELETE' THEN
        v_pk_value := jsonb_build_object('id', OLD.id);
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
    ELSIF TG_OP = 'INSERT' THEN
        v_pk_value := jsonb_build_object('id', NEW.id);
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
    ELSE -- UPDATE
        v_pk_value := jsonb_build_object('id', NEW.id);
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    END IF;

    -- Get audit reason from session variable (SET LOCAL app.audit_reason = '...')
    v_reason := current_setting('app.audit_reason', true);

    -- Enforce reason for UPDATE/DELETE
    IF TG_OP IN ('UPDATE', 'DELETE') AND (v_reason IS NULL OR v_reason = '') THEN
        RAISE EXCEPTION 'audit_reason is required for % operations', TG_OP;
    END IF;

    -- Insert audit log
    INSERT INTO audit_log (tabel, pk_value, action, old_data, new_data, changed_by, reason)
    VALUES (TG_TABLE_NAME, v_pk_value, v_action, v_old_data, v_new_data,
            COALESCE(current_setting('app.service_uid', true)::uuid, auth.uid()), v_reason);

    RETURN NEW;
END; $$;

-- ============================================================
-- 6. ATTACH AUDIT TRIGGERS TO ALL TRANSACTIONAL/MASTER TABLES
-- ============================================================

-- Master tables
CREATE TRIGGER audit_cabang AFTER INSERT OR UPDATE OR DELETE ON cabang
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_coa AFTER INSERT OR UPDATE OR DELETE ON coa
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_produk AFTER INSERT OR UPDATE OR DELETE ON produk
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_pelanggan AFTER INSERT OR UPDATE OR DELETE ON pelanggan
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_supplier AFTER INSERT OR UPDATE OR DELETE ON supplier
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_metode_bayar AFTER INSERT OR UPDATE OR DELETE ON metode_bayar
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- Transactional tables
CREATE TRIGGER audit_tx_header AFTER INSERT OR UPDATE OR DELETE ON tx_header
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_tx_item AFTER INSERT OR UPDATE OR DELETE ON tx_item
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_po_header AFTER INSERT OR UPDATE OR DELETE ON po_header
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_po_item AFTER INSERT OR UPDATE OR DELETE ON po_item
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

CREATE TRIGGER audit_cash_ledger AFTER INSERT OR UPDATE OR DELETE ON cash_ledger
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- GL table (append-only, but audit for completeness)
CREATE TRIGGER audit_gl_entry AFTER INSERT OR UPDATE OR DELETE ON gl_entry
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn();

-- ============================================================
-- 7. GL TRIGGER FUNCTIONS (Auto-posting)
-- ============================================================

-- Helper: Get COA for specific account types
CREATE OR REPLACE FUNCTION get_coa_kode(p_kode text)
RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT id FROM coa WHERE kode = p_kode AND aktif = true LIMIT 1;
$$;

-- GL posting for TX (Sales)
CREATE OR REPLACE FUNCTION gl_post_tx()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_coa_piutang uuid;
    v_coa_pendapatan uuid;
    v_coa_ppn_keluaran uuid;
    v_coa_hpp uuid;
    v_coa_persediaan uuid;
    v_coa_kas uuid;
BEGIN
    -- Get COA IDs (assuming standard codes exist)
    v_coa_piutang := get_coa_kode('1102'); -- Piutang Usaha
    v_coa_pendapatan := get_coa_kode('4101'); -- Pendapatan Penjualan
    v_coa_ppn_keluaran := get_coa_kode('2102'); -- PPN Keluaran
    v_coa_hpp := get_coa_kode('5101'); -- HPP
    v_coa_persediaan := get_coa_kode('1101'); -- Persediaan
    v_coa_kas := (SELECT coa_id FROM metode_bayar WHERE id = NEW.metode_bayar_id);

    -- 1. Kas/Bank Debit (total)
    INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
    VALUES (NEW.id, 'tx', v_coa_kas, NEW.total, 0, 'Penjualan ' || NEW.nomor, NEW.created_by);

    -- 2. Piutang / Pendapatan depends on payment method
    IF (SELECT kode FROM metode_bayar WHERE id = NEW.metode_bayar_id) ILIKE '%piutang%' THEN
        -- Piutang
        INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
        VALUES (NEW.id, 'tx', v_coa_piutang, NEW.total, 0, 'Piutang ' || NEW.nomor, NEW.created_by);
    ELSE
        -- Pendapatan (cash sale)
        INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
        VALUES (NEW.id, 'tx', v_coa_pendapatan, 0, NEW.subtotal, 'Pendapatan ' || NEW.nomor, NEW.created_by);

        -- PPN Keluaran
        IF NEW.ppn > 0 THEN
            INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
            VALUES (NEW.id, 'tx', v_coa_ppn_keluaran, 0, NEW.ppn, 'PPN Keluaran ' || NEW.nomor, NEW.created_by);
        END IF;
    END IF;

    -- 3. HPP & Persediaan (from tx_item)
    INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
    SELECT NEW.id, 'tx', v_coa_hpp, SUM(ti.hpp_snapshot * ti.qty), 0, 'HPP ' || NEW.nomor, NEW.created_by
    FROM tx_item ti WHERE ti.tx_header_id = NEW.id;

    INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
    SELECT NEW.id, 'tx', v_coa_persediaan, 0, SUM(ti.hpp_snapshot * ti.qty), 'Persediaan Keluar ' || NEW.nomor, NEW.created_by
    FROM tx_item ti WHERE ti.tx_header_id = NEW.id;

    RETURN NEW;
END; $$;

CREATE TRIGGER gl_tx_trigger AFTER INSERT ON tx_header
    FOR EACH ROW EXECUTE FUNCTION gl_post_tx();

-- GL posting for Cash Ledger
CREATE OR REPLACE FUNCTION gl_post_cash()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.arah = 'masuk' THEN
        INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
        VALUES (NEW.id, 'cash', NEW.coa_id, NEW.jumlah, 0, NEW.keterangan, NEW.created_by);
    ELSE
        INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by)
        VALUES (NEW.id, 'cash', NEW.coa_id, 0, NEW.jumlah, NEW.keterangan, NEW.created_by);
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER gl_cash_trigger AFTER INSERT ON cash_ledger
    FOR EACH ROW EXECUTE FUNCTION gl_post_cash();

-- ============================================================
-- 8. RPC FUNCTIONS
-- ============================================================

-- 8.1 ingest_jeking (JeKing CSV Ingest) - auth: ingestor role only
CREATE OR REPLACE FUNCTION ingest_jeking(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_header_id uuid;
    v_hash_asli text;
    v_external_ref text;
    v_hash_existing char(64);
    v_cabang_id uuid;
    v_pelanggan_id uuid;
    v_metode_bayar_id uuid;
    v_produk_id uuid;
BEGIN
    -- Extract and validate required fields
    v_hash_asli := p_payload->>'hash_asli';
    v_external_ref := p_payload->>'external_ref';

    IF v_hash_asli IS NULL OR v_external_ref IS NULL THEN
        RAISE EXCEPTION 'hash_asli dan external_ref wajib ada';
    END IF;

    -- Cek existing by external_ref
    SELECT id, hash_asli INTO v_header_id, v_hash_existing
    FROM tx_header
    WHERE external_ref = v_external_ref AND sumber = 'jeking';

    IF v_header_id IS NOT NULL THEN
        -- Same hash = NOOP, no audit row
        IF v_hash_existing = v_hash_asli THEN
            RETURN jsonb_build_object('status', 'NOOP', 'id', v_header_id);
        END IF;
        -- Different hash = CONFLICT, insert to ingest_conflict, never overwrite
        INSERT INTO ingest_conflict (external_ref, hash_asli, hash_existing, payload_new, payload_existing)
        VALUES (v_external_ref, v_hash_asli, v_hash_existing, p_payload,
                (SELECT to_jsonb(t) FROM tx_header t WHERE t.id = v_header_id));
        RETURN jsonb_build_object('status', 'CONFLICT', 'id', v_header_id);
    END IF;

    -- Resolve FKs
    SELECT id INTO v_cabang_id FROM cabang WHERE kode = (p_payload->>'cabang') LIMIT 1;
    IF v_cabang_id IS NULL THEN RAISE EXCEPTION 'Cabang tidak ditemukan: %', p_payload->>'cabang'; END IF;

    SELECT id INTO v_pelanggan_id FROM pelanggan WHERE kode = (p_payload->>'pelanggan_kode') LIMIT 1;
    IF v_pelanggan_id IS NULL THEN RAISE EXCEPTION 'Pelanggan tidak ditemukan: %', p_payload->>'pelanggan_kode'; END IF;

    SELECT id INTO v_metode_bayar_id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1;
    IF v_metode_bayar_id IS NULL THEN RAISE EXCEPTION 'Metode bayar tidak ditemukan: %', p_payload->>'metode_bayar'; END IF;

    -- Insert header
    INSERT INTO tx_header (external_ref, sumber, hash_asli, cabang_id, tanggal, nomor,
                           pelanggan_id, metode_bayar_id, subtotal, ppn, total,
                           status_bayar, status_logistik, created_by)
    VALUES (v_external_ref, 'jeking', v_hash_asli, v_cabang_id,
            (p_payload->>'tanggal')::date, p_payload->>'nomor',
            v_pelanggan_id, v_metode_bayar_id,
            (p_payload->>'subtotal')::numeric, (p_payload->>'ppn')::numeric, (p_payload->>'total')::numeric,
            'Lunas', 'Selesai', current_setting('app.service_uid')::uuid)
    RETURNING id INTO v_header_id;

    -- Insert items
    INSERT INTO tx_item (tx_header_id, produk_id, qty, harga, diskon, ppn, hpp_snapshot, subtotal)
    SELECT v_header_id, p.id,
           (item->>'qty')::numeric, (item->>'harga')::numeric,
           COALESCE((item->>'diskon')::numeric, 0), (item->>'ppn')::numeric,
           p.hpp, ((item->>'qty')::numeric * (item->>'harga')::numeric)
    FROM jsonb_array_elements(p_payload->'items') item
    JOIN produk p ON p.sku = item->>'produk_sku';

    -- Insert cash_ledger (kas masuk)
    INSERT INTO cash_ledger (external_ref, sumber, hash_asli, cabang_id, tanggal, coa_id, metode_bayar_id,
                             arah, jumlah, keterangan, ref_tipe, ref_id, created_by)
    VALUES (v_external_ref, 'jeking', v_hash_asli, v_cabang_id,
            (p_payload->>'tanggal')::date,
            (SELECT coa_id FROM metode_bayar WHERE id = v_metode_bayar_id),
            v_metode_bayar_id,
            'masuk', (p_payload->>'total')::numeric,
            'Penjualan ' || v_external_ref, 'tx', v_header_id, current_setting('app.service_uid')::uuid);

    RETURN jsonb_build_object('status', 'OK', 'id', v_header_id);
END; $$;

-- 8.2 create_tx_manual (Manual Sales Entry) - auth: authenticated
CREATE OR REPLACE FUNCTION create_tx_manual(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_header_id uuid;
    v_hash_asli text;
    v_external_ref text;
    v_cabang_id uuid;
    v_pelanggan_id uuid;
    v_metode_bayar_id uuid;
    v_tax_mode text;
    v_ppn_rate numeric;
BEGIN
    v_hash_asli := p_payload->>'hash_asli';
    v_external_ref := p_payload->>'external_ref';
    v_tax_mode := COALESCE(p_payload->>'tax_mode', 'EXCLUDE');
    v_ppn_rate := COALESCE((p_payload->>'ppn_rate')::numeric, 0.11);

    IF v_hash_asli IS NULL OR v_external_ref IS NULL THEN
        RAISE EXCEPTION 'hash_asli dan external_ref wajib ada';
    END IF;

    -- Resolve FKs
    SELECT id INTO v_cabang_id FROM cabang WHERE kode = (p_payload->>'cabang') LIMIT 1;
    SELECT id INTO v_pelanggan_id FROM pelanggan WHERE kode = (p_payload->>'pelanggan_kode') LIMIT 1;
    SELECT id INTO v_metode_bayar_id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1;

    -- Calculate totals based on tax_mode
    -- Items are in p_payload->'items' array
    -- For simplicity, expect subtotal, ppn, total pre-calculated in payload

    INSERT INTO tx_header (external_ref, sumber, hash_asli, cabang_id, tanggal, nomor,
                           pelanggan_id, metode_bayar_id, subtotal, ppn, total,
                           status_bayar, status_logistik, created_by)
    VALUES (v_external_ref, 'manual', v_hash_asli, v_cabang_id,
            (p_payload->>'tanggal')::date, p_payload->>'nomor',
            v_pelanggan_id, v_metode_bayar_id,
            (p_payload->>'subtotal')::numeric, (p_payload->>'ppn')::numeric, (p_payload->>'total')::numeric,
            COALESCE(p_payload->>'status_bayar', 'Lunas'), COALESCE(p_payload->>'status_logistik', 'Selesai'),
            current_setting('app.service_uid')::uuid)
    RETURNING id INTO v_header_id;

    INSERT INTO tx_item (tx_header_id, produk_id, qty, harga, diskon, ppn, hpp_snapshot, subtotal)
    SELECT v_header_id, p.id,
           (item->>'qty')::numeric, (item->>'harga')::numeric,
           COALESCE((item->>'diskon')::numeric, 0), (item->>'ppn')::numeric,
           p.hpp, ((item->>'qty')::numeric * (item->>'harga')::numeric)
    FROM jsonb_array_elements(p_payload->'items') item
    JOIN produk p ON p.sku = item->>'produk_sku';

    INSERT INTO cash_ledger (external_ref, sumber, hash_asli, cabang_id, tanggal, coa_id, metode_bayar_id,
                             arah, jumlah, keterangan, ref_tipe, ref_id, created_by)
    VALUES (v_external_ref, 'manual', v_hash_asli, v_cabang_id,
            (p_payload->>'tanggal')::date,
            (SELECT coa_id FROM metode_bayar WHERE id = v_metode_bayar_id),
            v_metode_bayar_id,
            'masuk', (p_payload->>'total')::numeric,
            'Penjualan Manual ' || v_external_ref, 'tx', v_header_id, current_setting('app.service_uid')::uuid);

    RETURN jsonb_build_object('status', 'OK', 'id', v_header_id);
END; $$;

-- 8.3 void_tx (Void Transaction) - auth: authenticated, Admin+
CREATE OR REPLACE FUNCTION void_tx(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_tx tx_header;
    v_reversal_id uuid;
BEGIN
    SELECT * INTO v_tx FROM tx_header WHERE id = p_id;
    IF v_tx IS NULL THEN RAISE EXCEPTION 'Transaksi tidak ditemukan'; END IF;
    IF v_tx.void THEN RAISE EXCEPTION 'Transaksi sudah di-void'; END IF;

    -- Set void flag
    UPDATE tx_header SET void = true, void_alasan = p_alasan, void_oleh = current_setting('app.service_uid')::uuid, void_pada = now()
    WHERE id = p_id;

    -- Insert reversal GL entries (debit/credit flipped)
    INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by, reversal_of)
    SELECT p_id, 'tx', ge.coa_id, ge.kredit, ge.debit, 'REVERSAL: ' || ge.memo, current_setting('app.service_uid')::uuid, ge.id
    FROM gl_entry ge WHERE ge.tx_id = p_id AND ge.tx_tipe = 'tx';

    -- Also reverse cash_ledger if exists
    INSERT INTO gl_entry (tx_id, tx_tipe, coa_id, debit, kredit, memo, created_by, reversal_of)
    SELECT cl.id, 'cash', ge.coa_id, ge.kredit, ge.debit, 'REVERSAL: ' || ge.memo, current_setting('app.service_uid')::uuid, ge.id
    FROM gl_entry ge
    JOIN cash_ledger cl ON cl.id = ge.tx_id
    WHERE ge.tx_id = cl.id AND ge.tx_tipe = 'cash' AND cl.ref_id = p_id;

    RETURN jsonb_build_object('status', 'VOIDED', 'id', p_id);
END; $$;

-- 8.4 create_cash_manual (Manual Cash Entry) - auth: authenticated
CREATE OR REPLACE FUNCTION create_cash_manual(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_id uuid;
    v_hash_asli text;
    v_external_ref text;
    v_cabang_id uuid;
    v_coa_id uuid;
    v_metode_bayar_id uuid;
BEGIN
    v_hash_asli := p_payload->>'hash_asli';
    v_external_ref := p_payload->>'external_ref';

    IF v_hash_asli IS NULL OR v_external_ref IS NULL THEN
        RAISE EXCEPTION 'hash_asli dan external_ref wajib ada';
    END IF;

    SELECT id INTO v_cabang_id FROM cabang WHERE kode = (p_payload->>'cabang') LIMIT 1;
    SELECT id INTO v_metode_bayar_id FROM metode_bayar WHERE kode = (p_payload->>'metode_bayar') LIMIT 1;
    v_coa_id := (SELECT coa_id FROM metode_bayar WHERE id = v_metode_bayar_id);

    INSERT INTO cash_ledger (external_ref, sumber, hash_asli, cabang_id, tanggal, coa_id, metode_bayar_id,
                             arah, jumlah, keterangan, ref_tipe, ref_id, created_by)
    VALUES (v_external_ref, 'manual', v_hash_asli, v_cabang_id,
            (p_payload->>'tanggal')::date, v_coa_id, v_metode_bayar_id,
            (p_payload->>'arah')::arah_kas, (p_payload->>'jumlah')::numeric,
            p_payload->>'keterangan', 'manual', NULL, current_setting('app.service_uid')::uuid)
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('status', 'OK', 'id', v_id);
END; $$;

-- 8.5 Settings CRUD via RPC (all mutations through RPC for audit)
-- COA
CREATE OR REPLACE FUNCTION create_coa(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; BEGIN
    INSERT INTO coa (kode, nama, tipe, induk_id, aktif)
    VALUES (p_payload->>'kode', p_payload->>'nama', (p_payload->>'tipe')::coa_tipe,
            CASE WHEN p_payload->>'induk_kode' IS NOT NULL THEN (SELECT id FROM coa WHERE kode = p_payload->>'induk_kode') END,
            COALESCE((p_payload->>'aktif')::boolean, true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'OK', 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION update_coa(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE coa SET nama = p_payload->>'nama', tipe = (p_payload->>'tipe')::coa_tipe,
           induk_id = CASE WHEN p_payload->>'induk_kode' IS NOT NULL THEN (SELECT id FROM coa WHERE kode = p_payload->>'induk_kode') END,
           aktif = COALESCE((p_payload->>'aktif')::boolean, true),
           updated_at = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('status', 'OK');
END; $$;

CREATE OR REPLACE FUNCTION void_coa(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE coa SET aktif = false WHERE id = p_id;
    RETURN jsonb_build_object('status', 'VOIDED');
END; $$;

-- Metode Bayar
CREATE OR REPLACE FUNCTION create_metode_bayar(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; BEGIN
    INSERT INTO metode_bayar (kode, nama, coa_id, aktif)
    VALUES (p_payload->>'kode', p_payload->>'nama', (SELECT id FROM coa WHERE kode = p_payload->>'coa_kode'),
            COALESCE((p_payload->>'aktif')::boolean, true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'OK', 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION update_metode_bayar(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE metode_bayar SET nama = p_payload->>'nama',
           coa_id = (SELECT id FROM coa WHERE kode = p_payload->>'coa_kode'),
           aktif = COALESCE((p_payload->>'aktif')::boolean, true)
    WHERE id = p_id;
    RETURN jsonb_build_object('status', 'OK');
END; $$;

CREATE OR REPLACE FUNCTION void_metode_bayar(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE metode_bayar SET aktif = false WHERE id = p_id;
    RETURN jsonb_build_object('status', 'VOIDED');
END; $$;

-- Produk
CREATE OR REPLACE FUNCTION create_produk(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; BEGIN
    INSERT INTO produk (sku, nama, satuan, hpp, aktif)
    VALUES (p_payload->>'sku', p_payload->>'nama', p_payload->>'satuan',
            COALESCE((p_payload->>'hpp')::numeric, 0), COALESCE((p_payload->>'aktif')::boolean, true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'OK', 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION update_produk(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE produk SET nama = p_payload->>'nama', satuan = p_payload->>'satuan',
           hpp = COALESCE((p_payload->>'hpp')::numeric, hpp),
           aktif = COALESCE((p_payload->>'aktif')::boolean, true),
           updated_at = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('status', 'OK');
END; $$;

CREATE OR REPLACE FUNCTION void_produk(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE produk SET aktif = false WHERE id = p_id;
    RETURN jsonb_build_object('status', 'VOIDED');
END; $$;

-- Pelanggan
CREATE OR REPLACE FUNCTION create_pelanggan(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; BEGIN
    INSERT INTO pelanggan (kode, nama, telepon, aktif)
    VALUES (p_payload->>'kode', p_payload->>'nama', p_payload->>'telepon', COALESCE((p_payload->>'aktif')::boolean, true))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('status', 'OK', 'id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION update_pelanggan(p_id uuid, p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE pelanggan SET nama = p_payload->>'nama', telepon = p_payload->>'telepon',
           aktif = COALESCE((p_payload->>'aktif')::boolean, true), updated_at = now()
    WHERE id = p_id;
    RETURN jsonb_build_object('status', 'OK');
END; $$;

CREATE OR REPLACE FUNCTION void_pelanggan(p_id uuid, p_alasan text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    UPDATE pelanggan SET aktif = false WHERE id = p_id;
    RETURN jsonb_build_object('status', 'VOIDED');
END; $$;

-- ============================================================
-- 9. HELPER VIEWS (for Dashboard)
-- ============================================================

-- GL Balance per COA
CREATE OR REPLACE VIEW v_gl_balance AS
SELECT
    coa_id,
    SUM(debit) - SUM(kredit) AS saldo,
    SUM(debit) AS total_debit,
    SUM(kredit) AS total_kredit
FROM gl_entry
WHERE reversal_of IS NULL -- Exclude reversals from balance
GROUP BY coa_id;

-- Trial Balance
CREATE OR REPLACE VIEW v_trial_balance AS
SELECT
    c.kode,
    c.nama,
    c.tipe,
    COALESCE(b.saldo, 0) AS saldo
FROM coa c
LEFT JOIN v_gl_balance b ON b.coa_id = c.id
WHERE c.aktif = true
ORDER BY c.kode;

-- P&L (Profit & Loss)
CREATE OR REPLACE VIEW v_pl AS
SELECT
    c.tipe,
    SUM(CASE WHEN c.tipe = 'Pendapatan' THEN b.saldo ELSE 0 END) AS pendapatan,
    SUM(CASE WHEN c.tipe = 'Beban' THEN b.saldo ELSE 0 END) AS beban
FROM coa c
JOIN v_gl_balance b ON b.coa_id = c.id
WHERE c.tipe IN ('Pendapatan', 'Beban')
GROUP BY c.tipe;

-- Stock On Hand
CREATE OR REPLACE VIEW v_stock_on_hand AS
SELECT
    p.id AS produk_id,
    p.sku,
    p.nama,
    p.satuan,
    COALESCE(SUM(CASE WHEN ti.tx_header_id IS NOT NULL THEN ti.qty ELSE 0 END), 0) AS qty_keluar,
    COALESCE(SUM(CASE WHEN pi.po_header_id IS NOT NULL THEN pi.qty ELSE 0 END), 0) AS qty_masuk,
    (COALESCE(SUM(CASE WHEN pi.po_header_id IS NOT NULL THEN pi.qty ELSE 0 END), 0) -
     COALESCE(SUM(CASE WHEN ti.tx_header_id IS NOT NULL THEN ti.qty ELSE 0 END), 0)) AS stok_tersedia
FROM produk p
LEFT JOIN tx_item ti ON ti.produk_id = p.id
LEFT JOIN tx_header th ON th.id = ti.tx_header_id AND th.void = false
LEFT JOIN po_item pi ON pi.produk_id = p.id
LEFT JOIN po_header ph ON ph.id = pi.po_header_id AND ph.void = false AND ph.status_logistik = 'Diterima'
GROUP BY p.id, p.sku, p.nama, p.satuan;

-- ============================================================
-- 10. SEED DATA (Default Cabang)
-- ============================================================

INSERT INTO cabang (kode, nama) VALUES ('PUSAT', 'Cabang Pusat') ON CONFLICT (kode) DO NOTHING;

-- Note: COA, Metode Bayar, Produk, Pelanggan seeded via Settings UI or manual SQL

-- ============================================================
-- 11. GRANTS FOR INGESTOR ROLE (Documentation - run manually in Supabase Dashboard)
-- ============================================================

-- Create role ingestor (run once in Supabase Dashboard or via psql)
-- CREATE ROLE ingestor NOINHERIT;
-- GRANT USAGE ON SCHEMA public TO ingestor;
-- GRANT SELECT, INSERT ON tx_header, tx_item, cash_ledger, ingest_conflict TO ingestor;
-- GRANT SELECT ON cabang, pelanggan, produk, metode_bayar TO ingestor;
-- GRANT EXECUTE ON FUNCTION ingest_jeking(jsonb) TO ingestor;

-- RLS Policies for ingestor (applied after role creation)
-- ALTER TABLE tx_header ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ingestor_tx_header ON tx_header FOR ALL TO ingestor USING (true) WITH CHECK (sumber = 'jeking');
-- Similar for tx_item, cash_ledger, ingest_conflict