export type DemoBusiness = 'all' | 'business-a' | 'business-b' | 'business-c';
export type DemoBranch = 'all' | 'branch-1' | 'branch-2' | 'branch-3' | 'branch-4' | 'branch-5' | 'branch-6' | 'branch-7' | 'branch-8';
export type DemoPeriod = '7d' | '30d' | '3m' | '6m' | '1y';
export type DemoMetric = 'sales' | 'gross' | 'net';

export const metricNames: Record<DemoMetric, string> = { sales: 'Penjualan', gross: 'Laba kotor', net: 'Laba bersih' };
export const periodNames: Record<DemoPeriod, string> = { '7d': '7 hari terakhir', '30d': '30 hari terakhir', '3m': '3 bulan terakhir', '6m': '6 bulan terakhir', '1y': '1 tahun terakhir' };
export const companies = [
  { id: 'business-a' as const, name: 'Usaha A' },
  { id: 'business-b' as const, name: 'Usaha B' },
  { id: 'business-c' as const, name: 'Usaha C' },
];

const branchSource = [
  { id: 'branch-1' as const, business: 'business-a' as const, name: 'Denpasar', sales: 342_700_000, color: '#2878d0' },
  { id: 'branch-2' as const, business: 'business-a' as const, name: 'Kuta', sales: 298_500_000, color: '#14866b' },
  { id: 'branch-3' as const, business: 'business-a' as const, name: 'Sanur', sales: 219_800_000, color: '#bd671d' },
  { id: 'branch-4' as const, business: 'business-b' as const, name: 'Ubud', sales: 188_300_000, color: '#7852b8' },
  { id: 'branch-5' as const, business: 'business-b' as const, name: 'Singaraja', sales: 199_500_000, color: '#167d92' },
  { id: 'branch-6' as const, business: 'business-c' as const, name: 'Gianyar', sales: 60_000_000, color: '#8b6d16' },
  { id: 'branch-7' as const, business: 'business-c' as const, name: 'Tabanan', sales: 52_000_000, color: '#a94c63' },
  { id: 'branch-8' as const, business: 'business-c' as const, name: 'Jimbaran', sales: 45_000_000, color: '#566b85' },
];
const productSource = [
  { id: 'sku-1', sku: 'SKU-001', name: 'Smartphone X 128GB', share: .25, price: 7_800_000, color: '#2878d0' },
  { id: 'sku-2', sku: 'SKU-014', name: 'Notebook Air M2', share: .20, price: 15_500_000, color: '#14866b' },
  { id: 'sku-3', sku: 'SKU-028', name: 'Earbuds Pro', share: .17, price: 1_400_000, color: '#bd671d' },
  { id: 'sku-4', sku: 'SKU-036', name: 'Smartwatch Fit', share: .14, price: 2_200_000, color: '#7852b8' },
  { id: 'sku-5', sku: 'SKU-044', name: 'Charger Fast 45W', share: .12, price: 450_000, color: '#167d92' },
  { id: 'sku-6', sku: 'SKU-051', name: 'Speaker Mini', share: .12, price: 900_000, color: '#a94c63' },
];
const periodScale: Record<DemoPeriod, number> = { '7d': .26, '30d': 1, '3m': 2.9, '6m': 5.7, '1y': 11.4 };
const periodLabels: Record<DemoPeriod, string[]> = {
  '7d': ['28 Okt','29 Okt','30 Okt','31 Okt','1 Nov','2 Nov','3 Nov'],
  '30d': ['5 Okt','11 Okt','17 Okt','23 Okt','29 Okt','3 Nov'],
  '3m': ['Sep','Okt','Nov'],
  '6m': ['Jun','Jul','Agu','Sep','Okt','Nov'],
  '1y': ['Des 25','Feb 26','Apr 26','Jun 26','Agu 26','Nov 26'],
};
const trendShape = [.11,.13,.14,.15,.16,.17,.14];
const trendLabels = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
export const branches = branchSource;
export const products = productSource;
export type DemoRow = { id: string; name: string; amount: number; color: string; business?: DemoBusiness; branch?: DemoBranch; sku?: string; qty?: number; share: number };
export type DemoSeries = { id: string; name: string; color: string; data: { date: string; value: number }[]; kind: 'branch' | 'product'; business?: DemoBusiness; branch?: DemoBranch; sku?: string };
export type ProductDetails = DemoRow & { sku: string; qty: number; trend: number };
export type DebtDocument = { id: string; description: string; amount: number; age: string; dueDate: string; status: 'Terlambat' | 'Belum jatuh tempo' };
export type DebtRankRow = { id: string; name: string; balance: number; overdue: number; share: number; documents: DebtDocument[] };
export type DashboardDemo = {
  totalSales: number; grossProfit: number; netProfit: number; cash: number; payable: number; receivable: number;
  selectedBranches: typeof branchSource; trendLabels: string[]; series: DemoSeries[]; contributions: DemoRow[]; topProducts: ProductDetails[]; allProducts: ProductDetails[];
  duePayable: number[]; dueReceivable: number[];
};

function metricFor(sales: number, metric: DemoMetric) {
  return metric === 'gross' ? sales * .28 : metric === 'net' ? sales * .17 : sales;
}
function unitCount(revenue: number, productId: string) {
  const product = productSource.find(item => item.id === productId)!;
  return Math.max(1, Math.round(revenue / product.price));
}
function productRowsFor(selectedBranches: typeof branchSource, period: DemoPeriod): ProductDetails[] {
  const scale = periodScale[period];
  const rows = productSource.map(product => {
    const baseRevenue = selectedBranches.reduce((sum, branch) => sum + branch.sales * product.share, 0);
    const revenue = baseRevenue * scale;
    const qty = selectedBranches.reduce((sum, branch) => sum + unitCount(branch.sales * product.share, product.id), 0) * scale;
    return { id: product.id, name: product.name, sku: product.sku, amount: revenue, qty: Math.round(qty), color: product.color, share: 0, trend: 6 + (productSource.indexOf(product) * 3) };
  });
  const total = rows.reduce((sum, item) => sum + item.amount, 0);
  return rows.map(item => ({ ...item, share: total ? item.amount / total : 0 })).sort((a,b)=>b.amount-a.amount);
}
function rowsBySales(items: { id: string; name: string; sales: number; color: string; business?: DemoBusiness; branch?: DemoBranch; sku?: string }[], metric: DemoMetric, scale = 1): DemoRow[] {
  const amounts = items.map(item=>metricFor(item.sales,metric)*scale);
  const total = amounts.reduce((sum,value)=>sum+value,0);
  return items.map((item,index)=>({id:item.id,name:item.name,amount:amounts[index],color:item.color,business:item.business,branch:item.branch,sku:item.sku,share:total?amounts[index]/total:0}));
}
export function makeDashboardDemo(business: DemoBusiness, branch: DemoBranch, period: DemoPeriod, metric: DemoMetric): DashboardDemo {
  const selectedBranches = branch !== 'all' ? branchSource.filter(item => item.id === branch) : branchSource.filter(item => business === 'all' || item.business === business);
  const baseSales = selectedBranches.reduce((sum,item)=>sum+item.sales,0);
  const scale = periodScale[period];
  const totalSales = baseSales * scale;
  const productsInScope = productRowsFor(selectedBranches,period);
  const contributionItems = branch !== 'all'
    ? productsInScope.map(item=>({id:item.id,name:item.name,sales:item.amount,color:item.color,sku:item.sku}))
    : selectedBranches.map(item=>({id:item.id,name:item.name,sales:item.sales,color:item.color,business:item.business,branch:item.id}));
  const contributions = branch !== 'all'
    ? (()=>{const amounts=productsInScope.map(item=>item.amount);const total=amounts.reduce((sum,value)=>sum+value,0);return productsInScope.map((item,index)=>({id:item.id,name:item.name,amount:amounts[index],color:item.color,sku:item.sku,share:total?amounts[index]/total:0}));})()
    : rowsBySales(contributionItems,'sales',scale);
  const trendSeries: DemoSeries[] = branch !== 'all'
    ? productsInScope.map(item=>({id:item.id,name:item.name,color:item.color,kind:'product' as const,branch,data:periodLabels[period].map((date,index)=>({date,value:metricFor(item.amount/scale,metric)*scale*trendShape[index%trendShape.length]/trendShape.slice(0,periodLabels[period].length).reduce((sum,v)=>sum+v,0)})),sku:item.sku}))
    : selectedBranches.map(item=>({id:item.id,name:item.name,color:item.color,kind:'branch' as const,business:item.business,branch:item.id,data:periodLabels[period].map((date,index)=>({date,value:metricFor(item.sales,metric)*scale*trendShape[index%trendShape.length]/trendShape.slice(0,periodLabels[period].length).reduce((sum,v)=>sum+v,0)}))}));
  const payable = baseSales * .08;
  const receivable = baseSales * .13;
  return {
    totalSales, grossProfit: totalSales*.28, netProfit: totalSales*.17, cash: baseSales*.31,
    payable, receivable, selectedBranches, trendLabels: periodLabels[period], series: trendSeries, contributions,
    topProducts: productsInScope.slice(0,5), allProducts: productsInScope,
    duePayable:[payable*.54,payable*.28,payable*.18], dueReceivable:[receivable*.48,receivable*.32,receivable*.20],
  };
}
export function makeDebtRanking(business: DemoBusiness, branch: DemoBranch, kind: 'payable' | 'receivable'): DebtRankRow[] {
  const groupSales = branchSource.reduce((sum, item) => sum + item.sales, 0);
  const multiplier = kind === 'payable' ? .08 : .13;
  const parties: {id:string;name:string;weight:number}[] = branch !== 'all'
    ? kind === 'payable'
      ? [{id:'supplier-1',name:'PT Maju Jaya',weight:.45},{id:'supplier-2',name:'CV Bali Sentosa',weight:.34},{id:'supplier-3',name:'UD Sumber Niaga',weight:.21}]
      : [{id:'customer-1',name:'Toko Sumber Rezeki',weight:.48},{id:'customer-2',name:'CV Maju Bersama',weight:.32},{id:'customer-3',name:'Toko Dewi',weight:.20}]
    : business === 'all'
      ? companies.map((item,index)=>({id:item.id,name:item.name,weight:[.61,.28,.11][index]}))
      : branchSource.filter(item=>item.business===business).map(item=>({id:item.id,name:item.name,weight:item.sales/branchSource.filter(candidate=>candidate.business===business).reduce((sum,candidate)=>sum+candidate.sales,0)}));
  const selectedSales = branch !== 'all' ? branchSource.find(item=>item.id===branch)?.sales ?? 0 : business==='all' ? groupSales : branchSource.filter(item=>item.business===business).reduce((sum,item)=>sum+item.sales,0);
  const total = selectedSales * multiplier;
  return parties.map((party,index)=>{
    const balance = total * party.weight;
    const overdue = balance * ([.18,.27,.12][index%3]);
    const first = overdue;
    const second = balance-overdue;
    const firstStatus: DebtDocument['status'] = 'Terlambat';
    const secondStatus: DebtDocument['status'] = 'Belum jatuh tempo';
    return {id:party.id,name:party.name,balance,overdue,share:party.weight,documents:[
      {id:`${kind==='payable'?'UT':'PI'}-2610${String(index+1).padStart(2,'0')}`,description:kind==='payable'?'Faktur pemasok':'Faktur pelanggan',amount:first,age:index===1?'31–60 hari':'1–30 hari',dueDate:index===1?'21 Sep 2026':'21 Okt 2026',status:firstStatus},
      {id:`${kind==='payable'?'UT':'PI'}-2611${String(index+1).padStart(2,'0')}`,description:kind==='payable'?'Tagihan pembelian':'Tagihan penjualan',amount:second,age:'1–30 hari',dueDate:'16 Nov 2026',status:secondStatus},
    ]};
  }).sort((a,b)=>b.balance-a.balance);
}
const idNumber = new Intl.NumberFormat('id-ID',{maximumFractionDigits:1});
const idInteger = new Intl.NumberFormat('id-ID',{maximumFractionDigits:0});
export function formatDemoMoney(value: number) {
  const amount = Math.abs(value);
  return amount >= 1_000_000_000 ? `Rp ${idNumber.format(value/1_000_000_000)} M` : amount >= 1_000_000 ? `Rp ${idNumber.format(value/1_000_000)} jt` : `Rp ${idInteger.format(value)}`;
}
export function formatDemoNumber(value:number) { return idInteger.format(value); }
export function formatDemoPercent(value:number) { return `${idNumber.format(value*100)}%`; }
