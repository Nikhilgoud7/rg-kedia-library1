import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import { InventoryAnalyticsData } from '../../../types/reports';
import StatCard from '../../common/StatCard';
import AnalyticsDateFilter from './AnalyticsDateFilter';
import CsvExportButton from './CsvExportButton';
import {
  Layers,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Info,
  Archive,
  Compass,
  History,
  FileCheck2,
} from 'lucide-react';

export const InventoryConditionTab: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [data, setData] = useState<InventoryAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequestId = useRef(0);

  const fetchInventory = useCallback(async () => {
    if (startDate && endDate && startDate > endDate) return;

    const reqId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (programId) params.programId = programId;

      const res = await api.get('/reports/inventory-analytics', { params });

      if (reqId === activeRequestId.current) {
        setData(res.data.data);
      }
    } catch (err: any) {
      if (reqId === activeRequestId.current) {
        console.error('Failed to load inventory analytics:', err);
        setError(err.response?.data?.error || 'Unable to load inventory analytics.');
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, programId]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const queryParams = new URLSearchParams();
  queryParams.set('format', 'csv');
  if (startDate) queryParams.set('startDate', startDate);
  if (endDate) queryParams.set('endDate', endDate);
  if (programId) queryParams.set('programId', programId);

  const csvEndpoint = `/reports/inventory-analytics?${queryParams.toString()}`;
  const csvFilename = `inventory-condition-report${programId ? `-${programId.toLowerCase()}` : ''}.csv`;

  const condition = data?.inventoryCondition;
  const dist = condition?.distribution;
  const shelf = data?.shelfAudit;
  const shelfCov = shelf?.catalogLocationSummary || shelf?.catalogShelfLocationCoverage;
  const drift = data?.reconciliationDrift;
  const lifecycle = drift?.lifecycleEvents;
  const copies = data?.copies || [];

  const eligibleActive = condition?.eligibleActiveCopiesCount ?? 0;
  const withdrawn = condition?.withdrawnCopiesCount ?? 0;
  const totalAll = condition?.totalAllCopiesCount ?? 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <AnalyticsDateFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        programId={programId}
        onProgramChange={(p) => setProgramId(p)}
        showProgramFilter={true}
        disabled={loading}
      />

      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Inventory Condition & Shelf Coverage</h2>
          <p className="text-xs text-slate-500">
            Physical copy quality grading, static catalog shelf mapping, and stock reconciliation drift
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
            onClick={fetchInventory}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition shadow-xs disabled:opacity-50"
            aria-label="Refresh inventory report"
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
            onClick={fetchInventory}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Primary Key Metrics */}
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
              title="Eligible Active Copies"
              value={eligibleActive}
              subtitle="Base denominator for condition metrics"
              icon={Layers}
              color="emerald"
            />
            <StatCard
              title="Withdrawn Copies"
              value={withdrawn}
              subtitle="Decommissioned stock (excluded from active %)"
              icon={Archive}
              color="amber"
            />
            <StatCard
              title="Total Catalog Stock"
              value={totalAll}
              subtitle="Total recorded physical copies"
              icon={CheckCircle2}
              color="blue"
            />
            <StatCard
              title="Shelf Location Coverage"
              value={`${shelfCov?.shelfLocationCoveragePercentage ?? 0}%`}
              subtitle={`${shelfCov?.copiesWithShelfLocationCount ?? 0} assigned out of ${eligibleActive}`}
              icon={MapPin}
              color="indigo"
            />
          </>
        )}
      </div>

      {/* Condition Distribution Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Condition Grade Breakdown</h3>
            <p className="text-xs text-slate-500">
              Computed strictly against eligible active copies ({eligibleActive} physical copies)
            </p>
          </div>
          {condition?.reconciliationSummary?.isFullyReconciled && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-xs font-bold">
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Category Sum Reconciled</span>
            </div>
          )}
        </div>

        {/* Condition Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <span className="text-[11px] font-extrabold uppercase text-emerald-800 block">Good</span>
            <span className="text-2xl font-black text-emerald-950 mt-1 block">
              {dist?.good?.count ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 block mt-1">
              {dist?.good?.percentage ?? 0}% of active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200">
            <span className="text-[11px] font-extrabold uppercase text-blue-800 block">Fair</span>
            <span className="text-2xl font-black text-blue-950 mt-1 block">
              {dist?.fair?.count ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-blue-700 block mt-1">
              {dist?.fair?.percentage ?? 0}% of active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200">
            <span className="text-[11px] font-extrabold uppercase text-amber-800 block">Poor</span>
            <span className="text-2xl font-black text-amber-950 mt-1 block">
              {dist?.poor?.count ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-amber-700 block mt-1">
              {dist?.poor?.percentage ?? 0}% of active
            </span>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200">
            <span className="text-[11px] font-extrabold uppercase text-rose-800 block">Damaged</span>
            <span className="text-2xl font-black text-rose-950 mt-1 block">
              {dist?.damaged?.count ?? 0}
            </span>
            <span className="text-[11px] font-semibold text-rose-700 block mt-1">
              {dist?.damaged?.percentage ?? 0}% of active
            </span>
          </div>
        </div>

        {/* Visual Stacked Bar */}
        {eligibleActive > 0 && (
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex pt-1">
            <div
              title={`Good: ${dist?.good?.count}`}
              style={{ width: `${dist?.good?.percentage ?? 0}%` }}
              className="bg-emerald-500 h-full transition-all"
            />
            <div
              title={`Fair: ${dist?.fair?.count}`}
              style={{ width: `${dist?.fair?.percentage ?? 0}%` }}
              className="bg-blue-500 h-full transition-all"
            />
            <div
              title={`Poor: ${dist?.poor?.count}`}
              style={{ width: `${dist?.poor?.percentage ?? 0}%` }}
              className="bg-amber-500 h-full transition-all"
            />
            <div
              title={`Damaged: ${dist?.damaged?.count}`}
              style={{ width: `${dist?.damaged?.percentage ?? 0}%` }}
              className="bg-rose-500 h-full transition-all"
            />
          </div>
        )}
      </div>

      {/* Static Catalog Shelf Location Coverage & Limitations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Shelf Coverage */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Catalog Shelf Location Coverage</h3>
              <p className="text-xs text-slate-500">Mapping static shelf assignments in catalog metadata</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Shelf Assigned</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {shelfCov?.copiesWithShelfLocationCount ?? 0}
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold block mt-0.5">
                {shelfCov?.shelfLocationCoveragePercentage ?? 0}% assigned
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Unassigned Location</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {shelfCov?.copiesWithoutShelfLocationCount ?? 0}
              </span>
              <span className="text-[11px] text-amber-600 font-semibold block mt-0.5">
                Missing shelf tag
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-600 font-medium">
            <span>Distinct Physical Locations Mapped: </span>
            <span className="font-bold text-slate-900">{shelfCov?.uniqueShelfLocationsCount ?? shelfCov?.distinctShelfLocationsCount ?? 0} racks/bays</span>
          </div>
        </div>

        {/* Right: Reconciliation Drift & Lifecycle Events */}
        <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Stock Reconciliation Drift</h3>
              <p className="text-xs text-slate-500">Manual stock counter adjustments vs operational events</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Net Total Drift</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {(drift?.netTotalCopiesDrift ?? 0) >= 0 ? `+${drift?.netTotalCopiesDrift}` : drift?.netTotalCopiesDrift}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                Across {drift?.reconciliationEventsCount ?? 0} audit events
              </span>
            </div>

            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50">
              <span className="text-[11px] font-bold text-slate-500 uppercase block">Net Available Drift</span>
              <span className="text-xl font-black text-slate-900 mt-1 block">
                {(drift?.netAvailableCopiesDrift ?? 0) >= 0
                  ? `+${drift?.netAvailableCopiesDrift}`
                  : drift?.netAvailableCopiesDrift}
              </span>
              <span className="text-[11px] text-slate-400 block mt-0.5">
                {drift?.reconciledBooksCount ?? 0} books adjusted
              </span>
            </div>
          </div>

          {/* Operational Copy Lifecycle Counts */}
          <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-600 flex-wrap gap-2">
            <div>
              <span className="text-slate-400">Added: </span>
              <span className="font-bold text-slate-800">+{lifecycle?.copyAdditionsCount ?? 0}</span>
            </div>
            <div>
              <span className="text-slate-400">Deleted: </span>
              <span className="font-bold text-slate-800">-{lifecycle?.copyDeletionsCount ?? 0}</span>
            </div>
            <div>
              <span className="text-slate-400">Withdrawn: </span>
              <span className="font-bold text-slate-800">{lifecycle?.copyWithdrawalsCount ?? 0}</span>
            </div>
            <div>
              <span className="text-slate-400">Marked Lost: </span>
              <span className="font-bold text-slate-800">{lifecycle?.copyLostEventsCount ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Mandatory Truth-in-Data Shelf-Audit Limitation Banner */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-3 text-xs text-amber-900">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="font-bold">Shelf-Audit Limitation Notice (Truth in Data Governance)</h4>
          <p className="text-[11px] leading-relaxed text-amber-800">
            {shelf?.dataLimitation ||
              'Physical shelf-audit observations are not supported by the current schema. No misplaced-copy detection is available without physical barcode scan logs. Displayed shelf data reflects static catalog metadata rather than physical verification.'}
          </p>
          {shelf?.minimumFutureRequirement && (
            <p className="text-[10px] text-amber-700/90 font-medium">
              Future Capability Requirement: {shelf.minimumFutureRequirement}
            </p>
          )}
        </div>
      </div>

      {/* Inventory Copy Roster Sample */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Physical Copy Catalog Roster</h3>
            <p className="text-xs text-slate-500">
              {copies.length} copies matching program and filter scope
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Inventory copy roster">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider">
                <th scope="col" className="py-2.5 px-4">Book Title</th>
                <th scope="col" className="py-2.5 px-4">Copy / Barcode</th>
                <th scope="col" className="py-2.5 px-4">Condition</th>
                <th scope="col" className="py-2.5 px-4">Status</th>
                <th scope="col" className="py-2.5 px-4">Shelf Location</th>
                <th scope="col" className="py-2.5 px-4 text-right">Programs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-16" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : copies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No physical copy records found for current criteria.
                  </td>
                </tr>
              ) : (
                copies.slice(0, 50).map((c) => (
                  <tr key={c.copyId} className="hover:bg-slate-50/50">
                    <td className="py-2.5 px-4 font-bold text-slate-900 truncate max-w-xs">{c.bookTitle}</td>
                    <td className="py-2.5 px-4 text-slate-600 font-mono text-[11px]">
                      #{c.copyNumber} • {c.barcode}
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold ${
                          c.condition === 'Good'
                            ? 'bg-emerald-100 text-emerald-800'
                            : c.condition === 'Fair'
                            ? 'bg-blue-100 text-blue-800'
                            : c.condition === 'Poor'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {c.condition}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          c.status === 'AVAILABLE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : c.status === 'ISSUED'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : c.status === 'WITHDRAWN'
                            ? 'bg-slate-100 text-slate-600 border border-slate-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-700 font-medium">
                      {c.shelfLocation || <span className="text-slate-400 italic">Unassigned</span>}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      {c.programs && c.programs.length > 0 ? (
                        c.programs.map((p) => (
                          <span
                            key={p}
                            className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 ml-1"
                          >
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400 text-[10px]">General</span>
                      )}
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

export default InventoryConditionTab;
