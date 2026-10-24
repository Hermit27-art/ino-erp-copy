// ==========================================
// DOMAIN: Void & Retur Pure Functions
// ==========================================
// Fungsi murni untuk logika void/retur tanpa side effects
// Bisa di-test secara independen tanpa GAS/localStorage

// Type definitions
export interface StockItem {
  sku: string;
  qty: number;
}

export interface CashEntry {
  id: string;
  tanggal: string;
  ref: string;
  keterangan: string;
  kategori: string;
  debit: number;
  kredit: number;
  saldo: number;
  akun: string;
  metode: string;
}

export interface VoidLogEntry {
  id: string;
  tanggal: string;
  docType: 'SO' | 'PO' | 'CSH';
  docId: string;
  kasir: string;
  nilai: number;
  alasan: string;
  timestamp: string;
  _hash?: string;
}

export interface AdjustResult {
  success: boolean;
  message?: string;
}

/**
 * Validasi apakah bisa void berdasarkan status
 */
export function canVoidDocument(
  statusLogistik: string,
  statusBayar: string
): { allowed: boolean; reason?: string } {
  if (statusLogistik === 'Void' || statusBayar === 'Void') {
    return { allowed: false, reason: 'Dokumen sudah di-void' };
  }
  return { allowed: true };
}

/**
 * Hitung pengembalian stok untuk void PO
 * PO yang sudah 'Diterima' -> stok perlu dikurangi
 */
export function calculatePoVoidStockReversal(
  poItems: Array<{ sku: string; qty: number; qtyReceived?: number }>,
  statusLogistik: string
): StockItem[] {
  if (statusLogistik !== 'Diterima') {
    return [];
  }

  return poItems.map(item => ({
    sku: item.sku,
    qty: -(item.qtyReceived || item.qty) // negatif = kurangi stok
  }));
}

/**
 * Hitung pengembalian stok untuk void SO
 * SO yang sudah 'Selesai'/'Terkirim' -> stok perlu dikembalikan
 */
export function calculateSoVoidStockReversal(
  soItems: Array<{ sku: string; qty: number; qtyShipped?: number }>,
  statusLogistik: string
): StockItem[] {
  if (statusLogistik === 'Draft' || statusLogistik === 'Void') {
    return [];
  }

  // SO yang sudah rilis/kirim -> kembalikan stok
  return soItems.map(item => ({
    sku: item.sku,
    qty: item.qtyShipped || item.qty // positif = tambah stok
  }));
}

/**
 * Hitung koreksi piutang/hutang untuk void
 */
export function calculateVoidBalanceAdjustment(
  docType: 'SO' | 'PO',
  statusBayar: string,
  grandTotal: number,
  customerId?: string,
  supplierId?: string
): {
  type: 'customer' | 'supplier';
  id: string;
  amount: number; // negatif = kurangi piutang/hutang
} | null {
  if (docType === 'SO') {
    if (statusBayar === 'Belum Lunas' && customerId) {
      return { type: 'customer', id: customerId, amount: -grandTotal };
    }
  } else if (docType === 'PO') {
    if (statusBayar === 'Belum Dibayar' && supplierId) {
      return { type: 'supplier', id: supplierId, amount: -grandTotal };
    }
  }
  return null;
}

/**
 * Hitung entri kas untuk void transaksi tunai
 */
export function calculateVoidCashReversal(
  docType: 'SO' | 'PO',
  statusBayar: string,
  metode: string,
  grandTotal: number,
  docId: string,
  tanggal: string,
  pelanggan: string
): Omit<CashEntry, 'id' | 'saldo'> | null {
  const isCash = metode.toLowerCase().includes('tunai') || metode.toLowerCase().includes('cash');
  if (!isCash || statusBayar !== 'Lunas') {
    return null;
  }

  if (docType === 'SO') {
    // SO tunai yang di-void -> catat kredit (kas keluar)
    return {
      tanggal,
      ref: docId,
      keterangan: `Void Penjualan Tunai [${docId}] dari ${pelanggan}`,
      kategori: 'Void',
      debit: 0,
      kredit: grandTotal,
      akun: 'Kas Tunai',
      metode: 'Tunai'
    };
  } else if (docType === 'PO') {
    // PO tunai yang di-void -> catat debit (kas masuk kembali)
    return {
      tanggal,
      ref: docId,
      keterangan: `Void Pembelian Tunai [${docId}] ke Supplier`,
      kategori: 'Void',
      debit: grandTotal,
      kredit: 0,
      akun: 'Kas Tunai',
      metode: 'Tunai'
    };
  }
  return null;
}

/**
 * Generate Void Log entry
 */
export function generateVoidLog(
  docType: 'SO' | 'PO' | 'CSH',
  docId: string,
  kasir: string,
  nilai: number,
  alasan: string,
  tanggal: string
): Omit<VoidLogEntry, '_hash'> {
  return {
    id: `VOID-${tanggal.replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    tanggal,
    docType,
    docId,
    kasir,
    nilai,
    alasan,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validasi retur: hanya dokumen lunas & status logistik selesai
 */
export function canReturDocument(
  statusLogistik: string,
  statusBayar: string
): { allowed: boolean; reason?: string } {
  if (statusLogistik === 'Void' || statusBayar === 'Void') {
    return { allowed: false, reason: 'Dokumen sudah di-void, tidak bisa retur' };
  }
  if (statusLogistik !== 'Selesai' && statusLogistik !== 'Diterima') {
    return { allowed: false, reason: 'Hanya dokumen selesai/diterima yang bisa di-retur' };
  }
  if (statusBayar !== 'Lunas') {
    return { allowed: false, reason: 'Hanya dokumen lunas yang bisa di-retur (refund/kredit)' };
  }
  return { allowed: true };
}

/**
 * Hitung item yang bisa di-retur (qty dikurangi qtyReturned)
 */
export function calculateReturableQty(
  items: Array<{
    sku: string;
    nama: string;
    qty: number;
    qtyShipped?: number;
    qtyReceived?: number;
    qtyReturned?: number;
    harga: number;
    hpp?: number;
  }>
): Array<{
  sku: string;
  nama: string;
  qtyMax: number;
  harga: number;
  hpp: number;
}> {
  return items.map(item => {
    const qtyDelivered = item.qtyShipped || item.qtyReceived || item.qty;
    const qtyReturned = item.qtyReturned || 0;
    return {
      sku: item.sku,
      nama: item.nama,
      qtyMax: Math.max(0, qtyDelivered - qtyReturned),
      harga: item.harga,
      hpp: item.hpp || 0
    };
  }).filter(item => item.qtyMax > 0);
}

/**
 * Hitung retur: stok, piutang/hutang, kas
 */
export interface ReturCalculation {
  stockReversal: StockItem[];
  balanceAdjustment: { type: 'customer' | 'supplier'; id: string; amount: number } | null;
  cashEntry: Omit<CashEntry, 'id' | 'saldo'> | null;
  totalRefund: number;
}

export function calculateRetur(
  docType: 'SO' | 'PO',
  items: Array<{
    sku: string;
    nama: string;
    qty: number;
    qtyShipped?: number;
    qtyReceived?: number;
    qtyReturned?: number;
    harga: number;
    hpp?: number;
  }>,
  returnItems: Array<{ sku: string; qty: number }>, // item yang di-retur
  statusLogistik: string,
  statusBayar: string,
  metode: string,
  customerId?: string,
  supplierId?: string,
  grandTotal?: number,
  pelanggan?: string,
  tanggal?: string,
  docId?: string
): ReturCalculation {
  const validation = canReturDocument(statusLogistik, statusBayar);
  if (!validation.allowed) {
    throw new Error(validation.reason || 'Tidak bisa retur');
  }

  const returable = calculateReturableQty(items);
  const returnMap = new Map(returnItems.map(r => [r.sku, r.qty]));

  // Validasi qty retur tidak melebihi yang bisa di-retur
  for (const item of returnItems) {
    const returableItem = returable.find(r => r.sku === item.sku);
    if (!returableItem || item.qty > returableItem.qtyMax) {
      throw new Error(`Qty retur melebihi batas untuk ${item.sku} (max: ${returableItem?.qtyMax || 0})`);
    }
  }

  // 1. Stok: kembalikan untuk SO, kurangi untuk PO
  const stockReversal: StockItem[] = returnItems.map(item => {
    const returableItem = returable.find(r => r.sku === item.sku)!;
    return {
      sku: item.sku,
      qty: docType === 'SO' ? item.qty : -item.qty
    };
  });

  // 2. Total refund
  const totalRefund = returnItems.reduce((sum, item) => {
    const returableItem = returable.find(r => r.sku === item.sku)!;
    return sum + (item.qty * returableItem.harga);
  }, 0);

  // 3. Piutang/Hutang
  let balanceAdjustment = null;
  if (docType === 'SO' && customerId) {
    balanceAdjustment = { type: 'customer', id: customerId, amount: -totalRefund };
  } else if (docType === 'PO' && supplierId) {
    balanceAdjustment = { type: 'supplier', id: supplierId, amount: -totalRefund };
  }

  // 4. Kas (refund tunai)
  let cashEntry = null;
  const isCash = metode.toLowerCase().includes('tunai') || metode.toLowerCase().includes('cash');
  if (isCash && totalRefund > 0 && tanggal && docId && pelanggan) {
    if (docType === 'SO') {
      // SO retur -> kas keluar (kredit)
      cashEntry = {
        tanggal,
        ref: `RETUR-${docId}`,
        keterangan: `Retur Penjualan [${docId}] dari ${pelanggan}`,
        kategori: 'Retur',
        debit: 0,
        kredit: totalRefund,
        akun: 'Kas Tunai',
        metode: 'Tunai'
      };
    } else if (docType === 'PO') {
      // PO retur -> kas masuk (debit)
      cashEntry = {
        tanggal,
        ref: `RETUR-${docId}`,
        keterangan: `Retur Pembelian [${docId}] ke Supplier`,
        kategori: 'Retur',
        debit: totalRefund,
        kredit: 0,
        akun: 'Kas Tunai',
        metode: 'Tunai'
      };
    }
  }

  return {
    stockReversal,
    balanceAdjustment,
    cashEntry,
    totalRefund
  };
}

/**
 * Update item qtyReturned
 */
export function updateItemQtyReturned(
  items: Array<{ sku: string; qtyReturned?: number }>,
  returnItems: Array<{ sku: string; qty: number }>
): Array<{ sku: string; qtyReturned: number }> {
  const returnMap = new Map(returnItems.map(r => [r.sku, r.qty]));
  return items.map(item => ({
    ...item,
    qtyReturned: (item.qtyReturned || 0) + (returnMap.get(item.sku) || 0)
  }));
}

/**
 * Tentukan status logistik baru setelah retur
 */
export function calculateNewStatusAfterRetur(
  currentStatus: string,
  items: Array<{ qty: number; qtyShipped?: number; qtyReceived?: number; qtyReturned?: number }>,
  returnItems: Array<{ sku: string; qty: number }>
): string {
  const returnMap = new Map(returnItems.map(r => [r.sku, r.qty]));

  let totalDelivered = 0;
  let totalReturned = 0;

  for (const item of items) {
    const delivered = item.qtyShipped || item.qtyReceived || item.qty;
    const returned = (item.qtyReturned || 0) + (returnMap.get(item.sku) || 0);
    totalDelivered += delivered;
    totalReturned += returned;
  }

  if (totalReturned >= totalDelivered) {
    return 'Retur Penuh';
  } else if (totalReturned > 0) {
    return 'Retur Sebagian';
  }
  return currentStatus;
}