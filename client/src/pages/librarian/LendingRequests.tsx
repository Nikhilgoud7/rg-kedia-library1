import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { BookRequest } from '../../types';
import Modal from '../../components/common/Modal';
import { Check, X, Clock, BookOpen, User, Calendar, MessageSquare, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export const LendingRequests: React.FC = () => {
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Approval modal
  const [selectedRequest, setSelectedRequest] = useState<BookRequest | null>(null);
  const [daysToReturn, setDaysToReturn] = useState(14);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await api.get('/lending/requests');
      setRequests(res.data.requests || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load pending requests');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleApprove = async (request: BookRequest) => {
    try {
      await api.post(`/lending/approve/${request.id}`, { daysToReturn });
      toast.success(`Book "${request.book?.title}" issued to ${request.user?.name}!`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    try {
      await api.post(`/lending/reject/${selectedRequest.id}`, { reason: rejectReason });
      toast.success('Request rejected');
      setIsRejectModalOpen(false);
      setRejectReason('');
      setSelectedRequest(null);
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
          <span>{requests.length} Requests Pending Approval</span>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {loading ? (
          <div className="py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            Loading book requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="py-16 text-center bg-white rounded-2xl border border-slate-200">
            <Check className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">All Caught Up!</h3>
            <p className="text-xs text-slate-500 mt-1">No pending book lending requests at this time.</p>
          </div>
        ) : (
          requests.map((req) => (
            <div
              key={req.id}
              className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              {/* Book and User Info */}
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                    {req.type === 'BORROW' ? 'Borrow Request' : 'Early Return Notice'}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Requested on {new Date(req.createdAt).toLocaleDateString()} at{' '}
                    {new Date(req.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-amber-500" />
                      {req.book?.title}
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">by {req.book?.author}</p>
                    <span className="text-[11px] font-semibold text-emerald-600 mt-0.5 inline-block">
                      {req.book?.availableCopies} Copies Available in Library
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-bold text-slate-900 text-xs">{req.user?.name}</span>
                    </div>
                    {req.user?.rollNumber && (
                      <span className="text-[11px] text-slate-600 font-mono font-medium block">
                        Roll: {req.user.rollNumber}
                      </span>
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
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-100">
                <button
                  onClick={() => {
                    setSelectedRequest(req);
                    setIsRejectModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-xl transition border border-red-200"
                >
                  <X className="w-4 h-4 inline mr-1" />
                  Reject
                </button>

                <button
                  onClick={() => handleApprove(req)}
                  className="px-4 py-2 text-xs font-extrabold text-slate-950 bg-amber-500 hover:bg-amber-600 rounded-xl transition shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Approve & Issue Book
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => setIsRejectModalOpen(false)}
        title="Reject Book Request"
        maxWidth="md"
      >
        <form onSubmit={handleReject} className="space-y-4 text-xs">
          <p className="text-slate-600">
            Please specify why this request for{' '}
            <strong>"{selectedRequest?.book?.title}"</strong> cannot be approved at this time.
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
              onClick={() => setIsRejectModalOpen(false)}
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
