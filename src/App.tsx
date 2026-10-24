import React, { useState, useEffect } from 'react';
import { useDebounce } from './hooks/useDebounce';
import { Badge } from "./components/Badge";
import { EmptyState } from "./components/EmptyState";
import { CashLedgerTab } from './components/CashLedgerTab';
import { SettingsTab } from './tabs/SettingsTab';
import { PurchaseOrderTab } from './tabs/PurchaseOrderTab';
import { SalesOrderTab } from './tabs/SalesOrderTab';
import { ReportsTab } from './tabs/ReportsTab';
import { SearchableSelect } from './components/SearchableSelect';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as htmlToImage from 'html-to-image';
import { loginToServer, getSessionUser, logoutFromServer, hashPassword, type SessionUser } from './authService';
import { getProducts, saveProduct, deleteProduct, saveAllProducts, sendEmailReport, adjustStock } from './dataService';
import { getPurchaseOrders, savePurchaseOrder, deletePurchaseOrder, saveAllPurchaseOrders, adjustBalance } from './dataService';
import { getCustomers, saveCustomer, deleteCustomer, saveAllCustomers } from "./dataService";
import { getSuppliers, saveSupplier, deleteSupplier, saveAllSuppliers } from "./dataService";
import { getOpnameLog, appendOpnameLog, saveAllOpnameLog } from "./dataService";
import { getCashLedger, saveCashEntry, deleteCashEntry, saveAllCashLedger, appendCashEntry } from "./dataService";
import { getSalesOrders, saveSalesOrder, deleteSalesOrder, saveAllSalesOrders, fetchSettings, saveSettingsToGas, getBootstrapStatus, initialSetup } from './dataService';
import { getConsignments, saveConsignment, deleteConsignment, saveAllConsignments } from './dataService';
import { generateOpId, createCustomer, updateCustomer, createSupplier, updateSupplier, createPurchaseOrder, updatePurchaseOrder, createSalesOrder, updateSalesOrder, createCashEntry, updateCashEntry, createVoidLog, processRetur, voidDocument, getVoidLog } from './dataService';
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
} from './domain/voidRetur';
import {
  ShoppingCart, LayoutDashboard,
  Package,
  FileText,
  Mail,
  Users,
  AlertTriangle,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Check,
  FileSpreadsheet,
  Download,
  MapPin,
  Plus,
  Trash2,
  Edit3,
  Code,
  Truck,
  CreditCard,
  X,
  CornerUpLeft,
  Printer,
  BookOpen,
  History,
  Settings,
  Lock,
  LogOut,
  Layers,
  Activity,
  Database,
  ChevronDown,
  HelpCircle,
  Building2,
  Eye,
  EyeOff,
  Calculator
} from 'lucide-react';
import { Table, THead, TBody, TR, TH, TD } from './components/Table';
import { TableActions } from './components/TableActions';
import { Card } from './components/Card';
import { Button } from './components/Button';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

// ==========================================
// LOCAL STORAGE PERSISTENCE UTILITIES
// ==========================================
const getLocalStorage = (key: string, defaultValue: any) => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) {
      return JSON.parse(saved);
    }
    return defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const setLocalStorage = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { }
};

// ==========================================
// MOCK DATA INITIALIZATION
// ==========================================
const INITIAL_PRODUCTS: any[] = [];

const INITIAL_CUSTOMERS = [
  { id: 'CUST-001', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
];

const INITIAL_SUPPLIERS: any[] = [];

const INITIAL_PURCHASE_ORDERS: any[] = [];

const INITIAL_SALES_ORDERS: any[] = [];

const INITIAL_OPNAME_LOG: any[] = [];

const INITIAL_CASH_LEDGER: any[] = [];

const INITIAL_CONSIGNMENT: any[] = [];

// ==========================================
// INTERACTIVE SPREADSHEET COMPONENT (GOOGLE SHEETS STYLE)
// ==========================================
interface SpreadsheetComponentProps {
  headers: string[];
  rows: string[][];
  onChangeCell: (r: number, c: number, value: string) => void;
}

function SpreadsheetComponent({ headers, rows, onChangeCell }: SpreadsheetComponentProps) {
  const [activeCell, setActiveCell] = useState<{ r: number, c: number } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    if (activeCell) {
      setEditValue(rows[activeCell.r][activeCell.c] || '');
    } else {
      setEditValue('');
    }
  }, [activeCell, rows]);

  const handleCellClick = (r: number, c: number) => {
    setActiveCell({ r, c });
  };

  const handleInputChange = (val: string) => {
    setEditValue(val);
    if (activeCell) {
      onChangeCell(activeCell.r, activeCell.c, val);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setActiveCell(null);
    }
  };

  const colLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'];

  return (
    <div className="flex flex-col border border-border rounded-card overflow-hidden bg-white text-sm font-sans shadow-md">
      {/* Formula Bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-border">
        <div className="font-mono text-[11px] text-success bg-success/10 border border-success/30 font-black px-2 py-0.5 rounded shadow-xs">
          {activeCell ? `${colLetters[activeCell.c]}${activeCell.r + 1}` : 'SEL'}
        </div>
        <div className="text-slate-400 font-serif italic text-sm font-black select-none">fx</div>
        <input
          type="text"
          value={editValue}
          onChange={(e) => handleInputChange(e.target.value)}
          placeholder={activeCell ? "Ketik teks atau nominal..." : "Klik dua kali atau pilih sel untuk mengedit langsung..."}
          className="flex-1 px-3 py-1.5 border border-border rounded-card text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white transition-all shadow-inner font-mono text-primary"
          disabled={!activeCell}
        />
        {activeCell && (
          <button
            onClick={() => setActiveCell(null)}
            className="text-[11px] bg-slate-200 hover:bg-slate-300 px-2 py-1 rounded font-bold text-secondary transition-colors"
          >
            Selesai
          </button>
        )}
      </div>

      {/* Grid Canvas */}
      <div className="overflow-x-auto overflow-y-auto max-h-[420px] w-full">
        <table className="w-full border-collapse table-fixed min-w-[850px]">
          <thead>
            <tr className="bg-slate-100 text-secondary text-center select-none divide-x divide-gray-200">
              <th className="w-10 border-r border-b border-border font-normal bg-slate-200 text-secondary text-[11px]"></th>
              {headers.map((h, cIdx) => (
                <th key={cIdx} className="border-r border-b border-border py-1.5 px-2 font-bold text-primary bg-slate-150 text-left">
                  <div className="text-[11px] text-text-muted font-mono mb-0.5">{colLetters[cIdx]}</div>
                  <div className="truncate text-[10.5px] uppercase tracking-wide">{h}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-150">
            {rows.map((rowCells, rIdx) => {
              // Row 0 is often headers, let's treat row 0 as non-header in 2D grid but styled beautifully
              const isHeaderRow = rIdx === 0;
              return (
                <tr key={rIdx} className={`hover:bg-success/10 transition-colors ${isHeaderRow ? 'bg-slate-50' : ''}`}>
                  {/* Row Number Column */}
                  <td className="bg-slate-100 text-center text-text-muted font-mono text-[11px] select-none border-r border-b border-border font-black">
                    {rIdx + 1}
                  </td>
                  {headers.map((_, cIdx) => {
                    const val = rowCells[cIdx] || '';
                    const isActive = activeCell?.r === rIdx && activeCell?.c === cIdx;
                    return (
                      <td
                        key={cIdx}
                        onClick={() => handleCellClick(rIdx, cIdx)}
                        className={`border-r border-b border-border p-2 relative truncate cursor-text text-primary font-mono text-sm ${isActive ? 'ring-2 ring-inset ring-primary z-10 bg-success/10' : 'hover:bg-slate-50'}`}
                      >
                        {isActive ? (
                          <input
                            type="text"
                            value={editValue}
                            onChange={(e) => handleInputChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={() => {
                              // delay slightly to allow clicking finish button
                              setTimeout(() => setActiveCell(null), 150);
                            }}
                            className="absolute inset-0 w-full h-full border-none px-2 py-2 focus:outline-none focus:ring-0 text-sm bg-white text-text-primary font-mono"
                            autoFocus
                          />
                        ) : (
                          <span className={`block w-full min-h-[16px] truncate ${isHeaderRow ? 'font-extrabold text-text-primary border-b border-border pb-0.5' : ''}`}>
                            {val}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Excel/Sheets Grid Footer helper */}
      <div className="bg-slate-50 border-t border-border px-4 py-2 text-[11px] text-secondary flex justify-between items-center">
        <span>Gunakan baris formula di atas untuk input data cepat, atau klik ganda sel apa pun.</span>
        <span className="font-mono font-bold text-success">INO ERP SPREADSHEET ENGINE v1.2</span>
      </div>    </div>
  );
}

// ==========================================
// INITIAL PRODUCTION & BOM DATA
// ==========================================
const INITIAL_BOMS: any[] = [];

const INITIAL_RIWAYAT_PRODUKSI: any[] = [];

const AVAILABLE_MONTHS = [
  { id: 'Jan', code: '01', label: 'Januari' },
  { id: 'Feb', code: '02', label: 'Februari' },
  { id: 'Mar', code: '03', label: 'Maret' },
  { id: 'Apr', code: '04', label: 'April' },
  { id: 'May', code: '05', label: 'Mei' },
  { id: 'Jun', code: '06', label: 'Juni' },
  { id: 'Jul', code: '07', label: 'Juli' },
  { id: 'Aug', code: '08', label: 'Agustus' },
  { id: 'Sep', code: '09', label: 'September' },
  { id: 'Oct', code: '10', label: 'Oktober' },
  { id: 'Nov', code: '11', label: 'November' },
  { id: 'Dec', code: '12', label: 'Desember' }
];

const QUARTERS_DEF = [
  { id: 'Q1', label: 'Kuartal I (Q1)', months: ['Jan', 'Feb', 'Mar'] },
  { id: 'Q2', label: 'Kuartal II (Q2)', months: ['Apr', 'May', 'Jun'] },
  { id: 'Q3', label: 'Kuartal III (Q3)', months: ['Jul', 'Aug', 'Sep'] },
  { id: 'Q4', label: 'Kuartal IV (Q4)', months: ['Oct', 'Nov', 'Dec'] }
];


const NAV_GROUPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: <LayoutDashboard size={15} />,
    direct: true,
    allowedRoles: ['Superadmin', 'Admin', 'Kasir']
  },
  {
    id: 'statistik',
    label: 'Statistik',
    icon: <Activity size={15} />,
    direct: true,
    allowedRoles: ['Superadmin', 'Admin']
  },
  {
    id: 'gudang',
    label: 'Gudang',
    icon: <Package size={15} />,
    allowedRoles: ['Superadmin', 'Admin'],
    children: [
      { id: 'master_produk', label: 'Master Produk', icon: <Database size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
      { id: 'summary_stok', label: 'Summary Stok Bulanan', icon: <TrendingUp size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
    ]
  },
  {
    id: 'transaksi',
    label: 'Transaksi',
    icon: <FileText size={15} />,
    allowedRoles: ['Superadmin', 'Admin', 'Kasir'],
    children: [
      { id: 'purchase_order', label: 'Pembelian PO', icon: <Truck size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
      { id: 'sales_order', label: 'Penjualan (Sales Order)', icon: <CreditCard size={14} />, allowedRoles: ['Superadmin', 'Admin', 'Kasir'] },
      { id: 'buku_besar_kas', label: 'Buku Besar Kas', icon: <BookOpen size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
    ]
  },
  // ponytail: gabungkan navigasi pelanggan & supplier ke dropdown tunggal bernama Kartu di TopBar
  {
    id: 'kartu',
    label: 'Kartu',
    icon: <Users size={15} />,
    allowedRoles: ['Superadmin', 'Admin'],
    children: [
      { id: 'pelanggan', label: 'Kartu Pelanggan', icon: <Users size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
      { id: 'supplier', label: 'Kartu Supplier', icon: <Building2 size={14} />, allowedRoles: ['Superadmin', 'Admin'] },
    ]
  },
  {
    id: 'laporan',
    label: 'Laporan',
    icon: <TrendingUp size={15} />,
    allowedRoles: ['Superadmin'],
    children: [
      { id: 'laba_rugi', label: 'Laba Rugi (P&L)', icon: <TrendingUp size={14} />, allowedRoles: ['Superadmin'] },
      { id: 'arus_kas', label: 'Arus Kas (Cash Flow)', icon: <DollarSign size={14} />, allowedRoles: ['Superadmin'] },
      { id: 'konsinyasi', label: 'Konsinyasi Retail', icon: <Users size={14} />, allowedRoles: ['Superadmin'] },
      { id: 'penjualan_harian', label: 'Penjualan Harian', icon: <FileSpreadsheet size={14} />, allowedRoles: ['Superadmin'] },
      { id: 'pajak_ppn', label: 'Pajak (PPN)', icon: <Calculator size={14} />, allowedRoles: ['Superadmin'] },
    ]
  },
];


// ponytail: helper format titik ribuan tanpa dependency
const formatRibuan = (num: number | string): string => {
  if (num === null || num === undefined || num === '') return '';
  const str = num.toString().replace(/[^0-9]/g, '');
  if (!str) return '';
  return parseInt(str, 10).toLocaleString('id-ID').replace(/,/g, '.');
};

const parseRibuan = (str: string): number => {
  if (!str) return 0;
  return parseInt(str.toString().replace(/[^0-9]/g, ''), 10) || 0;
};


// ponytail: helper get today YMD for ID generation
const getTodayYMD = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
};

// ponytail: GAS environment check — login wajib aktif di production
declare var google: any;
const isGasEnv_ = typeof google !== 'undefined' && typeof (google as any)?.script !== 'undefined';

export default function App() {

  // ponytail: Kalkulasi On-Order (Barang sedang dipesan tapi belum diterima)
  const getOnOrderQty = (sku: string) => {
    return purchaseOrders
      .filter(po => po.statusLogistik === 'DIPESAN' || po.statusLogistik === 'Parsial')
      .reduce((total, po) => {
        const item = po.items.find((i: any) => i.sku === sku);
        if (!item) return total;
        const received = item.qtyReceived ?? 0;
        return total + Math.max(0, item.qty - received);
      }, 0);
  };

  // ponytail: Modal Konfirmasi
  const [showPoConfirmModal, setShowPoConfirmModal] = React.useState(false);
  const [showSoConfirmModal, setShowSoConfirmModal] = React.useState(false);
  const [isExportingPDF, setIsExportingPDF] = React.useState(false);
  const [pendingDraftState, setPendingDraftState] = React.useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [bukuBesarActiveAkun, setBukuBesarActiveAkun] = useState<string>('');
  const [cashLedgerView, setCashLedgerView] = useState<'list' | 'detail'>('list');
  const [selectedCashAccount, setSelectedCashAccount] = useState<{ nomor: string, nama: string, jenis?: string, fungsi: string } | null>(null);
  const [isAddCashAccountOpen, setIsAddCashAccountOpen] = useState(false);
  const [editingAccountName, setEditingAccountName] = useState<string | null>(null);
  const [newCashAccountForm, setNewCashAccountForm] = useState({ nomor: '', nama: '', jenis: 'Kas', fungsi: 'General' });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const isGroupActive = (group: any) => group.id === activeTab || group.children?.some((c: any) => c.id === activeTab);

  // Core Persisted States
  const [products, setProducts] = useState<any[]>(() => getLocalStorage('ino_products', INITIAL_PRODUCTS));
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState("");
  const debouncedSearchProductQuery = useDebounce(searchProductQuery, 300);
  const [customers, setCustomers] = useState<any[]>(() => getLocalStorage('ino_customers', INITIAL_CUSTOMERS));
  const [suppliers, setSuppliers] = useState<any[]>(() => getLocalStorage('ino_suppliers', INITIAL_SUPPLIERS));
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>(() => getLocalStorage('ino_purchase_orders', INITIAL_PURCHASE_ORDERS));
  const [isSavingPO, setIsSavingPO] = useState(false);
  const [searchPoQuery, setSearchPoQuery] = useState("");
  const debouncedSearchPoQuery = useDebounce(searchPoQuery, 300);
  const [salesOrders, setSalesOrders] = useState<any[]>(() => getLocalStorage('ino_sales_orders', INITIAL_SALES_ORDERS));
  const [isSavingSO, setIsSavingSO] = useState(false);
  const [isVoidingPO, setIsVoidingPO] = useState(false);
  const [isVoidingSO, setIsVoidingSO] = useState(false);
  const [searchSoQuery, setSearchSoQuery] = useState("");
  const debouncedSearchSoQuery = useDebounce(searchSoQuery, 300);
  const [soFilterJenis, setSoFilterJenis] = useState<'Semua' | 'SO' | 'POS'>('Semua');
  const [opnameLog, setOpnameLog] = useState<any[]>(() => getLocalStorage('ino_opname_log', INITIAL_OPNAME_LOG));
  const [cashLedger, setCashLedger] = useState<any[]>(() => getLocalStorage('ino_cash_ledger', INITIAL_CASH_LEDGER));
  const [isSavingCash, setIsSavingCash] = useState(false);
  const [consignments, setConsignments] = useState<any[]>(() => getLocalStorage('ino_consignments', INITIAL_CONSIGNMENT));

  // ponytail: Sheets adalah sumber kebenaran, localStorage cuma cache offline.
  // Tanpa ini, app cuma baca localStorage dan "reset" tiap kali origin iframe GAS berubah.
  useEffect(() => {
    Promise.all([
      getProducts(), getCustomers(), getSuppliers(), getPurchaseOrders(),
      getSalesOrders(), getCashLedger(), getOpnameLog(), getConsignments(),
    ]).then(([p, c, s, po, so, cl, ol, cg]) => {
      if (Array.isArray(p)) setProducts(p);
      if (Array.isArray(c)) setCustomers(c);
      if (Array.isArray(s)) setSuppliers(s);
      if (Array.isArray(po)) setPurchaseOrders(po);
      if (Array.isArray(so)) setSalesOrders(so);
      if (Array.isArray(cl)) setCashLedger(cl);
      if (Array.isArray(ol)) setOpnameLog(ol);
      if (Array.isArray(cg)) setConsignments(cg);
    }).catch((err) => {
      triggerToast('Gagal memuat data dari Sheets: ' + err.message, 'error');
    });
  }, []);

  // Settings & Production States
  const [tipeBisnis, setTipeBisnis] = useState<string>(() => getLocalStorage('ino_tipe_bisnis', 'Manufaktur'));
  // ponytail: di GAS, login selalu wajib aktif — tidak boleh di-skip via localStorage
  // ponytail: di localhost paksa false agar bisa langsung masuk tanpa login saat testing
  const [isLoginActive, setIsLoginActive] = useState<boolean>(() => isGasEnv_ ? true : false);
  const [isSetupMode, setIsSetupMode] = useState<boolean>(false);
  const [isSystemInitialized, setIsSystemInitialized] = useState<boolean>(true);
  const [loginUsername, setLoginUsername] = useState<string>(() => getLocalStorage('ino_login_username', ''));
  const [loginPassword, setLoginPassword] = useState<string>(() => getLocalStorage('ino_login_password', ''));

  // Profil Toko States
  const [namaToko, setNamaToko] = useState<string>(() => getLocalStorage('ino_nama_toko', 'INO ERP'));
  const [alamatToko, setAlamatToko] = useState<string>(() => getLocalStorage('ino_alamat_toko', 'Jl. Contoh No. 1, Kota'));
  const [telpToko, setTelpToko] = useState<string>(() => getLocalStorage('ino_telp_toko', '081234567890'));
  const [kotaToko, setKotaToko] = useState<string>(() => getLocalStorage('ino_kota_toko', 'Bali'));
  const [ppnRate, setPpnRate] = useState<number>(() => getLocalStorage('ino_ppn_rate', 0.11));
  const [metodeHppDefault, setMetodeHppDefault] = useState<string>(() => getLocalStorage('ino_metode_hpp_default', 'Moving Average'));
  const [mataUang, setMataUang] = useState<string>(() => getLocalStorage('ino_mata_uang', 'IDR'));
  const [driveFolderStruk, setDriveFolderStruk] = useState<string>(() => getLocalStorage('ino_drive_folder_struk', ''));
  const [formatTanggal, setFormatTanggal] = useState<string>(() => getLocalStorage('ino_format_tanggal', 'dd/MM/yyyy'));

  // Master References List States
  const [settingCategories, setSettingCategories] = useState<string[]>(() => getLocalStorage('ino_setting_categories', ['Retail', 'Set / Bundle', 'Barang Jadi', 'Bahan Baku', 'Kemasan', 'Jasa']));
  const [settingSubCategories, setSettingSubCategories] = useState<string[]>(() => getLocalStorage('ino_setting_subcategories', ['Makanan', 'Minuman', 'Snack', 'Roti & Kue', 'Bahan Kering', 'Bahan Basah', 'Alat & Perlengkapan', 'Packaging', 'Lainnya']));
  const [settingUnits, setSettingUnits] = useState<string[]>(() => getLocalStorage('ino_setting_units', ['Gram', 'Kg', 'Pcs', 'Lusin', 'Set', 'Liter', 'Ml', 'Botol', 'Sachet', 'Loyang', 'Lembar', 'Meter', 'Karton', 'Dus']));
  const [settingStorageLocations, setSettingStorageLocations] = useState<string[]>(() => getLocalStorage('ino_setting_storages', ['Rak A', 'Rak B', 'Rak C', 'Gudang Utama', 'Gudang Dingin', 'Etalase Depan', 'Laci Kasir', 'Rak Gantung', 'Area Produksi']));
  const [settingCashAccounts, setSettingCashAccounts] = useState<{ nomor: string, nama: string, jenis?: string, fungsi: string }[]>(() => {
    const saved = getLocalStorage('ino_setting_cash_accounts', ['Kas Tunai', 'Bank']);
    return saved.map((acc: any) => {
      if (typeof acc === 'string') return { nomor: '', nama: acc, fungsi: 'General' };
      return { ...acc, fungsi: acc.fungsi || 'General' };
    });
  });

  // Helper untuk menentukan akun berdasarkan metode pembayaran
  const determineAccount = (methodName: string) => {
    if (!methodName) return 'Bank';
    const name = methodName.toLowerCase();
    if (name.includes('tunai') || name.includes('cash')) return 'Kas Tunai';
    return 'Bank';
  };
  const [settingPlatforms, setSettingPlatforms] = useState<string[]>(() => getLocalStorage('ino_setting_platforms', ['Toko Langsung', 'Tokopedia', 'Shopee', 'TikTok Shop', 'Grab', 'Gojek', 'WhatsApp', 'Instagram', 'Website', 'Lainnya']));

  const [settingPrefixes, setSettingPrefixes] = useState<any[]>(() => getLocalStorage('ino_setting_prefixes', [
    { prefix: 'RTL', label: 'Retail / Produk Jadi Dijual' },
    { prefix: 'SET', label: 'Set / Bundle Produk' },
    { prefix: 'FG', label: 'Finished Good / Barang Jadi Produksi' },
    { prefix: 'RAW', label: 'Raw Material / Bahan Baku' },
    { prefix: 'PKG', label: 'Packaging / Kemasan' },
    { prefix: 'SVC', label: 'Service / Jasa' }
  ]));

  // S5: Hapus default hardcoded PINs
  // R12: Pada mode GAS jangan simpan daftar user ke localStorage
  const [settingUsersList, setSettingUsersList] = useState<any[]>(() => {
    if (isGasEnv_) {
      try { localStorage.removeItem('ino_setting_users'); } catch (_) {}
      return [];
    }
    return getLocalStorage('ino_setting_users', []);
  });

  const [settingSubTab, setSettingSubTab] = useState<string>('profil');

  // Login runtime state
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(() => {
    const active = isGasEnv_ ? true : getLocalStorage('ino_is_login_active', true);
    if (!active) return { username: 'admin', nama: 'Admin', role: 'Superadmin' };
    return getSessionUser();
  });
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => {
    const active = isGasEnv_ ? true : getLocalStorage('ino_is_login_active', true);
    return !active || getSessionUser() !== null;
  });
  const [boms, setBoms] = useState<any[]>(() => getLocalStorage('ino_boms', INITIAL_BOMS));
  const [riwayatProduksi, setRiwayatProduksi] = useState<any[]>(() => getLocalStorage('ino_riwayat_produksi', INITIAL_RIWAYAT_PRODUKSI));
  const [stokPrices, setStokPrices] = useState<Record<string, number>>(() => getLocalStorage('ino_stok_prices', {}));
  const [stokShowFinancial, setStokShowFinancial] = useState<boolean>(() => getLocalStorage('ino_stok_show_financial', true));

  // Sync to Local Storage on Change
  // ponytail: useEffect penyimpan otomatis dicabut untuk 7 entitas transaksional (dijaga oleh dataService)
  useEffect(() => { setLocalStorage('ino_consignments', consignments); }, [consignments]);

  useEffect(() => {
    const handleStart = () => setIsGlobalLoading(true);
    const handleEnd = () => setIsGlobalLoading(false);
    window.addEventListener('ino_loading_start', handleStart);
    window.addEventListener('ino_loading_end', handleEnd);
    return () => {
      window.removeEventListener('ino_loading_start', handleStart);
      window.removeEventListener('ino_loading_end', handleEnd);
    };
  }, []);

  // Ambil pengaturan dari Google Sheet saat aplikasi pertama dibuka
  useEffect(() => {
    const syncSettingsFromGas = async () => {
      try {
        const bootstrap = await getBootstrapStatus();
        setIsSystemInitialized(bootstrap.initialized);

        const settings = await fetchSettings();
        if (settings && settings.length > 0) {
          settings.forEach(item => {
            const val = item.value;
            switch(item.key) {
              case 'nama_toko': setNamaToko(val); break;
              case 'tipe_bisnis': setTipeBisnis(val); break;
              case 'alamat_toko': setAlamatToko(val); break;
              case 'telp_toko': setTelpToko(val); break;
              case 'kota_toko': setKotaToko(val); break;
              case 'mata_uang': setMataUang(val); break;
              case 'ppn_rate': setPpnRate(parseFloat(val) || 0.11); break;
              case 'metode_hpp_default': setMetodeHppDefault(val); break;
            }
          });
        }
      } catch (err) {
        console.warn('Gagal sinkronisasi setting awal:', err);
      }
    };
    syncSettingsFromGas();
  }, []);

  // Sync Settings to Local Storage
  useEffect(() => { setLocalStorage('ino_tipe_bisnis', tipeBisnis); }, [tipeBisnis]);
  useEffect(() => { setLocalStorage('ino_is_login_active', isLoginActive); }, [isLoginActive]);
  useEffect(() => { setLocalStorage('ino_login_username', loginUsername); }, [loginUsername]);
  useEffect(() => { setLocalStorage('ino_login_password', loginPassword); }, [loginPassword]);

  useEffect(() => { setLocalStorage('ino_nama_toko', namaToko); }, [namaToko]);
  useEffect(() => { setLocalStorage('ino_alamat_toko', alamatToko); }, [alamatToko]);
  useEffect(() => { setLocalStorage('ino_telp_toko', telpToko); }, [telpToko]);
  useEffect(() => { setLocalStorage('ino_kota_toko', kotaToko); }, [kotaToko]);
  useEffect(() => { setLocalStorage('ino_ppn_rate', ppnRate); }, [ppnRate]);
  useEffect(() => { setLocalStorage('ino_metode_hpp_default', metodeHppDefault); }, [metodeHppDefault]);
  useEffect(() => { setLocalStorage('ino_mata_uang', mataUang); }, [mataUang]);
  useEffect(() => { setLocalStorage('ino_drive_folder_struk', driveFolderStruk); }, [driveFolderStruk]);
  useEffect(() => { setLocalStorage('ino_format_tanggal', formatTanggal); }, [formatTanggal]);

  useEffect(() => { setLocalStorage('ino_setting_categories', settingCategories); }, [settingCategories]);
  useEffect(() => { setLocalStorage('ino_setting_subcategories', settingSubCategories); }, [settingSubCategories]);
  useEffect(() => { setLocalStorage('ino_setting_units', settingUnits); }, [settingUnits]);
  useEffect(() => { setLocalStorage('ino_setting_storages', settingStorageLocations); }, [settingStorageLocations]);
  useEffect(() => { setLocalStorage('ino_setting_cash_accounts', settingCashAccounts); }, [settingCashAccounts]);
  useEffect(() => { setLocalStorage('ino_setting_platforms', settingPlatforms); }, [settingPlatforms]);
  useEffect(() => { setLocalStorage('ino_setting_prefixes', settingPrefixes); }, [settingPrefixes]);
  useEffect(() => {
    // R12: Pada mode GAS jangan simpan daftar user ke localStorage
    if (!isGasEnv_) setLocalStorage('ino_setting_users', settingUsersList);
  }, [settingUsersList]);
  useEffect(() => { setLocalStorage('ino_boms', boms); }, [boms]);
  useEffect(() => { setLocalStorage('ino_riwayat_produksi', riwayatProduksi); }, [riwayatProduksi]);
  useEffect(() => { setLocalStorage('ino_stok_prices', stokPrices); }, [stokPrices]);
  useEffect(() => { setLocalStorage('ino_stok_show_financial', stokShowFinancial); }, [stokShowFinancial]);

  // ponytail: Migrasi hashing password sisi klien.
  // Catatan: Hashing ini terjadi di sisi klien dan hanya sebagai pengamanan dasar.
  // Jika password di localStorage belum di-hash (panjang bukan 64), kita hash.
  useEffect(() => {
    if (isGasEnv_) return; // R12: Pada mode GAS, autentikasi sepenuhnya diatur oleh server GAS
    const migratePasswords = async () => {
      const storedSuperPass = getLocalStorage('ino_login_password', '');
      if (storedSuperPass && !(storedSuperPass.length === 64 && /^[0-9a-f]{64}$/i.test(storedSuperPass))) {
        const hashed = await hashPassword(storedSuperPass);
        setLoginPassword(hashed);
        setLocalStorage('ino_login_password', hashed);
      }

      const storedUsers = getLocalStorage('ino_setting_users', []);
      let usersMigrated = false;
      const newUsers = await Promise.all(storedUsers.map(async (u: any) => {
        if (u.pin && !(u.pin.length === 64 && /^[0-9a-f]{64}$/i.test(u.pin))) {
          usersMigrated = true;
          return { ...u, pin: await hashPassword(u.pin) };
        }
        return u;
      }));
      if (usersMigrated) {
        setSettingUsersList(newUsers);
        setLocalStorage('ino_setting_users', newUsers);
      }
    };
    migratePasswords();
  }, []);

  // Gmail States
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSubject, setEmailSubject] = useState('Laporan Stok & Mutasi');

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo) return triggerToast('Email tujuan harus diisi', 'error');

    setEmailSending(true);
    try {
      // Generate HTML report summary
      const body = `
      <h3>${emailSubject}</h3>
      <p>Tanggal: ${new Date().toLocaleDateString('id-ID')}</p>
      <p>Total Produk Aktif: ${products.length}</p>
      <p>Total Nilai Valuasi: Rp ${products.reduce((sum, p) => sum + (p.stok * (p.hpp || 0)), 0).toLocaleString('id-ID')}</p>
      <hr />
      <p>Ini adalah email laporan otomatis yang dikirim dari sistem inventori.</p>
      `;

      await sendEmailReport(emailTo, emailSubject, body);
      triggerToast('Email laporan berhasil dikirim!', 'success');
      setShowEmailModal(false);
      setEmailTo('');
    } catch (err: any) {
      console.error(err);
      triggerToast('Gagal mengirim email: ' + err.message, 'error');
    } finally {
      setEmailSending(false);
    }
  };

  // Stock Report Control States
  const [stokHideZeroQty, setStokHideZeroQty] = useState<boolean>(() => getLocalStorage('ino_stok_hide_zero', false));
  const [stokShowUnitPrice, setStokShowUnitPrice] = useState<boolean>(() => getLocalStorage('ino_stok_show_unit_price', true));
  const [stokShowAmount, setStokShowAmount] = useState<boolean>(() => getLocalStorage('ino_stok_show_amount', true));
  const [stokSelectedSkus, setStokSelectedSkus] = useState<string[]>([]);

  useEffect(() => { setLocalStorage('ino_stok_hide_zero', stokHideZeroQty); }, [stokHideZeroQty]);
  useEffect(() => { setLocalStorage('ino_stok_show_unit_price', stokShowUnitPrice); }, [stokShowUnitPrice]);
  useEffect(() => { setLocalStorage('ino_stok_show_amount', stokShowAmount); }, [stokShowAmount]);

  // Report Hub States
  const [selectedStokMonths, setSelectedStokMonths] = useState<string[]>(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']);
  const [stokViewMode, setStokViewMode] = useState<'daily' | 'three_days' | 'weekly' | 'monthly' | 'quarterly' | 'annual'>('monthly');
  const [stokSearchTerm, setStokSearchTerm] = useState('');
  const debouncedStokSearchTerm = useDebounce(stokSearchTerm, 300);
  const [dailySalesReportMonth, setDailySalesReportMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [showAddConsignmentModal, setShowAddConsignmentModal] = useState(false);
  const [showSellConsignmentModal, setShowSellConsignmentModal] = useState(false);
  const [consignmentForm, setConsignmentForm] = useState({
    consignor: '',
    sku: '',
    nama: '',
    qtyReceived: 10,
    harga: 10000,
    komisiPct: 20,
    catatan: ''
  });
  const [consignmentSellForm, setConsignmentSellForm] = useState({
    id: '',
    qtySold: 5
  });

  // Sub-tabs for spreadsheet toggling
  const [relasiTab, setRelasiTab] = useState('daftar'); // 'daftar' | 'spreadsheet_customer' | 'spreadsheet_supplier'

  // Modul Produksi form states
  const [produksiActiveSubTab, setProduksiActiveSubTab] = useState<string>('form_produksi');
  const [selectedBomId, setSelectedBomId] = useState<string>('');
  const [qtyToProduce, setQtyToProduce] = useState<number>(10);
  const [laborCostInput, setLaborCostInput] = useState<number>(0);

  const [showAddBomModal, setShowAddBomModal] = useState<boolean>(false);
  const [isEditingBom, setIsEditingBom] = useState<boolean>(false);
  const [editingBomId, setEditingBomId] = useState<string>('');
  const [bomFormSkuFinishedGood, setBomFormSkuFinishedGood] = useState<string>('');
  const [bomFormIngredients, setBomFormIngredients] = useState<any[]>([]);
  const [newIngredientSku, setNewIngredientSku] = useState<string>('');
  const [newIngredientQty, setNewIngredientQty] = useState<number>(1);

  // Dashboard Sub-Tabs & Filters
  const [dashboardSubTab, setDashboardSubTab] = useState<'operasional' | 'analitik'>('operasional');
  const [analitikStartDate, setAnalitikStartDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`);
  const [arusKasFilterAkun, setArusKasFilterAkun] = useState('Semua Akun');
  const [analitikEndDate, setAnalitikEndDate] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()}`);
  const [selectedSkuAnalysis, setSelectedSkuAnalysis] = useState('');
  const [selectedCustomerAnalysis, setSelectedCustomerAnalysis] = useState('');

  // States for Company Onboarding / Creation Wizard
  const [showCreateCompanyModal, setShowCreateCompanyModal] = useState(false);
  const [newCompanyForm, setNewCompanyForm] = useState({
    nama: '',
    alamat: '',
    telp: '',
    kota: '',
    tipeTemplate: 'empty' // 'empty' | 'bakery' | 'retail' | 'consignment'
  });

  // ponytail: Memoize getActivePeriods and computeStockLedgerData to prevent severe lag during typing/rendering on other tabs
  const activePeriods = React.useMemo(() => {
    if (stokViewMode === 'monthly') {
      return selectedStokMonths.map(m => {
        const mConf = AVAILABLE_MONTHS.find(x => x.id === m)!;
        return {
          id: m,
          label: mConf.label,
          startDate: `${new Date().getFullYear()}-${mConf.code}-01`,
          endDate: `${new Date().getFullYear()}-${mConf.code}-31`
        };
      });
    } else if (stokViewMode === 'quarterly') {
      return QUARTERS_DEF.map(q => {
        const startM = AVAILABLE_MONTHS.find(x => x.id === q.months[0])!;
        const endM = AVAILABLE_MONTHS.find(x => x.id === q.months[q.months.length - 1])!;
        return {
          id: q.id,
          label: q.label,
          startDate: `${new Date().getFullYear()}-${startM.code}-01`,
          endDate: `${new Date().getFullYear()}-${endM.code}-31`
        };
      });
    } else if (stokViewMode === 'annual') {
      const yr = new Date().getFullYear();
      return [{
        id: 'annual',
        label: `Konsolidasi Tahunan ${yr}`,
        startDate: `${yr}-01-01`,
        endDate: `${yr}-12-31`
      }];
    }

    // Daily, weekly, 3-day view: dynamic slice between analitikStartDate and analitikEndDate
    const start = new Date(analitikStartDate);
    const end = new Date(analitikEndDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (stokViewMode === 'daily') {
      const limit = Math.min(diffDays, 31); // Guard to prevent rendering too many columns
      const list = [];
      for (let i = 0; i < limit; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        list.push({
          id: dateStr,
          label: `${dd}/${mm}`,
          startDate: dateStr,
          endDate: dateStr
        });
      }
      return list;
    } else if (stokViewMode === 'three_days') {
      const list = [];
      const bucketSize = 3;
      const limitBuckets = Math.min(Math.ceil(diffDays / bucketSize), 15);
      for (let i = 0; i < limitBuckets; i++) {
        const dStart = new Date(start);
        dStart.setDate(start.getDate() + (i * bucketSize));
        const dEnd = new Date(dStart);
        dEnd.setDate(dStart.getDate() + (bucketSize - 1));
        if (dEnd > end) dEnd.setTime(end.getTime());

        const mmStart = String(dStart.getMonth() + 1).padStart(2, '0');
        const ddStart = String(dStart.getDate()).padStart(2, '0');
        const mmEnd = String(dEnd.getMonth() + 1).padStart(2, '0');
        const ddEnd = String(dEnd.getDate()).padStart(2, '0');

        const yStart = dStart.getFullYear();
        const yEnd = dEnd.getFullYear();

        list.push({
          id: `3D_${i}`,
          label: `${ddStart}/${mmStart}-${ddEnd}/${mmEnd}`,
          startDate: `${yStart}-${mmStart}-${ddStart}`,
          endDate: `${yEnd}-${mmEnd}-${ddEnd}`
        });
      }
      return list;
    } else {
      // weekly
      const list = [];
      const bucketSize = 7;
      const limitBuckets = Math.min(Math.ceil(diffDays / bucketSize), 12);
      for (let i = 0; i < limitBuckets; i++) {
        const dStart = new Date(start);
        dStart.setDate(start.getDate() + (i * bucketSize));
        const dEnd = new Date(dStart);
        dEnd.setDate(dStart.getDate() + (bucketSize - 1));
        if (dEnd > end) dEnd.setTime(end.getTime());

        const mmStart = String(dStart.getMonth() + 1).padStart(2, '0');
        const ddStart = String(dStart.getDate()).padStart(2, '0');
        const mmEnd = String(dEnd.getMonth() + 1).padStart(2, '0');
        const ddEnd = String(dEnd.getDate()).padStart(2, '0');

        const yStart = dStart.getFullYear();
        const yEnd = dEnd.getFullYear();

        list.push({
          id: `W_${i}`,
          label: `Mgg ${i + 1} (${ddStart}/${mmStart})`,
          startDate: `${yStart}-${mmStart}-${ddStart}`,
          endDate: `${yEnd}-${mmEnd}-${ddEnd}`
        });
      }
      return list;
    }
  }, [stokViewMode, selectedStokMonths, analitikStartDate, analitikEndDate]);

  const ledgerData = React.useMemo(() => {
    if (activePeriods.length === 0) return [];

    return products.map((p: any) => {
      let totalInFromEarliest = 0;
      let totalOutFromEarliest = 0;

      const periodMovements = activePeriods.map(period => {
        const isMonthlyMatching = stokViewMode === 'monthly';
        const isQuarterlyMatching = stokViewMode === 'quarterly';

        const dateMatches = (tgl: string) => {
          if (isMonthlyMatching) {
            const mCode = AVAILABLE_MONTHS.find(x => x.id === period.id)?.code;
            return tgl.startsWith(`${new Date().getFullYear()}-${mCode}`);
          }
          if (isQuarterlyMatching) {
            const mCodes = QUARTERS_DEF.find(x => x.id === period.id)?.months.map(m => AVAILABLE_MONTHS.find(x => x.id === m)?.code) || [];
            return mCodes.some(mc => tgl.startsWith(`2026-${mc}`));
          }
          return tgl >= period.startDate && tgl <= period.endDate;
        };

        // PO Qty
        const poQty = purchaseOrders
          .filter(po => dateMatches(po.tanggal) && po.statusLogistik === 'Diterima')
          .reduce((sum, po) => {
            const item = po.items.find((i: any) => i.sku === p.sku);
            return sum + (item ? item.qty : 0);
          }, 0);

        // Opname Plus
        const opnamePlusQty = opnameLog
          .filter(log => dateMatches(log.tanggal) && log.sku === p.sku && log.tipe === 'OPNAME_PLUS')
          .reduce((sum, log) => sum + Math.abs(log.selisih), 0);

        const stockInQty = poQty + opnamePlusQty;

        // Stock In price weighted average
        let stockInPrice = stokPrices[p.sku] ?? (p.hpp || 12000);
        const matchingPos = purchaseOrders.filter(po => dateMatches(po.tanggal) && po.statusLogistik === 'Diterima');
        let poTotalSpent = 0;
        let poTotalQty = 0;
        matchingPos.forEach(po => {
          const item = po.items.find((i: any) => i.sku === p.sku);
          if (item) {
            poTotalSpent += item.qty * item.harga;
            poTotalQty += item.qty;
          }
        });
        if (poTotalQty > 0) {
          stockInPrice = poTotalSpent / poTotalQty;
        } else {
          const opnamePlusEntry = opnameLog.find(log => dateMatches(log.tanggal) && log.sku === p.sku && log.tipe === 'OPNAME_PLUS');
          if (opnamePlusEntry && opnamePlusEntry.HPP) {
            stockInPrice = opnamePlusEntry.HPP;
          }
        }

        // SO Qty
        const soQty = salesOrders
          .filter(so => dateMatches(so.tanggal) && so.statusLogistik !== 'Void')
          .reduce((sum, so) => {
            const item = so.items.find((i: any) => i.sku === p.sku);
            return sum + (item ? item.qty : 0);
          }, 0);

        // Opname Minus
        const opnameMinusQty = opnameLog
          .filter(log => dateMatches(log.tanggal) && log.sku === p.sku && (log.tipe === 'OPNAME_MINUS' || log.tipe === 'WASTAGE'))
          .reduce((sum, log) => sum + Math.abs(log.selisih), 0);

        const stockOutQty = soQty + opnameMinusQty;

        totalInFromEarliest += stockInQty;
        totalOutFromEarliest += stockOutQty;

        return {
          periodId: period.id,
          periodLabel: period.label,
          stockInQty,
          stockInPrice,
          stockInAmount: stockInQty * stockInPrice,
          stockOutQty,
          stockOutPrice: 0,
          stockOutAmount: 0,
          endingQty: 0,
          endingPrice: 0,
          endingAmount: 0,
          beginningQty: 0,
          beginningPrice: 0,
          beginningAmount: 0
        };
      });

      // Reconstruct backward starting balance of earliestStart to ensure mathematical consistency with current live stock
      const initialQty = Math.max(0, p.stok - totalInFromEarliest + totalOutFromEarliest);
      const initialPrice = stokPrices[p.sku] ?? (p.hpp || 12000);
      const initialAmount = initialQty * initialPrice;

      // Queue of batches for FIFO tracking
      // Each batch: { qty: number, price: number }
      let fifoQueue: { qty: number; price: number }[] = [];
      if (initialQty > 0) {
        fifoQueue.push({ qty: initialQty, price: initialPrice });
      }

      // Forward pass for period cascade balance sheet
      let runningQty = initialQty;
      let runningAmount = initialAmount;

      const periodCascade = periodMovements.map(mov => {
        const beginningQty = runningQty;
        const beginningAmount = runningAmount;
        const beginningPrice = (beginningQty > 0) ? (beginningAmount / beginningQty) : (stokPrices[p.sku] ?? (p.hpp || 12000));

        const inQty = mov.stockInQty;
        const inPrice = mov.stockInPrice;
        const inAmount = mov.stockInAmount;

        // Add incoming stock to FIFO queue if positive
        if (inQty > 0) {
          fifoQueue.push({ qty: inQty, price: inPrice });
        }

        const outQty = mov.stockOutQty;
        let outAmount = 0;
        let remainingToDeduct = outQty;

        if (metodeHppDefault === 'FIFO') {
          // FIFO consumption logic
          const tempQueue = fifoQueue.map(b => ({ ...b })); // clone
          let consumedAmount = 0;

          while (remainingToDeduct > 0 && tempQueue.length > 0) {
            const oldestBatch = tempQueue[0];
            if (oldestBatch.qty <= remainingToDeduct) {
              consumedAmount += oldestBatch.qty * oldestBatch.price;
              remainingToDeduct -= oldestBatch.qty;
              tempQueue.shift();
            } else {
              consumedAmount += remainingToDeduct * oldestBatch.price;
              oldestBatch.qty -= remainingToDeduct;
              remainingToDeduct = 0;
            }
          }

          // If there is still excess to deduct (system sold items beyond stock)
          if (remainingToDeduct > 0) {
            const fallbackPrice = inQty > 0 ? inPrice : beginningPrice;
            consumedAmount += remainingToDeduct * fallbackPrice;
          }

          outAmount = consumedAmount;
          fifoQueue = tempQueue; // commit queue state after sale

          runningQty = Math.max(0, (beginningQty + inQty) - outQty);
          runningAmount = fifoQueue.reduce((sum, b) => sum + (b.qty * b.price), 0);

        } else {
          // Moving Average (HPP) logic
          const totalQtyBeforeSales = beginningQty + inQty;
          const totalAmountBeforeSales = beginningAmount + inAmount;
          const runningHpp = (totalQtyBeforeSales > 0) ? (totalAmountBeforeSales / totalQtyBeforeSales) : beginningPrice;

          outAmount = outQty * runningHpp;
          runningQty = Math.max(0, totalQtyBeforeSales - outQty);
          runningAmount = Math.max(0, totalAmountBeforeSales - outAmount);
        }

        const outPrice = outQty > 0 ? (outAmount / outQty) : (metodeHppDefault === 'FIFO' ? (fifoQueue[0]?.price ?? inPrice) : beginningPrice);
        const endingPrice = (runningQty > 0) ? (runningAmount / runningQty) : (metodeHppDefault === 'FIFO' ? (fifoQueue[0]?.price ?? inPrice) : beginningPrice);

        return {
          ...mov,
          beginningQty,
          beginningPrice,
          beginningAmount,
          stockOutPrice: outPrice,
          stockOutAmount: outAmount,
          endingQty: runningQty,
          endingPrice,
          endingAmount: runningAmount
        };
      });

      return {
        sku: p.sku,
        nama: p.nama,
        satuan: p.satuan,
        initialQty,
        initialPrice,
        initialAmount,
        periods: periodCascade,
        endingQty: runningQty
      };
    });
  }, [activePeriods, products, purchaseOrders, salesOrders, opnameLog, stokPrices, stokViewMode]);

  // Manual Cash Transaction Form Modal
  const [showManualCashModal, setShowManualCashModal] = useState(false);
  const [manualCashForm, setManualCashForm] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    keterangan: '',
    kategori: 'Operasional Lain',
    tipe: 'KELUAR', // 'MASUK' | 'KELUAR'
    nominal: 0,
    akun: 'Bank'
  });

  // Selected entities inside ledger spreadsheets
  const [selectedProductSku, setSelectedProductSku] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');

  // Cell state for each ledger spreadsheet (persisted)
  const [productLedgerCells, setProductLedgerCells] = useState<Record<string, string[][]>>(() => getLocalStorage('ino_product_ledgers', {}));
  const [customerLedgerCells, setCustomerLedgerCells] = useState<Record<string, string[][]>>(() => getLocalStorage('ino_customer_ledgers', {}));
  const [supplierLedgerCells, setSupplierLedgerCells] = useState<Record<string, string[][]>>(() => getLocalStorage('ino_supplier_ledgers', {}));

  // Viewing detail states for Rincian Transaksi modals
  const [viewingProductTx, setViewingProductTx] = useState<any | null>(null);
  const [viewingCustomerTx, setViewingCustomerTx] = useState<any | null>(null);
  const [viewingSupplierTx, setViewingSupplierTx] = useState<any | null>(null);

  useEffect(() => { setLocalStorage('ino_product_ledgers', productLedgerCells); }, [productLedgerCells]);
  useEffect(() => { setLocalStorage('ino_customer_ledgers', customerLedgerCells); }, [customerLedgerCells]);
  useEffect(() => { setLocalStorage('ino_supplier_ledgers', supplierLedgerCells); }, [supplierLedgerCells]);

  // Login Screen Controlled Input States
  const [loginInputUser, setLoginInputUser] = useState('');
  const [loginInputPass, setLoginInputPass] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);

  // Google Sheets / Excel Hub States
  const [sheetsHubSubTab, setSheetsHubSubTab] = useState<'ekspor' | 'impor' | 'gas'>('ekspor');
  const [importTargetType, setImportTargetType] = useState<'produk' | 'pelanggan' | 'supplier'>('produk');
  const [importMethod, setImportMethod] = useState<'merge' | 'overwrite'>('merge');
  const [pasteText, setPasteText] = useState('');
  const [parsedImportRows, setParsedImportRows] = useState<any[]>([]);
  const [parsedImportHeaders, setParsedImportHeaders] = useState<string[]>([]);

  // Auto-initialize active spreadsheet tabs
  useEffect(() => {
    if (!selectedProductSku && products.length > 0) {
      setSelectedProductSku(products[0].sku);
    }
  }, [products, selectedProductSku]);

  useEffect(() => {
    if (!selectedCustomerId && customers.length > 0) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!selectedSupplierId && suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
    }
  }, [suppliers, selectedSupplierId]);

  const triggerToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // ==========================================
  // ERP TRANSACTION EDIT & MODAL STATES
  // ==========================================
  const [selectedPo, setSelectedPo] = useState<any | null>(null);
  const [selectedSo, setSelectedSo] = useState<any | null>(null);

  const [poActionForm, setPoActionForm] = useState<'receipt' | 'payment' | 'retur' | 'print' | null>(null);
  const [soActionForm, setSoActionForm] = useState<'shipment' | 'payment' | 'retur' | 'print' | null>(null);

  // Form states for Penerimaan / Pengiriman
  const [poReceiptQtys, setPoReceiptQtys] = useState<Record<string, number>>({});
  const [soShipmentQtys, setSoShipmentQtys] = useState<Record<string, number>>({});

  // Form states for Pembayaran PO / Pelunasan SO
  const [poPaymentVal, setPoPaymentVal] = useState<number>(0);
  const [poPaymentMetode, setPoPaymentMetode] = useState<string>('Transfer Bank');
  const [poPaymentRef, setPoPaymentRef] = useState<string>('');
  const [poPaymentMemo, setPoPaymentMemo] = useState<string>('');

  const [soPaymentVal, setSoPaymentVal] = useState<number>(0);
  const [soPaymentMetode, setSoPaymentMetode] = useState<string>('Transfer Bank');
  const [soPaymentRef, setSoPaymentRef] = useState<string>('');
  const [soPaymentMemo, setSoPaymentMemo] = useState<string>('');

  // Form states for Retur
  const [poReturQtys, setPoReturQtys] = useState<Record<string, number>>({});
  const [poReturAlasan, setPoReturAlasan] = useState<string>('');

  const [soReturQtys, setSoReturQtys] = useState<Record<string, number>>({});
  const [soReturAlasan, setSoReturAlasan] = useState<string>('');

  // Dropdown states
  const [poShowKebab, setPoShowKebab] = useState<boolean>(false);
  const [soShowKebab, setSoShowKebab] = useState<boolean>(false);

  // Custom ERP Operations & Sub-Modal Handlers
  const handleOpenPoReceipt = (po: any) => {
    const qtys: Record<string, number> = {};
    po.items.forEach((item: any) => {
      const received = item.qtyReceived ?? (po.statusLogistik === 'Diterima' ? item.qty : 0);
      qtys[item.sku] = Math.max(0, item.qty - received);
    });
    setPoReceiptQtys(qtys);
    setPoActionForm('receipt');
  };

  const handleOpenSoShipment = (so: any) => {
    const qtys: Record<string, number> = {};
    so.items.forEach((item: any) => {
      const shipped = item.qtyShipped ?? (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai' ? item.qty : 0);
      qtys[item.sku] = Math.max(0, item.qty - shipped);
    });
    setSoShipmentQtys(qtys);
    setSoActionForm('shipment');
  };

  const handleOpenPoPayment = (po: any) => {
    const paid = po.totalPaid ?? (po.statusBayar === 'Lunas' ? po.grandTotal : 0);
    const sisa = Math.max(0, po.grandTotal - paid);
    setPoPaymentVal(sisa);
    setPoPaymentMetode('Transfer Bank');
    setPoPaymentRef('');
    setPoPaymentMemo('');
    setPoActionForm('payment');
  };

  const handleOpenSoPayment = (so: any) => {
    const paid = so.totalPaid ?? (so.statusBayar === 'Lunas' ? so.grandTotal : 0);
    const sisa = Math.max(0, so.grandTotal - paid);
    setSoPaymentVal(sisa);
    setSoPaymentMetode('Transfer Bank');
    setSoPaymentRef('');
    setSoPaymentMemo('');
    setSoActionForm('payment');
  };

  const handleOpenPoRetur = (po: any) => {
    const qtys: Record<string, number> = {};
    po.items.forEach((item: any) => {
      qtys[item.sku] = 0;
    });
    setPoReturQtys(qtys);
    setPoReturAlasan('');
    setPoActionForm('retur');
  };

  const handleOpenSoRetur = (so: any) => {
    const qtys: Record<string, number> = {};
    so.items.forEach((item: any) => {
      qtys[item.sku] = 0;
    });
    setSoReturQtys(qtys);
    setSoReturAlasan('');
    setSoActionForm('retur');
  };

  // 1. Submit Receipt (Penerimaan PO)
  const submitPoReceipt = async (poId: string) => {
    let hasValidInput = false;
    let anyError = false;

    const poIndex = purchaseOrders.findIndex((p: any) => p.id === poId);
    if (poIndex === -1) return;
    const po = purchaseOrders[poIndex];

    const updatedItems = po.items.map((item: any) => {
      const received = item.qtyReceived ?? (po.statusLogistik === 'Diterima' ? item.qty : 0);
      const inputVal = poReceiptQtys[item.sku] ?? 0;

      if (inputVal < 0) {
        triggerToast('Kuantitas terima tidak boleh negatif!', 'error');
        anyError = true;
        return item;
      }

      const sisa = item.qty - received;
      if (inputVal > sisa) {
        triggerToast(`Kuantitas terima untuk ${item.nama || item.sku} melebihi sisa pesanan (${sisa})!`, 'error');
        anyError = true;
        return item;
      }

      if (inputVal > 0) hasValidInput = true;
      return { ...item, qtyReceived: received + inputVal };
    });

    if (anyError) return;
    if (!hasValidInput) {
      triggerToast('Isi kuantitas terima minimal pada satu produk!', 'warning');
      return;
    }

    const allFullyReceived = updatedItems.every((item: any) => (item.qtyReceived || 0) >= item.qty);
    const someReceived = updatedItems.some((item: any) => (item.qtyReceived || 0) > 0);
    const newStatus = allFullyReceived ? 'Diterima' : someReceived ? 'Diterima Sebagian' : 'Menunggu';

    const updatedPo = { ...po, items: updatedItems, statusLogistik: newStatus };
    const nextPurchaseOrders = [...purchaseOrders];
    nextPurchaseOrders[poIndex] = updatedPo;
    setPurchaseOrders(nextPurchaseOrders);
    saveAllPurchaseOrders(nextPurchaseOrders);

    const opId = generateOpId();
    for (const [sku, deltaQty] of Object.entries(poReceiptQtys)) {
      if (deltaQty > 0) {
        await adjustStock(sku, deltaQty, opId);
      }
    }
    // Refresh products from server to get latest stock
    const refreshedProducts = await getProducts();
    setProducts(refreshedProducts);

    setSelectedPo(updatedPo);
    setPoActionForm(null);
    triggerToast(`Berhasil menerima barang untuk ${po.id}. Stok gudang ditambahkan.`);
  };

  // 2. Submit Shipment (Pengiriman SO)
  const submitSoShipment = async (soId: string) => {
    let hasValidInput = false;
    let anyError = false;

    const soIndex = salesOrders.findIndex((s: any) => s.id === soId);
    if (soIndex === -1) return;
    const so = salesOrders[soIndex];

    const updatedItems = so.items.map((item: any) => {
      const shipped = item.qtyShipped ?? (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai' ? item.qty : 0);
      const inputVal = soShipmentQtys[item.sku] ?? 0;

      if (inputVal < 0) {
        triggerToast('Kuantitas kirim tidak boleh negatif!', 'error');
        anyError = true;
        return item;
      }

      const sisa = item.qty - shipped;
      if (inputVal > sisa) {
        triggerToast(`Kuantitas kirim untuk ${item.nama || item.sku} melebihi sisa pesanan (${sisa})!`, 'error');
        anyError = true;
        return item;
      }

      const prod = products.find(p => p.sku === item.sku);
      if (prod && prod.stok < inputVal) {
        triggerToast(`Gagal kirim! Stok ${prod.nama} di gudang (${prod.stok}) kurang dari jumlah dikirim (${inputVal}).`, 'error');
        anyError = true;
        return item;
      }

      if (inputVal > 0) hasValidInput = true;
      return { ...item, qtyShipped: shipped + inputVal };
    });

    if (anyError) return;
    if (!hasValidInput) {
      triggerToast('Isi kuantitas kirim minimal pada satu produk!', 'warning');
      return;
    }

    const allDone = updatedItems.every((item: any) => (item.qtyShipped || 0) >= item.qty);
    const someDone = updatedItems.some((item: any) => (item.qtyShipped || 0) > 0);
    const newStatus = allDone ? 'Terkirim' : someDone ? 'Terkirim Sebagian' : 'Menunggu Pengiriman';

    const updatedSo = { ...so, items: updatedItems, statusLogistik: newStatus };
    const nextSalesOrders = [...salesOrders];
    nextSalesOrders[soIndex] = updatedSo;
    setSalesOrders(nextSalesOrders);
    await saveAllSalesOrders(nextSalesOrders);

    // Adjust stock per SKU using delta ops
    const opId = generateOpId();
    for (const [sku, deltaQty] of Object.entries(soShipmentQtys)) {
      if (deltaQty > 0) {
        await adjustStock(sku, -deltaQty, opId); // negative delta for shipment
      }
    }
    // Refresh products from server
    const refreshedProducts = await getProducts();
    setProducts(refreshedProducts);

    setSelectedSo(updatedSo);
    setSoActionForm(null);
    triggerToast(`Berhasil mengirimkan barang untuk ${so.id}. Stok gudang dikurangi.`);
  };

  // 3. Submit PO Payment
  const submitPoPayment = async (poId: string) => {
    if (poPaymentVal <= 0) return triggerToast('Nominal pembayaran tidak valid!', 'error');

    const poIndex = purchaseOrders.findIndex((p: any) => p.id === poId);
    if (poIndex === -1) return;
    const po = purchaseOrders[poIndex];

    const paid = po.totalPaid ?? (po.statusBayar === 'Lunas' ? po.grandTotal : 0);
    const sisa = po.grandTotal - paid;

    if (poPaymentVal > sisa) {
      triggerToast(`Nominal pembayaran (Rp ${poPaymentVal.toLocaleString('id-ID')}) melebihi sisa hutang (Rp ${sisa.toLocaleString('id-ID')})!`, 'error');
      return;
    }

    const updatedPaid = paid + poPaymentVal;
    const isLunas = updatedPaid >= po.grandTotal - 0.01;

    // Find supplier ID
    const supplier = suppliers.find(s => s.nama === po.supplier);
    if (!supplier) {
      triggerToast('Supplier tidak ditemukan!', 'error');
      return;
    }

    const opId = generateOpId();
    try {
      // Adjust supplier hutang (decrease)
      await adjustBalance('supplier', supplier.id, -poPaymentVal, opId);

      // Append cash ledger entry (kredit)
      const targetAkun = determineAccount(poPaymentMetode);
      await appendCashEntry({
        tanggal: new Date().toISOString().slice(0, 10),
        ref: po.id,
        keterangan: `Pembayaran Hutang ke Supplier ${po.supplier} [${po.id}]`,
        kategori: 'Pembelian',
        debit: 0,
        kredit: poPaymentVal,
        akun: targetAkun,
        metode: poPaymentMetode
      }, opId);

      // Refresh suppliers and cash ledger from server
      const [refreshedSuppliers, refreshedCashLedger] = await Promise.all([
        getSuppliers(),
        getCashLedger()
      ]);
      setSuppliers(refreshedSuppliers);
      setCashLedger(refreshedCashLedger);

      const updatedPo = { ...po, totalPaid: updatedPaid, statusBayar: isLunas ? 'Lunas' : 'Cicilan' };
      const nextPurchaseOrders = [...purchaseOrders];
      nextPurchaseOrders[poIndex] = updatedPo;
      setPurchaseOrders(nextPurchaseOrders);
      await saveAllPurchaseOrders(nextPurchaseOrders);

      setSelectedPo(updatedPo);
      setPoActionForm(null);
      triggerToast(`Pembayaran PO sebesar Rp ${poPaymentVal.toLocaleString('id-ID')} berhasil dicatat.`);
    } catch (err: any) {
      triggerToast('Gagal mencatat pembayaran: ' + err.message, 'error');
      // Rollback: refresh from server
      const [refreshedSuppliers, refreshedCashLedger] = await Promise.all([
        getSuppliers(),
        getCashLedger()
      ]);
      setSuppliers(refreshedSuppliers);
      setCashLedger(refreshedCashLedger);
    }
  };

  // 4. Submit SO Payment (Pelunasan Piutang)
  const submitSoPayment = async (soId: string) => {
    if (soPaymentVal <= 0) return triggerToast('Nominal pembayaran tidak valid!', 'error');

    const soIndex = salesOrders.findIndex((s: any) => s.id === soId);
    if (soIndex === -1) return;
    const so = salesOrders[soIndex];

    const paid = so.totalPaid ?? (so.statusBayar === 'Lunas' ? so.grandTotal : 0);
    const sisa = so.grandTotal - paid;

    if (soPaymentVal > sisa) {
      triggerToast(`Nominal setoran (Rp ${soPaymentVal.toLocaleString('id-ID')}) melebihi sisa piutang (Rp ${sisa.toLocaleString('id-ID')})!`, 'error');
      return;
    }

    const updatedPaid = paid + soPaymentVal;
    const isLunas = updatedPaid >= so.grandTotal - 0.01;

    // Find customer ID
    const customer = customers.find(c => c.nama === so.pelanggan);
    if (!customer) {
      triggerToast('Pelanggan tidak ditemukan!', 'error');
      return;
    }

    const opId = generateOpId();
    try {
      // Adjust customer piutang (decrease)
      await adjustBalance('customer', customer.id, -soPaymentVal, opId);

      // Append cash ledger entry (debit)
      const targetAkun = determineAccount(soPaymentMetode);
      await appendCashEntry({
        tanggal: new Date().toISOString().slice(0, 10),
        ref: so.id,
        keterangan: `Penerimaan Pelunasan dari Pelanggan ${so.pelanggan} [${so.id}]`,
        kategori: 'Penjualan',
        debit: soPaymentVal,
        kredit: 0,
        akun: targetAkun,
        metode: soPaymentMetode
      }, opId);

      // Refresh customers and cash ledger from server
      const [refreshedCustomers, refreshedCashLedger] = await Promise.all([
        getCustomers(),
        getCashLedger()
      ]);
      setCustomers(refreshedCustomers);
      setCashLedger(refreshedCashLedger);

      const updatedSo = { ...so, totalPaid: updatedPaid, statusBayar: isLunas ? 'Lunas' : 'Cicilan' };
      const nextSalesOrders = [...salesOrders];
      nextSalesOrders[soIndex] = updatedSo;
      setSalesOrders(nextSalesOrders);
      await saveAllSalesOrders(nextSalesOrders);

      setSelectedSo(updatedSo);
      setSoActionForm(null);
      triggerToast(`Pelunasan piutang sebesar Rp ${soPaymentVal.toLocaleString('id-ID')} berhasil dicatat.`);
    } catch (err: any) {
      triggerToast('Gagal mencatat pelunasan: ' + err.message, 'error');
      // Rollback: refresh from server
      const [refreshedCustomers, refreshedCashLedger] = await Promise.all([
        getCustomers(),
        getCashLedger()
      ]);
      setCustomers(refreshedCustomers);
      setCashLedger(refreshedCashLedger);
    }
  };

  // 5. Submit PO Retur
  const submitPoRetur = async (poId: string) => {
    let hasValidInput = false;
    let anyError = false;

    if (!poReturAlasan.trim()) {
      triggerToast('Alasan retur wajib diisi!', 'warning');
      return;
    }

    const poIndex = purchaseOrders.findIndex((p: any) => p.id === poId);
    if (poIndex === -1) return;
    const po = purchaseOrders[poIndex];

    const updatedItems = po.items.map((item: any) => {
      const received = item.qtyReceived ?? (po.statusLogistik === 'Diterima' ? item.qty : 0);
      const returned = item.qtyReturned ?? 0;
      const inputVal = poReturQtys[item.sku] ?? 0;

      if (inputVal < 0) {
        triggerToast('Kuantitas retur tidak boleh negatif!', 'error');
        anyError = true;
        return item;
      }

      const maxRetur = received - returned;
      if (inputVal > maxRetur) {
        triggerToast(`Jumlah retur untuk ${item.nama || item.sku} melebihi batas yang diterima (${maxRetur})!`, 'error');
        anyError = true;
        return item;
      }

      const prod = products.find(p => p.sku === item.sku);
      if (prod && prod.stok < inputVal) {
        triggerToast(`Gagal retur! Sisa stok ${prod.nama} di gudang (${prod.stok}) kurang dari jumlah retur (${inputVal}).`, 'error');
        anyError = true;
        return item;
      }

      if (inputVal > 0) hasValidInput = true;
      return { ...item, qtyReturned: returned + inputVal };
    });

    if (anyError) return;
    if (!hasValidInput) {
      triggerToast('Isi angka retur minimal pada satu barang.', 'warning');
      return;
    }

    const opId = generateOpId();
    try {
      // Adjust stock per SKU (decrease for retur)
      for (const [sku, deltaQty] of Object.entries(poReturQtys)) {
        if (deltaQty > 0) {
          await adjustStock(sku, -deltaQty, opId);
        }
      }
      // Refresh products
      const refreshedProducts = await getProducts();
      setProducts(refreshedProducts);

      let totalReturValue = 0;
      updatedItems.forEach((item: any) => {
        const inputVal = poReturQtys[item.sku] ?? 0;
        totalReturValue += inputVal * item.harga;
      });

      if (po.statusBayar === 'Belum Dibayar' || po.statusBayar === 'Cicilan') {
        const supplier = suppliers.find(s => s.nama === po.supplier);
        if (supplier) {
          await adjustBalance('supplier', supplier.id, -totalReturValue, opId);
          const refreshedSuppliers = await getSuppliers();
          setSuppliers(refreshedSuppliers);
        }
      }

      const currentReturns = po.returItems || [];
      const newReturns = [...currentReturns];
      updatedItems.forEach((item: any) => {
        const inputVal = poReturQtys[item.sku] ?? 0;
        if (inputVal > 0) {
          newReturns.push({ sku: item.sku, nama: item.nama, qty: inputVal, tanggal: new Date().toISOString().split('T')[0], alasan: poReturAlasan });
        }
      });

      const updatedPo = { ...po, items: updatedItems, returItems: newReturns };
      const nextPurchaseOrders = [...purchaseOrders];
      nextPurchaseOrders[poIndex] = updatedPo;
      setPurchaseOrders(nextPurchaseOrders);
      await saveAllPurchaseOrders(nextPurchaseOrders);

      setSelectedPo(updatedPo);
      setPoActionForm(null);
      triggerToast('Retur Pembelian berhasil diproses. Stok gudang dikurangi & hutang supplier disesuaikan.');
    } catch (err: any) {
      triggerToast('Gagal memproses retur: ' + err.message, 'error');
      // Rollback: refresh from server
      const [refreshedProducts, refreshedSuppliers] = await Promise.all([
        getProducts(),
        getSuppliers()
      ]);
      setProducts(refreshedProducts);
      setSuppliers(refreshedSuppliers);
    }
  };

  // 6. Submit SO Retur (Customer)
  const submitSoRetur = async (soId: string) => {
    let hasValidInput = false;
    let anyError = false;

    if (!soReturAlasan.trim()) {
      triggerToast('Alasan retur wajib diisi!', 'warning');
      return;
    }

    const soIndex = salesOrders.findIndex((s: any) => s.id === soId);
    if (soIndex === -1) return;
    const so = salesOrders[soIndex];

    const updatedItems = so.items.map((item: any) => {
      const shipped = item.qtyShipped ?? (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai' ? item.qty : 0);
      const returned = item.qtyReturned ?? 0;
      const inputVal = soReturQtys[item.sku] ?? 0;

      if (inputVal < 0) {
        triggerToast('Kuantitas retur tidak boleh negatif!', 'error');
        anyError = true;
        return item;
      }

      const maxRetur = shipped - returned;
      if (inputVal > maxRetur) {
        triggerToast(`Jumlah retur untuk ${item.nama || item.sku} melebihi batas yang dikirim (${maxRetur})!`, 'error');
        anyError = true;
        return item;
      }

      if (inputVal > 0) hasValidInput = true;
      return { ...item, qtyReturned: returned + inputVal };
    });

    if (anyError) return;
    if (!hasValidInput) {
      triggerToast('Isi angka retur minimal pada satu barang.', 'warning');
      return;
    }

    const opId = generateOpId();
    try {
      // Adjust stock per SKU (increase for retur)
      for (const [sku, deltaQty] of Object.entries(soReturQtys)) {
        if (deltaQty > 0) {
          await adjustStock(sku, deltaQty, opId);
        }
      }
      // Refresh products
      const refreshedProducts = await getProducts();
      setProducts(refreshedProducts);

      let totalReturValue = 0;
      updatedItems.forEach((item: any) => {
        const inputVal = soReturQtys[item.sku] ?? 0;
        totalReturValue += inputVal * item.harga;
      });

      if (so.statusBayar === 'Belum Lunas' || so.statusBayar === 'Cicilan') {
        const customer = customers.find(c => c.nama === so.pelanggan);
        if (customer) {
          await adjustBalance('customer', customer.id, -totalReturValue, opId);
          const refreshedCustomers = await getCustomers();
          setCustomers(refreshedCustomers);
        }
      }

      const currentReturns = so.returItems || [];
      const newReturns = [...currentReturns];
      updatedItems.forEach((item: any) => {
        const inputVal = soReturQtys[item.sku] ?? 0;
        if (inputVal > 0) {
          newReturns.push({ sku: item.sku, nama: item.nama, qty: inputVal, tanggal: new Date().toISOString().split('T')[0], alasan: soReturAlasan });
        }
      });

      const updatedSo = { ...so, items: updatedItems, returItems: newReturns };
      const nextSalesOrders = [...salesOrders];
      nextSalesOrders[soIndex] = updatedSo;
      setSalesOrders(nextSalesOrders);
      await saveAllSalesOrders(nextSalesOrders);

      setSelectedSo(updatedSo);
      setSoActionForm(null);
      triggerToast('Retur Penjualan berhasil diproses. Stok gudang ditambahkan & piutang customer disesuaikan.');
    } catch (err: any) {
      triggerToast('Gagal memproses retur: ' + err.message, 'error');
      // Rollback: refresh from server
      const [refreshedProducts, refreshedCustomers] = await Promise.all([
        getProducts(),
        getCustomers()
      ]);
      setProducts(refreshedProducts);
      setCustomers(refreshedCustomers);
    }
  };

  // 7. Approve PO (Draft -> Official)
  const handleApprovePO = (poId: string) => {
    const poIndex = purchaseOrders.findIndex((p: any) => p.id === poId);
    if (poIndex === -1) return;
    const po = purchaseOrders[poIndex];

    const nextSuppliers = suppliers.map(s => s.nama === po.supplier ? { ...s, hutang: s.hutang + po.grandTotal } : s);
    setSuppliers(nextSuppliers);
    saveAllSuppliers(nextSuppliers);

    const updatedPo = { ...po, statusLogistik: 'Menunggu', statusBayar: 'Belum Dibayar' };
    const nextPurchaseOrders = [...purchaseOrders];
    nextPurchaseOrders[poIndex] = updatedPo;
    setPurchaseOrders(nextPurchaseOrders);
    saveAllPurchaseOrders(nextPurchaseOrders);

    setSelectedPo(updatedPo);
    triggerToast(`PO ${poId} berhasil disetujui & dirilis ke Supplier.`);
  };

  // ==========================================
  // FORM & MODAL STATES
  // ==========================================

  // Product Modal State
  const [showProductModal, setShowProductModal] = useState(false);
  const [showMasterConfigModal, setShowMasterConfigModal] = useState(false);
  const [showOpnameModal, setShowOpnameModal] = useState(false);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [productForm, setProductForm] = useState<any>({
    sku: '', prefix: 'RTL', kategori: 'Barang Jadi', subKat: '', nama: '', satuan: 'Pcs',
    hj: 0, hpp: 0, safety: 10, stok: 0, status: 'Aktif', supplier: '',
    tempatSimpan: 'Gudang Utama', masaSmp: 'Selamanya', catatan: ''
  });

  // Client/Supplier Modals
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ id: '', nama: '', kontak: '', email: '', telp: '', alamat: '', piutang: 0 });

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [isEditingSupplier, setIsEditingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ id: '', nama: '', kontak: '', email: '', telp: '', alamat: '', hutang: 0 });

  // PO & SO Batch creation Form States
  const [poForm, setPoForm] = useState({
    id: '', supplier: '', tanggal: new Date().toISOString().split('T')[0],
    metode: 'Kredit 30 Hari', items: [{ sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }],
    pajak: false, catatan: '', platform: 'Toko Langsung'
  });
  const [showPoForm, setShowPoForm] = useState(false);
  const [showPoPlatformModal, setShowPoPlatformModal] = useState(false);
  const [isEditingPo, setIsEditingPo] = useState(false);

  const [soForm, setSoForm] = useState({
    id: '', pelanggan: '', tanggal: new Date().toISOString().split('T')[0],
    metode: 'Tempo 30 Hari', items: [{ sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }],
    pajak: false, catatan: '', platform: 'Toko Langsung'
  });
  const [showSoForm, setShowSoForm] = useState(false);
  const [isEditingSo, setIsEditingSo] = useState(false);

  // Opname / Wastage State
  const [opnameForm, setOpnameForm] = useState<{
    sku: string;
    tipe: string;
    qtySistem: number;
    selisih: number | string;
    qtyFisik: number | string;
    catatan: string;
  }>({
    sku: '', tipe: 'OPNAME_PLUS', qtySistem: 0, selisih: 0, qtyFisik: 0, catatan: ''
  });
  const [showOpnameConfirm, setShowOpnameConfirm] = useState(false);

  // ==========================================
  // CALCULATIONS (KPI MONITOR)
  // ==========================================
  const monitorPiutang = customers.reduce((sum, c) => sum + c.piutang, 0);
  const monitorHutang = suppliers.reduce((sum, s) => sum + s.hutang, 0);
  const criticalStockList = products.filter(p => p.stok < p.safety && p.status === 'Aktif');
  const monitorStokKritis = criticalStockList.length;
  const monitorAsetStok = products.reduce((sum, p) => sum + (p.stok * p.hpp), 0);

  const triggerGeneratePo = (p: any) => {
    setPoForm({
      id: '',
      supplier: p.supplier || suppliers[0]?.nama || '',
      tanggal: new Date().toISOString().split('T')[0],
      metode: 'Kredit 30 Hari',
      items: [{ sku: p.sku, nama: p.nama, satuan: p.satuan, qty: Math.max(10, p.safety * 2 - p.stok), harga: p.hpp, subtotal: Math.max(10, p.safety * 2 - p.stok) * p.hpp }],
      pajak: false,
      catatan: `Reorder stok kritis otomatis untuk SKU: ${p.sku}`,
      platform: 'Toko Langsung'
    });
    setIsEditingPo(false);
    setShowPoForm(true);
    setActiveTab('purchase_order');
    triggerToast(`Form PO Baru diisi otomatis untuk SKU ${p.sku}! Silakan periksa dan rilis PO.`, 'success');
  };

  const handleDeleteManualCash = async (id: string) => {
    if (!window.confirm('Hapus transaksi kas manual ini? Saldo akan dikalkulasi ulang secara otomatis.')) return;
    try {
      const targetTx = cashLedger.find(entry => entry.id === id);
      if (!targetTx) return;

      const targetAkun = targetTx.akun || 'Bank';
      const updatedLedger = cashLedger.filter(entry => entry.id !== id);

      // Recalculate balances for the specific account
      let currentBal = 0;
      updatedLedger.forEach(entry => {
        if ((entry.akun || 'Bank') === targetAkun) {
          currentBal = currentBal + (entry.debit || 0) - (entry.kredit || 0);
          entry.saldo = currentBal;
        }
      });

      setCashLedger(updatedLedger);
      await saveAllCashLedger(updatedLedger);
      triggerToast('Transaksi kas manual berhasil dihapus', 'success');
    } catch (error) {
      triggerToast('Gagal menghapus transaksi', 'error');
    }
  };

  const handleAddManualCash = async (e: React.FormEvent) => {
    if (isSavingCash) return;
    e.preventDefault();
    // ponytail: Validasi angka negatif di trust boundary
    if (manualCashForm.nominal < 0) {
      triggerToast('Error: Nominal tidak boleh negatif!', 'error');
      return;
    }
    if (manualCashForm.nominal === 0) {
      triggerToast('Nominal harus lebih besar dari 0!', 'error');
      return;
    }
    if (!manualCashForm.keterangan.trim()) {
      triggerToast('Keterangan tidak boleh kosong!', 'error');
      return;
    }

    setIsSavingCash(true);
    try {
      const isKredit = manualCashForm.tipe === 'KELUAR';
      const deb = isKredit ? 0 : manualCashForm.nominal;
      const kre = isKredit ? manualCashForm.nominal : 0;

      const targetAkun = manualCashForm.akun || 'Bank';
      const accountTx = cashLedger.filter(c => (c.akun || 'Bank') === targetAkun);
      const lastBal = accountTx.length > 0 ? accountTx[accountTx.length - 1].saldo : 0;
      const newBal = isKredit ? lastBal - manualCashForm.nominal : lastBal + manualCashForm.nominal;
      const cashEntry = {
        tanggal: manualCashForm.tanggal,
        ref: `MANUAL-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, // ref can stay client-side
        keterangan: manualCashForm.keterangan,
        kategori: manualCashForm.kategori,
        debit: deb,
        kredit: kre,
        saldo: newBal,
        akun: targetAkun
      };
      const result = await createCashEntry(cashEntry);
      const newEntry = { ...cashEntry, id: result.id };
      setCashLedger([...cashLedger, newEntry]);

      setShowManualCashModal(false);
      setManualCashForm({
        tanggal: new Date().toISOString().split('T')[0],
        keterangan: '',
        kategori: 'Operasional Lain',
        tipe: 'KELUAR',
        nominal: 0,
        akun: settingCashAccounts.length > 0 ? settingCashAccounts[0].nama : 'Bank'
      });
      triggerToast('Mutasi kas manual berhasil dicatat!', 'success');
    } finally {
      setIsSavingCash(false);
    }
  };

  const isSoOverdue = (so: any) => {
    if (so.statusBayar === 'Lunas') return false;
    if (so.metode === 'Tunai') return false;
    const txDate = new Date(so.tanggal);
    const dueDate = new Date(txDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    return today > dueDate;
  };

  const isPoOverdue = (po: any) => {
    if (po.statusBayar === 'Lunas') return false;
    if (po.metode === 'Tunai') return false;
    const txDate = new Date(po.tanggal);
    const dueDate = new Date(txDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    return today > dueDate;
  };

  const getMonthlyPandL = () => {
    // Dinamis: generate daftar bulan dari bulan pertama transaksi hingga bulan ini
    const allDates = [
      ...salesOrders.map(so => so.tanggal),
      ...purchaseOrders.map(po => po.tanggal),
      ...cashLedger.map(c => c.tanggal)
    ].filter(Boolean).sort();
    const now = new Date();
    const currentYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthsSet = new Set<string>();
    allDates.forEach(d => { if (d && d.length >= 7) monthsSet.add(d.slice(0, 7)); });
    monthsSet.add(currentYM);
    const months = Array.from(monthsSet).sort();
    return months.map(m => {
      const monthlySales = salesOrders.filter(so => so.tanggal.startsWith(m) && so.statusLogistik !== 'Void');
      const omzet = monthlySales.reduce((sum, so) => sum + so.subtotal, 0);

      const hpp = monthlySales.reduce((sum, so) => {
        return sum + so.items.reduce((itemSum: number, item: any) => {
          const prod = products.find(p => p.sku === item.sku);
          const itemHpp = prod ? prod.hpp : 12000;
          return itemSum + (item.qty * itemHpp);
        }, 0);
      }, 0);

      const monthlyOpex = cashLedger.filter(c => c.tanggal.startsWith(m) && c.kategori !== 'Pembelian' && c.kategori !== 'Modal' && c.kredit > 0);
      const opex = monthlyOpex.reduce((sum, c) => sum + c.kredit, 0);

      const [yy, mm] = m.split('-');
      const monthLabels: Record<string, string> = { '01': 'Januari', '02': 'Februari', '03': 'Maret', '04': 'April', '05': 'Mei', '06': 'Juni', '07': 'Juli', '08': 'Agustus', '09': 'September', '10': 'Oktober', '11': 'November', '12': 'Desember' };
      const label = `${monthLabels[mm] || mm} ${yy}`;

      return {
        label,
        'Omzet (Revenue)': omzet,
        'HPP (COGS)': hpp,
        'Opex (Operasional)': opex,
        'Laba Kotor': omzet - hpp,
        'Laba Bersih': omzet - hpp - opex
      };
    });
  };

  const getOpexBreakdown = () => {
    const filtered = cashLedger.filter(c =>
      c.tanggal >= analitikStartDate &&
      c.tanggal <= analitikEndDate &&
      c.kategori !== 'Pembelian' &&
      c.kategori !== 'Modal' &&
      c.kredit > 0
    );
    const grouped: Record<string, number> = {};
    filtered.forEach(c => {
      grouped[c.kategori] = (grouped[c.kategori] || 0) + c.kredit;
    });
    return Object.entries(grouped).map(([kategori, total]) => ({
      name: kategori,
      value: total
    }));
  };

  const getTop10VolumeSKUs = () => {
    const inRangeSo = salesOrders.filter(so =>
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );
    const counts: Record<string, { sku: string; nama: string; qty: number }> = {};
    inRangeSo.forEach(so => {
      so.items.forEach((item: any) => {
        if (!counts[item.sku]) {
          counts[item.sku] = { sku: item.sku, nama: item.nama || '', qty: 0 };
        }
        counts[item.sku].qty += item.qty;
      });
    });
    return Object.values(counts)
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  };

  const getTop10ProfitSKUs = () => {
    const inRangeSo = salesOrders.filter(so =>
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );
    const profits: Record<string, { sku: string; nama: string; profit: number }> = {};
    inRangeSo.forEach(so => {
      so.items.forEach((item: any) => {
        const p = products.find(prod => prod.sku === item.sku);
        const hpp = p ? p.hpp : 0;
        const profitVal = item.qty * (item.harga - hpp);
        if (!profits[item.sku]) {
          profits[item.sku] = { sku: item.sku, nama: item.nama || '', profit: 0 };
        }
        profits[item.sku].profit += profitVal;
      });
    });
    return Object.values(profits)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10);
  };

  const getTopCustomersByProfit = () => {
    const inRangeSo = salesOrders.filter(so =>
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );
    const customerProfits: Record<string, { id: string; nama: string; profit: number; revenue: number }> = {};
    inRangeSo.forEach(so => {
      const custName = so.pelanggan;
      let profitVal = 0;
      so.items.forEach((item: any) => {
        const p = products.find(prod => prod.sku === item.sku);
        const hpp = p ? p.hpp : 0;
        profitVal += item.qty * (item.harga - hpp);
      });
      if (!customerProfits[custName]) {
        customerProfits[custName] = { id: custName, nama: custName, profit: 0, revenue: 0 };
      }
      customerProfits[custName].profit += profitVal;
      customerProfits[custName].revenue += so.grandTotal;
    });
    return Object.values(customerProfits)
      .sort((a, b) => b.profit - a.profit);
  };

  const getSalesVsPurchaseTrend = () => {
    const datesSet = new Set<string>();

    const validSos = salesOrders.filter(so =>
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );
    const validPos = purchaseOrders.filter(po =>
      po.tanggal >= analitikStartDate &&
      po.tanggal <= analitikEndDate &&
      po.statusLogistik !== 'Void'
    );

    validSos.forEach(so => datesSet.add(so.tanggal));
    validPos.forEach(po => datesSet.add(po.tanggal));

    const sortedDates = Array.from(datesSet).sort();

    return sortedDates.map(tanggal => {
      const soToday = validSos.filter(so => so.tanggal === tanggal);
      const poToday = validPos.filter(po => po.tanggal === tanggal);

      const sales = soToday.reduce((sum, so) => sum + so.grandTotal, 0);
      const purchases = poToday.reduce((sum, po) => sum + po.grandTotal, 0);

      return {
        tanggal,
        'Penjualan (SO)': sales,
        'Pembelian (PO)': purchases
      };
    });
  };

  const getCustomerSalesTimeline = (customerName: string) => {
    if (!customerName) return [];
    const custSos = salesOrders.filter(so =>
      so.pelanggan === customerName &&
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );

    const daily: Record<string, { tanggal: string; revenue: number; profit: number; qty: number }> = {};
    custSos.forEach(so => {
      if (!daily[so.tanggal]) {
        daily[so.tanggal] = { tanggal: so.tanggal, revenue: 0, profit: 0, qty: 0 };
      }
      daily[so.tanggal].revenue += so.grandTotal;

      let pVal = 0;
      so.items.forEach((item: any) => {
        const prod = products.find(p => p.sku === item.sku);
        const hpp = prod ? prod.hpp : 0;
        pVal += item.qty * (item.harga - hpp);
        daily[so.tanggal].qty += item.qty;
      });
      daily[so.tanggal].profit += pVal;
    });

    return Object.values(daily).sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  };

  const getDeadStockList = () => {
    const logs = deriveAllInventoryLogs();
    const limitDate = new Date();
    limitDate.setDate(limitDate.getDate() - 30); // 30 hari terakhir
    return products.filter(p => {
      const hasRecentOut = logs.some(log =>
        log.sku === p.sku &&
        log.tipe === 'OUT' &&
        new Date(log.tanggal) >= limitDate
      );
      return !hasRecentOut;
    });
  };

  const getWastageRate = () => {
    const rangeOpnameMinus = opnameLog
      .filter(log =>
        log.tanggal >= analitikStartDate &&
        log.tanggal <= analitikEndDate &&
        (log.tipe === 'OPNAME_MINUS' || log.selisih < 0)
      )
      .reduce((sum, log) => sum + Math.abs(log.subtotal), 0);

    const rangeSalesHpp = salesOrders
      .filter(so =>
        so.tanggal >= analitikStartDate &&
        so.tanggal <= analitikEndDate &&
        so.statusLogistik !== 'Void'
      )
      .reduce((sum, so) => {
        return sum + so.items.reduce((itemSum: number, item: any) => {
          const p = products.find(prod => prod.sku === item.sku);
          const hpp = p ? p.hpp : 12000;
          return itemSum + (item.qty * hpp);
        }, 0);
      }, 0);

    if (rangeSalesHpp === 0) return 0;
    return (rangeOpnameMinus / rangeSalesHpp) * 100;
  };

  const getSkuSalesTimeline = (sku: string) => {
    if (!sku) return [];
    const inRangeSo = salesOrders.filter(so =>
      so.tanggal >= analitikStartDate &&
      so.tanggal <= analitikEndDate &&
      so.statusLogistik !== 'Void'
    );
    const grouped: Record<string, { tanggal: string; qty: number; revenue: number }> = {};
    inRangeSo.forEach(so => {
      const matchItem = so.items.find((item: any) => item.sku === sku);
      if (matchItem) {
        if (!grouped[so.tanggal]) {
          grouped[so.tanggal] = { tanggal: so.tanggal, qty: 0, revenue: 0 };
        }
        grouped[so.tanggal].qty += matchItem.qty;
        grouped[so.tanggal].revenue += matchItem.qty * matchItem.harga;
      }
    });
    return Object.values(grouped).sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());
  };

  // ==========================================
  // PRODUCT LOGIC
  // ==========================================
  const generateNewSku = (prefix: string, allProducts: any[]) => {
    const matchingProducts = allProducts.filter(p => p.sku && p.sku.startsWith(`${prefix}-`));
    let maxNumber = 0;

    matchingProducts.forEach(p => {
      const parts = p.sku.split('-');
      if (parts.length > 1) {
        const num = parseInt(parts[1], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    return `${prefix}-${String(maxNumber + 1).padStart(4, '0')}`;
  };

  const checkProductHasTransactions = (sku: string) => {
    if (!sku) return false;
    const inPO = purchaseOrders.some(po => po.items.some((i: any) => i.sku === sku));
    const inSO = salesOrders.some(so => so.items.some((i: any) => i.sku === sku));
    const inLog = opnameLog.some(log => log.sku === sku);
    const inConsign = consignments.some(c => c.sku === sku);
    return inPO || inSO || inLog || inConsign;
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    if (isSavingProduct) return;
    e.preventDefault();
    if (!productForm.nama) return triggerToast('Nama produk wajib diisi!', 'error');

    // ponytail: Validasi angka negatif di trust boundary
    if (productForm.stok < 0 || productForm.hpp < 0 || productForm.hj < 0) {
      triggerToast('Error: Stok, HPP, dan Harga Jual tidak boleh negatif!', 'error');
      return;
    }

    setIsSavingProduct(true);
    try {
      // ponytail: Tambahkan kategori, sub-kategori, satuan, & tempat simpan baru ke master setting otomatis jika belum ada
      const cat = productForm.kategori?.trim();
      if (cat && !settingCategories.some(c => c.toLowerCase() === cat.toLowerCase())) {
        setSettingCategories(prev => [...prev, cat]);
      }
      const sub = productForm.subKat?.trim();
      if (sub && !settingSubCategories.some(s => s.toLowerCase() === sub.toLowerCase())) {
        setSettingSubCategories(prev => [...prev, sub]);
      }
      const unit = productForm.satuan?.trim();
      if (unit && !settingUnits.some(u => u.toLowerCase() === unit.toLowerCase())) {
        setSettingUnits(prev => [...prev, unit]);
      }
      const loc = productForm.tempatSimpan?.trim();
      if (loc && !settingStorageLocations.some(l => l.toLowerCase() === loc.toLowerCase())) {
        setSettingStorageLocations(prev => [...prev, loc]);
      }

      if (isEditingProduct) {
        setProducts(products.map(p => p.sku === productForm.sku ? productForm : p));
        await saveProduct(productForm);
        triggerToast(`Produk [${productForm.sku}] berhasil diupdate.`);
      } else {
        const sku = productForm.sku || generateNewSku(productForm.prefix || 'RTL', products);

        // Validasi mutlak: Cek duplikat SKU
        const isDuplicate = products.some(p => p.sku.toLowerCase() === sku.toLowerCase());
        if (isDuplicate) {
          return triggerToast(`Gagal! KODE SKU [${sku}] sudah terdaftar di database. Gunakan kode lain.`, 'error');
        }

        const newProduct = { ...productForm, sku };
        setProducts([...products, newProduct]);
        await saveProduct(newProduct);
        triggerToast(`Produk [${sku}] berhasil didaftarkan.`);
      }
      setShowProductModal(false);
      setIsEditingProduct(false);
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleCreateCompany = (options: { nama: string; alamat: string; telp: string; kota: string; tipeTemplate: string }) => {
    const namaCompany = options.nama.trim() || 'Perusahaan Baru';
    const alamatCompany = options.alamat.trim() || 'Jl. Operasional No. 1';
    const telpCompany = options.telp.trim() || '081234567890';
    const kotaCompany = options.kota.trim() || 'Jakarta';

    setNamaToko(namaCompany);
    setAlamatToko(alamatCompany);
    setTelpToko(telpCompany);
    setKotaToko(kotaCompany);

    if (options.tipeTemplate === 'empty') {
      setProducts([]);
      saveAllProducts([]);
      setCustomers([
        { id: 'CUST-001', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
      ]);
      saveAllCustomers([
        { id: 'CUST-001', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
      ]);
      setSuppliers([]);
      saveAllSuppliers([]);
      setPurchaseOrders([]);
      saveAllPurchaseOrders([]);
      setSalesOrders([]);
      saveAllSalesOrders([]);
      setOpnameLog([]);
      saveAllOpnameLog([]);
      setCashLedger([]);
      saveAllCashLedger([]);
      setConsignments([]);
      setBoms([]);
      setRiwayatProduksi([]);
      setStokPrices({});
      setTipeBisnis('Retail');
    } else if (options.tipeTemplate === 'bakery') {
      setProducts(INITIAL_PRODUCTS);
      saveAllProducts(INITIAL_PRODUCTS);
      setCustomers(INITIAL_CUSTOMERS);
      saveAllCustomers(INITIAL_CUSTOMERS);
      setSuppliers(INITIAL_SUPPLIERS);
      saveAllSuppliers(INITIAL_SUPPLIERS);
      setPurchaseOrders(INITIAL_PURCHASE_ORDERS);
      saveAllPurchaseOrders(INITIAL_PURCHASE_ORDERS);
      setSalesOrders(INITIAL_SALES_ORDERS);
      saveAllSalesOrders(INITIAL_SALES_ORDERS);
      setOpnameLog(INITIAL_OPNAME_LOG);
      saveAllOpnameLog(INITIAL_OPNAME_LOG);
      setCashLedger(INITIAL_CASH_LEDGER);
      saveAllCashLedger(INITIAL_CASH_LEDGER);
      setConsignments(INITIAL_CONSIGNMENT);
      setBoms(INITIAL_BOMS);
      setRiwayatProduksi(INITIAL_RIWAYAT_PRODUKSI);
      setStokPrices({});
      setTipeBisnis('Manufaktur');
    } else if (options.tipeTemplate === 'retail') {
      const RETAIL_PRODUCTS: any[] = [];
      const RETAIL_CUSTOMERS = [
        { id: 'CUST-002', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
      ];
      const RETAIL_SUPPLIERS: any[] = [];
      setProducts(RETAIL_PRODUCTS);
      saveAllProducts(RETAIL_PRODUCTS);
      setCustomers(RETAIL_CUSTOMERS);
      saveAllCustomers(RETAIL_CUSTOMERS);
      setSuppliers(RETAIL_SUPPLIERS);
      saveAllSuppliers(RETAIL_SUPPLIERS);
      setPurchaseOrders([]);
      saveAllPurchaseOrders([]);
      setSalesOrders([]);
      saveAllSalesOrders([]);
      setOpnameLog([]);
      saveAllOpnameLog([]);
      setCashLedger([]);
      saveAllCashLedger([]);
      setConsignments([]);
      setBoms([]);
      setRiwayatProduksi([]);
      setStokPrices({});
      setTipeBisnis('Retail');
    } else if (options.tipeTemplate === 'consignment') {
      const CSG_PRODUCTS: any[] = [];
      const CSG_CONSIGNMENTS: any[] = [];
      setProducts(CSG_PRODUCTS);
      saveAllProducts(CSG_PRODUCTS);
      setCustomers([
        { id: 'CUST-001', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
      ]);
      saveAllCustomers([
        { id: 'CUST-001', nama: 'Pelanggan Umum Retail', kontak: 'Walk-in', email: 'walkin@inoerp.com', telp: '-', alamat: 'Toko Langsung', piutang: 0 }
      ]);
      setSuppliers([]);
      saveAllSuppliers([]);
      setPurchaseOrders([]);
      saveAllPurchaseOrders([]);
      setSalesOrders([]);
      saveAllSalesOrders([]);
      setOpnameLog([]);
      saveAllOpnameLog([]);
      setCashLedger([]);
      saveAllCashLedger([]);
      setConsignments(CSG_CONSIGNMENTS);
      setBoms([]);
      setRiwayatProduksi([]);
      setStokPrices({});
      setTipeBisnis('Konsinyasi');
    }

    triggerToast(`Perusahaan "${namaCompany}" berhasil dibuat dengan template ${options.tipeTemplate}!`, 'success');
    setShowCreateCompanyModal(false);
  };

  const handleDeleteProduct = (sku: string) => {
    const product = products.find(p => p.sku === sku);
    if (!product) return;
    if (product.stok > 0) {
      return triggerToast(`Hapus ditolak! Produk masih memiliki sisa stok sebanyak ${product.stok} ${product.satuan}.`, 'error');
    }
    if (window.confirm(`Hapus produk [${sku}] - ${product.nama} secara permanen?`)) {
      setProducts(products.filter(p => p.sku !== sku));
      deleteProduct(sku);
      triggerToast(`Produk [${sku}] terhapus.`);
    }
  };

  // ==========================================
  // CUSTOMER / SUPPLIER LOGIC
  // ==========================================
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.nama) return triggerToast('Nama wajib diisi!', 'error');
    if (isEditingCustomer) {
      setCustomers(customers.map(c => c.id === customerForm.id ? customerForm : c));
      await updateCustomer(customerForm);
      triggerToast('Customer terupdate.');
    } else {
      const result = await createCustomer(customerForm);
      const newCust = { ...customerForm, id: result.id };
      setCustomers([...customers, newCust]);
      triggerToast('Customer terdaftar.');
    }
    setShowCustomerModal(false);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.nama) return triggerToast('Nama wajib diisi!', 'error');
    if (isEditingSupplier) {
      setSuppliers(suppliers.map(s => s.id === supplierForm.id ? supplierForm : s));
      await updateSupplier(supplierForm);
      triggerToast('Supplier terupdate.');
    } else {
      const result = await createSupplier(supplierForm);
      const newSup = { ...supplierForm, id: result.id };
      setSuppliers([...suppliers, newSup]);
      triggerToast('Supplier terdaftar.');
    }
    setShowSupplierModal(false);
  };
  // ==========================================
  // LEDGER SPREADSHEET & TRANSACTION DETAILS HELPERS
  // ==========================================

  // ponytail: Helper untuk merender elemen DOM ke PDF menggunakan html-to-image + jsPDF
  const exportElementToPDF = async (elementId: string, filename: string): Promise<void> => {
    let styleEl: HTMLStyleElement | null = null;
    const element = document.getElementById(elementId);
    try {
      setIsExportingPDF(true);

      // Memberikan sedikit waktu bagi UI untuk render (jika perlu)
      await new Promise(resolve => setTimeout(resolve, 100));

      if (!element) {
        triggerToast(`Gagal: Elemen dengan ID '${elementId}' tidak ditemukan.`, 'error');
        return;
      }

      // OPSI A: Inject class dan rule CSS khusus untuk memaksa render hitam-putih
      element.classList.add('force-print-pdf');
      styleEl = document.createElement('style');
      styleEl.innerHTML = `
        .force-print-pdf, .force-print-pdf * {
          color: black !important;
          border-color: #000 !important;
        }
        .force-print-pdf .bg-slate-50, .force-print-pdf .bg-slate-100, .force-print-pdf .bg-slate-200 {
          background-color: white !important;
        }
        .force-print-pdf .bg-slate-50\\/50, .force-print-pdf .bg-slate-100\\/50 {
          background-color: white !important;
        }
        .force-print-pdf th {
          background-color: white !important;
          color: black !important;
        }
        .force-print-pdf [data-report-box] {
          background-color: #f5f5f5 !important;
          border-color: black !important;
          color: black !important;
        }
      `;
      document.head.appendChild(styleEl);

      // Render DOM ke canvas image data dengan html-to-image (mendukung oklab, gap, dll)
      const imgData = await htmlToImage.toPng(element, {
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: {
          margin: '0',
          padding: '0'
        }
      });

      // Untuk mendapatkan resolusi asli (width/height), kita buat objek Image sementara
      const img = new Image();
      img.src = imgData;
      await new Promise((resolve) => {
        img.onload = resolve;
      });

      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      // Kalkulasi rasio dan paginasi (BUG 1 FIXED)
      const pdfWidth = 210; // A4 width in mm
      const pdfHeight = 297; // A4 height in mm
      const marginX = 10;
      const marginY = 10;

      const imgWidth = pdfWidth - (marginX * 2);

      const canvasWidth = img.width;
      const canvasHeight = img.height;

      // Menghitung rasio gambar agar pas dengan lebar halaman A4
      const ratio = imgWidth / canvasWidth;
      const imgHeight = canvasHeight * ratio;

      const pageContentHeight = pdfHeight - (marginY * 2);
      let heightLeft = imgHeight;
      let position = marginY;

      // Menambahkan halaman pertama
      doc.addImage(imgData, 'PNG', marginX, position, imgWidth, imgHeight);
      heightLeft -= pageContentHeight;

      // Logika pemisahan halaman manual untuk gambar panjang
      while (heightLeft > 0) {
        position -= pageContentHeight; // geser posisi Y ke atas sebesar konten 1 halaman
        doc.addPage();
        doc.addImage(imgData, 'PNG', marginX, position, imgWidth, imgHeight);
        heightLeft -= pageContentHeight;
      }

      doc.save(filename);
      triggerToast('Laporan berhasil diekspor ke PDF!', 'success');
    } catch (err: any) {
      console.error("PDF Export Error:", err);
      triggerToast(`Error PDF: ${err.message || err.toString()}`, 'error');
    } finally {
      setIsExportingPDF(false);
      if (element) element.classList.remove('force-print-pdf');
      if (styleEl && document.head.contains(styleEl)) {
        document.head.removeChild(styleEl);
      }
    }
  };

  // ponytail: Helper untuk export ke PDF menggunakan jsPDF + jspdf-autotable
  const generateReportPDF = (
    title: string,
    subtitle: string,
    periode: string,
    headers: string[],
    rows: (string | number)[][],
    summaryRows: (string | number)[][] | undefined,
    filename: string,
    orientation: 'portrait' | 'landscape' = 'portrait'
  ) => {
    const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' });

    // Add header (Company Name & Address)
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(namaToko || 'INO ERP', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(alamatToko || 'Alamat Belum Diatur', 14, 26);

    // Add Report Title
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title.toUpperCase(), 14, 38);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, 14, 44);
    doc.text(`Periode: ${periode}`, 14, 50);

    // Add Table using autotable
    autoTable(doc, {
      startY: 55,
      head: [headers],
      body: rows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [14, 165, 164], textColor: 255, fontStyle: 'bold' }, // Tailwind's primary color approximation (#0ea5a4)
      didDrawPage: (data) => {
        // Footer (Page number and print date)
        const str = `Halaman ${doc.getCurrentPageInfo().pageNumber} | Tanggal Cetak: ${new Date().toLocaleDateString('id-ID')}`;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.height - 10);
      }
    });

    // Add Summary Rows if any (like Laba Bersih, dll.)
    if (summaryRows && summaryRows.length > 0) {
      const finalY = (doc as any).lastAutoTable.finalY || 55;
      autoTable(doc, {
        startY: finalY,
        body: summaryRows,
        theme: 'plain',
        styles: { fontSize: 9, fontStyle: 'bold', cellPadding: 3 },
        columnStyles: {
          0: { halign: 'left' },
          1: { halign: 'right' }
        },
        willDrawCell: (data) => {
          // Identify row text for dynamic coloring matching the UI
          const rowData = data.row.raw as (string | number)[];
          const label = String(rowData[0] || '').toLowerCase();
          const valStr = String(rowData[1] || '');
          if (label.includes('laba') || label.includes('pendapatan')) {
            if (!valStr.includes('-')) {
              data.cell.styles.textColor = [34, 197, 94]; // success green
            } else {
              data.cell.styles.textColor = [239, 68, 68]; // danger red
            }
          } else if (label.includes('rugi') || label.includes('beban') || label.includes('pengeluaran') || valStr.includes('-')) {
            data.cell.styles.textColor = [239, 68, 68]; // danger red
          }
        }
      });
    }

    doc.save(filename);
  };

  const deriveProductLedgerRows = (sku: string) => {
    const entries: any[] = [];
    const p = products.find(prod => prod.sku === sku);
    if (!p) return [];

    // 1. PO Receipts
    purchaseOrders.forEach(po => {
      if (po.statusLogistik === 'Diterima' || po.statusLogistik === 'Diterima Sebagian') {
        const matchItem = po.items.find((item: any) => item.sku === sku);
        if (matchItem) {
          const qtyRec = matchItem.qtyReceived ?? (po.statusLogistik === 'Diterima' ? matchItem.qty : 0);
          if (qtyRec > 0) {
            entries.push({
              tanggal: po.tanggal,
              keterangan: `Penerimaan PO [${po.id}]`,
              masuk: qtyRec,
              keluar: 0,
              harga: matchItem.harga,
              subtotal: qtyRec * matchItem.harga,
              status: po.statusLogistik
            });
          }
        }
      }
      // PO Returns
      if (po.returItems) {
        po.returItems.forEach((ret: any) => {
          if (ret.sku === sku) {
            entries.push({
              tanggal: ret.tanggal,
              keterangan: `Retur Supplier [${po.id}]`,
              masuk: 0,
              keluar: ret.qty,
              harga: p.hpp,
              subtotal: ret.qty * p.hpp,
              status: 'Retur PO'
            });
          }
        });
      }
    });

    // 2. SO Shipments
    salesOrders.forEach(so => {
      if (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai') {
        const matchItem = so.items.find((item: any) => item.sku === sku);
        if (matchItem) {
          const qtyShip = matchItem.qtyShipped ?? (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai' ? matchItem.qty : 0);
          if (qtyShip > 0) {
            entries.push({
              tanggal: so.tanggal,
              keterangan: `Pengiriman SO [${so.id}]`,
              masuk: 0,
              keluar: qtyShip,
              harga: matchItem.harga,
              subtotal: qtyShip * matchItem.harga,
              status: so.statusLogistik
            });
          }
        }
      }
      // SO Returns
      if (so.returItems) {
        so.returItems.forEach((ret: any) => {
          if (ret.sku === sku) {
            entries.push({
              tanggal: ret.tanggal,
              keterangan: `Retur Pelanggan [${so.id}]`,
              masuk: ret.qty,
              keluar: 0,
              harga: p.hj || p.hpp,
              subtotal: ret.qty * (p.hj || p.hpp),
              status: 'Retur SO'
            });
          }
        });
      }
    });

    // 3. Opname Logs
    opnameLog.forEach(log => {
      if (log.sku === sku) {
        entries.push({
          tanggal: log.tanggal,
          keterangan: `Opname: ${log.catatan}`,
          masuk: log.selisih > 0 ? log.selisih : 0,
          keluar: log.selisih < 0 ? Math.abs(log.selisih) : 0,
          harga: log.HPP,
          subtotal: Math.abs(log.subtotal),
          status: 'Opname'
        });
      }
    });

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

    // Build grid rows
    const gridRows: string[][] = [];
    let runningBalance = 0;

    entries.forEach(entry => {
      runningBalance += (entry.masuk - entry.keluar);
      gridRows.push([
        entry.tanggal,
        entry.keterangan,
        entry.masuk > 0 ? entry.masuk.toString() : '-',
        entry.keluar > 0 ? entry.keluar.toString() : '-',
        runningBalance.toString(),
        `Rp ${entry.harga.toLocaleString('id-ID')}`,
        `Rp ${entry.subtotal.toLocaleString('id-ID')}`,
        entry.status
      ]);
    });

    return gridRows;
  };

  const deriveCustomerLedgerRows = (custId: string) => {
    const entries: any[] = [];
    const cust = customers.find(c => c.id === custId);
    if (!cust) return [];

    // Match SOs
    salesOrders.forEach(so => {
      if (so.pelanggan === cust.nama) {
        // 1. SO Creation (Invoice / Piutang Masuk)
        if (so.statusLogistik !== 'Void' && so.statusLogistik !== 'Draft') {
          entries.push({
            tanggal: so.tanggal,
            ref: so.id,
            debit: so.grandTotal, // customer is invoiced (receivables increases)
            kredit: 0,
            status: so.statusBayar,
            keterangan: `Sales Order Baru [${so.id}]`
          });
        }

        // 2. Payments (Cash Received)
        if (so.totalPaid && so.totalPaid > 0) {
          entries.push({
            tanggal: so.tanggal,
            ref: so.id,
            debit: 0,
            kredit: so.totalPaid, // customer paid (receivables decreases)
            status: so.statusBayar,
            keterangan: `Setoran Pelunasan [${so.id}]`
          });
        }
      }
    });

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

    const gridRows: string[][] = [];
    let runningReceivables = 0;

    entries.forEach(entry => {
      runningReceivables += (entry.debit - entry.kredit);
      gridRows.push([
        entry.tanggal,
        entry.ref,
        entry.debit > 0 ? `Rp ${entry.debit.toLocaleString('id-ID')}` : '-',
        entry.kredit > 0 ? `Rp ${entry.kredit.toLocaleString('id-ID')}` : '-',
        `Rp ${runningReceivables.toLocaleString('id-ID')}`,
        entry.status,
        entry.debit > 0 ? 'Tempo/Piutang' : 'Penerimaan Kas',
        entry.keterangan
      ]);
    });

    return gridRows;
  };

  const deriveSupplierLedgerRows = (supId: string) => {
    const entries: any[] = [];
    const sup = suppliers.find(s => s.id === supId);
    if (!sup) return [];

    // Match POs
    purchaseOrders.forEach(po => {
      if (po.supplier === sup.nama) {
        // 1. PO Creation (Bill / Hutang Masuk)
        if (po.statusLogistik !== 'Void' && po.statusLogistik !== 'Draft') {
          entries.push({
            tanggal: po.tanggal,
            ref: po.id,
            debit: 0,
            kredit: po.grandTotal, // supplier bills us (payables increases)
            status: po.statusBayar,
            keterangan: `Purchase Order Baru [${po.id}]`
          });
        }

        // 2. Payments (Cash Paid)
        if (po.totalPaid && po.totalPaid > 0) {
          entries.push({
            tanggal: po.tanggal,
            ref: po.id,
            debit: po.totalPaid, // we pay supplier (payables decreases)
            kredit: 0,
            status: po.statusBayar,
            keterangan: `Pembayaran Kasir [${po.id}]`
          });
        }
      }
    });

    // Sort by date ascending
    entries.sort((a, b) => new Date(a.tanggal).getTime() - new Date(b.tanggal).getTime());

    const gridRows: string[][] = [];
    let runningPayables = 0;

    entries.forEach(entry => {
      runningPayables += (entry.kredit - entry.debit); // payables increase on credit, decrease on debit
      gridRows.push([
        entry.tanggal,
        entry.ref,
        entry.debit > 0 ? `Rp ${entry.debit.toLocaleString('id-ID')}` : '-',
        entry.kredit > 0 ? `Rp ${entry.kredit.toLocaleString('id-ID')}` : '-',
        `Rp ${runningPayables.toLocaleString('id-ID')}`,
        entry.status,
        entry.debit > 0 ? 'Pengeluaran Kas' : 'Hutang Dagang',
        entry.keterangan
      ]);
    });

    return gridRows;
  };

  const deriveAllInventoryLogs = () => {
    const logs: any[] = [];

    products.forEach(p => {
      // PO Receipts
      purchaseOrders.forEach(po => {
        if (po.statusLogistik === 'Diterima' || po.statusLogistik === 'Diterima Sebagian') {
          const matchItem = po.items.find((item: any) => item.sku === p.sku);
          if (matchItem) {
            const qtyRec = matchItem.qtyReceived ?? (po.statusLogistik === 'Diterima' ? matchItem.qty : 0);
            if (qtyRec > 0) {
              logs.push({
                tanggal: po.tanggal,
                sku: p.sku,
                nama: p.nama,
                keterangan: `Penerimaan PO [${po.id}]`,
                tipe: 'IN',
                qty: qtyRec,
                harga: matchItem.harga,
                subtotal: qtyRec * matchItem.harga,
                operator: 'Gudang'
              });
            }
          }
        }
        if (po.returItems) {
          po.returItems.forEach((ret: any) => {
            if (ret.sku === p.sku) {
              logs.push({
                tanggal: ret.tanggal,
                sku: p.sku,
                nama: p.nama,
                keterangan: `Retur Supplier [${po.id}]`,
                tipe: 'OUT',
                qty: ret.qty,
                harga: p.hpp,
                subtotal: ret.qty * p.hpp,
                operator: 'Gudang'
              });
            }
          });
        }
      });

      // SO Shipments
      salesOrders.forEach(so => {
        if (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai') {
          const matchItem = so.items.find((item: any) => item.sku === p.sku);
          if (matchItem) {
            const qtyShip = matchItem.qtyShipped ?? (so.statusLogistik === 'Terkirim' || so.statusLogistik === 'Selesai' ? matchItem.qty : 0);
            if (qtyShip > 0) {
              logs.push({
                tanggal: so.tanggal,
                sku: p.sku,
                nama: p.nama,
                keterangan: `Pengiriman SO [${so.id}]`,
                tipe: 'OUT',
                qty: qtyShip,
                harga: matchItem.harga,
                subtotal: qtyShip * matchItem.harga,
                operator: 'Ekspedisi'
              });
            }
          }
        }
        if (so.returItems) {
          so.returItems.forEach((ret: any) => {
            if (ret.sku === p.sku) {
              logs.push({
                tanggal: ret.tanggal,
                sku: p.sku,
                nama: p.nama,
                keterangan: `Retur Pelanggan [${so.id}]`,
                tipe: 'IN',
                qty: ret.qty,
                harga: p.hj || p.hpp,
                subtotal: ret.qty * (p.hj || p.hpp),
                operator: 'CS'
              });
            }
          });
        }
      });

      // Opname Logs
      opnameLog.forEach(log => {
        if (log.sku === p.sku) {
          logs.push({
            tanggal: log.tanggal,
            sku: p.sku,
            nama: p.nama,
            keterangan: `Opname: ${log.catatan}`,
            tipe: log.selisih > 0 ? 'IN' : 'OUT',
            qty: Math.abs(log.selisih),
            harga: log.HPP,
            subtotal: Math.abs(log.subtotal),
            operator: log.operator || 'Sistem'
          });
        }
      });
    });

    return logs.sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  };

  const getOrInitProductLedger = (sku: string, forceReset = false) => {
    if (productLedgerCells[sku] && !forceReset) {
      return productLedgerCells[sku];
    }
    // ponytail: lock struktur & urutan kolom laporan mutasi persediaan agar tidak ter-reset
    const headers = ['Tanggal', 'Deskripsi / No. Ref', 'Masuk (+)', 'Keluar (-)', 'Saldo Akhir / Sisa Qty', 'Harga Unit', 'Total Nilai', 'Status / Catatan'];
    const derived = deriveProductLedgerRows(sku);
    const rows: string[][] = [headers];
    derived.forEach(r => rows.push(r));
    while (rows.length < 25) {
      rows.push(['', '', '', '', '', '', '', '']);
    }
    productLedgerCells[sku] = rows;
    return rows;
  };

  const getOrInitCustomerLedger = (custId: string, forceReset = false) => {
    if (customerLedgerCells[custId] && !forceReset) {
      return customerLedgerCells[custId];
    }
    const headers = ['Tanggal', 'No. Invoice / Transaksi', 'Nilai Penjualan (Debit)', 'Jumlah Pembayaran (Kredit)', 'Saldo Piutang', 'Status Pelunasan', 'Metode & Ref', 'Catatan'];
    const derived = deriveCustomerLedgerRows(custId);
    const rows: string[][] = [headers];
    derived.forEach(r => rows.push(r));
    while (rows.length < 25) {
      rows.push(['', '', '', '', '', '', '', '']);
    }
    customerLedgerCells[custId] = rows;
    return rows;
  };

  const getOrInitSupplierLedger = (supId: string, forceReset = false) => {
    if (supplierLedgerCells[supId] && !forceReset) {
      return supplierLedgerCells[supId];
    }
    const headers = ['Tanggal', 'No. Tagihan / Transaksi', 'Nilai Pembelian (Kredit)', 'Jumlah Pembayaran (Debit)', 'Saldo Hutang', 'Status Pelunasan', 'Metode & Ref', 'Catatan'];
    const derived = deriveSupplierLedgerRows(supId);
    const rows: string[][] = [headers];
    derived.forEach(r => rows.push(r));
    while (rows.length < 25) {
      rows.push(['', '', '', '', '', '', '', '']);
    }
    supplierLedgerCells[supId] = rows;
    return rows;
  };

  const handleProductCellChange = (sku: string, r: number, c: number, value: string) => {
    const currentGrid = [...getOrInitProductLedger(sku)];
    currentGrid[r] = [...currentGrid[r]];
    currentGrid[r][c] = value;
    setProductLedgerCells(prev => ({
      ...prev,
      [sku]: currentGrid
    }));
  };

  const handleCustomerCellChange = (custId: string, r: number, c: number, value: string) => {
    const currentGrid = [...getOrInitCustomerLedger(custId)];
    currentGrid[r] = [...currentGrid[r]];
    currentGrid[r][c] = value;
    setCustomerLedgerCells(prev => ({
      ...prev,
      [custId]: currentGrid
    }));
  };

  const handleSupplierCellChange = (supId: string, r: number, c: number, value: string) => {
    const currentGrid = [...getOrInitSupplierLedger(supId)];
    currentGrid[r] = [...currentGrid[r]];
    currentGrid[r][c] = value;
    setSupplierLedgerCells(prev => ({
      ...prev,
      [supId]: currentGrid
    }));
  };

  // ==========================================
  // PURCHASE ORDER (PO) LOGIC
  // ==========================================
  const handleAddPoItem = () => {
    setPoForm({
      ...poForm,
      items: [...poForm.items, { sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }]
    });
  };

  const handleRemovePoItem = (index: number) => {
    if (poForm.items.length === 1) return;
    setPoForm({
      ...poForm,
      items: poForm.items.filter((_, i) => i !== index)
    });
  };

  const handlePoItemChange = (index: number, sku: string, qty: number, harga: number) => {
    const updatedItems = [...poForm.items];
    const targetProduct = products.find(p => p.sku === sku);

    updatedItems[index] = {
      sku,
      nama: targetProduct ? targetProduct.nama : '',
      qty,
      satuan: targetProduct ? targetProduct.satuan : 'Pcs',
      harga: harga || (targetProduct ? targetProduct.hpp : 0),
      subtotal: qty * (harga || (targetProduct ? targetProduct.hpp : 0))
    };

    setPoForm({ ...poForm, items: updatedItems });
  };

  const handleSavePO = (isDraft: boolean) => {
    if (isSavingPO) return;
    if (!poForm.supplier) return triggerToast('Pilih Supplier!', 'error');
    if (poForm.items.length === 0 || poForm.items.every((i: any) => i.qty <= 0)) return triggerToast('Barang tidak boleh kosong!', 'error');

    if (!isDraft) {
      setPendingDraftState(isDraft);
      setShowPoConfirmModal(true);
      return;
    }
    processSavePO(isDraft);
  };

  const processSavePO = async (isDraft: boolean) => {
    if (isSavingPO) return;
    // ponytail: Validasi angka negatif di trust boundary
    if (poForm.items.some(i => i.qty < 0 || i.harga < 0)) {
      triggerToast('Error: QTY dan Harga pada item tidak boleh negatif!', 'error');
      return;
    }
    setIsSavingPO(true);
    try {


      // Auto-create new supplier if it does not exist
      const rawSupplier = poForm.supplier.trim();
      let currentSuppliers = [...suppliers];
      const existingSupplier = currentSuppliers.find(s => s.nama.toLowerCase() === rawSupplier.toLowerCase());
      if (!existingSupplier) {
        const result = await createSupplier({
          nama: rawSupplier,
          kontak: 'Auto-Created',
          email: 'auto@inoerp.com',
          telp: '-',
          alamat: 'Auto-Created via PO',
          hutang: 0
        });
        const newSup = { ...result, nama: rawSupplier }; // createSupplier returns { id }
        setSuppliers([...suppliers, newSup]);
        currentSuppliers.push(newSup);
        triggerToast(`Supplier baru [${rawSupplier}] otomatis ditambahkan ke database!`, 'success');
      }

      const validItems = poForm.items.filter(item => item.sku && item.qty > 0);
      if (validItems.length === 0) return triggerToast('Tambahkan minimal 1 item!', 'error');

      const subtotal = validItems.reduce((sum, item) => sum + item.subtotal, 0);
      const tax = poForm.pajak ? Math.round(subtotal * 0.12) : 0;
      const grandTotal = subtotal + tax;

      // const finalId = isEditingPo ? poForm.id : `PO-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      // ID will be generated server-side for new POs

      const newPO = {
        id: isEditingPo ? poForm.id : null, // will be set by server for new POs
        tanggal: poForm.tanggal,
        supplier: poForm.supplier,
        metode: poForm.metode,
        items: validItems,
        subtotal,
        pajak: tax,
        grandTotal,
        statusLogistik: isDraft ? 'Draft' : 'DIPESAN', // ponytail: PO is just an order, not received yet
        statusBayar: poForm.metode === 'Tunai' ? 'Lunas' : 'Belum Dibayar',
        catatan: poForm.catatan
      };

      // If Save and Release -> Update Stocks & Supplier Payables
      if (!isDraft && poForm.metode !== 'Tunai') {
        const nextSups = suppliers.map(s => s.nama === poForm.supplier ? { ...s, hutang: s.hutang + grandTotal } : s);
        setSuppliers(nextSups);
        await saveAllSuppliers(nextSups);
      }

      // ponytail: Jika metode Tunai & bukan draft, catat pengeluaran kas langsung
      let cashEntryId = null;
      if (!isDraft && poForm.metode === 'Tunai') {
        const targetAkun = 'Kas Tunai';
        const accountTx = cashLedger.filter(c => (c.akun || 'Bank') === targetAkun);
        const lastBal = accountTx.length > 0 ? accountTx[accountTx.length - 1].saldo : 0;
        const cashEntry = {
          tanggal: poForm.tanggal,
          ref: null, // will be set after PO is created
          keterangan: `Pembelian Tunai ke Supplier ${poForm.supplier}`,
          kategori: 'Pembelian',
          debit: 0,
          kredit: grandTotal,
          saldo: lastBal - grandTotal,
          akun: targetAkun
        };
        const result = await createCashEntry(cashEntry);
        cashEntryId = result.id;
        setCashLedger([...cashLedger, { ...cashEntry, id: cashEntryId }]);
      }



      let savedPO;
      if (isEditingPo) {
        await updatePurchaseOrder(newPO);
        savedPO = newPO;
        setPurchaseOrders(purchaseOrders.map(p => p.id === poForm.id ? newPO : p));
      } else {
        const result = await createPurchaseOrder(newPO);
        savedPO = { ...newPO, id: result.id };
        setPurchaseOrders([savedPO, ...purchaseOrders]);

        // Update cash entry ref with the new PO ID
        if (cashEntryId) {
          const updatedCashLedger = cashLedger.map(c =>
            c.id === cashEntryId ? { ...c, ref: result.id, keterangan: `Pembelian Tunai ke Supplier ${poForm.supplier} [${result.id}]` } : c
          );
          setCashLedger(updatedCashLedger);
          await updateCashEntry(updatedCashLedger.find(c => c.id === cashEntryId)!);
        }
      }

      triggerToast(isDraft ? 'Draft PO berhasil disimpan.' : 'PO resmi berhasil dirilis!');
      setShowPoForm(false);
      setIsEditingPo(false);
    } finally {
      setIsSavingPO(false);
    }
  };

  const handleVoidPO = async (id: string) => {
    if (isVoidingPO) return;
    if (window.confirm(`Yakin ingin membatalkan (Void) PO [${id}]?`)) {
      setIsVoidingPO(true);
      try {
        // Use server-side voidDocument function for atomic void with audit trail
        const result = await voidDocument('PO', id, window.prompt('Alasan void (opsional):') || 'Tidak ada alasan');
        if (result.success) {
          triggerToast(`PO [${id}] berhasil dibatalkan. (VoidLog: ${result.voidLogId})`);
          // Refresh all related data
          const [refreshedProducts, refreshedSuppliers, refreshedPOs] = await Promise.all([
            getProducts(),
            getSuppliers(),
            getPurchaseOrders()
          ]);
          setProducts(refreshedProducts);
          setSuppliers(refreshedSuppliers);
          setPurchaseOrders(refreshedPOs);
        }
      } catch (err: any) {
        triggerToast('Gagal void PO: ' + err.message, 'error');
        // Rollback: refresh from server
        const [refreshedProducts, refreshedSuppliers] = await Promise.all([
          getProducts(),
          getSuppliers()
        ]);
        setProducts(refreshedProducts);
        setSuppliers(refreshedSuppliers);
      } finally {
        setIsVoidingPO(false);
      }
    }
  };

  // ==========================================
  // SALES ORDER LOGIC
  // ==========================================
  const handleAddSoItem = () => {
    setSoForm({ ...soForm, items: [...soForm.items, { sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }] });
  };

  const handleRemoveSoItem = (index: number) => {
    if (soForm.items.length === 1) return;
    setSoForm({ ...soForm, items: soForm.items.filter((_, i) => i !== index) });
  };

  const handleSoItemChange = (index: number, field: string, value: any) => {
    const updatedItems = [...soForm.items];
    const item = { ...updatedItems[index] };

    if (field === 'sku') {
      const prod = products.find(p => p.sku === value);
      item.sku = value;
      item.harga = prod ? prod.hj : 0;
      item.subtotal = item.qty * item.harga;
    } else if (field === 'qty') {
      item.qty = parseInt(value) || 0;
      item.subtotal = item.qty * item.harga;
    } else if (field === 'harga') {
      item.harga = parseFloat(value) || 0;
      item.subtotal = item.qty * item.harga;
    }

    updatedItems[index] = item;
    setSoForm({ ...soForm, items: updatedItems });
  };

  const handleSaveSalesOrder = (isDraftMode: boolean) => {
    if (isSavingSO) return;
    if (!soForm.pelanggan) return triggerToast('Pilih pelanggan terlebih dahulu!', 'error');
    if (soForm.items.length === 0 || soForm.items.every((i: any) => i.qty <= 0)) return triggerToast('Barang tidak boleh kosong!', 'error');

    if (!isDraftMode) {
      setPendingDraftState(isDraftMode);
      setShowSoConfirmModal(true);
      return;
    }
    processSaveSO(isDraftMode);
  };

  const processSaveSO = async (isDraftMode: boolean) => {
    if (isSavingSO) return;
    // ponytail: Validasi angka negatif di trust boundary
    if (soForm.items.some(i => i.qty < 0 || i.harga < 0)) {
      triggerToast('Error: QTY dan Harga pada item tidak boleh negatif!', 'error');
      return;
    }

    // Auto-create new customer if it does not exist
    const rawCustomer = soForm.pelanggan.trim();
    let currentCustomers = [...customers];
    const existingCustomer = currentCustomers.find(c => c.nama.toLowerCase() === rawCustomer.toLowerCase());
    if (!existingCustomer) {
      const result = await createCustomer({
        nama: rawCustomer,
        kontak: 'Auto-Created',
        email: 'auto@inoerp.com',
        telp: '-',
        alamat: 'Auto-Created via SO',
        piutang: 0
      });
      const newCust = { ...result, nama: rawCustomer };
      setCustomers([...customers, newCust]);
      currentCustomers.push(newCust);
      triggerToast(`Pelanggan baru [${rawCustomer}] otomatis ditambahkan ke database!`, 'success');
    }

    const validItems = soForm.items.filter(item => item.sku && item.qty > 0);
    if (validItems.length === 0) return triggerToast('Isi minimal 1 baris barang belanja!', 'error');

    // ponytail: Mitigasi client-side race condition (stale state). Solusi atomik definitif membutuhkan backend dengan database lock.
    let freshProducts = products;
    if (!isDraftMode) {
      freshProducts = await getProducts();
    }

    // Check stocks before processing SO
    let stockError = false;
    if (!isDraftMode) {
      validItems.forEach(item => {
        const prod = freshProducts.find((p: any) => p.sku === item.sku);
        if (!prod || prod.stok < item.qty) {
          triggerToast(`Error: Stok berubah atau habis! Silakan periksa kembali (Sisa stok ${prod ? prod.nama : item.sku}: ${prod ? prod.stok : 0})`, 'error');
          stockError = true;
        }
      });
    }
    if (stockError) return;

    const subtotal = validItems.reduce((sum, item) => sum + item.subtotal, 0);
    const tax = soForm.pajak ? Math.round(subtotal * 0.12) : 0;
    const grandTotal = subtotal + tax;

    // const nextId = isEditingSo ? soForm.id : `SO-${getTodayYMD()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
    // ID will be generated server-side for new SOs
    let nextId = isEditingSo ? soForm.id : null;
    const newSO = {
        id: nextId,
        tanggal: soForm.tanggal,
        pelanggan: soForm.pelanggan,
        metode: soForm.metode,
        items: validItems,
        subtotal,
        pajak: tax,
        grandTotal,
        statusLogistik: isDraftMode ? 'Draft' : 'Selesai',
        statusBayar: soForm.metode === 'Tunai' ? 'Lunas' : 'Belum Lunas',
        kasir: 'Administrator',
        catatan: soForm.catatan || 'Sales Order'
      };

      setIsSavingSO(true);
      const opId = generateOpId();
      try {
        // Deduct Stock per SKU using delta ops
        if (!isDraftMode) {
          for (const item of validItems) {
            await adjustStock(item.sku, -item.qty, opId);
          }
          const refreshedProducts = await getProducts();
          setProducts(refreshedProducts);
        }

        let savedSO;
        if (isEditingSo) {
          await updateSalesOrder(newSO);
          savedSO = newSO;
          setSalesOrders(salesOrders.map(so => so.id === soForm.id ? newSO : so));
          triggerToast(`Sales Order [${soForm.id}] berhasil diupdate.`);
        } else {
          const result = await createSalesOrder(newSO);
          savedSO = { ...newSO, id: result.id };
          nextId = result.id;
          setSalesOrders([savedSO, ...salesOrders]);
          triggerToast(`Sales Order [${result.id}] berhasil dibuat & rilis!`);
        }

        // Update customer piutang (for non-cash)
        if (soForm.metode !== 'Tunai' && !isDraftMode) {
          const customer = customers.find(c => c.nama === soForm.pelanggan);
          if (customer) {
            await adjustBalance('customer', customer.id, grandTotal, opId);
            const refreshedCustomers = await getCustomers();
            setCustomers(refreshedCustomers);
          }
        }

        // Cash ledger entry for cash sales
        if (soForm.metode === 'Tunai' && !isDraftMode) {
          await appendCashEntry({
            tanggal: soForm.tanggal,
            ref: nextId,
            keterangan: `Penjualan Tunai dari ${soForm.pelanggan} [${nextId}]`,
            kategori: 'Penjualan',
            debit: grandTotal,
            kredit: 0,
            akun: 'Kas Tunai',
            metode: 'Tunai'
          }, opId);
          const refreshedCashLedger = await getCashLedger();
          setCashLedger(refreshedCashLedger);
        }

        setShowSoForm(false);
        setIsEditingSo(false);
      } catch (err: any) {
        triggerToast('Gagal menyimpan Sales Order: ' + err.message, 'error');
        // Rollback: refresh from server
        const [refreshedProducts, refreshedCustomers, refreshedCashLedger] = await Promise.all([
          getProducts(),
          getCustomers(),
          getCashLedger()
        ]);
        setProducts(refreshedProducts);
        setCustomers(refreshedCustomers);
        setCashLedger(refreshedCashLedger);
      } finally {
        setIsSavingSO(false);
      }
  };

  const handleVoidSO = async (id: string) => {
    if (isVoidingSO) return;
    const so = salesOrders.find(s => s.id === id);
    if (!so) return;

    if (window.confirm(`Void Sales Order ${id}? Tindakan ini akan mengembalikan stok barang ke gudang.`)) {
      setIsVoidingSO(true);
      try {
        // Use server-side voidDocument function for atomic void with audit trail
        const result = await voidDocument('SO', id, window.prompt('Alasan void (opsional):') || 'Tidak ada alasan');
        if (result.success) {
          triggerToast(`Struk ${id} berhasil di-Void! Stok dikembalikan. (VoidLog: ${result.voidLogId})`);
          // Refresh all related data
          const [refreshedProducts, refreshedCustomers, refreshedSOs] = await Promise.all([
            getProducts(),
            getCustomers(),
            getSalesOrders()
          ]);
          setProducts(refreshedProducts);
          setCustomers(refreshedCustomers);
          setSalesOrders(refreshedSOs);
        }
      } catch (err: any) {
        triggerToast('Gagal void Sales Order: ' + err.message, 'error');
        // Rollback: refresh from server
        const [refreshedProducts, refreshedCustomers] = await Promise.all([
          getProducts(),
          getCustomers()
        ]);
        setProducts(refreshedProducts);
        setCustomers(refreshedCustomers);
      } finally {
        setIsVoidingSO(false);
      }
    }
  };

  // ==========================================
  // RETUR LOGIC (D6)
  // ==========================================

  const handleReturPO = async (id: string) => {
    if (isVoidingPO) return;
    const po = purchaseOrders.find(p => p.id === id);
    if (!po) return triggerToast('PO tidak ditemukan', 'error');

    // Validate retur eligibility using domain function
    const returValidation = canReturDocument(po.statusLogistik, po.statusBayar);
    if (!returValidation.allowed) {
      return triggerToast(`Tidak bisa retur: ${returValidation.reason}`, 'error');
    }

    // Get returable items
    const returableItems = calculateReturableQty(
      po.items.map(item => ({
        sku: item.sku,
        nama: item.nama,
        qty: item.qty,
        qtyReceived: item.qtyReceived,
        qtyReturned: item.qtyReturned || 0,
        harga: item.harga,
        hpp: item.hpp
      }))
    );

    if (returableItems.length === 0) {
      return triggerToast('Tidak ada item yang bisa di-retur', 'error');
    }

    // For now, show a simple prompt for retur items
    // In production, this would be a modal with item selection
    const returnItemsInput = window.prompt(
      `Retur PO [${id}]\nItem yang bisa di-retur:\n${returableItems.map(i => `${i.sku} (${i.nama}): max ${i.qtyMax}`).join('\n')}\n\nMasukkan format: SKU1:qty,SKU2:qty\nContoh: SKU001:2,SKU002:1`
    );

    if (!returnItemsInput) return;

    try {
      const returnItems = returnItemsInput.split(',').map(s => {
        const [sku, qty] = s.trim().split(':');
        return { sku, qty: parseInt(qty) || 0 };
      }).filter(r => r.qty > 0);

      if (returnItems.length === 0) return triggerToast('Tidak ada item valid untuk di-retur', 'error');

      setIsVoidingPO(true);
      const result = await processRetur({
        docType: 'PO',
        docId: id,
        returnItems,
        alasan: window.prompt('Alasan retur (opsional):') || 'Retur barang'
      });

      if (result.success) {
        triggerToast(`Retur PO [${id}] berhasil. Total refund: Rp ${result.totalRefund.toLocaleString('id-ID')}`);
        const [refreshedProducts, refreshedSuppliers, refreshedPOs] = await Promise.all([
          getProducts(),
          getSuppliers(),
          getPurchaseOrders()
        ]);
        setProducts(refreshedProducts);
        setSuppliers(refreshedSuppliers);
        setPurchaseOrders(refreshedPOs);
      }
    } catch (err: any) {
      triggerToast('Gagal retur PO: ' + err.message, 'error');
    } finally {
      setIsVoidingPO(false);
    }
  };

  const handleReturSO = async (id: string) => {
    if (isVoidingSO) return;
    const so = salesOrders.find(s => s.id === id);
    if (!so) return triggerToast('SO tidak ditemukan', 'error');

    // Validate retur eligibility using domain function
    const returValidation = canReturDocument(so.statusLogistik, so.statusBayar);
    if (!returValidation.allowed) {
      return triggerToast(`Tidak bisa retur: ${returValidation.reason}`, 'error');
    }

    // Get returable items
    const returableItems = calculateReturableQty(
      so.items.map(item => ({
        sku: item.sku,
        nama: item.nama,
        qty: item.qty,
        qtyShipped: item.qtyShipped,
        qtyReturned: item.qtyReturned || 0,
        harga: item.harga,
        hpp: item.hpp
      }))
    );

    if (returableItems.length === 0) {
      return triggerToast('Tidak ada item yang bisa di-retur', 'error');
    }

    // For now, show a simple prompt for retur items
    const returnItemsInput = window.prompt(
      `Retur SO [${id}]\nItem yang bisa di-retur:\n${returableItems.map(i => `${i.sku} (${i.nama}): max ${i.qtyMax}`).join('\n')}\n\nMasukkan format: SKU1:qty,SKU2:qty\nContoh: SKU001:2,SKU002:1`
    );

    if (!returnItemsInput) return;

    try {
      const returnItems = returnItemsInput.split(',').map(s => {
        const [sku, qty] = s.trim().split(':');
        return { sku, qty: parseInt(qty) || 0 };
      }).filter(r => r.qty > 0);

      if (returnItems.length === 0) return triggerToast('Tidak ada item valid untuk di-retur', 'error');

      setIsVoidingSO(true);
      const result = await processRetur({
        docType: 'SO',
        docId: id,
        returnItems,
        alasan: window.prompt('Alasan retur (opsional):') || 'Retur barang'
      });

      if (result.success) {
        triggerToast(`Retur SO [${id}] berhasil. Total refund: Rp ${result.totalRefund.toLocaleString('id-ID')}`);
        const [refreshedProducts, refreshedCustomers, refreshedSOs] = await Promise.all([
          getProducts(),
          getCustomers(),
          getSalesOrders()
        ]);
        setProducts(refreshedProducts);
        setCustomers(refreshedCustomers);
        setSalesOrders(refreshedSOs);
      }
    } catch (err: any) {
      triggerToast('Gagal retur SO: ' + err.message, 'error');
    } finally {
      setIsVoidingSO(false);
    }
  };

  // ==========================================
  // STOCK OPNAME LOGIC
  // ==========================================
  const handleStockOpnameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!opnameForm.sku) return triggerToast('Pilih SKU target terlebih dahulu', 'error');
    setShowOpnameConfirm(true);
  };

  const handleStockOpnameConfirmAction = () => {
    const prod = products.find(p => p.sku === opnameForm.sku);
    if (!prod) return;

    const selisih = typeof opnameForm.selisih === 'string' ? (parseFloat(opnameForm.selisih) || 0) : opnameForm.selisih;
    const qtyFisik = typeof opnameForm.qtyFisik === 'string' ? (parseFloat(opnameForm.qtyFisik) || 0) : opnameForm.qtyFisik;
    const valueAdjustment = selisih * prod.hpp;

    const newLog = {
      tanggal: new Date().toISOString().split('T')[0],
      sku: prod.sku,
      nama: prod.nama,
      tipe: opnameForm.tipe,
      qtySistem: opnameForm.qtySistem,
      qtyFisik: qtyFisik,
      selisih,
      satuan: prod.satuan,
      HPP: prod.hpp,
      subtotal: valueAdjustment,
      catatan: opnameForm.catatan || 'Penyesuaian stok manual',
      operator: 'Administrator'
    };

    setProducts(products.map(p => p.sku === prod.sku ? { ...p, stok: qtyFisik } : p));
    saveProduct({ ...prod, stok: qtyFisik });
    setOpnameLog([newLog, ...opnameLog]);
    appendOpnameLog(newLog);
    triggerToast(`Opname SKU [${prod.sku}] berhasil dicatat & disesuaikan.`);
    setOpnameForm({ sku: '', tipe: 'OPNAME_PLUS', qtySistem: 0, selisih: 0, qtyFisik: 0, catatan: '' });
    setShowOpnameConfirm(false);
    setShowOpnameModal(false);
  };

  // Render login screen if login is active and user is not logged in
  if (isLoginActive && !isLoggedIn) {
    // Mode Setup Wizard hanya aktif jika ditekan dari tombol Buat Perusahaan Baru
    if (isSetupMode) {
      const handleOnboardingSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const email = fd.get('email') as string;
        const password = fd.get('password') as string;
        const confirm = fd.get('confirm') as string;
        
        if (password !== confirm) {
          return triggerToast('Password dan Konfirmasi Password tidak cocok!', 'error');
        }

        const hashed = await hashPassword(password);
        
        // Simpan ke localStorage untuk state saat ini
        localStorage.setItem('ino_login_username', email);
        localStorage.setItem('ino_login_password', hashed);
        localStorage.setItem('ino_nama_toko', fd.get('namaToko') as string);
        localStorage.setItem('ino_tipe_bisnis', fd.get('tipeBisnis') as string);
        localStorage.setItem('ino_alamat_toko', fd.get('alamat') as string);
        localStorage.setItem('ino_telp_toko', fd.get('telp') as string);
        localStorage.setItem('ino_mata_uang', fd.get('mataUang') as string);
        localStorage.setItem('ino_ppn_rate', fd.get('ppn') as string);
        localStorage.setItem('ino_metode_hpp_default', fd.get('hpp') as string);
        
        // Sinkronisasi ke server GAS
        triggerToast('Menyimpan ke server database...', 'success');
        try {
          const res = await initialSetup({
            email,
            passwordHash: hashed,
            nama: 'Superadmin',
            settings: [
              { key: 'nama_toko', value: fd.get('namaToko') as string },
              { key: 'tipe_bisnis', value: fd.get('tipeBisnis') as string },
              { key: 'alamat_toko', value: fd.get('alamat') as string },
              { key: 'telp_toko', value: fd.get('telp') as string },
              { key: 'mata_uang', value: fd.get('mataUang') as string },
              { key: 'ppn_rate', value: fd.get('ppn') as string },
              { key: 'metode_hpp_default', value: fd.get('hpp') as string }
            ]
          });
          if (!res.ok) {
            return triggerToast('Gagal setup: ' + res.message, 'error');
          }
          triggerToast('Setup Berhasil! Memuat ulang sistem...', 'success');
          setTimeout(() => window.location.reload(), 1500);
        } catch (error) {
          triggerToast('Gagal menyimpan ke server: ' + (error as Error).message, 'error');
        }
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 py-10 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-3xl border border-slate-100">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-black text-primary">Selamat Datang di INO ERP</h2>
              <p className="text-secondary mt-2">Mari setup profil perusahaan & akun keamanan utama (Superadmin) Anda.</p>
            </div>
            <form onSubmit={handleOnboardingSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="font-bold border-b pb-2 text-slate-800">1. Data Perusahaan</h3>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Nama Usaha / Perusahaan</label>
                    <input name="namaToko" type="text" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" placeholder="PT. Inovasi Sukses" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Jenis Usaha</label>
                    <select name="tipeBisnis" className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50">
                      <option value="Retail">Retail</option>
                      <option value="Manufaktur">Manufaktur</option>
                      <option value="Jasa">Jasa</option>
                      <option value="Konsinyasi">Konsinyasi / Titip Jual</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Alamat Lengkap</label>
                    <textarea name="alamat" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" rows={2}></textarea>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase mb-1">Nomor Telepon</label>
                      <input name="telp" type="text" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase mb-1">Pajak PPN (%)</label>
                      <input name="ppn" type="number" defaultValue="11" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase mb-1">Mata Uang</label>
                      <input name="mataUang" type="text" defaultValue="Rp" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-black text-secondary uppercase mb-1">Metode HPP</label>
                      <select name="hpp" className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50">
                        <option value="Rata-rata">Rata-rata (Average)</option>
                        <option value="FIFO">FIFO</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="font-bold border-b pb-2 text-slate-800">2. Keamanan (Superadmin)</h3>
                  <div className="bg-primary/10 p-3 rounded-card text-xs text-primary font-medium mb-4 border border-primary/20">
                    ℹ️ Akun ini memiliki hak akses penuh ke seluruh fitur dan Laporan Keuangan ERP. Jaga kerahasiaan password Anda.
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Email Superadmin</label>
                    <input name="email" type="email" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" placeholder="admin@perusahaan.com" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Password</label>
                    <input name="password" type="password" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" placeholder="Minimal 6 karakter" minLength={6} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-black text-secondary uppercase mb-1">Konfirmasi Password</label>
                    <input name="confirm" type="password" required className="w-full p-2 border rounded-card focus:ring-1 focus:ring-primary bg-slate-50" placeholder="Ulangi password di atas" minLength={6} />
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <button type="submit" className="w-full py-3.5 px-4 bg-primary text-white font-black uppercase tracking-wider rounded-card shadow-lg hover:bg-primary-hover transition-colors">
                  🚀 Simpan & Mulai Gunakan ERP
                </button>
              </div>
            </form>
          </div>
        </div>
      );
    }

    // ponytail: Autentikasi admin sederhana menggunakan state lokal & tombol bypass instan tanpa setup auth server / library eksternal rumit.
    const handleLoginSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (isLoggingIn) return;
      if (lockoutUntil && Date.now() < lockoutUntil) {
        const remainingSecs = Math.ceil((lockoutUntil - Date.now()) / 1000);
        triggerToast(`Terlalu banyak percobaan. Coba lagi dalam ${remainingSecs} detik.`, 'error');
        return;
      }
      setIsLoggingIn(true);
      try {
        const result = await loginToServer(loginInputUser, loginInputPass);

        if (result.ok && result.user) {
          setIsLoggedIn(true);
          setCurrentUser(result.user);
          setLoginAttempts(0);
          setLockoutUntil(null);
          triggerToast(`Login Berhasil! Selamat datang ${result.user.nama} (${result.user.role}).`, 'success');
        } else {
          const newAttempts = loginAttempts + 1;
          setLoginAttempts(newAttempts);
          if (newAttempts >= 5) {
            setLockoutUntil(Date.now() + 30000); // 30 sec lockout
            triggerToast('Gagal 5 kali berturut-turut. Anda diblokir selama 30 detik.', 'error');
          } else {
            triggerToast(result.error || `Gagal! Sisa percobaan: ${5 - newAttempts}`, 'error');
          }
        }
      } catch (err: any) {
        triggerToast('Error koneksi server: ' + (err.message || 'Coba lagi.'), 'error');
      } finally {
        setIsLoggingIn(false);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="bg-white p-8 rounded-lg shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Login Sistem</h2>
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Username / Email</label>
              <input
                type="text"
                value={loginInputUser}
                onChange={(e) => setLoginInputUser(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Password / PIN</label>
              <div className="relative mt-1">
                <input
                  type={showPassword ? "text" : "password"}
                  value={loginInputPass}
                  onChange={(e) => setLoginInputPass(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm p-2 border focus:ring-blue-500 focus:border-blue-500 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {isLoggingIn ? 'Memverifikasi...' : 'Masuk'}
            </button>
            {!isSystemInitialized && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('PERINGATAN: Tindakan ini akan membuka layar Setup awal sistem. Anda yakin?')) {
                      setIsSetupMode(true);
                    }
                  }}
                  className="w-full flex justify-center py-2 px-4 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-600 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  Buat Perusahaan Baru (Setup Awal)
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  const filteredProducts = products.filter(p => p.sku.toLowerCase().includes(debouncedSearchProductQuery.toLowerCase()) || p.nama.toLowerCase().includes(debouncedSearchProductQuery.toLowerCase()));
  const filteredPOs = purchaseOrders.filter(po => po.id.toLowerCase().includes(debouncedSearchPoQuery.toLowerCase()) || po.supplier.toLowerCase().includes(debouncedSearchPoQuery.toLowerCase()));
  const filteredSOs = salesOrders.filter(so => {
    const matchSearch = so.id.toLowerCase().includes(debouncedSearchSoQuery.toLowerCase()) || so.pelanggan.toLowerCase().includes(debouncedSearchSoQuery.toLowerCase());
    let matchFilter = true;
    if (soFilterJenis === 'SO') matchFilter = !so.id.startsWith('POS-');
    else if (soFilterJenis === 'POS') matchFilter = so.id.startsWith('POS-');
    return matchSearch && matchFilter;
  });

  const visibleNavGroups = NAV_GROUPS.filter(group => !group.allowedRoles || group.allowedRoles.includes(currentUser?.role || 'Superadmin')).map(group => ({
    ...group,
    children: group.children ? group.children.filter(child => !child.allowedRoles || child.allowedRoles.includes(currentUser?.role || 'Superadmin')) : undefined
  })).filter(group => group.direct || (group.children && group.children.length > 0));
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
      {isGlobalLoading && (
        <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center">
          <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin mb-4"></div>
          <p className="text-primary font-bold text-sm tracking-widest animate-pulse">MENYINKRONKAN DATA...</p>
        </div>
      )}
      {/* Premium Warm Minimal Topbar Header */}
      <header className="bg-white text-primary px-6 md:px-8 py-3.5 flex flex-col md:flex-row justify-between items-center border-b border-slate-100 gap-4 no-print shadow-xs relative z-50 w-full max-w-none">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-card bg-primary flex items-center justify-center font-bold text-white text-sm shadow-sm">
            IN
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-2">
                INO ERP
                <span className="text-[11px] text-primary bg-primary/5 px-2 py-0.5 rounded border border-primary/15 font-semibold">{namaToko}</span>
              </h1>
            </div>
            <p className="text-[11px] text-secondary font-medium">Integrated Business Operations &middot; {tipeBisnis}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap justify-end flex-1">
          <span className="bg-primary/5 text-primary border border-primary/15 px-3 py-1.5 rounded-card font-mono text-sm flex items-center gap-1.5 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"></span>
            Simulasi Aktif
          </span>
          <div className="hidden sm:flex items-center gap-2 text-sm font-medium text-secondary border-l border-slate-100 pl-3">
            <span>Administrator</span>
            <div translate="no" className="w-7 h-7 rounded-full bg-slate-100 text-slate-900 border border-border flex items-center justify-center text-sm font-bold">
              AD
            </div>
          </div>
          {isLoggedIn && isLoginActive && (
            <button
              onClick={async () => {
                await logoutFromServer();
                setIsLoggedIn(false);
                setLoginInputUser('');
                setLoginInputPass('');
                triggerToast('Logout berhasil! Sistem terkunci kembali.', 'success');
              }}
              className="flex items-center gap-1.5 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/30 px-3 py-1.5 rounded-card text-sm font-semibold transition-all cursor-pointer"
            >
              <LogOut size={13} />
              <span>Keluar</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('setting')}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-card text-sm font-semibold transition-all cursor-pointer"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Pengaturan</span>
          </button>
          <button
            onClick={() => setActiveTab('export_code')}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 px-3 py-1.5 rounded-card text-sm font-semibold transition-all cursor-pointer"
            title="Google Sheets Hub"
          >
            <Code size={14} />
          </button>
        </div>
      </header>

      {/* ======================= */}
      {/* MOBILE SUB-NAVIGATION   */}
      {/* ======================= */}
      <div className="md:hidden bg-slate-50 border-b border-border px-4 py-2 flex overflow-x-auto gap-2 [&::-webkit-scrollbar]:hidden" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {visibleNavGroups.find(g => isGroupActive(g))?.children?.map(child => (
          <button
            key={child.id}
            onClick={() => setActiveTab(child.id)}
            className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${activeTab === child.id ? 'bg-primary text-white' : 'bg-white text-secondary border border-border'}`}
          >
            {child.label}
          </button>
        ))}
      </div>

      {/* ======================= */}
      {/* DESKTOP NAVIGATION BAR  */}
      {/* ======================= */}
      <nav className="bg-white text-secondary border-b border-slate-100 px-6 md:px-8 py-2.5 hidden md:flex items-center justify-center no-print relative z-[60] w-full max-w-none">
        <div className="flex items-center justify-center w-full flex-wrap gap-4 max-w-none">
          {visibleNavGroups.map(group => {
            const active = isGroupActive(group);
            if (group.direct) {
              return (
                <button
                  key={group.id}
                  onClick={() => setActiveTab(group.id)}
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-transparent hover:bg-slate-50 text-secondary hover:text-primary'
                    }`}
                >
                  {group.icon}
                  <span>{group.label}</span>
                </button>
              );
            }

            return (
              <div key={group.id} className="relative group">
                <button
                  className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all cursor-pointer whitespace-nowrap ${active
                      ? 'bg-primary/10 text-primary'
                      : 'bg-transparent hover:bg-slate-50 text-secondary hover:text-primary'
                    }`}
                >
                  {group.icon}
                  <span>{group.label}</span>
                  <ChevronDown size={14} className={`transition-transform duration-200 opacity-50 group-hover:opacity-100 ${active ? 'text-primary' : 'text-slate-400'}`} />
                </button>
                <div className="absolute left-0 top-[90%] pt-3 hidden group-hover:block z-50 min-w-[220px]">
                  <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl p-1.5 flex flex-col gap-0.5 relative z-50">
                    {group.children?.map(child => {
                      const childActive = activeTab === child.id;
                      return (
                        <button
                          key={child.id}
                          onClick={() => setActiveTab(child.id)}
                          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl text-sm font-medium transition-all cursor-pointer ${childActive
                              ? 'bg-primary/5 text-primary'
                              : 'bg-transparent hover:bg-slate-50 text-secondary hover:text-primary'
                            }`}
                        >
                          {child.icon}
                          <span>{child.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex flex-1 flex-col">
        {/* Content Body */}
        <main className="flex-1 p-6 md:p-8 pb-20 md:pb-8 w-full max-w-none overflow-y-auto">
          {toast && (
            <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-card shadow-lg text-white font-medium flex items-center gap-3 transition-all transform animate-bounce z-50 ${toast.type === 'success' ? 'bg-success' : toast.type === 'error' ? 'bg-danger' : 'bg-warning'}`}>
              <CheckCircle size={18} />
              <span>{toast.message}</span>
            </div>
          )}

          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (() => {
            const latestBalances: Record<string, number> = {};
            settingCashAccounts.forEach(acc => latestBalances[acc.nama] = 0);
            cashLedger.forEach(c => {
              latestBalances[c.akun || 'Bank'] = c.saldo;
            });

            let totalTunai = 0;
            let totalBank = 0;

            if (cashLedger.length === 0) {
              totalBank = 0;
            } else {
              Object.keys(latestBalances).forEach(akunName => {
                const accSetting = settingCashAccounts.find(a => a.nama === akunName);
                const isTunai = accSetting
                  ? (accSetting.jenis === 'Kas' || accSetting.nama.toLowerCase().includes('tunai') || accSetting.nama.toLowerCase().includes('cash'))
                  : (akunName.toLowerCase().includes('tunai') || (akunName.toLowerCase().includes('kas') && !akunName.toLowerCase().includes('bank')));

                if (isTunai) {
                  totalTunai += latestBalances[akunName] || 0;
                } else {
                  totalBank += latestBalances[akunName] || 0;
                }
              });
            }
            const grandTotalKas = totalTunai + totalBank;

            const totalPiutangAR = salesOrders
              .filter(so => so.statusBayar === 'Belum Lunas' || so.statusBayar === 'Cicilan')
              .reduce((sum, so) => sum + (so.grandTotal - (so.totalPaid ?? 0)), 0);

            const totalHutangAP = purchaseOrders
              .filter(po => po.statusBayar === 'Belum Dibayar' || po.statusBayar === 'Cicilan')
              .reduce((sum, po) => sum + (po.grandTotal - (po.totalPaid ?? 0)), 0);

            const totalMarginPenjualan = salesOrders
              .filter(so => so.statusLogistik !== 'Void')
              .reduce((sum, so) => {
                return sum + so.items.reduce((itemSum: number, item: any) => {
                  const prod = products.find(p => p.sku === item.sku);
                  const hpp = prod ? prod.hpp : 12000;
                  return itemSum + (item.qty * (item.harga - hpp));
                }, 0);
              }, 0);

            const totalOpnameMinus = opnameLog
              .filter(log => log.tipe === 'OPNAME_MINUS' || log.selisih < 0)
              .reduce((sum, log) => sum + Math.abs(log.subtotal), 0);

            const estimasiLabaKotor = totalMarginPenjualan - totalOpnameMinus;

            const arOverdueList = salesOrders.filter(so => isSoOverdue(so));
            const apOverdueList = purchaseOrders.filter(po => isPoOverdue(po));
            const criticalStockList = products.filter(p => p.stok <= p.safety && p.status === 'Aktif');

            const liveAuditFeed = deriveAllInventoryLogs().slice(0, 10);

            // Filter out void orders to get clean counts and ratios for donut charts
            const validSos = salesOrders.filter(so => so.statusLogistik !== 'Void');
            const totalSoLunasCount = validSos.filter(so => so.statusBayar === 'Lunas').length;
            const totalSoUnpaidCount = validSos.filter(so => so.statusBayar === 'Belum Lunas' || so.statusBayar === 'Cicilan').length;
            const totalSoLunasAmount = validSos.filter(so => so.statusBayar === 'Lunas').reduce((sum, so) => sum + so.grandTotal, 0);
            const totalSoUnpaidAmount = validSos.filter(so => so.statusBayar === 'Belum Lunas' || so.statusBayar === 'Cicilan').reduce((sum, so) => sum + (so.grandTotal - (so.totalPaid ?? 0)), 0);

            const soPieData = [
              { name: 'Lunas', value: totalSoLunasCount, amount: totalSoLunasAmount },
              { name: 'Belum Lunas / Cicilan', value: totalSoUnpaidCount, amount: totalSoUnpaidAmount }
            ];

            const validPos = purchaseOrders.filter(po => po.statusLogistik !== 'Void');
            const totalPoLunasCount = validPos.filter(po => po.statusBayar === 'Lunas').length;
            const totalPoUnpaidCount = validPos.filter(po => po.statusBayar === 'Belum Dibayar' || po.statusBayar === 'Cicilan').length;
            const totalPoLunasAmount = validPos.filter(po => po.statusBayar === 'Lunas').reduce((sum, po) => sum + po.grandTotal, 0);
            const totalPoUnpaidAmount = validPos.filter(po => po.statusBayar === 'Belum Dibayar' || po.statusBayar === 'Cicilan').reduce((sum, po) => sum + (po.grandTotal - (po.totalPaid ?? 0)), 0);

            const poPieData = [
              { name: 'Lunas', value: totalPoLunasCount, amount: totalPoLunasAmount },
              { name: 'Belum Dibayar / Cicilan', value: totalPoUnpaidCount, amount: totalPoUnpaidAmount }
            ];


            const trendData = getSalesVsPurchaseTrend();
            const topCustomers = getTopCustomersByProfit().slice(0, 5);
            const topProducts = getTop10ProfitSKUs().slice(0, 5);

            // Unique customers
            const uniqueCustomers = Array.from(new Set(salesOrders.filter(so => so.statusLogistik !== 'Void').map(so => so.pelanggan))).sort();

            const customerTimeline = getCustomerSalesTimeline(selectedCustomerAnalysis || uniqueCustomers[0] || '');
            const productTimeline = getSkuSalesTimeline(selectedSkuAnalysis);
            const currentProduct = products.find(p => p.sku === selectedSkuAnalysis);

            return (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">🏠 Dashboard Monitor (Live Control Center)</h2>
                    <p className="text-sm text-secondary">Monitor keuangan operasional harian dan tindakan eksekusi penting secara langsung</p>

                  </div>
                </div>
                <div className="space-y-6">
                  {/* Top Cards (Metrik Flash) */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* Kas Aktual */}
                    <Card className="flex flex-col justify-between relative overflow-hidden group hover:border-primary transition-all">
                      <div className="flex justify-between items-center text-sm font-bold text-slate-400 tracking-wider uppercase">
                        <span>Total Kas & Bank</span>
                        <span className="p-1.5 rounded-card bg-success/10 text-primary font-mono text-[11px]">Live Balance</span>
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-primary">
                          Rp {grandTotalKas.toLocaleString('id-ID')}
                        </span>
                        <p className="text-[11px] text-secondary mt-1.5 font-medium opacity-80">
                          Tunai: Rp {totalTunai.toLocaleString('id-ID')} | Bank: Rp {totalBank.toLocaleString('id-ID')}
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setManualCashForm({
                              tanggal: new Date().toISOString().split('T')[0],
                              keterangan: '',
                              kategori: 'Operasional Lain',
                              tipe: 'KELUAR',
                              nominal: 0,
                              akun: settingCashAccounts.length > 0 ? settingCashAccounts[0].nama : 'Bank'
                            });
                            setShowManualCashModal(true);
                          }}
                          className="text-[11px] text-primary p-0 h-auto hover:bg-transparent hover:text-primary-hover"
                        >
                          ➕ Catat Mutasi Kas Manual
                        </Button>
                      </div>
                    </Card>
                    {/* Total Piutang (AR) */}
                    <div className="bg-white border border-border p-5 rounded-card shadow-sm flex flex-col justify-between hover:border-sky-500 transition-all">
                      <div className="flex justify-between items-center text-sm font-bold text-text-muted tracking-wider uppercase">
                        <span>Total Piutang (AR)</span>
                        <span className="p-1.5 rounded-card bg-sky-50 text-info font-mono text-[11px]">Sisa Tagihan</span>
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-text-primary">
                          Rp {totalPiutangAR.toLocaleString('id-ID')}
                        </span>
                        <p className="text-[11px] text-text-secondary mt-1.5">SO Belum Lunas / Cicilan aktif</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] text-secondary">
                        <span>Detail & Pelunasan ada di tab <button onClick={() => setActiveTab('sales_order')} className="font-bold hover:underline cursor-pointer">Sales Order</button></span>

                      </div>
                    </div>
                    {/* Total Hutang (AP) */}
                    <div className="bg-white border border-border p-5 rounded-card shadow-sm flex flex-col justify-between hover:border-red-500 transition-all">
                      <div className="flex justify-between items-center text-sm font-bold text-text-muted tracking-wider uppercase">
                        <span>Total Hutang (AP)</span>
                        <span className="p-1.5 rounded-card bg-danger/10 text-danger font-mono text-[11px]">Sisa Hutang</span>
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-text-primary">
                          Rp {totalHutangAP.toLocaleString('id-ID')}
                        </span>
                        <p className="text-[11px] text-text-secondary mt-1.5">PO Belum Dibayar / Cicilan aktif</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center text-[11px] text-secondary">
                        <span>Kelola pembayaran di tab <button onClick={() => setActiveTab('purchase_order')} className="font-bold hover:underline cursor-pointer">Purchase Order</button></span>

                      </div>
                    </div>
                    {/* Estimasi Laba Kotor */}
                    <div className="bg-white border border-border p-5 rounded-card shadow-sm flex flex-col justify-between hover:border-violet-500 transition-all">
                      <div className="flex justify-between items-center text-sm font-bold text-text-muted tracking-wider uppercase">
                        <span>Est. Laba Kotor</span>
                        <span className="p-1.5 rounded-card bg-violet-50 text-violet-600 font-mono text-[11px]">Hj - HPP - Opname-</span>
                      </div>
                      <div className="mt-3">
                        <span className="text-2xl font-extrabold text-text-primary">
                          Rp {estimasiLabaKotor.toLocaleString('id-ID')}
                        </span>
                        <p className="text-[11px] text-text-secondary mt-1.5">Setelah dikurangi wastage & opname minus</p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center text-[11px] text-secondary font-mono">
                        <span>Margin: {totalMarginPenjualan > 0 ? ((estimasiLabaKotor / totalMarginPenjualan) * 100).toFixed(1) : 0}%</span>
                        <span className="text-danger">Waste: Rp {totalOpnameMinus.toLocaleString('id-ID')}</span>

                      </div>
                    </div>
                  </div>
                  {/* Action Tables Group */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    {/* AR Overdue */}
                    <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-extrabold text-danger uppercase tracking-wider flex items-center justify-between gap-1.5 w-full">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-danger animate-pulse"></span>
                            ⚠️ AR Overdue (Piutang Jatuh Tempo)
                          </span>
                          <button onClick={() => setActiveTab('sales_order')} className="text-[11px] text-danger hover:underline font-bold cursor-pointer normal-case">Tinjau Penjualan &rarr;</button>
                        </h3>
                        <span className="bg-danger/20 text-danger text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">{arOverdueList.length} Faktur</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-text-secondary font-bold border-b border-slate-100 uppercase text-xs">
                              <th className="py-3 px-4">No. SO</th>
                              <th className="py-3 px-4">Customer</th>
                              <th className="py-3 px-4 text-right">Sisa Tagihan</th>
                              <th className="py-3 px-4 text-center">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {arOverdueList.map(so => {
                              const sisa = so.grandTotal - (so.totalPaid ?? 0);
                              return (
                                <tr key={so.id} className="hover:bg-slate-50">
                                  <td className="py-3.5 px-4 font-mono font-bold text-text-primary">{so.id}</td>
                                  <td className="py-3.5 px-4 font-medium max-w-[100px] truncate">{so.pelanggan}</td>
                                  <td className="py-3.5 px-4 text-right font-bold text-danger">Rp {sisa.toLocaleString('id-ID')}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <button
                                      onClick={() => {
                                        setSelectedSo(so);
                                        setSoActionForm('payment');
                                        setActiveTab('sales_order');
                                      }}
                                      className="text-[11px] font-bold bg-primary text-white px-2 py-1 rounded hover:bg-teal-600"
                                    >
                                      Bayar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {arOverdueList.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-400 italic">Tidak ada piutang jatuh tempo. Luar biasa!</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                      </div>
                    </div>
                    {/* AP Overdue */}
                    <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-extrabold text-warning uppercase tracking-wider flex items-center justify-between gap-1.5 w-full">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-warning animate-pulse"></span>
                            ⚠️ AP Overdue (Hutang Jatuh Tempo)
                          </span>
                          <button onClick={() => setActiveTab('purchase_order')} className="text-[11px] text-warning hover:underline font-bold cursor-pointer normal-case">Tinjau Pembelian &rarr;</button>
                        </h3>
                        <span className="bg-warning/20 text-warning text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">{apOverdueList.length} Tagihan</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-text-secondary font-bold border-b border-slate-100 uppercase text-xs">
                              <th className="py-3 px-4">No. PO</th>
                              <th className="py-3 px-4">Supplier</th>
                              <th className="py-3 px-4 text-right">Sisa Hutang</th>
                              <th className="py-3 px-4 text-center">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {apOverdueList.map(po => {
                              const sisa = po.grandTotal - (po.totalPaid ?? 0);
                              return (
                                <tr key={po.id} className="hover:bg-slate-50">
                                  <td className="py-3.5 px-4 font-mono font-bold text-text-primary">{po.id}</td>
                                  <td className="py-3.5 px-4 font-medium max-w-[100px] truncate">{po.supplier}</td>
                                  <td className="py-3.5 px-4 text-right font-bold text-warning">Rp {sisa.toLocaleString('id-ID')}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <button
                                      onClick={() => {
                                        setSelectedPo(po);
                                        setPoActionForm('payment');
                                        setActiveTab('purchase_order');
                                      }}
                                      className="text-[11px] font-bold bg-primary text-white px-2 py-1 rounded hover:bg-teal-600"
                                    >
                                      Bayar
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            {apOverdueList.length === 0 && (
                              <tr>
                                <td colSpan={4} className="py-6 text-center text-slate-400 italic">Tidak ada hutang jatuh tempo. Aman terkendali!</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                      </div>
                    </div>
                    {/* Stok Kritis (Low Stock) */}
                    <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                      <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                        <h3 className="text-sm font-extrabold text-danger uppercase tracking-wider flex items-center justify-between gap-1.5 w-full">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-danger/100"></span>
                            🚨 Stok Kritis (&le; Safety Level)
                          </span>
                          <button onClick={() => setActiveTab('master_produk')} className="text-[11px] text-danger hover:underline font-bold cursor-pointer normal-case">Cek Master Produk &rarr;</button>
                        </h3>
                        <span className="bg-danger/10 text-danger text-[11px] font-bold px-2 py-0.5 rounded-full font-mono">{criticalStockList.length} SKU</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="bg-slate-50 text-text-secondary font-bold border-b border-slate-100 uppercase text-xs">
                              <th className="py-3 px-4">Produk</th>
                              <th className="py-3 px-4 text-center">Stok / Safety</th>
                              <th className="py-3 px-4 text-center">Reorder PO</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {criticalStockList.map(p => (
                              <tr key={p.sku} className="hover:bg-slate-50">
                                <td className="py-3.5 px-4">
                                  <div className="font-bold text-text-primary">{p.nama}</div>
                                  <div className="font-mono text-[11px] text-primary">{p.sku}</div>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <span className="font-bold text-danger">{p.stok}</span>
                                  <span className="text-slate-400 text-[11px]"> / {p.safety}</span>
                                  <span className="text-slate-400 text-[11px] ml-1">{p.satuan}</span>
                                </td>
                                <td className="py-3.5 px-4 text-center">
                                  <button
                                    onClick={() => triggerGeneratePo(p)}
                                    className="text-[11px] font-bold bg-primary text-white px-2 py-1 rounded-md hover:bg-teal-600 transition-all"
                                  >
                                    ⚡ Generate PO
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {criticalStockList.length === 0 && (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-400 italic">Semua stok berada di atas level aman!</td>
                              </tr>
                            )}
                          </tbody>
                        </table>

                      </div>
                    </div>
                  </div>
                  {/* Live Audit Feed */}
                  <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                        📋 Live Audit Feed & Mutasi Inventori (10 Terakhir)
                      </h3>
                      <span className="text-[11px] font-mono text-slate-400">Total LOG: {deriveAllInventoryLogs().length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-text-secondary font-bold border-b border-border uppercase text-xs">
                            <th className="py-3.5 px-4">Tanggal</th>
                            <th className="py-3.5 px-4">Produk</th>
                            <th className="py-3.5 px-4">Tipe</th>
                            <th className="py-3.5 px-4 text-center">Mutasi</th>
                            <th className="py-3.5 px-4 text-right">Nilai Mutasi</th>
                            <th className="py-3.5 px-4">Operator</th>
                            <th className="py-3.5 px-4">Keterangan</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                          {liveAuditFeed.map((log, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-3.5 px-4 text-secondary whitespace-nowrap">{log.tanggal}</td>
                              <td className="py-3.5 px-4 text-primary whitespace-nowrap font-sans font-bold">
                                {log.nama} <span className="font-mono text-[11px] text-primary font-normal">[{log.sku}]</span>
                              </td>
                              <td className="py-3.5 px-4">
                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${log.tipe === 'IN' ? 'bg-success/10 text-success border border-success/30' : 'bg-danger/10 text-danger border border-danger/30'}`}>
                                  {log.tipe}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 text-center font-bold">{log.qty}</td>
                              <td className="py-3.5 px-4 text-right font-bold text-text-primary">Rp {log.subtotal.toLocaleString('id-ID')}</td>
                              <td className="py-3.5 px-4 font-sans text-secondary">{log.operator}</td>
                              <td className="py-3.5 px-4 font-sans text-secondary">{log.keterangan}</td>
                            </tr>
                          ))}
                          {liveAuditFeed.length === 0 && (
                            <tr>
                              <td colSpan={7} className="py-8 text-center text-slate-400 italic">Belum ada mutasi log inventori tercatat.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                    </div>
                  </div>
                  {/* Donut Charts Section (Rasio Pelunasan) */}
                  <div className="bg-white border border-border p-5 rounded-card shadow-sm space-y-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary"></span>
                        🍩 Rasio Pelunasan Transaksi & Status Keuangan (Donut Chart)
                      </h3>
                      <p className="text-[11px] text-text-secondary mt-0.5">Persentase dokumen transaksi yang sudah lunas vs yang masih berjalan (Belum Dibayar / Cicilan)</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Sales Orders Donut */}
                      <div className="border border-slate-100 rounded-card p-4 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-center md:text-left space-y-1">
                          <h4 className="text-sm font-bold text-primary">Sales Orders (AR)</h4>
                          <p className="text-[11px] text-slate-400">Rasio Piutang Pelanggan</p>
                          <div className="mt-2 text-sm font-mono space-y-1">
                            <div className="flex items-center gap-1.5 justify-center md:justify-start">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                              <span className="text-secondary">Lunas:</span>
                              <span className="font-bold text-primary">{totalSoLunasCount} Dokumen</span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-center md:justify-start">
                              <span className="w-2.5 h-2.5 rounded-full bg-danger"></span>
                              <span className="text-secondary">Sisa Tagihan:</span>
                              <span className="font-bold text-danger">{totalSoUnpaidCount} Dokumen</span>
                            </div>
                            <div className="text-[11px] text-secondary font-sans mt-2 pt-1.5 border-t border-border">
                              Sisa Piutang: <span className="font-bold text-danger font-mono">Rp {totalSoUnpaidAmount.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-[180px] h-[150px] flex items-center justify-center relative">
                          {validSos.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={soPieData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={40}
                                  outerRadius={55}
                                  paddingAngle={3}
                                >
                                  <Cell fill="#10B981" />
                                  <Cell fill="#EF4444" />
                                </Pie>
                                <Tooltip formatter={(v, n) => [`${v} Dokumen`, n]} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <span className="text-sm text-slate-400 italic">No Sales Data</span>
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[14px] font-bold text-primary">
                              {validSos.length > 0 ? ((totalSoLunasCount / validSos.length) * 100).toFixed(0) : 0}%
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase">Lunas</span>

                          </div>
                        </div>
                      </div>
                      {/* Purchase Orders Donut */}
                      <div className="border border-slate-100 rounded-card p-4 bg-slate-50 flex flex-col md:flex-row items-center justify-between gap-4">
                        <div className="text-center md:text-left space-y-1">
                          <h4 className="text-sm font-bold text-primary">Purchase Orders (AP)</h4>
                          <p className="text-[11px] text-slate-400">Rasio Hutang Supplier</p>
                          <div className="mt-2 text-sm font-mono space-y-1">
                            <div className="flex items-center gap-1.5 justify-center md:justify-start">
                              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                              <span className="text-secondary">Lunas:</span>
                              <span className="font-bold text-primary">{totalPoLunasCount} Dokumen</span>
                            </div>
                            <div className="flex items-center gap-1.5 justify-center md:justify-start">
                              <span className="w-2.5 h-2.5 rounded-full bg-warning"></span>
                              <span className="text-secondary">Sisa Hutang:</span>
                              <span className="font-bold text-warning">{totalPoUnpaidCount} Dokumen</span>
                            </div>
                            <div className="text-[11px] text-secondary font-sans mt-2 pt-1.5 border-t border-border">
                              Sisa Hutang: <span className="font-bold text-warning font-mono">Rp {totalPoUnpaidAmount.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-[180px] h-[150px] flex items-center justify-center relative">
                          {validPos.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={poPieData}
                                  dataKey="value"
                                  nameKey="name"
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={40}
                                  outerRadius={55}
                                  paddingAngle={3}
                                >
                                  <Cell fill="#10B981" />
                                  <Cell fill="#F59E0B" />
                                </Pie>
                                <Tooltip formatter={(v, n) => [`${v} Dokumen`, n]} />
                              </PieChart>
                            </ResponsiveContainer>
                          ) : (
                            <span className="text-sm text-slate-400 italic">No Purchase Data</span>
                          )}
                          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                            <span className="text-[14px] font-bold text-primary">
                              {validPos.length > 0 ? ((totalPoLunasCount / validPos.length) * 100).toFixed(0) : 0}%
                            </span>
                            <span className="text-[8px] text-slate-400 font-bold uppercase">Lunas</span>

                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Modal Mutasi Kas Manual */}
                    {showManualCashModal && (
                      <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-border overflow-hidden transform transition-all duration-300 scale-100 relative my-auto">
                          <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-primary text-sm uppercase tracking-wider flex items-center gap-2">
                              💵 Catat Mutasi Kas Manual Baru
                            </h3>
                            <button
                              onClick={() => setShowManualCashModal(false)}
                              className="text-slate-400 hover:text-secondary font-bold text-lg"
                            >
                              &times;
                            </button>
                          </div>
                          <form onSubmit={handleAddManualCash} className="p-6 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-bold text-secondary uppercase mb-1">Tanggal</label>
                                <input
                                  type="date"
                                  required
                                  value={manualCashForm.tanggal}
                                  onChange={(e) => setManualCashForm({ ...manualCashForm, tanggal: e.target.value })}
                                  className="w-full border border-border rounded-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-bold text-secondary uppercase mb-1">Tipe Mutasi</label>
                                <select
                                  value={manualCashForm.tipe}
                                  onChange={(e) => {
                                    const t = e.target.value;
                                    setManualCashForm({
                                      ...manualCashForm,
                                      tipe: t,
                                      kategori: t === 'KELUAR' ? 'Operasional Lain' : 'Modal'
                                    });
                                  }}
                                  className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                                >
                                  <option value="MASUK">📈 MASUK (DEBIT)</option>
                                  <option value="KELUAR">📉 KELUAR (KREDIT)</option>
                                </select>

                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-secondary uppercase mb-1">Kategori Keuangan</label>
                              <select
                                value={manualCashForm.kategori}
                                onChange={(e) => setManualCashForm({ ...manualCashForm, kategori: e.target.value })}
                                className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                              >
                                {manualCashForm.tipe === 'KELUAR' ? (
                                  <>
                                    <option value="Operasional Lain">Operasional Lain</option>
                                    <option value="Sewa Tempat">Sewa Tempat</option>
                                    <option value="Gaji Karyawan">Gaji Karyawan</option>
                                    <option value="Utilitas & Listrik">Utilitas & Listrik</option>
                                    <option value="Pajak">Pajak</option>
                                    <option value="Pembelian">Pembelian Alat/Bahan</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="Modal">Modal Tambahan</option>
                                    <option value="Penjualan Lain">Penjualan Non-Sistem</option>
                                    <option value="Pendapatan Jasa">Pendapatan Jasa / Bunga</option>
                                  </>
                                )}
                              </select>

                            </div>
                            <div>
                              <label className="block text-sm font-bold text-secondary uppercase mb-1">Akun Kas / Bank</label>
                              <select
                                value={manualCashForm.akun || 'Bank'}
                                onChange={(e) => setManualCashForm({ ...manualCashForm, akun: e.target.value })}
                                className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white mb-3"
                              >
                                {settingCashAccounts.map(acc => (
                                  <option key={acc.nama} value={acc.nama}>{acc.nomor ? `${acc.nomor} - ${acc.nama}` : acc.nama}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-bold text-secondary uppercase mb-1">Nominal (Rupiah)</label>
                              <input
                                type="text" inputMode="numeric"
                                min="1"
                                required
                                placeholder="Rp 0"
                                value={manualCashForm.nominal || ''}
                                onChange={(e) => setManualCashForm({ ...manualCashForm, nominal: parseInt(e.target.value) || 0 })}
                                className="w-full border border-border rounded-card px-3 py-2 text-sm font-mono font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                              />

                            </div>
                            <div>
                              <label className="block text-sm font-bold text-secondary uppercase mb-1">Keterangan Mutasi</label>
                              <textarea
                                required
                                rows={2}
                                placeholder="Contoh: Bayar internet kantor bulan Juni"
                                value={manualCashForm.keterangan}
                                onChange={(e) => setManualCashForm({ ...manualCashForm, keterangan: e.target.value })}
                                className="w-full border border-border rounded-card px-3 py-2 text-sm focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                              />

                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                              <button
                                type="button"
                                onClick={() => setShowManualCashModal(false)}
                                className="px-4 py-2 border border-border text-sm font-bold text-text-secondary rounded-card hover:bg-slate-50 transition-all"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                disabled={isSavingCash}
                                className={`px-4 py-2 text-white text-sm font-bold rounded-card transition-all ${isSavingCash ? 'bg-primary/70 cursor-not-allowed flex items-center justify-center gap-2' : 'bg-primary hover:bg-teal-600'}`}
                              >
                                {isSavingCash ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    <span>Menyimpan...</span>
                                  </>
                                ) : (
                                  'Simpan Mutasi'
                                )}
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                  </div></div></div>
            );
          })()}


          {/* TAB 1.5: DASHBOARD STATISTIK */}
          {activeTab === 'statistik' && (() => {
            const trendData = getSalesVsPurchaseTrend();
            const topCustomers = getTopCustomersByProfit().slice(0, 5);
            const topProducts = getTop10ProfitSKUs().slice(0, 5);

            // Unique customers
            const uniqueCustomers = Array.from(new Set(salesOrders.filter(so => so.statusLogistik !== 'Void').map(so => so.pelanggan))).sort();

            const customerTimeline = getCustomerSalesTimeline(selectedCustomerAnalysis || uniqueCustomers[0] || '');
            const productTimeline = getSkuSalesTimeline(selectedSkuAnalysis);
            const currentProduct = products.find(p => p.sku === selectedSkuAnalysis);

            return (
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">📈 Dashboard Statistik & Analitik Bisnis</h2>
                    <p className="text-sm text-secondary">Analisis performa pertumbuhan, kontribusi laba per pelanggan, dan perputaran SKU produk</p>

                  </div>
                  {/* Period Date Filters */}
                  <div className="bg-white border border-border p-3 rounded-card shadow-sm flex flex-wrap items-center gap-4">
                    <div className="text-sm font-bold text-primary flex items-center gap-1.5 uppercase">
                      📅 Periode:
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-slate-400">Dari</label>
                      <input
                        type="date"
                        value={analitikStartDate}
                        onChange={(e) => setAnalitikStartDate(e.target.value)}
                        className="border border-border rounded-card px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] font-bold text-slate-400">Sampai</label>
                      <input
                        type="date"
                        value={analitikEndDate}
                        onChange={(e) => setAnalitikEndDate(e.target.value)}
                        className="border border-border rounded-card px-2 py-1 text-sm focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                      />

                    </div>
                  </div>
                </div>
                {/* Sales & Purchases Trend Line Chart */}
                <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
                      📊 Tren Pertumbuhan & Gerak Transaksi (Penjualan SO vs Pembelian PO)
                    </h3>
                    <p className="text-[11px] text-text-secondary mt-0.5">Memantau naik turun pergerakan total nominal transaksi penjualan pelanggan vs pembelian supplier</p>
                  </div>
                  <div className="h-[280px]">
                    {trendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                          <XAxis dataKey="tanggal" fontSize={10} tickLine={false} />
                          <YAxis fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1000000).toFixed(1)}Jt`} />
                          <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString('id-ID')}`} />
                          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                          <Line type="monotone" dataKey="Penjualan (SO)" stroke="#0EA5A4" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="Pembelian (PO)" stroke="#F59E0B" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">Tidak ada transaksi dalam periode terpilih.</div>
                    )}

                  </div>
                </div>
                {/* Profit Contribution Rankings */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Customer Profit Rankings */}
                  <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
                        💎 Customer Penyumbang Laba Terbesar
                      </h3>
                      <p className="text-[11px] text-text-secondary mt-0.5">Penyumbang laba bersih tertinggi (Klik baris untuk memantau grafik tren di bawah)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-text-secondary font-bold border-b border-slate-100 uppercase text-xs">
                            <th className="py-3 px-4">No</th>
                            <th className="py-3 px-4">Nama Customer</th>
                            <th className="py-3 px-4 text-right">Revenue (SO)</th>
                            <th className="py-3 px-4 text-right text-success font-bold">Laba Bersih</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {topCustomers.map((cust, idx) => (
                            <tr
                              key={cust.nama}
                              onClick={() => setSelectedCustomerAnalysis(cust.nama)}
                              className={`hover:bg-slate-50 cursor-pointer transition-all ${selectedCustomerAnalysis === cust.nama ? 'bg-success/10 bg-opacity-40 font-bold' : ''}`}
                            >
                              <td className="py-3 px-4 text-slate-400 font-mono">#{idx + 1}</td>
                              <td className="py-3 px-4 text-text-primary font-sans flex items-center gap-1.5">
                                {cust.nama}
                                {selectedCustomerAnalysis === cust.nama && (
                                  <span className="text-[11px] bg-primary text-white px-1.5 py-0.2 rounded font-normal uppercase">Selected</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-secondary">Rp {cust.revenue.toLocaleString('id-ID')}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-success">Rp {cust.profit.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                          {topCustomers.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-400 italic">Belum ada transaksi penjualan terekam.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                    </div>
                  </div>
                  {/* Product Profit Rankings */}
                  <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                    <div>
                      <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
                        🏆 Barang (SKU) Penyumbang Laba Terbesar
                      </h3>
                      <p className="text-[11px] text-text-secondary mt-0.5">Barang dengan akumulasi margin laba tertinggi (Klik baris untuk memantau grafik tren di bawah)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="bg-slate-50 text-text-secondary font-bold border-b border-slate-100 uppercase text-xs">
                            <th className="py-3 px-4">No</th>
                            <th className="py-3 px-4">Nama Produk</th>
                            <th className="py-3 px-4 text-right">SKU</th>
                            <th className="py-3 px-4 text-right text-primary font-bold">Laba Tercipta</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {topProducts.map((prod, idx) => (
                            <tr
                              key={prod.sku}
                              onClick={() => setSelectedSkuAnalysis(prod.sku)}
                              className={`hover:bg-slate-50 cursor-pointer transition-all ${selectedSkuAnalysis === prod.sku ? 'bg-success/10 bg-opacity-40 font-bold' : ''}`}
                            >
                              <td className="py-3 px-4 text-slate-400 font-mono">#{idx + 1}</td>
                              <td className="py-3 px-4 text-text-primary font-sans flex items-center gap-1.5">
                                {prod.nama}
                                {selectedSkuAnalysis === prod.sku && (
                                  <span className="text-[11px] bg-primary text-white px-1.5 py-0.2 rounded font-normal uppercase">Selected</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-secondary">{prod.sku}</td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-primary">Rp {prod.profit.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                          {topProducts.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-8 text-center text-slate-400 italic">Belum ada laba terhitung dalam periode ini.</td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                    </div>
                  </div>
                </div>
                {/* Drill-downs Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Customer drilldown trend */}
                  <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
                          🔍 Drill-down Tren Pembelian & Laba per Customer
                        </h3>
                        <p className="text-[11px] text-text-secondary mt-0.5">Melihat fluktuasi grafik naik turun transaksi customer pilihan</p>
                      </div>
                      <div>
                        <select
                          value={selectedCustomerAnalysis}
                          onChange={(e) => setSelectedCustomerAnalysis(e.target.value)}
                          className="border border-border rounded-card px-2 py-1 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-slate-50 text-text-primary"
                        >
                          <option value="">-- Pilih Customer --</option>
                          {uniqueCustomers.map(cust => (
                            <option key={cust} value={cust}>{cust}</option>
                          ))}
                        </select>

                      </div>
                    </div>
                    <div className="h-[200px]">
                      {selectedCustomerAnalysis && customerTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={customerTimeline} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="tanggal" fontSize={9} tickLine={false} />
                            <YAxis fontSize={9} tickLine={false} axisLine={false} tickFormatter={(v) => `Rp ${(v / 1000).toFixed(0)}K`} />
                            <Tooltip formatter={(value: any) => `Rp ${value.toLocaleString('id-ID')}`} />
                            <Legend wrapperStyle={{ fontSize: 10 }} />
                            <Line type="monotone" dataKey="revenue" name="Total Belanja" stroke="#3B82F6" strokeWidth={2.5} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="profit" name="Margin Profit" stroke="#10B981" strokeWidth={2.5} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">
                          {selectedCustomerAnalysis ? 'Tidak ada riwayat belanja untuk customer ini dalam periode ini.' : 'Silakan pilih customer di atas atau klik baris tabel peringkat.'}
                        </div>
                      )}

                    </div>
                  </div>
                  {/* Product drilldown trend */}
                  <div className="bg-white border border-border rounded-card p-5 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-extrabold text-text-primary uppercase tracking-wider">
                          🔍 Drill-down Tren Penjualan per Produk (SKU)
                        </h3>
                        <p className="text-[11px] text-text-secondary mt-0.5">Melihat fluktuasi grafik naik turun volume produk terjual</p>
                      </div>
                      <div>
                        <select
                          value={selectedSkuAnalysis}
                          onChange={(e) => setSelectedSkuAnalysis(e.target.value)}
                          className="border border-border rounded-card px-2 py-1 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-slate-50 text-text-primary"
                        >
                          {products.map(p => (
                            <option key={p.sku} value={p.sku}>{p.nama} [{p.sku}]</option>
                          ))}
                        </select>

                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-1 text-center">
                      <div className="bg-slate-50 p-1.5 rounded-card border border-slate-100">
                        <span className="text-[11px] text-slate-400 block uppercase font-bold">Stok Sekarang</span>
                        <span className="font-extrabold text-primary text-sm">{currentProduct?.stok || 0} {currentProduct?.satuan}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-card border border-slate-100">
                        <span className="text-[11px] text-slate-400 block uppercase font-bold">Modal HPP</span>
                        <span className="font-extrabold text-primary text-[11px] font-mono">Rp {(currentProduct?.hpp || 0).toLocaleString('id-ID')}</span>
                      </div>
                      <div className="bg-slate-50 p-1.5 rounded-card border border-slate-100">
                        <span className="text-[11px] text-slate-400 block uppercase font-bold">Harga Jual</span>
                        <span className="font-extrabold text-primary text-[11px] font-mono">Rp {(currentProduct?.hj || 0).toLocaleString('id-ID')}</span>

                      </div>
                    </div>
                    <div className="h-[135px]">
                      {selectedSkuAnalysis && productTimeline.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={productTimeline} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                            <XAxis dataKey="tanggal" fontSize={9} tickLine={false} />
                            <YAxis fontSize={9} tickLine={false} axisLine={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="qty" name="Qty Terjual (Pcs)" stroke="#0EA5A4" strokeWidth={2.5} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-sm text-slate-400 italic">
                          Tidak ada transaksi penjualan produk ini dalam periode terpilih.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}



          {/* TAB 2: MASTER PRODUK */}
          {activeTab === 'master_produk' && (
            <div className="space-y-6 print-container" id="master-produk-section">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #master-produk-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
                }
              `}} />
              <div className="flex flex-col gap-4 no-print">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-2xl font-bold text-text-primary">Master Inventori</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowMasterConfigModal(true)}
                      className="bg-slate-100 hover:bg-slate-200 text-primary px-3 py-2.5 rounded-card flex items-center gap-2 font-bold text-sm shadow-sm transition-all border border-border cursor-pointer"
                    >
                      <Settings size={16} />
                      <span className="hidden sm:inline">Kategori &amp; Satuan</span>
                    </button>
                    <button
                      onClick={() => setShowOpnameModal(true)}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2.5 rounded-card flex items-center gap-2 font-bold text-sm shadow transition-all cursor-pointer"
                    >
                      <AlertTriangle size={16} />
                      <span className="hidden sm:inline">Stock Opname</span>
                    </button>
                    {/* ponytail: bersihkan action header atas dari tombol ekspor */}
                    <button
                      onClick={() => {
                        const initialPrefix = settingPrefixes.length > 0 ? settingPrefixes[0].prefix : 'RTL';
                        const generatedSku = generateNewSku(initialPrefix, products);
                        setProductForm({ sku: generatedSku, prefix: initialPrefix, kategori: 'Barang Jadi', subKat: 'Roti & Kue', nama: '', satuan: 'Pcs', hj: 0, hpp: 0, safety: 10, stok: 0, status: 'Aktif', supplier: '', tempatSimpan: 'Gudang Utama', masaSmp: 'Selamanya', catatan: '' });
                        setIsEditingProduct(false);
                        setShowProductModal(true);
                      }}
                      className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-card flex items-center gap-2 font-bold text-sm shadow transition-all cursor-pointer"
                    >
                      <Plus size={16} />
                      <span>Produk Baru</span>
                    </button>

                  </div>
                </div>
                <div className="relative w-full">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="Cari SKU, nama, lokasi..."
                    value={searchProductQuery}
                    onChange={(e) => setSearchProductQuery(e.target.value)}
                    className="block w-full pl-9 pr-3 py-2.5 border border-border rounded-card text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary outline-none shadow-sm"
                  />


                </div>
              </div>
              {/* Product List Table */}
              <div className="bg-white border border-border rounded-card shadow-sm overflow-hidden print:hidden">
                <div className="overflow-x-auto w-full">
                  <table className="w-full text-sm text-left min-w-[1100px] border-collapse">
                    <thead>
                      <tr className="bg-primary text-white border-b border-teal-600 hover:bg-primary">
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left">SKU</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left">Kategori / Sub</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left w-1/4">Nama Produk</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-center">Satuan</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-right">Harga Jual</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-right">HPP</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-right">Stok</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left">Lokasi Simpan</th>
                        <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-center w-[120px]">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-0">
                            <EmptyState
                              icon={Package}
                              title="Tidak Ada Produk"
                              description="Data produk tidak ditemukan atau kosong. Silakan tambahkan produk baru."
                              actionLabel="Tambah Produk"
                              onAction={() => { setProductForm({ sku: '', prefix: 'RTL', kategori: 'Barang Jadi', subKat: '', nama: '', satuan: 'Pcs', hj: 0, hpp: 0, safety: 10, stok: 0, status: 'Aktif', supplier: '', tempatSimpan: 'Gudang Utama', masaSmp: 'Selamanya', catatan: '' }); setIsEditingProduct(false); setShowProductModal(true); }}
                              className="border-0 rounded-none shadow-none"
                            />
                          </td>
                        </tr>
                      ) : filteredProducts.map(p => (
                        <tr key={p.sku} className={`even:bg-slate-50/70 hover:bg-slate-50/80 transition-colors ${p.status === 'Nonaktif' ? 'bg-slate-100 opacity-60' : ''}`}>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setViewingProductTx(p)}
                              className="hover:underline font-mono font-bold text-primary text-sm hover:text-primary-hover transition-all text-left whitespace-nowrap"
                              title="Klik untuk rincian transaksi"
                            >
                              {p.sku}
                            </button>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col items-start gap-1">
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${p.kategori === 'Barang Jadi' ? 'bg-success/15 text-success-hover' : p.kategori === 'Bahan Baku' ? 'bg-info/15 text-info-hover' : 'bg-purple-100 text-purple-700'}`}>
                                {p.kategori}
                              </span>
                              {p.subKat && <span className="text-[11px] text-slate-500 font-medium whitespace-nowrap">{p.subKat}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setViewingProductTx(p)}
                              className="hover:underline font-bold text-slate-800 hover:text-primary transition-all text-left font-sans text-sm line-clamp-2 leading-snug"
                              title="Klik untuk rincian transaksi"
                            >
                              {p.nama}
                            </button>
                          </td>
                          <td className="px-4 py-3.5 text-center text-slate-600 font-medium whitespace-nowrap">
                            {p.satuan}
                          </td>
                          <td className="px-4 py-3.5 font-bold text-primary text-right whitespace-nowrap tabular-nums">
                            {p.hj > 0 ? `Rp ${(p.hj || 0).toLocaleString('id-ID')}` : '-'}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-700 whitespace-nowrap tabular-nums">
                            Rp {(p.hpp || 0).toLocaleString('id-ID')}
                          </td>
                          <td className="px-4 py-3.5 text-right whitespace-nowrap">
                            <div className="flex flex-col items-end gap-1">
                              <div className="flex flex-col items-end gap-0.5">
                                <span className={`font-bold font-mono text-sm ${p.stok < p.safety ? 'text-danger' : 'text-slate-800'}`}>
                                  {p.stok}
                                </span>
                                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Min: {p.safety}</span>
                              </div>
                              {getOnOrderQty(p.sku) > 0 && (
                                <span className="bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-[4px] text-[9px] font-black uppercase">
                                  Dlm Pesanan: +{getOnOrderQty(p.sku)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
                              <MapPin size={14} className="text-primary/70" />
                              <span className="font-medium">{p.tempatSimpan}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <div className="flex justify-center items-center gap-2">
                              <button
                                onClick={() => setViewingProductTx(p)}
                                title="Rincian Transaksi"
                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-all"
                              >
                                <Eye size={16} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => {
                                  let extPrefix = p.prefix;
                                  if (!extPrefix && p.sku) {
                                    const parts = p.sku.split('-');
                                    if (parts.length > 1) extPrefix = parts[0];
                                    else extPrefix = p.sku.substring(0, 3); // Fallback guess
                                  }
                                  setProductForm({ ...p, prefix: extPrefix, originalSku: p.sku });
                                  setIsEditingProduct(true);
                                  setShowProductModal(true);
                                }}
                                title="Edit Produk"
                                className="p-1.5 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-md transition-all"
                              >
                                <Edit3 size={16} strokeWidth={2.5} />
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.sku)}
                                title="Hapus"
                                className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-md transition-all"
                              >
                                <Trash2 size={16} strokeWidth={2.5} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>




                </div>
              </div>

              {/* ponytail: tombol ekspor dipindah ke footer bawah terpisah dari header utama */}
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 mt-4 bg-slate-50 border-t border-slate-200 rounded-b-xl print:hidden">
                <div className="text-sm font-medium text-slate-600">
                  Ekspor Daftar Barang &amp; Status Restock (4 Kolom):
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const headers = ['SKU / Detail Produk', 'Sisa Stok Fisik', 'Limit (Safety)', 'Keterangan Status'];
                      const rows = filteredProducts.map(p => {
                        const stokTerkini = p.stok;
                        let sts = "Aman";
                        if (stokTerkini <= 0) sts = "Habis";
                        else if (stokTerkini <= (p.safety || 0)) sts = "Kritis (Butuh PO)";
                        return [
                          `${p.sku}\n${p.nama}`,
                          stokTerkini.toString(),
                          (p.safety || 0).toString(),
                          sts
                        ];
                      });
                      generateReportPDF(
                        'LAPORAN STATUS & KELAYAKAN STOK GUDANG',
                        'Daftar Barang & Status Restock',
                        new Date().toLocaleDateString('id-ID'),
                        headers,
                        rows,
                        [],
                        `Status_Stok_${new Date().toISOString().slice(0, 10)}.pdf`,
                        'portrait'
                      );
                    }}
                    className="border border-slate-300 text-slate-700 hover:bg-slate-100 px-4 py-2 rounded-card flex items-center gap-2 font-bold text-sm transition-all shadow-sm cursor-pointer"
                  >
                    <Printer size={16} />
                    <span>Cetak / Simpan PDF</span>
                  </button>
                  <button
                    onClick={() => {
                      // ponytail: fix runtime error pada handler ekspor master inventori
                      if (filteredProducts.length === 0) {
                        triggerToast('Tidak ada data produk untuk diekspor', 'warning');
                        return;
                      }

                      const wsData: any[][] = [
                        ['LAPORAN STATUS & KELAYAKAN STOK GUDANG'],
                        ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
                        [''],
                        ['SKU / KODE BARANG', 'NAMA PRODUK & KATEGORI', 'STOK FISIK (ON-HAND)', 'STATUS STOK / AKSI']
                      ];

                      let totalAman = 0;
                      let totalRestock = 0;

                      filteredProducts.forEach(p => {
                        const isAman = p.stok >= p.safety;
                        if (isAman) totalAman++;
                        else totalRestock++;

                        wsData.push([
                          p.sku,
                          `${p.nama} (${p.kategori})`,
                          `${p.stok} ${p.satuan}`,
                          isAman ? 'AMAN' : 'PERLU RESTOCK'
                        ]);
                      });

                      wsData.push(['']);
                      wsData.push(['RINGKASAN STATUS']);
                      wsData.push(['TOTAL JENIS BARANG (SKU)', filteredProducts.length.toString()]);
                      wsData.push(['STOK AMAN', totalAman.toString()]);
                      wsData.push(['PERLU RESTOCK', totalRestock.toString()]);

                      // @ts-ignore
                      if (XLSX) {
                        // @ts-ignore
                        const ws = XLSX.utils.aoa_to_sheet(wsData);
                        ws['!cols'] = [
                          { wch: 20 },
                          { wch: 45 },
                          { wch: 25 },
                          { wch: 20 }
                        ];
                        // @ts-ignore
                        const wb = XLSX.utils.book_new();
                        // @ts-ignore
                        XLSX.utils.book_append_sheet(wb, ws, "Status Stok");
                        // @ts-ignore
                        XLSX.writeFile(wb, `Laporan_Status_Stok_${new Date().toISOString().slice(0, 10)}.xlsx`);
                        triggerToast('Laporan stok berhasil diunduh.', 'success');
                      } else {
                        triggerToast('Library Excel tidak ditemukan!', 'error');
                      }
                    }}
                    className="border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700 px-4 py-2 rounded-card flex items-center gap-2 font-bold text-sm transition-all shadow-sm cursor-pointer"
                  >
                    <Download size={16} />
                    <span>Unduh Excel (.xlsx)</span>
                  </button>
                </div>
              </div>


              {/* ponytail: print-only table untuk cetak PDF Master Inventori 4 kolom */}
              <div className="hidden print:block w-full bg-white text-black p-8">
                <div className="text-center pb-4 border-b-2 border-slate-800 mb-6">
                  <h1 className="text-2xl font-black uppercase tracking-wider">Laporan Status & Kelayakan Stok Gudang</h1>
                  <p className="text-sm font-medium mt-1">
                    Tanggal Cetak: {new Date().toLocaleDateString('id-ID')} &bull; Dicetak oleh Sistem
                  </p>
                </div>

                <table className="w-full text-left text-sm border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-400">
                      <th className="p-3 font-bold border-r border-slate-300">SKU / KODE BARANG</th>
                      <th className="p-3 font-bold border-r border-slate-300">NAMA PRODUK & KATEGORI</th>
                      <th className="p-3 font-bold border-r border-slate-300">STOK FISIK (ON-HAND)</th>
                      <th className="p-3 font-bold text-center">STATUS STOK / AKSI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center italic">Tidak ada data</td>
                      </tr>
                    ) : (
                      filteredProducts.map((p, idx) => {
                        const isAman = p.stok >= p.safety;
                        return (
                          <tr key={idx} className="border-b border-slate-200">
                            <td className="p-3 font-mono text-xs border-r border-slate-300">{p.sku}</td>
                            <td className="p-3 border-r border-slate-300">
                              <div className="font-bold">{p.nama}</div>
                              <div className="text-xs text-slate-500">{p.kategori} &bull; {p.subKat}</div>
                            </td>
                            <td className="p-3 border-r border-slate-300 font-bold">
                              {p.stok} {p.satuan}
                            </td>
                            <td className="p-3 text-center">
                              {isAman ? (
                                <span className="font-bold text-slate-700">AMAN</span>
                              ) : (
                                <span className="font-black text-red-600 underline">PERLU RESTOCK</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>

                <div className="mt-8 pt-4 border-t border-slate-300 flex justify-end">
                  <div className="w-64 space-y-2 text-sm font-medium">
                    <div className="font-bold border-b border-slate-300 pb-1 mb-2">RINGKASAN STATUS</div>
                    <div className="flex justify-between">
                      <span>TOTAL JENIS BARANG (SKU):</span>
                      <span>{filteredProducts.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>STOK AMAN:</span>
                      <span>{filteredProducts.filter(p => p.stok >= p.safety).length}</span>
                    </div>
                    <div className="flex justify-between font-bold">
                      <span>PERLU RESTOCK:</span>
                      <span className="text-red-600">{filteredProducts.filter(p => p.stok < p.safety).length}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Master Config Modal */}
              {showMasterConfigModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[90vh] relative my-auto">
                    <div className="bg-slate-800 text-white py-4 px-6 flex justify-between items-center shrink-0">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <Settings size={18} className="text-teal-400" />
                        <span>Pengaturan Master Kategori &amp; Satuan</span>
                      </h3>
                      <button onClick={() => setShowMasterConfigModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">&times;</button>

                    </div>
                    <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Kategori Utama */}
                        <div className="bg-white border border-border rounded-card p-4 shadow-sm">
                          <div className="flex justify-between items-center border-b pb-2 mb-3">
                            <h4 className="text-sm font-black text-primary uppercase">📦 Kategori Utama</h4>
                            <button
                              type="button"
                              onClick={() => setSettingCategories([...settingCategories, ''])}
                              className="text-[11px] font-extrabold text-primary hover:underline cursor-pointer"
                            >
                              + Tambah Opsi
                            </button>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {settingCategories.map((cat, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={cat}
                                  onChange={(e) => {
                                    const arr = [...settingCategories];
                                    arr[idx] = e.target.value;
                                    setSettingCategories(arr);
                                  }}
                                  className="flex-1 p-2 border border-border rounded-card text-sm font-semibold text-primary bg-white"
                                  placeholder="Nama kategori..."
                                />
                                <button
                                  type="button"
                                  onClick={() => setSettingCategories(settingCategories.filter((_, i) => i !== idx))}
                                  className="p-2 text-danger hover:bg-danger/10 rounded-card cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}

                          </div>
                        </div>
                        {/* Prefix SKU */}
                        <div className="bg-white border border-border rounded-card p-4 shadow-sm">
                          <div className="flex justify-between items-center border-b pb-2 mb-3">
                            <h4 className="text-sm font-black text-primary uppercase">🏷️ Prefix SKU</h4>
                            <button
                              type="button"
                              onClick={() => setSettingPrefixes([...settingPrefixes, { label: '', prefix: '' }])}
                              className="text-[11px] font-extrabold text-primary hover:underline cursor-pointer"
                            >
                              + Tambah Prefix
                            </button>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {settingPrefixes.map((pfx, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={pfx.label}
                                  onChange={(e) => {
                                    const arr = [...settingPrefixes];
                                    arr[idx] = { ...pfx, label: e.target.value };
                                    setSettingPrefixes(arr);
                                  }}
                                  className="flex-1 p-2 border border-border rounded-card text-sm font-semibold text-primary bg-white"
                                  placeholder="Kategori..."
                                />
                                <input
                                  type="text"
                                  value={pfx.prefix}
                                  onChange={(e) => {
                                    const arr = [...settingPrefixes];
                                    arr[idx] = { ...pfx, prefix: e.target.value.toUpperCase() };
                                    setSettingPrefixes(arr);
                                  }}
                                  className="w-16 p-2 border border-border rounded-card text-sm font-bold font-mono text-center bg-white"
                                  placeholder="PRX"
                                />
                                <button
                                  type="button"
                                  onClick={() => setSettingPrefixes(settingPrefixes.filter((_, i) => i !== idx))}
                                  className="p-2 text-danger hover:bg-danger/10 rounded-card cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}

                          </div>
                        </div>
                        {/* Satuan Dasar */}
                        <div className="bg-white border border-border rounded-card p-4 shadow-sm">
                          <div className="flex justify-between items-center border-b pb-2 mb-3">
                            <h4 className="text-sm font-black text-primary uppercase">📐 Satuan Dasar</h4>
                            <button
                              type="button"
                              onClick={() => setSettingUnits([...settingUnits, ''])}
                              className="text-[11px] font-extrabold text-primary hover:underline cursor-pointer"
                            >
                              + Tambah Opsi
                            </button>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {settingUnits.map((ut, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={ut}
                                  onChange={(e) => {
                                    const arr = [...settingUnits];
                                    arr[idx] = e.target.value;
                                    setSettingUnits(arr);
                                  }}
                                  className="flex-1 p-2 border border-border rounded-card text-sm font-semibold text-primary bg-white"
                                  placeholder="Satuan..."
                                />
                                <button
                                  type="button"
                                  onClick={() => setSettingUnits(settingUnits.filter((_, i) => i !== idx))}
                                  className="p-2 text-danger hover:bg-danger/10 rounded-card cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}

                          </div>
                        </div>
                        {/* Akun Kas & Bank */}
                        <div className="bg-white border border-border rounded-card p-4 shadow-sm">
                          <div className="flex justify-between items-center border-b pb-2 mb-3">
                            <h4 className="text-sm font-black text-primary uppercase">💳 Akun Kas & Bank</h4>
                            <button
                              type="button"
                              onClick={() => setSettingCashAccounts([...settingCashAccounts, { nomor: '', nama: '', jenis: 'Kas', fungsi: 'General' }])}
                              className="text-[11px] font-extrabold text-primary hover:underline cursor-pointer"
                            >
                              + Tambah Opsi
                            </button>
                          </div>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                            {settingCashAccounts.map((acc, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={acc.nomor}
                                  onChange={(e) => {
                                    const arr = [...settingCashAccounts];
                                    arr[idx] = { ...arr[idx], nomor: e.target.value };
                                    setSettingCashAccounts(arr);
                                  }}
                                  className="w-1/3 p-2 border border-border rounded-card text-sm font-semibold text-primary bg-white"
                                  placeholder="No. Akun (Opsional)"
                                />
                                <input
                                  type="text"
                                  value={acc.nama}
                                  onChange={(e) => {
                                    const arr = [...settingCashAccounts];
                                    arr[idx] = { ...arr[idx], nama: e.target.value };
                                    setSettingCashAccounts(arr);
                                  }}
                                  className="flex-1 p-2 border border-border rounded-card text-sm font-semibold text-primary bg-white"
                                  placeholder="Nama Akun Kas/Bank..."
                                />
                                <button
                                  type="button"
                                  onClick={() => setSettingCashAccounts(settingCashAccounts.filter((_, i) => i !== idx))}
                                  className="p-2 text-danger hover:bg-danger/10 rounded-card cursor-pointer"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white p-4 border-t border-border shrink-0 text-right">
                      <button
                        onClick={() => {
                          setShowMasterConfigModal(false);
                          triggerToast('Pengaturan master berhasil disimpan ke penyimpanan lokal.', 'success');
                        }}
                        className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-card text-sm font-bold shadow-sm cursor-pointer"
                      >
                        Selesai &amp; Tutup
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STOCK OPNAME MODAL */}
              {showOpnameModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-xl max-w-5xl w-full flex flex-col relative my-auto">
                    <div className="flex justify-between items-center p-5 border-b border-border bg-text-primary text-white rounded-t-xl">
                      <h3 className="font-bold text-lg">Stock Opname & Penyesuaian</h3>
                      <button onClick={() => setShowOpnameModal(false)} className="text-slate-400 hover:text-white transition-colors">
                        <X size={20} />
                      </button>

                    </div>
                    {/* Header: Selected Product Info */}
                    {(() => {
                      const selectedProd = products.find(p => p.sku === opnameForm.sku);
                      if (!selectedProd) return null;
                      return (
                        <div className="bg-sky-50 border-b border-sky-100 p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-sky-700 uppercase">Qty Tersedia (Stok Sistem)</span>
                            <span className="text-xl font-bold font-mono text-text-primary">{selectedProd.stok} {selectedProd.satuan}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-sky-700 uppercase">Harga per Unit (HPP)</span>
                            <span className="text-xl font-bold font-mono text-text-primary">Rp {selectedProd.hpp?.toLocaleString('id-ID')}</span>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[11px] font-bold text-sky-700 uppercase">Total Nilai Valuasi</span>
                            <span className="text-xl font-bold font-mono text-warning">Rp {(selectedProd.stok * (selectedProd.hpp || 0)).toLocaleString('id-ID')}</span>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="p-6 overflow-y-auto max-h-[70vh]">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Form Input Opname */}
                        <div className="space-y-6">
                          <div>
                            <h3 className="text-base font-bold text-text-primary">Input Penyesuaian Stok</h3>
                            <p className="text-sm text-text-secondary">Sesuaikan selisih kuantitas fisik dengan data sistem</p>

                          </div>
                          <form onSubmit={handleStockOpnameSubmit} className="space-y-4 text-sm font-semibold">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-bold text-text-secondary uppercase">Pilih SKU / Produk Target</label>
                              <SearchableSelect
                                value={opnameForm.sku}
                                onChange={(val) => {
                                  const target = products.find((p: any) => p.sku === val);
                                  setOpnameForm({
                                    ...opnameForm,
                                    sku: val,
                                    qtySistem: target ? target.stok : 0,
                                    qtyFisik: target ? target.stok : 0,
                                    selisih: 0
                                  });
                                }}
                                options={products.map((p: any) => ({ label: `[${p.sku}] ${p.nama} (Stok: ${p.stok})`, value: p.sku }))}
                                placeholder="-- Pilih SKU Produk --"
                              />

                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-bold text-text-secondary uppercase">Tipe Penyesuaian</label>
                              <select
                                value={opnameForm.tipe}
                                onChange={(e) => setOpnameForm({ ...opnameForm, tipe: e.target.value })}
                                className="p-2.5 border border-border rounded-card bg-white"
                              >
                                <option value="OPNAME_PLUS">OPNAME PLUS (Stok Fisik Lebih Banyak)</option>
                                <option value="OPNAME_MINUS">OPNAME MINUS (Stok Fisik Lebih Sedikit)</option>
                                <option value="WASTAGE">WASTAGE (Barang Rusak / Dibuang)</option>
                              </select>

                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5 bg-gray-50 p-3 rounded-card border border-border">
                                <span className="text-[11px] font-bold text-text-secondary uppercase">Selisih Stok</span>
                                <input
                                  type="text" inputMode="decimal"
                                  value={opnameForm.selisih}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setOpnameForm({
                                      ...opnameForm,
                                      selisih: val,
                                      qtyFisik: val === '' || val === '-' ? opnameForm.qtySistem : opnameForm.qtySistem + (parseFloat(val) || 0)
                                    });
                                  }}
                                  className="text-xl font-bold font-mono text-primary bg-transparent outline-none border-b border-primary border-opacity-50"
                                />
                              </div>
                              <div className="flex flex-col gap-1.5 bg-green-50 p-3 rounded-card border border-success border-opacity-30">
                                <span className="text-[11px] font-bold text-green-800 uppercase">Stok Aktual (Fisik)</span>
                                <input
                                  type="text" inputMode="decimal"
                                  value={opnameForm.qtyFisik}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setOpnameForm({
                                      ...opnameForm,
                                      qtyFisik: val,
                                      selisih: val === '' || val === '-' ? -opnameForm.qtySistem : (parseFloat(val) || 0) - opnameForm.qtySistem
                                    });
                                  }}
                                  className="text-xl font-bold font-mono text-primary bg-transparent outline-none border-b border-primary border-opacity-50"
                                />

                              </div>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-[11px] font-bold text-text-secondary uppercase">Catatan / Alasan Audit</label>
                              <textarea
                                value={opnameForm.catatan}
                                onChange={(e) => setOpnameForm({ ...opnameForm, catatan: e.target.value })}
                                placeholder="Cth: Roti kempes, salah hitung..."
                                className="border p-2.5 rounded-card h-20 resize-none text-sm font-normal"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={!opnameForm.sku}
                              className={`w-full py-3 rounded-card font-bold shadow text-sm transition-all ${!opnameForm.sku ? 'bg-slate-300 text-secondary cursor-not-allowed' : 'bg-primary hover:bg-primary-hover text-white cursor-pointer'
                                }`}
                            >
                              Lanjutkan Rekonsiliasi
                            </button>

                          </form>

                        </div>
                      </div>
                      {/* Log Penyesuaian Audit Trail */}
                      <div className="lg:col-span-2 space-y-4">
                        <div>
                          <h3 className="text-base font-bold text-text-primary">Audit Trail Log Stock Opname</h3>
                          <p className="text-sm text-text-secondary">Riwayat penyesuaian inventori kronologis untuk validasi akuntan</p>
                        </div>
                        <div className="overflow-x-auto border border-border rounded-card shadow-sm">
                          <table className="w-full text-sm text-left">
                            <thead>
                              <tr className="bg-gray-100 text-secondary font-bold uppercase tracking-wider">
                                <th className="py-3 px-4">Tanggal</th>
                                <th className="py-3 px-4">SKU</th>
                                <th className="py-3 px-4 text-center">Tipe</th>
                                <th className="py-3 px-4 text-center">Selisih</th>
                                <th className="py-3 px-4">Catatan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {opnameLog.slice(0, 10).map((log, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                  <td className="py-3.5 px-4 font-mono">{log.tanggal}</td>
                                  <td className="py-3.5 px-4 font-mono text-primary font-bold">{log.sku}</td>
                                  <td className="py-3.5 px-4 text-center">
                                    <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-bold ${log.tipe === 'OPNAME_PLUS' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
                                      }`}>
                                      {log.tipe}
                                    </span>
                                  </td>
                                  <td className="py-3.5 px-4 text-center font-bold font-mono">{log.selisih} {log.satuan}</td>
                                  <td className="py-3.5 px-4 text-sm italic text-slate-400 max-w-[150px] truncate">{log.catatan}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>

                  </div></div>

              )}

              {/* STOCK OPNAME CONFIRMATION MODAL */}
              {showOpnameConfirm && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-2xl max-w-md w-full overflow-hidden flex flex-col relative my-auto">
                    <div className="p-6 space-y-4">
                      <div className="flex items-center gap-3 text-warning">
                        <AlertTriangle size={24} />
                        <h3 className="font-bold text-lg text-text-primary">Konfirmasi Rekonsiliasi Stok</h3>

                      </div>
                      <p className="text-sm text-secondary">
                        Anda akan melakukan penyesuaian stok untuk produk <strong>{products.find(p => p.sku === opnameForm.sku)?.nama}</strong>. Periksa ringkasan di bawah ini sebelum menyimpan:
                      </p>

                      <div className="bg-slate-50 p-4 rounded-card border border-border text-sm space-y-2 font-mono">
                        <div className="flex justify-between">
                          <span className="text-secondary">Tipe:</span>
                          <span className={`font-bold ${opnameForm.tipe === 'OPNAME_PLUS' ? 'text-success' : 'text-danger'}`}>{opnameForm.tipe}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary">Stok Sistem:</span>
                          <span className="font-bold">{opnameForm.qtySistem}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-secondary">Selisih Stok:</span>
                          <span className={`font-bold ${(parseFloat(opnameForm.selisih as string) || 0) < 0 ? 'text-danger' : 'text-success'}`}>
                            {(parseFloat(opnameForm.selisih as string) || 0) > 0 ? '+' : ''}{opnameForm.selisih}
                          </span>
                        </div>
                        <div className="border-t border-border my-1 pt-1 flex justify-between">
                          <span className="text-secondary font-bold">Stok Aktual (Final):</span>
                          <span className="font-bold text-sky-700">{opnameForm.qtyFisik}</span>
                        </div>
                        <div className="flex justify-between mt-2 pt-2 border-t border-border">
                          <span className="text-secondary">Nilai Penyesuaian:</span>
                          <span className={`font-bold ${(parseFloat(opnameForm.selisih as string) || 0) < 0 ? 'text-danger' : 'text-success'}`}>
                            Rp {((parseFloat(opnameForm.selisih as string) || 0) * (products.find(p => p.sku === opnameForm.sku)?.hpp || 0)).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="flex flex-col mt-2 pt-2 border-t border-border">
                          <span className="text-secondary mb-1">Catatan / Alasan:</span>
                          <span className="font-bold text-primary whitespace-pre-wrap leading-relaxed">{opnameForm.catatan || '-'}</span>

                        </div>
                      </div>
                      <div className="bg-sky-50 border border-sky-100 p-3 rounded-card flex gap-2">
                        <span className="text-base">💡</span>
                        <span className="text-sm text-sky-800">Tindakan ini akan tercatat dalam Audit Trail Log secara permanen untuk keperluan pelaporan akuntansi.</span>

                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t border-border">
                      <button
                        onClick={() => setShowOpnameConfirm(false)}
                        className="p-4 text-center text-sm font-bold text-secondary hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        onClick={handleStockOpnameConfirmAction}
                        className="p-4 text-center text-sm font-bold text-white bg-primary hover:bg-primary-hover transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Check size={16} /> Konfirmasi & Simpan
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Product Form Modal */}
              {/* Product Form Modal */}
              {showProductModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-xl max-w-lg w-full overflow-hidden relative my-auto">
                    <div className="bg-text-primary text-white py-4 px-6 flex justify-between items-center">
                      <h3 className="font-bold text-base flex items-center gap-2">
                        <Package size={18} className="text-primary" />
                        <span>{isEditingProduct ? `Edit SKU [${productForm.sku}]` : 'Daftarkan Master Produk Baru'}</span>
                      </h3>
                      <button onClick={() => setShowProductModal(false)} className="text-white hover:text-slate-400">&times;</button>
                    </div>
                    <form onSubmit={handleSaveProduct} className="p-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {(() => {
                          const hasTransactions = isEditingProduct && productForm.originalSku ? checkProductHasTransactions(productForm.originalSku) : false;
                          const currentPrefix = productForm.prefix || (settingPrefixes.length > 0 ? settingPrefixes[0].prefix : 'RTL');
                          let currentNum = productForm.sku || '';
                          if (currentNum.startsWith(currentPrefix + '-')) currentNum = currentNum.substring(currentPrefix.length + 1);
                          else if (currentNum.startsWith(currentPrefix)) currentNum = currentNum.substring(currentPrefix.length);

                          return (
                            <>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-secondary uppercase flex justify-between">
                                  <span>Prefix SKU</span>
                                  {hasTransactions && <span className="text-[11px] text-danger font-bold">*Terkunci (Ada Transaksi)</span>}
                                </label>
                                <select
                                  value={currentPrefix}
                                  disabled={hasTransactions}
                                  onChange={(e) => {
                                    const newPrefix = e.target.value;
                                    setProductForm({ ...productForm, prefix: newPrefix, sku: `${newPrefix}-${currentNum}` });
                                  }}
                                  className={`border border-border p-2.5 rounded-card text-sm ${hasTransactions ? 'bg-gray-100 cursor-not-allowed text-secondary' : 'bg-white'}`}
                                >
                                  {settingPrefixes.map((pfx: any, idx: number) => (
                                    <option key={idx} value={pfx.prefix}>{pfx.prefix} ({pfx.label})</option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label className="text-sm font-bold text-secondary uppercase flex justify-between">
                                  <span>Nomor SKU</span>
                                </label>
                                <div className="flex relative items-center">
                                  <span className="absolute left-3 text-slate-400 font-mono text-sm font-bold">{currentPrefix}-</span>
                                  <input
                                    type="text"
                                    value={currentNum}
                                    onChange={(e) => setProductForm({ ...productForm, sku: `${currentPrefix}-${e.target.value.toUpperCase()}` })}
                                    disabled={hasTransactions}
                                    className={`w-full pl-14 border border-border p-2.5 rounded-card text-sm font-mono font-bold ${hasTransactions ? 'text-secondary bg-gray-100 cursor-not-allowed' : 'text-primary bg-white'}`}
                                    placeholder="0001"
                                  />
                                </div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Kategori Utama</label>
                          <SearchableSelect
                            value={productForm.kategori}
                            onChange={(newCat) => {
                              if (!isEditingProduct) {
                                const currentPrefix = productForm.prefix || 'RTL';
                                const recommendedSku = generateNewSku(currentPrefix, products);
                                setProductForm({ ...productForm, kategori: newCat, sku: recommendedSku });
                              } else {
                                setProductForm({ ...productForm, kategori: newCat });
                              }
                            }}
                            options={[
                              { label: 'Barang Jadi', value: 'Barang Jadi' },
                              { label: 'Bahan Baku', value: 'Bahan Baku' },
                              { label: 'Kemasan', value: 'Kemasan' },
                              ...settingCategories.filter(cat => !['Barang Jadi', 'Bahan Baku', 'Kemasan'].includes(cat)).map(cat => ({ label: cat, value: cat }))
                            ]}
                            allowCustom={true}
                            placeholder="Pilih/Ketik Kategori"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Sub-Kategori</label>
                          <SearchableSelect
                            value={productForm.subKat}
                            onChange={(val) => setProductForm({ ...productForm, subKat: val })}
                            options={Array.from(new Set(products.map((p: any) => p.subKat).filter(Boolean))).map((s: any) => ({ label: s, value: s }))}
                            allowCustom={true}
                            placeholder="Contoh: Roti Manis"
                          />

                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-sm font-bold text-secondary uppercase">Nama Lengkap Produk</label>
                        <input
                          type="text"
                          value={productForm.nama}
                          onChange={(e) => setProductForm({ ...productForm, nama: e.target.value })}
                          placeholder="Cth: Croissant Mentega Klasik"
                          className="border border-border p-2.5 rounded-card text-sm"
                        />

                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Satuan</label>
                          <SearchableSelect
                            value={productForm.satuan}
                            onChange={(val) => setProductForm({ ...productForm, satuan: val })}
                            options={settingUnits.map((u: string) => ({ label: u, value: u }))}
                            allowCustom={true}
                            placeholder="Pilih/Ketik Satuan"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Harga Jual (Rp)</label>
                          <input
                            type="number" min="0"
                            value={productForm.hj}
                            onChange={(e) => setProductForm({ ...productForm, hj: parseInt(e.target.value) || 0 })}
                            className="border border-border p-2.5 rounded-card text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">HPP Awal (Rp)</label>
                          <input
                            type="number" min="0"
                            value={productForm.hpp}
                            onChange={(e) => setProductForm({ ...productForm, hpp: parseInt(e.target.value) || 0 })}
                            className="border border-border p-2.5 rounded-card text-sm"
                          />

                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Batas Safety Stock</label>
                          <input
                            type="text" inputMode="numeric"
                            value={formatRibuan(productForm.safety)}
                            onChange={(e) => setProductForm({ ...productForm, safety: parseRibuan(e.target.value) || 10 })}
                            className="border border-border p-2.5 rounded-card text-sm"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-sm font-bold text-secondary uppercase">Tempat Penyimpanan</label>
                          <SearchableSelect
                            value={productForm.tempatSimpan}
                            onChange={(val) => setProductForm({ ...productForm, tempatSimpan: val })}
                            options={Array.from(new Set(products.map((p: any) => p.tempatSimpan).filter(Boolean))).map((s: any) => ({ label: s, value: s }))}
                            allowCustom={true}
                            placeholder="Cth: Rak A, Gudang B"
                          />

                        </div>
                      </div>
                      {!isEditingProduct && (
                        <div className="flex flex-col gap-1.5 bg-green-50 border border-success p-4 rounded-card">
                          <span className="text-sm font-bold text-green-800 uppercase">Qty Saldo Awal (Opsional)</span>
                          <div className="grid grid-cols-2 gap-3 mt-1">
                            <input
                              type="number" min="0"
                              value={productForm.stok}
                              onChange={(e) => setProductForm({ ...productForm, stok: parseInt(e.target.value) || 0 })}
                              placeholder="Kuantitas Awal"
                              className="border border-green-200 p-2.5 rounded-card text-sm bg-white"
                            />
                            <p className="text-[11px] text-green-800 leading-relaxed">
                              *Jika diisi, sistem otomatis menyuntik mutasi MASUK sebagai saldo awal di log gudang.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-end gap-3 pt-4 border-t border-border">
                        <button
                          type="button"
                          onClick={() => setShowProductModal(false)}
                          className="px-4 py-2.5 text-sm font-semibold border border-border hover:bg-gray-100 rounded-card"
                        >
                          Batal
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingProduct}
                          className={`px-5 py-2.5 text-sm font-semibold text-white rounded-card shadow ${isSavingProduct ? 'bg-primary/70 cursor-not-allowed flex items-center justify-center gap-2' : 'bg-primary hover:bg-primary-hover'}`}
                        >
                          {isSavingProduct ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Menyimpan...</span>
                            </>
                          ) : (
                            isEditingProduct ? 'Simpan Perubahan' : 'Daftarkan Master'
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>

              )}

            </div>
          )}

          {/* TAB 3: PURCHASE ORDER (PO) TRACKER */}
          {activeTab === 'purchase_order' && (
            <PurchaseOrderTab
              products={products}
              suppliers={suppliers}
              settingPlatforms={settingPlatforms}
              setSettingPlatforms={setSettingPlatforms}
              showPoPlatformModal={showPoPlatformModal}
              setShowPoPlatformModal={setShowPoPlatformModal}
              showPoForm={showPoForm}
              setShowPoForm={setShowPoForm}
              isEditingPo={isEditingPo}
              setIsEditingPo={setIsEditingPo}
              poForm={poForm}
              setPoForm={setPoForm}
              searchPoQuery={searchPoQuery}
              setSearchPoQuery={setSearchPoQuery}
              filteredPOs={filteredPOs}
              setSelectedPo={setSelectedPo}
              setPoActionForm={setPoActionForm}
              handleVoidPO={handleVoidPO}
              handleReturPO={handleReturPO}
              handlePoItemChange={handlePoItemChange}
              handleRemovePoItem={handleRemovePoItem}
              handleAddPoItem={handleAddPoItem}
              handleSavePO={handleSavePO}
              isSavingPO={isSavingPO}
            />
          )}

          {/* TAB 4: SALES ORDER (SO) TRACKER */}
          {activeTab === 'sales_order' && (
            <SalesOrderTab
              showSoForm={showSoForm}
              setShowSoForm={setShowSoForm}
              searchSoQuery={searchSoQuery}
              setSearchSoQuery={setSearchSoQuery}
              soForm={soForm}
              setSoForm={setSoForm}
              isEditingSo={isEditingSo}
              setIsEditingSo={setIsEditingSo}
              filteredSOs={filteredSOs}
              setSelectedSo={setSelectedSo}
              setSoActionForm={setSoActionForm}
              customers={customers}
              products={products}
              handleSoItemChange={handleSoItemChange}
              handleRemoveSoItem={handleRemoveSoItem}
              handleAddSoItem={handleAddSoItem}
              handleSaveSalesOrder={handleSaveSalesOrder}
              handleVoidSO={handleVoidSO}
              handleReturSO={handleReturSO}
              isSavingSO={isSavingSO}
            />
          )}

          {/* ponytail: pertahankan fitur ekspor 2 level pada modul Kartu Pelanggan & Supplier */}
          {/* TAB: CUSTOMER */}
          {/* TAB: BUKU BESAR KAS */}
          {activeTab === 'buku_besar_kas' && (
            <CashLedgerTab
              selectedCashAccount={selectedCashAccount}
              bukuBesarActiveAkun={bukuBesarActiveAkun}
              settingCashAccounts={settingCashAccounts}
              cashLedger={cashLedger}
              cashLedgerView={cashLedgerView}
              setNewCashAccountForm={setNewCashAccountForm}
              setIsAddCashAccountOpen={setIsAddCashAccountOpen}
              setSelectedCashAccount={setSelectedCashAccount}
              setCashLedgerView={setCashLedgerView}
              setEditingAccountName={setEditingAccountName}
              setSettingCashAccounts={setSettingCashAccounts}
              handleDeleteManualCash={handleDeleteManualCash}
            />
          )}
          {activeTab === 'pelanggan' && (
            <div className="space-y-4 relative pb-20 print-container" id="rekap-pelanggan-section">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #rekap-pelanggan-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
                }
              `}} />
              <div className="flex justify-between items-center no-print">
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Database Pelanggan (Customer B2B)</h2>
                  <p className="text-sm text-text-secondary">Kelola alamat kirim, data kontak, dan monitoring saldo piutang aktif</p>
                </div>
                <button
                  onClick={() => {
                    setCustomerForm({ id: '', nama: '', kontak: '', email: '', telp: '', alamat: '', piutang: 0 });
                    setIsEditingCustomer(false);
                    setShowCustomerModal(true);
                  }}
                  className="bg-primary text-white px-3 py-2 text-sm font-bold rounded-card flex items-center gap-1.5 shadow"
                >
                  <Plus size={14} />
                  <span>Daftar Pelanggan Baru</span>
                </button>
              </div>
              <div className="bg-white border border-border rounded-card shadow-sm overflow-hidden print:hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-primary text-white text-sm font-black uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">ID Customer</th>
                      <th className="py-3 px-4">Nama Instansi</th>
                      <th className="py-3 px-4">Kontak PIC</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Telepon</th>
                      <th className="py-3 px-4">Alamat Kirim</th>
                      <th className="py-3 px-4 text-right">Saldo Piutang</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {customers.map(c => (
                      <tr key={c.id} className="hover:bg-gray-50 text-sm">
                        <td className="py-3 px-4 font-mono font-bold">
                          <button
                            onClick={() => setViewingCustomerTx(c)}
                            className="hover:underline font-mono font-bold text-primary hover:text-primary-hover transition-all text-left"
                            title="Klik untuk rincian transaksi"
                          >
                            {c.id}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-bold text-text-primary">
                          <button
                            onClick={() => setViewingCustomerTx(c)}
                            className="hover:underline font-bold text-text-primary hover:text-primary transition-all text-left"
                            title="Klik untuk rincian transaksi"
                          >
                            {c.nama}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-medium">{c.kontak}</td>
                        <td>{c.email}</td>
                        <td>{c.telp}</td>
                        <td className="py-3 px-4 max-w-[200px] truncate">{c.alamat}</td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-primary">Rp {c.piutang.toLocaleString('id-ID')}</td>
                        <td className="text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              onClick={() => setViewingCustomerTx(c)}
                              title="Rincian Transaksi"
                              className="text-secondary hover:text-primary p-1"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setCustomerForm(c);
                                setIsEditingCustomer(true);
                                setShowCustomerModal(true);
                              }}
                              title="Edit Data"
                              className="text-secondary hover:text-primary p-1"
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ponytail: ekspor global daftar relasi & saldo hutang/piutang di footer bawah tabel utama */}
              <div className="sticky bottom-0 z-30 flex items-center justify-end gap-3 p-3 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg print:hidden rounded-b-xl mt-4">
                <button
                  onClick={() => {
                    const headers = ['ID CUSTOMER', 'NAMA INSTANSI', 'KONTAK PIC', 'EMAIL', 'TELEPON', 'ALAMAT', 'SALDO PIUTANG'];
                    let totalPiutang = 0;
                    const rows = customers.map(c => {
                      totalPiutang += c.piutang;
                      return [c.id, c.nama, c.kontak, c.email, c.telp, c.alamat, `Rp ${c.piutang.toLocaleString('id-ID')}`];
                    });
                    const summaryRows = [
                      ['', '', '', '', '', 'TOTAL PIUTANG', `Rp ${totalPiutang.toLocaleString('id-ID')}`]
                    ];
                    generateReportPDF(
                      'REKAPITULASI PELANGGAN & BUKU BESAR',
                      'Daftar Relasi Pelanggan B2B',
                      new Date().toLocaleDateString('id-ID'),
                      headers,
                      rows,
                      summaryRows,
                      `Rekap_Pelanggan_${new Date().toISOString().slice(0, 10)}.pdf`,
                      'landscape'
                    );
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Download Rekap & Buku Besar (PDF)</span>
                </button>
                <button
                  onClick={() => {
                    const wsData: any[][] = [
                      ['REKAPITULASI PELANGGAN & BUKU BESAR'],
                      ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
                      [''],
                      ['ID CUSTOMER', 'NAMA INSTANSI', 'KONTAK PIC', 'EMAIL', 'TELEPON', 'ALAMAT', 'SALDO PIUTANG']
                    ];
                    let totalPiutang = 0;
                    customers.forEach(c => {
                      totalPiutang += c.piutang;
                      wsData.push([c.id, c.nama, c.kontak, c.email, c.telp, c.alamat, c.piutang]);
                    });
                    wsData.push(['']);
                    wsData.push(['', '', '', '', '', 'TOTAL PIUTANG', totalPiutang]);

                    if (typeof XLSX !== 'undefined') {
                      const ws = XLSX.utils.aoa_to_sheet(wsData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Rekap Pelanggan");
                      XLSX.writeFile(wb, `Rekap_Pelanggan_${new Date().toISOString().slice(0, 10)}.xlsx`);
                    } else {
                      triggerToast('Library Excel tidak ditemukan', 'error');
                    }
                  }}
                  className="px-4 py-2 bg-success hover:bg-success/90 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  <span>Unduh Rekap & Buku Besar (.xlsx)</span>
                </button>
              </div>

              {/* Print Only Section for Customers */}
              <div className="hidden print:block text-black p-8">
                <div className="text-center pb-4 border-b-2 border-slate-800 mb-6">
                  <h1 className="text-2xl font-black uppercase tracking-wider">REKAPITULASI PELANGGAN & BUKU BESAR PIUTANG</h1>
                  <p className="text-sm font-medium mt-1">Tanggal Cetak: {new Date().toLocaleDateString('id-ID')}</p>
                </div>
                <table className="w-full text-left text-sm border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-400">
                      <th className="p-3 font-bold border-r border-slate-300">ID / NAMA</th>
                      <th className="p-3 font-bold border-r border-slate-300">KONTAK</th>
                      <th className="p-3 font-bold text-right">PIUTANG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, idx) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="p-3 border-r border-slate-300">
                          <div className="font-bold">{c.nama}</div>
                          <div className="text-xs font-mono">{c.id}</div>
                        </td>
                        <td className="p-3 border-r border-slate-300 text-xs">
                          {c.kontak} • {c.telp}
                        </td>
                        <td className="p-3 text-right font-bold font-mono">Rp {c.piutang.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-400">
                      <td colSpan={2} className="p-3 text-right">TOTAL PIUTANG DAGANG</td>
                      <td className="p-3 text-right font-mono text-base">Rp {customers.reduce((sum, c) => sum + c.piutang, 0).toLocaleString('id-ID')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SUPPLIER */}
          {activeTab === 'supplier' && (
            <div className="space-y-4 relative pb-20 print-container" id="rekap-supplier-section">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #rekap-supplier-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
                }
              `}} />
              <div className="flex justify-between items-center no-print">
                <div>
                  <h2 className="text-xl font-bold text-text-primary">Database Supplier & Vendor</h2>
                  <p className="text-sm text-text-secondary">Kelola data vendor tepung, gula, mentega, kemasan, beserta tagihan/hutang aktif</p>
                </div>
                <button
                  onClick={() => {
                    setSupplierForm({ id: '', nama: '', kontak: '', email: '', telp: '', alamat: '', hutang: 0 });
                    setIsEditingSupplier(false);
                    setShowSupplierModal(true);
                  }}
                  className="bg-primary text-white px-3 py-2 text-sm font-bold rounded-card flex items-center gap-1.5 shadow"
                >
                  <Plus size={14} />
                  <span>Daftar Supplier Baru</span>
                </button>
              </div>
              <div className="bg-white border border-border rounded-card shadow-sm overflow-hidden print:hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-primary text-white text-sm font-black uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">ID Supplier</th>
                      <th className="py-3 px-4">Nama Vendor</th>
                      <th className="py-3 px-4">Kontak PIC</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Telepon</th>
                      <th className="py-3 px-4">Kategori / Notes</th>
                      <th className="py-3 px-4 text-right">Saldo Hutang</th>
                      <th className="py-3 px-4 text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {suppliers.map(s => (
                      <tr key={s.id} className="hover:bg-gray-50 text-sm">
                        <td className="py-3 px-4 font-mono font-bold">
                          <button
                            onClick={() => setViewingSupplierTx(s)}
                            className="hover:underline font-mono font-bold text-primary hover:text-primary-hover transition-all text-left"
                            title="Klik untuk rincian transaksi"
                          >
                            {s.id}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-bold text-text-primary">
                          <button
                            onClick={() => setViewingSupplierTx(s)}
                            className="hover:underline font-bold text-text-primary hover:text-primary transition-all text-left"
                            title="Klik untuk rincian transaksi"
                          >
                            {s.nama}
                          </button>
                        </td>
                        <td className="py-3 px-4 font-medium">{s.kontak}</td>
                        <td>{s.email}</td>
                        <td>{s.telp}</td>
                        <td className="py-3 px-4 max-w-[200px] truncate text-xs text-secondary">{s.alamat}</td>
                        <td className="py-3 px-4 text-right font-bold font-mono text-danger">Rp {s.hutang.toLocaleString('id-ID')}</td>
                        <td className="text-center">
                          <div className="flex justify-center items-center gap-1.5">
                            <button
                              onClick={() => setViewingSupplierTx(s)}
                              title="Rincian Transaksi"
                              className="text-secondary hover:text-primary p-1"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              onClick={() => {
                                setSupplierForm(s);
                                setIsEditingSupplier(true);
                                setShowSupplierModal(true);
                              }}
                              title="Edit Data"
                              className="text-secondary hover:text-primary p-1"
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ponytail: ekspor global daftar relasi & saldo hutang/piutang di footer bawah tabel utama */}
              <div className="sticky bottom-0 z-30 flex items-center justify-end gap-3 p-3 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg print:hidden rounded-b-xl mt-4">
                <button
                  onClick={() => {
                    const headers = ['ID SUPPLIER', 'NAMA VENDOR', 'KONTAK PIC', 'EMAIL', 'TELEPON', 'KATEGORI / NOTES', 'SALDO HUTANG'];
                    let totalHutang = 0;
                    const rows = suppliers.map(s => {
                      totalHutang += s.hutang;
                      return [s.id, s.nama, s.kontak, s.email, s.telp, s.alamat, `Rp ${s.hutang.toLocaleString('id-ID')}`];
                    });
                    const summaryRows = [
                      ['', '', '', '', '', 'TOTAL HUTANG', `Rp ${totalHutang.toLocaleString('id-ID')}`]
                    ];
                    generateReportPDF(
                      'REKAPITULASI SUPPLIER & BUKU BESAR',
                      'Daftar Relasi Vendor',
                      new Date().toLocaleDateString('id-ID'),
                      headers,
                      rows,
                      summaryRows,
                      `Rekap_Supplier_${new Date().toISOString().slice(0, 10)}.pdf`,
                      'landscape'
                    );
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer size={14} />
                  <span>Download Rekap & Buku Besar (PDF)</span>
                </button>
                <button
                  onClick={() => {
                    const wsData: any[][] = [
                      ['REKAPITULASI SUPPLIER & BUKU BESAR'],
                      ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
                      [''],
                      ['ID SUPPLIER', 'NAMA VENDOR', 'KONTAK PIC', 'EMAIL', 'TELEPON', 'KATEGORI / NOTES', 'SALDO HUTANG']
                    ];
                    let totalHutang = 0;
                    suppliers.forEach(s => {
                      totalHutang += s.hutang;
                      wsData.push([s.id, s.nama, s.kontak, s.email, s.telp, s.alamat, s.hutang]);
                    });
                    wsData.push(['']);
                    wsData.push(['', '', '', '', '', 'TOTAL HUTANG', totalHutang]);

                    if (typeof XLSX !== 'undefined') {
                      const ws = XLSX.utils.aoa_to_sheet(wsData);
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, "Rekap Supplier");
                      XLSX.writeFile(wb, `Rekap_Supplier_${new Date().toISOString().slice(0, 10)}.xlsx`);
                    } else {
                      triggerToast('Library Excel tidak ditemukan', 'error');
                    }
                  }}
                  className="px-4 py-2 bg-success hover:bg-success/90 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <FileSpreadsheet size={14} />
                  <span>Unduh Rekap & Buku Besar (.xlsx)</span>
                </button>
              </div>

              {/* Print Only Section for Suppliers */}
              <div className="hidden print:block text-black p-8">
                <div className="text-center pb-4 border-b-2 border-slate-800 mb-6">
                  <h1 className="text-2xl font-black uppercase tracking-wider">REKAPITULASI SUPPLIER & BUKU BESAR HUTANG</h1>
                  <p className="text-sm font-medium mt-1">Tanggal Cetak: {new Date().toLocaleDateString('id-ID')}</p>
                </div>
                <table className="w-full text-left text-sm border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b-2 border-slate-400">
                      <th className="p-3 font-bold border-r border-slate-300">ID / NAMA</th>
                      <th className="p-3 font-bold border-r border-slate-300">KONTAK</th>
                      <th className="p-3 font-bold text-right">HUTANG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map((s, idx) => (
                      <tr key={idx} className="border-b border-slate-200">
                        <td className="p-3 border-r border-slate-300">
                          <div className="font-bold">{s.nama}</div>
                          <div className="text-xs font-mono">{s.id}</div>
                        </td>
                        <td className="p-3 border-r border-slate-300 text-xs">
                          {s.kontak} • {s.telp}
                        </td>
                        <td className="p-3 text-right font-bold font-mono text-danger">Rp {s.hutang.toLocaleString('id-ID')}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-50 font-bold border-t-2 border-slate-400">
                      <td colSpan={2} className="p-3 text-right">TOTAL HUTANG DAGANG</td>
                      <td className="p-3 text-right font-mono text-base">Rp {suppliers.reduce((sum, s) => sum + s.hutang, 0).toLocaleString('id-ID')}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Form Modals */}
          {(activeTab === 'pelanggan' || activeTab === 'supplier' || activeTab === 'sales_order' || activeTab === 'purchase_order') && (
            <>
              {/* Form Input Modal Customer */}
              {showCustomerModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] relative my-auto">
                    <div className="bg-primary text-white py-4 px-6 flex justify-between items-center shrink-0">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Users size={20} />
                        <span>{isEditingCustomer ? 'Edit Data Pelanggan' : 'Daftar Pelanggan Baru'}</span>
                      </h3>
                      <button onClick={() => setShowCustomerModal(false)} className="text-teal-100 hover:text-white transition-colors cursor-pointer">&times;</button>
                    </div>
                    <form onSubmit={handleSaveCustomer} className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">ID CUSTOMER (AUTO)</label>
                          <input type="text" value={customerForm.id} disabled className="border p-2.5 rounded-card bg-gray-100 font-mono font-bold text-secondary" placeholder="Otomatis..." />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">NAMA INSTANSI / TOKO <span className="text-danger">*</span></label>
                          <input type="text" value={customerForm.nama} onChange={(e) => setCustomerForm({ ...customerForm, nama: e.target.value })} required className="border p-2.5 rounded-card font-semibold" placeholder="Contoh: PT. Maju Jaya" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">NAMA PIC KONTAK <span className="text-danger">*</span></label>
                          <input type="text" value={customerForm.kontak} onChange={(e) => setCustomerForm({ ...customerForm, kontak: e.target.value })} required className="border p-2.5 rounded-card" placeholder="Nama..." />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">TELEPON / WA</label>
                          <input type="text" value={customerForm.telp} onChange={(e) => setCustomerForm({ ...customerForm, telp: e.target.value })} className="border p-2.5 rounded-card" placeholder="0812..." />
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-secondary">EMAIL</label>
                        <input type="email" value={customerForm.email} onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })} className="border p-2.5 rounded-card" placeholder="email@contoh.com" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-secondary">ALAMAT KIRIM / TAGIHAN</label>
                        <textarea value={customerForm.alamat} onChange={(e) => setCustomerForm({ ...customerForm, alamat: e.target.value })} className="border p-2.5 rounded-card h-16 resize-none" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-secondary">SALDO AWAL PIUTANG (Rp)</label>
                        <input type="number" value={customerForm.piutang || ''} onChange={(e) => setCustomerForm({ ...customerForm, piutang: parseInt(e.target.value) || 0 })} disabled={isEditingCustomer} className={`border p-2.5 rounded-card font-mono ${isEditingCustomer ? 'bg-gray-100 text-secondary cursor-not-allowed' : 'font-bold'}`} placeholder="0" />
                        {isEditingCustomer && <span className="text-[10px] text-warning font-semibold">Piutang hanya bisa disesuaikan lewat dokumen transaksi.</span>}
                      </div>
                      <div className="flex justify-end gap-2 border-t pt-4">
                        <button type="button" onClick={() => setShowCustomerModal(false)} className="px-4 py-2 border rounded-card">Batal</button>
                        <button type="submit" className="px-5 py-2 bg-primary text-white rounded-card font-bold">Simpan</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
              {/* Form Input Modal Supplier */}
              {showSupplierModal && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-white rounded-card shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] relative my-auto">
                    <div className="bg-slate-800 text-white py-4 px-6 flex justify-between items-center shrink-0">
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        <Building2 size={20} className="text-teal-400" />
                        <span>{isEditingSupplier ? 'Edit Data Supplier' : 'Daftar Supplier Baru'}</span>
                      </h3>
                      <button onClick={() => setShowSupplierModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">&times;</button>
                    </div>
                    <form onSubmit={handleSaveSupplier} className="p-6 overflow-y-auto space-y-4 flex-1 bg-slate-50">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">ID SUPPLIER (AUTO)</label>
                          <input type="text" value={supplierForm.id} disabled className="border p-2.5 rounded-card bg-gray-100 font-mono font-bold text-secondary" placeholder="Otomatis..." />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">NAMA VENDOR <span className="text-danger">*</span></label>
                          <input type="text" value={supplierForm.nama} onChange={(e) => setSupplierForm({ ...supplierForm, nama: e.target.value })} required className="border p-2.5 rounded-card font-semibold" placeholder="PT. Pemasok Hebat" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">PIC KONTAK <span className="text-danger">*</span></label>
                          <input type="text" value={supplierForm.kontak} onChange={(e) => setSupplierForm({ ...supplierForm, kontak: e.target.value })} required className="border p-2.5 rounded-card" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">TELEPON / WA</label>
                          <input type="text" value={supplierForm.telp} onChange={(e) => setSupplierForm({ ...supplierForm, telp: e.target.value })} className="border p-2.5 rounded-card" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">EMAIL</label>
                          <input type="email" value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} className="border p-2.5 rounded-card" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-text-secondary">SALDO AWAL HUTANG (Rp)</label>
                          <input type="number" value={supplierForm.hutang || ''} onChange={(e) => setSupplierForm({ ...supplierForm, hutang: parseInt(e.target.value) || 0 })} disabled={isEditingSupplier} className={`border p-2.5 rounded-card font-mono ${isEditingSupplier ? 'bg-gray-100 text-secondary cursor-not-allowed' : 'font-bold'}`} placeholder="0" />
                          {isEditingSupplier && <span className="text-[9px] text-warning font-semibold">Ubah hutang via transaksi PO.</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-text-secondary">ALAMAT KANTOR / GUDANG</label>
                        <textarea value={supplierForm.alamat} onChange={(e) => setSupplierForm({ ...supplierForm, alamat: e.target.value })} className="border p-2.5 rounded-card h-16 resize-none font-semibold" />
                      </div>
                      <div className="flex justify-end gap-2 border-t pt-4">
                        <button type="button" onClick={() => setShowSupplierModal(false)} className="px-4 py-2 border rounded-card">Batal</button>
                        <button type="submit" className="px-5 py-2 bg-primary text-white rounded-card font-bold">Simpan</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
          {/* TAB: SUMMARY STOK */}
          {/* 4. SUMMARY STOK BULANAN */}
          {/* 4. SUMMARY STOK BULANAN */}
          {activeTab === 'summary_stok' && (() => {
            const availableMonths = AVAILABLE_MONTHS;
            const quartersDef = QUARTERS_DEF;

            // Filter products based on search term, SKU selection, and Qty = 0 filter
            const filteredLedger = ledgerData.filter(item => {
              const matchesSearch = item.sku.toLowerCase().includes(debouncedStokSearchTerm.toLowerCase()) ||
                item.nama.toLowerCase().includes(debouncedStokSearchTerm.toLowerCase());

              const matchesSelectedSku = stokSelectedSkus.length === 0 || stokSelectedSkus.includes(item.sku);

              const matchesHideZero = !stokHideZeroQty || item.endingQty > 0;

              return matchesSearch && matchesSelectedSku && matchesHideZero;
            });

            const toggleMonth = (m: string) => {
              if (selectedStokMonths.includes(m)) {
                if (selectedStokMonths.length === 1) {
                  triggerToast('Minimal harus memunculkan satu bulan!', 'warning');
                  return;
                }
                setSelectedStokMonths(selectedStokMonths.filter(x => x !== m));
              } else {
                setSelectedStokMonths([...selectedStokMonths, m].sort((a, b) => {
                  const idxA = availableMonths.findIndex(x => x.id === a);
                  const idxB = availableMonths.findIndex(x => x.id === b);
                  return idxA - idxB;
                }));
              }
            };

            // Excel exporter function supporting dynamic active periods and config options
            // ponytail: Ekspor ke excel menggunakan library xlsx yang sudah terpasang, menyusun array-of-arrays baris per baris secara linear.
            const handleExportToExcel = () => {
              const aoa: any[][] = [];
              aoa.push(["LAPORAN MUTASI PERSERDIAAN BARANG (STOCK MOVEMENT LEDGER)"]);
              aoa.push([`Nama Entitas: ${namaToko}`]);
              aoa.push([`Periode Laporan: ${stokViewMode.toUpperCase()} (${analitikStartDate} s/d ${analitikEndDate})`]);
              aoa.push([`Metode Penilaian: Weighted Average Costing`]);
              aoa.push([]); // blank spacing

              const hasUnitPrice = stokShowUnitPrice;
              const hasAmount = stokShowAmount;
              const subColCount = 1 + (hasUnitPrice ? 1 : 0) + (hasAmount ? 1 : 0);

              const headerRow1: string[] = ["Detail Produk", "", "", "Saldo Awal"];
              if (hasAmount) {
                headerRow1.push("");
              }

              const headerRow2: string[] = ["SKU", "Nama Produk", "Satuan", "Qty Awal"];
              if (hasAmount) {
                headerRow2.push("Nilai Awal (Rp)");
              }

              const merges: any[] = [
                { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
                { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
                { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
                { s: { r: 3, c: 0 }, e: { r: 3, c: 3 } },
                { s: { r: 5, c: 0 }, e: { r: 5, c: 2 } },
              ];

              if (hasAmount) {
                merges.push({ s: { r: 5, c: 3 }, e: { r: 5, c: 4 } });
              }

              let currentCol = hasAmount ? 5 : 4;

              activePeriods.forEach(p => {
                headerRow1.push(p.label, ...Array(subColCount * 3 - 1).fill(""));
                merges.push({ s: { r: 5, c: currentCol }, e: { r: 5, c: currentCol + (subColCount * 3 - 1) } });

                // Sub-columns for Masuk
                headerRow2.push("Masuk Qty");
                if (hasUnitPrice) headerRow2.push("Masuk Harga (Rp)");
                if (hasAmount) headerRow2.push("Masuk Nilai (Rp)");

                // Sub-columns for Keluar
                headerRow2.push("Keluar Qty");
                if (hasUnitPrice) headerRow2.push("Keluar Harga (Rp)");
                if (hasAmount) headerRow2.push("Keluar Nilai (Rp)");

                // Sub-columns for Sisa
                headerRow2.push("Sisa Qty");
                if (hasUnitPrice) headerRow2.push("Sisa Harga (Rp)");
                if (hasAmount) headerRow2.push("Sisa Nilai (Rp)");

                currentCol += subColCount * 3;
              });

              aoa.push(headerRow1);
              aoa.push(headerRow2);

              filteredLedger.forEach(item => {
                const row: any[] = [
                  item.sku,
                  item.nama,
                  item.satuan,
                  item.initialQty
                ];
                if (hasAmount) {
                  row.push(item.initialAmount);
                }

                item.periods.forEach((pData: any) => {
                  // Masuk
                  row.push(pData.stockInQty);
                  if (hasUnitPrice) row.push(pData.stockInPrice);
                  if (hasAmount) row.push(pData.stockInAmount);

                  // Keluar
                  row.push(pData.stockOutQty);
                  if (hasUnitPrice) row.push(pData.stockOutPrice);
                  if (hasAmount) row.push(pData.stockOutAmount);

                  // Sisa
                  row.push(pData.endingQty);
                  if (hasUnitPrice) row.push(pData.endingPrice);
                  if (hasAmount) row.push(pData.endingAmount);
                });

                aoa.push(row);
              });

              const ws = XLSX.utils.aoa_to_sheet(aoa);
              ws['!merges'] = merges;
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "Mutasi Stok");
              XLSX.writeFile(wb, `Laporan_Mutasi_Stok_${stokViewMode}_${namaToko}.xlsx`);
              triggerToast("Laporan berhasil diunduh dalam file Excel (.xlsx)!", "success");
            };

            return (
              <div className="space-y-6 print-container" id="mutasi-stok-section">
                {/* CSS Injector for pristine paper-printing layout */}
                <style dangerouslySetInnerHTML={{
                  __html: `
                      @media print {
                        body {
                          background: white !important;
                          color: black !important;
                        }
                        /* Hide everything that is not the report */
                        header, footer, nav, aside, .no-print, button, input[type="checkbox"], select {
                          display: none !important;
                        }
                        #mutasi-stok-section {
                          display: block !important;
                          width: 100% !important;
                          margin: 0 !important;
                          padding: 0 !important;
                          box-shadow: none !important;
                          border: none !important;
                        }
                        .print-table-wrapper {
                          overflow: visible !important;
                          max-height: none !important;
                        }
                        .print-table {
                          width: 100% !important;
                          border-collapse: collapse !important;
                        }
                        .print-table th, .print-table td {
                          border: 1px solid #1e293b !important;
                          padding: 3px 4px !important;
                          font-size: 8px !important;
                          font-family: monospace !important;
                        }
                        @page {
                          size: A3 landscape;
                          margin: 0.8cm;
                        }
                      }
                    `}} />

                {/* PRINT ONLY CORPORATE HEADER (MEETS PSAK / IFRS STANDARDS) */}
                <div className="hidden print:block text-center space-y-1 pb-4 border-b-2 border-border mb-6">
                  <h2 className="text-xl font-black uppercase text-primary tracking-tight">{namaToko || 'INO ERP'}</h2>
                  <h3 className="text-sm font-extrabold text-primary tracking-wide uppercase">LAPORAN MUTASI PERSEDIAAN BARANG</h3>
                  <p className="text-sm text-secondary font-bold tracking-widest">METODE BIAYA RATA-RATA TERTIMBANG (WEIGHTED AVERAGE METHOD)</p>
                  <p className="text-[11px] font-mono text-secondary font-bold">
                    {stokViewMode === 'daily' && `Periode Laporan Harian: ${analitikStartDate} s/d ${analitikEndDate}`}
                    {stokViewMode === 'three_days' && `Periode Laporan 3 Harian: ${analitikStartDate} s/d ${analitikEndDate}`}
                    {stokViewMode === 'weekly' && `Periode Laporan Mingguan: ${analitikStartDate} s/d ${analitikEndDate}`}
                    {stokViewMode === 'monthly' && `Tahun Buku ${new Date().getFullYear()} - Periode Bulanan SAK-EMKM`}
                    {stokViewMode === 'quarterly' && `Tahun Buku ${new Date().getFullYear()} - Periode Kuartalan`}
                    {stokViewMode === 'annual' && `Tahun Buku ${new Date().getFullYear()} - Konsolidasi Akhir Tahun`}
                  </p>
                  <p className="text-[11px] text-slate-400 font-bold italic">Sesuai Standar Akuntansi Keuangan SAK-EMKM / PSAK 14 / IAS 2 (Inventories)</p>

                </div>
                {/* CONTROL DASHBOARD (HIDDEN ON PRINT) */}
                <div className="bg-white border border-border p-5 rounded-2xl shadow-xs space-y-4 no-print" id="stok-control-panel">
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse"></span>
                        <h4 className="text-sm font-black uppercase text-primary tracking-wider">Kustomisasi Laporan Mutasi Stok</h4>
                      </div>
                      <p className="text-sm text-slate-400 mt-1">Saring produk, pilih rentang waktu dari harian sampai tahunan, dan atur visibilitas biaya.</p>

                    </div>
                  </div>
                  {/* ponytail: pisahkan dari-sampai tanggal ke kolom eksklusif & tata filter 6-kolom grid seimbang */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200 items-end mt-4">

                    {/* 1. Jangka Waktu & Interval */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">Periode</label>
                      <div className="flex gap-1">
                        <select value={stokViewMode} onChange={e => setStokViewMode(e.target.value as any)} className="w-full text-sm font-medium text-secondary p-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-primary">
                          <option value="daily">Harian</option>
                          <option value="three_days">3 Hari</option>
                          <option value="weekly">Mingguan</option>
                          <option value="monthly">Bulanan</option>
                          <option value="quarterly">Kuartal</option>
                          <option value="annual">Tahunan</option>
                        </select>
                        {stokViewMode === 'monthly' && (
                          <select className="w-full text-sm font-medium text-secondary p-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-primary" onChange={(e) => {
                            // Just dummy for visual simplicity as requested
                          }}>
                            <option value="1">1 Bln</option>
                            <option value="3">3 Bln</option>
                            <option value="6">6 Bln</option>
                            <option value="12">12 Bln</option>
                          </select>
                        )}
                      </div>
                    </div>

                    {/* 2. Dari Tanggal */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">Dari Tanggal</label>
                      <input type="date" value={analitikStartDate} onChange={e => setAnalitikStartDate(e.target.value)} className="w-full text-sm font-medium text-secondary p-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-primary" />
                    </div>

                    {/* 3. Sampai Tanggal */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">Sampai Tanggal</label>
                      <input type="date" value={analitikEndDate} onChange={e => setAnalitikEndDate(e.target.value)} className="w-full text-sm font-medium text-secondary p-1.5 bg-white border border-slate-300 rounded-lg outline-none focus:ring-1 focus:ring-primary" />
                    </div>

                    {/* 4. Filter SKU */}
                    <div className="flex flex-col gap-1 relative group">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">Filter Barang</label>
                      <details className="relative group w-full">
                        <summary className="list-none cursor-pointer w-full text-sm font-medium text-secondary p-1.5 border border-slate-300 rounded-lg bg-white flex justify-between items-center outline-none focus:ring-1 focus:ring-primary">
                          <span className="truncate">Pilih Barang (SKU)</span> <ChevronDown size={14} className="text-slate-400 shrink-0" />
                        </summary>
                        <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-border shadow-xl p-3 rounded-card z-50 flex flex-col gap-2">
                          {products.map(p => (
                            <label key={p.sku} className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer hover:bg-slate-50 p-1 rounded">
                              <input type="checkbox" checked={stokSelectedSkus.includes(p.sku)} onChange={(e) => {
                                if (e.target.checked) setStokSelectedSkus([...stokSelectedSkus, p.sku]);
                                else setStokSelectedSkus(stokSelectedSkus.filter(s => s !== p.sku));
                              }} className="text-primary focus:ring-primary rounded border-slate-300" />
                              <span className="truncate">{p.nama} ({p.sku})</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>

                    {/* 5. Filter Supplier */}
                    <div className="flex flex-col gap-1 relative group">
                      <label className="text-[11px] font-bold text-slate-500 uppercase">Filter Supplier</label>
                      <details className="relative group w-full">
                        <summary className="list-none cursor-pointer w-full text-sm font-medium text-secondary p-1.5 border border-slate-300 rounded-lg bg-white flex justify-between items-center outline-none focus:ring-1 focus:ring-primary">
                          <span className="truncate">Pilih Supplier</span> <ChevronDown size={14} className="text-slate-400 shrink-0" />
                        </summary>
                        <div className="absolute top-full left-0 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-border shadow-xl p-3 rounded-card z-50 flex flex-col gap-2">
                          {suppliers.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer hover:bg-slate-50 p-1 rounded">
                              <input type="checkbox" className="text-primary focus:ring-primary rounded border-slate-300" />
                              <span className="truncate">{s.nama}</span>
                            </label>
                          ))}
                        </div>
                      </details>
                    </div>

                    {/* 6. Opsi & Reset */}
                    <div className="flex items-center gap-2">
                      <details className="relative group flex-1">
                        <summary className="list-none cursor-pointer w-full text-sm font-medium text-secondary p-1.5 border border-slate-300 rounded-lg bg-white flex justify-between items-center outline-none focus:ring-1 focus:ring-primary">
                          <span className="truncate">Opsi Tampilan</span> <ChevronDown size={14} className="text-slate-400 shrink-0" />
                        </summary>
                        <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-border shadow-xl p-3 rounded-card z-50 flex flex-col gap-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer">
                            <input type="checkbox" checked={stokShowFinancial} onChange={e => {
                              setStokShowFinancial(e.target.checked);
                              if (!e.target.checked) {
                                setStokShowUnitPrice(false);
                                setStokShowAmount(false);
                              }
                            }} className="text-primary focus:ring-primary rounded border-slate-300" />
                            Tampilkan Finansial
                          </label>
                          <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer pl-4">
                            <input type="checkbox" disabled={!stokShowFinancial} checked={stokShowUnitPrice} onChange={e => setStokShowUnitPrice(e.target.checked)} className="text-primary focus:ring-primary rounded border-slate-300 disabled:opacity-50" />
                            Harga Satuan (Unit Price)
                          </label>
                          <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer pl-4">
                            <input type="checkbox" disabled={!stokShowFinancial} checked={stokShowAmount} onChange={e => setStokShowAmount(e.target.checked)} className="text-primary focus:ring-primary rounded border-slate-300 disabled:opacity-50" />
                            Total Nilai (Amount)
                          </label>
                          <div className="border-t border-slate-100 my-1"></div>
                          <label className="flex items-center gap-2 text-sm font-medium text-secondary cursor-pointer">
                            <input type="checkbox" checked={stokHideZeroQty} onChange={e => setStokHideZeroQty(e.target.checked)} className="text-primary focus:ring-primary rounded border-slate-300" />
                            Sembunyikan Stok Akhir = 0
                          </label>
                        </div>
                      </details>
                      <button onClick={() => {
                        setStokViewMode('monthly');
                        setStokSelectedSkus([]);
                        setStokHideZeroQty(false);
                        setStokShowFinancial(true);
                        setStokShowUnitPrice(false);
                        setStokShowAmount(true);
                      }} title="Reset Filter" className="text-slate-500 hover:text-danger p-1.5 border border-slate-300 rounded-lg bg-white hover:bg-slate-50 transition-colors shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                      </button>
                    </div>
                  </div>
                </div>
                {/* ponytail: hapus banner & badge klaim PSAK/IFRS yang tidak diperlukan */}

                {/* MASSIVE SPREADSHEET LEDGER GRID */}
                <div className="bg-white border border-border rounded-2xl shadow-xs overflow-hidden" id="stok-matrix-grid">
                  <div className="p-4 bg-slate-50 border-b border-border flex justify-between items-center no-print">
                    <div className="flex items-center gap-2">
                      <FileSpreadsheet className="text-primary" size={16} />
                      <h4 className="text-sm font-black text-primary uppercase tracking-wider">
                        Buku Pembantu Mutasi Persediaan Barang (Buku Besar Stok - Mode: {stokViewMode.toUpperCase()})
                      </h4>
                    </div>
                    <span className="text-xs font-mono font-black bg-success/10 text-primary px-2.5 py-0.5 rounded border border-success/30 uppercase tracking-wider">
                    </span>

                  </div>
                  {/* Wide table with Sticky horizontal positioning */}
                  <div className="overflow-x-auto max-w-full print-table-wrapper max-h-[600px]">
                    <table className="w-full text-left text-sm border-collapse print-table divide-y divide-slate-200">
                      <thead>
                        {/* LEVEL 1 HEADER: MAJOR CATEGORIES */}
                        <tr className="bg-slate-100 text-primary uppercase tracking-widest text-xs font-black border-b border-border divide-x divide-slate-200">
                          <th colSpan={3} className="px-3 py-2 text-center bg-slate-100 text-primary sticky left-0 z-30 min-w-[356px]">
                            Spesifikasi Produk
                          </th>
                          {/* ponytail: fix css table layout & overflow pada kolom saldo awal agar tidak hancur */}
                          <th colSpan={stokShowFinancial && stokShowAmount ? 2 : 1} className="px-3 py-2 text-center bg-slate-100 text-primary sticky left-[356px] z-30 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)] min-w-[96px] whitespace-nowrap">
                            Saldo Awal Periode
                          </th>

                          {/* ponytail: kembalikan matriks mutasi stok murni (Masuk, Keluar, Saldo Qty) per periode */}
                          {activePeriods.map(p => {
                            return (
                              <th key={p.id} colSpan={3} className="px-3 py-2 text-center bg-primary text-white border-b-2 border-teal-600 whitespace-nowrap">
                                {p.label}
                              </th>
                            );
                          })}
                        </tr>
                        {/* LEVEL 2 HEADER: COLUMN DESCRIPTIONS */}
                        <tr className="bg-slate-100 text-primary uppercase tracking-wider text-xs font-black border-b border-border divide-x divide-slate-200">
                          <th className="px-2.5 py-2 text-center sticky left-0 bg-slate-100 z-20 w-20 min-w-[80px] whitespace-nowrap">SKU</th>
                          <th className="px-2.5 py-2 sticky left-[80px] bg-slate-100 z-20 min-w-[180px] whitespace-nowrap">Nama Produk</th>
                          <th className="px-2.5 py-2 text-center sticky left-[260px] bg-slate-100 z-20 w-24 min-w-[96px] whitespace-nowrap">Satuan</th>

                          {/* Saldo Awal (Sticky) */}
                          <th className={`px-2.5 py-2 text-right text-secondary bg-slate-100 z-20 sticky left-[356px] w-24 min-w-[96px] whitespace-nowrap ${!(stokShowFinancial && stokShowAmount) ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)]' : ''}`}>Qty Awal</th>
                          {stokShowFinancial && stokShowAmount && <th className="px-2.5 py-2 text-right text-secondary bg-slate-100 z-20 sticky left-[452px] shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)] w-28 min-w-[112px] whitespace-nowrap">Nilai Awal (Rp)</th>}

                          {/* Repeating Columns Per Period Block - Only 3 cols now! */}
                          {activePeriods.map(p => {
                            return (
                              <React.Fragment key={p.id}>
                                <th className="px-2.5 py-2 text-right text-success bg-success/10 font-black w-20 min-w-[80px] whitespace-nowrap">Masuk (+)</th>
                                <th className="px-2.5 py-2 text-right text-danger bg-danger/10 font-black w-20 min-w-[80px] whitespace-nowrap">Keluar (-)</th>
                                <th className="px-2.5 py-2 text-right text-primary bg-slate-100 font-black w-20 min-w-[80px] whitespace-nowrap">Saldo Qty</th>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      </thead>
                      {/* BODY ROWS */}
                      <tbody className="divide-y divide-slate-200 text-slate-800 text-sm font-medium">
                        {filteredLedger.map((item: any) => {
                          return (
                            <tr key={item.sku} className="hover:bg-slate-50 group divide-x divide-slate-100">
                              {/* STICKY LEFT COLUMNS */}
                              <td className="px-2.5 py-2 text-center font-mono font-bold sticky left-0 bg-white group-hover:bg-slate-50 z-10 w-20 min-w-[80px] whitespace-nowrap">{item.sku}</td>
                              <td className="px-2.5 py-2 font-bold sticky left-[80px] bg-white group-hover:bg-slate-50 z-10 min-w-[180px] whitespace-nowrap truncate max-w-[200px]">{item.nama}</td>
                              <td className="px-2.5 py-2 text-center text-slate-500 font-bold sticky left-[260px] bg-white group-hover:bg-slate-50 z-10 w-24 min-w-[96px] whitespace-nowrap">{item.satuan}</td>
                              {/* Saldo Awal */}
                              <td className={`px-2.5 py-2 text-right font-mono text-slate-600 bg-white group-hover:bg-slate-50 sticky left-[356px] z-10 w-24 min-w-[96px] whitespace-nowrap ${!(stokShowFinancial && stokShowAmount) ? 'shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)]' : ''}`}>{item.initialQty}</td>
                              {stokShowFinancial && stokShowAmount && (
                                <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800 bg-slate-50 group-hover:bg-slate-100 sticky left-[452px] shadow-[4px_0_10px_-4px_rgba(0,0,0,0.1)] z-10 w-28 min-w-[112px] whitespace-nowrap">
                                  Rp {Math.round(item.initialAmount).toLocaleString('id-ID')}
                                </td>
                              )}
                              {/* PERIODS DISPLAY */}
                              {item.periods.map((pData: any, idx: number) => {
                                return (
                                  <React.Fragment key={`${item.sku}_p_${idx}`}>
                                    {/* Stock In */}
                                    <td className={`px-2.5 py-2 text-right font-mono w-20 min-w-[80px] whitespace-nowrap ${pData.stockInQty > 0 ? 'text-success bg-success/10 font-bold' : 'text-slate-300'}`}>
                                      {pData.stockInQty > 0 ? `+${pData.stockInQty}` : '0'}
                                    </td>

                                    {/* Stock Out */}
                                    <td className={`px-2.5 py-2 text-right font-mono w-20 min-w-[80px] whitespace-nowrap ${pData.stockOutQty > 0 ? 'text-danger bg-danger/10 font-bold' : 'text-slate-300'}`}>
                                      {pData.stockOutQty > 0 ? `-${pData.stockOutQty}` : '0'}
                                    </td>

                                    {/* Stock On Hand (Ending) */}
                                    <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-800 bg-slate-100/50 w-20 min-w-[80px] whitespace-nowrap">
                                      {pData.endingQty}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* ponytail: sticky bottom footer untuk tombol ekspor PDF & Excel di bawah tabel tanpa scroll */}
                  <div className="sticky bottom-0 z-30 flex items-center justify-end gap-3 p-3 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-lg">
                    <button
                      onClick={() => {
                        const hasUnitPrice = stokShowUnitPrice;
                        const hasAmount = stokShowAmount;

                        const headers: string[] = ["Detail Produk", "Kategori", "Satuan", "Saldo Awal"];
                        if (hasAmount) {
                          if (hasUnitPrice) headers.push("Harga/Unit (Awal)", "Nilai (Awal)");
                          else headers.push("Nilai (Awal)");
                        }
                        headers.push("IN", "OUT", "Saldo Akhir");
                        if (hasAmount) {
                          if (hasUnitPrice) headers.push("Harga/Unit (Akhir)", "Nilai (Akhir)");
                          else headers.push("Nilai Akhir");
                        }

                        const rows: (string | number)[][] = [];
                        filteredProducts.forEach(p => {
                          const awal = p.stokAwal || 0;
                          const masuk = p.stokMasuk || 0;
                          const keluar = p.stokKeluar || 0;
                          const akhir = awal + masuk - keluar;
                          const hpp = p.hpp || 0;

                          const rowData: (string | number)[] = [
                            `${p.sku}\n${p.nama}`,
                            p.kategori,
                            p.satuan,
                            awal
                          ];

                          if (hasAmount) {
                            if (hasUnitPrice) rowData.push(hpp, awal * hpp);
                            else rowData.push(awal * hpp);
                          }

                          rowData.push(masuk, keluar, akhir);

                          if (hasAmount) {
                            if (hasUnitPrice) rowData.push(hpp, akhir * hpp);
                            else rowData.push(akhir * hpp);
                          }
                          rows.push(rowData);
                        });

                        generateReportPDF(
                          'LAPORAN MUTASI PERSERDIAAN BARANG',
                          `Metode: Weighted Average Costing | Periode: ${stokViewMode.toUpperCase()} (${analitikStartDate} s/d ${analitikEndDate})`,
                          `${analitikStartDate} s/d ${analitikEndDate}`,
                          headers,
                          rows,
                          [],
                          `Mutasi_Stok_${stokViewMode}_${new Date().toISOString().slice(0, 10)}.pdf`,
                          'landscape'
                        );
                      }}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer size={14} />
                      <span>Download PDF</span>
                    </button>
                    <button
                      onClick={handleExportToExcel}
                      className="px-4 py-2 bg-success hover:bg-success/100 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Unduh Excel (.xlsx)</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB 7: LAPORAN KEUANGAN & STOK (REPORTS HUB) */}
          {/* TAB 7: LAPORAN KEUANGAN & STOK (REPORTS HUB) */}
          {['laba_rugi', 'arus_kas', 'konsinyasi', 'penjualan_harian', 'pajak_ppn'].includes(activeTab) && (
            <ReportsTab
              activeTab={activeTab}
              analitikStartDate={analitikStartDate} setAnalitikStartDate={setAnalitikStartDate}
              analitikEndDate={analitikEndDate} setAnalitikEndDate={setAnalitikEndDate}
              isExportingPDF={isExportingPDF} exportElementToPDF={exportElementToPDF} triggerToast={triggerToast}
              salesOrders={salesOrders} purchaseOrders={purchaseOrders} cashLedger={cashLedger} settingCashAccounts={settingCashAccounts}
              arusKasFilterAkun={arusKasFilterAkun} setArusKasFilterAkun={setArusKasFilterAkun}
              showManualCashModal={showManualCashModal} setShowManualCashModal={setShowManualCashModal} setManualCashForm={setManualCashForm}
              consignments={consignments} setConsignments={setConsignments}
              consignmentForm={consignmentForm} setConsignmentForm={setConsignmentForm}
              consignmentSellForm={consignmentSellForm} setConsignmentSellForm={setConsignmentSellForm}
              showAddConsignmentModal={showAddConsignmentModal} setShowAddConsignmentModal={setShowAddConsignmentModal}
              showSellConsignmentModal={showSellConsignmentModal} setShowSellConsignmentModal={setShowSellConsignmentModal}
              setCashLedger={setCashLedger} saveCashEntry={saveCashEntry} products={products}
              dailySalesReportMonth={dailySalesReportMonth} setDailySalesReportMonth={setDailySalesReportMonth}
            />
          )}

          {/* TAB 8: PENGATURAN / SETTING */}
          {activeTab === 'setting' && (
            <SettingsTab
              namaToko={namaToko} setNamaToko={setNamaToko}
              alamatToko={alamatToko} setAlamatToko={setAlamatToko}
              telpToko={telpToko} setTelpToko={setTelpToko}
              kotaToko={kotaToko} setKotaToko={setKotaToko}
              ppnRate={ppnRate} setPpnRate={setPpnRate}
              metodeHppDefault={metodeHppDefault} setMetodeHppDefault={setMetodeHppDefault}
              mataUang={mataUang} setMataUang={setMataUang}
              driveFolderStruk={driveFolderStruk} setDriveFolderStruk={setDriveFolderStruk}
              formatTanggal={formatTanggal} setFormatTanggal={setFormatTanggal}
              tipeBisnis={tipeBisnis} setTipeBisnis={setTipeBisnis}
              isLoginActive={isLoginActive} setIsLoginActive={setIsLoginActive}
              loginUsername={loginUsername} setLoginUsername={setLoginUsername}
              loginPassword={loginPassword} setLoginPassword={setLoginPassword}
              settingUsersList={settingUsersList} setSettingUsersList={setSettingUsersList}
              currentUser={currentUser}
              setIsLoggedIn={setIsLoggedIn}
              triggerToast={triggerToast}
            />
          )}

          {/* TAB 10: DEVELOPER CODE EXPORTER & GOOGLE SHEETS HUB */}
          {activeTab === 'export_code' && (() => {
            // Inner tab helper functions
            const downloadBlankTemplate = (type: 'produk' | 'pelanggan' | 'supplier') => {
              const wb = XLSX.utils.book_new();
              let headers: any[] = [];
              let sampleData: any[] = [];
              let filename = '';

              if (type === 'produk') {
                headers = [
                  ['SKU', 'Kategori', 'Sub Kategori', 'Nama Produk', 'Satuan', 'Harga Jual', 'HPP (Harga Pokok)', 'Safety Stock', 'Stok Awal', 'Status', 'Supplier', 'Lokasi Penyimpanan', 'Masa Simpan', 'Catatan']
                ];
                sampleData = [
                  ['FG-TEST-001', 'Barang Jadi', 'Roti & Kue', 'Croissant Keju Spesial', 'Pcs', 28000, 13000, 20, 100, 'Aktif', 'PT. Terigu Sukses', 'Etalase Depan', '3 Hari', 'Contoh isian produk baru']
                ];
                filename = 'Template_Import_Produk_INO_Sheets.xlsx';
              } else if (type === 'pelanggan') {
                headers = [
                  ['ID Pelanggan', 'Nama Instansi', 'Kontak Person', 'Email', 'No Telp', 'Alamat', 'Piutang Awal']
                ];
                sampleData = [
                  ['CUST-999', 'Horeka Cafe Bali', 'Ketut Suantara', 'horeka@cafe.com', '081122334455', 'Jl. Monkey Forest No. 10, Ubud', 0]
                ];
                filename = 'Template_Import_Pelanggan_INO_Sheets.xlsx';
              } else {
                headers = [
                  ['ID Supplier', 'Nama Perusahaan', 'Kontak Person', 'Email', 'No Telp', 'Alamat', 'Hutang Awal']
                ];
                sampleData = [
                  ['SUPP-999', 'CV. Bahan Premium', 'Made Adi', 'premium@bahan.com', '087766554433', 'Gatsu Barat No. 99, Denpasar', 0]
                ];
                filename = 'Template_Import_Supplier_INO_Sheets.xlsx';
              }

              const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleData]);
              XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
              XLSX.writeFile(wb, filename);
              triggerToast(`Template ${type.toUpperCase()} berhasil diunduh!`, "success");
            };

            const exportDatabaseToExcel = () => {
              const wb = XLSX.utils.book_new();

              // Tab 1: Produk
              const wsProducts = XLSX.utils.json_to_sheet(products.map(p => ({
                'SKU': p.sku,
                'Kategori': p.kategori,
                'Sub Kategori': p.subKat,
                'Nama Produk': p.nama,
                'Satuan': p.satuan,
                'Harga Jual': p.hj,
                'HPP (Harga Pokok)': p.hpp,
                'Safety Stock': p.safety,
                'Stok Saat Ini': p.stok,
                'Status': p.status,
                'Supplier': p.supplier,
                'Lokasi Penyimpanan': p.tempatSimpan,
                'Masa Simpan': p.masaSmp,
                'Catatan': p.catatan
              })));
              XLSX.utils.book_append_sheet(wb, wsProducts, "Produk");

              // Tab 2: Pelanggan
              const wsCustomers = XLSX.utils.json_to_sheet(customers.map(c => ({
                'ID Pelanggan': c.id,
                'Nama Instansi': c.nama,
                'Kontak Person': c.kontak,
                'Email': c.email,
                'No Telp': c.telp,
                'Alamat': c.alamat,
                'Saldo Piutang': c.piutang
              })));
              XLSX.utils.book_append_sheet(wb, wsCustomers, "Pelanggan");

              // Tab 3: Supplier
              const wsSuppliers = XLSX.utils.json_to_sheet(suppliers.map(s => ({
                'ID Supplier': s.id,
                'Nama Perusahaan': s.nama,
                'Kontak Person': s.kontak,
                'Email': s.email,
                'No Telp': s.telp,
                'Alamat': s.alamat,
                'Saldo Hutang': s.hutang
              })));
              XLSX.utils.book_append_sheet(wb, wsSuppliers, "Supplier");

              // Tab 4: Formula BOM
              const wsBoms = XLSX.utils.json_to_sheet(boms.map(b => ({
                'ID BOM': b.id,
                'Nama Finished Good': b.namaFg,
                'SKU Finished Good': b.skuFg,
                'Total Bahan Baku': b.bahanBaku?.length || 0,
                'Total Estimasi Biaya Pokok': b.totalHppRaw || 0
              })));
              XLSX.utils.book_append_sheet(wb, wsBoms, "Formula BOM");

              XLSX.writeFile(wb, `Database_Lengkap_INO_ERP_${namaToko}.xlsx`);
              triggerToast("Seluruh database berhasil diekspor ke file Excel (.xlsx)!", "success");
            };

            const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (!file) return;

              const reader = new FileReader();
              reader.onload = (evt) => {
                try {
                  const data = evt.target?.result;
                  const workbook = XLSX.read(data, { type: 'binary' });
                  const firstSheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[firstSheetName];
                  const json = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                  if (json.length > 0) {
                    const headers = json[0].map(h => String(h || '').trim());
                    const rows = json.slice(1).map(row => row.map(v => String(v ?? '').trim()));
                    setParsedImportHeaders(headers);
                    setParsedImportRows(rows);
                    triggerToast("File Excel berhasil dibaca! Silakan periksa kolom sebelum mengonfirmasi.", "success");
                  } else {
                    triggerToast("File Excel kosong!", "error");
                  }
                } catch (err) {
                  triggerToast("Gagal membaca file Excel. Pastikan formatnya benar.", "error");
                }
              };
              reader.readAsBinaryString(file);
            };

            const handlePasteTextChange = (text: string) => {
              setPasteText(text);
              if (!text.trim()) {
                setParsedImportHeaders([]);
                setParsedImportRows([]);
                return;
              }

              const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
              if (lines.length > 0) {
                let separator = '\t';
                if (!lines[0].includes('\t')) {
                  separator = lines[0].includes(';') ? ';' : ',';
                }
                const headers = lines[0].split(separator).map(h => h.trim().replace(/^["']|["']$/g, ''));
                const rows = lines.slice(1).map(line => line.split(separator).map(v => v.trim().replace(/^["']|["']$/g, '')));
                setParsedImportHeaders(headers);
                setParsedImportRows(rows);
              }
            };

            const mapProductRow = (row: string[], headers: string[]) => {
              const getVal = (headerName: string) => {
                const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_()]/g, '') === headerName.toLowerCase().replace(/[\s_()]/g, ''));
                return idx !== -1 ? row[idx] : '';
              };

              return {
                sku: getVal('sku') || `PROD-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                kategori: getVal('kategori') || 'Barang Jadi',
                subKat: getVal('subkategori') || getVal('subkat') || 'Makanan',
                nama: getVal('namaproduk') || getVal('nama') || 'Produk Tanpa Nama',
                satuan: getVal('satuan') || 'Pcs',
                hj: Number(getVal('hargajual') || getVal('hj') || 0),
                hpp: Number(getVal('hpphargapokok') || getVal('hpp') || 0),
                safety: Number(getVal('safetystock') || getVal('safety') || 0),
                stok: Number(getVal('stokawal') || getVal('stok') || 0),
                status: getVal('status') || 'Aktif',
                supplier: getVal('supplier') || '',
                tempatSimpan: getVal('lokasipenyimpanan') || getVal('tempatSimpan') || 'Gudang Utama',
                masaSmp: getVal('masasimpan') || getVal('masaSmp') || 'Selamanya',
                catatan: getVal('catatan') || ''
              };
            };

            const mapCustomerRow = (row: string[], headers: string[]) => {
              const getVal = (headerName: string) => {
                const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_()]/g, '') === headerName.toLowerCase().replace(/[\s_()]/g, ''));
                return idx !== -1 ? row[idx] : '';
              };

              return {
                id: getVal('idpelanggan') || getVal('id') || `CUST-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                nama: getVal('namainstansi') || getVal('nama') || 'Pelanggan Baru',
                kontak: getVal('kontakperson') || getVal('kontak') || '',
                email: getVal('email') || '',
                telp: getVal('notelp') || getVal('telp') || '',
                alamat: getVal('alamat') || '',
                piutang: Number(getVal('piutangawal') || getVal('piutang') || 0)
              };
            };

            const mapSupplierRow = (row: string[], headers: string[]) => {
              const getVal = (headerName: string) => {
                const idx = headers.findIndex(h => h.toLowerCase().replace(/[\s_()]/g, '') === headerName.toLowerCase().replace(/[\s_()]/g, ''));
                return idx !== -1 ? row[idx] : '';
              };

              return {
                id: getVal('idsupplier') || getVal('id') || `SUPP-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
                nama: getVal('namaperusahaan') || getVal('nama') || 'Supplier Baru',
                kontak: getVal('kontakperson') || getVal('kontak') || '',
                email: getVal('email') || '',
                telp: getVal('notelp') || getVal('telp') || '',
                alamat: getVal('alamat') || '',
                hutang: Number(getVal('hutangawal') || getVal('hutang') || 0)
              };
            };

            const executeImport = () => {
              if (parsedImportRows.length === 0) {
                triggerToast("Tidak ada data untuk diimpor. Silakan tempel teks atau upload file terlebih dahulu.", "error");
                return;
              }

              let successCount = 0;
              let updateCount = 0;

              if (importTargetType === 'produk') {
                const mapped = parsedImportRows.map(row => mapProductRow(row, parsedImportHeaders));

                if (importMethod === 'overwrite') {
                  setProducts(mapped);
                  saveAllProducts(mapped);
                  successCount = mapped.length;
                } else {
                  const next = [...products];
                  mapped.forEach(item => {
                    const idx = next.findIndex(p => p.sku === item.sku);
                    if (idx !== -1) {
                      next[idx] = { ...next[idx], ...item };
                      updateCount++;
                    } else {
                      next.push(item);
                      successCount++;
                    }
                  });
                  setProducts(next);
                  saveAllProducts(next);
                }
              } else if (importTargetType === 'pelanggan') {
                const mapped = parsedImportRows.map(row => mapCustomerRow(row, parsedImportHeaders));

                if (importMethod === 'overwrite') {
                  setCustomers(mapped);
                  saveAllCustomers(mapped);
                  successCount = mapped.length;
                } else {
                  setCustomers(prev => {
                    const next = [...prev];
                    mapped.forEach(item => {
                      const idx = next.findIndex(c => c.id === item.id);
                      if (idx !== -1) {
                        next[idx] = { ...next[idx], ...item };
                        updateCount++;
                      } else {
                        next.push(item);
                        successCount++;
                      }
                    });
                    saveAllCustomers(next);
                    return next;
                  });
                }
              } else if (importTargetType === 'supplier') {
                const mapped = parsedImportRows.map(row => mapSupplierRow(row, parsedImportHeaders));

                if (importMethod === 'overwrite') {
                  setSuppliers(mapped);
                  saveAllSuppliers(mapped);
                  successCount = mapped.length;
                } else {
                  setSuppliers(prev => {
                    const next = [...prev];
                    mapped.forEach(item => {
                      const idx = next.findIndex(s => s.id === item.id);
                      if (idx !== -1) {
                        next[idx] = { ...next[idx], ...item };
                        updateCount++;
                      } else {
                        next.push(item);
                        successCount++;
                      }
                    });
                    saveAllSuppliers(next);
                    return next;
                  });
                }
              }

              setPasteText('');
              setParsedImportRows([]);
              setParsedImportHeaders([]);
              triggerToast(`Impor Berhasil! Tambah: ${successCount}, Perbarui: ${updateCount}`, "success");
            };

            return (
              <div className="space-y-6">
                {/* Header panel */}
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 shadow-md text-white">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-success/100/10 rounded-card border border-teal-500/20">
                      <FileSpreadsheet className="text-primary" size={24} />
                    </div>
                    <div>
                      <h2 className="text-lg font-extrabold tracking-tight">📊 Pusat Sinkronisasi &amp; Integrasi Google Sheets / Excel</h2>
                      <p className="text-sm text-slate-400">Unduh template pengisian kosong, ekspor seluruh database ke file Excel siap cetak, atau impor data masal dari Google Sheets.</p>

                    </div>
                  </div>
                </div>
                {/* Sub Tab Navigation */}
                <div className="flex bg-slate-100 p-1 rounded-card border border-border w-full max-w-lg">
                  {[
                    { id: 'ekspor', label: '📥 Ekspor &amp; Template' },
                    { id: 'impor', label: '📤 Impor Data' },
                    { id: 'gas', label: '💻 Google Apps Script (GAS)' }
                  ].map(st => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => setSheetsHubSubTab(st.id as any)}
                      className={`flex-1 px-4 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-card transition-all cursor-pointer ${sheetsHubSubTab === st.id
                          ? 'bg-primary text-white shadow'
                          : 'text-secondary hover:text-primary'
                        }`}
                    >
                      {st.label === '📥 Ekspor &amp; Template' ? '📥 Ekspor & Template' : st.label}
                    </button>
                  ))}

                </div>
                {/* SUB TAB 1: DOWNLOAD TEMPLATE & EXPORT DATA */}
                {sheetsHubSubTab === 'ekspor' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    {/* Panel Kiri: Unduh Template Pengisian */}
                    <div className="bg-white border border-border rounded-card p-5 shadow-xs space-y-4">
                      <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                        <Download size={16} className="text-primary" />
                        <span>Unduh Template Tempat Pengisian Data (Google Sheet)</span>
                      </h3>
                      <p className="text-sm text-secondary leading-relaxed font-semibold">
                        Gunakan file Excel/CSV di bawah ini sebagai template pengisian di Google Sheets Anda. Setelah diisi, data dapat Anda copy-paste atau upload langsung pada tab <strong>Impor Data</strong>.
                      </p>

                      <div className="space-y-2 pt-2">
                        <button
                          type="button"
                          onClick={() => downloadBlankTemplate('produk')}
                          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-success/10 border border-border rounded-card transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-bold text-primary group-hover:text-primary">📝 Template Impor Master Produk</p>
                            <p className="text-[11px] text-secondary mt-0.5">Berisi kolom SKU, Kategori, Harga Jual, HPP, Safety Stock, dll.</p>
                          </div>
                          <Download size={14} className="text-slate-400 group-hover:text-primary" />
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadBlankTemplate('pelanggan')}
                          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-success/10 border border-border rounded-card transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-bold text-primary group-hover:text-primary">👥 Template Impor Master Pelanggan</p>
                            <p className="text-[11px] text-secondary mt-0.5">Berisi kolom ID Pelanggan, Nama Instansi, Kontak, Alamat, dll.</p>
                          </div>
                          <Download size={14} className="text-slate-400 group-hover:text-primary" />
                        </button>

                        <button
                          type="button"
                          onClick={() => downloadBlankTemplate('supplier')}
                          className="w-full flex items-center justify-between p-3.5 bg-slate-50 hover:bg-success/10 border border-border rounded-card transition-colors group"
                        >
                          <div>
                            <p className="text-sm font-bold text-primary group-hover:text-primary">🏭 Template Impor Master Supplier</p>
                            <p className="text-[11px] text-secondary mt-0.5">Berisi kolom ID Supplier, Nama Perusahaan, Kontak, dll.</p>
                          </div>
                          <Download size={14} className="text-slate-400 group-hover:text-primary" />
                        </button>

                      </div>
                    </div>
                    {/* Panel Kanan: Ekspor Database Aktif */}
                    <div className="bg-white border border-border rounded-card p-5 shadow-xs flex flex-col justify-between space-y-4">
                      <div>
                        <h3 className="text-sm font-black text-primary uppercase tracking-wider flex items-center gap-2 border-b pb-2">
                          <Database size={16} className="text-warning" />
                          <span>Ekspor Seluruh Database ERP Aktif</span>
                        </h3>
                        <p className="text-sm text-secondary leading-relaxed mt-2 font-semibold">
                          Unduh seluruh data ERP saat ini (Produk, Pelanggan, Supplier, dan Formula Resep BOM) ke dalam satu workbook Excel (.xlsx) dengan tab terpisah yang rapi dan siap dicetak/diunggah ke Google Drive.
                        </p>

                        <div className="mt-4 p-4 bg-warning/10 border border-warning/30 rounded-card text-sm text-warning flex items-start gap-2.5">
                          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                          <div>
                            <span className="font-extrabold">Informasi Backup Otomatis:</span>
                            <p className="text-[11px] text-warning/90 mt-0.5">Disarankan untuk mengekspor database secara berkala sebagai backup lokal yang aman sebelum melakukan penimpaan data masal.</p>

                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={exportDatabaseToExcel}
                        className="w-full py-3 bg-gradient-to-r from-teal-500 to-primary hover:from-primary hover:to-teal-600 text-white font-extrabold text-sm uppercase tracking-wider rounded-card shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FileSpreadsheet size={16} />
                        <span>Unduh File Excel Database Lengkap (.xlsx)</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* SUB TAB 2: IMPORT DATA FROM SHEETS */}
                {sheetsHubSubTab === 'impor' && (
                  <div className="bg-white border border-border rounded-card p-6 shadow-sm space-y-6 animate-fade-in">
                    <div className="flex flex-col lg:flex-row gap-6">
                      {/* Form Impor */}
                      <div className="flex-1 space-y-4">
                        <h3 className="text-sm font-black text-primary uppercase tracking-wider border-b pb-2">⚙️ Konfigurasi Impor</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[11px] font-black uppercase text-secondary mb-1">Pilih Target Tabel Database *</label>
                            <select
                              value={importTargetType}
                              onChange={(e) => {
                                setImportTargetType(e.target.value as any);
                                setParsedImportHeaders([]);
                                setParsedImportRows([]);
                                setPasteText('');
                              }}
                              className="w-full p-2.5 border border-border rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary bg-white"
                            >
                              <option value="produk">📦 Produk / Stock Inventory</option>
                              <option value="pelanggan">👥 Pelanggan / Customers</option>
                              <option value="supplier">🏭 Supplier / Vendor</option>
                            </select>

                          </div>
                          <div>
                            <label className="block text-[11px] font-black uppercase text-secondary mb-1">Metode Integrasi Data *</label>
                            <select
                              value={importMethod}
                              onChange={(e) => setImportMethod(e.target.value as any)}
                              className="w-full p-2.5 border border-border rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary bg-white"
                            >
                              <option value="merge">⚡ Merge (Tambahkan data baru &amp; Perbarui data lama)</option>
                              <option value="overwrite">⚠️ Overwrite (Hapus database lama &amp; Ganti dengan data baru)</option>
                            </select>

                          </div>
                        </div>
                        {/* File Upload Selector */}
                        <div className="space-y-1">
                          <label className="block text-[11px] font-black uppercase text-secondary">Pilih / Seret File Excel (.xlsx / .csv)</label>
                          <input
                            type="file"
                            accept=".xlsx, .xls, .csv"
                            onChange={handleExcelFileUpload}
                            className="w-full text-sm text-secondary border border-dashed border-border rounded-card p-3 bg-slate-50 hover:bg-slate-100 cursor-pointer"
                          />

                        </div>
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center" aria-hidden="true">
                            <div className="w-full border-t border-border"></div>
                          </div>
                          <div className="relative flex justify-center text-sm uppercase">
                            <span className="bg-white px-3 font-bold text-[11px] text-slate-400">Atau Paste Langsung dari Google Sheets</span>

                          </div>
                        </div>
                        {/* Paste Text Area */}
                        <div>
                          <label className="block text-[11px] font-black uppercase text-secondary mb-1">Salin Baris Tabel Google Sheets Lalu Tempel di Sini</label>
                          <textarea
                            value={pasteText}
                            onChange={(e) => handlePasteTextChange(e.target.value)}
                            rows={4}
                            className="w-full p-3 border border-border rounded-card text-sm font-mono text-primary focus:ring-1 focus:ring-primary bg-slate-50"
                            placeholder="Salin/Copy baris dari Google Sheets (termasuk baris header paling atas) lalu paste di sini..."
                          />

                        </div>
                      </div>
                      {/* Panduan Kolom */}
                      <div className="w-full lg:w-80 bg-slate-50 border border-border rounded-card p-4 text-sm space-y-3">
                        <h4 className="font-extrabold uppercase text-xs text-primary tracking-wider flex items-center gap-1.5 border-b pb-1">
                          <HelpCircle size={14} className="text-primary" />
                          <span>Petunjuk Header Google Sheets</span>
                        </h4>
                        <p className="text-[11px] text-secondary font-medium">Sistem kami pintar! Header kolom Anda di Google Sheets tidak harus 100% sama, asalkan mengandung kata kunci berikut:</p>

                        <div className="space-y-2 text-[11px]">
                          {importTargetType === 'produk' && (
                            <>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">SKU</span>: SKU / Kode Produk</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Nama Produk</span>: Nama Produk / Nama / Item</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Harga Jual</span>: Harga Jual / Harga / HJ</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">HPP</span>: HPP / Harga Pokok / Modal / Harga Beli</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Stok Awal</span>: Stok Awal / Stok / Qty</div>
                            </>
                          )}
                          {importTargetType === 'pelanggan' && (
                            <>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">ID Pelanggan</span>: ID Pelanggan / ID / Code</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Nama Instansi</span>: Nama Instansi / Nama / Customer</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Kontak Person</span>: Kontak Person / Kontak / PIC</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Piutang Awal</span>: Piutang / Piutang Awal / Saldo</div>
                            </>
                          )}
                          {importTargetType === 'supplier' && (
                            <>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">ID Supplier</span>: ID Supplier / ID / Code</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Nama Perusahaan</span>: Nama Perusahaan / Nama / Vendor</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Kontak Person</span>: Kontak Person / Kontak / PIC</div>
                              <div className="p-2 bg-white rounded border border-border"><span className="font-black text-success">Hutang Awal</span>: Hutang / Hutang Awal / Saldo</div>
                            </>
                          )}

                        </div>
                      </div>
                    </div>
                    {/* Preview Area */}
                    {parsedImportRows.length > 0 && (
                      <div className="border border-success/30 rounded-card overflow-hidden bg-success/10 p-4 mb-4">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                          <div>
                            <h4 className="text-sm font-black text-success uppercase tracking-wider flex items-center gap-1.5">
                              <CheckCircle size={15} className="text-success" />
                              <span>Pratinjau Data Terbaca ({parsedImportRows.length} baris ditemukan)</span>
                            </h4>
                            <p className="text-[11px] text-secondary font-semibold mt-0.5">Sistem berhasil memetakan file Anda. Silakan verifikasi 5 baris pertama di bawah ini:</p>

                          </div>
                          <button
                            type="button"
                            onClick={executeImport}
                            className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-extrabold text-sm uppercase tracking-wider rounded-card shadow-md transition-all cursor-pointer"
                          >
                            🚀 Mulai Impor Sekarang
                          </button>

                        </div>
                        <div className="overflow-x-auto border border-border rounded-card">
                          <table className="w-full text-[11px] text-left bg-white">
                            <thead className="bg-slate-50 text-primary font-bold uppercase tracking-wider border-b border-border">
                              <tr>
                                {parsedImportHeaders.map((header, idx) => (
                                  <th key={idx} className="p-2.5 border-r border-slate-100 last:border-0">{header}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {parsedImportRows.slice(0, 5).map((row, rowIdx) => (
                                <tr key={rowIdx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                  {parsedImportHeaders.map((_, colIdx) => (
                                    <td key={colIdx} className="p-2.5 border-r border-slate-100 last:border-0 font-medium text-primary max-w-xs truncate">
                                      {row[colIdx] !== undefined ? row[colIdx] : ''}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {parsedImportRows.length > 5 && (
                          <p className="text-[11px] text-slate-400 font-mono text-right italic">&bull; Menampilkan 5 dari {parsedImportRows.length} baris total</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* SUB TAB 3: ORIGINAL GAS TEMPLATE */}
                {sheetsHubSubTab === 'gas' && (
                  <div className="bg-white border border-border rounded-card shadow-sm overflow-hidden animate-fade-in">
                    <div className="bg-slate-50 border-b border-border text-primary flex items-center justify-between p-4">
                      <span className="font-bold flex items-center gap-2 text-sm">
                        <Code className="text-primary" />
                        <span>Ekspor Kode GAS (Index.html)</span>
                      </span>
                      <span className="text-[11px] text-secondary font-black uppercase">Salin &amp; Tempel di Google Apps Script</span>
                    </div>
                    <div className="p-6">
                      <p className="text-sm text-secondary mb-4 font-semibold">
                        Gunakan template murni HTML di bawah untuk Google Apps Script (GAS) dengan INO Design System:
                      </p>
                      <pre className="text-[11px] text-primary font-mono overflow-x-auto whitespace-pre p-4 bg-slate-50 border border-border rounded-card max-h-96">





                        {`<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ino-primary: #0EA5A4;
      --ino-primary-dark: #1E293B;
      --ino-accent: #F59E0B;
      --ino-success: #22C55E;
      --ino-warning: #F59E0B;
      --ino-danger: #EF4444;
      --ino-info: #3B82F6;
      --ino-bg: #F8FAFC;
      --ino-card: #FFFFFF;
      --ino-border: #E2E8F0;
      --ino-text: #1E293B;
      --ino-text-secondary: #475569;
      --ino-text-muted: #94A3B8;
    }
    body {
      font-family: 'Inter', sans-serif;
      background-color: var(--ino-bg);
      color: var(--ino-text);
      margin: 0; padding: 20px;
    }
  </style>
</head>
<body>
  <div class="ino-logo-hexagon">
    <div class="ino-logo-cube"></div>
  </div>
  <h2>INO ERP - Sistem Berhasil Tersambung</h2>
</body>
</html>`}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
          {/* ==========================================
              MODAL: DETAIL & AKSI PURCHASE ORDER (PO)
              ========================================== */}
          {selectedPo && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #struk-po-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; position: static !important; max-height: none !important; overflow: visible !important; }
                  #struk-po-section * { overflow: visible !important; }
                }
              `}} />
              <div className="bg-white rounded-card shadow-2xl border border-border w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] relative my-auto print-container" id="struk-po-section">

                {/* Modal Header */}
                <div className="bg-slate-50 text-primary p-5 flex justify-between items-center border-b border-border no-print">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] bg-primary text-white font-black px-2 py-0.5 rounded uppercase tracking-wider">Doc Viewer</span>
                      <h3 className="font-mono text-lg font-bold tracking-tight text-primary">{selectedPo.id}</h3>
                    </div>
                    <p className="text-sm text-secondary font-semibold mt-1">
                      Dokumen Purchase Order &bull; Supplier: <span className="font-bold text-primary">{selectedPo.supplier}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPoActionForm('print')}
                      className="p-2 bg-slate-800 hover:bg-slate-700 rounded-card text-slate-400 transition-all flex items-center gap-1.5 text-sm font-bold"
                      title="Cetak Bukti PO"
                    >
                      <Printer size={15} />
                      <span className="hidden sm:inline">Cetak</span>
                    </button>
                    <button
                      onClick={() => { setSelectedPo(null); setPoActionForm(null); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-card p-2 transition-all"
                    >
                      <X size={18} />
                    </button>

                  </div>
                </div>
                {/* Sub-form Panels Overlay */}
                {poActionForm === 'receipt' ? (
                  /* 1. PENERIMAAN BARANG PO */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-slate-50 border-l-4 border-primary p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider">Penerimaan Barang Gudang (Logistik PO)</h4>
                      <p className="text-sm text-secondary mt-1">Masukkan jumlah fisik barang yang baru saja diterima di gudang utama. Status logistik akan disesuaikan otomatis.</p>

                    </div>
                    <div className="border border-border rounded-card overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-primary font-bold uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="p-3">Produk</th>
                            <th className="p-3 text-center">Dipesan</th>
                            <th className="p-3 text-center">Telah Terima</th>
                            <th className="p-3 text-center">Sisa Pesanan</th>
                            <th className="p-3 text-right w-36">Terima Sekarang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedPo.items.map((item: any, idx: number) => {
                            const received = item.qtyReceived ?? (selectedPo.statusLogistik === 'Diterima' ? item.qty : 0);
                            const sisa = Math.max(0, item.qty - received);
                            return (
                              <tr key={`${item.sku}-${idx}`} className="hover:bg-slate-50">
                                <td className="p-3">
                                  <div className="font-bold text-primary">{item.nama || 'Produk'}</div>
                                  <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                </td>
                                <td className="p-3 text-center font-semibold text-primary">{item.qty} Pcs</td>
                                <td className="p-3 text-center text-success font-bold">{received} Pcs</td>
                                <td className="p-3 text-center text-warning font-bold">{sisa} Pcs</td>
                                <td className="p-3 text-right">
                                  <input
                                    type="text" inputMode="numeric"
                                    value={formatRibuan(poReceiptQtys[idx] ?? 0)}
                                    onChange={(e) => {
                                      let val = parseRibuan(e.target.value);
                                      val = Math.max(0, Math.min(val, sisa));
                                      setPoReceiptQtys(prev => ({ ...prev, [idx]: val }));
                                    }}
                                    disabled={sisa === 0}
                                    className="w-full p-2 border border-border rounded-card text-right text-sm font-bold disabled:bg-gray-100 disabled:text-slate-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                    </div>
                    <div className="flex justify-end gap-2.5 pt-4">
                      <button
                        onClick={() => setPoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitPoReceipt(selectedPo.id)}
                        className="px-4 py-2 bg-primary hover:bg-teal-500 text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Simpan Penerimaan
                      </button>
                    </div>
                  </div>
                ) : poActionForm === 'payment' ? (
                  /* 2. PEMBAYARAN PO */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-slate-50 border-l-4 border-emerald-500 p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider">Formulir Pembayaran Hutang Supplier</h4>
                      <p className="text-sm text-secondary mt-1">Catat pengeluaran kas atau transfer bank untuk melunasi tagihan PO ini. Hutang supplier otomatis disesuaikan.</p>

                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-card border border-border">
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Total Nilai Tagihan PO</span>
                        <span className="text-xl font-black text-primary">Rp {selectedPo.grandTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-warning font-bold uppercase block">Sisa Hutang Belum Dibayar</span>
                        <span className="text-xl font-black text-warning">
                          Rp {(selectedPo.grandTotal - (selectedPo.totalPaid ?? (selectedPo.statusBayar === 'Lunas' ? selectedPo.grandTotal : 0))).toLocaleString('id-ID')}
                        </span>

                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Nominal Bayar (Rupiah)</label>
                        <input
                          type="text" inputMode="numeric"
                          value={formatRibuan(poPaymentVal)}
                          onChange={(e) => setPoPaymentVal(Math.max(0, parseRibuan(e.target.value) || 0))}
                          className="p-2.5 border border-border rounded-card text-sm font-bold bg-white"
                        />

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Metode Pembayaran</label>
                        <select
                          value={poPaymentMetode}
                          onChange={(e) => setPoPaymentMetode(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm font-bold bg-white"
                        >
                          <option value="Transfer Bank">Transfer Bank / M-Banking</option>
                          <option value="Kas Tunai">Kas Tunai (Petty Cash)</option>
                          <option value="Giro / Cek">Giro atau Cek</option>
                        </select>

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Nomor Referensi / Kode Transaksi</label>
                        <input
                          type="text"
                          placeholder="Contoh: TRX-100238"
                          value={poPaymentRef}
                          onChange={(e) => setPoPaymentRef(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm"
                        />

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Catatan Keuangan (Memo)</label>
                        <input
                          type="text"
                          placeholder="Tulis rincian tambahan..."
                          value={poPaymentMemo}
                          onChange={(e) => setPoPaymentMemo(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm"
                        />

                      </div>
                    </div>
                    <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                      <button
                        onClick={() => setPoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitPoPayment(selectedPo.id)}
                        className="px-4 py-2 bg-success hover:bg-success text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Catat Pembayaran
                      </button>
                    </div>
                  </div>
                ) : poActionForm === 'retur' ? (
                  /* 3. RETUR BARANG PO */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-rose-50 border-l-4 border-danger p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-danger uppercase tracking-wider">Formulir Retur Barang ke Supplier</h4>
                      <p className="text-sm text-secondary mt-1">Mengembalikan stok produk yang rusak/cacat ke supplier. Stok gudang akan berkurang &amp; sisa hutang akan dikoreksi.</p>

                    </div>
                    <div className="border border-red-100 rounded-card overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-danger/10 text-danger font-bold uppercase border-b border-red-100">
                          <tr>
                            <th className="p-3">Produk</th>
                            <th className="p-3 text-center">Telah Diterima</th>
                            <th className="p-3 text-center">Telah Diretur</th>
                            <th className="p-3 text-center">Batas Maks Retur</th>
                            <th className="p-3 text-right w-36">Retur Sekarang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedPo.items.map((item: any, idx: number) => {
                            const received = item.qtyReceived ?? (selectedPo.statusLogistik === 'Diterima' ? item.qty : 0);
                            const returned = item.qtyReturned ?? 0;
                            const maxRetur = Math.max(0, received - returned);
                            return (
                              <tr key={`${item.sku}-${idx}`} className="hover:bg-danger/10 transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-primary">{item.nama || 'Produk'}</div>
                                  <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                </td>
                                <td className="p-3 text-center text-success font-bold">{received} Pcs</td>
                                <td className="p-3 text-center text-danger font-bold">{returned} Pcs</td>
                                <td className="p-3 text-center text-secondary font-semibold">{maxRetur} Pcs</td>
                                <td className="p-3 text-right">
                                  <input
                                    type="text" inputMode="numeric"
                                    min="0"
                                    max={maxRetur}
                                    value={formatRibuan(poReturQtys[idx] ?? 0)}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseRibuan(e.target.value) || 0);
                                      setPoReturQtys(prev => ({ ...prev, [idx]: val }));
                                    }}
                                    disabled={maxRetur === 0}
                                    className="w-full p-2 border border-danger/30 rounded-card text-right text-sm font-bold disabled:bg-gray-100 disabled:text-slate-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                    </div>
                    <div className="flex flex-col gap-1.5 bg-slate-50 p-4 rounded-card border border-border">
                      <label className="text-[11px] font-black uppercase text-secondary">Alasan Retur (Wajib diisi)</label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Barang cacat produksi / pecah saat pengiriman..."
                        value={poReturAlasan}
                        onChange={(e) => setPoReturAlasan(e.target.value)}
                        className="p-2 border border-border rounded-card text-sm bg-white"
                      />

                    </div>
                    <div className="flex justify-end gap-2.5 pt-4">
                      <button
                        onClick={() => setPoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitPoRetur(selectedPo.id)}
                        className="px-4 py-2 bg-danger hover:bg-danger text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Proses Retur Pembelian
                      </button>
                    </div>
                  </div>
                ) : poActionForm === 'print' ? (
                  /* 4. PRINT TEMPLATE COPIABLE */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-4 rounded-card border border-border gap-4">
                      <div>
                        <p className="text-sm text-primary font-semibold">Tampilan Dokumen Resmi.</p>
                        <p className="text-[11px] text-secondary mt-0.5">*Jika tombol tidak merespon di AI Studio, klik tombol <strong>Buka di Tab Baru</strong> di kanan atas preview.</p>
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-card shadow transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Printer size={13} />
                        Cetak / Simpan PDF
                      </button>

                    </div>
                    <div id="print-area" className="border border-border p-8 rounded-card bg-white space-y-6 text-primary font-sans shadow-inner max-w-3xl mx-auto">
                      <div className="flex justify-between border-b-2 border-text-primary pb-4">
                        <div>
                          <h1 className="text-xl font-black text-text-primary tracking-tight">PT. BALI JAYA SUKSES</h1>
                          <p className="text-sm text-secondary mt-1">Jl. Sunset Road No. 88X, Kuta, Bali</p>
                          <p className="text-sm text-secondary">Telp: (0361) 882-9382 &bull; Email: info@balijayasukses.co.id</p>
                        </div>
                        <div className="text-right">
                          <h2 className="text-base font-black text-primary tracking-wide">SURAT PESANAN (PO)</h2>
                          <p className="text-sm font-mono font-bold text-secondary mt-1">NO: {selectedPo.id}</p>
                          <p className="text-sm text-secondary">Tanggal: {selectedPo.tanggal}</p>

                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-bold uppercase text-text-primary border-b pb-1 mb-2">Ditujukan Kepada Supplier:</p>
                          <p className="font-black text-primary">{selectedPo.supplier}</p>
                          <p className="text-secondary mt-1">Sistem Pembayaran: {selectedPo.metode}</p>
                          <p className="text-secondary">Keuangan: {selectedPo.hasReturn ? (selectedPo.statusBayar === "Lunas" ? "LUNAS (KOREKSI RETUR)" : "BELUM DIBAYAR (DIPOTONG RETUR)") : selectedPo.statusBayar}</p>
                        </div>
                        <div>
                          <p className="font-bold uppercase text-text-primary border-b pb-1 mb-2">Alamat Pengiriman Gudang:</p>
                          <p className="font-semibold text-primary">PT. Bali Jaya Sukses - Gudang Logistik Utama</p>
                          <p className="text-secondary mt-1">Status Logistik: {selectedPo.hasReturn ? (selectedPo.statusLogistik === "Retur Penuh" || selectedPo.statusLogistik === "Retur Sebagian" ? selectedPo.statusLogistik.upper() : `${selectedPo.statusLogistik.toUpperCase()} (RETUR)`) : selectedPo.statusLogistik}</p>

                        </div>
                      </div>
                      <table className="w-full text-sm text-left border-collapse mt-4">
                        <thead>
                          <tr className="bg-slate-100 border-t border-b border-border">
                            <th className="p-2 font-bold uppercase text-primary">SKU</th>
                            <th className="p-2 font-bold uppercase text-primary">Deskripsi Barang</th>
                            <th className="p-2 text-center font-bold uppercase text-primary">Kuantitas</th>
                            <th className="p-2 text-right font-bold uppercase text-primary">Harga Satuan</th>
                            <th className="p-2 text-right font-bold uppercase text-primary">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {selectedPo.items.map((item: any) => (
                            <tr key={item.sku}>
                              <td className="p-2 font-mono text-secondary">{item.sku}</td>
                              <td className="p-2 font-semibold text-primary">{item.nama || 'Produk'}</td>
                              <td className="p-2 text-center">{item.qty} Pcs</td>
                              <td className="p-2 text-right">Rp {item.harga.toLocaleString('id-ID')}</td>
                              <td className="p-2 text-right font-bold">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 border-text-primary font-bold">
                            <td colSpan={4} className="p-2 text-right uppercase">Grand Total:</td>
                            <td className="p-2 text-right text-primary text-sm">Rp {selectedPo.grandTotal.toLocaleString('id-ID')}</td>
                          </tr>
                        </tfoot>
                      </table>

                      <div className="grid grid-cols-2 gap-4 text-sm pt-12 text-center">
                        <div>
                          <p className="text-secondary mb-12">Disetujui Oleh,</p>
                          <p className="font-black border-b border-gray-400 w-48 mx-auto pb-1">Direktur Operasional</p>
                        </div>
                        <div>
                          <p className="text-secondary mb-12">Diterima Oleh Supplier,</p>
                          <p className="font-black border-b border-gray-400 w-48 mx-auto pb-1">{selectedPo.supplier}</p>

                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end pt-4">
                      <button
                        onClick={() => setPoActionForm(null)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-card transition-all"
                      >
                        Kembali Ke Detail
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 5. DOKUMEN GENERAL VIEW (Kebab dropdown, detail info, item lists, history) */
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Top Status Banner & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-card border border-border">
                      <div className="flex flex-wrap gap-2.5">
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase font-bold text-slate-400">Logistik</span>
                          <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 ${selectedPo.statusLogistik === 'Diterima' ? 'bg-success bg-opacity-15 text-success' :
                              selectedPo.statusLogistik === 'Diterima Sebagian' ? 'bg-info bg-opacity-15 text-info' :
                                selectedPo.statusLogistik === 'Menunggu' ? 'bg-warning bg-opacity-15 text-warning' :
                                  selectedPo.statusLogistik === 'Void' ? 'bg-danger/20 text-danger' : 'bg-gray-100 text-secondary'
                            }`}>
                            {selectedPo.statusLogistik}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase font-bold text-slate-400">Pembayaran</span>
                          {selectedPo.hasReturn ? (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 bg-amber-100 text-amber-800 border border-amber-300">
                              {selectedPo.statusBayar === 'Lunas' ? 'LUNAS (KOREKSI RETUR)' : 'BELUM DIBAYAR (DIPOTONG RETUR)'}
                            </span>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 ${selectedPo.statusBayar === 'Lunas' ? 'bg-success bg-opacity-15 text-success' :
                                selectedPo.statusBayar === 'Cicilan' ? 'bg-indigo-100 text-indigo-700' :
                                  selectedPo.statusBayar === 'Belum Dibayar' ? 'bg-danger bg-opacity-15 text-danger' :
                                    'bg-gray-100 text-secondary'
                              }`}>
                              {selectedPo.statusBayar}
                            </span>
                          )}
                        </div>
                        {selectedPo.totalPaid !== undefined && (
                          <div className="flex flex-col">
                            <span className="text-[11px] uppercase font-bold text-slate-400">Terbayar</span>
                            <span className="text-sm font-bold text-success mt-0.5">
                              Rp {selectedPo.totalPaid.toLocaleString('id-ID')}
                            </span>
                          </div>
                        )}

                      </div>
                      <div className="flex gap-2 relative">
                        {/* Interactive Main Action */}
                        {selectedPo.statusLogistik === 'Draft' ? (
                          <button
                            onClick={() => handleApprovePO(selectedPo.id)}
                            className="px-4 py-2 bg-primary hover:bg-success text-white text-sm font-bold rounded-card shadow-md transition-all flex items-center gap-1.5"
                          >
                            Setujui &amp; Rilis PO
                          </button>
                        ) : (
                          <>
                            {selectedPo.statusLogistik !== 'Diterima' && selectedPo.statusLogistik !== 'Void' && (
                              <button
                                onClick={() => handleOpenPoReceipt(selectedPo)}
                                className="px-3.5 py-2 bg-primary hover:bg-success text-white text-sm font-bold rounded-card shadow transition-all"
                              >
                                Penerimaan Gudang
                              </button>
                            )}
                            {selectedPo.statusBayar !== 'Lunas' && selectedPo.statusLogistik !== 'Void' && (
                              <button
                                onClick={() => handleOpenPoPayment(selectedPo)}
                                className="px-3.5 py-2 bg-success hover:bg-success text-white text-sm font-bold rounded-card shadow transition-all"
                              >
                                Catat Pembayaran
                              </button>
                            )}
                          </>
                        )}

                        {/* Kebab Extra Actions */}
                        <div className="relative">
                          <button
                            onClick={() => setPoShowKebab(!poShowKebab)}
                            className="p-2 bg-gray-200 hover:bg-gray-300 text-primary rounded-card transition-all"
                          >
                            &bull;&bull;&bull;
                          </button>
                          {poShowKebab && (
                            <div className="absolute right-0 bottom-full mb-2 bg-white rounded-card shadow-xl border border-border w-48 z-50 overflow-hidden divide-y divide-slate-100">
                              <button
                                onClick={() => { setPoShowKebab(false); handleOpenPoRetur(selectedPo); }}
                                disabled={selectedPo.statusLogistik === 'Void' || selectedPo.statusLogistik === 'Draft'}
                                className="w-full text-left p-2.5 text-sm font-semibold text-primary hover:bg-danger/10 hover:text-danger transition-all disabled:opacity-50 disabled:pointer-events-none"
                              >
                                Retur Barang Pembelian
                              </button>
                              <button
                                onClick={() => {
                                  setPoShowKebab(false);
                                  if (window.confirm("Apakah Anda yakin melakukan VOID pada PO ini? Tindakan ini akan mengembalikan stok & tagihan supplier.")) {
                                    handleVoidPO(selectedPo.id);
                                    setSelectedPo(null);
                                  }
                                }}
                                disabled={selectedPo.statusLogistik === 'Void'}
                                className="w-full text-left p-2.5 text-sm font-black text-danger hover:bg-danger/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
                              >
                                Void (Batalkan) PO
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>
                    {/* General Metadata Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-card border border-border">
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Metode Pembayaran</span>
                        <span className="text-sm font-semibold text-primary">{selectedPo.metode || 'Transfer Bank'}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Tanggal Pembuatan PO</span>
                        <span className="text-sm font-semibold text-primary">{selectedPo.tanggal}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-success font-bold uppercase block">Total Nilai Pembelian</span>
                        <span className="text-sm font-bold text-primary">Rp {selectedPo.grandTotal.toLocaleString('id-ID')}</span>
                      </div>
                      {selectedPo.catatan && (
                        <div className="col-span-1 sm:col-span-3">
                          <span className="text-[11px] text-slate-400 font-bold uppercase block">Catatan Tambahan / Memo</span>
                          <p className="text-sm text-secondary italic mt-0.5">{selectedPo.catatan}</p>
                        </div>
                      )}

                    </div>
                    {/* Order Items Table */}
                    <div>
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider mb-2">Daftar Barang Pesanan</h4>
                      <div className="border border-border rounded-card overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-text-primary text-white font-bold uppercase tracking-wider">
                            <tr>
                              <th className="p-3">SKU / Nama Barang</th>
                              <th className="p-3 text-center">Dipesan</th>
                              <th className="p-3 text-center">Diterima</th>
                              <th className="p-3 text-right">Harga Satuan</th>
                              <th className="p-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedPo.items.map((item: any) => {
                              const rec = item.qtyReceived ?? (selectedPo.statusLogistik === 'Diterima' ? item.qty : 0);
                              return (
                                <tr key={item.sku} className="hover:bg-slate-50">
                                  <td className="p-3">
                                    <div className="font-bold text-text-primary">{item.nama || 'Produk'}</div>
                                    <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                  </td>
                                  <td className="p-3 text-center font-semibold text-primary">{item.qty} Pcs</td>
                                  <td className="p-3 text-center font-bold text-success">{rec} Pcs</td>
                                  <td className="p-3 text-right text-secondary">Rp {item.harga.toLocaleString('id-ID')}</td>
                                  <td className="p-3 text-right font-black text-primary">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                      </div>
                    </div>
                    {/* Retur History Panel */}
                    {selectedPo.returItems && selectedPo.returItems.length > 0 && (
                      <div className="bg-danger/10 p-4 rounded-card border border-danger/30 mt-4">
                        <h4 className="text-sm font-black text-danger uppercase tracking-wider mb-2 flex items-center gap-1">
                          <CornerUpLeft size={13} />
                          <span>Riwayat Retur Pembelian</span>
                        </h4>
                        <div className="overflow-x-auto text-sm">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-danger/30 text-danger font-bold uppercase text-xs">
                                <th className="pb-1.5">Tanggal</th>
                                <th className="pb-1.5">Barang</th>
                                <th className="pb-1.5 text-center">Kuantitas</th>
                                <th className="pb-1.5">Alasan Retur</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-100">
                              {selectedPo.returItems.map((r: any, idx: number) => (
                                <tr key={idx} className="text-red-950 font-semibold">
                                  <td className="py-2">{r.tanggal}</td>
                                  <td className="py-2">{r.nama} ({r.sku})</td>
                                  <td className="py-2 text-center text-danger font-black">{r.qty} Pcs</td>
                                  <td className="py-2 italic text-secondary">{r.alasan}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Footer Controls */}
                <div className="bg-gray-50 px-6 py-4 border-t border-border flex justify-end gap-2">
                  <button
                    onClick={() => { setSelectedPo(null); setPoActionForm(null); }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-card text-sm font-bold transition-all shadow-md"
                  >
                    Tutup Viewer
                  </button>

                </div>
              </div>
            </div>
          )}

          {/* ==========================================
              MODAL: DETAIL & AKSI SALES ORDER (SO)
              ========================================== */}
          {selectedSo && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #struk-so-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; position: static !important; max-height: none !important; overflow: visible !important; }
                  #struk-so-section * { overflow: visible !important; }
                }
              `}} />
              <div className="bg-white rounded-card shadow-2xl border border-border w-full max-w-5xl overflow-hidden flex flex-col max-h-[90vh] relative my-auto print-container" id="struk-so-section">

                {/* Modal Header */}
                <div className="bg-slate-50 text-primary p-5 flex justify-between items-center border-b border-border no-print">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[11px] bg-primary text-white font-black px-2 py-0.5 rounded uppercase tracking-wider">Doc Viewer</span>
                      <h3 className="font-mono text-lg font-bold tracking-tight text-primary">{selectedSo.id}</h3>
                    </div>
                    <p className="text-sm text-secondary font-semibold mt-1">
                      Dokumen Sales Order &bull; Customer: <span className="font-bold text-primary">{selectedSo.pelanggan}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSoActionForm('print')}
                      className="p-2 bg-slate-800 hover:bg-slate-700 rounded-card text-slate-400 transition-all flex items-center gap-1.5 text-sm font-bold"
                      title="Cetak Struk SO"
                    >
                      <Printer size={15} />
                      <span className="hidden sm:inline">Cetak Struk</span>
                    </button>
                    <button
                      onClick={() => { setSelectedSo(null); setSoActionForm(null); }}
                      className="bg-slate-800 hover:bg-slate-700 text-slate-400 rounded-card p-2 transition-all"
                    >
                      <X size={18} />
                    </button>

                  </div>
                </div>
                {/* Sub-form Panels Overlay */}
                {soActionForm === 'shipment' ? (
                  /* 1. PENGIRIMAN BARANG SO */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-slate-50 border-l-4 border-primary p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider">Surat Jalan / Pengiriman Barang (Logistik SO)</h4>
                      <p className="text-sm text-secondary mt-1">Keluarkan barang fisik dari gudang utama dan kurangi stok gudang secara otomatis untuk dikirim ke customer.</p>

                    </div>
                    <div className="border border-border rounded-card overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-primary font-bold uppercase tracking-wider border-b border-border">
                          <tr>
                            <th className="p-3">Produk</th>
                            <th className="p-3 text-center">Pesanan</th>
                            <th className="p-3 text-center">Telah Kirim</th>
                            <th className="p-3 text-center">Sisa Kirim</th>
                            <th className="p-3 text-center">Stok Gudang</th>
                            <th className="p-3 text-right w-32">Kirim Sekarang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedSo.items.map((item: any, idx: number) => {
                            const shipped = item.qtyShipped ?? (selectedSo.statusLogistik === 'Terkirim' || selectedSo.statusLogistik === 'Selesai' ? item.qty : 0);
                            const sisa = Math.max(0, item.qty - shipped);
                            const prod = products.find(p => p.sku === item.sku);
                            const stockCount = prod ? prod.stok : 0;
                            return (
                              <tr key={item.sku} className="hover:bg-slate-50">
                                <td className="p-3">
                                  <div className="font-bold text-primary">{item.nama || 'Produk'}</div>
                                  <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                </td>
                                <td className="p-3 text-center font-semibold text-primary">{item.qty} Pcs</td>
                                <td className="p-3 text-center text-success font-bold">{shipped} Pcs</td>
                                <td className="p-3 text-center text-warning font-bold">{sisa} Pcs</td>
                                <td className={`p-3 text-center font-black ${stockCount < sisa ? 'text-danger' : 'text-primary'}`}>
                                  {stockCount} Pcs
                                </td>
                                <td className="p-3 text-right">
                                  <input
                                    type="text" inputMode="numeric"
                                    min="0"
                                    max={sisa}
                                    value={formatRibuan(soShipmentQtys[idx] ?? 0)}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseRibuan(e.target.value) || 0);
                                      setSoShipmentQtys(prev => ({ ...prev, [idx]: val }));
                                    }}
                                    disabled={sisa === 0}
                                    className="w-full p-2 border border-border rounded-card text-right text-sm font-bold disabled:bg-gray-100 disabled:text-slate-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                    </div>
                    <div className="flex justify-end gap-2.5 pt-4">
                      <button
                        onClick={() => setSoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitSoShipment(selectedSo.id)}
                        className="px-4 py-2 bg-primary hover:bg-teal-500 text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Kirim Barang
                      </button>
                    </div>
                  </div>
                ) : soActionForm === 'payment' ? (
                  /* 2. PELUNASAN PIUTANG SO */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-slate-50 border-l-4 border-emerald-500 p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider">Pencatatan Terima Piutang Customer</h4>
                      <p className="text-sm text-secondary mt-1">Catat pembayaran masuk (setoran kas/transfer bank) dari pelanggan untuk mengurangi piutang dagang pelanggan tersebut.</p>

                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-5 rounded-card border border-border">
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Total Nilai Penjualan</span>
                        <span className="text-xl font-black text-primary">Rp {selectedSo.grandTotal.toLocaleString('id-ID')}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-warning font-bold uppercase block">Sisa Piutang Belum Lunas</span>
                        <span className="text-xl font-black text-warning">
                          Rp {(selectedSo.grandTotal - (selectedSo.totalPaid ?? (selectedSo.statusBayar === 'Lunas' ? selectedSo.grandTotal : 0))).toLocaleString('id-ID')}
                        </span>

                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Nominal Pembayaran Diterima (Rp)</label>
                        <input
                          type="text" inputMode="numeric"
                          value={formatRibuan(soPaymentVal)}
                          onChange={(e) => setSoPaymentVal(Math.max(0, parseRibuan(e.target.value) || 0))}
                          className="p-2.5 border border-border rounded-card text-sm font-bold bg-white"
                        />

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Metode Pembayaran</label>
                        <select
                          value={soPaymentMetode}
                          onChange={(e) => setSoPaymentMetode(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm font-bold bg-white"
                        >
                          <option value="Transfer Bank">Transfer Bank / M-Banking</option>
                          <option value="Kas Tunai">Setoran Tunai Kasir</option>
                          <option value="EDC Mesin">Mesin EDC Kartu</option>
                        </select>

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Nomor Bukti Transfer / No Ref</label>
                        <input
                          type="text"
                          placeholder="Contoh: REF-9283729"
                          value={soPaymentRef}
                          onChange={(e) => setSoPaymentRef(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm"
                        />

                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary">Catatan Keuangan (Memo)</label>
                        <input
                          type="text"
                          placeholder="Tulis rincian setoran..."
                          value={soPaymentMemo}
                          onChange={(e) => setSoPaymentMemo(e.target.value)}
                          className="p-2.5 border border-border rounded-card text-sm"
                        />

                      </div>
                    </div>
                    <div className="flex justify-end gap-2.5 pt-4 border-t border-border">
                      <button
                        onClick={() => setSoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitSoPayment(selectedSo.id)}
                        className="px-4 py-2 bg-success hover:bg-success text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Simpan Pembayaran
                      </button>
                    </div>
                  </div>
                ) : soActionForm === 'retur' ? (
                  /* 3. RETUR BARANG SO (Customer return) */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="bg-rose-50 border-l-4 border-danger p-4 rounded-r-lg">
                      <h4 className="text-sm font-black text-danger uppercase tracking-wider">Formulir Retur Barang dari Pelanggan</h4>
                      <p className="text-sm text-secondary mt-1">Mencatat barang yang dikembalikan oleh pelanggan karena rusak/tidak sesuai. Stok gudang akan ditambahkan kembali &amp; piutang customer dikoreksi.</p>

                    </div>
                    <div className="border border-red-100 rounded-card overflow-hidden bg-white">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-danger/10 text-danger font-bold uppercase border-b border-red-100">
                          <tr>
                            <th className="p-3">Produk</th>
                            <th className="p-3 text-center">Telah Dikirim</th>
                            <th className="p-3 text-center">Telah Diretur</th>
                            <th className="p-3 text-center">Batas Maks Retur</th>
                            <th className="p-3 text-right w-36">Retur Sekarang</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {selectedSo.items.map((item: any, idx: number) => {
                            const shipped = item.qtyShipped ?? (selectedSo.statusLogistik === 'Terkirim' || selectedSo.statusLogistik === 'Selesai' ? item.qty : 0);
                            const returned = item.qtyReturned ?? 0;
                            const maxRetur = Math.max(0, shipped - returned);
                            return (
                              <tr key={`${item.sku}-${idx}`} className="hover:bg-danger/10 transition-colors">
                                <td className="p-3">
                                  <div className="font-bold text-primary">{item.nama || 'Produk'}</div>
                                  <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                </td>
                                <td className="p-3 text-center text-success font-bold">{shipped} Pcs</td>
                                <td className="p-3 text-center text-danger font-bold">{returned} Pcs</td>
                                <td className="p-3 text-center text-secondary font-semibold">{maxRetur} Pcs</td>
                                <td className="p-3 text-right">
                                  <input
                                    type="text" inputMode="numeric"
                                    min="0"
                                    max={maxRetur}
                                    value={formatRibuan(soReturQtys[idx] ?? 0)}
                                    onChange={(e) => {
                                      const val = Math.max(0, parseRibuan(e.target.value) || 0);
                                      setSoReturQtys(prev => ({ ...prev, [idx]: val }));
                                    }}
                                    disabled={maxRetur === 0}
                                    className="w-full p-2 border border-danger/30 rounded-card text-right text-sm font-bold disabled:bg-gray-100 disabled:text-slate-400"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                    </div>
                    <div className="flex flex-col gap-1.5 bg-slate-50 p-4 rounded-card border border-border">
                      <label className="text-[11px] font-black uppercase text-secondary">Alasan Retur Pelanggan (Wajib)</label>
                      <textarea
                        rows={2}
                        placeholder="Contoh: Ukuran salah / cacat pengemasan dari pabrik..."
                        value={soReturAlasan}
                        onChange={(e) => setSoReturAlasan(e.target.value)}
                        className="p-2 border border-border rounded-card text-sm bg-white"
                      />

                    </div>
                    <div className="flex justify-end gap-2.5 pt-4">
                      <button
                        onClick={() => setSoActionForm(null)}
                        className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-primary text-sm font-bold rounded-card transition-all"
                      >
                        Batal
                      </button>
                      <button
                        onClick={() => submitSoRetur(selectedSo.id)}
                        className="px-4 py-2 bg-danger hover:bg-danger text-white text-sm font-bold rounded-card shadow-md transition-all"
                      >
                        Proses Retur Pelanggan
                      </button>
                    </div>
                  </div>
                ) : soActionForm === 'print' ? (
                  /* 4. STRUK CETAK SALES ORDER */
                  <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-slate-50 p-4 rounded-card border border-border gap-4">
                      <div>
                        <p className="text-sm text-primary font-semibold">Struk Belanja Pelanggan.</p>
                        <p className="text-[11px] text-secondary mt-0.5">*Jika tombol tidak merespon di AI Studio, klik tombol <strong>Buka di Tab Baru</strong> di kanan atas preview.</p>
                      </div>
                      <button
                        onClick={() => window.print()}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-card shadow transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Printer size={13} />
                        Cetak Struk / PDF
                      </button>

                    </div>
                    <div id="print-area" className="border border-border p-6 rounded-card bg-neutral-50 space-y-4 text-primary font-mono text-sm max-w-sm mx-auto shadow-inner">
                      <div className="text-center space-y-1">
                        <h2 className="text-sm font-bold uppercase">PT. INO JAYA MANDIRI</h2>
                        <p className="text-[11px] text-secondary">ITC Mangga Dua, Lt. 2 Blok A, Jakarta</p>
                        <p className="text-[11px] text-secondary">Telp: 0812-9482-9382</p>
                        <p className="border-b border-dashed border-gray-400 py-1"></p>

                      </div>
                      <div className="space-y-1 text-[11px]">
                        <p>No Transaksi: <span className="font-bold">{selectedSo.id}</span></p>
                        <p>Tanggal: {selectedSo.tanggal}</p>
                        <p>Pelanggan: <span className="font-bold">{selectedSo.pelanggan}</span></p>
                        <p>Pembayaran: {selectedSo.metode} ({selectedSo.statusBayar})</p>
                        <p className="border-b border-dashed border-gray-400 py-1"></p>

                      </div>
                      <div className="space-y-2">
                        {selectedSo.items.map((item: any) => (
                          <div key={item.sku} className="text-[11px]">
                            <div className="font-bold">{item.nama}</div>
                            <div className="flex justify-between text-[11px] text-secondary pl-2">
                              <span>{item.qty} Pcs x Rp {item.harga.toLocaleString('id-ID')}</span>
                              <span>Rp {item.subtotal.toLocaleString('id-ID')}</span>
                            </div>
                          </div>
                        ))}
                        <p className="border-b border-dashed border-gray-400 py-1"></p>

                      </div>
                      <div className="space-y-1 text-[11px] text-right">
                        <p className="flex justify-between font-bold">
                          <span>Total Tagihan:</span>
                          <span>Rp {selectedSo.grandTotal.toLocaleString('id-ID')}</span>
                        </p>
                        {selectedSo.totalPaid !== undefined && (
                          <p className="flex justify-between">
                            <span>Bayar Setor:</span>
                            <span>Rp {selectedSo.totalPaid.toLocaleString('id-ID')}</span>
                          </p>
                        )}

                      </div>
                      <div className="text-center pt-6 space-y-1 text-[11px] text-secondary">
                        <p>Terima Kasih Telah Berbelanja</p>
                        <p>Barang yang sudah dibeli tidak dapat ditukar</p>
                        <p className="font-bold text-primary">Powered by INO ERP v1.0</p>

                      </div>
                    </div>
                    <div className="flex justify-end pt-4">
                      <button
                        onClick={() => setSoActionForm(null)}
                        className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-bold rounded-card transition-all"
                      >
                        Kembali Ke Detail
                      </button>
                    </div>
                  </div>
                ) : (
                  /* 5. DOKUMEN GENERAL VIEW */
                  <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Top Status Banner & Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-card border border-border">
                      <div className="flex flex-wrap gap-2.5">
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase font-bold text-slate-400">Pengiriman</span>
                          <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 ${selectedSo.statusLogistik === 'Terkirim' || selectedSo.statusLogistik === 'Selesai' ? 'bg-success bg-opacity-15 text-success' :
                              selectedSo.statusLogistik === 'Terkirim Sebagian' ? 'bg-indigo-100 text-indigo-700' :
                                selectedSo.statusLogistik === 'Menunggu' || selectedSo.statusLogistik === 'Menunggu Pengiriman' ? 'bg-warning bg-opacity-15 text-warning' :
                                  selectedSo.statusLogistik === 'Void' ? 'bg-danger/20 text-danger' : 'bg-gray-100 text-secondary'
                            }`}>
                            {selectedSo.statusLogistik}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] uppercase font-bold text-slate-400">Keuangan</span>
                          {selectedSo.hasReturn ? (
                            <span className="px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 bg-amber-100 text-amber-800 border border-amber-300">
                              {selectedSo.statusBayar === 'Lunas' ? 'LUNAS (KOREKSI RETUR)' : 'BELUM LUNAS (DIPOTONG RETUR)'}
                            </span>
                          ) : (
                            <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase text-center mt-0.5 ${selectedSo.statusBayar === 'Lunas' ? 'bg-success bg-opacity-15 text-success' :
                                selectedSo.statusBayar === 'Cicilan' ? 'bg-indigo-100 text-indigo-700' :
                                  selectedSo.statusBayar === 'Belum Lunas' ? 'bg-danger bg-opacity-15 text-danger' :
                                    'bg-gray-100 text-secondary'
                              }`}>
                              {selectedSo.statusBayar}
                            </span>
                          )}
                        </div>
                        {selectedSo.totalPaid !== undefined && (
                          <div className="flex flex-col">
                            <span className="text-[11px] uppercase font-bold text-slate-400">Telah Disetor</span>
                            <span className="text-sm font-bold text-success mt-0.5">
                              Rp {selectedSo.totalPaid.toLocaleString('id-ID')}
                            </span>
                          </div>
                        )}

                      </div>
                      <div className="flex gap-2 relative">
                        {selectedSo.statusLogistik !== 'Terkirim' && selectedSo.statusLogistik !== 'Void' && (
                          <button
                            onClick={() => handleOpenSoShipment(selectedSo)}
                            className="px-3.5 py-2 bg-primary hover:bg-success text-white text-sm font-bold rounded-card shadow transition-all"
                          >
                            Proses Kirim (SJ)
                          </button>
                        )}
                        {selectedSo.statusBayar !== 'Lunas' && selectedSo.statusLogistik !== 'Void' && (
                          <button
                            onClick={() => handleOpenSoPayment(selectedSo)}
                            className="px-3.5 py-2 bg-success hover:bg-success text-white text-sm font-bold rounded-card shadow transition-all"
                          >
                            Terima Pembayaran
                          </button>
                        )}

                        {/* Kebab dropdown */}
                        <div className="relative">
                          <button
                            onClick={() => setSoShowKebab(!soShowKebab)}
                            className="p-2 bg-gray-200 hover:bg-gray-300 text-primary rounded-card transition-all"
                          >
                            &bull;&bull;&bull;
                          </button>
                          {soShowKebab && (
                            <div className="absolute right-0 bottom-full mb-2 bg-white rounded-card shadow-xl border border-border w-48 z-50 overflow-hidden divide-y divide-slate-100">
                              <button
                                onClick={() => { setSoShowKebab(false); handleOpenSoRetur(selectedSo); }}
                                disabled={selectedSo.statusLogistik === 'Void'}
                                className="w-full text-left p-2.5 text-sm font-semibold text-primary hover:bg-danger/10 hover:text-danger transition-all disabled:opacity-50 disabled:pointer-events-none"
                              >
                                Retur Barang Penjualan
                              </button>
                              <button
                                onClick={() => {
                                  setSoShowKebab(false);
                                  if (window.confirm("Apakah Anda yakin melakukan VOID pada SO ini? Tindakan ini akan mengembalikan stok & membatalkan piutang.")) {
                                    handleVoidSO(selectedSo.id);
                                    setSelectedSo(null);
                                  }
                                }}
                                disabled={selectedSo.statusLogistik === 'Void'}
                                className="w-full text-left p-2.5 text-sm font-black text-danger hover:bg-danger/20 transition-all disabled:opacity-50 disabled:pointer-events-none"
                              >
                                Void (Batalkan) SO
                              </button>
                            </div>
                          )}

                        </div>
                      </div>
                    </div>
                    {/* Metadata Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-card border border-border">
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Metode Pembayaran</span>
                        <span className="text-sm font-semibold text-primary">{selectedSo.metode}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 font-bold uppercase block">Tanggal Penjualan</span>
                        <span className="text-sm font-semibold text-primary">{selectedSo.tanggal}</span>
                      </div>
                      <div>
                        <span className="text-[11px] text-success font-bold uppercase block">Total Nilai Penjualan</span>
                        <span className="text-sm font-bold text-primary">Rp {selectedSo.grandTotal.toLocaleString('id-ID')}</span>
                      </div>
                      {selectedSo.catatan && (
                        <div className="col-span-1 sm:col-span-3">
                          <span className="text-[11px] text-slate-400 font-bold uppercase block">Catatan Tambahan / Memo</span>
                          <p className="text-sm text-secondary italic mt-0.5">{selectedSo.catatan}</p>
                        </div>
                      )}

                    </div>
                    {/* Order Items Table */}
                    <div>
                      <h4 className="text-sm font-black text-text-primary uppercase tracking-wider mb-2">Rincian Produk Dipesan</h4>
                      <div className="border border-border rounded-card overflow-hidden bg-white shadow-sm">
                        <table className="w-full text-sm text-left">
                          <thead className="bg-text-primary text-white font-bold uppercase tracking-wider">
                            <tr>
                              <th className="p-3">SKU / Nama Barang</th>
                              <th className="p-3 text-center">Pesanan</th>
                              <th className="p-3 text-center">Telah Kirim</th>
                              <th className="p-3 text-right">Harga Satuan</th>
                              <th className="p-3 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {selectedSo.items.map((item: any, idx: number) => {
                              const sended = item.qtyShipped ?? (selectedSo.statusLogistik === 'Terkirim' || selectedSo.statusLogistik === 'Selesai' ? item.qty : 0);
                              return (
                                <tr key={item.sku} className="hover:bg-slate-50">
                                  <td className="p-3">
                                    <div className="font-bold text-text-primary">{item.nama || 'Produk'}</div>
                                    <div className="font-mono text-[11px] text-secondary">{item.sku}</div>
                                  </td>
                                  <td className="p-3 text-center font-semibold text-primary">{item.qty} Pcs</td>
                                  <td className="p-3 text-center font-bold text-success">{sended} Pcs</td>
                                  <td className="p-3 text-right text-secondary">Rp {item.harga.toLocaleString('id-ID')}</td>
                                  <td className="p-3 text-right font-black text-primary">Rp {item.subtotal.toLocaleString('id-ID')}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                      </div>
                    </div>
                    {/* Retur History Panel */}
                    {selectedSo.returItems && selectedSo.returItems.length > 0 && (
                      <div className="bg-danger/10 p-4 rounded-card border border-danger/30 mt-4">
                        <h4 className="text-sm font-black text-danger uppercase tracking-wider mb-2 flex items-center gap-1">
                          <CornerUpLeft size={13} />
                          <span>Riwayat Retur Penjualan</span>
                        </h4>
                        <div className="overflow-x-auto text-sm">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-danger/30 text-danger font-bold uppercase text-xs">
                                <th className="pb-1.5">Tanggal</th>
                                <th className="pb-1.5">Barang</th>
                                <th className="pb-1.5 text-center">Kuantitas</th>
                                <th className="pb-1.5">Alasan Retur</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-red-100">
                              {selectedSo.returItems.map((r: any, idx: number) => (
                                <tr key={idx} className="text-red-950 font-semibold">
                                  <td className="py-2">{r.tanggal}</td>
                                  <td className="py-2">{r.nama} ({r.sku})</td>
                                  <td className="py-2 text-center text-danger font-black">{r.qty} Pcs</td>
                                  <td className="py-2 italic text-secondary">{r.alasan}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Footer Controls */}
                <div className="bg-gray-50 px-6 py-4 border-t border-border flex justify-end gap-2">
                  <button
                    onClick={() => { setSelectedSo(null); setSoActionForm(null); }}
                    className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2 rounded-card text-sm font-bold transition-all shadow-md"
                  >
                    Tutup Viewer
                  </button>

                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: PRODUCT TRANSACTION HISTORY */}
          {viewingProductTx && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden border border-border max-h-[90vh] relative my-auto">
                <div className="bg-slate-50 text-primary p-5 flex justify-between items-center border-b border-border">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/15 p-2 rounded-card">
                      <Package className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-primary">Rincian & Kartu Kendali Stok</h3>
                      <p className="text-[11px] text-secondary font-semibold">SKU: <span className="font-mono font-bold text-primary">{viewingProductTx.sku}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingProductTx(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-card text-slate-400 hover:text-primary transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>

                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-card border border-border text-sm">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Nama Barang</span>
                      <span className="font-bold text-primary text-sm mt-0.5 block">{viewingProductTx.nama}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Kategori</span>
                      <span className="font-bold text-primary mt-0.5 block">{viewingProductTx.kategori || '-'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Stok Fisik / Buku Besar</span>
                      <div className="mt-0.5 flex flex-col gap-1">
                        <span className="font-mono font-bold text-success text-sm">{viewingProductTx.stok} {viewingProductTx.satuan}</span>
                        {getOnOrderQty(viewingProductTx.sku) > 0 && (
                          <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-[4px] text-[10px] font-black uppercase inline-block w-max">
                            Dalam Pesanan: +{getOnOrderQty(viewingProductTx.sku)} (PO Aktif)
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Estimasi HPP</span>
                      <span className="font-mono font-bold text-primary mt-0.5 block">Rp {(viewingProductTx?.hpp || 0).toLocaleString('id-ID')}</span>

                    </div>
                  </div>
                  {/* Transaction History Section */}
                  <div>
                    <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <History size={13} className="text-secondary" />
                      <span>Riwayat Mutasi & Buku Kendali Stok (Realtime)</span>
                    </h4>
                    <div className="border border-border rounded-card overflow-hidden bg-white shadow-sm overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 border-b border-border text-primary font-bold uppercase tracking-wider">
                          {/* ponytail: lock struktur & urutan kolom laporan mutasi persediaan agar tidak ter-reset */}
                          <tr>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3">Jenis Transaksi</th>
                            <th className="p-3 text-center">Masuk (+)</th>
                            <th className="p-3 text-center">Keluar (-)</th>
                            <th className="p-3 text-center">Saldo Akhir / Sisa Qty</th>
                            <th className="p-3 text-right">Harga Unit</th>
                            <th className="p-3 text-right">Total Nilai</th>
                            <th className="p-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {deriveProductLedgerRows(viewingProductTx.sku).length > 0 ? (
                            deriveProductLedgerRows(viewingProductTx.sku).map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-secondary">{row[0]}</td>
                                <td className="p-3 font-semibold text-primary">{row[1]}</td>
                                <td className="p-3 text-center font-bold text-success">{row[2]}</td>
                                <td className="p-3 text-center font-bold text-danger">{row[3]}</td>
                                <td className="p-3 text-center font-mono font-black text-primary bg-slate-50/50">{row[4]} {row[4] !== '-' ? viewingProductTx.satuan : ''}</td>
                                <td className="p-3 text-right text-secondary font-mono">{row[5]}</td>
                                <td className="p-3 text-right font-bold text-primary font-mono">{row[6]}</td>
                                <td className="p-3 text-center">
                                  <span className={`px-2 py-0.5 rounded-[4px] text-[11px] font-black uppercase ${row[7].toUpperCase().includes('DITERIMA') || row[7].toUpperCase().includes('TERKIRIM') || row[7].toUpperCase().includes('SELESAI') || row[7].toUpperCase().includes('TERJUAL') ? 'bg-success/20 text-success' :
                                      row[7].toUpperCase().includes('RETUR') ? 'bg-warning/20 text-warning' :
                                        row[7].toUpperCase().includes('OPNAME') ? 'bg-info/20 text-info' :
                                          row[7].toUpperCase().includes('DIPESAN') ? 'bg-sky-50 text-sky-700 border border-sky-200' : 'bg-slate-200 text-slate-600'
                                    }`}>
                                    {row[7]}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                                Belum ada riwayat transaksi tercatat untuk produk ini.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-border flex justify-end">
                  <button
                    onClick={() => setViewingProductTx(null)}
                    className="bg-slate-800 hover:bg-text-primary text-white px-5 py-2 rounded-card text-sm font-bold transition-all shadow"
                  >
                    Tutup Rincian
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: CUSTOMER TRANSACTION HISTORY */}
          {viewingCustomerTx && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #buku-besar-customer-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; position: static !important; max-height: none !important; overflow: visible !important; }
                  #buku-besar-customer-section * { overflow: visible !important; }
                }
              `}} />
              <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden border border-border max-h-[90vh] relative my-auto print-container" id="buku-besar-customer-section">
                <div className="bg-slate-50 text-primary p-5 flex justify-between items-center border-b border-border no-print">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/15 p-2 rounded-card">
                      <Users className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-primary">Kartu Piutang & Transaksi Pelanggan</h3>
                      <p className="text-[11px] text-secondary font-semibold">ID Customer: <span className="font-mono font-bold text-primary">{viewingCustomerTx.id}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingCustomerTx(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-card text-slate-400 hover:text-primary transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>

                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-card border border-border text-sm">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Instansi / Nama</span>
                      <span className="font-bold text-primary text-sm mt-0.5 block">{viewingCustomerTx.nama}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">PIC Kontak & Telp</span>
                      <span className="font-bold text-primary mt-0.5 block">{viewingCustomerTx.kontak} ({viewingCustomerTx.telp})</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Email</span>
                      <span className="font-medium text-secondary mt-0.5 block truncate">{viewingCustomerTx.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Saldo Piutang Dagang</span>
                      <span className="font-mono font-bold text-primary text-sm mt-0.5 block">Rp {viewingCustomerTx.piutang.toLocaleString('id-ID')}</span>

                    </div>
                  </div>
                  {/* Transaction History Section */}
                  <div>
                    <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <History size={13} className="text-secondary" />
                      <span>Buku Besar Pembantu Piutang (Debit & Kredit)</span>
                    </h4>
                    <div className="border border-border rounded-card overflow-hidden bg-white shadow-sm overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 border-b border-border text-primary font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3">No. Transaksi (Ref)</th>
                            <th className="p-3">Keterangan</th>
                            <th className="p-3 text-right">Debit (Penjualan)</th>
                            <th className="p-3 text-right">Kredit (Pelunasan)</th>
                            <th className="p-3 text-right">Saldo Piutang</th>
                            <th className="p-3 text-center font-bold">Status Bayar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {deriveCustomerLedgerRows(viewingCustomerTx.id).length > 0 ? (
                            deriveCustomerLedgerRows(viewingCustomerTx.id).map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-secondary">{row[0]}</td>
                                <td className="p-3">
                                  <button
                                    onClick={() => {
                                      const so = salesOrders.find(s => s.id === row[1]);
                                      if (so) {
                                        setSelectedSo(so);
                                        setViewingCustomerTx(null);
                                      }
                                    }}
                                    className="font-mono font-bold text-primary hover:underline hover:text-primary-hover transition-all"
                                    title="Klik untuk buka dokumen Sales Order"
                                  >
                                    {row[1]}
                                  </button>
                                </td>
                                <td className="p-3 text-secondary font-medium">{row[7]}</td>
                                <td className="p-3 text-right text-primary font-mono font-semibold">{row[2]}</td>
                                <td className="p-3 text-right text-success font-mono font-bold">{row[3]}</td>
                                <td className="p-3 text-right font-black text-primary font-mono bg-success/10">{row[4]}</td>
                                <td className="p-3 text-center">
                                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase inline-block ${row[5] === 'Lunas' ? 'bg-success bg-opacity-15 text-success' :
                                      row[5] === 'Cicilan' ? 'bg-indigo-100 text-indigo-700' : 'bg-danger/20 text-danger'
                                    }`}>
                                    {row[5]}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                Belum ada riwayat transaksi.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>

                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-border flex justify-between items-center print:hidden">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const ledger = deriveCustomerLedgerRows(viewingCustomerTx.id);
                        const headers = ['TANGGAL', 'DOKUMEN REF', 'KETERANGAN MUTASI', 'DEBIT (+)', 'KREDIT (-)', 'SALDO PIUTANG'];
                        const rows = ledger.map(l => [
                          l[0], l[1], l[7],
                          l[2],
                          l[3],
                          l[4]
                        ]);
                        generateReportPDF(
                          'BUKU BESAR PELANGGAN / PIUTANG',
                          `Instansi: ${viewingCustomerTx.nama} (${viewingCustomerTx.id}) | Kontak: ${viewingCustomerTx.kontak}`,
                          new Date().toLocaleDateString('id-ID'),
                          headers,
                          rows,
                          [],
                          `Buku_Besar_Customer_${viewingCustomerTx.id}.pdf`,
                          'landscape'
                        );
                      }}
                      className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Printer size={14} />
                      <span>Download Buku Besar Instansi (PDF)</span>
                    </button>
                    <button
                      onClick={() => {
                        const ledger = deriveCustomerLedgerRows(viewingCustomerTx.id);
                        const wsData: any[][] = [
                          ['BUKU BESAR PELANGGAN / PIUTANG'],
                          ['Nama Instansi:', viewingCustomerTx.nama],
                          ['ID Customer:', viewingCustomerTx.id],
                          ['Kontak:', `${viewingCustomerTx.kontak} (${viewingCustomerTx.telp})`],
                          ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
                          [''],
                          ['TANGGAL', 'DOKUMEN REF', 'KETERANGAN MUTASI', 'DEBIT (+)', 'KREDIT (-)', 'SALDO PIUTANG']
                        ];
                        ledger.forEach(row => {
                          const deb = typeof row[3] === 'number' ? row[3] : (parseInt(row[3].toString().replace(/\D/g, '')) || 0);
                          const kre = typeof row[4] === 'number' ? row[4] : (parseInt(row[4].toString().replace(/\D/g, '')) || 0);
                          const sal = typeof row[5] === 'number' ? row[5] : (parseInt(row[5].toString().replace(/\D/g, '')) || 0);
                          wsData.push([row[0], row[1], row[2], deb, kre, sal]);
                        });
                        if (typeof XLSX !== 'undefined') {
                          const ws = XLSX.utils.aoa_to_sheet(wsData);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Buku Besar");
                          XLSX.writeFile(wb, `Buku_Besar_${viewingCustomerTx.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
                        } else {
                          triggerToast('Library Excel tidak ditemukan', 'error');
                        }
                      }}
                      className="px-4 py-2 bg-success hover:bg-success/90 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Ekspor Buku Besar (.xlsx)</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setViewingCustomerTx(null)}
                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-5 py-2 rounded-card text-sm font-bold transition-all shadow-sm"
                  >
                    Tutup Rincian
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* OVERLAY: SUPPLIER TRANSACTION HISTORY */}
          {viewingSupplierTx && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <style dangerouslySetInnerHTML={{
                __html: `
                @media print {
                  body { background: white !important; color: black !important; }
                  header, footer, nav, aside, .no-print, button, input[type="checkbox"], select { display: none !important; }
                  #buku-besar-supplier-section { display: block !important; width: 100% !important; margin: 0 !important; padding: 0 !important; box-shadow: none !important; border: none !important; position: static !important; max-height: none !important; overflow: visible !important; }
                  #buku-besar-supplier-section * { overflow: visible !important; }
                }
              `}} />
              <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden border border-border max-h-[90vh] relative my-auto print-container" id="buku-besar-supplier-section">
                <div className="bg-slate-50 text-primary p-5 flex justify-between items-center border-b border-border no-print">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/15 p-2 rounded-card">
                      <Users className="text-primary" size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-primary">Kartu Hutang & Riwayat Supplier</h3>
                      <p className="text-[11px] text-secondary font-semibold">ID Supplier: <span className="font-mono font-bold text-primary">{viewingSupplierTx.id}</span></p>
                    </div>
                  </div>
                  <button
                    onClick={() => setViewingSupplierTx(null)}
                    className="p-1.5 hover:bg-slate-100 rounded-card text-slate-400 hover:text-primary transition-all cursor-pointer"
                  >
                    <X size={18} />
                  </button>

                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-6">
                  {/* Metadata Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-card border border-border text-sm">
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Perusahaan / Vendor</span>
                      <span className="font-bold text-primary text-sm mt-0.5 block">{viewingSupplierTx.nama}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">PIC Kontak & Telp</span>
                      <span className="font-bold text-primary mt-0.5 block">{viewingSupplierTx.kontak} ({viewingSupplierTx.telp})</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Email</span>
                      <span className="font-medium text-secondary mt-0.5 block truncate">{viewingSupplierTx.email}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-semibold block uppercase text-xs">Saldo Hutang Dagang</span>
                      <span className="font-mono font-bold text-danger text-sm mt-0.5 block">Rp {viewingSupplierTx.hutang.toLocaleString('id-ID')}</span>

                    </div>
                  </div>
                  {/* Transaction History Section */}
                  <div>
                    <h4 className="text-sm font-black text-primary uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <History size={13} className="text-secondary" />
                      <span>Buku Besar Pembantu Hutang (Debit & Kredit)</span>
                    </h4>
                    <div className="border border-border rounded-card overflow-hidden bg-white shadow-sm overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-100 border-b border-border text-primary font-bold uppercase tracking-wider">
                          <tr>
                            <th className="p-3">Tanggal</th>
                            <th className="p-3">No. Transaksi (Ref)</th>
                            <th className="p-3">Keterangan</th>
                            <th className="p-3 text-right">Debit (Pembayaran Kas)</th>
                            <th className="p-3 text-right">Kredit (Pembelian)</th>
                            <th className="p-3 text-right">Saldo Hutang</th>
                            <th className="p-3 text-center font-bold">Status Bayar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {deriveSupplierLedgerRows(viewingSupplierTx.id).length > 0 ? (
                            deriveSupplierLedgerRows(viewingSupplierTx.id).map((row, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="p-3 font-mono text-secondary">{row[0]}</td>
                                <td className="p-3">
                                  <button
                                    onClick={() => {
                                      const po = purchaseOrders.find(p => p.id === row[1]);
                                      if (po) {
                                        setSelectedPo(po);
                                        setViewingSupplierTx(null);
                                      }
                                    }}
                                    className="font-mono font-bold text-primary hover:underline hover:text-primary-hover transition-all"
                                    title="Klik untuk buka dokumen Purchase Order"
                                  >
                                    {row[1]}
                                  </button>
                                </td>
                                <td className="p-3 text-secondary font-medium">{row[7]}</td>
                                <td className="p-3 text-right text-primary font-mono font-semibold">{row[2]}</td>
                                <td className="p-3 text-right text-danger font-mono font-bold">{row[3]}</td>
                                <td className="p-3 text-right font-black text-danger font-mono bg-danger/10">{row[4]}</td>
                                <td className="p-3 text-center">
                                  <span className={`px-2.5 py-0.5 rounded text-[11px] font-black uppercase inline-block ${row[5] === 'Lunas' ? 'bg-success bg-opacity-15 text-success' :
                                      row[5] === 'Cicilan' ? 'bg-indigo-100 text-indigo-700' : 'bg-danger/20 text-danger'
                                    }`}>
                                    {row[5]}
                                  </span>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                                Belum ada riwayat transaksi.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
                <div className="bg-slate-50 px-6 py-4 border-t border-border flex justify-between items-center print:hidden">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const ledger = deriveSupplierLedgerRows(viewingSupplierTx.id);
                        const headers = ['TANGGAL', 'DOKUMEN REF', 'KETERANGAN MUTASI', 'DEBIT (+)', 'KREDIT (-)', 'SALDO HUTANG'];
                        const rows = ledger.map(l => [
                          l[0], l[1], l[7],
                          l[2],
                          l[3],
                          l[4]
                        ]);
                        generateReportPDF(
                          'BUKU BESAR SUPPLIER / HUTANG',
                          `Instansi: ${viewingSupplierTx.nama} (${viewingSupplierTx.id}) | Kontak: ${viewingSupplierTx.kontak}`,
                          new Date().toLocaleDateString('id-ID'),
                          headers,
                          rows,
                          [],
                          `Buku_Besar_Supplier_${viewingSupplierTx.id}.pdf`,
                          'landscape'
                        );
                      }}
                      className="px-4 py-2 bg-slate-800 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Printer size={14} />
                      <span>Download Buku Besar Instansi (PDF)</span>
                    </button>
                    <button
                      onClick={() => {
                        const ledger = deriveSupplierLedgerRows(viewingSupplierTx.id);
                        const wsData: any[][] = [
                          ['BUKU BESAR SUPPLIER / HUTANG'],
                          ['Nama Vendor:', viewingSupplierTx.nama],
                          ['ID Supplier:', viewingSupplierTx.id],
                          ['Kontak:', `${viewingSupplierTx.kontak} (${viewingSupplierTx.telp})`],
                          ['Tanggal Cetak:', new Date().toLocaleDateString('id-ID')],
                          [''],
                          ['TANGGAL', 'DOKUMEN REF', 'KETERANGAN MUTASI', 'DEBIT (+)', 'KREDIT (-)', 'SALDO HUTANG']
                        ];
                        ledger.forEach(row => {
                          const deb = typeof row[3] === 'number' ? row[3] : (parseInt(row[3].toString().replace(/\D/g, '')) || 0);
                          const kre = typeof row[4] === 'number' ? row[4] : (parseInt(row[4].toString().replace(/\D/g, '')) || 0);
                          const sal = typeof row[5] === 'number' ? row[5] : (parseInt(row[5].toString().replace(/\D/g, '')) || 0);
                          wsData.push([row[0], row[1], row[2], deb, kre, sal]);
                        });
                        if (typeof XLSX !== 'undefined') {
                          const ws = XLSX.utils.aoa_to_sheet(wsData);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Buku Besar");
                          XLSX.writeFile(wb, `Buku_Besar_${viewingSupplierTx.id}_${new Date().toISOString().slice(0, 10)}.xlsx`);
                        } else {
                          triggerToast('Library Excel tidak ditemukan', 'error');
                        }
                      }}
                      className="px-4 py-2 bg-success hover:bg-success/90 text-white text-sm font-semibold rounded-card shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileSpreadsheet size={14} />
                      <span>Ekspor Buku Besar (.xlsx)</span>
                    </button>
                  </div>
                  <button
                    onClick={() => setViewingSupplierTx(null)}
                    className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 px-5 py-2 rounded-card text-sm font-bold transition-all shadow-sm"
                  >
                    Tutup Rincian
                  </button>
                </div>
              </div>
            </div>
          )}

          {showCreateCompanyModal && (
            <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-100 relative my-auto">
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white py-4 px-6 flex justify-between items-center">
                  <h3 className="font-extrabold text-base flex items-center gap-2">
                    <span className="text-xl">🏢</span>
                    <span>Inisialisasi Instansi &amp; Perusahaan Baru</span>
                  </h3>
                  <button
                    onClick={() => setShowCreateCompanyModal(false)}
                    className="text-slate-400 hover:text-white transition-colors text-2xl font-bold"
                  >
                    &times;
                  </button>

                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newCompanyForm.nama.trim()) {
                      alert("Nama perusahaan wajib diisi!");
                      return;
                    }
                    if (window.confirm(`PERINGATAN: Membuat instansi baru "${newCompanyForm.nama}" akan menghapus/mengganti data perusahaan yang aktif saat ini. Apakah Anda yakin ingin melanjutkan?`)) {
                      handleCreateCompany(newCompanyForm);
                    }
                  }}
                  className="p-6 space-y-4 text-left"
                >
                  <div className="bg-warning/10 border border-warning/30 text-warning p-3.5 rounded-card text-sm space-y-1">
                    <p className="font-extrabold flex items-center gap-1">
                      ⚠️ PERINGATAN RE-INISIALISASI DATA
                    </p>
                    <p className="leading-relaxed opacity-90 text-[11px]">
                      Sistem akan membuat database baru dan memuat template yang dipilih. Data transaksi dan master aktif saat ini akan digantikan seluruhnya.
                    </p>
                  </div>
                  <div className="space-y-3.5">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-black uppercase text-secondary tracking-wider">Nama Perusahaan / Toko</label>
                      <input
                        type="text"
                        required
                        value={newCompanyForm.nama}
                        onChange={(e) => setNewCompanyForm({ ...newCompanyForm, nama: e.target.value })}
                        placeholder="Cth: PT. Bakeri Sentosa, Toko Kelontong Jaya"
                        className="w-full border border-border p-2.5 rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary tracking-wider">Telepon / HP</label>
                        <input
                          type="text"
                          value={newCompanyForm.telp}
                          onChange={(e) => setNewCompanyForm({ ...newCompanyForm, telp: e.target.value })}
                          placeholder="Cth: 08123456789"
                          className="w-full border border-border p-2.5 rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary focus:border-primary outline-none font-mono"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-black uppercase text-secondary tracking-wider">Kota Operasional</label>
                        <input
                          type="text"
                          value={newCompanyForm.kota}
                          onChange={(e) => setNewCompanyForm({ ...newCompanyForm, kota: e.target.value })}
                          placeholder="Cth: Denpasar, Jakarta"
                          className="w-full border border-border p-2.5 rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary focus:border-primary outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-black uppercase text-secondary tracking-wider">Alamat Lengkap</label>
                      <textarea
                        rows={2}
                        value={newCompanyForm.alamat}
                        onChange={(e) => setNewCompanyForm({ ...newCompanyForm, alamat: e.target.value })}
                        placeholder="Cth: Jl. Gatot Subroto No. 123, Kel. Dangin Puri"
                        className="w-full border border-border p-2.5 rounded-card text-sm font-bold text-primary focus:ring-1 focus:ring-primary focus:border-primary outline-none resize-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 bg-slate-50 border border-border p-3.5 rounded-card">
                      <label className="text-[11px] font-black uppercase text-success tracking-wider mb-1">Pilih Template Basis Bisnis</label>
                      <select
                        value={newCompanyForm.tipeTemplate}
                        onChange={(e) => setNewCompanyForm({ ...newCompanyForm, tipeTemplate: e.target.value })}
                        className="w-full border border-border p-2.5 rounded-card text-sm font-extrabold text-primary bg-white focus:ring-1 focus:ring-primary"
                      >
                        <option value="empty">Mulai dari Nol (Bersih / Kosong Tanpa Transaksi & Master)</option>
                        <option value="bakery">Sourdough Bakery & Manufaktur (Bahan Baku, Produk Jadi, BOM & Resep)</option>
                        <option value="retail">Retail & Toko Kelontong (Kopi Gayo, Susu UHT, Snack, Pelanggan)</option>
                        <option value="consignment">Konsinyasi & Multi-Platform (Mitra Donat, Komisi, Suplier)</option>
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed text-left">
                        *Sistem otomatis menyuntikkan saldo kas awal awal Rp 10jt - Rp 20jt sebagai modal kerja sesuai template yang dipilih.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowCreateCompanyModal(false)}
                      className="px-4 py-2.5 text-sm font-bold border border-border text-secondary hover:bg-slate-50 rounded-card transition-colors cursor-pointer"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2.5 text-sm font-extrabold bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-card shadow-md transition-all cursor-pointer uppercase tracking-wider"
                    >
                      🚀 Inisialisasi Sekarang
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border grid grid-cols-5 md:hidden z-50 pb-safe shadow-lg">
        {visibleNavGroups.map(group => {
          const active = isGroupActive(group);
          return (
            <button
              key={group.id}
              onClick={() => {
                if (group.direct) setActiveTab(group.id);
                else setActiveTab(group.children?.[0].id); // default to first child
              }}
              className={`flex flex-col items-center justify-center gap-1 py-2 px-1 text-[11px] font-medium transition-colors cursor-pointer ${active ? 'text-primary' : 'text-secondary hover:text-primary'
                }`}
            >
              {group.icon}
              <span className="scale-90 origin-center">{group.label}</span>
            </button>
          );
        })}
      </nav>
      {/* Add Cash Account Modal */}
      {isAddCashAccountOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-card shadow-xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-border flex justify-between items-center bg-slate-50 rounded-t-card">
              <h2 className="text-lg font-black text-primary uppercase">{editingAccountName ? 'EDIT AKUN KAS' : 'TAMBAH AKUN KAS'}</h2>
              <button onClick={() => { setIsAddCashAccountOpen(false); setEditingAccountName(null); setNewCashAccountForm({ nomor: '', nama: '', jenis: 'Kas', fungsi: 'General' }); }} className="text-slate-400 hover:text-danger p-1">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block text-[11px] font-black uppercase text-secondary mb-1">Nomor Akun (Opsional)</label>
                <input
                  type="text"
                  value={newCashAccountForm.nomor}
                  onChange={e => setNewCashAccountForm({ ...newCashAccountForm, nomor: e.target.value })}
                  placeholder="Misal: 110-10"
                  className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase text-secondary mb-1">Nama Akun</label>
                <input
                  type="text"
                  value={newCashAccountForm.nama}
                  onChange={e => setNewCashAccountForm({ ...newCashAccountForm, nama: e.target.value })}
                  placeholder="Misal: Bank BCA"
                  className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase text-secondary mb-1">Jenis Akun</label>
                <select
                  value={newCashAccountForm.jenis || 'Kas'}
                  onChange={e => setNewCashAccountForm({ ...newCashAccountForm, jenis: e.target.value })}
                  className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                >
                  <option value="Kas">Kas</option>
                  <option value="Bank">Bank</option>
                  <option value="Kas Kecil">Kas Kecil</option>
                  <option value="e-Wallet">e-Wallet</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-black uppercase text-secondary mb-1">Fungsi Utama</label>
                <select
                  value={newCashAccountForm.fungsi}
                  onChange={e => setNewCashAccountForm({ ...newCashAccountForm, fungsi: e.target.value })}
                  className="w-full border border-border rounded-card px-3 py-2 text-sm font-bold focus:ring-1 focus:ring-primary focus:outline-none bg-white"
                >
                  <option value="General">General (Kas/Bank Standar)</option>
                  <option value="Penerimaan">Penerimaan (Hanya Uang Masuk)</option>
                  <option value="Pengeluaran">Pengeluaran (Petty Cash/Kas Kecil)</option>
                </select>
              </div>
            </div>
            <div className="p-4 border-t border-border bg-slate-50 flex justify-end gap-2 rounded-b-card">
              <button onClick={() => { setIsAddCashAccountOpen(false); setEditingAccountName(null); setNewCashAccountForm({ nomor: '', nama: '', jenis: 'Kas', fungsi: 'General' }); }} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 cursor-pointer">Batal</button>
              <button
                onClick={() => {
                  // ponytail: validasi duplikasi akun kas
                  if (!newCashAccountForm.nama.trim()) {
                    alert('Nama akun tidak boleh kosong!');
                    return;
                  }
                  if (editingAccountName) {
                    if (settingCashAccounts.some(a => a.nama !== editingAccountName && a.nama.toLowerCase() === newCashAccountForm.nama.trim().toLowerCase())) {
                      alert('Nama akun sudah digunakan!');
                      return;
                    }
                    if (newCashAccountForm.nomor.trim() !== '' && settingCashAccounts.some(a => a.nama !== editingAccountName && a.nomor === newCashAccountForm.nomor.trim())) {
                      alert('Nomor akun sudah digunakan!');
                      return;
                    }
                    setSettingCashAccounts(settingCashAccounts.map(a => a.nama === editingAccountName ? { ...newCashAccountForm } : a));
                  } else {
                    if (settingCashAccounts.some(a => a.nama.toLowerCase() === newCashAccountForm.nama.trim().toLowerCase())) {
                      alert('Nama akun sudah digunakan!');
                      return;
                    }
                    if (newCashAccountForm.nomor.trim() !== '' && settingCashAccounts.some(a => a.nomor === newCashAccountForm.nomor.trim())) {
                      alert('Nomor akun sudah digunakan!');
                      return;
                    }
                    setSettingCashAccounts([...settingCashAccounts, { ...newCashAccountForm }]);
                  }

                  setIsAddCashAccountOpen(false);
                  setEditingAccountName(null);
                  setNewCashAccountForm({ nomor: '', nama: '', jenis: 'Kas', fungsi: 'General' });
                }}
                className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary-hover shadow cursor-pointer"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PO Confirmation Modal */}
      {showPoConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowPoConfirmModal(false)} />
          <div className="bg-white rounded-card shadow-xl border border-border w-full max-w-md overflow-hidden animate-fade-in relative z-10">
            <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-black text-amber-900 text-lg mb-1">Konfirmasi Pengesahan PO</h3>
                <p className="text-sm text-amber-700/80 leading-relaxed">
                  Anda akan mensahkan Purchase Order ke <b>{poForm.supplier}</b>.
                </p>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-lg p-4 mb-4 border border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Jumlah Item:</span>
                  <span className="font-bold text-slate-800">{poForm.items.filter((i: any) => i.sku && i.qty > 0).length} Barang</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Total Tagihan:</span>
                  <span className="font-bold text-slate-800">Rp {poForm.items.reduce((acc: number, cur: any) => acc + ((cur.qty || 0) * (cur.harga || 0)), 0).toLocaleString('id-ID')}</span>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                Apakah Anda yakin data transaksi ini sudah benar dan siap disahkan?
              </p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setShowPoConfirmModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors">Kembali / Periksa Lagi</button>
              <button onClick={() => { setShowPoConfirmModal(false); processSavePO(pendingDraftState); }} className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">Ya, Sahkan Transaksi</button>
            </div>
          </div>
        </div>
      )}

      {/* SO Confirmation Modal */}
      {showSoConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowSoConfirmModal(false)} />
          <div className="bg-white rounded-card shadow-xl border border-border w-full max-w-md overflow-hidden animate-fade-in relative z-10">
            <div className="bg-amber-50 p-6 border-b border-amber-100 flex items-start gap-4">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-black text-amber-900 text-lg mb-1">Konfirmasi Pengesahan SO</h3>
                <p className="text-sm text-amber-700/80 leading-relaxed">
                  Anda akan mensahkan Sales Order ke <b>{soForm.pelanggan}</b>.
                </p>
              </div>
            </div>
            <div className="p-6">
              <div className="bg-slate-50 rounded-lg p-4 mb-4 border border-slate-100 space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Jumlah Item:</span>
                  <span className="font-bold text-slate-800">{soForm.items.filter((i: any) => i.sku && i.qty > 0).length} Barang</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Total Tagihan:</span>
                  <span className="font-bold text-slate-800">Rp {soForm.items.reduce((acc: number, cur: any) => acc + ((cur.qty || 0) * (cur.harga || 0)), 0).toLocaleString('id-ID')}</span>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
                Apakah Anda yakin data transaksi ini sudah benar dan siap disahkan?
              </p>
            </div>
            <div className="bg-slate-50 p-4 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setShowSoConfirmModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors">Kembali / Periksa Lagi</button>
              <button onClick={() => { setShowSoConfirmModal(false); processSaveSO(pendingDraftState); }} className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">Ya, Sahkan Transaksi</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
