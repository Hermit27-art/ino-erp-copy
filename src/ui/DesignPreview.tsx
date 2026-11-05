import React, { useState } from 'react';
import './design-preview.css';
import { branches, companies, type DemoMetric, type DemoPeriod } from './dashboard-preview-data';
import DashboardInteractive from './DashboardInteractive';

export type PreviewDevice = 'laptop' | 'convertible';
export type PreviewTheme = 'dark' | 'light';
export type PreviewBusiness = 'all' | 'business-a' | 'business-b' | 'business-c';
export type PreviewBranch = 'all' | 'branch-1' | 'branch-2' | 'branch-3' | 'branch-4' | 'branch-5' | 'branch-6' | 'branch-7' | 'branch-8';
export type PreviewPeriod = DemoPeriod;
export type PreviewMetric = DemoMetric;
export type PreviewProps = {
  device: PreviewDevice;
  theme: PreviewTheme;
  business: PreviewBusiness;
  branch: PreviewBranch;
  period: PreviewPeriod;
  metric: PreviewMetric;
  groupName: string;
  onDeviceChange?: (device: PreviewDevice) => void;
  onThemeChange?: (theme: PreviewTheme) => void;
  onBusinessChange?: (business: PreviewBusiness) => void;
  onBranchChange?: (branch: PreviewBranch) => void;
  onPeriodChange?: (period: PreviewPeriod) => void;
  onMetricChange?: (metric: PreviewMetric) => void;
};
export type PrimitiveProps = { children: React.ReactNode; className?: string };
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'subtle' | 'plain' };
export type FieldProps = React.InputHTMLAttributes<HTMLInputElement>;
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;
export type CardProps = React.HTMLAttributes<HTMLElement>;
export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & { status?: 'ok' | 'warn' | 'neutral' };

export function Button({ tone = 'plain', className = '', ...props }: ButtonProps) { return <button {...props} className={`ip-button ${tone} ${className}`} />; }
export function Input(props: FieldProps) { return <input {...props} className={`ip-input ${props.className ?? ''}`} />; }
export function Select(props: SelectProps) { return <select {...props} className={`ip-select ${props.className ?? ''}`} />; }
export function Card({ className = '', ...props }: CardProps) { return <section {...props} className={`ip-card ${className}`} />; }
export function Badge({ status = 'neutral', className = '', ...props }: BadgeProps) { return <span {...props} className={`ip-badge ${status} ${className}`} />; }
export function Tabs({ children, className = '' }: PrimitiveProps) { return <div className={`ip-tabs ${className}`} role="tablist">{children}</div>; }
export function Table({ children, className = '' }: PrimitiveProps) { return <div className="ip-table-wrap"><table className={`ip-table ${className}`}>{children}</table></div>; }
export function Modal({ children, className = '' }: PrimitiveProps) { return <div className={`ip-modal ${className}`} role="dialog" aria-modal="true">{children}</div>; }
export function Toast({ children, className = '' }: PrimitiveProps) { return <div className={`ip-toast ${className}`} role="status"><span aria-hidden="true">✓</span>{children}</div>; }

function ContextPicker({ business, branch, onBusinessChange, onBranchChange }: Pick<PreviewProps, 'business' | 'branch' | 'onBusinessChange' | 'onBranchChange'>) {
  const [expanded, setExpanded] = useState<PreviewBusiness | null>(null);
  const [chooserOpen, setChooserOpen] = useState(business !== 'all');
  const groups = companies.map(company=>({id:company.id,name:company.name,branches:branches.filter(item=>item.business===company.id)}));
  return <section className="ip-context-picker" aria-label="Pindah ruang kerja">
    <p className="ip-context-title">RUANG KERJA</p>
    <button type="button" className={`ip-context-all ${business === 'all' ? 'active' : ''}`} aria-current={business === 'all' ? 'page' : undefined} onClick={() => { onBusinessChange?.('all'); onBranchChange?.('all'); setChooserOpen(false); }}><span aria-hidden="true">⌂</span><span>Ringkasan Grup</span></button>
    {business === 'all' && <button type="button" className="ip-context-open" aria-expanded={chooserOpen} onClick={() => setChooserOpen(!chooserOpen)}><span>Pilih usaha / cabang</span><span aria-hidden="true">{chooserOpen ? '⌃' : '⌄'}</span></button>}
    {(chooserOpen || business !== 'all') && <div className="ip-context-tree">{groups.map(group => <div className="ip-business-node" key={group.id}>
      <div className={`ip-business-row ${business === group.id && branch === 'all' ? 'active' : ''}`}>
        <button type="button" className="ip-tree-label" aria-current={business === group.id && branch === 'all' ? 'page' : undefined} onClick={() => { onBusinessChange?.(group.id); onBranchChange?.('all'); }}>{group.name}</button>
        <button type="button" className="ip-tree-toggle" aria-label={`${expanded === group.id ? 'Tutup' : 'Buka'} cabang ${group.name}`} aria-expanded={expanded === group.id} onClick={() => setExpanded(expanded === group.id ? null : group.id)}>{expanded === group.id ? '−' : '+'}</button>
      </div>
      {expanded === group.id && <div className="ip-branch-tree">{group.branches.map(item => <button type="button" key={item.id} className={`ip-branch-link ${business === group.id && branch === item.id ? 'active' : ''}`} aria-current={business === group.id && branch === item.id ? 'page' : undefined} onClick={() => { onBusinessChange?.(group.id); onBranchChange?.(item.id); }}>{item.name}</button>)}</div>}
    </div>)}</div>}
    <small>{business === 'all' ? 'Semua usaha dan cabang' : branch === 'all' ? `${groups.find(item => item.id === business)?.name} · semua cabang` : `Ruang kerja cabang · ${branches.find(item=>item.id===branch)?.name ?? branch}`}</small>
  </section>;
}
function TopNavigation(props: Pick<PreviewProps, 'business' | 'branch' | 'groupName' | 'theme' | 'onThemeChange' | 'onBusinessChange' | 'onBranchChange'>) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const scopeLabel = props.business === 'all' ? 'Ringkasan Grup' : props.branch === 'all' ? companies.find(item=>item.id===props.business)?.name ?? 'Usaha' : branches.find(item=>item.id===props.branch)?.name ?? 'Cabang';
  return <>
    <header className="ip-app-topbar">
      <a className="ip-topbar-brand" href="#dashboard"><strong>INO ERP</strong><small>{props.groupName}</small></a>
      <details className="ip-topbar-scope" open={scopeOpen} onToggle={event=>setScopeOpen(event.currentTarget.open)}><summary aria-label={`Konteks aktif: ${scopeLabel}`}><span className="ip-context-caption">Ruang kerja</span><strong>{scopeLabel}</strong><span aria-hidden="true">⌄</span></summary><div className="ip-scope-menu"><ContextPicker {...props}/></div></details>
      <div className="ip-topbar-actions"><details className="ip-settings-menu"><summary className="ip-topbar-action"><span aria-hidden="true">⚙</span><span>Pengaturan</span></summary><div className="ip-settings-dropdown"><strong>Tema tampilan</strong><button type="button" aria-pressed={props.theme==='light'} onClick={()=>props.onThemeChange?.('light')}>Terang {props.theme==='light'?'✓':''}</button><button type="button" aria-pressed={props.theme==='dark'} onClick={()=>props.onThemeChange?.('dark')}>Gelap {props.theme==='dark'?'✓':''}</button></div></details><details className="ip-account-menu"><summary className="ip-topbar-user" aria-label="Akun Ngurah, Owner"><span className="ip-avatar owner">N</span><span className="ip-account-copy"><strong>Ngurah</strong><small>Owner</small></span><span className="ip-account-chevron" aria-hidden="true">⌄</span></summary><div className="ip-account-dropdown"><a href="#profile">Profil saya</a><a href="#account">Pengaturan akun</a><button type="button">Keluar dari akun</button></div></details></div>
    </header>
    <aside className="ip-sidebar" aria-label="Menu utama"><nav><a href="#dashboard" className="active" aria-current="page"><span>▦</span>Dashboard</a><details><summary><span>⇄</span>Transaksi<i>⌄</i></summary><div><a href="#dashboard">Penjualan</a><a href="#dashboard">Pembelian</a><a href="#dashboard">Kas &amp; Bank</a></div></details><details><summary><span>▤</span>Kartu<i>⌄</i></summary><div><a href="#dashboard">Kartu stok</a><a href="#dashboard">Kartu utang</a><a href="#dashboard">Kartu piutang</a></div></details><details><summary><span>▧</span>Laporan<i>⌄</i></summary><div><a href="#dashboard">Laba rugi</a><a href="#dashboard">Arus kas</a><a href="#dashboard">Neraca</a></div></details><details><summary><span>⋯</span>Lainnya<i>⌄</i></summary><div><a href="#dashboard">Produk</a><a href="#dashboard">Cabang</a><a href="#dashboard">Pengguna</a></div></details></nav></aside>
    <nav className="ip-mobile-nav" aria-label="Navigasi bawah"><a href="#dashboard" className="active"><span>▦</span>Dashboard</a><a href="#dashboard"><span>⇄</span>Transaksi</a><a href="#dashboard"><span>▤</span>Kartu</a><a href="#dashboard"><span>▧</span>Laporan</a><a href="#dashboard"><span>⋯</span>Lainnya</a></nav>
  </>;
}
export function DesignPreview({ device, theme, business, branch, period, metric, groupName, onDeviceChange, onThemeChange, onBusinessChange, onBranchChange, onPeriodChange, onMetricChange }: PreviewProps) {
  const context = { business, branch, groupName, theme, onThemeChange, onBusinessChange, onBranchChange };
  return <main className="ino-preview" data-device={device} data-theme={theme}><div className="ip-preview-toolbar"><div><strong>Preview dashboard</strong><small>{theme === 'dark' ? 'Dark theme' : 'Light theme'} · tata letak responsif</small></div><div className="ip-toolbar-actions"><div className="ip-theme-control" aria-label="Tema warna"><Button tone={theme==='dark'?'subtle':'plain'} aria-pressed={theme==='dark'} onClick={()=>onThemeChange?.('dark')}>Gelap</Button><Button tone={theme==='light'?'subtle':'plain'} aria-pressed={theme==='light'} onClick={()=>onThemeChange?.('light')}>Terang</Button></div><div className="ip-device-control" aria-label="Ukuran preview"><Button tone={device==='laptop'?'subtle':'plain'} aria-pressed={device==='laptop'} onClick={()=>onDeviceChange?.('laptop')}>Laptop</Button><Button tone={device==='convertible'?'subtle':'plain'} aria-pressed={device==='convertible'} onClick={()=>onDeviceChange?.('convertible')}>Convertible</Button></div></div></div><TopNavigation {...context}/><div className="ip-device-frame"><DashboardInteractive {...context} period={period} metric={metric} onPeriodChange={onPeriodChange} onMetricChange={onMetricChange}/></div></main>;
}
