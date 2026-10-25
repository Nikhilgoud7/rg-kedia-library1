import React, { useState } from 'react';
import api from '../../../lib/api';
import { Download, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export interface CsvExportButtonProps {
  endpoint: string;
  filename: string;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const CsvExportButton: React.FC<CsvExportButtonProps> = ({
  endpoint,
  filename,
  label = 'Export CSV',
  disabled = false,
  className = '',
}) => {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting || disabled) return;

    try {
      setExporting(true);
      const res = await api.get(endpoint, {
        responseType: 'blob',
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      toast.success(`Exported ${filename}`);
    } catch (err: any) {
      console.error('Failed to export CSV:', err);
      toast.error('Failed to download CSV report. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={disabled || exporting}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs transition shadow-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
        exporting
          ? 'bg-slate-100 text-slate-400 border border-slate-200'
          : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border border-emerald-700'
      } ${className}`}
      aria-label={`Export report as ${filename}`}
    >
      {exporting ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Exporting...</span>
        </>
      ) : (
        <>
          <Download className="w-3.5 h-3.5" />
          <span>{label}</span>
        </>
      )}
    </button>
  );
};

export default CsvExportButton;
