import React, { useState } from 'react';
import { ShoppingCart, Plus, Trash2 } from 'lucide-react';
import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { SearchableSelect } from '../components/SearchableSelect';

export interface PurchaseOrderTabProps {
  products: any[];
  suppliers: any[];
  settingPlatforms: string[];
  setSettingPlatforms: (v: string[]) => void;
  showPoPlatformModal: boolean;
  setShowPoPlatformModal: (v: boolean) => void;
  showPoForm: boolean;
  setShowPoForm: (v: boolean) => void;
  isEditingPo: boolean;
  setIsEditingPo: (v: boolean) => void;
  poForm: any;
  setPoForm: (v: any) => void;
  searchPoQuery: string;
  setSearchPoQuery: (v: string) => void;
  filteredPOs: any[];
  setSelectedPo: (v: any) => void;
  setPoActionForm: (v: any) => void;
  handleVoidPO: (id: string) => void;
  handleReturPO: (id: string) => void;
  handlePoItemChange: (index: number, sku: string, qty: number, harga: number) => void;
  handleRemovePoItem: (index: number) => void;
  handleAddPoItem: () => void;
  handleSavePO: (isDraft: boolean) => void;
  isSavingPO: boolean;
}

export const PurchaseOrderTab: React.FC<PurchaseOrderTabProps> = ({
  products,
  suppliers,
  settingPlatforms, setSettingPlatforms,
  showPoPlatformModal, setShowPoPlatformModal,
  showPoForm, setShowPoForm,
  isEditingPo, setIsEditingPo,
  poForm, setPoForm,
  searchPoQuery, setSearchPoQuery,
  filteredPOs, setSelectedPo, setPoActionForm,
  handleVoidPO, handleReturPO,
  handlePoItemChange, handleRemovePoItem, handleAddPoItem, handleSavePO, isSavingPO
}) => {
  return (
    <div className="space-y-6">
      {/* PO Platform Config Modal */}
      {showPoPlatformModal && (
        <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-card shadow-xl max-w-md w-full overflow-hidden flex flex-col relative my-auto">
            <div className="bg-slate-800 text-white py-4 px-6 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base flex items-center gap-2">
                <span>Pengaturan Platform Pembelian</span>
              </h3>
              <button onClick={() => setShowPoPlatformModal(false)} className="text-slate-400 hover:text-white transition-colors cursor-pointer">&times;</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4 max-h-[60vh]">
              <div className="flex justify-between items-center border-b pb-2 mb-3">
                <h4 className="text-sm font-black text-primary uppercase">Daftar Platform / Saluran</h4>
                <button
                  type="button"
                  onClick={() => setSettingPlatforms([...settingPlatforms, ''])}
                  className="text-[11px] font-extrabold text-primary hover:underline cursor-pointer"
                >
                  + Tambah Baru
                </button>
              </div>
              <div className="space-y-2">
                {settingPlatforms.map((plat, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={plat}
                      onChange={(e) => {
                        const arr = [...settingPlatforms];
                        arr[idx] = e.target.value;
                        setSettingPlatforms(arr);
                      }}
                      className="flex-1 p-2 border border-border rounded-card text-sm bg-white"
                      placeholder="Nama platform..."
                    />
                    <button
                      type="button"
                      onClick={() => setSettingPlatforms(settingPlatforms.filter((_, i) => i !== idx))}
                      className="p-2 text-danger hover:bg-danger/10 rounded-card cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 p-4 border-t border-border text-right">
              <button
                onClick={() => setShowPoPlatformModal(false)}
                className="bg-primary hover:bg-primary-hover text-white px-6 py-2.5 rounded-card text-sm font-bold shadow-sm cursor-pointer"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {!showPoForm ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-text-primary">Purchase Order Tracker</h2>
                <p className="text-sm text-secondary">Monitor pemesanan barang dari supplier, logistik gudang, dan status tagihan</p>
              </div>
              <button
                onClick={() => {
                  setPoForm({
                    id: '', supplier: '', tanggal: new Date().toISOString().split('T')[0],
                    metode: 'Kredit 30 Hari', items: [{ sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }],
                    pajak: false, catatan: '', platform: 'Toko Langsung'
                  });
                  setIsEditingPo(false);
                  setShowPoForm(true);
                }}
                className="bg-primary hover:bg-primary-hover text-white px-4 py-2.5 rounded-card flex items-center gap-2 font-bold text-sm shadow transition-all"
              >
                <Plus size={16} />
                <span>Buat Purchase Order Baru</span>
              </button>
            </div>
            <div className="relative w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-slate-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Cari No. PO, tanggal, supplier, metode bayar, status..."
                value={searchPoQuery}
                onChange={(e) => setSearchPoQuery(e.target.value)}
                className="block w-full pl-9 pr-3 py-2.5 border border-border rounded-card text-sm bg-white focus:ring-1 focus:ring-primary focus:border-primary outline-none shadow-sm"
              />
            </div>
          </div>
          {/* Informative Tip Banner */}
          <div className="bg-sky-50 border border-sky-200 text-sky-800 p-3.5 rounded-card text-sm flex items-center gap-2.5 shadow-sm">
            <span className="text-base">💡</span>
            <span><strong>Tips Operasional:</strong> Klik pada baris transaksi manapun untuk membuka panel <strong>Detail Transaksi</strong>. Dari sana Anda bisa mengelola penerimaan barang logistik, melunasi pembayaran, mencatat retur produk ke supplier, serta melakukan pembatalan (void).</span>
          </div>
          {/* PO List Table */}
          <div className="bg-white border border-border rounded-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto w-full">
              <table className="w-full text-sm text-left min-w-[1200px] border-collapse">
                <thead>
                  <tr className="bg-primary text-white border-b border-teal-600 hover:bg-primary">
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left min-w-[160px]">No. PO</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left min-w-[130px]">Tanggal PO</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left min-w-[200px]">Supplier</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-left">Tipe Tagihan</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-right">Total Tagihan</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-center">Status Logistik</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-center">Status Keuangan</th>
                    <th className="px-4 py-3.5 font-semibold text-white whitespace-nowrap text-center w-[120px]">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPOs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <EmptyState
                          icon={ShoppingCart}
                          title="Tidak Ada Purchase Order"
                          description="Data PO tidak ditemukan atau kosong. Buat PO baru untuk memulai pembelian."
                          actionLabel="Buat PO Baru"
                          onAction={() => { setPoForm({ id: '', supplier: '', tanggal: new Date().toISOString().split('T')[0], metode: 'Kredit 30 Hari', items: [{ sku: '', nama: '', satuan: 'Pcs', qty: 1, harga: 0, subtotal: 0 }], pajak: false, catatan: '', platform: 'Toko Langsung' }); setIsEditingPo(false); setShowPoForm(true); }}
                          className="border-0 rounded-none shadow-none"
                        />
                      </td>
                    </tr>
                  ) : filteredPOs.map(po => (
                    <tr key={po.id} onClick={() => { setSelectedPo(po); setPoActionForm(null); }} className="even:bg-slate-50/70 hover:bg-slate-50/80 cursor-pointer transition-colors">
                      <td className="px-4 py-3.5 font-mono font-bold whitespace-nowrap text-primary">{po.id}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-slate-700">{po.tanggal}</td>
                      <td className="px-4 py-3.5 font-semibold text-slate-800 line-clamp-1">{po.supplier}</td>
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{po.metode}</td>
                      <td className="px-4 py-3.5 font-bold text-right tabular-nums whitespace-nowrap">Rp {po.grandTotal.toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {po.hasReturn ? (
                          <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            {po.statusLogistik === 'Retur Penuh' || po.statusLogistik === 'Retur Sebagian' ? po.statusLogistik.toUpperCase() : `${po.statusLogistik.toUpperCase()} (RETUR)`}
                          </span>
                        ) : (
                          <Badge variant={po.statusLogistik === 'Diterima' ? 'success' : po.statusLogistik === 'Menunggu' ? 'warning' : 'neutral'}>
                            {po.statusLogistik}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        {po.hasReturn ? (
                          <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                            {po.statusBayar === 'Lunas' ? 'LUNAS (KOREKSI RETUR)' : 'BELUM DIBAYAR (DIPOTONG RETUR)'}
                          </span>
                        ) : (
                          <Badge variant={po.statusBayar === 'Lunas' ? 'success' : po.statusBayar === 'Belum Dibayar' ? 'error' : 'neutral'}>
                            {po.statusBayar}
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-center whitespace-nowrap">
                        <div className="flex justify-center items-center gap-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleVoidPO(po.id); }}
                            className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider bg-danger/10 text-danger hover:bg-danger hover:text-white rounded-md transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={po.statusLogistik === 'Void'}
                          >
                            Void
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        // PO Creation Panel
        <div className="bg-white border border-border rounded-card shadow-sm p-6 space-y-6">
          <div className="border-b border-border pb-4 flex justify-between items-center">
            <h3 className="font-bold text-text-primary text-lg">Buat Purchase Order Baru (Batch Mode)</h3>
            <button onClick={() => setShowPoForm(false)} className="text-slate-400 hover:text-secondary text-xl font-bold">&times;</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-gray-50 p-4 rounded-card">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-secondary uppercase">Supplier (Kepada)</label>
              <SearchableSelect
                value={poForm.supplier}
                onChange={(val) => setPoForm({ ...poForm, supplier: val })}
                options={suppliers.map((s: any) => ({ label: s.nama, value: s.nama }))}
                allowCustom={true}
                placeholder="Ketik/Pilih Supplier"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-bold text-text-secondary uppercase">Platform</label>
                <button type="button" onClick={() => setShowPoPlatformModal(true)} className="text-[11px] text-primary hover:underline font-bold cursor-pointer">+ Tambah / Atur Platform</button>
              </div>
              <select
                value={poForm.platform}
                onChange={(e) => setPoForm({ ...poForm, platform: e.target.value })}
                className="p-2 border border-border rounded-card bg-white text-sm"
              >
                {settingPlatforms.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-secondary uppercase">Tanggal PO</label>
              <input
                type="date"
                value={poForm.tanggal}
                onChange={(e) => setPoForm({ ...poForm, tanggal: e.target.value })}
                className="p-2 border border-border rounded-card text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-secondary uppercase">Termin / Metode</label>
              <select
                value={poForm.metode}
                onChange={(e) => setPoForm({ ...poForm, metode: e.target.value })}
                className="p-2 border border-border rounded-card bg-white text-sm"
              >
                <option value="Tunai">Tunai Lunas</option>
                <option value="Kredit 14 Hari">Kredit 14 Hari</option>
                <option value="Kredit 30 Hari">Kredit 30 Hari</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-text-secondary uppercase">Pajak (PPN 12%)</label>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={poForm.pajak}
                  onChange={(e) => setPoForm({ ...poForm, pajak: e.target.checked })}
                  className="w-4 h-4 accent-primary"
                />
                <span className="text-sm font-semibold text-secondary">Aktifkan PPN 12%</span>
              </label>
            </div>
          </div>
          {/* PO Items Table */}
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="bg-gray-100 text-secondary text-sm font-semibold uppercase">
                <th className="py-3 px-4 w-[45%]">Pilih Barang [SKU]</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Harga Unit (HPP)</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {poForm.items.map((item: any, idx: number) => (
                <tr key={idx} className="border-b border-border">
                  <td className="py-3 px-4">
                    <SearchableSelect
                      value={item.sku}
                      onChange={(val) => handlePoItemChange(idx, val, item.qty, item.harga)}
                      options={products.map((p: any) => ({ label: `[${p.sku}] ${p.nama}`, value: p.sku }))}
                      placeholder="-- Pilih Barang --"
                    />
                  </td>
                  <td className="py-3 px-4 text-center">
                    <input
                      type="number" min="0"
                      value={item.qty}
                      onChange={(e) => handlePoItemChange(idx, item.sku, parseInt(e.target.value) || 0, item.harga)}
                      className="w-16 p-2 border border-border rounded text-center font-mono"
                    />
                  </td>
                  <td className="py-3 px-4">
                    <input
                      type="number" min="0"
                      value={item.harga}
                      onChange={(e) => handlePoItemChange(idx, item.sku, item.qty, parseInt(e.target.value) || 0)}
                      className="w-full p-2 border border-border rounded text-right font-mono"
                    />
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    Rp {item.subtotal.toLocaleString('id-ID')}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => handleRemovePoItem(idx)}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            onClick={handleAddPoItem}
            className="w-full py-2 border border-dashed border-primary text-primary hover:bg-green-50 rounded-card font-bold text-sm"
          >
            + Tambah Baris Baru
          </button>

          <div className="flex justify-between items-start border-t border-border pt-6">
            <div className="w-1/2 flex flex-col gap-1.5">
              <label className="text-sm font-bold text-secondary uppercase">Memo / Catatan PO</label>
              <textarea
                value={poForm.catatan}
                onChange={(e) => setPoForm({ ...poForm, catatan: e.target.value })}
                placeholder="Memo logs..."
                className="border border-border p-2.5 rounded-card text-sm h-16 resize-none"
              />
            </div>
            <div className="w-80 bg-gray-50 p-4 rounded-card space-y-2 text-sm font-semibold">
              <div className="flex justify-between text-text-secondary">
                <span>Subtotal</span>
                <span>Rp {poForm.items.reduce((sum: number, item: any) => sum + item.subtotal, 0).toLocaleString('id-ID')}</span>
              </div>
              {poForm.pajak && (
                <div className="flex justify-between text-text-secondary">
                  <span>PPN (12%)</span>
                  <span>Rp {Math.round(poForm.items.reduce((sum: number, item: any) => sum + item.subtotal, 0) * 0.12).toLocaleString('id-ID')}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-text-primary border-t border-border pt-2">
                <span>TOTAL AKHIR</span>
                <span className="text-primary">
                  Rp {(
                    poForm.items.reduce((sum: number, item: any) => sum + item.subtotal, 0) +
                    (poForm.pajak ? Math.round(poForm.items.reduce((sum: number, item: any) => sum + item.subtotal, 0) * 0.12) : 0)
                  ).toLocaleString('id-ID')}
                </span>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button onClick={() => setShowPoForm(false)} className="px-4 py-2.5 text-sm font-semibold border border-border hover:bg-gray-100 rounded-card">Batal</button>
            <button
              onClick={() => handleSavePO(true)}
              disabled={isSavingPO}
              className={`px-4 py-2.5 text-sm font-semibold rounded-card ${isSavingPO ? 'bg-text-primary/70 text-slate-300 cursor-not-allowed flex items-center justify-center gap-2' : 'bg-text-primary text-slate-300 hover:bg-text-primary-hover'}`}
            >
              {isSavingPO ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-300/30 border-t-slate-300 rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                'Simpan Draft'
              )}
            </button>
            <button
              onClick={() => handleSavePO(false)}
              disabled={isSavingPO}
              className={`px-5 py-2.5 text-sm font-semibold text-white rounded-card ${isSavingPO ? 'bg-primary/70 cursor-not-allowed flex items-center justify-center gap-2' : 'bg-primary hover:bg-primary-hover'}`}
            >
              {isSavingPO ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                'Rilis & Kirim PO'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
