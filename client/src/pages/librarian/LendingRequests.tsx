import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { BookRequest } from '../../types';
import Modal from '../../components/common/Modal';
import {
  Check,
  X,
  Clock,
  BookOpen,
  User,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  MessageSquare,
  AlertCircle,
  Calendar,
  QrCode,
  Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const LendingRequests: React.FC = () => {
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Pagination
  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BORROW' | 'RETURN_REQUEST'>('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Approval modal
  const [selectedApproveRequest, setSelectedApproveRequest] = useState<BookRequest | null>(null);
  const [daysToReturn, setDaysToReturn] = useState(30);
  const [availableCopies, setAvailableCopies] = useState<any[]>([]);
  const [selectedCopyId, setSelectedCopyId] = useState<string>('');
  const [manualBarcode, setManualBarcode] = useState<string>('');
  const [loadingCopies, setLoadingCopies] = useState(false);

  // Fetch available copies when approval modal opens
  useEffect(() => {
    if (selectedApproveRequest?.bookId) {
      setLoadingCopies(true);
      setSelectedCopyId('');
      setManualBarcode('');
      api.get(`/books/${selectedApproveRequest.bookId}`)
        .then((res) => {
          const copies = res.data.book?.copies || [];
          const avail = copies.filter((c: any) => c.status === 'AVAILABLE');
          setAvailableCopies(avail);
        })
        .catch((err) => {
          console.error('Failed to load copies for approval:', err);
          setAvailableCopies([]);
        })
        .finally(() => setLoadingCopies(false));
    } else {
      setAvailableCopies([]);
      setSelectedCopyId('');
      setManualBarcode('');
    }
  }, [selectedApproveRequest]);

  // Rejection modal
  const [selectedRejectRequest, setSelectedRejectRequest] = useState<BookRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
        status: statusFilter,
        type: typeFilter,
      };
      if (search.trim()) {
        params.search = search.trim();
      }

      const res = await api.get('/lending/requests', { params });
      setRequests(res.data.requests || []);
      if (res.data.pagination) {
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages || 1);
      } else {
        setTotal(res.data.requests?.length || 0);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, typeFilter, search]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const handleApproveConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApproveRequest) return;
    try {
      const payload: any = { daysToReturn };
      if (manualBarcode.trim()) {
        payload.barcode = manualBarcode.trim();
      } else if (selectedCopyId) {
        payload.bookCopyId = selectedCopyId;
      }

      await api.post(`/lending/approve/${selectedApproveRequest.id}`, payload);
      toast.success(
        `Book "${selectedApproveRequest.book?.title}" issued to ${selectedApproveRequest.user?.name} for ${daysToReturn} days!`
      );
      setSelectedApproveRequest(null);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRejectRequest) return;
    try {
      await api.post(`/lending/reject/${selectedRejectRequest.id}`, { reason: rejectReason });
      toast.success('Request rejected');
      setIsRejectModalOpen(false);
      setRejectReason('');
      setSelectedRejectRequest(null);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject request');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Book Lending Requests</h1>
          <p className="text-xs text-slate-500 mt-1">
            Review and approve student and faculty book reservation / lending applications
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-amber-700 bg-amber-50 px-3.5 py-2 rounded-xl border border-amber-200">
          <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{total} Total Records Matching Filter</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl">
            {(
              [
                { label: 'Pending', value: 'PENDING' },
                { label: 'Approved', value: 'APPROVED' },
                { label: 'Rejected', value: 'REJECTED' },
                { label: 'All Requests', value: 'ALL' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  statusFilter === tab.value
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> Type:
            </span>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as any);
                setPage(1);
              }}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
            >
              <option value="ALL">All Types</option>
              <option value="BORROW">Borrow Request</option>
              <option value="RETURN_REQUEST">Early Return Notice</option>
            </select>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search requests by book title, student/teacher name, or roll number..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
          />
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-2"></div>
            <p className="text-xs font-medium">Loading requests queue...</p>
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Records Found</h3>
            <p className="text-xs text-slate-500 mt-1">
              {statusFilter === 'PENDING'
                ? 'All caught up! No pending requests awaiting review.'
                : 'No requests match your selected filters.'}
            </p>
          </div>
        ) : (
          requests.map((req) => (
            <div
              key={req.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Book and User Info */}
              <div className="space-y-2 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      req.type === 'BORROW'
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-indigo-100 text-indigo-900'
                    }`}
                  >
                    {req.type === 'BORROW' ? 'Borrow Request' : 'Early Return Notice'}
                  </span>

                  <span
                    className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                      req.status === 'PENDING'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : req.status === 'APPROVED'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-red-50 text-red-700 border-red-200'
                    }`}
                  >
                    {req.status}
                  </span>

                  <span className="text-[11px] text-slate-400">
                    Requested on {new Date(req.createdAt).toLocaleDateString()} at{' '}
                    {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>{req.book?.title}</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">by {req.book?.author}</p>
                    <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 inline-block">
                      {req.book?.availableCopies ?? 0} Copies Available in Library
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-900 text-xs">{req.user?.name}</span>
                    </div>
                    {req.user?.rollNumber ? (
                      <span className="text-[11px] text-slate-600 font-mono font-medium block">
                        Roll: {req.user.rollNumber}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px] block">Faculty Staff</span>
                    )}
                    <span className="text-[11px] text-slate-500 block">
                      {req.user?.program} ({req.user?.branch})
                    </span>
                  </div>
                </div>

                {req.message && (
                  <div className="p-2.5 bg-slate-50 rounded-xl text-xs text-slate-600 border border-slate-100 flex items-start gap-2">
                    <MessageSquare className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                    <span>
                      <strong className="text-slate-700">Applicant Note:</strong> {req.message}
                    </span>
                  </div>
                )}

                {req.responseMessage && (
                  <div className="p-2.5 bg-red-50 rounded-xl text-xs text-red-700 border border-red-100 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
                    <span>
                      <strong>Rejection Reason:</strong> {req.responseMessage}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100 shrink-0">
                {req.status === 'PENDING' ? (
                  req.type === 'RETURN_REQUEST' ? (
                    <span className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 rounded-xl border border-amber-200 inline-block">
                      Return Notice Sent (Pending Student Return)
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setSelectedRejectRequest(req);
                          setIsRejectModalOpen(true);
                        }}
                        className="px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition border border-red-200"
                      >
                        <X className="w-4 h-4 inline mr-1" />
                        Reject
                      </button>

                      <button
                        onClick={() => {
                          setSelectedApproveRequest(req);
                          setDaysToReturn(30);
                        }}
                        className="px-4 py-2 text-xs font-extrabold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-xs flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" />
                        Approve & Issue
                      </button>
                    </>
                  )
                ) : req.status === 'APPROVED' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Approved & Issued
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                    <XCircle className="w-4 h-4 text-red-500" />
                    Request Rejected
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between text-xs">
          <span className="text-slate-500">
            Showing Page <strong className="text-slate-900">{page}</strong> of{' '}
            <strong className="text-slate-900">{totalPages}</strong> ({total} total requests)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-bold text-slate-700 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}

      {/* Approve Modal */}
      <Modal
        isOpen={!!selectedApproveRequest}
        onClose={() => setSelectedApproveRequest(null)}
        title="Approve Lending Application"
        maxWidth="md"
      >
        {selectedApproveRequest && (
          <form onSubmit={handleApproveConfirm} className="space-y-4 text-xs">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1">
              <p className="font-bold text-amber-950">Book: {selectedApproveRequest.book?.title}</p>
              <p className="text-amber-800">
                Borrower: <strong>{selectedApproveRequest.user?.name}</strong> (
                {selectedApproveRequest.user?.rollNumber || selectedApproveRequest.user?.role})
              </p>
              <p className="text-[11px] text-amber-700">
                Available Copies: {selectedApproveRequest.book?.availableCopies ?? 0}
              </p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Loan Duration (Days to Return) *
              </label>
              <input
                type="number"
                min={1}
                max={365}
                required
                value={daysToReturn}
                onChange={(e) => setDaysToReturn(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Calculated Due Date:{' '}
                <strong className="text-slate-800">
                  {new Date(Date.now() + daysToReturn * 24 * 60 * 60 * 1000).toLocaleDateString()}
                </strong>{' '}
                (Standard 30-day loan policy)
              </p>
            </div>

            {/* Physical Copy & Barcode Allocation */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-slate-600" />
                  Physical Copy Allocation (Optional)
                </span>
                <span className="text-[10px] text-slate-500">
                  {loadingCopies ? 'Loading copies...' : `${availableCopies.length} copy/copies available`}
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 text-[11px]">
                  Select Available Copy
                </label>
                <select
                  disabled={loadingCopies}
                  value={selectedCopyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedCopyId(id);
                    if (id) {
                      const match = availableCopies.find((c) => c.id === id);
                      if (match?.barcode) {
                        setManualBarcode(match.barcode);
                      }
                    } else {
                      setManualBarcode('');
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">Auto-allocate next available copy (Default)</option>
                  {availableCopies.map((c) => (
                    <option key={c.id} value={c.id}>
                      Copy #{c.copyNumber} — Barcode: {c.barcode || 'N/A'} (Rack: {c.shelfLocation || 'N/A'}, Condition: {c.condition})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1 text-[11px] flex items-center gap-1">
                  <QrCode className="w-3 h-3 text-slate-500" />
                  Scan or Enter Barcode Directly
                </label>
                <input
                  type="text"
                  placeholder="e.g. BC-12345 (matches copy automatically)"
                  value={manualBarcode}
                  onChange={(e) => {
                    const bc = e.target.value;
                    setManualBarcode(bc);
                    const match = availableCopies.find((c) => c.barcode?.toLowerCase() === bc.trim().toLowerCase());
                    if (match) {
                      setSelectedCopyId(match.id);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-xs focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Leave blank to auto-allocate or select from available copies above.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSelectedApproveRequest(null)}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl font-extrabold transition shadow-xs flex items-center gap-1.5"
              >
                <Check className="w-4 h-4" />
                Confirm & Issue Book
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setSelectedRejectRequest(null);
        }}
        title="Reject Book Request"
        maxWidth="md"
      >
        <form onSubmit={handleReject} className="space-y-4 text-xs">
          <p className="text-slate-600">
            Please specify why this request for{' '}
            <strong>"{selectedRejectRequest?.book?.title}"</strong> cannot be approved at this time.
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Reason / Note for Applicant *</label>
            <textarea
              required
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Please return overdue books before requesting new titles."
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIsRejectModalOpen(false);
                setSelectedRejectRequest(null);
              }}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition"
            >
              Confirm Rejection
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default LendingRequests;
