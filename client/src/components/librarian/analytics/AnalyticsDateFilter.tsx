import React from 'react';
import { Calendar, Filter, AlertCircle } from 'lucide-react';
import { PeriodType } from '../../../types/reports';

export interface AnalyticsDateFilterProps {
  startDate?: string;
  endDate?: string;
  onDateChange?: (start: string, end: string) => void;
  programId?: string | null;
  onProgramChange?: (programId: string | null) => void;
  showProgramFilter?: boolean;
  period?: PeriodType;
  onPeriodChange?: (period: PeriodType) => void;
  showPeriodSelector?: boolean;
  asOfDate?: string;
  onAsOfDateChange?: (asOf: string) => void;
  showAsOfDate?: boolean;
  disabled?: boolean;
}

export const AnalyticsDateFilter: React.FC<AnalyticsDateFilterProps> = ({
  startDate,
  endDate,
  onDateChange,
  programId,
  onProgramChange,
  showProgramFilter = true,
  period = 'DAILY',
  onPeriodChange,
  showPeriodSelector = false,
  asOfDate,
  onAsOfDateChange,
  showAsOfDate = false,
  disabled = false,
}) => {
  const isInvalidRange = Boolean(startDate && endDate && startDate > endDate);

  // Quick range helpers
  const applyPreset = (daysBack: number) => {
    if (!onDateChange) return;
    const now = new Date();
    const end = now.toISOString().slice(0, 10);
    const startObj = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const start = startObj.toISOString().slice(0, 10);
    onDateChange(start, end);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Preset Ranges */}
        {onDateChange && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1">Presets:</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(7)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              7 Days
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(30)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              30 Days
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(90)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              90 Days
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => applyPreset(365)}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
            >
              1 Year
            </button>
          </div>
        )}

        {/* Period Selector Pills */}
        {showPeriodSelector && onPeriodChange && (
          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold">
            {(['DAILY', 'WEEKLY', 'MONTHLY'] as PeriodType[]).map((p) => (
              <button
                key={p}
                type="button"
                disabled={disabled}
                onClick={() => onPeriodChange(p)}
                className={`px-3 py-1 rounded-lg transition capitalize ${
                  period === p
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {p.toLowerCase()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Inputs Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end pt-1">
        {/* As-Of Date (if enabled) */}
        {showAsOfDate && onAsOfDateChange && (
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              As Of Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={asOfDate || ''}
                disabled={disabled}
                onChange={(e) => onAsOfDateChange(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* Start Date */}
        {onDateChange && (
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={startDate || ''}
                disabled={disabled}
                onChange={(e) => onDateChange(e.target.value, endDate || '')}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* End Date */}
        {onDateChange && (
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              End Date
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="date"
                value={endDate || ''}
                disabled={disabled}
                onChange={(e) => onDateChange(startDate || '', e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
        )}

        {/* Program Filter */}
        {showProgramFilter && onProgramChange && (
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
              Program
            </label>
            <div className="relative">
              <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <select
                value={programId || ''}
                disabled={disabled}
                onChange={(e) => onProgramChange(e.target.value ? e.target.value : null)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">All Academic Programs</option>
                <option value="BCOM">B.Com (Commerce)</option>
                <option value="BBA">BBA (Business Admin)</option>
                <option value="BSC">B.Sc (Sciences)</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Date Ordering Warning */}
      {isInvalidRange && (
        <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-semibold">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
          <span>Invalid date ordering: Start Date must be on or before End Date.</span>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDateFilter;
