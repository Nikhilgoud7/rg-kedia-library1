import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Lending, BookRequest } from '../../types';
import { BookmarkCheck, Clock, AlertTriangle, RotateCw, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const MyBorrowings: React.FC = () => {
  const [activeLendings, setActiveLendings] = useState<Lending[]>([]);
  const [historyLendings, setHistoryLendings] = useState<Lending[]>([]);
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'ISSUED' | 'REQUESTS' | 'HISTORY'>('ISSUED');
  const [loading, setLoading] = useState(true);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [policyLimits, setPolicyLimits] = useState<{ maxRenewals?: number; renewalDays?: number } | null>(null);

  // Pagination states
  const [issuedPage, setIssuedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [requestsPage, setRequestsPage] = useState(1);

  const [issuedPagination, setIssuedPagination] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [historyPagination, setHistoryPagination] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [requestsPagination, setRequestsPagination] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const handleRenew = async (lendingId: string) => {
    try {
      setRenewingId(lendingId);
      const res = await api.post(`/lending/renew/${lendingId}`);
      toast.success(res.data.message || 'Loan renewed successfully!');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to renew loan');
    } finally {
      setRenewingId(null);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to cancel this pending request?')) {
      return;
    }
    try {
      setCancellingId(requestId);
      const res = await api.post(`/lending/cancel-request/${requestId}`);
      toast.success(res.data.message || 'Request cancelled successfully');
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to cancel request');
    } finally {
      setCancellingId(null);
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [issuedRes, historyRes, requestsRes] = await Promise.all([
        api.get('/lending/my-books', { params: { status: 'ISSUED', page: issuedPage, limit: 20 } }),
        api.get('/lending/my-books', { params: { status: 'RETURNED', page: historyPage, limit: 20 } }),
        api.get('/lending/my-requests', { params: { page: requestsPage, limit: 20 } }),
      ]);

      setActiveLendings(issuedRes.data.lendings || []);
      setPolicyLimits(issuedRes.data.limits || null);
      if (issuedRes.data.pagination) setIssuedPagination(issuedRes.data.pagination);

      setHistoryLendings(historyRes.data.lendings || []);
      if (historyRes.data.pagination) setHistoryPagination(historyRes.data.pagination);

      setRequests(requestsRes.data.requests || []);
      if (requestsRes.data.pagination) setRequestsPagination(requestsRes.data.pagination);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load borrowing records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [issuedPage, historyPage, requestsPage]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Library Pass & Borrowings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Check your return due dates, pending borrow approvals, and complete lending history
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('ISSUED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'ISSUED'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Currently Issued ({issuedPagination.total})
          </button>
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'REQUESTS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending & Past Requests ({requestsPagination.total})
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'HISTORY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past History ({historyPagination.total})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'ISSUED' && (
        <div className="space-y-4">
          {activeLendings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <BookmarkCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">No Books Currently Issued</h3>
              <p className="text-xs text-slate-500 mt-1">
                You have zero books currently checked out in your name.
              </p>
            </div>
          ) : (
            activeLendings.map((lending) => {
              const now = new Date();
              const dueDate = new Date(lending.dueDate);
              const isOverdue = now > dueDate;
              const daysLeft = Math.ceil(
                (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={lending.id}
                  className={`bg-white p-6 rounded-2xl border shadow-xs transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isOverdue ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {lending.bookCopy?.book?.segment || 'Textbook'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Copy #{lending.bookCopy?.copyNumber}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {lending.bookCopy?.book?.title}
                    </h3>
                    <p className="text-xs text-slate-500">by {lending.bookCopy?.book?.author}</p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                      <span>Issued: {new Date(lending.issuedDate).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>
                        Return Due: <strong>{dueDate.toLocaleDateString()}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-3 text-right">
                    {isOverdue ? (
                      <div className="p-3 bg-red-100 rounded-xl border border-red-200 text-right inline-block">
                        <div className="flex items-center justify-end gap-1 text-xs font-bold text-red-800">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>Overdue by {Math.abs(daysLeft)} Days</span>
                        </div>
                        <p className="text-[11px] text-red-700 mt-0.5">
                          Please return to library as soon as possible.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-right inline-block">
                        <div className="flex items-center justify-end gap-1 text-xs font-bold text-emerald-800">
                          <Clock className="w-4 h-4 text-emerald-600" />
                          <span>{daysLeft} Days Remaining</span>
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Please return by {dueDate.toLocaleDateString()}
                        </p>
                      </div>
                    )}

                    {/* Renew Action / Status */}
                    {isOverdue ? (
                      <span className="text-[11px] font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                        Overdue — Cannot Renew
                      </span>
                    ) : (lending.renewalCount || 0) >= (policyLimits?.maxRenewals ?? 1) ? (
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200">
                        Max Renewals Reached ({lending.renewalCount || 0}/{policyLimits?.maxRenewals ?? 1})
                      </span>
                    ) : (
                      <button
                        onClick={() => handleRenew(lending.id)}
                        disabled={renewingId === lending.id}
                        className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold rounded-xl text-xs transition shadow-xs inline-flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${renewingId === lending.id ? 'animate-spin' : ''}`} />
                        <span>{renewingId === lending.id ? 'Renewing...' : `Renew Loan (+${policyLimits?.renewalDays ?? 30} Days)`}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Issued Pagination Controls */}
          {issuedPagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600">
              <span>Page {issuedPagination.page} of {issuedPagination.totalPages} ({issuedPagination.total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={issuedPage <= 1}
                  onClick={() => setIssuedPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={issuedPage >= issuedPagination.totalPages}
                  onClick={() => setIssuedPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'REQUESTS' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">No Requests Found</h3>
              <p className="text-xs text-slate-500 mt-1">
                You have not submitted any borrow or return requests.
              </p>
            </div>
          ) : (
            requests.map((req) => (
              <div
                key={req.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Request Type Badge */}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        req.type === 'RETURN_REQUEST'
                          ? 'bg-purple-100 text-purple-900'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {req.type === 'RETURN_REQUEST' ? 'Return Request' : 'Borrow Request'}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        req.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-900'
                          : req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-red-100 text-red-900'
                      }`}
                    >
                      {req.status}
                    </span>

                    <span className="text-[11px] text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1.5">{req.book?.title}</h4>
                  <p className="text-xs text-slate-500">by {req.book?.author}</p>
                  {req.message && (
                    <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      Note: {req.message}
                    </p>
                  )}
                  {req.responseMessage && (
                    <p className="text-xs text-slate-700 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-200">
                      Response: {req.responseMessage}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2 text-right shrink-0">
                  {req.status === 'PENDING' && (
                    <>
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                        Under Review
                      </span>
                      <button
                        onClick={() => handleCancelRequest(req.id)}
                        disabled={cancellingId === req.id}
                        className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold rounded-xl text-xs transition shadow-xs disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>{cancellingId === req.id ? 'Cancelling...' : 'Cancel Request'}</span>
                      </button>
                    </>
                  )}
                  {req.status === 'APPROVED' && (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                      Approved for Pickup
                    </span>
                  )}
                  {req.status === 'REJECTED' && (
                    <span className="text-xs font-semibold text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                      {req.responseMessage === 'Cancelled by user' ? 'Cancelled by You' : 'Rejected'}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}

          {/* Requests Pagination Controls */}
          {requestsPagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600">
              <span>Page {requestsPagination.page} of {requestsPagination.totalPages} ({requestsPagination.total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={requestsPage <= 1}
                  onClick={() => setRequestsPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={requestsPage >= requestsPagination.totalPages}
                  onClick={() => setRequestsPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'HISTORY' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="py-3 px-4">Book Title & Author</th>
                  <th className="py-3 px-4">Category / Segment</th>
                  <th className="py-3 px-4">Issued On</th>
                  <th className="py-3 px-4">Returned On</th>
                  <th className="py-3 px-4">Renewals</th>
                  <th className="py-3 px-4">Late Days</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyLendings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400">
                      No past return records yet
                    </td>
                  </tr>
                ) : (
                  historyLendings.map((l) => (
                    <tr key={l.id}>
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{l.bookCopy?.book?.title}</div>
                        <div className="text-[11px] text-slate-500">by {l.bookCopy?.book?.author}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {l.bookCopy?.book?.category || 'TEXTBOOK'} • {l.bookCopy?.book?.segment}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {new Date(l.issuedDate).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {l.returnedDate ? new Date(l.returnedDate).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-4 text-slate-600 font-semibold">
                        {l.renewalCount && l.renewalCount > 0 ? `${l.renewalCount} renewal(s)` : '0 renewals'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-700">
                        {l.daysOverdue ? `${l.daysOverdue} days late` : 'On Time'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                          Returned
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* History Pagination Controls */}
          {historyPagination.totalPages > 1 && (
            <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 text-xs font-semibold text-slate-600">
              <span>Page {historyPagination.page} of {historyPagination.totalPages} ({historyPagination.total} total)</span>
              <div className="flex gap-2">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={historyPage >= historyPagination.totalPages}
                  onClick={() => setHistoryPage((p) => p + 1)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MyBorrowings;
