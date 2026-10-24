// ==========================================
// DOMAIN TESTS: Void & Retur Pure Functions
// ==========================================

import {
  canVoidDocument,
  calculatePoVoidStockReversal,
  calculateSoVoidStockReversal,
  calculateVoidBalanceAdjustment,
  calculateVoidCashReversal,
  generateVoidLog,
  canReturDocument,
  calculateReturableQty,
  calculateRetur,
  updateItemQtyReturned,
  calculateNewStatusAfterRetur
} from './voidRetur';

describe('Void Functions', () => {
  describe('canVoidDocument', () => {
    it('should allow void for active document', () => {
      const result = canVoidDocument('Selesai', 'Lunas');
      expect(result.allowed).toBe(true);
    });

    it('should reject void for already void document', () => {
      const result = canVoidDocument('Void', 'Void');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Dokumen sudah di-void');
    });

    it('should reject void if statusLogistik is Void', () => {
      const result = canVoidDocument('Void', 'Lunas');
      expect(result.allowed).toBe(false);
    });

    it('should reject void if statusBayar is Void', () => {
      const result = canVoidDocument('Selesai', 'Void');
      expect(result.allowed).toBe(false);
    });
  });

  describe('calculatePoVoidStockReversal', () => {
    it('should return empty array for non-Diterima PO', () => {
      const items = [{ sku: 'SKU001', qty: 10, qtyReceived: 10 }];
      const result = calculatePoVoidStockReversal(items, 'DIPESAN');
      expect(result).toEqual([]);
    });

    it('should return negative qty for Diterima PO', () => {
      const items = [
        { sku: 'SKU001', qty: 10, qtyReceived: 10 },
        { sku: 'SKU002', qty: 5, qtyReceived: 3 }
      ];
      const result = calculatePoVoidStockReversal(items, 'Diterima');
      expect(result).toEqual([
        { sku: 'SKU001', qty: -10 },
        { sku: 'SKU002', qty: -3 }
      ]);
    });

    it('should use qtyReceived when available', () => {
      const items = [{ sku: 'SKU001', qty: 10, qtyReceived: 8 }];
      const result = calculatePoVoidStockReversal(items, 'Diterima');
      expect(result).toEqual([{ sku: 'SKU001', qty: -8 }]);
    });
  });

  describe('calculateSoVoidStockReversal', () => {
    it('should return empty array for Draft SO', () => {
      const items = [{ sku: 'SKU001', qty: 10 }];
      const result = calculateSoVoidStockReversal(items, 'Draft');
      expect(result).toEqual([]);
    });

    it('should return positive qty for Selesai SO', () => {
      const items = [
        { sku: 'SKU001', qty: 10, qtyShipped: 10 },
        { sku: 'SKU002', qty: 5, qtyShipped: 3 }
      ];
      const result = calculateSoVoidStockReversal(items, 'Selesai');
      expect(result).toEqual([
        { sku: 'SKU001', qty: 10 },
        { sku: 'SKU002', qty: 3 }
      ]);
    });

    it('should use qtyShipped when available', () => {
      const items = [{ sku: 'SKU001', qty: 10, qtyShipped: 8 }];
      const result = calculateSoVoidStockReversal(items, 'Terkirim');
      expect(result).toEqual([{ sku: 'SKU001', qty: 8 }]);
    });

    it('should fall back to qty when qtyShipped not set', () => {
      const items = [{ sku: 'SKU001', qty: 10 }];
      const result = calculateSoVoidStockReversal(items, 'Selesai');
      expect(result).toEqual([{ sku: 'SKU001', qty: 10 }]);
    });
  });

  describe('calculateVoidBalanceAdjustment', () => {
    it('should return customer adjustment for SO with Belum Lunas', () => {
      const result = calculateVoidBalanceAdjustment('SO', 'Belum Lunas', 100000, 'CUST001');
      expect(result).toEqual({
        type: 'customer',
        id: 'CUST001',
        amount: -100000
      });
    });

    it('should return supplier adjustment for PO with Belum Dibayar', () => {
      const result = calculateVoidBalanceAdjustment('PO', 'Belum Dibayar', 50000, undefined, 'SUP001');
      expect(result).toEqual({
        type: 'supplier',
        id: 'SUP001',
        amount: -50000
      });
    });

    it('should return null for Lunas SO', () => {
      const result = calculateVoidBalanceAdjustment('SO', 'Lunas', 100000, 'CUST001');
      expect(result).toBeNull();
    });

    it('should return null for Lunas PO', () => {
      const result = calculateVoidBalanceAdjustment('PO', 'Lunas', 50000, undefined, 'SUP001');
      expect(result).toBeNull();
    });

    it('should return null if no customerId for SO', () => {
      const result = calculateVoidBalanceAdjustment('SO', 'Belum Lunas', 100000);
      expect(result).toBeNull();
    });
  });

  describe('calculateVoidCashReversal', () => {
    it('should return cash reversal for SO tunai', () => {
      const result = calculateVoidCashReversal('SO', 'Lunas', 'Tunai', 100000, 'SO001', '2024-01-15', 'Customer A');
      expect(result).toEqual({
        tanggal: '2024-01-15',
        ref: 'SO001',
        keterangan: 'Void Penjualan Tunai [SO001] dari Customer A',
        kategori: 'Void',
        debit: 0,
        kredit: 100000,
        akun: 'Kas Tunai',
        metode: 'Tunai'
      });
    });

    it('should return cash reversal for PO tunai', () => {
      const result = calculateVoidCashReversal('PO', 'Lunas', 'Tunai', 50000, 'PO001', '2024-01-15', 'Supplier A');
      expect(result).toEqual({
        tanggal: '2024-01-15',
        ref: 'PO001',
        keterangan: 'Void Pembelian Tunai [PO001] ke Supplier',
        kategori: 'Void',
        debit: 50000,
        kredit: 0,
        akun: 'Kas Tunai',
        metode: 'Tunai'
      });
    });

    it('should return null for non-tunai', () => {
      const result = calculateVoidCashReversal('SO', 'Lunas', 'Transfer', 100000, 'SO001', '2024-01-15', 'Customer A');
      expect(result).toBeNull();
    });

    it('should return null for non-Lunas', () => {
      const result = calculateVoidCashReversal('SO', 'Belum Lunas', 'Tunai', 100000, 'SO001', '2024-01-15', 'Customer A');
      expect(result).toBeNull();
    });
  });

  describe('generateVoidLog', () => {
    it('should generate void log with correct structure', () => {
      const log = generateVoidLog('SO', 'SO001', 'Kasir A', 100000, 'Error input', '2024-01-15');
      expect(log.id).toMatch(/^VOID-20240115-[A-Z0-9]{8}$/);
      expect(log.tanggal).toBe('2024-01-15');
      expect(log.docType).toBe('SO');
      expect(log.docId).toBe('SO001');
      expect(log.kasir).toBe('Kasir A');
      expect(log.nilai).toBe(100000);
      expect(log.alasan).toBe('Error input');
      expect(log.timestamp).toBeDefined();
    });
  });
});

describe('Retur Functions', () => {
  describe('canReturDocument', () => {
    it('should allow retur for Selesai + Lunas', () => {
      const result = canReturDocument('Selesai', 'Lunas');
      expect(result.allowed).toBe(true);
    });

    it('should allow retur for Diterima + Lunas (PO)', () => {
      const result = canReturDocument('Diterima', 'Lunas');
      expect(result.allowed).toBe(true);
    });

    it('should reject retur for Void document', () => {
      const result = canReturDocument('Void', 'Lunas');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Dokumen sudah di-void, tidak bisa retur');
    });

    it('should reject retur for non-Selesai', () => {
      const result = canReturDocument('Draft', 'Lunas');
      expect(result.allowed).toBe(false);
    });

    it('should reject retur for non-Lunas', () => {
      const result = canReturDocument('Selesai', 'Belum Lunas');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Hanya dokumen lunas yang bisa di-retur (refund/kredit)');
    });
  });

  describe('calculateReturableQty', () => {
    it('should calculate max returable qty', () => {
      const items = [
        { sku: 'SKU001', nama: 'Item 1', qty: 10, qtyShipped: 10, qtyReturned: 2, harga: 1000, hpp: 500 },
        { sku: 'SKU002', nama: 'Item 2', qty: 5, qtyShipped: 5, qtyReturned: 0, harga: 2000, hpp: 1000 }
      ];
      const result = calculateReturableQty(items);
      expect(result).toEqual([
        { sku: 'SKU001', nama: 'Item 1', qtyMax: 8, harga: 1000, hpp: 500 },
        { sku: 'SKU002', nama: 'Item 2', qtyMax: 5, harga: 2000, hpp: 1000 }
      ]);
    });

    it('should filter out items with qtyMax = 0', () => {
      const items = [
        { sku: 'SKU001', nama: 'Item 1', qty: 10, qtyShipped: 10, qtyReturned: 10, harga: 1000 },
        { sku: 'SKU002', nama: 'Item 2', qty: 5, qtyShipped: 5, qtyReturned: 0, harga: 2000 }
      ];
      const result = calculateReturableQty(items);
      expect(result).toHaveLength(1);
      expect(result[0].sku).toBe('SKU002');
    });
  });

  describe('calculateRetur', () => {
    const baseItems = [
      { sku: 'SKU001', nama: 'Item 1', qty: 10, qtyShipped: 10, qtyReturned: 0, harga: 1000, hpp: 500 },
      { sku: 'SKU002', nama: 'Item 2', qty: 5, qtyShipped: 5, qtyReturned: 0, harga: 2000, hpp: 1000 }
    ];

    it('should calculate SO retur correctly', () => {
      const returnItems = [{ sku: 'SKU001', qty: 3 }];
      const result = calculateRetur('SO', baseItems, returnItems, 'Selesai', 'Lunas', 'Tunai', 'CUST001', undefined, 20000, 'Customer A', '2024-01-15', 'SO001');

      expect(result.stockReversal).toEqual([{ sku: 'SKU001', qty: 3 }]);
      expect(result.totalRefund).toBe(3000);
      expect(result.balanceAdjustment).toEqual({ type: 'customer', id: 'CUST001', amount: -3000 });
      expect(result.cashEntry).not.toBeNull();
      expect(result.cashEntry!.kredit).toBe(3000);
    });

    it('should calculate PO retur correctly', () => {
      const returnItems = [{ sku: 'SKU001', qty: 2 }];
      const result = calculateRetur('PO', baseItems, returnItems, 'Diterima', 'Lunas', 'Tunai', undefined, 'SUP001', 20000, undefined, '2024-01-15', 'PO001');

      expect(result.stockReversal).toEqual([{ sku: 'SKU001', qty: -2 }]);
      expect(result.totalRefund).toBe(2000);
      expect(result.balanceAdjustment).toEqual({ type: 'supplier', id: 'SUP001', amount: -2000 });
      expect(result.cashEntry).not.toBeNull();
      expect(result.cashEntry!.debit).toBe(2000);
    });

    it('should throw error for qty exceeding returable', () => {
      const returnItems = [{ sku: 'SKU001', qty: 15 }]; // max is 10
      expect(() => calculateRetur('SO', baseItems, returnItems, 'Selesai', 'Lunas', 'Tunai', 'CUST001'))
        .toThrow('Qty retur melebihi batas');
    });

    it('should throw error for non-returable status', () => {
      const returnItems = [{ sku: 'SKU001', qty: 3 }];
      expect(() => calculateRetur('SO', baseItems, returnItems, 'Draft', 'Lunas', 'Tunai', 'CUST001'))
        .toThrow('Hanya dokumen selesai/diterima yang bisa di-retur');
    });
  });

  describe('updateItemQtyReturned', () => {
    it('should update qtyReturned correctly', () => {
      const items = [
        { sku: 'SKU001', qtyReturned: 2 },
        { sku: 'SKU002', qtyReturned: 0 }
      ];
      const returnItems = [{ sku: 'SKU001', qty: 3 }, { sku: 'SKU002', qty: 1 }];
      const result = updateItemQtyReturned(items, returnItems);
      expect(result).toEqual([
        { sku: 'SKU001', qtyReturned: 5 },
        { sku: 'SKU002', qtyReturned: 1 }
      ]);
    });
  });

  describe('calculateNewStatusAfterRetur', () => {
    it('should return Retur Penuh when all items returned', () => {
      const items = [
        { sku: 'SKU001', qty: 10, qtyShipped: 10, qtyReturned: 0 },
        { sku: 'SKU002', qty: 5, qtyShipped: 5, qtyReturned: 0 }
      ];
      const returnItems = [{ sku: 'SKU001', qty: 10 }, { sku: 'SKU002', qty: 5 }];
      const result = calculateNewStatusAfterRetur('Selesai', items, returnItems);
      expect(result).toBe('Retur Penuh');
    });

    it('should return Retur Sebagian when partially returned', () => {
      const items = [
        { sku: 'SKU001', qty: 10, qtyShipped: 10, qtyReturned: 0 }
      ];
      const returnItems = [{ sku: 'SKU001', qty: 3 }];
      const result = calculateNewStatusAfterRetur('Selesai', items, returnItems);
      expect(result).toBe('Retur Sebagian');
    });

    it('should return current status when nothing returned', () => {
      const items = [
        { sku: 'SKU001', qty: 10, qtyShipped: 10, qtyReturned: 0 }
      ];
      const returnItems = [];
      const result = calculateNewStatusAfterRetur('Selesai', items, returnItems);
      expect(result).toBe('Selesai');
    });
  });
});