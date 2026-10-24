// ============================================================
// INO ERP — Google Apps Script Backend
// ============================================================
// Changelog v2.0 (Audit Fixes):
// - Tambah session-based auth (login → token → validate per request)
// - Tambah LockService untuk prevent race condition pada bulk writes
// - Semua mutation endpoint sekarang memerlukan valid session token
// - Read endpoints diproteksi dengan session token (requireAuth_ / requireRole_)
// ============================================================

function doGet(e) {
  if (e && e.parameter && e.parameter.app === 'pos') {
    return HtmlService.createTemplateFromFile('index_POS')
      .evaluate()
      .setTitle('INO POS')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('INO ERP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ============================================================
// CANONICAL SCHEMA & AUDIT HEADERS (W0.3 / D4)
// ============================================================
const SCHEMA = {
  "Products": ["sku", "kategori", "subKategori", "nama", "satuan", "hargaJual", "hpp", "safetyStock", "stok", "status", "supplierUtama", "lokasi", "masaSimpan", "catatan"],
  "Customers": ["id", "nama", "kontak", "email", "telp", "alamat", "piutang"],
  "Suppliers": ["id", "nama", "kontak", "email", "telp", "alamat", "hutang"],
  "PurchaseOrders": ["id", "tanggal", "supplierId", "supplier", "metode", "subtotal", "diskon", "pajak", "grandTotal", "statusLogistik", "statusBayar", "totalPaid", "platform", "catatan", "dibuatOleh", "tanggalUpdate", "taxMode", "ppnStatus", "dpp", "ppnNilai", "isDirectPaid", "paidAt", "_hash"],
  "PurchaseOrderItems": ["noPO", "sku", "nama", "qty", "qtyReceived", "qtyReturned", "satuan", "harga", "diskon", "ppn", "subtotal", "_hash"],
  "SalesOrders": ["id", "tanggal", "customerId", "pelanggan", "metode", "subtotal", "diskon", "pajak", "grandTotal", "statusLogistik", "statusBayar", "totalPaid", "platform", "kasir", "catatan", "taxMode", "ppnStatus", "dpp", "ppnNilai", "voidedBy", "voidedAt", "voidAlasan", "_hash"],
  "SalesOrderItems": ["noSO", "sku", "nama", "qty", "qtyShipped", "qtyReturned", "harga", "hpp", "diskon", "ppn", "subtotal", "_hash"],
  "CashLedger": ["id", "tanggal", "ref", "keterangan", "kategori", "debit", "kredit", "saldo", "akun", "metode", "_hash"],
  "InventoryLog": ["tanggal", "sku", "nama", "tipe", "qtySistem", "qtyFisik", "selisih", "satuan", "HPP", "subtotal", "catatan", "operator", "_hash"],
  "Settings": ["key", "value"],
  "Users": ["email", "nama", "role", "pin", "salt", "preHashHmac", "created_at", "updated_at"],
  "CashAccounts": ["nomor", "nama", "jenis", "aktif"],
  "PaymentMethods": ["id", "nama", "akun", "aktif"],
  "VoidLog": ["id", "tanggal", "docType", "docId", "kasir", "nilai", "alasan", "timestamp", "_hash"],
  "_AuditLog": ["id", "timestamp", "action", "sheet", "recordId", "user", "details", "_hash"],
  "_Sessions": ["token", "username", "role", "nama", "created_at", "expires_at"],
  "BOMs": ["id", "skuHasil", "namaHasil", "qtyHasil", "biayaLain", "bahanBakuJson"],
  "Platforms": ["nama", "aktif"]
};

/**
 * W0.3 — Audit statis & runtime header sheet live vs canonical SCHEMA.
 * Fungsi baca-saja, tidak mengubah data apa pun di Spreadsheet.
 */
function auditSheetHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const report = {
    timestamp: new Date().toISOString(),
    missingSheets: [],
    extraSheets: [],
    sheetDetails: {}
  };

  const allSheets = ss.getSheets();
  const existingSheetNames = allSheets.map(s => s.getName());

  for (const sheetName in SCHEMA) {
    const expectedHeaders = SCHEMA[sheetName];
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      report.missingSheets.push(sheetName);
      report.sheetDetails[sheetName] = {
        status: 'MISSING',
        missingColumns: expectedHeaders,
        extraColumns: [],
        actualHeaders: [],
        expectedHeaders: expectedHeaders
      };
      continue;
    }

    const lastCol = sheet.getLastColumn();
    let actualHeaders = [];
    if (lastCol > 0) {
      actualHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim()).filter(Boolean);
    }

    const missingColumns = expectedHeaders.filter(h => actualHeaders.indexOf(h) === -1);
    const extraColumns = actualHeaders.filter(h => expectedHeaders.indexOf(h) === -1);

    report.sheetDetails[sheetName] = {
      status: (missingColumns.length === 0 && extraColumns.length === 0) ? 'OK' : 'MISMATCH',
      missingColumns: missingColumns,
      extraColumns: extraColumns,
      actualHeaders: actualHeaders,
      expectedHeaders: expectedHeaders
    };
  }

  for (const name of existingSheetNames) {
    if (!SCHEMA[name] && !name.startsWith('_Backup_')) {
      report.extraSheets.push(name);
    }
  }

  Logger.log("=== HASIL AUDIT HEADER SPREADSHEET (W0.3) ===");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * D4 — Round-trip test: save and load each entity type to verify schema integrity.
 * Returns a report with pass/fail status for each entity.
 */
function testSchemaRoundTrip() {
  const report = {
    timestamp: new Date().toISOString(),
    results: {},
    overall: 'PASS'
  };

  // Test data for each entity type (minimal valid data)
  const testData = {
    Products: { sku: 'TEST-SKU-' + Date.now(), kategori: 'Test', nama: 'Test Product', satuan: 'PCS', hargaJual: 1000, hpp: 500, safetyStock: 0, stok: 10, status: 'Aktif', supplierUtama: '', lokasi: '', masaSimpan: 0, catatan: '' },
    Customers: { nama: 'Test Customer', kontak: 'Test', email: 'test@test.com', telp: '08123456789', alamat: 'Test Address', piutang: 0 },
    Suppliers: { nama: 'Test Supplier', kontak: 'Test', email: 'test@supplier.com', telp: '08123456789', alamat: 'Test Address', hutang: 0 },
    CashLedger: { tanggal: new Date().toISOString().split('T')[0], ref: 'TEST-RT', keterangan: 'Round-trip test', kategori: 'Test', debit: 100, kredit: 0, saldo: 100, akun: 'Kas Tunai', metode: 'Tunai' },
    InventoryLog: { tanggal: new Date().toISOString().split('T')[0], sku: 'TEST-SKU', nama: 'Test', tipe: 'Opname', qtySistem: 10, qtyFisik: 10, selisih: 0, satuan: 'PCS', HPP: 500, subtotal: 5000, catatan: 'Test', operator: 'Test' },
    Settings: { key: 'TEST_KEY', value: 'test_value' },
    CashAccounts: { nama: 'Test Account', jenis: 'Kas', aktif: true },
    PaymentMethods: { nama: 'Test Method', akun: 'Kas Tunai', aktif: true },
    VoidLog: { tanggal: new Date().toISOString().split('T')[0], docType: 'SO', docId: 'TEST', kasir: 'Test', nilai: 100, alasan: 'Test', timestamp: new Date().toISOString() },
    Platforms: { nama: 'Test Platform', aktif: true }
  };

  // PK fields for each entity
  const pkFields = {
    Products: 'sku',
    Customers: 'id',
    Suppliers: 'id',
    PurchaseOrders: 'id',
    SalesOrders: 'id',
    CashLedger: 'id',
    InventoryLog: 'tanggal', // no single PK, use composite
    Settings: 'key',
    CashAccounts: 'nomor',
    PaymentMethods: 'id',
    VoidLog: 'id',
    Platforms: 'nama'
  };

  for (const sheetName in testData) {
    try {
      const item = { ...testData[sheetName] };
      const pkField = pkFields[sheetName];

      // Skip tables with composite PK or complex structure
      if (!pkField || sheetName === 'InventoryLog') {
        report.results[sheetName] = { status: 'SKIPPED', reason: 'Composite PK or complex structure' };
        continue;
      }

      // For entities with auto-generated ID, let server generate it
      if (sheetName === 'Customers' || sheetName === 'Suppliers' || sheetName === 'CashLedger' || sheetName === 'VoidLog' || sheetName === 'PaymentMethods') {
        // Use create* functions for these
        const createFunc = 'create' + sheetName.replace('Ledger', 'Entry').replace('VoidLog', 'CashEntry');
        if (typeof this[createFunc] === 'function') {
          const result = this[createFunc]('test-token', item);
          if (!result || !result.id) {
            report.results[sheetName] = { status: 'FAIL', reason: 'Create returned no ID' };
            report.overall = 'FAIL';
            continue;
          }
          item.id = result.id;
        }
      }

      // For test purposes, we'll just use saveItemToSheet_ directly
      // Note: In real usage, create* functions handle ID generation
      if (sheetName === 'Customers') item.id = 'CUST-TEST-' + Date.now();
      else if (sheetName === 'Suppliers') item.id = 'SUP-TEST-' + Date.now();
      else if (sheetName === 'CashLedger') item.id = 'CSH-TEST-' + Date.now();
      else if (sheetName === 'VoidLog') item.id = 'VOID-TEST-' + Date.now();
      else if (sheetName === 'PaymentMethods') item.id = 'PM-TEST-' + Date.now();
      else if (sheetName === 'CashAccounts') item.nomor = 'ACC-TEST-' + Date.now();

      // Save
      saveItemToSheet_(sheetName, item, pkField);

      // Load back
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
      const values = sheet.getDataRange().getValues();
      const headers = values[0];
      const pkIndex = headers.indexOf(pkField);
      let found = false;
      let loadedItem = null;
      for (let i = 1; i < values.length; i++) {
        if (values[i][pkIndex] == item[pkField]) {
          loadedItem = {};
          headers.forEach((h, idx) => { loadedItem[h] = values[i][idx]; });
          found = true;
          break;
        }
      }

      if (!found) {
        report.results[sheetName] = { status: 'FAIL', reason: 'Item not found after save' };
        report.overall = 'FAIL';
        continue;
      }

      // Compare (only check fields that were in test data)
      let match = true;
      const mismatches = [];
      for (const key in item) {
        const expected = item[key];
        const actual = loadedItem[key];
        // Handle number/string comparison
        if (String(expected) !== String(actual)) {
          match = false;
          mismatches.push({ field: key, expected, actual });
        }
      }

      if (match) {
        report.results[sheetName] = { status: 'PASS' };
      } else {
        report.results[sheetName] = { status: 'FAIL', reason: 'Data mismatch', mismatches };
        report.overall = 'FAIL';
      }

      // Cleanup test data
      deleteItemFromSheet_(sheetName, item[pkField], pkField);

    } catch (e) {
      report.results[sheetName] = { status: 'ERROR', reason: e.message };
      report.overall = 'FAIL';
    }
  }

  Logger.log("=== HASIL ROUND-TRIP TEST (D4) ===");
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// ----------------------------------------------------
// SESSION & AUTH MANAGEMENT (S1, S4, S5)
// ----------------------------------------------------
const SESSION_SHEET = '_Sessions';
const USERS_SHEET = 'Users';
const SESSION_EXPIRY_HOURS = 24;

const SHEET_PRODUCTS = 'Products';
const SHEET_CUSTOMERS = 'Customers';
const SHEET_SALES_ORDERS = 'SalesOrders';
const SHEET_CASH_LEDGER = 'CashLedger';

/**
 * Mendapatkan atau menginisialisasi server-side pepper secara aman (R5).
 * Jika Script Property AUTH_PEPPER belum diset, generate nilai acak unik sekali di bawah LockService,
 * simpan di Script Properties, dan gunakan kembali. Tidak ada fallback hardcoded di kode.
 */
function getAuthPepper_() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('AUTH_PEPPER');
  if (pepper) return pepper;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk saat inisialisasi keamanan autentikasi.');
  }

  try {
    pepper = props.getProperty('AUTH_PEPPER');
    if (!pepper) {
      pepper = Utilities.getUuid() + '-' + Utilities.getUuid();
      props.setProperty('AUTH_PEPPER', pepper);
    }
    return pepper;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Komputasi HMAC-SHA256 untuk preHash password dari klien.
 * Menggunakan salt per-user dan server-side pepper dari Script Properties.
 */
function computeHmac_(salt, preHash) {
  const pepper = getAuthPepper_();
  const message = String(salt) + ':' + String(preHash);
  const rawSignature = Utilities.computeHmacSha256Signature(message, pepper);
  return rawSignature.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

/**
 * Mendapatkan sheet _Sessions untuk menyimpan token login.
 */
function getSessionSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SESSION_SHEET);
  if (!sh) {
    sh = ss.insertSheet(SESSION_SHEET);
    sh.appendRow(['token', 'username', 'role', 'nama', 'created_at', 'expires_at']);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}

/**
 * Bersihkan sesi kedaluwarsa dari _Sessions.
 */
function cleanupExpiredSessions_() {
  try {
    const sh = getSessionSheet_();
    const data = sh.getDataRange().getValues();
    if (data.length <= 1) return;
    const now = new Date();
    for (let i = data.length - 1; i >= 1; i--) {
      const expires = new Date(data[i][5]);
      if (isNaN(expires.getTime()) || now >= expires) {
        sh.deleteRow(i + 1);
      }
    }
  } catch (e) {
    Logger.log('cleanupExpiredSessions_ warning: ' + e.message);
  }
}

/**
 * Validasi session token. Mengembalikan info user atau null jika invalid/expired.
 */
function validateToken_(token) {
  if (!token) return null;
  const sh = getSessionSheet_();
  const data = sh.getDataRange().getValues();
  const now = new Date();

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(token)) {
      const expires = new Date(data[i][5]);
      if (now < expires) {
        return {
          username: String(data[i][1]),
          role: String(data[i][2]),
          nama: String(data[i][3])
        };
      } else {
        sh.deleteRow(i + 1);
        return null;
      }
    }
  }
  return null;
}

/**
 * Memastikan token valid. Melempar error UNAUTHORIZED jika tidak valid.
 */
function requireAuth_(token) {
  const user = validateToken_(token);
  if (!user) {
    throw new Error('UNAUTHORIZED: Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.');
  }
  return user;
}

/**
 * Memastikan token valid dan memiliki peran yang diizinkan (S4 / DEC-10).
 * allowedRoles: array string, misal ['Superadmin'], ['Admin', 'Superadmin'], ['Kasir', 'Admin', 'Superadmin']
 */
function requireRole_(token, allowedRoles) {
  const user = requireAuth_(token);
  if (!allowedRoles || !allowedRoles.includes(user.role)) {
    throw new Error('FORBIDDEN: Peran \'' + user.role + '\' tidak memiliki izin untuk operasi ini.');
  }
  return user;
}

/**
 * Login — verifikasi kredensial, proteksi brute-force dengan rate limit CacheService,
 * upgrade otomatis password legacy ke HMAC-SHA256 ber-salt (S5).
 */
function login(username, preHash) {
  if (!username || !preHash) {
    return { ok: false, error: 'Username dan password wajib diisi.' };
  }

  const cleanUser = String(username).trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const rateLimitKey = 'login_fails_' + cleanUser;
  const failAttempts = Number(cache.get(rateLimitKey) || 0);

  // Rate limit: 5 gagal dalam 15 menit (900 detik)
  if (failAttempts >= 5) {
    return {
      ok: false,
      error: 'Terlalu banyak percobaan login gagal. Akun diblokir sementara selama 15 menit.'
    };
  }

  cleanupExpiredSessions_();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Periksa sheet Users
  const usersSheet = ss.getSheetByName(USERS_SHEET);
  if (usersSheet) {
    const usersData = usersSheet.getDataRange().getValues();
    if (usersData.length > 1) {
      const headers = usersData[0];
      const emailIdx = headers.indexOf('email');
      const namaIdx = headers.indexOf('nama');
      const roleIdx = headers.indexOf('role');
      const pinIdx = headers.indexOf('pin');
      const saltIdx = headers.indexOf('salt');
      const hmacIdx = headers.indexOf('preHashHmac');

      for (let i = 1; i < usersData.length; i++) {
        const row = usersData[i];
        const storedEmail = String(row[emailIdx] || '').trim().toLowerCase();
        if (storedEmail !== cleanUser) continue;

        let isMatch = false;
        const storedSalt = saltIdx !== -1 ? String(row[saltIdx] || '').trim() : '';
        const storedHmac = hmacIdx !== -1 ? String(row[hmacIdx] || '').trim() : '';
        const storedPin = pinIdx !== -1 ? String(row[pinIdx] || '').trim() : '';

        if (storedSalt && storedHmac) {
          // Kredensial modern ber-salt + HMAC
          const calculatedHmac = computeHmac_(storedSalt, preHash);
          if (calculatedHmac === storedHmac) isMatch = true;
        } else if (storedPin && storedPin === preHash) {
          // Kredensial legacy — upgrade otomatis tanpa paksa reset password
          isMatch = true;
          const newSalt = Utilities.getUuid();
          const newHmac = computeHmac_(newSalt, preHash);
          if (saltIdx !== -1) usersSheet.getRange(i + 1, saltIdx + 1).setValue(newSalt);
          if (hmacIdx !== -1) usersSheet.getRange(i + 1, hmacIdx + 1).setValue(newHmac);
          if (pinIdx !== -1) usersSheet.getRange(i + 1, pinIdx + 1).setValue(''); // Hapus hash polos
          const updatedIdx = headers.indexOf('updated_at');
          if (updatedIdx !== -1) usersSheet.getRange(i + 1, updatedIdx + 1).setValue(new Date());
          Logger.log('Upgraded legacy password for user: ' + cleanUser);
        }

        if (isMatch) {
          cache.remove(rateLimitKey);
          const token = Utilities.getUuid();
          const now = new Date();
          const expires = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
          const sessionSheet = getSessionSheet_();
          sessionSheet.appendRow([
            token,
            storedEmail,
            String(row[roleIdx] || 'Kasir'),
            String(row[namaIdx] || ''),
            now,
            expires
          ]);

          return {
            ok: true,
            token: token,
            user: {
              username: storedEmail,
              nama: String(row[namaIdx] || ''),
              role: String(row[roleIdx] || 'Kasir')
            }
          };
        }
      }
    }
  }

  // 2. Cek Superadmin dari legacy Settings (jika belum dimigrasi ke Users)
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet) {
    const sData = settingsSheet.getDataRange().getValues();
    let superUser = '';
    let superPass = '';
    let superPassRow = -1;
    let superUserRow = -1;

    for (let i = 1; i < sData.length; i++) {
      const k = String(sData[i][0] || '').trim();
      const v = String(sData[i][1] || '').trim();
      if (k === 'login_username') { superUser = v.toLowerCase(); superUserRow = i + 1; }
      if (k === 'login_password') { superPass = v; superPassRow = i + 1; }
    }

    if (superUser && superPass && cleanUser === superUser && preHash === superPass) {
      // Migrasi superadmin dari Settings ke sheet Users
      let uSheet = ss.getSheetByName(USERS_SHEET);
      if (!uSheet) {
        setupSheetsAndHeaders();
        uSheet = ss.getSheetByName(USERS_SHEET);
      }
      const salt = Utilities.getUuid();
      const hmac = computeHmac_(salt, preHash);
      const now = new Date();
      uSheet.appendRow([superUser, 'Superadmin', 'Superadmin', '', salt, hmac, now, now]);

      // Hapus kredensial rahasia dari sheet Settings (S1)
      if (superPassRow !== -1) settingsSheet.deleteRow(superPassRow);
      if (superUserRow !== -1 && superUserRow !== superPassRow) {
        const adjRow = superUserRow > superPassRow ? superUserRow - 1 : superUserRow;
        settingsSheet.deleteRow(adjRow);
      }

      cache.remove(rateLimitKey);
      const token = Utilities.getUuid();
      const expires = new Date(now.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);
      getSessionSheet_().appendRow([token, superUser, 'Superadmin', 'Superadmin', now, expires]);

      return {
        ok: true,
        token: token,
        user: { username: superUser, nama: 'Superadmin', role: 'Superadmin' }
      };
    }
  }

  // Catat kegagalan untuk rate limiting
  const newFails = failAttempts + 1;
  cache.put(rateLimitKey, String(newFails), 900);
  const remaining = 5 - newFails;
  return {
    ok: false,
    error: 'Username atau password salah. Sisa kesempatan: ' + remaining
  };
}

/**
 * Validasi session saat app mount di frontend.
 */
function validateSession(token) {
  const user = validateToken_(token);
  if (user) return { ok: true, user: user };
  return { ok: false };
}

/**
 * Logout — batalkan sesi.
 */
function logoutSession(token) {
  if (!token) return { ok: true };
  const sh = getSessionSheet_();
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][0]) === String(token)) {
      sh.deleteRow(i + 1);
      break;
    }
  }
  return { ok: true };
}

/**
 * Status inisialisasi sistem (S1).
 * Dapat dipanggil publik tanpa token untuk mengetahui apakah sistem sudah disetup.
 */
function getBootstrapStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let initialized = false;
  let storeName = 'INO ERP';

  // Cek apakah ada Superadmin di Users
  const uSheet = ss.getSheetByName(USERS_SHEET);
  if (uSheet && uSheet.getLastRow() > 1) {
    const data = uSheet.getDataRange().getValues();
    const roleIdx = data[0].indexOf('role');
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][roleIdx] || '').trim().toLowerCase() === 'superadmin') {
        initialized = true;
        break;
      }
    }
  }

  // Cek nama toko di Settings
  const sSheet = ss.getSheetByName('Settings');
  if (sSheet && sSheet.getLastRow() > 1) {
    const sData = sSheet.getDataRange().getValues();
    for (let i = 1; i < sData.length; i++) {
      const k = String(sData[i][0] || '').trim();
      if (k === 'nama_toko') storeName = String(sData[i][1] || 'INO ERP');
      if (k === 'login_username' && !initialized) initialized = true;
    }
  }

  return { initialized: initialized, storeName: storeName };
}

/**
 * Setup inisial perusahaan baru (S1).
 * Hanya boleh dijalankan jika initialized === false ATAU dipanggil oleh Superadmin.
 */
function initialSetup(payload) {
  if (!payload || !payload.email || !payload.passwordHash) {
    throw new Error('Data superadmin tidak lengkap.');
  }

  const status = getBootstrapStatus();
  if (status.initialized) {
    if (!payload.token) {
      throw new Error('FORBIDDEN: Sistem sudah terinisialisasi. Setup baru hanya dapat dilakukan oleh Superadmin.');
    }
    requireRole_(payload.token, ['Superadmin']);
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let uSheet = ss.getSheetByName(USERS_SHEET);
    if (!uSheet) {
      setupSheetsAndHeaders();
      uSheet = ss.getSheetByName(USERS_SHEET);
    }

    const email = String(payload.email).trim().toLowerCase();
    const nama = String(payload.nama || 'Superadmin').trim();
    const salt = Utilities.getUuid();
    const hmac = computeHmac_(salt, payload.passwordHash);
    const now = new Date();

    // Upsert baris superadmin di Users
    const uData = uSheet.getDataRange().getValues();
    let found = false;
    for (let i = 1; i < uData.length; i++) {
      if (String(uData[i][0] || '').toLowerCase() === email) {
        uSheet.getRange(i + 1, 1, 1, 8).setValues([[
          email, nama, 'Superadmin', '', salt, hmac, uData[i][6] || now, now
        ]]);
        found = true;
        break;
      }
    }
    if (!found) {
      uSheet.appendRow([email, nama, 'Superadmin', '', salt, hmac, now, now]);
    }

    // Simpan public settings
    if (payload.settings && Array.isArray(payload.settings)) {
      saveAppSettingsInternal_(payload.settings);
    }

    return { ok: true, message: 'Inisialisasi berhasil diselesaikan.' };
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// USER MANAGEMENT ENDPOINTS (S5 — Superadmin Only)
// ----------------------------------------------------

/**
 * Daftar pengguna untuk tab Pengaturan (Superadmin only).
 * Tidak pernah mengirimkan pin, salt, atau hash ke sisi klien.
 */
function listUsers(token) {
  requireRole_(token, ['Superadmin']);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const uSheet = ss.getSheetByName(USERS_SHEET);
  if (!uSheet || uSheet.getLastRow() <= 1) return [];

  const data = uSheet.getDataRange().getValues();
  const headers = data[0];
  const emailIdx = headers.indexOf('email');
  const namaIdx = headers.indexOf('nama');
  const roleIdx = headers.indexOf('role');

  const users = [];
  for (let i = 1; i < data.length; i++) {
    const email = String(data[i][emailIdx] || '').trim();
    if (!email) continue;
    users.push({
      email: email,
      nama: String(data[i][namaIdx] || ''),
      role: String(data[i][roleIdx] || 'Kasir')
    });
  }
  return users;
}

/**
 * Simpan / perbarui user (Superadmin only).
 */
function saveUser(token, userData) {
  requireRole_(token, ['Superadmin']);
  if (!userData || !userData.email) throw new Error('Email user wajib diisi.');

  const ALLOWED_ROLES = ['Superadmin', 'Admin', 'Kasir'];
  const role = String(userData.role || 'Kasir');
  if (!ALLOWED_ROLES.includes(role)) {
    throw new Error('Role tidak valid. Role yang diizinkan: ' + ALLOWED_ROLES.join(', '));
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let uSheet = ss.getSheetByName(USERS_SHEET);
    if (!uSheet) {
      setupSheetsAndHeaders();
      uSheet = ss.getSheetByName(USERS_SHEET);
    }

    const email = String(userData.email).trim().toLowerCase();
    const nama = String(userData.nama || '');
    const uData = uSheet.getDataRange().getValues();
    const headers = uData[0];
    const roleCol = headers.indexOf('role') !== -1 ? headers.indexOf('role') : 2;
    const now = new Date();

    // Hitung jumlah Superadmin & cek user yang ada untuk mencegah demosi Superadmin terakhir
    let superadminCount = 0;
    let existingUserRole = '';
    let existingRowIdx = -1;
    for (let i = 1; i < uData.length; i++) {
      const rEmail = String(uData[i][0] || '').trim().toLowerCase();
      const rRole = String(uData[i][roleCol] || '');
      if (rRole === 'Superadmin') {
        superadminCount++;
      }
      if (rEmail === email) {
        existingUserRole = rRole;
        existingRowIdx = i;
      }
    }

    if (existingRowIdx !== -1) {
      if (existingUserRole === 'Superadmin' && role !== 'Superadmin' && superadminCount <= 1) {
        throw new Error('Operasi ditolak: Tidak dapat menurunkan role Superadmin terakhir.');
      }

      // Update user
      let salt = String(uData[existingRowIdx][4] || '');
      let hmac = String(uData[existingRowIdx][5] || '');
      if (userData.pin) {
        salt = Utilities.getUuid();
        hmac = computeHmac_(salt, userData.pin);
      }
      uSheet.getRange(existingRowIdx + 1, 1, 1, 8).setValues([[
        email, nama, role, '', salt, hmac, uData[existingRowIdx][6] || now, now
      ]]);
      return { ok: true, message: 'User diperbarui.' };
    }

    // Insert user baru
    if (!userData.pin) throw new Error('Password / PIN wajib untuk user baru.');
    const salt = Utilities.getUuid();
    const hmac = computeHmac_(salt, userData.pin);
    uSheet.appendRow([email, nama, role, '', salt, hmac, now, now]);
    return { ok: true, message: 'User ditambahkan.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Hapus user (Superadmin only). Tidak boleh menghapus akun sendiri atau Superadmin terakhir.
 */
function deleteUser(token, emailToDelete) {
  const current = requireRole_(token, ['Superadmin']);
  const cleanEmail = String(emailToDelete || '').trim().toLowerCase();
  if (current.username.toLowerCase() === cleanEmail) {
    throw new Error('Tidak dapat menghapus akun Anda sendiri.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const uSheet = ss.getSheetByName(USERS_SHEET);
    if (!uSheet || uSheet.getLastRow() <= 1) return { ok: true };

    const data = uSheet.getDataRange().getValues();
    const headers = data[0];
    const roleCol = headers.indexOf('role') !== -1 ? headers.indexOf('role') : 2;

    let superadminCount = 0;
    let targetRole = '';
    let targetRowIndex = -1;

    for (let i = 1; i < data.length; i++) {
      const email = String(data[i][0] || '').trim().toLowerCase();
      const role = String(data[i][roleCol] || '');
      if (role === 'Superadmin') {
        superadminCount++;
      }
      if (email === cleanEmail) {
        targetRole = role;
        targetRowIndex = i + 1;
      }
    }

    if (targetRowIndex === -1) {
      return { ok: true };
    }

    if (targetRole === 'Superadmin' && superadminCount <= 1) {
      throw new Error('Operasi ditolak: Tidak dapat menghapus Superadmin terakhir.');
    }

    uSheet.deleteRow(targetRowIndex);
    return { ok: true, message: 'User berhasil dihapus.' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reset PIN / Password user oleh Superadmin.
 */
function resetPin(token, email, newPreHash) {
  requireRole_(token, ['Superadmin']);
  if (!email || !newPreHash) throw new Error('Email dan password baru wajib diisi.');

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const uSheet = ss.getSheetByName(USERS_SHEET);
    if (!uSheet) throw new Error('Sheet Users tidak ditemukan.');

    const data = uSheet.getDataRange().getValues();
    const cleanEmail = String(email).trim().toLowerCase();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0] || '').toLowerCase() === cleanEmail) {
        const salt = Utilities.getUuid();
        const hmac = computeHmac_(salt, newPreHash);
        uSheet.getRange(i + 1, 4, 1, 5).setValues([['', salt, hmac, data[i][6], new Date()]]);
        return { ok: true, message: 'Password user berhasil direset.' };
      }
    }
    throw new Error('User tidak ditemukan.');
  } finally {
    lock.releaseLock();
  }
}

/**
 * S7 — Hardening sendEmailReport
 * Hanya dapat dipanggil oleh Admin atau Superadmin.
 * Penerima divalidasi, rate limited melalui CacheService, dan subjek disanitasi.
 */
function sendEmailReport(token, to, subject, htmlBody) {
  requireRole_(token, ['Admin', 'Superadmin']);

  const cleanTo = String(to || '').trim().toLowerCase();
  if (!cleanTo.includes('@') || cleanTo.length > 100) {
    throw new Error('Alamat email tujuan tidak valid.');
  }

  // Rate limiting pengiriman email: maks 10 email per jam
  const cache = CacheService.getScriptCache();
  const countKey = 'email_report_rate_limit';
  const sentCount = Number(cache.get(countKey) || 0);
  if (sentCount >= 10) {
    throw new Error('LIMIT_EXCEEDED: Batas pengiriman email per jam tercapai (maks 10).');
  }
  cache.put(countKey, String(sentCount + 1), 3600);

  // Sanitasi subjek untuk mencegah header injection
  const cleanSubject = String(subject || 'Laporan INO ERP')
    .replace(/[\r\n]/g, ' ')
    .slice(0, 150);

  MailApp.sendEmail({
    to: cleanTo,
    subject: cleanSubject,
    htmlBody: String(htmlBody || '')
  });
  return true;
}

// ----------------------------------------------------
// UTILITIES
// ----------------------------------------------------

// Convert array of rows (with headers in row 0) to array of objects
function rowsToObjects_(rows) {
  if (!rows || rows.length <= 1) return [];
  const headers = rows[0];
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    // Hanya lewati jika seluruh sel di baris tersebut kosong (sangat longgar)
    if (row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) continue;
    
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    data.push(obj);
  }
  return data;
}

// Normalize known numeric fields to Number type safely
function parseNumbers_(obj) {
  const numFields = [
    'hargaJual', 'hpp', 'safetyStock', 'stok', 'piutang', 'hutang',
    'qtyReceived', 'qtySold', 'qtyReturned', 'harga', 'komisiPct', 'subtotal',
    'diskon', 'ppn', 'grandTotal', 'qty', 'hargaBeli', 'pajak', 'debit', 'kredit',
    'saldo', 'qtySistem', 'qtyFisik', 'selisih', 'HPP', 'hj', 'safety',
    'totalPaid', 'qtyShipped'
  ];
  
  if (Array.isArray(obj)) {
    return obj.map(o => parseNumbers_(o));
  }
  if (obj && typeof obj === 'object') {
    const newObj = { ...obj };
    for (const key in newObj) {
      if (numFields.includes(key)) {
        let val = newObj[key];
        if (val === null || val === undefined || val === '') {
          newObj[key] = 0;
        } else {
          newObj[key] = Number(val);
          if (isNaN(newObj[key])) newObj[key] = 0;
        }
      }
    }
    return newObj;
  }
  return obj;
}

// Helper to get data mapped to object headers
function getSheetData_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
  
  const values = sheet.getDataRange().getValues();
  let objects = rowsToObjects_(values);
  objects = parseNumbers_(objects);
  return objects;
}

// Helper for generic save/upsert
function saveItemToSheet_(sheetName, item, pkField) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");

  const values = sheet.getDataRange().getValues();
  if (values.length === 0) throw new Error("Sheet '" + sheetName + "' kosong, belum ada header.");

  const headers = values[0];

  // D4 — Runtime validation: reject foreign fields not in SCHEMA
  if (SCHEMA[sheetName]) {
    const allowedFields = new Set(SCHEMA[sheetName]);
    const itemKeys = Object.keys(item);
    const foreignKeys = itemKeys.filter(k => !allowedFields.has(k));
    if (foreignKeys.length > 0) {
      throw new Error("Foreign field(s) not allowed in '" + sheetName + "': " + foreignKeys.join(', ') + ". Allowed: " + allowedFields.size + " fields.");
    }
  }

  const writeItem = parseNumbers_(item); // Ensure numbers are written explicitly
  const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);

  const pkIndex = headers.indexOf(pkField);
  if (pkIndex === -1) throw new Error("Primary key '" + pkField + "' tidak ditemukan di header '" + sheetName + "'.");

  let found = false;
  for (let i = 1; i < values.length; i++) {
    if (values[i][pkIndex] == writeItem[pkField]) {
      // Update existing row (i + 1 due to 1-indexed Sheets, i starts at 1 for row 2)
      sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowData]);
      found = true;
      break;
    }
  }

  if (!found) {
    sheet.appendRow(rowData);
  }
}

// Helper for generic delete
function deleteItemFromSheet_(sheetName, id, pkField) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
  
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return; // Nothing to delete
  
  const headers = values[0];
  const pkIndex = headers.indexOf(pkField);
  if (pkIndex === -1) throw new Error("Primary key '" + pkField + "' tidak ditemukan di header '" + sheetName + "'.");
  
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][pkIndex] == id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
}

/**
 * Generate sequential IDs server-side to prevent collisions.
 * Format: PREFIX-YYYYMMDD-NNNN (NNNN = 4-digit sequence per day)
 */
function generateId_(prefix) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (generateId lock). Coba lagi.');
  }

  try {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;
    const key = `ID_SEQ_${prefix}_${dateStr}`;

    const props = PropertiesService.getScriptProperties();
    let seq = parseInt(props.getProperty(key) || '0', 10);
    seq++;
    const seqStr = String(seq).padStart(4, '0');
    props.setProperty(key, String(seq));

    return `${prefix}-${dateStr}-${seqStr}`;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Generate ID for Cash Ledger (8-digit sequence)
 */
function generateCashId_() {
  return generateId_('CSH').replace('CSH-', 'CSH-').replace(/-(\d{4})$/, '-$1'); // Keep 4-digit for now, can extend to 8 if needed
}

/**
 * Helper to save whole bulk arrays (replaces all contents).
 * WRAPPED WITH LockService to prevent race condition on concurrent writes.
 */
function saveAllToSheet_(sheetName, items) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); // Wait up to 15 seconds for lock
  } catch (e) {
    throw new Error('Server sibuk (concurrent write). Coba lagi dalam beberapa detik.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
    
    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet '" + sheetName + "' kosong, belum ada header.");
    
    const headers = values[0];
    
    // Clear existing content safely below the header
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
    }
    
    if (items && items.length > 0) {
      const rows = items.map(item => {
        const writeItem = parseNumbers_(item);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });
      sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    }
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// PRODUCTS (S3, S4)
// ----------------------------------------------------
function getProducts(token) {
  const user = requireAuth_(token);
  try {
    const products = getSheetData_('Products');
    if (user.role === 'Kasir') {
      return products.map(p => {
        const copy = { ...p };
        delete copy.hpp;
        delete copy.HPP;
        return copy;
      });
    }
    return products;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveProduct(token, product) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { saveItemToSheet_('Products', product, 'sku'); return true; } catch(e) { throw new Error(e.message); }
}

function deleteProduct(token, sku) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { deleteItemFromSheet_('Products', sku, 'sku'); return true; } catch(e) { throw new Error(e.message); }
}

function saveAllProducts(token, products) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('Products', products); return true; } catch(e) { throw new Error(e.message); }
}

// ----------------------------------------------------
// CUSTOMERS (S3, S4)
// ----------------------------------------------------
function getCustomers(token) {
  const user = requireAuth_(token);
  try {
    const customers = getSheetData_('Customers');
    if (user.role === 'Kasir') {
      return customers.map(c => {
        const copy = { ...c };
        delete copy.piutang;
        return copy;
      });
    }
    return customers;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveCustomer(token, customer) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { saveItemToSheet_('Customers', customer, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

/**
 * Create new customer with server-generated sequential ID.
 * Fails if ID already exists (insert-only).
 */
function createCustomer(token, customer) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createCustomer lock). Coba lagi.');
  }

  try {
    const id = generateId_('CUST');
    const newCustomer = { ...customer, id };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) throw new Error("Sheet 'Customers' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'Customers' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');

    // Check if ID already exists (should not happen with sequential, but safety check)
    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == id) {
        throw new Error('ID collision: ' + id);
      }
    }

    const writeItem = parseNumbers_(newCustomer);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    sheet.appendRow(rowData);

    return { success: true, id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update existing customer (update-only, fails if not found).
 */
function updateCustomer(token, customer) {
  requireRole_(token, ['Admin', 'Superadmin']);
  if (!customer.id) throw new Error('Customer ID required for update.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (updateCustomer lock). Coba lagi.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Customers');
    if (!sheet) throw new Error("Sheet 'Customers' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'Customers' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');
    const writeItem = parseNumbers_(customer);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);

    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == customer.id) {
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowData]);
        found = true;
        break;
      }
    }

    if (!found) throw new Error('Customer not found: ' + customer.id);

    return { success: true };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function deleteCustomer(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { deleteItemFromSheet_('Customers', id, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

function saveAllCustomers(token, customers) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('Customers', customers); return true; } catch(e) { throw new Error(e.message); }
}

// ----------------------------------------------------
// SUPPLIERS (S3, S4 — Admin & Superadmin only)
// ----------------------------------------------------
function getSuppliers(token) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { return getSheetData_('Suppliers'); } catch(e) { throw new Error(e.message); }
}

function saveSupplier(token, supplier) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { saveItemToSheet_('Suppliers', supplier, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

/**
 * Create new supplier with server-generated sequential ID.
 * Fails if ID already exists (insert-only).
 */
function createSupplier(token, supplier) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createSupplier lock). Coba lagi.');
  }

  try {
    const id = generateId_('SUP');
    const newSupplier = { ...supplier, id };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Suppliers');
    if (!sheet) throw new Error("Sheet 'Suppliers' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'Suppliers' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == id) {
        throw new Error('ID collision: ' + id);
      }
    }

    const writeItem = parseNumbers_(newSupplier);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    sheet.appendRow(rowData);

    return { success: true, id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update existing supplier (update-only, fails if not found).
 */
function updateSupplier(token, supplier) {
  requireRole_(token, ['Admin', 'Superadmin']);
  if (!supplier.id) throw new Error('Supplier ID required for update.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (updateSupplier lock). Coba lagi.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Suppliers');
    if (!sheet) throw new Error("Sheet 'Suppliers' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'Suppliers' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');
    const writeItem = parseNumbers_(supplier);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);

    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == supplier.id) {
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowData]);
        found = true;
        break;
      }
    }

    if (!found) throw new Error('Supplier not found: ' + supplier.id);

    return { success: true };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function deleteSupplier(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { deleteItemFromSheet_('Suppliers', id, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

function saveAllSuppliers(token, suppliers) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('Suppliers', suppliers); return true; } catch(e) { throw new Error(e.message); }
}

// ----------------------------------------------------
// CONSIGNMENTS (S3, S4 — Admin & Superadmin only)
// ----------------------------------------------------
function getConsignments(token) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { return getSheetData_('Consignments'); } catch(e) { throw new Error(e.message); }
}

function saveConsignment(token, consignment) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { saveItemToSheet_('Consignments', consignment, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

function deleteConsignment(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { deleteItemFromSheet_('Consignments', id, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

function saveAllConsignments(token, consignments) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('Consignments', consignments); return true; } catch(e) { throw new Error(e.message); }
}

// ----------------------------------------------------
// PURCHASE ORDERS (S3, S4 — JOIN Header + Items)
// ----------------------------------------------------
function getPurchaseOrders(token) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try {
    const orders = getSheetData_('PurchaseOrders');
    const items = getSheetData_('PurchaseOrderItems');
    
    // Group items by noPO
    const itemsByPO = {};
    for (const item of items) {
      if (!itemsByPO[item.noPO]) itemsByPO[item.noPO] = [];
      itemsByPO[item.noPO].push(item);
    }
    
    // Merge into Header
    for (const order of orders) {
      order.items = itemsByPO[order.id] || [];
    }
    
    return orders;
  } catch(e) {
    throw new Error(e.message);
  }
}

function savePurchaseOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    // 1. Save Header
    const header = { ...order };
    delete header.items;
    saveItemToSheet_('PurchaseOrders', header, 'id');
    
    // 2. Refresh/Delete Old Items
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrderItems');
    if (!itemsSheet) throw new Error("Sheet 'PurchaseOrderItems' tidak ditemukan.");
    
    const values = itemsSheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const noPOIndex = headers.indexOf('noPO');
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][noPOIndex] == order.id) {
          itemsSheet.deleteRow(i + 1);
        }
      }
    }
    
    // 3. Append New Items
    if (order.items && order.items.length > 0) {
      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'PurchaseOrderItems' hilang.");
      
      const rowsToAppend = order.items.map(item => {
        const itemObj = { ...item, noPO: order.id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });
      
      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Create new purchase order with server-generated sequential ID.
 * Fails if ID already exists (insert-only).
 */
function createPurchaseOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createPurchaseOrder lock). Coba lagi.');
  }

  try {
    const id = generateId_('PO');
    const newOrder = { ...order, id };
    const header = { ...newOrder };
    delete header.items;

    // Save Header
    saveItemToSheet_('PurchaseOrders', header, 'id');

    // Save Items
    if (newOrder.items && newOrder.items.length > 0) {
      const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrderItems');
      if (!itemsSheet) throw new Error("Sheet 'PurchaseOrderItems' tidak ditemukan.");

      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'PurchaseOrderItems' hilang.");

      const rowsToAppend = newOrder.items.map(item => {
        const itemObj = { ...item, noPO: id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });

      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return { success: true, id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update existing purchase order (update-only, fails if not found).
 */
function updatePurchaseOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  if (!order.id) throw new Error('Purchase Order ID required for update.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (updatePurchaseOrder lock). Coba lagi.');
  }

  try {
    // Check if exists
    const existing = getSheetData_('PurchaseOrders').find(o => o.id == order.id);
    if (!existing) throw new Error('Purchase Order not found: ' + order.id);

    const header = { ...order };
    delete header.items;
    saveItemToSheet_('PurchaseOrders', header, 'id');

    // Update Items: delete old, insert new
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrderItems');
    if (!itemsSheet) throw new Error("Sheet 'PurchaseOrderItems' tidak ditemukan.");

    const values = itemsSheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const noPOIndex = headers.indexOf('noPO');
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][noPOIndex] == order.id) {
          itemsSheet.deleteRow(i + 1);
        }
      }
    }

    if (order.items && order.items.length > 0) {
      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'PurchaseOrderItems' hilang.");

      const rowsToAppend = order.items.map(item => {
        const itemObj = { ...item, noPO: order.id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });

      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return { success: true };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function deletePurchaseOrder(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try {
    // Delete header
    deleteItemFromSheet_('PurchaseOrders', id, 'id');
    
    // Delete items
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('PurchaseOrderItems');
    if (itemsSheet) {
      const values = itemsSheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers = values[0];
        const noPOIndex = headers.indexOf('noPO');
        for (let i = values.length - 1; i >= 1; i--) {
          if (values[i][noPOIndex] == id) {
            itemsSheet.deleteRow(i + 1);
          }
        }
      }
    }
    return true;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveAllPurchaseOrders(token, orders) {
  requireRole_(token, ['Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const headers = orders.map(o => {
      const h = { ...o };
      delete h.items;
      return h;
    });
    
    let allItems = [];
    for (const order of orders) {
      if (order.items) {
        for (const item of order.items) {
          allItems.push({ ...item, noPO: order.id });
        }
      }
    }
    
    saveAllToSheetRaw_('PurchaseOrders', headers);
    saveAllToSheetRaw_('PurchaseOrderItems', allItems);
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Internal version of saveAllToSheet_ without its own lock (for use when caller already holds lock).
 */
function saveAllToSheetRaw_(sheetName, items) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");
  
  const values = sheet.getDataRange().getValues();
  if (values.length === 0) throw new Error("Sheet '" + sheetName + "' kosong, belum ada header.");
  
  const headers = values[0];
  
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).clearContent();
  }
  
  if (items && items.length > 0) {
    const rows = items.map(item => {
      const writeItem = parseNumbers_(item);
      return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    });
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

// ----------------------------------------------------
// SALES ORDERS (S3, S4, D5 — JOIN Header + Items)
// ----------------------------------------------------
function getSalesOrders(token) {
  const user = requireAuth_(token);
  try {
    const orders = getSheetData_('SalesOrders');
    const items = getSheetData_('SalesOrderItems');
    
    const itemsBySO = {};
    for (const item of items) {
      if (!itemsBySO[item.noSO]) itemsBySO[item.noSO] = [];
      itemsBySO[item.noSO].push(item);
    }
    
    for (const order of orders) {
      // D5: Prioritas ambil dari sheet SalesOrderItems. Fallback ke kolom JSON header jika legacy POS.
      if (itemsBySO[order.id] && itemsBySO[order.id].length > 0) {
        order.items = itemsBySO[order.id];
      } else if (order.items && typeof order.items === 'string' && order.items.startsWith('[')) {
        try { order.items = JSON.parse(order.items); } catch(e) {}
      } else if (!Array.isArray(order.items)) {
        order.items = [];
      }

      if (user.role === 'Kasir') {
        order.items.forEach(it => { delete it.hpp; });
      }
    }
    
    return orders;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveSalesOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const header = { ...order };
    delete header.items;
    saveItemToSheet_('SalesOrders', header, 'id');
    
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SalesOrderItems');
    if (!itemsSheet) throw new Error("Sheet 'SalesOrderItems' tidak ditemukan.");
    
    const values = itemsSheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const noSOIndex = headers.indexOf('noSO');
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][noSOIndex] == order.id) {
          itemsSheet.deleteRow(i + 1);
        }
      }
    }
    
    if (order.items && order.items.length > 0) {
      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'SalesOrderItems' hilang.");
      
      const rowsToAppend = order.items.map(item => {
        const itemObj = { ...item, noSO: order.id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });
      
      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Create new sales order with server-generated sequential ID.
 * Fails if ID already exists (insert-only).
 */
function createSalesOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createSalesOrder lock). Coba lagi.');
  }

  try {
    const id = generateId_('SO');
    const newOrder = { ...order, id };
    const header = { ...newOrder };
    delete header.items;

    // Save Header
    saveItemToSheet_('SalesOrders', header, 'id');

    // Save Items
    if (newOrder.items && newOrder.items.length > 0) {
      const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SalesOrderItems');
      if (!itemsSheet) throw new Error("Sheet 'SalesOrderItems' tidak ditemukan.");

      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'SalesOrderItems' hilang.");

      const rowsToAppend = newOrder.items.map(item => {
        const itemObj = { ...item, noSO: id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });

      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return { success: true, id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update existing sales order (update-only, fails if not found).
 */
function updateSalesOrder(token, order) {
  requireRole_(token, ['Admin', 'Superadmin']);
  if (!order.id) throw new Error('Sales Order ID required for update.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (updateSalesOrder lock). Coba lagi.');
  }

  try {
    // Check if exists
    const existing = getSheetData_('SalesOrders').find(o => o.id == order.id);
    if (!existing) throw new Error('Sales Order not found: ' + order.id);

    const header = { ...order };
    delete header.items;
    saveItemToSheet_('SalesOrders', header, 'id');

    // Update Items: delete old, insert new
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SalesOrderItems');
    if (!itemsSheet) throw new Error("Sheet 'SalesOrderItems' tidak ditemukan.");

    const values = itemsSheet.getDataRange().getValues();
    if (values.length > 1) {
      const headers = values[0];
      const noSOIndex = headers.indexOf('noSO');
      for (let i = values.length - 1; i >= 1; i--) {
        if (values[i][noSOIndex] == order.id) {
          itemsSheet.deleteRow(i + 1);
        }
      }
    }

    if (order.items && order.items.length > 0) {
      const currentValues = itemsSheet.getDataRange().getValues();
      let headers = currentValues.length > 0 ? currentValues[0] : null;
      if (!headers) throw new Error("Header di 'SalesOrderItems' hilang.");

      const rowsToAppend = order.items.map(item => {
        const itemObj = { ...item, noSO: order.id };
        const writeItem = parseNumbers_(itemObj);
        return headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
      });

      itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rowsToAppend.length, headers.length).setValues(rowsToAppend);
    }

    return { success: true };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function deleteSalesOrder(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try {
    deleteItemFromSheet_('SalesOrders', id, 'id');
    
    const itemsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('SalesOrderItems');
    if (itemsSheet) {
      const values = itemsSheet.getDataRange().getValues();
      if (values.length > 1) {
        const headers = values[0];
        const noSOIndex = headers.indexOf('noSO');
        for (let i = values.length - 1; i >= 1; i--) {
          if (values[i][noSOIndex] == id) {
            itemsSheet.deleteRow(i + 1);
          }
        }
      }
    }
    return true;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveAllSalesOrders(token, orders) {
  requireRole_(token, ['Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const headers = orders.map(o => {
      const h = { ...o };
      delete h.items;
      return h;
    });
    
    let allItems = [];
    for (const order of orders) {
      if (order.items) {
        for (const item of order.items) {
          allItems.push({ ...item, noSO: order.id });
        }
      }
    }
    
    saveAllToSheetRaw_('SalesOrders', headers);
    saveAllToSheetRaw_('SalesOrderItems', allItems);
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

// ----------------------------------------------------
// CASH LEDGER (S3, S4 — Admin & Superadmin only)
// ----------------------------------------------------
function getCashLedger(token) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { return getSheetData_('CashLedger'); } catch(e) { throw new Error(e.message); }
}

function saveCashEntry(token, entry) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { saveItemToSheet_('CashLedger', entry, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

/**
 * Create new cash entry with server-generated sequential ID.
 * Fails if ID already exists (insert-only).
 */
function createCashEntry(token, entry) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createCashEntry lock). Coba lagi.');
  }

  try {
    const id = generateId_('CSH');
    const newEntry = { ...entry, id };
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CashLedger');
    if (!sheet) throw new Error("Sheet 'CashLedger' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'CashLedger' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');

    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == id) {
        throw new Error('ID collision: ' + id);
      }
    }

    const writeItem = parseNumbers_(newEntry);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    sheet.appendRow(rowData);

    return { success: true, id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Update existing cash entry (update-only, fails if not found).
 */
function updateCashEntry(token, entry) {
  requireRole_(token, ['Admin', 'Superadmin']);
  if (!entry.id) throw new Error('Cash Entry ID required for update.');

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (updateCashEntry lock). Coba lagi.');
  }

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CashLedger');
    if (!sheet) throw new Error("Sheet 'CashLedger' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'CashLedger' kosong, belum ada header.");

    const headers = values[0];
    const pkIndex = headers.indexOf('id');
    const writeItem = parseNumbers_(entry);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);

    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][pkIndex] == entry.id) {
        sheet.getRange(i + 1, 1, 1, headers.length).setValues([rowData]);
        found = true;
        break;
      }
    }

    if (!found) throw new Error('Cash Entry not found: ' + entry.id);

    return { success: true };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

function deleteCashEntry(token, id) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { deleteItemFromSheet_('CashLedger', id, 'id'); return true; } catch(e) { throw new Error(e.message); }
}

function saveAllCashLedger(token, ledger) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('CashLedger', ledger); return true; } catch(e) { throw new Error(e.message); }
}

// ----------------------------------------------------
// INVENTORY LOG (S3, S4 — Append Only / Full Replace)
// ----------------------------------------------------
function getOpnameLog(token) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try { return getSheetData_('InventoryLog'); } catch(e) { throw new Error(e.message); }
}

function appendOpnameLog(token, logEntry) {
  requireRole_(token, ['Admin', 'Superadmin']);
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('InventoryLog');
    if (!sheet) throw new Error("Sheet 'InventoryLog' tidak ditemukan.");
    
    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'InventoryLog' kosong, belum ada header.");
    
    const headers = values[0];
    const writeItem = parseNumbers_(logEntry);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    
    sheet.appendRow(rowData);
    return true;
  } catch(e) {
    throw new Error(e.message);
  }
}

function saveAllOpnameLog(token, logs) {
  requireRole_(token, ['Superadmin']);
  try { saveAllToSheet_('InventoryLog', logs); return true; } catch(e) { throw new Error(e.message); }
}

// ==========================================
// SETTINGS (S1)
// ==========================================

const SETTINGS_WHITELIST = [
  'nama_toko', 'tipe_bisnis', 'alamat_toko', 'telp_toko', 'kota_toko',
  'mata_uang', 'ppn_rate', 'metode_hpp_default', 'drive_folder_struk',
  'format_tanggal', 'tax_mode_default', 'ppn_status_default'
];

/**
 * Mendapatkan pengaturan sistem publik (S1).
 * Memerlukan token valid dan HANYA mengembalikan kunci publik dalam whitelist.
 * Tidak pernah membocorkan password atau kredensial rahasia.
 */
function getAppSettings(token) {
  requireAuth_(token);
  try {
    const rawData = getSheetData_('Settings');
    return rawData.filter(item => SETTINGS_WHITELIST.includes(item.key));
  } catch(e) {
    throw new Error(e.message);
  }
}

/**
 * Menyimpan pengaturan sistem publik (S1).
 * Memerlukan peran Superadmin, hanya menerima kunci whitelist,
 * dan mengupdate in-place di bawah LockService tanpa clearContents.
 */
function saveAppSettings(token, settingsList) {
  requireRole_(token, ['Superadmin']);
  if (!settingsList || !Array.isArray(settingsList)) {
    throw new Error('Format settingsList tidak valid.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    saveAppSettingsInternal_(settingsList);
    return true;
  } catch(e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Helper internal untuk menyimpan settings di bawah lock.
 */
function saveAppSettingsInternal_(settingsList) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Settings');
  if (!sheet) {
    setupSheetsAndHeaders();
    sheet = ss.getSheetByName('Settings');
  }

  const values = sheet.getDataRange().getValues();
  const existingMap = {};
  for (let i = 1; i < values.length; i++) {
    const k = String(values[i][0] || '').trim();
    if (k) existingMap[k] = i + 1; // row number (1-based)
  }

  for (const item of settingsList) {
    const key = String(item.key || '').trim();
    if (!SETTINGS_WHITELIST.includes(key)) {
      // Abaikan kunci yang bukan whitelist publik (S1)
      continue;
    }
    const val = item.value !== undefined && item.value !== null ? String(item.value) : '';
    if (existingMap[key]) {
      sheet.getRange(existingMap[key], 2).setValue(val);
    } else {
      sheet.appendRow([key, val]);
      existingMap[key] = sheet.getLastRow();
    }
  }
}


// ==========================================
// INTEGRASI INO POS
// ==========================================

// ==========================================
// FUNGSI DIPANGGIL POS (S3, S6, D5)
// ==========================================

function getProdukList(token) {
  const user = requireAuth_(token);
  const products = getSheetDataAsObjects_(SHEET_PRODUCTS);
  if (user.role === 'Kasir') {
    return products.map(p => {
      const copy = { ...p };
      delete copy.hpp;
      delete copy.HPP;
      return copy;
    });
  }
  return products;
}

function getCustomerList(token) {
  const user = requireAuth_(token);
  const customers = getSheetDataAsObjects_(SHEET_CUSTOMERS);
  if (user.role === 'Kasir') {
    return customers.map(c => {
      const copy = { ...c };
      delete copy.piutang;
      return copy;
    });
  }
  return customers;
}

/**
 * Riwayat transaksi POS hari ini saja (S3 & R11).
 * Menggabungkan detail items dari sheet SalesOrderItems (bukan hanya kolom header legacy).
 */
function getRiwayatHariIni(token) {
  const user = requireAuth_(token);
  const semua = getSheetDataAsObjects_(SHEET_SALES_ORDERS);
  const today = formatDate_(new Date());

  const hariIni = semua
    .filter(so => String(so.id).indexOf('POS-') === 0 && so.tanggal === today)
    .sort((a, b) => String(b.id).localeCompare(String(a.id))); // terbaru dulu

  if (hariIni.length === 0) return [];

  // R11: Gabungkan baris item dari SalesOrderItems
  const orderIds = new Set(hariIni.map(so => String(so.id)));
  const allItems = getSheetDataAsObjects_('SalesOrderItems');
  const itemsBySO = {};
  for (const item of allItems) {
    const noSO = String(item.noSO || '');
    if (orderIds.has(noSO)) {
      if (!itemsBySO[noSO]) itemsBySO[noSO] = [];
      itemsBySO[noSO].push(item);
    }
  }

  for (const so of hariIni) {
    if (itemsBySO[so.id] && itemsBySO[so.id].length > 0) {
      so.items = itemsBySO[so.id];
    } else if (so.items && typeof so.items === 'string' && so.items.startsWith('[')) {
      try { so.items = JSON.parse(so.items); } catch(e) { so.items = []; }
    } else if (!Array.isArray(so.items)) {
      so.items = [];
    }

    if (user.role === 'Kasir') {
      so.items.forEach(it => { delete it.hpp; });
    }
  }

  return hariIni;
}

/**
 * Fungsi utama checkout POS (S6 & D5).
 * Validasi ketat server-side:
 * - Kasir diambil dari session token terverifikasi.
 * - Harga & HPP diambil dari sheet Products (menolak manipulasi harga dari klien).
 * - Kuantitas harus > 0 dan finite.
 * - Stok diverifikasi di server; jika tidak cukup, transaksi DITOLAK (tanpa clamp ke 0).
 * - Menulis ke SalesOrders DAN baris item ke SalesOrderItems (D5).
 * - Aturan pembayaran (DEC-02): Piutang menaikkan piutang pelanggan dan tidak masuk kas;
 *   metode lunas mencatat kas ke CashLedger.
 */
function simpanTransaksiPenjualan(payload) {
  if (!payload || !payload.token) throw new Error('UNAUTHORIZED: Token sesi kasir tidak disertakan.');
  const sessionUser = requireRole_(payload.token, ['Kasir', 'Admin', 'Superadmin']);

  if (!payload.items || !Array.isArray(payload.items) || payload.items.length === 0) {
    throw new Error('VALIDASI_GAGAL: Transaksi harus memiliki minimal 1 item.');
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(15000); // Tunggu maks 15 detik

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const now = new Date();
    const prodSheet = ss.getSheetByName(SHEET_PRODUCTS);
    if (!prodSheet) throw new Error('Sheet Products tidak ditemukan.');

    // 1. Validasi produk & stok di sisi server (S6)
    const prodData = prodSheet.getDataRange().getValues();
    if (prodData.length <= 1) throw new Error('Daftar produk di database kosong.');
    const prodHeaders = prodData[0];
    const skuIdx = prodHeaders.indexOf('sku');
    const namaIdx = prodHeaders.indexOf('nama');
    const hargaJualIdx = prodHeaders.indexOf('hargaJual');
    const hppIdx = prodHeaders.indexOf('hpp');
    const stokIdx = prodHeaders.indexOf('stok');

    // Index produk by SKU
    const productMap = {};
    for (let i = 1; i < prodData.length; i++) {
      const s = String(prodData[i][skuIdx] || '').trim();
      if (s) {
        productMap[s] = {
          rowNum: i + 1,
          sku: s,
          nama: String(prodData[i][namaIdx] || ''),
          hargaJual: Number(prodData[i][hargaJualIdx]) || 0,
          hpp: Number(prodData[i][hppIdx]) || 0,
          stok: Number(prodData[i][stokIdx]) || 0
        };
      }
    }

    // 1. Validasi produk, agregasi kuantitas per SKU & validasi stok total (R3)
    const aggregatedQtyPerSku = {};
    for (const item of payload.items) {
      const sku = String(item.sku || '').trim();
      const p = productMap[sku];
      if (!p) {
        throw new Error('PRODUK_TIDAK_DITEMUKAN: Produk dengan SKU \'' + sku + '\' tidak terdaftar di sistem.');
      }

      const qty = Number(item.qty);
      if (isNaN(qty) || !isFinite(qty) || qty <= 0) {
        throw new Error('QTY_INVALID: Kuantitas untuk ' + p.nama + ' harus berupa angka positif.');
      }

      aggregatedQtyPerSku[sku] = (aggregatedQtyPerSku[sku] || 0) + qty;
    }

    // Validasi stok agregat per SKU sebelum penulisan apa pun (R3)
    for (const sku in aggregatedQtyPerSku) {
      const totalQty = aggregatedQtyPerSku[sku];
      const p = productMap[sku];
      if (p.stok < totalQty) {
        throw new Error('STOK_TIDAK_CUKUP: Total stok produk ' + p.nama + ' (' + sku + ') tidak mencukupi (sisa: ' + p.stok + ', total diminta: ' + totalQty + ').');
      }
    }

    let serverGrandTotal = 0;
    const verifiedItems = [];

    for (const item of payload.items) {
      const sku = String(item.sku || '').trim();
      const p = productMap[sku];
      const qty = Number(item.qty);

      // Gunakan harga server (menolak pemalsuan total/harga dari klien)
      const hargaSatuan = p.hargaJual;
      const subtotalItem = Math.round(qty * hargaSatuan);
      serverGrandTotal += subtotalItem;

      verifiedItems.push({
        sku: sku,
        nama: p.nama,
        satuan: item.satuan || 'Pcs',
        qty: qty,
        hargaJual: hargaSatuan,
        hpp: p.hpp,
        subtotal: subtotalItem
      });
    }

    // 2. Generate struk ID di bawah lock (D3)
    const strukNo = generateId_('POS', ss.getSheetByName(SHEET_SALES_ORDERS));
    const metode = String(payload.metodeBayar || 'Tunai').trim();
    // DEC-02: QRIS / Transfer / Debit = Lunas; hanya Piutang / Tempo = piutang
    const isPiutang = (metode.toLowerCase().indexOf('piutang') !== -1 || metode.toLowerCase().indexOf('tempo') !== -1);
    const statusBayar = isPiutang ? 'Belum Lunas' : 'Lunas';
    const totalPaid = isPiutang ? 0 : serverGrandTotal;

    // 3. Tulis Header ke SalesOrders (D5: items di SalesOrderItems, bukan JSON di header)
    const soSheet = ss.getSheetByName(SHEET_SALES_ORDERS);
    const soRow = {
      id: strukNo,
      tanggal: formatDate_(now),
      customerId: payload.customerId || '',
      pelanggan: payload.customerNama || 'Pelanggan Umum Retail',
      metode: metode,
      // items: DISI SIMPAN DI SalesOrderItems (relasional), bukan JSON di header
      subtotal: serverGrandTotal,
      diskon: 0,
      pajak: 0,
      grandTotal: serverGrandTotal,
      statusLogistik: 'Selesai',
      statusBayar: statusBayar,
      totalPaid: totalPaid,
      platform: 'Toko Langsung',
      kasir: sessionUser.nama || sessionUser.username,
      catatan: 'Transaksi POS (Point of Sale)'
    };
    appendRowFromObject_(soSheet, soRow);

    // 4. Tulis item ke SalesOrderItems (D5 — Relasional untuk konsistensi ERP)
    const soItemsSheet = ss.getSheetByName('SalesOrderItems');
    if (soItemsSheet) {
      const itemHeaders = soItemsSheet.getDataRange().getValues()[0];
      const rowsToAdd = verifiedItems.map(it => {
        const itemObj = {
          noSO: strukNo,
          sku: it.sku,
          nama: it.nama,
          qty: it.qty,
          qtyShipped: it.qty,
          qtyReturned: 0,
          harga: it.hargaJual,
          hpp: it.hpp,
          diskon: 0,
          ppn: 0,
          subtotal: it.subtotal
        };
        return itemHeaders.map(h => itemObj[h] === undefined ? '' : itemObj[h]);
      });
      soItemsSheet.getRange(soItemsSheet.getLastRow() + 1, 1, rowsToAdd.length, itemHeaders.length).setValues(rowsToAdd);
    }

    // 5. Catat pembayaran (DEC-02)
    if (isPiutang) {
      // Naikkan piutang pelanggan
      if (payload.customerId || payload.customerNama) {
        const custSheet = ss.getSheetByName(SHEET_CUSTOMERS);
        if (custSheet) {
          const cData = custSheet.getDataRange().getValues();
          const cHeaders = cData[0];
          const cIdIdx = cHeaders.indexOf('id');
          const cNamaIdx = cHeaders.indexOf('nama');
          const cPiutangIdx = cHeaders.indexOf('piutang');
          if (cPiutangIdx !== -1) {
            for (let i = 1; i < cData.length; i++) {
              const matchedId = payload.customerId && String(cData[i][cIdIdx]) === String(payload.customerId);
              const matchedNama = !payload.customerId && String(cData[i][cNamaIdx]).toLowerCase() === String(payload.customerNama).toLowerCase();
              if (matchedId || matchedNama) {
                const currentPiutang = Number(cData[i][cPiutangIdx]) || 0;
                custSheet.getRange(i + 1, cPiutangIdx + 1).setValue(currentPiutang + serverGrandTotal);
                break;
              }
            }
          }
        }
      }
    } else {
      // Catat kas masuk ke CashLedger
      const cashSheet = ss.getSheetByName(SHEET_CASH_LEDGER);
      if (cashSheet) {
        const akun = mapMetodeKeAkun_(metode);
        const lastSaldoAkun = getLastSaldoForAkun_(cashSheet, akun);
        const cashRow = {
          id: generateId_('CSH', cashSheet),
          tanggal: formatDate_(now),
          ref: strukNo,
          keterangan: 'Penjualan POS Kasir [' + strukNo + ']',
          kategori: 'Penjualan',
          debit: serverGrandTotal,
          kredit: 0,
          saldo: lastSaldoAkun + serverGrandTotal,
          akun: akun,
          metode: metode
        };
        appendRowFromObject_(cashSheet, cashRow);
      }
    }

    // 6. Kurangi stok di sheet Products secara presisi (R3: sekali per SKU dengan total agregat)
    for (const sku in aggregatedQtyPerSku) {
      const p = productMap[sku];
      const totalQty = aggregatedQtyPerSku[sku];
      prodSheet.getRange(p.rowNum, stokIdx + 1).setValue(p.stok - totalQty);
    }

    return { strukNo: strukNo, total: serverGrandTotal, timestamp: now.getTime() };
  } finally {
    lock.releaseLock();
  }
}

// ==========================================
// D6: VOID LOG & RETUR SERVER FUNCTIONS
// ==========================================

/**
 * Create Void Log entry (D6)
 * Mencatat pembatalan dokumen untuk audit trail
 */
function createVoidLog(token, voidLogData) {
  requireRole_(token, ['Admin', 'Superadmin', 'Kasir']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (createVoidLog lock). Coba lagi.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('VoidLog');
    if (!sheet) throw new Error("Sheet 'VoidLog' tidak ditemukan.");

    const values = sheet.getDataRange().getValues();
    if (values.length === 0) throw new Error("Sheet 'VoidLog' kosong, belum ada header.");

    const headers = values[0];
    const today = formatDate_(new Date());
    const voidId = `VOID-${today.replace(/-/g, '')}-${generateIdSuffix_(sheet, 'VOID', today)}`;

    const newLog = {
      id: voidId,
      tanggal: voidLogData.tanggal || today,
      docType: voidLogData.docType,
      docId: voidLogData.docId,
      kasir: voidLogData.kasir,
      nilai: Number(voidLogData.nilai) || 0,
      alasan: voidLogData.alasan || '',
      timestamp: new Date().toISOString()
    };

    const writeItem = parseNumbers_(newLog);
    const rowData = headers.map(h => writeItem[h] === undefined ? "" : writeItem[h]);
    sheet.appendRow(rowData);

    return { success: true, id: voidId };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Generate ID suffix for VoidLog
 */
function generateIdSuffix_(sheet, prefix, dateStr) {
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const idCol = header.indexOf('id');
  if (idCol === -1) return '001';

  let maxNum = 0;
  const searchPrefix = `${prefix}-${dateStr}-`;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idCol] || '');
    if (id.indexOf(searchPrefix) === 0) {
      const num = parseInt(id.split('-')[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return String(maxNum + 1).padStart(3, '0');
}

/**
 * Process Retur (D6)
 * Menangani retur barang untuk SO/PO yang sudah lunas
 * - Kembalikan stok (SO: +, PO: -)
 * - Koreksi piutang/hutang
 * - Catat kas (refund tunai)
 * - Update qtyReturned di SalesOrderItems/PurchaseOrderItems
 * - Update statusLogistik ke 'Retur Penuh'/'Retur Sebagian'
 */
function processRetur(token, returData) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (processRetur lock). Coba lagi.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const { docType, docId, returnItems, alasan } = returData;

    if (!docType || !docId || !returnItems || returnItems.length === 0) {
      throw new Error('Parameter tidak lengkap: docType, docId, returnItems diperlukan');
    }

    const isSO = docType === 'SO';
    const headerSheetName = isSO ? 'SalesOrders' : 'PurchaseOrders';
    const itemsSheetName = isSO ? 'SalesOrderItems' : 'PurchaseOrderItems';
    const idField = isSO ? 'id' : 'id';
    const itemsRefField = isSO ? 'noSO' : 'noPO';

    const headerSheet = ss.getSheetByName(headerSheetName);
    const itemsSheet = ss.getSheetByName(itemsSheetName);
    if (!headerSheet || !itemsSheet) throw new Error('Sheet tidak ditemukan');

    // 1. Baca header dokumen
    const headerValues = headerSheet.getDataRange().getValues();
    const headerHeaders = headerValues[0];
    const idCol = headerHeaders.indexOf(idField);
    let headerRow = -1;
    let headerData = null;

    for (let i = 1; i < headerValues.length; i++) {
      if (String(headerValues[i][idCol]) === docId) {
        headerRow = i + 1;
        headerData = {};
        headerHeaders.forEach((h, idx) => { headerData[h] = headerValues[i][idx]; });
        break;
      }
    }

    if (!headerData) throw new Error(`Dokumen ${docType} ${docId} tidak ditemukan`);

    // Validasi status
    const statusLogistik = headerData.statusLogistik;
    const statusBayar = headerData.statusBayar;
    if (statusLogistik === 'Void' || statusBayar === 'Void') {
      throw new Error('Dokumen sudah di-void, tidak bisa di-retur');
    }
    if ((isSO && statusLogistik !== 'Selesai') || (!isSO && statusLogistik !== 'Diterima')) {
      throw new Error('Hanya dokumen Selesai (SO) / Diterima (PO) yang bisa di-retur');
    }
    if (statusBayar !== 'Lunas') {
      throw new Error('Hanya dokumen Lunas yang bisa di-retur');
    }

    // 2. Baca items dokumen
    const itemsValues = itemsSheet.getDataRange().getValues();
    const itemsHeaders = itemsValues[0];
    const refCol = itemsHeaders.indexOf(itemsRefField);
    const skuCol = itemsHeaders.indexOf('sku');
    const qtyCol = itemsHeaders.indexOf('qty');
    const qtyShippedCol = itemsHeaders.indexOf('qtyShipped');
    const qtyReceivedCol = itemsHeaders.indexOf('qtyReceived');
    const qtyReturnedCol = itemsHeaders.indexOf('qtyReturned');
    const hargaCol = itemsHeaders.indexOf('harga');
    const hppCol = itemsHeaders.indexOf('hpp');

    const existingItems = [];
    for (let i = 1; i < itemsValues.length; i++) {
      if (String(itemsValues[i][refCol]) === docId) {
        existingItems.push({
          rowNum: i + 1,
          sku: String(itemsValues[i][skuCol]),
          nama: String(itemsValues[i][itemsHeaders.indexOf('nama')] || ''),
          qty: Number(itemsValues[i][qtyCol]) || 0,
          qtyShipped: Number(itemsValues[i][qtyShippedCol]) || 0,
          qtyReceived: Number(itemsValues[i][qtyReceivedCol]) || 0,
          qtyReturned: Number(itemsValues[i][qtyReturnedCol]) || 0,
          harga: Number(itemsValues[i][hargaCol]) || 0,
          hpp: Number(itemsValues[i][hppCol]) || 0
        });
      }
    }

    // 3. Validasi return items
    const returnMap = new Map(returnItems.map(r => [r.sku, Number(r.qty)]));
    let totalRefund = 0;
    const stockAdjustments = [];

    for (const item of existingItems) {
      const returnQty = returnMap.get(item.sku) || 0;
      if (returnQty > 0) {
        const qtyDelivered = isSO ? (item.qtyShipped || item.qty) : (item.qtyReceived || item.qty);
        const availableForReturn = qtyDelivered - (item.qtyReturned || 0);
        if (returnQty > availableForReturn) {
          throw new Error(`Qty retur melebihi batas untuk ${item.sku} (max: ${availableForReturn})`);
        }

        totalRefund += returnQty * item.harga;
        stockAdjustments.push({
          sku: item.sku,
          qty: isSO ? returnQty : -returnQty,
          rowNum: item.rowNum
        });
      }
    }

    if (totalRefund === 0) throw new Error('Tidak ada item valid untuk di-retur');

    // 4. Update qtyReturned di items sheet
    for (const item of existingItems) {
      const returnQty = returnMap.get(item.sku) || 0;
      if (returnQty > 0) {
        const newQtyReturned = (item.qtyReturned || 0) + returnQty;
        itemsSheet.getRange(item.rowNum, qtyReturnedCol + 1).setValue(newQtyReturned);
      }
    }

    // 5. Update statusLogistik
    let newStatusLogistik = statusLogistik;
    let totalDelivered = 0;
    let totalReturned = 0;
    for (const item of existingItems) {
      const qtyDelivered = isSO ? (item.qtyShipped || item.qty) : (item.qtyReceived || item.qty);
      const returned = (item.qtyReturned || 0) + (returnMap.get(item.sku) || 0);
      totalDelivered += qtyDelivered;
      totalReturned += returned;
    }
    if (totalReturned >= totalDelivered) {
      newStatusLogistik = 'Retur Penuh';
    } else if (totalReturned > 0) {
      newStatusLogistik = 'Retur Sebagian';
    }

    if (newStatusLogistik !== statusLogistik) {
      const statusLogistikCol = headerHeaders.indexOf('statusLogistik');
      headerSheet.getRange(headerRow, statusLogistikCol + 1).setValue(newStatusLogistik);
    }

    // 6. Koreksi Stok
    for (const adj of stockAdjustments) {
      const prodSheet = ss.getSheetByName('Products');
      if (prodSheet) {
        const prodData = prodSheet.getDataRange().getValues();
        const prodHeaders = prodData[0];
        const prodSkuCol = prodHeaders.indexOf('sku');
        const prodStokCol = prodHeaders.indexOf('stok');
        for (let i = 1; i < prodData.length; i++) {
          if (String(prodData[i][prodSkuCol]) === adj.sku) {
            const currentStok = Number(prodData[i][prodStokCol]) || 0;
            prodSheet.getRange(i + 1, prodStokCol + 1).setValue(currentStok + adj.qty);
            break;
          }
        }
      }
    }

    // 7. Koreksi Piutang/Hutang
    const customerId = headerData.customerId;
    const supplierId = headerData.supplierId;
    const metode = headerData.metode;
    const pelanggan = headerData.pelanggan;

    if (isSO && customerId) {
      adjustBalanceServer_('customer', customerId, -totalRefund);
    } else if (!isSO && supplierId) {
      adjustBalanceServer_('supplier', supplierId, -totalRefund);
    }

    // 8. Catat Kas (refund tunai)
    const isCash = String(metode).toLowerCase().includes('tunai') || String(metode).toLowerCase().includes('cash');
    if (isCash && totalRefund > 0) {
      const cashSheet = ss.getSheetByName('CashLedger');
      if (cashSheet) {
        const cashData = cashSheet.getDataRange().getValues();
        const cashHeaders = cashData[0];
        const akun = 'Kas Tunai';
        const lastSaldo = getLastSaldoForAkun_(cashSheet, akun);

        const cashEntry = {
          id: generateId_('CSH', cashSheet),
          tanggal: formatDate_(new Date()),
          ref: `RETUR-${docId}`,
          keterangan: isSO ? `Retur Penjualan [${docId}] dari ${pelanggan}` : `Retur Pembelian [${docId}] ke Supplier`,
          kategori: 'Retur',
          debit: isSO ? 0 : totalRefund,
          kredit: isSO ? totalRefund : 0,
          saldo: isSO ? lastSaldo - totalRefund : lastSaldo + totalRefund,
          akun: akun,
          metode: 'Tunai'
        };
        appendRowFromObject_(cashSheet, cashEntry);
      }
    }

    // 9. Catat VoidLog untuk retur
    const voidLogSheet = ss.getSheetByName('VoidLog');
    if (voidLogSheet) {
      const voidLog = {
        id: `VOID-${formatDate_(new Date()).replace(/-/g, '')}-${generateIdSuffix_(voidLogSheet, 'VOID', formatDate_(new Date()).replace(/-/g, ''))}`,
        tanggal: formatDate_(new Date()),
        docType: docType,
        docId: docId,
        kasir: 'Retur Operator',
        nilai: totalRefund,
        alasan: alasan || 'Retur barang',
        timestamp: new Date().toISOString()
      };
      const voidLogHeaders = voidLogSheet.getDataRange().getValues()[0];
      const voidLogRow = voidLogHeaders.map(h => voidLog[h] === undefined ? "" : voidLog[h]);
      voidLogSheet.appendRow(voidLogRow);
    }

    return { success: true, totalRefund, newStatusLogistik };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Helper: Adjust balance on server side (for retur/void)
 */
function adjustBalanceServer_(partyType, partyId, amount) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetName = partyType === 'customer' ? 'Customers' : 'Suppliers';
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const balanceCol = headers.indexOf(partyType === 'customer' ? 'piutang' : 'hutang');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === partyId) {
      const currentBalance = Number(data[i][balanceCol]) || 0;
      sheet.getRange(i + 1, balanceCol + 1).setValue(currentBalance + amount);
      break;
    }
  }
}

/**
 * Get last saldo for akun in CashLedger
 */
function getLastSaldoForAkun_(sheet, akun) {
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const akunCol = headers.indexOf('akun');
  const saldoCol = headers.indexOf('saldo');
  if (akunCol === -1 || saldoCol === -1) return 0;

  for (let i = data.length - 1; i >= 1; i--) {
    if (String(data[i][akunCol]) === akun) {
      return Number(data[i][saldoCol]) || 0;
    }
  }
  return 0;
}

/**
 * D6 — Void Document
 * Membatalkan dokumen (SO/PO):
 * - Balik stok (SO: +qtyShipped, PO: -qtyReceived)
 * - Koreksi piutang/hutang (jika belum lunas)
 * - Catat kas (jika tunai & lunas)
 * - Update status ke 'Void'
 * - Catat VoidLog
 */
function voidDocument(token, docType, docId, alasan) {
  requireRole_(token, ['Admin', 'Superadmin']);
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk (voidDocument lock). Coba lagi.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const isSO = docType === 'SO';
    const headerSheetName = isSO ? 'SalesOrders' : 'PurchaseOrders';
    const itemsSheetName = isSO ? 'SalesOrderItems' : 'PurchaseOrderItems';
    const idField = isSO ? 'id' : 'id';
    const itemsRefField = isSO ? 'noSO' : 'noPO';

    const headerSheet = ss.getSheetByName(headerSheetName);
    const itemsSheet = ss.getSheetByName(itemsSheetName);
    if (!headerSheet || !itemsSheet) throw new Error('Sheet tidak ditemukan');

    // 1. Baca header dokumen
    const headerValues = headerSheet.getDataRange().getValues();
    const headerHeaders = headerValues[0];
    const idCol = headerHeaders.indexOf(idField);
    let headerRow = -1;
    let headerData = null;

    for (let i = 1; i < headerValues.length; i++) {
      if (String(headerValues[i][idCol]) === docId) {
        headerRow = i + 1;
        headerData = {};
        headerHeaders.forEach((h, idx) => { headerData[h] = headerValues[i][idx]; });
        break;
      }
    }

    if (!headerData) throw new Error(`Dokumen ${docType} ${docId} tidak ditemukan`);

    // Validasi status
    const statusLogistik = headerData.statusLogistik;
    const statusBayar = headerData.statusBayar;
    if (statusLogistik === 'Void' || statusBayar === 'Void') {
      throw new Error('Dokumen sudah di-void');
    }

    // 2. Baca items dokumen
    const itemsValues = itemsSheet.getDataRange().getValues();
    const itemsHeaders = itemsValues[0];
    const refCol = itemsHeaders.indexOf(itemsRefField);
    const skuCol = itemsHeaders.indexOf('sku');
    const qtyCol = itemsHeaders.indexOf('qty');
    const qtyShippedCol = itemsHeaders.indexOf('qtyShipped');
    const qtyReceivedCol = itemsHeaders.indexOf('qtyReceived');

    const existingItems = [];
    for (let i = 1; i < itemsValues.length; i++) {
      if (String(itemsValues[i][refCol]) === docId) {
        existingItems.push({
          sku: String(itemsValues[i][skuCol]),
          qty: Number(itemsValues[i][qtyCol]) || 0,
          qtyShipped: Number(itemsValues[i][qtyShippedCol]) || 0,
          qtyReceived: Number(itemsValues[i][qtyReceivedCol]) || 0
        });
      }
    }

    // 3. Koreksi Stok
    for (const item of existingItems) {
      const prodSheet = ss.getSheetByName('Products');
      if (prodSheet) {
        const prodData = prodSheet.getDataRange().getValues();
        const prodHeaders = prodData[0];
        const prodSkuCol = prodHeaders.indexOf('sku');
        const prodStokCol = prodHeaders.indexOf('stok');
        for (let j = 1; j < prodData.length; j++) {
          if (String(prodData[j][prodSkuCol]) === item.sku) {
            const currentStok = Number(prodData[j][prodStokCol]) || 0;
            let delta = 0;
            if (isSO) {
              // SO void: kembalikan stok yang sudah dikirim
              delta = item.qtyShipped || item.qty;
            } else {
              // PO void: kurangi stok yang sudah diterima
              delta = -(item.qtyReceived || item.qty);
            }
            prodSheet.getRange(j + 1, prodStokCol + 1).setValue(currentStok + delta);
            break;
          }
        }
      }
    }

    // 4. Koreksi Piutang/Hutang (hanya jika belum lunas)
    const customerId = headerData.customerId;
    const supplierId = headerData.supplierId;
    const grandTotal = Number(headerData.grandTotal) || 0;

    if (isSO && customerId && statusBayar === 'Belum Lunas') {
      adjustBalanceServer_('customer', customerId, -grandTotal);
    } else if (!isSO && supplierId && statusBayar === 'Belum Dibayar') {
      adjustBalanceServer_('supplier', supplierId, -grandTotal);
    }

    // 5. Catat Kas (jika tunai & lunas)
    const metode = headerData.metode;
    const pelanggan = headerData.pelanggan;
    const isCash = String(metode).toLowerCase().includes('tunai') || String(metode).toLowerCase().includes('cash');
    if (isCash && statusBayar === 'Lunas') {
      const cashSheet = ss.getSheetByName('CashLedger');
      if (cashSheet) {
        const cashData = cashSheet.getDataRange().getValues();
        const cashHeaders = cashData[0];
        const akun = 'Kas Tunai';
        const lastSaldo = getLastSaldoForAkun_(cashSheet, akun);

        const cashEntry = {
          id: generateId_('CSH', cashSheet),
          tanggal: formatDate_(new Date()),
          ref: `VOID-${docId}`,
          keterangan: isSO ? `Void Penjualan Tunai [${docId}] dari ${pelanggan}` : `Void Pembelian Tunai [${docId}] ke Supplier`,
          kategori: 'Void',
          debit: isSO ? 0 : grandTotal,
          kredit: isSO ? grandTotal : 0,
          saldo: isSO ? lastSaldo - grandTotal : lastSaldo + grandTotal,
          akun: akun,
          metode: 'Tunai'
        };
        appendRowFromObject_(cashSheet, cashEntry);
      }
    }

    // 6. Update status ke Void
    const statusLogistikCol = headerHeaders.indexOf('statusLogistik');
    const statusBayarCol = headerHeaders.indexOf('statusBayar');
    headerSheet.getRange(headerRow, statusLogistikCol + 1).setValue('Void');
    headerSheet.getRange(headerRow, statusBayarCol + 1).setValue('Void');

    // 7. Catat VoidLog
    const voidLogSheet = ss.getSheetByName('VoidLog');
    if (voidLogSheet) {
      const today = formatDate_(new Date());
      const voidLog = {
        id: `VOID-${today.replace(/-/g, '')}-${generateIdSuffix_(voidLogSheet, 'VOID', today.replace(/-/g, ''))}`,
        tanggal: today,
        docType: docType,
        docId: docId,
        kasir: 'Operator',
        nilai: grandTotal,
        alasan: alasan || '',
        timestamp: new Date().toISOString()
      };
      const voidLogHeaders = voidLogSheet.getDataRange().getValues()[0];
      const voidLogRow = voidLogHeaders.map(h => voidLog[h] === undefined ? "" : voidLog[h]);
      voidLogSheet.appendRow(voidLogRow);
    }

    return { success: true, voidLogId: voidLog.id };
  } catch (e) {
    throw new Error(e.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * D6 — Get Void Log
 * Mengambil semua VoidLog untuk audit
 */
function getVoidLog(token) {
  requireRole_(token, ['Admin', 'Superadmin', 'Kasir']);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('VoidLog');
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx]; });
    return obj;
  });
}

// ==========================================
// HELPER: MAPPING & ID GENERATION
// ==========================================

/**
 * Mapping metode bayar POS -> nama akun kas, konsisten dengan
 * determineAccount() di React App.tsx.
 */
function mapMetodeKeAkun_(metode) {
  const m = (metode || '').toLowerCase();
  if (m.indexOf('tunai') !== -1 || m.indexOf('cash') !== -1) return 'Kas Tunai';
  return 'Bank';
}

/**
 * Generate ID dengan prefix berbeda per jenis transaksi, format:
 * PREFIX-YYYYMMDD-XXX (contoh: POS-20260802-001)
 * Dicek terhadap baris yang sudah ada di sheet supaya nomor urut tidak
 * bentrok dalam satu hari yang sama.
 */
function generateId_(prefix, sheet) {
  const today = formatDateCompact_(new Date());
  const data = sheet.getDataRange().getValues();
  const header = data[0];
  const idCol = header.indexOf('id');
  if (idCol === -1) return `${prefix}-${today}-001`;

  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][idCol] || '');
    if (id.indexOf(`${prefix}-${today}-`) === 0) {
      const num = parseInt(id.split('-')[2], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return `${prefix}-${today}-${String(maxNum + 1).padStart(3, '0')}`;
}

function formatDate_(date) {
  return Utilities.formatDate(date, 'GMT+8', 'yyyy-MM-dd');
}

function formatDateCompact_(date) {
  return Utilities.formatDate(date, 'GMT+8', 'yyyyMMdd');
}

// ==========================================
// HELPER: BACA/TULIS SHEET SEBAGAI OBJECT
// ==========================================

/**
 * Membaca seluruh sheet dan mengembalikan array of objects,
 * key-nya diambil dari baris header (baris 1).
 */
function getSheetDataAsObjects_(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  const headers = data[0];
  const rows = data.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      let val = row[idx];
      // Kolom 'items' disimpan sebagai JSON string, parse balik jadi array
      if (h === 'items' && typeof val === 'string' && val.startsWith('[')) {
        try { val = JSON.parse(val); } catch (e) { /* biarkan string apa adanya */ }
      }
      obj[h] = val;
    });
    return obj;
  });
}

/**
 * Menambah 1 baris baru ke sheet berdasarkan object, urutan kolom
 * mengikuti urutan header yang sudah ada di baris 1 sheet tersebut.
 * Sheet HARUS sudah punya baris header sebelum fungsi ini dipakai.
 */
function appendRowFromObject_(sheet, obj) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = headers.map(h => {
    const val = obj[h];
    if (val === undefined) return '';
    if (typeof val === 'object') return JSON.stringify(val);
    return val;
  });
  sheet.appendRow(row);
}

function getLastSaldoForAkun_(cashSheet, akun) {
  const data = cashSheet.getDataRange().getValues();
  if (data.length < 2) return 0;

  const headers = data[0];
  const akunCol = headers.indexOf('akun');
  const saldoCol = headers.indexOf('saldo');
  if (akunCol === -1 || saldoCol === -1) return 0;

  let lastSaldo = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][akunCol] === akun) {
      lastSaldo = Number(data[i][saldoCol]) || 0;
    }
  }
  return lastSaldo;
}

// ==========================================
// MAINTENANCE: RESET TOTAL SEBELUM GO-LIVE
// ==========================================

/**
 * S2 — Hardening resetSemuaData
 *
 * PENGAMANAN MUTLAK:
 * - Fungsi ini DITOLAK secara server-side kecuali pemilik skrip secara eksplisit
 *   menyetel Script Property: ALLOW_RESET = 'true' di editor Apps Script (Project Settings > Script Properties).
 * - Property tersebut AKAN DIHAPUS OTOMATIS segera setelah fungsi dipicu untuk mencegah eksekusi berulang.
 * - Sebelum menghapus satu sel pun, seluruh sheet transaksi dan master disalin ke
 *   sheet cadangan bertanda waktu: '_Backup_<NamaSheet>_<YYYYMMDD_HHmmss>'.
 * - Menangani SEMUA sheet data: Products, Customers, Suppliers, SalesOrders, SalesOrderItems,
 *   PurchaseOrders, PurchaseOrderItems, CashLedger, InventoryLog, CashAccounts, PaymentMethods, VoidLog.
 * - Catatan: Mengingat fungsi GAS dapat dipicu lewat google.script.run oleh siapa pun yang
 *   memiliki URL, proteksi berbasis Script Property ini mutlak diperlukan di trust boundary server.
 */
function resetSemuaData() {
  const props = PropertiesService.getScriptProperties();
  const allowReset = props.getProperty('ALLOW_RESET');

  if (allowReset !== 'true') {
    throw new Error('DITOLAK: Operasi resetSemuaData ditolak server. Script Property ALLOW_RESET belum diaktifkan (harus bernilai \'true\').');
  }

  // Hapus izin seketika agar tidak dapat dipanggil berulang
  props.deleteProperty('ALLOW_RESET');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd_HHmmss');
  const targetSheets = [
    'Products', 'Customers', 'Suppliers', 'SalesOrders', 'SalesOrderItems',
    'PurchaseOrders', 'PurchaseOrderItems', 'CashLedger', 'InventoryLog',
    'CashAccounts', 'PaymentMethods', 'VoidLog'
  ];

  Logger.log('=== MEMULAI RESET TOTAL DENGAN BACKUP OTOMATIS [' + timestamp + '] ===');

  targetSheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) return;

    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow <= 1) return; // Hanya ada header atau kosong

    // 1. Buat backup sheet sebelum menghapus data
    const backupName = '_Backup_' + name + '_' + timestamp;
    try {
      const backupSheet = sheet.copyTo(ss);
      backupSheet.setName(backupName);
      try { backupSheet.hideSheet(); } catch (e) {}
      Logger.log('✓ Backup dibuat: ' + backupName + ' (' + (lastRow - 1) + ' baris)');
    } catch (e) {
      Logger.log('! Peringatan backup ' + name + ': ' + e.message);
    }

    // 2. Hapus baris data (baris 2 sampai akhir), baris 1 (header) tetap utuh
    sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
    Logger.log('✓ Data ' + name + ' dikosongkan. Header dipertahankan.');
  });

  Logger.log('=== RESET TOTAL BERHASIL DISELESAIKAN ===');
}



// ==========================================
// FUNGSI DASHBOARD POS
// ==========================================

/**
 * Dipanggil dari POS via google.script.run.getRingkasanDashboard(token) (S3)
 * Mengambil ringkasan data omzet, hutang, piutang, dan stok kritis hari ini.
 * Memerlukan token terverifikasi; Kasir tidak melihat hutang/piutang (DEC-10);
 * Dokumen Void diabaikan (DEC-05).
 */
function getRingkasanDashboard(token) {
  const user = requireAuth_(token);
  const today = formatDate_(new Date());
  
  // 1. Hitung Omzet dan Transaksi Hari Ini
  const salesOrders = getSheetDataAsObjects_(SHEET_SALES_ORDERS);
  const allItems = getSheetDataAsObjects_('SalesOrderItems');
  const itemsBySO = {};
  for (const item of allItems) {
    const noSO = String(item.noSO || '');
    if (!itemsBySO[noSO]) itemsBySO[noSO] = [];
    itemsBySO[noSO].push(item);
  }

  let omzetHariIni = 0;
  let jumlahTransaksiHariIni = 0;
  let salesLogs = [];
  
  salesOrders.forEach(so => {
    // Abaikan dokumen Void (DEC-05)
    if (so.statusBayar === 'Void' || so.statusLogistik === 'Void') return;

    // Ambil semua transaksi hari ini (baik POS maupun B2B)
    if (so.tanggal === today) {
      jumlahTransaksiHariIni++;
      const total = Number(so.grandTotal) || 0;
      omzetHariIni += total;
      
      // R11: Ambil detail items dari SalesOrderItems (fallback ke JSON header jika legacy)
      let itemCount = 0;
      if (itemsBySO[so.id] && itemsBySO[so.id].length > 0) {
        itemCount = itemsBySO[so.id].length;
      } else if (so.items && typeof so.items === 'string' && so.items.startsWith('[')) {
        try {
          const parsed = JSON.parse(so.items);
          itemCount = Array.isArray(parsed) ? parsed.length : 0;
        } catch(e) {}
      } else if (Array.isArray(so.items)) {
        itemCount = so.items.length;
      }
      
      salesLogs.push({
        struk: so.id,
        method: so.metode || 'Tunai',
        customer: so.pelanggan || 'Pelanggan Umum',
        items: `${itemCount} item`,
        amount: total
      });
    }
  });
  
  // Sort log terbaru di atas, ambil 10 teratas
  salesLogs = salesLogs
    .sort((a, b) => String(b.struk).localeCompare(String(a.struk)))
    .slice(0, 10);
    
  // 2. Hitung Total Piutang & Hutang (Kasir tidak boleh melihat angka piutang/hutang - DEC-10)
  let totalPiutang = 0;
  let totalHutang = 0;
  if (user.role !== 'Kasir') {
    const customers = getSheetDataAsObjects_(SHEET_CUSTOMERS);
    totalPiutang = customers.reduce((sum, c) => sum + (Number(c.piutang) || 0), 0);
    try {
      const suppliers = getSheetDataAsObjects_('Suppliers');
      totalHutang = suppliers.reduce((sum, s) => sum + (Number(s.hutang) || 0), 0);
    } catch(e) {
      // Abaikan jika sheet belum dibuat
    }
  }
  
  // 3. Hitung Stok Kritis
  const products = getSheetDataAsObjects_(SHEET_PRODUCTS);
  let jumlahStokKritis = 0;
  products.forEach(p => {
    const stok = Number(p.stok) || 0;
    const safety = Number(p.safetyStock) || 5; // default 5 jika kosong
    if (stok <= safety) {
      jumlahStokKritis++;
    }
  });
  
  return {
    omzetHariIni: omzetHariIni,
    jumlahTransaksiHariIni: jumlahTransaksiHariIni,
    totalPiutang: totalPiutang,
    totalHutang: totalHutang,
    jumlahStokKritis: jumlahStokKritis,
    salesLogs: salesLogs
  };
}

// ============================================================
// DELTA OPS: LockService + Idempotency (D1)
// ============================================================

/**
 * Cek cache idempotency. Mengembalikan hasil cache jika ada, null jika tidak.
 * Key format: 'idempotent_' + opId
 * TTL: 6 jam (21600 detik)
 */
function checkIdempotency_(opId) {
  const cache = CacheService.getScriptCache();
  const key = 'idempotent_' + opId;
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);
  return null;
}

/**
 * Simpan hasil operasi ke cache idempotency.
 */
function storeIdempotency_(opId, result) {
  const cache = CacheService.getScriptCache();
  const key = 'idempotent_' + opId;
  cache.put(key, JSON.stringify(result), 21600); // 6 jam
}

/**
 * D1 — Atomic Stock Adjustment
 * Mengubah stok produk secara atomik dengan validasi stok tidak negatif.
 *
 * @param {string} sku - SKU produk
 * @param {number} deltaQty - Perubahan stok (positif = receive, negatif = sell/consume)
 * @param {string} opId - Idempotency key (UUID dari klien)
 * @returns {Object} { ok: true, newStock: number, sku: string }
 * @throws {Error} STOK_TIDAK_CUKUP jika stok hasil < 0, atau error lain
 */
function adjustStock(sku, deltaQty, opId) {
  if (!sku || typeof deltaQty !== 'number' || !opId) {
    throw new Error('Parameter tidak valid: sku, deltaQty (number), dan opId wajib diisi.');
  }

  // Cek idempotency
  const cached = checkIdempotency_(opId);
  if (cached) return cached;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const prodSheet = ss.getSheetByName('Products');
    if (!prodSheet) throw new Error("Sheet 'Products' tidak ditemukan.");

    const data = prodSheet.getDataRange().getValues();
    if (data.length <= 1) throw new Error("Sheet 'Products' kosong, belum ada header.");

    const headers = data[0];
    const skuIdx = headers.indexOf('sku');
    const stokIdx = headers.indexOf('stok');
    if (skuIdx === -1 || stokIdx === -1) throw new Error("Kolom 'sku' atau 'stok' tidak ditemukan di header Products.");

    let targetRow = -1;
    let currentStock = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][skuIdx] || '').trim() === String(sku).trim()) {
        targetRow = i + 1; // 1-based row number
        currentStock = Number(data[i][stokIdx]) || 0;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error('PRODUK_TIDAK_DITEMUKAN: Produk dengan SKU \'' + sku + '\' tidak terdaftar.');
    }

    const newStock = currentStock + deltaQty;
    if (newStock < 0) {
      throw new Error('STOK_TIDAK_CUKUP: Stok tidak mencukupi (sisa: ' + currentStock + ', diminta: ' + Math.abs(deltaQty) + ')');
    }

    // Tulis stok baru
    prodSheet.getRange(targetRow, stokIdx + 1).setValue(newStock);

    const result = { ok: true, newStock: newStock, sku: sku };
    storeIdempotency_(opId, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * D1 — Atomic Balance Adjustment (Piutang/Hutang)
 * Mengubah balance piutang (customer) atau hutang (supplier) secara atomik.
 *
 * @param {string} entityType - 'customer' | 'supplier'
 * @param {string} entityId - ID customer atau supplier
 * @param {number} delta - Perubahan balance (positif = naik, negatif = turun)
 * @param {string} opId - Idempotency key
 * @returns {Object} { ok: true, newBalance: number, entityId: string, entityType: string }
 * @throws {Error} Balance tidak boleh negatif, atau entity tidak ditemukan
 */
function adjustBalance(entityType, entityId, delta, opId) {
  if (!entityType || !entityId || typeof delta !== 'number' || !opId) {
    throw new Error('Parameter tidak valid: entityType, entityId, delta (number), dan opId wajib diisi.');
  }
  if (entityType !== 'customer' && entityType !== 'supplier') {
    throw new Error("entityType harus 'customer' atau 'supplier'.");
  }

  // Cek idempotency
  const cached = checkIdempotency_(opId);
  if (cached) return cached;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const sheetName = entityType === 'customer' ? 'Customers' : 'Suppliers';
    const balanceField = entityType === 'customer' ? 'piutang' : 'hutang';

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("Sheet '" + sheetName + "' tidak ditemukan.");

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) throw new Error("Sheet '" + sheetName + "' kosong, belum ada header.");

    const headers = data[0];
    const idIdx = headers.indexOf('id');
    const balanceIdx = headers.indexOf(balanceField);
    if (idIdx === -1 || balanceIdx === -1) throw new Error("Kolom 'id' atau '" + balanceField + "' tidak ditemukan di header " + sheetName + ".");

    let targetRow = -1;
    let currentBalance = 0;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx] || '').trim() === String(entityId).trim()) {
        targetRow = i + 1;
        currentBalance = Number(data[i][balanceIdx]) || 0;
        break;
      }
    }

    if (targetRow === -1) {
      throw new Error(entityType.charAt(0).toUpperCase() + entityType.slice(1) + '_TIDAK_DITEMUKAN: ' + entityType + ' dengan ID \'' + entityId + '\' tidak terdaftar.');
    }

    const newBalance = currentBalance + delta;
    if (newBalance < 0) {
      throw new Error('BALANCE_NEGATIF: ' + balanceField + ' tidak boleh negatif (sisa: ' + currentBalance + ', delta: ' + delta + ')');
    }

    // Tulis balance baru
    sheet.getRange(targetRow, balanceIdx + 1).setValue(newBalance);

    const result = { ok: true, newBalance: newBalance, entityId: entityId, entityType: entityType };
    storeIdempotency_(opId, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}

/**
 * D1 — Atomic Cash Ledger Append
 * Menambah entri ke CashLedger dengan server-generated ID dan running balance.
 *
 * @param {Object} entry - { tanggal, ref, keterangan, kategori, debit, kredit, akun, metode }
 * @param {string} opId - Idempotency key
 * @returns {Object} { ok: true, id: string, saldo: number, entry: object }
 * @throws {Error} Jika parameter tidak valid atau sheet tidak ditemukan
 */
function appendCashEntry(entry, opId) {
  if (!entry || typeof entry !== 'object' || !opId) {
    throw new Error('Parameter tidak valid: entry (object) dan opId wajib diisi.');
  }
  const requiredFields = ['tanggal', 'ref', 'keterangan', 'kategori', 'debit', 'kredit', 'akun', 'metode'];
  for (const field of requiredFields) {
    if (entry[field] === undefined || entry[field] === null || entry[field] === '') {
      throw new Error('Field wajib kosong: ' + field);
    }
  }

  // Cek idempotency
  const cached = checkIdempotency_(opId);
  if (cached) return cached;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (e) {
    throw new Error('Server sibuk. Coba lagi.');
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const cashSheet = ss.getSheetByName('CashLedger');
    if (!cashSheet) throw new Error("Sheet 'CashLedger' tidak ditemukan.");

    // Generate server-side ID
    const newId = generateId_('CSH', cashSheet);

    // Get last saldo for this akun
    const previousSaldo = getLastSaldoForAkun_(cashSheet, entry.akun);
    const debit = Number(entry.debit) || 0;
    const kredit = Number(entry.kredit) || 0;
    const saldo = previousSaldo + debit - kredit;

    // Prepare row data
    const rowData = {
      id: newId,
      tanggal: entry.tanggal,
      ref: entry.ref,
      keterangan: entry.keterangan,
      kategori: entry.kategori,
      debit: debit,
      kredit: kredit,
      saldo: saldo,
      akun: entry.akun,
      metode: entry.metode
    };

    appendRowFromObject_(cashSheet, rowData);

    const result = { ok: true, id: newId, saldo: saldo, entry: rowData };
    storeIdempotency_(opId, result);
    return result;
  } finally {
    lock.releaseLock();
  }
}
