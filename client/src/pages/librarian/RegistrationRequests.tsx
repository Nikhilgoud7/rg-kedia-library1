import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import {
  UserCheck,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  GraduationCap,
  Mail,
  Phone,
  RefreshCw,
  AlertCircle,
  Calendar,
  Building,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '../../components/common/Modal';

interface RegistrationItem {
  id: string;
  name: string;
  email: string;
  role: 'STUDENT' | 'TEACHER' | 'LIBRARIAN';
  rollNumber?: string | null;
  program?: string | null;
  branch?: string | null;
  semester?: number | null;
  gender?: string | null;
  phone?: string | null;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvedAt?: string | null;
  approvedById?: string | null;
  rejectionReason?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export const RegistrationRequests: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'PENDING' | 'APPROVED' | 'REJECTED'>('PENDING');
  const [registrations, setRegistrations] = useState<RegistrationItem[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'STUDENT' | 'TEACHER'>('ALL');

  // Action Modals State
  const [selectedItem, setSelectedItem] = useState<RegistrationItem | null>(null);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const fetchRegistrations = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/registrations', {
        params: {
          status: activeTab,
          role: roleFilter !== 'ALL' ? roleFilter : undefined,
          search: search.trim() || undefined,
        },
      });
      setRegistrations(res.data.registrations || []);
      if (res.data.counts) {
        setCounts(res.data.counts);
      }
    } catch (err: any) {
      console.error('Error fetching registrations:', err);
      toast.error('Failed to load registration applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistrations();
  }, [activeTab, roleFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchRegistrations();
  };

  const handleApprove = async () => {
    if (!selectedItem) return;
    setIsProcessing(true);
    try {
      await api.put(`/admin/registrations/${selectedItem.id}/approve`);
      toast.success(`Approved registration for ${selectedItem.name}`);
      setIsApproveModalOpen(false);
      setSelectedItem(null);
      fetchRegistrations();
    } catch (err: any) {
      console.error('Approval error:', err);
      toast.error(err.response?.data?.error || 'Failed to approve registration.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    setIsProcessing(true);
    try {
      await api.put(`/admin/registrations/${selectedItem.id}/reject`, {
        reason: rejectionReason.trim() || undefined,
      });
      toast.success(`Rejected registration for ${selectedItem.name}`);
      setIsRejectModalOpen(false);
      setSelectedItem(null);
      setRejectionReason('');
      fetchRegistrations();
    } catch (err: any) {
      console.error('Rejection error:', err);
      toast.error(err.response?.data?.error || 'Failed to reject registration.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Registration Requests
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900">
              {counts.pending} Pending
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Review and approve student and faculty self-registration applications for library membership.
          </p>
        </div>

        <button
          type="button"
          onClick={fetchRegistrations}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-xs transition cursor-pointer self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-2 pt-2 gap-2 shadow-xs">
        <button
          type="button"
          onClick={() => setActiveTab('PENDING')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'PENDING'
              ? 'border-amber-500 text-amber-600 bg-amber-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Clock className="w-4 h-4 text-amber-500" />
          <span>Pending Review</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-800">
            {counts.pending}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('APPROVED')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'APPROVED'
              ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <span>Approved</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">
            {counts.approved}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REJECTED')}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'REJECTED'
              ? 'border-rose-500 text-rose-600 bg-rose-50/50 rounded-t-xl'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <XCircle className="w-4 h-4 text-rose-500" />
          <span>Rejected</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800">
            {counts.rejected}
          </span>
        </button>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-b-2xl border-x border-b border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by candidate name, roll number, or email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          />
        </form>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
          >
            <option value="ALL">All Roles</option>
            <option value="STUDENT">Students Only</option>
            <option value="TEACHER">Faculty / Teachers Only</option>
          </select>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto mb-3" />
          <p className="text-xs font-bold text-slate-500">Loading registrations...</p>
        </div>
      ) : registrations.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 shadow-xs">
          <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-400">
            <UserCheck className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-900 mb-1">
            No {activeTab.toLowerCase()} registrations found
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === 'PENDING'
              ? 'There are no pending self-registration applications awaiting review right now.'
              : `No registrations matching the "${activeTab.toLowerCase()}" criteria were found.`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {registrations.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                {/* Header: Role Badge & Gender */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      item.role === 'STUDENT'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-blue-100 text-blue-900 border border-blue-200'
                    }`}
                  >
                    {item.role === 'STUDENT' ? (
                      <GraduationCap className="w-3.5 h-3.5 text-amber-700" />
                    ) : (
                      <Building className="w-3.5 h-3.5 text-blue-700" />
                    )}
                    <span>{item.role === 'STUDENT' ? 'Student' : 'Faculty'}</span>
                  </span>

                  {item.gender && (
                    <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      {item.gender}
                    </span>
                  )}
                </div>

                {/* Candidate Name */}
                <h3 className="text-base font-black text-slate-900 mb-1 leading-snug">
                  {item.name}
                </h3>

                {/* Roll Number or Program */}
                <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                  {item.rollNumber && (
                    <div className="flex items-center gap-1.5 font-mono font-bold text-slate-800 bg-slate-50 px-2 py-1 rounded-lg border border-slate-100">
                      <span className="text-[10px] text-slate-400 uppercase font-sans">Roll:</span>
                      <span>{item.rollNumber}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-slate-700 font-medium">
                    <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>
                      {item.program || 'Unspecified'}
                      {item.semester ? ` • Sem ${item.semester}` : ''}
                      {item.branch ? ` (${item.branch})` : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-slate-600">
                    <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{item.email}</span>
                  </div>

                  {item.phone && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{item.phone}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Applied: {formatDate(item.createdAt)}</span>
                  </div>
                </div>

                {/* Status Detail for Approved or Rejected */}
                {item.approvalStatus === 'APPROVED' && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-[11px] text-emerald-900 mb-3 space-y-0.5">
                    <div className="font-bold flex items-center gap-1 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Approved on {formatDate(item.approvedAt)}</span>
                    </div>
                    {item.approvedBy && (
                      <div className="text-emerald-800 text-[10px]">
                        By Librarian: {item.approvedBy.name} ({item.approvedBy.email})
                      </div>
                    )}
                  </div>
                )}

                {item.approvalStatus === 'REJECTED' && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-[11px] text-rose-900 mb-3 space-y-0.5">
                    <div className="font-bold flex items-center gap-1 text-rose-700">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Rejected on {formatDate(item.approvedAt)}</span>
                    </div>
                    {item.rejectionReason && (
                      <div className="text-rose-800 italic">
                        Reason: "{item.rejectionReason}"
                      </div>
                    )}
                    {item.approvedBy && (
                      <div className="text-rose-700 text-[10px]">
                        By Librarian: {item.approvedBy.name}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons for Pending items */}
              {activeTab === 'PENDING' && (
                <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(item);
                      setIsApproveModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-xs transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(item);
                      setRejectionReason('');
                      setIsRejectModalOpen(true);
                    }}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Approve Confirmation Modal */}
      <Modal
        isOpen={isApproveModalOpen}
        onClose={() => {
          setIsApproveModalOpen(false);
          setSelectedItem(null);
        }}
        title="Approve Library Membership Registration"
      >
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Approving this application will immediately activate the account and grant the applicant access to library services.
            </span>
          </div>

          {selectedItem && (
            <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Applicant:</span>
                <span className="font-bold text-slate-900">{selectedItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Role:</span>
                <span className="font-bold text-slate-800">{selectedItem.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email:</span>
                <span className="font-bold text-slate-800">{selectedItem.email}</span>
              </div>
              {selectedItem.rollNumber && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Roll Number:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedItem.rollNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Program:</span>
                <span className="font-bold text-slate-800">{selectedItem.program || 'N/A'}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                setIsApproveModalOpen(false);
                setSelectedItem(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleApprove}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isProcessing ? 'Approving...' : 'Confirm & Approve'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Reject Modal */}
      <Modal
        isOpen={isRejectModalOpen}
        onClose={() => {
          setIsRejectModalOpen(false);
          setSelectedItem(null);
        }}
        title="Reject Membership Registration"
      >
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900 flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>
              Rejecting this application will prevent this account from accessing the system. You can provide an optional explanation below.
            </span>
          </div>

          {selectedItem && (
            <div className="text-xs text-slate-700">
              Rejecting registration for <strong className="text-slate-900">{selectedItem.name}</strong> ({selectedItem.email}).
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Rejection Reason (Optional)
            </label>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Roll number not matched in college enrollment records. Please visit the library desk with physical ID."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => {
                setIsRejectModalOpen(false);
                setSelectedItem(null);
              }}
              className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleReject}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              {isProcessing ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default RegistrationRequests;
