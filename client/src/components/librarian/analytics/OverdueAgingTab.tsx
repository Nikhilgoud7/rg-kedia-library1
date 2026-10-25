import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import { OverdueAndLossData } from '../../../types/reports';
import StatCard from '../../common/StatCard';
import AnalyticsDateFilter from './AnalyticsDateFilter';
import CsvExportButton from './CsvExportButton';
import {
  AlertTriangle,
  Users,
  Clock,
  ShieldAlert,
  AlertCircle,
  RefreshCw,
  Inbox,
  Info,
  DollarSign,
  FileText,
} from 'lucide-react';

export const OverdueAgingTab: React.FC = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [asOfDate, setAsOfDate] = useState(todayStr);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [data, setData] = useState<OverdueAndLossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequestId = useRef(0);

  const fetchOverdue = useCallback(async () => {
    if (startDate && endDate && startDate > endDate) return;

    const reqId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string> = {};
      if (asOfDate) params.asOfDate = asOfDate;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (programId) params.programId = programId;

      const res = await api.get('/reports/overdue-loss', { params });

      if (reqId === activeRequestId.current) {
        setData(res.data.data);
      }
    } catch (err: any) {
      if (reqId === activeRequestId.current) {
        console.error('Failed to load overdue and loss report:', err);
        setError(err.response?.data?.error || 'Unable to load overdue and loss report.');
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [asOfDate, startDate, endDate, programId]);

  useEffect(() => {
    fetchOverdue();
  }, [fetchOverdue]);

  const queryParams = new URLSearchParams();
  queryParams.set('format', 'csv');
  if (asOfDate) queryParams.set('asOfDate', asOfDate);
  if (startDate) queryParams.set('startDate', startDate);
  if (endDate) queryParams.set('endDate', endDate);
  if (programId) queryParams.set('programId', programId);

  const csvEndpoint = `/reports/overdue-loss?${queryParams.toString()}`;
  const csvFilename = `overdue-loss-report-${asOfDate}${programId ? `-${programId.toLowerCase()}` : ''}.csv`;

  const overdueSummary = data?.overdueSummary;
  const aging = overdueSummary?.agingDistribution;
  const totalOverdue = overdueSummary?.totalOverdueLoans ?? 0;
  const items = overdueSummary?.items || [];
  const lossData = data?.inventoryLossAndDamage;
  const fineRec = data?.fineReconciliation;

  // Aging calculation
  const tier1 = aging?.tier1To7Days ?? 0;
  const tier2 = aging?.tier8To14Days ?? 0;
  const tier3 = aging?.tier15To30Days ?? 0;
  const tier4 = aging?.tier31PlusDays ?? aging?.tier30PlusDays ?? 0;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <AnalyticsDateFilter
        asOfDate={asOfDate}
        onAsOfDateChange={(d) => setAsOfDate(d)}
        showAsOfDate={true}
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

      {/* Header and Export Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Overdue, Aging & Loss Analytics</h2>
          <p className="text-xs text-slate-500">
            Aging delinquency tiers, damaged/lost stock indicators, and fine policy reconciliation
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
            onClick={fetchOverdue}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition shadow-xs disabled:opacity-50"
            aria-label="Refresh overdue report"
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
            onClick={fetchOverdue}
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
              title="Active Overdue Loans"
              value={totalOverdue}
              subtitle="Loans past scheduled due date"
              icon={AlertTriangle}
              color="red"
            />
            <StatCard
              title="Affected Borrowers"
              value={overdueSummary?.affectedBorrowersCount ?? 0}
              subtitle="Distinct students & faculty with overdue items"
              icon={Users}
              color="amber"
            />
            <StatCard
              title="Overdue Physical Copies"
              value={overdueSummary?.outstandingOverdueCopiesCount ?? 0}
              subtitle="Physical book copies delayed in return"
              icon={Clock}
              color="indigo"
            />
            <StatCard
              title="Severe Overdue (31+ Days)"
              value={tier4}
              subtitle="Delinquency exceeding 30 days"
              icon={ShieldAlert}
              color="purple"
            />
          </>
        )}
      </div>

      {/* Aging Distribution Breakdown (4 Distinct Buckets) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Delinquency Aging Distribution</h3>
            <p className="text-xs text-slate-500">
              Categorized into 4 strict non-overlapping day tiers calculated at midnight UTC
            </p>
          </div>
          <div className="text-xs font-semibold text-slate-500">
            Total Overdue: <span className="font-extrabold text-slate-900">{totalOverdue}</span>
          </div>
        </div>

        {/* 4 Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80">
            <span className="text-[11px] font-extrabold uppercase text-amber-700 block">Tier 1: 1–7 Days</span>
            <div className="text-2xl font-black text-amber-900 mt-1">{tier1}</div>
            <span className="text-[10px] text-amber-700/80 block mt-1">
              {totalOverdue > 0 ? Math.round((tier1 / totalOverdue) * 100) : 0}% of overdue volume
            </span>
          </div>

          <div className="p-4 rounded-xl bg-orange-50/70 border border-orange-200/80">
            <span className="text-[11px] font-extrabold uppercase text-orange-700 block">Tier 2: 8–14 Days</span>
            <div className="text-2xl font-black text-orange-900 mt-1">{tier2}</div>
            <span className="text-[10px] text-orange-700/80 block mt-1">
              {totalOverdue > 0 ? Math.round((tier2 / totalOverdue) * 100) : 0}% of overdue volume
            </span>
          </div>

          <div className="p-4 rounded-xl bg-rose-50/70 border border-rose-200/80">
            <span className="text-[11px] font-extrabold uppercase text-rose-700 block">Tier 3: 15–30 Days</span>
            <div className="text-2xl font-black text-rose-900 mt-1">{tier3}</div>
            <span className="text-[10px] text-rose-700/80 block mt-1">
              {totalOverdue > 0 ? Math.round((tier3 / totalOverdue) * 100) : 0}% of overdue volume
            </span>
          </div>

          <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/80">
            <span className="text-[11px] font-extrabold uppercase text-purple-700 block">Tier 4: 31+ Days</span>
            <div className="text-2xl font-black text-purple-900 mt-1">{tier4}</div>
            <span className="text-[10px] text-purple-700/80 block mt-1">
              {totalOverdue > 0 ? Math.round((tier4 / totalOverdue) * 100) : 0}% of overdue volume
            </span>
          </div>
        </div>

        {/* Visual Stacked Progress Bar */}
        {totalOverdue > 0 && (
          <div className="space-y-1 pt-2">
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
              {tier1 > 0 && (
                <div
                  title={`1–7 Days: ${tier1}`}
                  style={{ width: `${(tier1 / totalOverdue) * 100}%` }}
                  className="bg-amber-500 h-full transition-all"
                />
              )}
              {tier2 > 0 && (
                <div
                  title={`8–14 Days: ${tier2}`}
                  style={{ width: `${(tier2 / totalOverdue) * 100}%` }}
                  className="bg-orange-500 h-full transition-all"
                />
              )}
              {tier3 > 0 && (
                <div
                  title={`15–30 Days: ${tier3}`}
                  style={{ width: `${(tier3 / totalOverdue) * 100}%` }}
                  className="bg-rose-500 h-full transition-all"
                />
              )}
              {tier4 > 0 && (
                <div
                  title={`31+ Days: ${tier4}`}
                  style={{ width: `${(tier4 / totalOverdue) * 100}%` }}
                  className="bg-purple-600 h-full transition-all"
                />
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold pt-1">
              <span>Short term delay (1–7d)</span>
              <span>Extended delinquency (31d+)</span>
            </div>
          </div>
        )}
      </div>

      {/* Lost & Damaged Stock Indicators (Current Status vs Historical Events) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Inventory Attrition & Condition Impact</h3>
          <p className="text-xs text-slate-500">
            Differentiating current copy catalog statuses from historical audit-trail occurrences
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Current Lost Copies</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {lossData?.totalLostCopies ?? 0}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              {lossData?.inventoryImpact?.lostPercentageOfPhysical ?? 0}% of active physical stock
            </span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Current Damaged Copies</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {lossData?.totalDamagedCopies ?? 0}
            </span>
            <span className="text-[11px] text-slate-500 block mt-1">
              {lossData?.inventoryImpact?.damagedPercentageOfPhysical ?? 0}% of active physical stock
            </span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Historical Loss Logs</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {lossData?.historicalLossRecordsCount ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">
              Cumulative BOOK_COPY_LOST audit events
            </span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
            <span className="text-[11px] font-bold text-slate-500 uppercase block">Historical Damage Logs</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {lossData?.historicalDamagedRecordsCount ?? 0}
            </span>
            <span className="text-[11px] text-slate-400 block mt-1">
              Cumulative BOOK_COPY_DAMAGED audit events
            </span>
          </div>
        </div>

        {/* Replacement History Limitation Note */}
        {lossData?.replacementHistoryStatus?.limitationNote && (
          <div className="p-3 bg-slate-100/80 rounded-xl text-xs text-slate-600 flex items-start gap-2 border border-slate-200">
            <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <span className="font-bold">Catalog Note: </span>
              {lossData.replacementHistoryStatus.limitationNote}
            </p>
          </div>
        )}
      </div>

      {/* Fine Policy Reconciliation & Honest Data Disclosure Banner */}
      <div className="bg-slate-900 text-slate-200 rounded-2xl p-6 shadow-md space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Institutional Fine Policy Reconciliation</h3>
              <p className="text-xs text-slate-400">R.G. Kedia College non-punitive academic lending policy</p>
            </div>
          </div>

          {/* Honest Status Badge (NEVER an unverified green "Verified Compliant" badge) */}
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            <span>Policy: ₹0 Fines (Enforced in App Logic • Unverified in Financial Ledger)</span>
          </div>
        </div>

        {/* Reported Values */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
            <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Assessed Fines</span>
            <span className="text-xl font-extrabold text-white mt-1 block">
              ₹{fineRec?.totalAssessedFines?.toFixed(2) ?? '0.00'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">As reported by application logic</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
            <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Collected Fines</span>
            <span className="text-xl font-extrabold text-white mt-1 block">
              ₹{fineRec?.totalCollectedFines?.toFixed(2) ?? '0.00'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">No monetary cash/bank inflows</span>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/80 border border-slate-700/60">
            <span className="text-[11px] font-bold uppercase text-slate-400 block">Total Outstanding Fines</span>
            <span className="text-xl font-extrabold text-white mt-1 block">
              ₹{fineRec?.totalOutstandingFines?.toFixed(2) ?? '0.00'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">No outstanding institutional receivables</span>
          </div>
        </div>

        {/* Explicit Data Limitation Notice */}
        <div className="p-3.5 bg-slate-800/50 border border-amber-500/30 rounded-xl text-xs text-slate-300 space-y-1.5">
          <div className="flex items-center gap-1.5 text-amber-400 font-bold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>Data Limitation & Policy Clarification</span>
          </div>
          <p className="text-[11px] leading-relaxed text-slate-300">
            {fineRec?.dataLimitation ||
              'No authoritative database fine-policy configuration table or monetary ledger exists in the schema. Recorded zero values reflect application business logic rather than independent financial policy verification.'}
          </p>
          {fineRec?.complianceNote && (
            <p className="text-[11px] leading-relaxed text-slate-400 border-t border-slate-700/50 pt-1.5 mt-1.5">
              {fineRec.complianceNote}
            </p>
          )}
        </div>
      </div>

      {/* Detailed Overdue Loan Items List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Overdue Loans Queue</h3>
            <p className="text-xs text-slate-500">
              {items.length} overdue loan records (PII-minimized institutional view)
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Overdue loans itemized list">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/75 text-slate-500 font-semibold uppercase tracking-wider">
                <th scope="col" className="py-2.5 px-4">Book Title</th>
                <th scope="col" className="py-2.5 px-4">Copy / Barcode</th>
                <th scope="col" className="py-2.5 px-4">Borrower</th>
                <th scope="col" className="py-2.5 px-4">Program / Branch</th>
                <th scope="col" className="py-2.5 px-4">Due Date</th>
                <th scope="col" className="py-2.5 px-4 text-right">Days Overdue</th>
                <th scope="col" className="py-2.5 px-4 text-right">Aging Bucket</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-36" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-24" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="py-3 px-4"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-4 bg-slate-100 rounded w-12 ml-auto" /></td>
                    <td className="py-3 px-4 text-right"><div className="h-5 bg-slate-100 rounded-full w-16 ml-auto" /></td>
                  </tr>
                ))
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-xs font-bold text-slate-700">No overdue loans found</p>
                    <p className="text-[11px] text-slate-400">All issued books are within their active loan periods.</p>
                  </td>
                </tr>
              ) : (
                items.map((loan) => (
                  <tr key={loan.lendingId} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <span className="font-bold text-slate-900 block truncate max-w-xs">{loan.bookTitle}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      #{loan.copyNumber} • {loan.barcode}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-800 block">{loan.borrowerName}</span>
                      <span className="text-[10px] text-slate-400 font-mono block">
                        {loan.borrowerRollNumber || loan.borrowerRole}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="font-medium block">{loan.borrowerProgram}</span>
                      {loan.borrowerBranch && (
                        <span className="text-[10px] text-slate-400 block">{loan.borrowerBranch}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700">
                      {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-red-600">
                      +{loan.daysOverdue} d
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                          loan.daysOverdue > 30
                            ? 'bg-purple-100 text-purple-800 border border-purple-200'
                            : loan.daysOverdue > 14
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : loan.daysOverdue > 7
                            ? 'bg-orange-100 text-orange-800 border border-orange-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {loan.agingBucket}
                      </span>
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

export default OverdueAgingTab;
