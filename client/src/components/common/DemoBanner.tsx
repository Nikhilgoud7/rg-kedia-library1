import React, { useEffect, useState } from 'react';
import api from '../../lib/api';
import { AlertTriangle } from 'lucide-react';

const DemoBanner: React.FC = () => {
  const [demoMode, setDemoMode] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    api.get('/config')
      .then((res) => {
        if (mounted && res.data && res.data.demoMode) {
          setDemoMode(true);
        }
      })
      .catch((err) => {
        // Non-fatal if config check fails
        console.warn('Configuration check failed:', err);
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!demoMode) return null;

  return (
    <aside
      aria-label="Demo environment disclaimer"
      className="bg-amber-400 text-amber-950 text-xs sm:text-sm font-semibold py-2 px-4 text-center flex items-center justify-center space-x-2 shadow-sm z-50 sticky top-0 border-b border-amber-500"
    >
      <AlertTriangle className="w-4 h-4 text-amber-900 flex-shrink-0" />
      <span>DEMO PROTOTYPE — all data is synthetic. Do not enter personal information.</span>
    </aside>
  );
};

export default DemoBanner;
