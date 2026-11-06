// ============================================================
// M1: fondasi multi-cabang. Skema org/user/akses, pintu data rows_, izin can_, login, sesi.
// Rujukan: docs/DECISIONS_MULTI_CABANG.md (DEC-20..24, 33..35, 40), docs/PRD_ADDENDUM_M1.md (M1-1..M1-4).
// Memakai getAuthPepper_ dan computeHmac_ dari Code_ERP.gs (satu pepper, tanpa fallback).
// Semua sel tab M1 disimpan sebagai TEKS ('@'): "001", "0", tanggal, dan "=..." tidak diubah Sheets.
// Fungsi publik (tanpa garis bawah) = endpoint. Selain m1Salt/m1Login/m1PasswordAwal/m1BuatSuperadminAwal/m1Setup/m1BukaKunci
// (pra-login atau dijaga Script Property), semuanya memanggil m1Sesi_ lebih dulu.
// ============================================================

const M1_TZ = 'Asia/Makassar';              // TD-04
const M1_IDLE_MS = 12 * 3600e3;             // DEC-33: batas diam 12 jam
const M1_ABS_MS = 7 * 24 * 3600e3;          // DECISION-M1-02: batas mutlak 7 hari (angka belum diputuskan pemilik)
const M1_LOCK_MS = 15 * 60e3, M1_MAX_GAGAL = 5, M1_TOUCH_MS = 15 * 60e3;
const M1_RE_UNAME = /^[a-z0-9._-]{3,64}$/, M1_RE_HEX64 = /^[0-9a-f]{64}$/, M1_RE_SALT = /^[0-9a-f]{32}$/;

const M1_PERAN = ['Superadmin', 'Eksekutif', 'Akunting Umum', 'Admin Usaha', 'Staf Cabang'];

// Matriks peran (docs/02-data-org-auth.md). Daftar = peran yang boleh. Cakupan dicek terpisah oleh can_.
// Aksi 'lihat' = L atau U pada matriks; aksi lain = U. Akunting Umum pada saldo bank = OPEN-03 (default: tidak).
const PERMS = {
  'transaksi.lihat': ['Superadmin', 'Eksekutif', 'Akunting Umum', 'Admin Usaha', 'Staf Cabang'],
  'hpp.lihat': ['Superadmin', 'Eksekutif', 'Akunting Umum', 'Admin Usaha'],
  'pos.jual': ['Superadmin', 'Staf Cabang'],
  'pos.void': ['Superadmin', 'Staf Cabang'],
  'so.void_retur': ['Superadmin', 'Staf Cabang'],
  'permintaan.buat': ['Superadmin', 'Staf Cabang'],
  'barang.terima': ['Superadmin', 'Staf Cabang'],
  'piutang.lunasi': ['Superadmin', 'Staf Cabang'],
  'transfer.kirim_terima': ['Superadmin', 'Staf Cabang'],
  'opname.hitung': ['Superadmin', 'Staf Cabang'],
  'barang_cabang.aktif': ['Superadmin', 'Admin Usaha'],
  'po.kelola': ['Superadmin', 'Admin Usaha'],
  'produk.kelola': ['Superadmin', 'Admin Usaha'],
  'akun_kas.kelola': ['Superadmin', 'Admin Usaha'],
  'saldo_bank.lihat': ['Superadmin', 'Admin Usaha'],
  'user.kelola': ['Superadmin', 'Admin Usaha'],   // batas "peran di bawahnya" = M1-5
  'struktur.kelola': ['Superadmin']
};

const M1_STD = ['dibuat_oleh', 'dibuat_pada', 'diubah_oleh', 'diubah_pada'];
// DECISION-M1-01: tab user bernama 'Pengguna' (bukan 'Users') karena 'Users' lama dipakai login lama (OPEN-13: tab lama tidak disentuh).
// Tab bisnis (Produk, Dokumen, dst.) ditambahkan fase berikutnya dengan { bisnis:true, pemilik:'cabang'|'usaha' }.
const M1_SCHEMA = {
  Grup: { cols: ['id', 'kode', 'nama', 'aktif'] },
  Usaha: { cols: ['id', 'id_grup', 'kode', 'nama', 'aktif', 'ppn_rate', 'taxMode_default', 'ppnStatus_default'] },
  Cabang: { cols: ['id', 'id_usaha', 'kode', 'nama', 'alamat', 'aktif'] },
  Jabatan: { cols: ['id', 'nama', 'peran', 'tingkat_cakupan', 'aktif'] },
  Pengguna: { cols: ['id', 'username', 'nama', 'email', 'aktif', 'pw_hash', 'pw_salt', 'wajib_ganti', 'gagal_count', 'terkunci_sampai', 'pw_diubah_pada', 'dibuat_oleh', 'dibuat_pada'] },
  AksesUser: { cols: ['id', 'id_user', 'id_jabatan', 'peran', 'id_usaha', 'id_cabang', 'aktif', 'berlaku_sampai', 'diberikan_oleh', 'dibuat_pada'] },
  Sesi: { cols: ['hash_token', 'id_user', 'dibuat_pada', 'terakhir_aktif', 'kedaluwarsa_mutlak'] },
  AuditLog: { cols: ['id', 'waktu', 'id_user', 'id_usaha', 'id_cabang', 'aksi', 'entitas', 'id_entitas', 'ringkas_sebelum', 'ringkas_sesudah', 'alasan', 'hasil'] },
  Counter: { cols: ['kunci', 'nilai'] }
};
const M1_JABATAN = [['Superadmin', 'SEMUA'], ['Eksekutif', 'SEMUA'], ['Akunting Umum', 'SEMUA'], ['Admin Usaha', 'USAHA'], ['Staf Cabang', 'CABANG']];

// ---------- helper kecil ----------
function m1Now_() { return Date.now(); }
function m1Fmt_(ms) { return Utilities.formatDate(new Date(ms), M1_TZ, 'yyyy-MM-dd HH:mm:ss'); } // urut teks = urut waktu
function m1Hex_(bytes) { return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join(''); }
function m1Sha_(s) { return m1Hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function m1Eq_(a, b) { a = String(a); b = String(b); let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; }
function m1Env_() { if (PropertiesService.getScriptProperties().getProperty('ENV') !== 'test') throw new Error('Ditolak: hanya untuk salinan uji (Script Property ENV=test).'); }
function m1Lock_(fn) { getAuthPepper_(); /* inisialisasi pepper (punya kunci sendiri) SEBELUM kunci kita: kunci tidak boleh bersarang */ const l = LockService.getScriptLock(); if (!l.tryLock(15000)) throw new Error('Server sibuk, coba lagi.'); try { return fn(); } finally { l.releaseLock(); } } // JANGAN disarang
function m1Uname_(u) { const s = typeof u === 'string' ? u.trim().toLowerCase() : ''; return M1_RE_UNAME.test(s) ? s : ''; }
function m1FakeSalt_(u) { return computeHmac_('salt', u).slice(0, 32); } // username tak dikenal tetap dapat salt yang tampak sama
function m1Fail_() { return { ok: false, error: 'Username atau password salah, atau akun terkunci sementara.' }; }
function m1Unauth_() { return new Error('UNAUTHORIZED: Sesi tidak valid atau sudah kedaluwarsa. Silakan login kembali.'); }

// ---------- lapisan tab (satu-satunya yang menyentuh Sheet untuk tab M1) ----------
let m1Hdr_ = {};
function m1Sheet_(tab) {
  const S = M1_SCHEMA[tab]; if (!S) throw new Error('Tab tidak dikenal: ' + tab);
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(tab);
  if (!sh) throw new Error('Tab ' + tab + ' belum ada. Jalankan m1Setup di salinan uji.');
  if (!m1Hdr_[tab]) {
    if (sh.getRange(1, 1, 1, S.cols.length).getValues()[0].map(String).join('|') !== S.cols.join('|')) throw new Error('Header tab ' + tab + ' tidak sesuai skema M1. Tidak ditulis.');
    m1Hdr_[tab] = 1;
  }
  return sh;
}
function m1Read_(tab) {
  const sh = m1Sheet_(tab), cols = M1_SCHEMA[tab].cols, n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, cols.length).getValues().map((r, i) => {
    const o = { _r: i + 2 }; cols.forEach((c, j) => { o[c] = r[j] == null ? '' : String(r[j]); }); return o;
  }).filter(o => cols.some(c => o[c] !== ''));
}
function m1Cells_(tab, o) {
  const cols = M1_SCHEMA[tab].cols;
  Object.keys(o).forEach(k => { if (k !== '_r' && !cols.includes(k)) throw new Error('Kolom tidak dikenal di ' + tab + ': ' + k); }); // tidak pernah membuang kunci diam-diam
  return cols.map(c => { const v = o[c]; if (v == null) return ''; if (typeof v === 'object') throw new Error('Nilai bukan teks/angka: ' + tab + '.' + c); return String(v); });
}
function m1Put_(tab, o, r) { const sh = m1Sheet_(tab), v = m1Cells_(tab, o), row = r || o._r; sh.getRange(row, 1, 1, v.length).setNumberFormat('@').setValues([v]); }
function m1Add_(tab, o) { const sh = m1Sheet_(tab); m1Put_(tab, o, Math.max(sh.getLastRow(), 1) + 1); }
function m1Del_(tab, r) { m1Sheet_(tab).deleteRow(r); }

// ---------- audit (append-only; tidak ada fungsi publik yang mengubah/menghapus) ----------
function m1Ringkas_(v) {
  if (v == null) return ''; if (typeof v !== 'object') return String(v).slice(0, 500);
  const c = {}; Object.keys(v).forEach(k => { if (!/^_r$|^pw_|hash|salt/i.test(k)) c[k] = v[k]; }); return JSON.stringify(c).slice(0, 500);
}
function m1Audit_(o) {
  m1Add_('AuditLog', { id: Utilities.getUuid(), waktu: m1Fmt_(m1Now_()), id_user: o.user || '', id_usaha: o.usaha || '', id_cabang: o.cabang || '', aksi: o.aksi,
    entitas: o.entitas || '', id_entitas: o.id || '', ringkas_sebelum: m1Ringkas_(o.sebelum), ringkas_sesudah: m1Ringkas_(o.sesudah), alasan: o.alasan || '', hasil: o.hasil || 'ok' });
}

// ---------- M1-1: setup idempotent (hanya salinan uji) ----------
function m1Setup() {
  m1Env_();
  return m1Lock_(() => {
    const ss = SpreadsheetApp.getActiveSpreadsheet(), plan = {};
    Object.keys(M1_SCHEMA).forEach(tab => { // validasi SEMUA dulu, baru menulis
      const cols = M1_SCHEMA[tab].cols, sh = ss.getSheetByName(tab);
      if (!sh || sh.getLastRow() < 1) { plan[tab] = 'baru'; return; }
      const h = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0].map(String);
      while (h.length && h[h.length - 1] === '') h.pop();
      if (h.length > cols.length || !h.every((x, i) => x === cols[i])) throw new Error('Tab ' + tab + ' sudah ada dengan header berbeda. Tidak ada yang diubah. Ganti nama tab itu dulu.');
      plan[tab] = h.length === cols.length ? 'ada' : 'lengkapi';
    });
    Object.keys(plan).forEach(tab => {
      if (plan[tab] === 'ada') return;
      const cols = M1_SCHEMA[tab].cols, sh = ss.getSheetByName(tab) || ss.insertSheet(tab);
      sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
      sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1);
    });
    m1Hdr_ = {};
    const have = m1Read_('Jabatan').map(j => j.nama);
    M1_JABATAN.forEach(([nama, tk]) => { if (!have.includes(nama)) m1Add_('Jabatan', { id: Utilities.getUuid(), nama, peran: nama, tingkat_cakupan: tk, aktif: '1' }); });
    return plan;
  });
}

// ---------- M1-4: izin ----------
// pemilik = {id_usaha, id_cabang}; dokumen milik usaha: id_cabang ''. Hanya cakupan akses yang menurun (DEC-35), hak aksi dari PERMS.
function can_(sesi, aksi, pemilik) {
  const roles = PERMS[aksi]; if (!roles) throw new Error('Aksi tidak dikenal: ' + aksi);
  const p = { id_usaha: String((pemilik && pemilik.id_usaha) || ''), id_cabang: String((pemilik && pemilik.id_cabang) || '') };
  return !!sesi && Array.isArray(sesi.akses) && sesi.akses.some(a => roles.includes(a.peran) &&
    (a.id_usaha === '' || (a.id_usaha === p.id_usaha && (a.id_cabang === '' || a.id_cabang === p.id_cabang))));
}

// ---------- sesi ----------
function m1Sesi_(token, izinWajibGanti) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw m1Unauth_();
  const h = m1Sha_(token), now = m1Now_(), nowS = m1Fmt_(now);
  const s = m1Read_('Sesi').find(x => x.hash_token === h);
  if (!s || s.kedaluwarsa_mutlak <= nowS || s.terakhir_aktif < m1Fmt_(now - M1_IDLE_MS)) throw m1Unauth_();
  const user = m1Read_('Pengguna').find(x => x.id === s.id_user && x.aktif === '1'); // peran dibaca ulang tiap panggilan, tidak disalin ke sesi
  if (!user) throw m1Unauth_();
  if (user.wajib_ganti === '1' && !izinWajibGanti) throw new Error('FORBIDDEN: Ganti password dulu.');
  if (s.terakhir_aktif < m1Fmt_(now - M1_TOUCH_MS)) m1Lock_(() => { const c = m1Read_('Sesi').find(x => x.hash_token === h); if (c) { c.terakhir_aktif = nowS; m1Put_('Sesi', c); } });
  const today = nowS.slice(0, 10);
  const akses = m1Read_('AksesUser').filter(a => a.id_user === user.id && a.aktif === '1' && M1_PERAN.includes(a.peran) &&
    (a.berlaku_sampai === '' || a.berlaku_sampai >= today) && !(a.id_usaha === '' && a.id_cabang !== ''))
    .map(a => ({ peran: a.peran, id_usaha: a.id_usaha, id_cabang: a.id_cabang }));
  return { id_user: user.id, username: user.username, nama: user.nama, hash: h, akses };
}

// ---------- M1-2: pintu data untuk tab bisnis ----------
function m1Pemilik_(S, obj, sesi) {
  let u = String(obj.id_usaha || ''), c = String(obj.id_cabang || '');
  const only = key => { const v = [...new Set(sesi.akses.map(a => a[key]))]; return v.length === 1 && v[0] !== '' ? v[0] : ''; };
  if (S.pemilik === 'usaha') {
    if (c) throw new Error('Dokumen milik usaha tidak boleh membawa id_cabang.');
    u = u || only('id_usaha'); if (!u) throw new Error('Usaha wajib dipilih.');
    if (!m1Read_('Usaha').some(x => x.id === u && x.aktif === '1')) throw new Error('Usaha tidak valid.');
    return { id_usaha: u, id_cabang: '' };
  }
  c = c || only('id_cabang'); if (!c) throw new Error('Cabang wajib dipilih.');
  const cb = m1Read_('Cabang').find(x => x.id === c && x.aktif === '1');
  if (!cb || !m1Read_('Usaha').some(x => x.id === cb.id_usaha && x.aktif === '1')) throw new Error('Cabang tidak valid.');
  if (u && u !== cb.id_usaha) throw new Error('FORBIDDEN: id_usaha tidak sesuai dengan cabang.');
  return { id_usaha: cb.id_usaha, id_cabang: c };
}
function rows_(tab, sesi) {
  const S = M1_SCHEMA[tab];
  if (!S || !S.bisnis) throw new Error('rows_: bukan tab bisnis: ' + tab);
  if (!sesi || !Array.isArray(sesi.akses)) throw m1Unauth_();
  return {
    list(aksi) { // hanya baris dalam cakupan; kolom rahasia (mis. hpp) dibuang bila tidak berhak
      return m1Read_(tab).filter(r => can_(sesi, aksi || 'transaksi.lihat', r)).map(r => {
        const o = {}; S.cols.forEach(c => { if (!(S.rahasia && S.rahasia[c] && !can_(sesi, S.rahasia[c], r))) o[c] = r[c]; }); return o;
      });
    },
    add(obj, aksi) {
      if (!aksi) throw new Error('rows_.add: aksi wajib.');
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Data tidak valid.');
      Object.keys(obj).forEach(k => { if (!S.cols.includes(k)) throw new Error('Kolom tidak dikenal: ' + k); if (k === 'id' || M1_STD.includes(k)) throw new Error('Kolom diisi server: ' + k); });
      return m1Lock_(() => {
        const pem = m1Pemilik_(S, obj, sesi);
        if (!can_(sesi, aksi, pem)) throw new Error('FORBIDDEN: di luar hak/cakupan.');
        const t = m1Fmt_(m1Now_()), row = Object.assign({}, obj, pem, { id: Utilities.getUuid(), dibuat_oleh: sesi.id_user, dibuat_pada: t, diubah_oleh: sesi.id_user, diubah_pada: t });
        m1Add_(tab, row); return row;
      });
    }
  };
}

// ---------- M1-3: login (DEC-33) ----------
function m1Locked_(u, now) { return Number(u.gagal_count) >= M1_MAX_GAGAL && u.terkunci_sampai > m1Fmt_(now); }
function m1Gagal_(u, now) { // hitungan di Sheet, bukan cache: bertahan walau cache dikosongkan
  const basi = u.terkunci_sampai && u.terkunci_sampai <= m1Fmt_(now), n = (basi ? 0 : Number(u.gagal_count) || 0) + 1;
  u.gagal_count = String(n); u.terkunci_sampai = m1Fmt_(now + M1_LOCK_MS); m1Put_('Pengguna', u);
  m1Audit_({ user: u.id, aksi: n === M1_MAX_GAGAL ? 'LOGIN_TERKUNCI' : 'LOGIN_GAGAL', entitas: 'Pengguna', id: u.id, hasil: 'ditolak' });
}
// Klien: salt = m1Salt(username); pre = PBKDF2(password, salt) (src/authM1.ts); lalu m1Login(username, pre). Server tidak pernah menerima password asli.
function m1Salt(username) {
  const u = m1Uname_(username), x = u && m1Read_('Pengguna').find(p => p.username === u && p.aktif === '1' && p.pw_salt);
  return { salt: x ? x.pw_salt : m1FakeSalt_(u) };
}
function m1Login(username, pre) {
  const u = m1Uname_(username), okFormat = typeof pre === 'string' && M1_RE_HEX64.test(pre);
  return m1Lock_(() => {
    const now = m1Now_(), user = u ? m1Read_('Pengguna').find(x => x.username === u && x.aktif === '1') : null;
    const calc = computeHmac_(user && user.pw_salt ? user.pw_salt : m1FakeSalt_(u), okFormat ? pre : '0'.repeat(64)); // selalu dihitung: waktu tak membedakan
    const locked = !!user && m1Locked_(user, now);
    if (!user || locked || !okFormat || !user.pw_hash || !m1Eq_(calc, user.pw_hash)) { if (user && !locked) m1Gagal_(user, now); return m1Fail_(); }
    user.gagal_count = '0'; user.terkunci_sampai = ''; m1Put_('Pengguna', user);
    const old = m1Fmt_(now - M1_IDLE_MS), cut = m1Fmt_(now); // bersihkan sesi mati
    m1Read_('Sesi').filter(s => s.kedaluwarsa_mutlak <= cut || s.terakhir_aktif < old).sort((a, b) => b._r - a._r).forEach(s => m1Del_('Sesi', s._r));
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, ''); // token asli hanya dikirim ke browser; Sheet menyimpan hash-nya
    m1Add_('Sesi', { hash_token: m1Sha_(token), id_user: user.id, dibuat_pada: m1Fmt_(now), terakhir_aktif: m1Fmt_(now), kedaluwarsa_mutlak: m1Fmt_(now + M1_ABS_MS) });
    m1Audit_({ user: user.id, aksi: 'LOGIN', entitas: 'Pengguna', id: user.id });
    return { ok: true, token, user: { username: user.username, nama: user.nama }, wajibGanti: user.wajib_ganti === '1' };
  });
}
function m1Logout(token) { // selalu {ok:true}; token tak dikenal tidak dibedakan
  if (typeof token !== 'string' || token.length < 32 || token.length > 128) return { ok: true };
  const h = m1Sha_(token);
  return m1Lock_(() => { const s = m1Read_('Sesi').find(x => x.hash_token === h); if (s) { m1Del_('Sesi', s._r); m1Audit_({ user: s.id_user, aksi: 'LOGOUT', entitas: 'Pengguna', id: s.id_user }); } return { ok: true }; });
}
function m1GantiPassword(token, lamaPre, saltBaru, baruPre) {
  const sesi = m1Sesi_(token, true);
  if (!M1_RE_HEX64.test(String(lamaPre)) || !M1_RE_HEX64.test(String(baruPre)) || !M1_RE_SALT.test(String(saltBaru))) throw new Error('Format tidak valid.');
  return m1Lock_(() => {
    const now = m1Now_(), user = m1Read_('Pengguna').find(x => x.id === sesi.id_user && x.aktif === '1'); if (!user) throw m1Unauth_();
    const locked = m1Locked_(user, now);
    if (locked || !m1Eq_(computeHmac_(user.pw_salt, lamaPre), user.pw_hash)) { if (!locked) m1Gagal_(user, now); return { ok: false, error: 'Password lama salah, atau akun terkunci sementara.' }; }
    user.pw_salt = saltBaru; user.pw_hash = computeHmac_(saltBaru, baruPre); user.wajib_ganti = '0'; user.gagal_count = '0'; user.terkunci_sampai = ''; user.pw_diubah_pada = m1Fmt_(now);
    m1Put_('Pengguna', user);
    m1Read_('Sesi').filter(s => s.id_user === user.id && s.hash_token !== sesi.hash).sort((a, b) => b._r - a._r).forEach(s => m1Del_('Sesi', s._r)); // sesi lain mati
    m1Audit_({ user: user.id, aksi: 'GANTI_PASSWORD', entitas: 'Pengguna', id: user.id });
    return { ok: true };
  });
}

// ---------- pengaturan awal: Superadmin pertama (hanya salinan uji, kode sekali pakai) ----------
// Pemilik mengisi Script Property M1_SETUP_CODE (acak, >= 24 karakter). 5 tebakan salah = kode dihapus (gagal-tertutup).
function m1CekKode_(kode) {
  const P = PropertiesService.getScriptProperties(), code = P.getProperty('M1_SETUP_CODE');
  if (!code || typeof kode !== 'string') return false;
  if (m1Eq_(kode, code)) { P.deleteProperty('M1_SETUP_GAGAL'); return true; }
  const n = (Number(P.getProperty('M1_SETUP_GAGAL')) || 0) + 1;
  if (n >= M1_MAX_GAGAL) { P.deleteProperty('M1_SETUP_CODE'); P.deleteProperty('M1_SETUP_GAGAL'); } else P.setProperty('M1_SETUP_GAGAL', String(n));
  return false;
}
function m1BuatSuperadminAwal(kode, username, nama, email) {
  m1Env_();
  return m1Lock_(() => {
    if (!m1CekKode_(kode)) throw new Error('Kode setup salah atau belum diatur.');
    const u = m1Uname_(username), n = typeof nama === 'string' ? nama.trim() : '', e = typeof email === 'string' ? email.trim() : '';
    if (!u) throw new Error('Username 3-64 karakter: huruf kecil, angka, titik, minus, garis bawah.');
    if (!n || n.length > 100 || e.length > 100) throw new Error('Nama wajib (maks 100); email maks 100.');
    if (m1Read_('Pengguna').length) throw new Error('Sudah ada pengguna. Setup awal hanya sekali.');
    const jb = m1Read_('Jabatan').find(j => j.nama === 'Superadmin'); if (!jb) throw new Error('Jalankan m1Setup dulu.');
    const t = m1Fmt_(m1Now_()), id = Utilities.getUuid();
    m1Add_('Pengguna', { id, username: u, nama: n, email: e, aktif: '1', pw_hash: '', pw_salt: '', wajib_ganti: '1', gagal_count: '0', terkunci_sampai: '', pw_diubah_pada: '', dibuat_oleh: 'setup', dibuat_pada: t });
    m1Add_('AksesUser', { id: Utilities.getUuid(), id_user: id, id_jabatan: jb.id, peran: 'Superadmin', id_usaha: '', id_cabang: '', aktif: '1', berlaku_sampai: '', diberikan_oleh: 'setup', dibuat_pada: t });
    m1Audit_({ user: id, aksi: 'SUPERADMIN_AWAL', entitas: 'Pengguna', id, sesudah: { username: u } });
    return { ok: true };
  });
}
function m1PasswordAwal(kode, username, salt, pre) { // sekali: user tanpa password + kode setup; kode dihapus setelah berhasil
  m1Env_();
  const u = m1Uname_(username);
  if (!u || !M1_RE_SALT.test(String(salt)) || !M1_RE_HEX64.test(String(pre))) return { ok: false, error: 'Data tidak valid.' };
  return m1Lock_(() => {
    const user = m1Read_('Pengguna').find(x => x.username === u && x.aktif === '1' && x.pw_hash === '');
    if (!m1CekKode_(kode) || !user) return { ok: false, error: 'Kode atau pengguna tidak valid.' };
    user.pw_salt = salt; user.pw_hash = computeHmac_(salt, pre); user.wajib_ganti = '0'; user.pw_diubah_pada = m1Fmt_(m1Now_()); m1Put_('Pengguna', user);
    PropertiesService.getScriptProperties().deleteProperty('M1_SETUP_CODE');
    m1Audit_({ user: user.id, aksi: 'PASSWORD_AWAL', entitas: 'Pengguna', id: user.id });
    return { ok: true };
  });
}
// Pemulihan pemilik: isi Script Property M1_BUKA_KUNCI = username di editor, lalu jalankan fungsi ini. Properti dihapus sendiri.
function m1BukaKunci() {
  const P = PropertiesService.getScriptProperties(), u = m1Uname_(P.getProperty('M1_BUKA_KUNCI') || '');
  if (!u) return { ok: false, error: 'Tidak ada permintaan (isi Script Property M1_BUKA_KUNCI).' };
  return m1Lock_(() => {
    const user = m1Read_('Pengguna').find(x => x.username === u); P.deleteProperty('M1_BUKA_KUNCI');
    if (!user) return { ok: false, error: 'Pengguna tidak ditemukan.' };
    user.gagal_count = '0'; user.terkunci_sampai = ''; m1Put_('Pengguna', user);
    m1Audit_({ user: user.id, aksi: 'BUKA_KUNCI', entitas: 'Pengguna', id: user.id, alasan: 'pemilik via editor' });
    return { ok: true };
  });
}
