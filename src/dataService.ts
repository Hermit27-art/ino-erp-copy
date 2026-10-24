// src/dataService.ts
// ============================================================
// Audit Fixes:
// - Semua mutation (save/delete) sekarang mengirim session token ke server (C1, C2)
// - Hapus duplikasi dummy data filter — sekarang bersih tanpa filter (M4)
// - GAS wrapper + localStorage fallback untuk development lokal
// ============================================================

import { getSessionToken } from './authService';

// ==========================================
// GOOGLE APPS SCRIPT WRAPPER
// ==========================================
declare var google: any;
export const isGasEnvironment = () => typeof google !== 'undefined' && typeof google.script !== 'undefined';

let activeGasRequests = 0;
const startGasRequest = () => {
  activeGasRequests++;
  window.dispatchEvent(new Event('ino_loading_start'));
};
const endGasRequest = () => {
  activeGasRequests = Math.max(0, activeGasRequests - 1);
  if (activeGasRequests === 0) {
    window.dispatchEvent(new Event('ino_loading_end'));
  }
};

const runGasFunction = (functionName: string, ...args: any[]): Promise<any> => {
  startGasRequest();
  return new Promise((resolve, reject) => {
    if (isGasEnvironment()) {
      // @ts-ignore
      google.script.run
        .withSuccessHandler((res: any) => { endGasRequest(); resolve(res); })
        .withFailureHandler((err: any) => { endGasRequest(); reject(err); })
        [functionName](...args);
    } else {
      setTimeout(() => { endGasRequest(); resolve(null); }, 500); // Simulate network delay for local dev
    }
  });
};

// ==========================================
// LOCAL STORAGE FALLBACK (For Local Dev)
// ==========================================
const getLocalStorage = (key: string, defaultValue: any = []) => {
  try {
    const item = window.localStorage.getItem(key);
    if (item) {
      return JSON.parse(item);
    }
    return defaultValue;
  } catch (error) {
    console.error('Error reading localStorage', error);
    return defaultValue;
  }
};

const setLocalStorage = (key: string, value: any) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Error setting localStorage', error);
  }
};

const getTodayYMD = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
};


// ==========================================
// PRODUCTS
// PK: sku
// ==========================================
const mapGasToReactProduct = (p: any) => {
  if (!p) return p;
  return {
    ...p,
    subKat: p.subKategori !== undefined ? p.subKategori : p.subKat,
    hj: Number(p.hargaJual !== undefined ? p.hargaJual : (p.hj || 0)),
    safety: Number(p.safetyStock !== undefined ? p.safetyStock : (p.safety || 0)),
    stok: Number(p.stok || 0),
    hpp: Number(p.hpp || 0),
    supplier: p.supplierUtama !== undefined ? p.supplierUtama : p.supplier,
    tempatSimpan: p.lokasi !== undefined ? p.lokasi : p.tempatSimpan,
    masaSmp: p.masaSimpan !== undefined ? p.masaSimpan : p.masaSmp,
  };
};

const mapReactToGasProduct = (p: any) => {
  if (!p) return p;
  return {
    ...p,
    subKategori: p.subKat !== undefined ? p.subKat : p.subKategori,
    hargaJual: p.hj !== undefined ? p.hj : p.hargaJual,
    safetyStock: p.safety !== undefined ? p.safety : p.safetyStock,
    supplierUtama: p.supplier !== undefined ? p.supplier : p.supplierUtama,
    lokasi: p.tempatSimpan !== undefined ? p.tempatSimpan : p.lokasi,
    masaSimpan: p.masaSmp !== undefined ? p.masaSmp : p.masaSimpan,
  };
};

export const getProducts = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getProducts', token);
    return (data || []).map(mapGasToReactProduct);
  }
  return getLocalStorage('ino_products', []).map(mapGasToReactProduct);
};

export const saveProduct = async (product: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveProduct', token, mapReactToGasProduct(product));
  }
  const products = getLocalStorage('ino_products', []);
  const index = products.findIndex((p: any) => p.sku === product.sku);
  if (index !== -1) {
    products[index] = product;
  } else {
    products.push(product);
  }
  setLocalStorage('ino_products', products);
};

export const deleteProduct = async (sku: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteProduct', token, sku);
  }
  const products = getLocalStorage('ino_products', []);
  const filtered = products.filter((p: any) => p.sku !== sku);
  setLocalStorage('ino_products', filtered);
};

export const saveAllProducts = async (products: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllProducts', token, products.map(mapReactToGasProduct));
  }
  setLocalStorage('ino_products', products);
};


// ==========================================
// PURCHASE ORDERS
// PK: id
// ==========================================
export const getPurchaseOrders = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getPurchaseOrders', token);
    return data || [];
  }
  return getLocalStorage('ino_purchase_orders', []);
};

export const savePurchaseOrder = async (order: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('savePurchaseOrder', token, order);
  }
  const orders = getLocalStorage('ino_purchase_orders', []);
  const index = orders.findIndex((o: any) => o.id === order.id);
  if (index !== -1) {
    orders[index] = order;
  } else {
    orders.push(order);
  }
  setLocalStorage('ino_purchase_orders', orders);
};

export const deletePurchaseOrder = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deletePurchaseOrder', token, id);
  }
  const orders = getLocalStorage('ino_purchase_orders', []);
  const filtered = orders.filter((o: any) => o.id !== id);
  setLocalStorage('ino_purchase_orders', filtered);
};

export const saveAllPurchaseOrders = async (orders: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllPurchaseOrders', token, orders);
  }
  setLocalStorage('ino_purchase_orders', orders);
};


// ==========================================
// SALES ORDERS
// PK: id
// ==========================================
export const getSalesOrders = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getSalesOrders', token);
    return data || [];
  }
  return getLocalStorage('ino_sales_orders', []);
};

export const saveSalesOrder = async (order: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveSalesOrder', token, order);
  }
  const orders = getLocalStorage('ino_sales_orders', []);
  const index = orders.findIndex((o: any) => o.id === order.id);
  if (index !== -1) {
    orders[index] = order;
  } else {
    orders.push(order);
  }
  setLocalStorage('ino_sales_orders', orders);
};

export const deleteSalesOrder = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteSalesOrder', token, id);
  }
  const orders = getLocalStorage('ino_sales_orders', []);
  const filtered = orders.filter((o: any) => o.id !== id);
  setLocalStorage('ino_sales_orders', filtered);
};

export const saveAllSalesOrders = async (orders: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllSalesOrders', token, orders);
  }
  setLocalStorage('ino_sales_orders', orders);
};


// ==========================================
// CUSTOMERS
// PK: id
// ==========================================
export const getCustomers = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getCustomers', token);
    return data || [];
  }
  return getLocalStorage('ino_customers', []);
};

export const saveCustomer = async (customer: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveCustomer', token, customer);
  }
  const customers = getLocalStorage('ino_customers', []);
  const index = customers.findIndex((c: any) => c.id === customer.id);
  if (index !== -1) {
    customers[index] = customer;
  } else {
    customers.push(customer);
  }
  setLocalStorage('ino_customers', customers);
};

export const resetSemuaData = async (): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('resetSemuaData', token);
  }
  // Local implementation if needed
};

export const sendEmailReport = async (to: string, subject: string, htmlBody: string): Promise<boolean> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('sendEmailReport', token, to, subject, htmlBody);
  }
  console.log('Mock email sent to', to);
  return true;
};

export const deleteCustomer = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteCustomer', token, id);
  }
  const customers = getLocalStorage('ino_customers', []);
  const filtered = customers.filter((c: any) => c.id !== id);
  setLocalStorage('ino_customers', filtered);
};

export const saveAllCustomers = async (customers: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllCustomers', token, customers);
  }
  setLocalStorage('ino_customers', customers);
};


// ==========================================
// SUPPLIERS
// PK: id
// ==========================================
export const getSuppliers = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getSuppliers', token);
    return data || [];
  }
  return getLocalStorage('ino_suppliers', []);
};

export const saveSupplier = async (supplier: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveSupplier', token, supplier);
  }
  const suppliers = getLocalStorage('ino_suppliers', []);
  const index = suppliers.findIndex((s: any) => s.id === supplier.id);
  if (index !== -1) {
    suppliers[index] = supplier;
  } else {
    suppliers.push(supplier);
  }
  setLocalStorage('ino_suppliers', suppliers);
};

export const deleteSupplier = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteSupplier', token, id);
  }
  const suppliers = getLocalStorage('ino_suppliers', []);
  const filtered = suppliers.filter((s: any) => s.id !== id);
  setLocalStorage('ino_suppliers', filtered);
};

export const saveAllSuppliers = async (suppliers: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllSuppliers', token, suppliers);
  }
  setLocalStorage('ino_suppliers', suppliers);
};


// ==========================================
// CONSIGNMENTS
// PK: id
// ==========================================
export const getConsignments = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getConsignments', token);
    return data || [];
  }
  return getLocalStorage('ino_consignments', []);
};

export const saveConsignment = async (consignment: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveConsignment', token, consignment);
  }
  const consignments = getLocalStorage('ino_consignments', []);
  const index = consignments.findIndex((c: any) => c.id === consignment.id);
  if (index !== -1) {
    consignments[index] = consignment;
  } else {
    consignments.push(consignment);
  }
  setLocalStorage('ino_consignments', consignments);
};

export const deleteConsignment = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteConsignment', token, id);
  }
  const consignments = getLocalStorage('ino_consignments', []);
  const filtered = consignments.filter((c: any) => c.id !== id);
  setLocalStorage('ino_consignments', filtered);
};

export const saveAllConsignments = async (consignments: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllConsignments', token, consignments);
  }
  setLocalStorage('ino_consignments', consignments);
};


// ==========================================
// OPNAME LOG / INVENTORY LOG
// ==========================================
export const getOpnameLog = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getOpnameLog', token);
    return data || [];
  }
  return getLocalStorage('ino_opname_log', []);
};

export const appendOpnameLog = async (logEntry: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('appendOpnameLog', token, logEntry);
  }
  const logs = getLocalStorage('ino_opname_log', []);
  logs.push(logEntry);
  setLocalStorage('ino_opname_log', logs);
};

export const saveAllOpnameLog = async (logs: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllOpnameLog', token, logs);
  }
  setLocalStorage('ino_opname_log', logs);
};


// ==========================================
// CASH LEDGER
// PK: id
// ==========================================
export const getCashLedger = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getCashLedger', token);
    return data || [];
  }
  return getLocalStorage('ino_cash_ledger', []);
};

export const saveCashEntry = async (entry: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveCashEntry', token, entry);
  }
  const ledger = getLocalStorage('ino_cash_ledger', []);
  const index = ledger.findIndex((c: any) => c.id === entry.id);
  if (index !== -1) {
    ledger[index] = entry;
  } else {
    ledger.push(entry);
  }
  setLocalStorage('ino_cash_ledger', ledger);
};

export const deleteCashEntry = async (id: string): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteCashEntry', token, id);
  }
  const ledger = getLocalStorage('ino_cash_ledger', []);
  const filtered = ledger.filter((c: any) => c.id !== id);
  setLocalStorage('ino_cash_ledger', filtered);
};

export const saveAllCashLedger = async (ledger: any[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAllCashLedger', token, ledger);
  }
  setLocalStorage('ino_cash_ledger', ledger);
};

// ==========================================
// CREATE/UPDATE FUNCTIONS (D3) — Server-side ID generation, insert vs upsert
// ==========================================

// Customers
export const createCustomer = async (customer: any): Promise<{ id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const result = await runGasFunction('createCustomer', token, customer);
    return result;
  }
  // Local fallback
  const id = `CUST-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const customers = getLocalStorage('ino_customers', []);
  const newCustomer = { ...customer, id };
  setLocalStorage('ino_customers', [...customers, newCustomer]);
  return { id };
};

export const updateCustomer = async (customer: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('updateCustomer', token, customer);
  }
  const customers = getLocalStorage('ino_customers', []);
  const idx = customers.findIndex((c: any) => c.id === customer.id);
  if (idx === -1) throw new Error('Customer not found: ' + customer.id);
  customers[idx] = customer;
  setLocalStorage('ino_customers', customers);
};

// Suppliers
export const createSupplier = async (supplier: any): Promise<{ id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const result = await runGasFunction('createSupplier', token, supplier);
    return result;
  }
  const id = `SUP-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const suppliers = getLocalStorage('ino_suppliers', []);
  const newSupplier = { ...supplier, id };
  setLocalStorage('ino_suppliers', [...suppliers, newSupplier]);
  return { id };
};

export const updateSupplier = async (supplier: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('updateSupplier', token, supplier);
  }
  const suppliers = getLocalStorage('ino_suppliers', []);
  const idx = suppliers.findIndex((s: any) => s.id === supplier.id);
  if (idx === -1) throw new Error('Supplier not found: ' + supplier.id);
  suppliers[idx] = supplier;
  setLocalStorage('ino_suppliers', suppliers);
};

// Purchase Orders
export const createPurchaseOrder = async (order: any): Promise<{ id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const result = await runGasFunction('createPurchaseOrder', token, order);
    return result;
  }
  const id = `PO-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const orders = getLocalStorage('ino_purchase_orders', []);
  const newOrder = { ...order, id };
  setLocalStorage('ino_purchase_orders', [...orders, newOrder]);
  return { id };
};

export const updatePurchaseOrder = async (order: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('updatePurchaseOrder', token, order);
  }
  const orders = getLocalStorage('ino_purchase_orders', []);
  const idx = orders.findIndex((o: any) => o.id === order.id);
  if (idx === -1) throw new Error('Purchase Order not found: ' + order.id);
  orders[idx] = order;
  setLocalStorage('ino_purchase_orders', orders);
};

// Sales Orders
export const createSalesOrder = async (order: any): Promise<{ id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const result = await runGasFunction('createSalesOrder', token, order);
    return result;
  }
  const id = `SO-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const orders = getLocalStorage('ino_sales_orders', []);
  const newOrder = { ...order, id };
  setLocalStorage('ino_sales_orders', [...orders, newOrder]);
  return { id };
};

export const updateSalesOrder = async (order: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('updateSalesOrder', token, order);
  }
  const orders = getLocalStorage('ino_sales_orders', []);
  const idx = orders.findIndex((o: any) => o.id === order.id);
  if (idx === -1) throw new Error('Sales Order not found: ' + order.id);
  orders[idx] = order;
  setLocalStorage('ino_sales_orders', orders);
};

// Cash Ledger
export const createCashEntry = async (entry: any): Promise<{ id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const result = await runGasFunction('createCashEntry', token, entry);
    return result;
  }
  const id = `CSH-${getTodayYMD().replace(/-/g, '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const ledger = getLocalStorage('ino_cash_ledger', []);
  const newEntry = { ...entry, id };
  setLocalStorage('ino_cash_ledger', [...ledger, newEntry]);
  return { id };
};

export const updateCashEntry = async (entry: any): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('updateCashEntry', token, entry);
  }
  const ledger = getLocalStorage('ino_cash_ledger', []);
  const idx = ledger.findIndex((c: any) => c.id === entry.id);
  if (idx === -1) throw new Error('Cash Entry not found: ' + entry.id);
  ledger[idx] = entry;
  setLocalStorage('ino_cash_ledger', ledger);
};

// ==========================================
// DELTA OPS (D1/D2) — Atomic operations with idempotency
// ==========================================

// Generate UUID for idempotency key
export const generateOpId = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

/**
 * D1/D2 — Atomic Stock Adjustment
 * Mengubah stok produk secara atomik dengan validasi stok tidak negatif.
 * Menggunakan opId untuk idempotency (6 jam TTL di server).
 */
export const adjustStock = async (
  sku: string,
  deltaQty: number,
  opId?: string
): Promise<{ ok: true; newStock: number; sku: string }> => {
  const idempotencyKey = opId || generateOpId();
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('adjustStock', token, sku, deltaQty, idempotencyKey);
  }
  // Local fallback: adjust in localStorage
  const products = getLocalStorage('ino_products', []);
  const idx = products.findIndex((p: any) => p.sku === sku);
  if (idx === -1) throw new Error('PRODUK_TIDAK_DITEMUKAN: Produk dengan SKU \'' + sku + '\' tidak terdaftar.');
  const currentStock = Number(products[idx].stok) || 0;
  const newStock = currentStock + deltaQty;
  if (newStock < 0) {
    throw new Error('STOK_TIDAK_CUKUP: Stok tidak mencukupi (sisa: ' + currentStock + ', diminta: ' + Math.abs(deltaQty) + ')');
  }
  products[idx].stok = newStock;
  setLocalStorage('ino_products', products);
  return { ok: true, newStock, sku };
};

/**
 * D1/D2 — Atomic Balance Adjustment (Piutang/Hutang)
 * Mengubah balance piutang (customer) atau hutang (supplier) secara atomik.
 */
export const adjustBalance = async (
  entityType: 'customer' | 'supplier',
  entityId: string,
  delta: number,
  opId?: string
): Promise<{ ok: true; newBalance: number; entityId: string; entityType: string }> => {
  const idempotencyKey = opId || generateOpId();
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('adjustBalance', token, entityType, entityId, delta, idempotencyKey);
  }
  // Local fallback
  const sheetName = entityType === 'customer' ? 'ino_customers' : 'ino_suppliers';
  const balanceField = entityType === 'customer' ? 'piutang' : 'hutang';
  const entities = getLocalStorage(sheetName, []);
  const idx = entities.findIndex((e: any) => e.id === entityId);
  if (idx === -1) {
    throw new Error(entityType.charAt(0).toUpperCase() + entityType.slice(1) + '_TIDAK_DITEMUKAN: ' + entityType + ' dengan ID \'' + entityId + '\' tidak terdaftar.');
  }
  const currentBalance = Number(entities[idx][balanceField]) || 0;
  const newBalance = currentBalance + delta;
  if (newBalance < 0) {
    throw new Error('BALANCE_NEGATIF: ' + balanceField + ' tidak boleh negatif (sisa: ' + currentBalance + ', delta: ' + delta + ')');
  }
  entities[idx][balanceField] = newBalance;
  setLocalStorage(sheetName, entities);
  return { ok: true, newBalance, entityId, entityType };
};

/**
 * D1/D2 — Atomic Cash Ledger Append
 * Menambah entri ke CashLedger dengan server-generated ID dan running balance.
 */
export const appendCashEntry = async (
  entry: { tanggal: string; ref: string; keterangan: string; kategori: string; debit: number; kredit: number; akun: string; metode: string },
  opId?: string
): Promise<{ ok: true; id: string; saldo: number; entry: any }> => {
  const idempotencyKey = opId || generateOpId();
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('appendCashEntry', token, entry, idempotencyKey);
  }
  // Local fallback: generate ID, calculate running balance
  const ledger = getLocalStorage('ino_cash_ledger', []);
  // Simple ID generation for local
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = 'CSH';
  let maxNum = 0;
  for (const row of ledger) {
    if (row.id && row.id.startsWith(`${prefix}-${today}-`)) {
      const num = parseInt(row.id.split('-')[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const newId = `${prefix}-${today}-${String(maxNum + 1).padStart(3, '0')}`;
  // Calculate running balance for this akun
  let lastSaldo = 0;
  for (const row of ledger) {
    if (row.akun === entry.akun) {
      lastSaldo = Number(row.saldo) || 0;
    }
  }
  const debit = Number(entry.debit) || 0;
  const kredit = Number(entry.kredit) || 0;
  const saldo = lastSaldo + debit - kredit;
  const newEntry = { ...entry, id: newId, saldo };
  ledger.push(newEntry);
  setLocalStorage('ino_cash_ledger', ledger);
  return { ok: true, id: newId, saldo, entry: newEntry };
};

// ==========================================
// SETTINGS & BOOTSTRAP (S1)
// ==========================================

export const getBootstrapStatus = async (): Promise<{ initialized: boolean; storeName: string }> => {
  if (isGasEnvironment()) {
    return runGasFunction('getBootstrapStatus');
  }
  const hasUser = !!localStorage.getItem('ino_login_username');
  return { initialized: hasUser, storeName: localStorage.getItem('ino_nama_toko') || 'INO ERP' };
};

export interface InitialSetupPayload {
  email: string;
  passwordHash: string;
  nama: string;
  settings: { key: string; value: string }[];
  token?: string;
}

export const initialSetup = async (payload: InitialSetupPayload): Promise<{ ok: boolean; message: string }> => {
  if (isGasEnvironment()) {
    return runGasFunction('initialSetup', payload);
  }
  return { ok: true, message: 'Setup lokal selesai.' };
};

export const fetchSettings = async (): Promise<{ key: string, value: string }[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getAppSettings', token);
    return data || [];
  }
  return []; // Di local dev, rely on localStorage fallback
};

export const saveSettingsToGas = async (settingsList: { key: string, value: string }[]): Promise<void> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveAppSettings', token, settingsList);
  }
  // Di local dev, Settings disimpan ke localStorage per key di App.tsx
};

// ==========================================
// TEAM USER MANAGEMENT (S5)
// ==========================================

export const listUsersFromGas = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('listUsers', token);
    return data || [];
  }
  return JSON.parse(localStorage.getItem('ino_setting_users') || '[]');
};

export const saveUserToGas = async (userData: any): Promise<{ ok: boolean; message: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('saveUser', token, userData);
  }
  const users = JSON.parse(localStorage.getItem('ino_setting_users') || '[]');
  const idx = users.findIndex((u: any) => u.email === userData.email);
  if (idx !== -1) {
    users[idx] = { ...users[idx], ...userData };
  } else {
    users.push(userData);
  }
  localStorage.setItem('ino_setting_users', JSON.stringify(users));
  return { ok: true, message: 'User tersimpan.' };
};

export const deleteUserFromGas = async (email: string): Promise<{ ok: boolean; message: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('deleteUser', token, email);
  }
  const users = JSON.parse(localStorage.getItem('ino_setting_users') || '[]');
  const filtered = users.filter((u: any) => u.email !== email);
  localStorage.setItem('ino_setting_users', JSON.stringify(filtered));
  return { ok: true, message: 'User terhapus.' };
};

export const resetPinInGas = async (email: string, newPinHash: string): Promise<{ ok: boolean; message: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('resetPin', token, email, newPinHash);
  }
  return { ok: true, message: 'PIN direset.' };
};

// ==========================================
// VOID & RETUR (D6) — Atomic operations with idempotency
// ==========================================

/**
 * D6 — Create Void Log
 * Mencatat void dokumen untuk audit trail
 */
export const createVoidLog = async (
  voidLogData: { tanggal: string; docType: 'SO' | 'PO' | 'CSH'; docId: string; kasir: string; nilai: number; alasan: string }
): Promise<{ success: boolean; id: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('createVoidLog', token, voidLogData);
  }
  // Local fallback
  const logs = getLocalStorage('ino_void_log', []);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = 'VOID';
  let maxNum = 0;
  for (const row of logs) {
    if (row.id && row.id.startsWith(`${prefix}-${today}-`)) {
      const num = parseInt(row.id.split('-')[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const newId = `${prefix}-${today}-${String(maxNum + 1).padStart(3, '0')}`;
  const newLog = { ...voidLogData, id: newId, timestamp: new Date().toISOString() };
  logs.push(newLog);
  setLocalStorage('ino_void_log', logs);
  return { success: true, id: newId };
};

/**
 * D6 — Process Retur
 * Menangani retur barang untuk SO/PO yang sudah lunas
 */
export const processRetur = async (
  returData: { docType: 'SO' | 'PO'; docId: string; returnItems: Array<{ sku: string; qty: number }>; alasan: string }
): Promise<{ success: boolean; totalRefund: number; newStatusLogistik: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('processRetur', token, returData);
  }
  // Local fallback would be complex - just return success for local dev
  return { success: true, totalRefund: 0, newStatusLogistik: 'Retur Sebagian' };
};

/**
 * D6 — Void Document
 * Batalkan dokumen: balik stok, koreksi piutang/hutang, catat kas (jika tunai), catat VoidLog
 */
export const voidDocument = async (
  docType: 'SO' | 'PO',
  docId: string,
  alasan: string
): Promise<{ success: boolean; voidLogId: string }> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    return runGasFunction('voidDocument', token, docType, docId, alasan);
  }
  // Local fallback
  const logs = getLocalStorage('ino_void_log', []);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const prefix = 'VOID';
  let maxNum = 0;
  for (const row of logs) {
    if (row.id && row.id.startsWith(`${prefix}-${today}-`)) {
      const num = parseInt(row.id.split('-')[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  const newId = `${prefix}-${today}-${String(maxNum + 1).padStart(3, '0')}`;
  const newLog = {
    id: newId,
    tanggal: new Date().toISOString().slice(0, 10),
    docType,
    docId,
    kasir: 'Local User',
    nilai: 0,
    alasan,
    timestamp: new Date().toISOString()
  };
  logs.push(newLog);
  setLocalStorage('ino_void_log', logs);
  return { success: true, voidLogId: newId };
};

/**
 * D6 — Get Void Log
 * Mengambil log void untuk laporan/audit
 */
export const getVoidLog = async (): Promise<any[]> => {
  if (isGasEnvironment()) {
    const token = getSessionToken();
    const data = await runGasFunction('getVoidLog', token);
    return data || [];
  }
  return getLocalStorage('ino_void_log', []);
};
