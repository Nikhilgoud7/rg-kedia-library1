import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import {
  ShieldCheck,
  Search,
  Filter,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  X,
  Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  targetId: string | null;
  details: string | null;
  timestamp: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters and search
  const [search, setSearch] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);

  const fetchAuditLogs = async (targetPage = page) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/audit-logs', {
        params: {
          action: selectedAction || undefined,
          search: search.trim() || undefined,
          page: String(targetPage),
          limit: String(limit),
        },
      });
      setLogs(res.data.logs || []);
      if (res.data.pagination) {
        setPage(res.data.pagination.page);
        setTotalPages(res.data.pagination.totalPages);
        setTotalLogs(res.data.pagination.total);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit logs', err);
      const msg = err.response?.data?.error || 'Failed to fetch administrative audit logs.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchAuditLogs(1);
  }, [selectedAction, limit]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchAuditLogs(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedAction('');
    setPage(1);
  };

  const getActionBadgeColor = (action: string) => {
    if (action.includes('DELETED') || action.includes('DEACTIVATED') || action.includes('REJECTED')) {
      return 'bg-red-50 text-red-700 border-red-200';
    }
    if (action.includes('CREATED') || action.includes('UPLOADED') || action.includes('APPROVED')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (action.includes('UPDATED') || action.includes('RETURNED') || action.includes('ROLE_CHANGED')) {
      return 'bg-blue-50 text-blue-700 border-blue-200';
    }
    return 'bg-amber-50 text-amber-800 border-amber-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              Administrative Governance
            </span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 mt-1">Audit Trail & Activity Log</h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Append-only record of all administrative events, user credential resets, role modifications, lending decisions, and material uploads.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by action, administrator name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              aria-label="Search audit trail"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            aria-label="Submit audit log search"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                fetchAuditLogs(1);
              }}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Action Filter */}
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            aria-label="Filter by administrative action"
          >
            <option value="">All Actions</option>
            <option value="USER_CREATED">USER_CREATED</option>
            <option value="USER_UPDATED">USER_UPDATED</option>
            <option value="USER_DEACTIVATED">USER_DEACTIVATED</option>
            <option value="USER_ACTIVATED">USER_ACTIVATED</option>
            <option value="ROLE_CHANGED">ROLE_CHANGED</option>
            <option value="PASSWORD_RESET">PASSWORD_RESET</option>
            <option value="USER_DELETED">USER_DELETED</option>
            <option value="BOOK_CREATED">BOOK_CREATED</option>
            <option value="BOOK_UPDATED">BOOK_UPDATED</option>
            <option value="BOOK_DELETED">BOOK_DELETED</option>
            <option value="BOOK_COPY_UPDATED">BOOK_COPY_UPDATED</option>
            <option value="LENDING_APPROVED">LENDING_APPROVED</option>
            <option value="LENDING_REJECTED">LENDING_REJECTED</option>
            <option value="LENDING_RETURNED">LENDING_RETURNED</option>
            <option value="EXAM_PAPER_UPLOADED">EXAM_PAPER_UPLOADED</option>
            <option value="EXAM_PAPER_DELETED">EXAM_PAPER_DELETED</option>
          </select>

          {/* Limit selector */}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            aria-label="Records per page"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchAuditLogs(page)}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="System Audit Trail">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th scope="col" className="py-3.5 px-4">Timestamp</th>
                <th scope="col" className="py-3.5 px-4">Action</th>
                <th scope="col" className="py-3.5 px-4">Actor</th>
                <th scope="col" className="py-3.5 px-4">Target ID</th>
                <th scope="col" className="py-3.5 px-4">Details / Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                    <td className="py-3.5 px-4"><div className="h-5 bg-slate-100 rounded-full w-24" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-200 rounded w-32" /></td>
                    <td className="py-3.5 px-4"><div className="h-3 bg-slate-100 rounded w-20 font-mono" /></td>
                    <td className="py-3.5 px-4"><div className="h-4 bg-slate-100 rounded w-48" /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center">
                    <div className="max-w-xs mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <FileSpreadsheet className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">No audit log entries found</p>
                      <p className="text-xs text-slate-500">
                        {search || selectedAction
                          ? 'No audit records match your current filter settings.'
                          : 'No administrative activities recorded yet.'}
                      </p>
                      {(search || selectedAction) && (
                        <button
                          onClick={handleClearFilters}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  let parsedDetails: any = null;
                  if (log.details) {
                    try {
                      parsedDetails = JSON.parse(log.details);
                    } catch {
                      parsedDetails = log.details;
                    }
                  }

                  return (
                    <tr key={log.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                        <div className="font-semibold text-slate-700">
                          {new Date(log.timestamp).toLocaleDateString()}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getActionBadgeColor(
                            log.action
                          )}`}
                        >
                          {log.action}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-800">{log.actor?.name || 'System Admin'}</div>
                        <div className="text-[10px] text-slate-400">{log.actor?.email}</div>
                        {log.actor?.role && (
                          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">
                            {log.actor.role}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                        {log.targetId ? (
                          <span title={log.targetId} className="bg-slate-100 px-1.5 py-0.5 rounded">
                            {log.targetId.substring(0, 8)}...
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 max-w-md">
                        {parsedDetails && typeof parsedDetails === 'object' ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(parsedDetails).map(([key, val]) => (
                              <span
                                key={key}
                                className="inline-flex items-center gap-1 text-[10px] bg-slate-50 border border-slate-200 px-1.5 py-0.5 rounded text-slate-700 font-medium"
                              >
                                <span className="font-bold text-slate-500">{key}:</span>
                                <span className="truncate max-w-[120px]">{String(val)}</span>
                              </span>
                            ))}
                          </div>
                        ) : log.details ? (
                          <span className="text-xs text-slate-600">{log.details}</span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        {!loading && totalLogs > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-semibold">
              Showing <span className="font-bold text-slate-900">{logs.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
              <span className="font-bold text-slate-900">{Math.min(page * limit, totalLogs)}</span> of{' '}
              <span className="font-bold text-slate-900">{totalLogs}</span> entries
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchAuditLogs(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="px-3 py-1 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => fetchAuditLogs(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogs;
