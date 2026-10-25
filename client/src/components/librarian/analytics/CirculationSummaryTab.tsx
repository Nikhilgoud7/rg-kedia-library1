import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import { CirculationSummaryData, PeriodType } from '../../../types/reports';
import StatCard from '../../common/StatCard';
import AnalyticsDateFilter from './AnalyticsDateFilter';
import CsvExportButton from './CsvExportButton';
import {
  BookOpen,
  CheckCircle2,
  RotateCcw,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Inbox,
} from 'lucide-react';

export const CirculationSummaryTab: React.FC = () => {
  // Default range: Last 30 days
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const startObj = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const defaultStart = startObj.toISOString().slice(0, 10);

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [period, setPeriod] = useState<PeriodType>('DAILY');
  const [data, setData] = useState<CirculationSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Request cancellation / race prevention
  const activeRequestId = useRef(0);

  const fetchCirculation = useCallback(async () => {
    if (!startDate || !endDate || startDate > endDate) return;

    const reqId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);

      const res = await api.get('/reports/circulation-summary', {
        params: {
          startDate,
          endDate,
          period,
        },
      });

      if (reqId === activeRequestId.current) {
        setData(res.data.data);
      }
    } catch (err: any) {
      if (reqId === activeRequestId.current) {
        console.error('Failed to fetch circulation summary:', err);
        setError(err.response?.data?.error || 'Unable to load circulation summary. Please retry.');
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, period]);

  useEffect(() => {
    fetchCirculation();
  }, [fetchCirculation]);

  const csvEndpoint = `/reports/circulation-summary?startDate=${encodeURIComponent(
    startDate
  )}&endDate=${encodeURIComponent(endDate)}&period=${period}&format=csv`;

  const csvFilename = `circulation-summary-${period.toLowerCase()}-${startDate}-to-${endDate}.csv`;

  // Visualization calculations
  const breakdown = data?.breakdown || [];
  const maxVal = Math.max(1, ...breakdown.map((b) => Math.max(b.issuedCount, b.returnedCount)));

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <AnalyticsDateFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        period={period}
        onPeriodChange={(p) => setPeriod(p)}
        showPeriodSelector={true}
        showProgramFilter={false}
        disabled={loading}
      />

      {/* Header and Export Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Circulation Volume & Trends</h2>
          <p className="text-xs text-slate-500">
            Book issue, return, and renewal activity aggregated by {period.toLowerCase()} periods
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CsvExportButton
            endpoint={csvEndpoint}
            filename={csvFilename}
            disabled={loading || !data}
          />
          <button
            type="button"
            onClick={fetchCirculation}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition shadow-xs disabled:opacity-50"
            aria-label="Refresh circulation report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchCirculation}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metric Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse space-y-3">
              <div className="h-3 bg-slate-200 rounded w-24" />
              <div className="h-7 bg-slate-200 rounded w-16" />
              <div className="h-2.5 bg-slate-100 rounded w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title="Total Issued"
              value={data?.totals?.totalIssued ?? 0}
              subtitle="Loans dispatched in period"
              icon={BookOpen}
              color="amber"
            />
            <StatCard
              title="Total Returned"
              value={data?.totals?.totalReturned ?? 0}
              subtitle="Loans returned to stock"
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              title="Total Renewals"
              value={data?.totals?.totalRenewals ?? 0}
              subtitle="Extensions granted"
              icon={RotateCcw}
              color="blue"
            />
            <StatCard
              title="Net Circulation"
              value={data?.totals?.netCirculation ?? 0}
              subtitle="Issued minus Returned"
              icon={TrendingUp}
              color="indigo"
            />
          </>
        )}
      </div>

      {/* Responsive SVG Chart: Issued vs Returned */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Issued vs Returned Comparison</h3>
            <p className="text-xs text-slate-500">Visual comparison over time</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-amber-500 inline-block" />
              <span className="text-slate-600">Issued Loans</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" />
              <span className="text-slate-600">Returned Loans</span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="h-48 flex items-center justify-center bg-slate-50/50 rounded-xl animate-pulse text-xs text-slate-400">
            Loading circulation trends...
          </div>
        ) : breakdown.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Inbox className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">No transactions in selected window</p>
            <p className="text-[11px] text-slate-400">Adjust date filters above to expand the reporting period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[500px]">
              <svg viewBox={`0 0 ${Math.max(500, breakdown.length * 45)} 180`} className="w-full h-48">
                {/* Horizontal grid lines */}
                <line x1="30" y1="20" x2="100%" y2="20" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="30" y1="75" x2="100%" y2="75" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="30" y1="130" x2="100%" y2="130" stroke="#f1f5f9" strokeDasharray="3 3" />
                <line x1="30" y1="140" x2="100%" y2="140" stroke="#cbd5e1" strokeWidth="1" />

                {/* Y-axis labels */}
                <text x="25" y="24" textAnchor="end" fontSize="10" fill="#94a3b8">
                  {maxVal}
                </text>
                <text x="25" y="79" textAnchor="end" fontSize="10" fill="#94a3b8">
                  {Math.round(maxVal / 2)}
                </text>
                <text x="25" y="144" textAnchor="end" fontSize="10" fill="#94a3b8">
                  0
                </text>

                {/* Bars */}
                {breakdown.map((b, idx) => {
                  const x = 45 + idx * 45;
                  const chartHeight = 110;
                  const issuedHeight = Math.max(2, (b.issuedCount / maxVal) * chartHeight);
                  const returnedHeight = Math.max(2, (b.returnedCount / maxVal) * chartHeight);
                  const issuedY = 140 - issuedHeight;
                  const returnedY = 140 - returnedHeight;

                  return (
                    <g key={b.period} className="group">
                      <title>{`${b.period}: ${b.issuedCount} issued, ${b.returnedCount} returned, ${b.renewalCount} renewals`}</title>
                      {/* Issued Bar */}
                      <rect
                        x={x}
                        y={issuedY}
                        width="14"
                        height={issuedHeight}
                        rx="3"
                        className="fill-amber-500 hover:fill-amber-600 transition"
                      />
                      {/* Returned Bar */}
                      <rect
                        x={x + 16}
                        y={returnedY}
                        width="14"
                        height={returnedHeight}
                        rx="3"
                        className="fill-emerald-500 hover:fill-emerald-600 transition"
                      />
                      {/* X label */}
                      <text
                        x={x + 15}
                        y="158"
                        textAnchor="middle"
                        fontSize="9"
                        fill="#64748b"
                        className="font-medium"
                      >
                        {b.period.length > 7 ? b.period.slice(5) : b.period}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Period Breakdown</h3>
            <p className="text-xs text-slate-500">{breakdown.length} period intervals recorded</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Circulation period breakdown">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider">
                <th scope="col" className="py-2.5 px-4">Period</th>
                <th scope="col" className="py-2.5 px-4 text-right">Issued</th>
                <th scope="col" className="py-2.5 px-4 text-right">Returned</th>
                <th scope="col" className="py-2.5 px-4 text-right">Renewals</th>
                <th scope="col" className="py-2.5 px-4 text-right">Net Circulation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                  </tr>
                ))
              ) : breakdown.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No breakdown rows for the current filter criteria.
                  </td>
                </tr>
              ) : (
                breakdown.map((row) => (
                  <tr key={row.period} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-bold text-slate-800">{row.period}</td>
                    <td className="py-2.5 px-4 text-right font-medium text-amber-600">{row.issuedCount}</td>
                    <td className="py-2.5 px-4 text-right font-medium text-emerald-600">{row.returnedCount}</td>
                    <td className="py-2.5 px-4 text-right font-medium text-blue-600">{row.renewalCount}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-bold ${
                        row.netCirculation >= 0 ? 'text-slate-900' : 'text-red-600'
                      }`}
                    >
                      {row.netCirculation > 0 ? `+${row.netCirculation}` : row.netCirculation}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CirculationSummaryTab;
