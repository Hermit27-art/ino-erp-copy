import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignPreview, type PreviewBusiness, type PreviewBranch, type PreviewDevice, type PreviewMetric, type PreviewPeriod, type PreviewTheme } from './DesignPreview';
import { useAppStore } from '../stores/useAppStore';

function PreviewApp() {
  const configuredShopName = useAppStore(state => state.namaToko);
  const groupName = configuredShopName && configuredShopName.trim() && configuredShopName.trim() !== 'INO ERP' ? configuredShopName.trim() : 'Nama grup belum diatur';
  const [device, setDevice] = useState<PreviewDevice>('laptop');
  const [theme, setTheme] = useState<PreviewTheme>('light');
  const [business, setBusiness] = useState<PreviewBusiness>('all');
  const [branch, setBranch] = useState<PreviewBranch>('all');
  const [period, setPeriod] = useState<PreviewPeriod>('30d');
  const [metric, setMetric] = useState<PreviewMetric>('sales');
  const handleBusinessChange = (value: PreviewBusiness) => { setBusiness(value); setBranch('all'); };
  return <DesignPreview device={device} theme={theme} groupName={groupName} business={business} branch={branch} period={period} metric={metric} onDeviceChange={setDevice} onThemeChange={setTheme} onBusinessChange={handleBusinessChange} onBranchChange={setBranch} onPeriodChange={setPeriod} onMetricChange={setMetric} />;
}

createRoot(document.getElementById('root')!).render(<PreviewApp />);
