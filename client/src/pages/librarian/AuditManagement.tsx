import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import toast from 'react-hot-toast';
import {
  ClipboardCheck,
  PlusCircle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Calendar,
  Filter,
  ArrowRight,
  ShieldAlert,
  Search,
  BookOpen,
  ChevronRight,
  Lock,
  Layers,
  Sparkles,
  BarChart2,
  Download,
  Printer,
  ScanLine,
  Check,
  X,
  FileSpreadsheet,
  RefreshCw,
} from 'lucide-react';
import Modal from '../../components/common/Modal';

interface AuditItem {
  id: string;
  auditNumber: string;
  type: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL_INVENTORY' | 'ANNUAL';
  title: string;
  periodStart: string;
  periodEnd: string;
  academicYear?: string | null;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'PENDING_RECONCILIATION' | 'COMPLETED' | 'CLOSED';
  leadLibrarian?: { id: string; name: string; email: string };
  discrepancyCount: number;
  observations?: string | null;
  recommendations?: string | null;
  completedAt?: string | null;
  closedAt?: string | null;
  createdAt: string;
}

interface DashboardMetrics {
  totalAudits: number;
  completedAudits: number;
  inProgressAudits: number;
  pendingReconciliationAudits: number;
  openDiscrepancies: number;
  byType: {
    monthly: number;
    quarterly: number;
    semiAnnualInventory: number;
    annual: number;
  };
}

interface DiscrepancyItem {
  id: string;
  auditId: string;
  barcode?: string | null;
  category: string;
  severity: string;
  description: string;
  status: string;
  discoveredDate: string;
  resolutionNotes?: string | null;
  book?: { id: string; title: string; author: string } | null;
  bookCopy?: { id: string; copyNumber: number; status: string; shelfLocation?: string | null } | null;
  correctiveActions?: Array<{
    id: string;
    actionTaken: string;
    actionDate: string;
    resultingStatus?: string | null;
    notes?: string | null;
    performedBy?: { name: string } | null;
  }>;
}

export const AuditManagement: React.FC = () => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [audits, setAudits] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Create Audit Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createType, setCreateType] = useState<'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL_INVENTORY' | 'ANNUAL'>('MONTHLY');
  const [createTitle, setCreateTitle] = useState('');
  const [createPeriodStart, setCreatePeriodStart] = useState('');
  const [createPeriodEnd, setCreatePeriodEnd] = useState('');
  const [createAcademicYear, setCreateAcademicYear] = useState('2026-2027');
  const [createObservations, setCreateObservations] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Detail / Lifecycle Modal State
  const [selectedAudit, setSelectedAudit] = useState<AuditItem | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailObservations, setDetailObservations] = useState('');
  const [detailRecommendations, setDetailRecommendations] = useState('');
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Physical Inventory Scanner Modal State
  const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
  const [scannerAudit, setScannerAudit] = useState<AuditItem | null>(null);
  const [inventorySession, setInventorySession] = useState<any>(null);
  const [scanBarcode, setScanBarcode] = useState('');
  const [scanShelf, setScanShelf] = useState('');
  const [scanNotes, setScanNotes] = useState('');
  const [lastScanResult, setLastScanResult] = useState<any>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isFinalizingSession, setIsFinalizingSession] = useState(false);

  // Discrepancies Workspace State
  const [isDiscrepancyModalOpen, setIsDiscrepancyModalOpen] = useState(false);
  const [discrepancyAudit, setDiscrepancyAudit] = useState<AuditItem | null>(null);
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [discrepancyStatusFilter, setDiscrepancyStatusFilter] = useState('ALL');
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
  const [selectedDiscrepancy, setSelectedDiscrepancy] = useState<DiscrepancyItem | null>(null);
  const [actionTakenText, setActionTakenText] = useState('');
  const [actionResultingStatus, setActionResultingStatus] = useState('UNDER_INVESTIGATION');
  const [actionNotesText, setActionNotesText] = useState('');
  const [isLoggingAction, setIsLoggingAction] = useState(false);

  // Report & Certificate Viewer State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [reportAudit, setReportAudit] = useState<AuditItem | null>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [isCertificateView, setIsCertificateView] = useState(false);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [metricsRes, auditsRes] = await Promise.all([
        api.get('/audits/summary/dashboard'),
        api.get('/audits?limit=50'),
      ]);

      if (metricsRes.data?.success) {
        setMetrics(metricsRes.data.data);
      }
      if (auditsRes.data?.success) {
        setAudits(auditsRes.data.data);
      }
    } catch (err: any) {
      console.error('Error fetching audits:', err);
      toast.error(err.response?.data?.error || 'Failed to load audit dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleCreateAudit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTitle.trim() || !createPeriodStart || !createPeriodEnd) {
      toast.error('Title, Period Start, and Period End are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload = {
        type: createType,
        title: createTitle.trim(),
        periodStart: createPeriodStart,
        periodEnd: createPeriodEnd,
        academicYear: createAcademicYear.trim() || undefined,
        observations: createObservations.trim() || undefined,
      };

      const res = await api.post('/audits', payload);
      if (res.data?.success) {
        toast.success(`Audit ${res.data.data.auditNumber} successfully initiated!`);
        setIsCreateModalOpen(false);
        setCreateTitle('');
        setCreateObservations('');
        fetchDashboardData();
      }
    } catch (err: any) {
      console.error('Error creating audit:', err);
      toast.error(err.response?.data?.error || 'Failed to initiate audit');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDetail = async (auditId: string) => {
    try {
      const res = await api.get(`/audits/${auditId}`);
      if (res.data?.success) {
        setSelectedAudit(res.data.data);
        setDetailObservations(res.data.data.observations || '');
        setDetailRecommendations(res.data.data.recommendations || '');
        setIsDetailModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load audit detail');
    }
  };

  const handleAdvanceStatus = async (nextStatus: 'IN_PROGRESS' | 'PENDING_RECONCILIATION' | 'COMPLETED' | 'CLOSED') => {
    if (!selectedAudit) return;

    if (nextStatus === 'CLOSED') {
      const confirmed = window.confirm(
        'Are you sure you want to CLOSE this audit? Once closed, an audit cannot be reopened, modified, or deleted.'
      );
      if (!confirmed) return;
    }

    try {
      setIsUpdatingStatus(true);
      const res = await api.patch(`/audits/${selectedAudit.id}/status`, {
        status: nextStatus,
        observations: detailObservations,
        recommendations: detailRecommendations,
      });

      if (res.data?.success) {
        toast.success(`Audit status updated to ${nextStatus}`);
        setSelectedAudit(res.data.data);
        fetchDashboardData();
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      toast.error(err.response?.data?.error || 'Failed to transition audit status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selectedAudit) return;
    try {
      setIsUpdatingStatus(true);
      const res = await api.patch(`/audits/${selectedAudit.id}/notes`, {
        observations: detailObservations,
        recommendations: detailRecommendations,
      });
      if (res.data?.success) {
        toast.success('Observations and recommendations saved');
        setSelectedAudit(res.data.data);
        fetchDashboardData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update notes');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // ─── Physical Inventory Barcode Scanner Handler ─────────────────────
  const handleOpenScanner = async (audit: AuditItem) => {
    setScannerAudit(audit);
    setLastScanResult(null);
    setScanBarcode('');
    setScanShelf('');
    try {
      const sessionRes = await api.post(`/audits/${audit.id}/inventory-session`, {});
      if (sessionRes.data?.success) {
        const summaryRes = await api.get(`/audits/${audit.id}/inventory-session`);
        setInventorySession(summaryRes.data?.data || sessionRes.data.data);
        setIsScannerModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load inventory session');
    }
  };

  const handleRecordScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannerAudit || !scanBarcode.trim()) return;

    try {
      setIsScanning(true);
      const res = await api.post(`/audits/${scannerAudit.id}/inventory-session/scan`, {
        barcode: scanBarcode.trim(),
        scannedShelf: scanShelf.trim() || undefined,
        notes: scanNotes.trim() || undefined,
      });

      if (res.data?.success) {
        setLastScanResult({
          success: true,
          matchStatus: res.data.data.matchStatus,
          barcode: scanBarcode.trim(),
          details: res.data.data.copyDetails,
        });
        toast.success(`Scanned: ${scanBarcode.trim()} [${res.data.data.matchStatus}]`);
        setScanBarcode('');
        // Refresh session summary
        const summaryRes = await api.get(`/audits/${scannerAudit.id}/inventory-session`);
        setInventorySession(summaryRes.data?.data);
      }
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Scan failed';
      setLastScanResult({
        success: false,
        barcode: scanBarcode.trim(),
        error: errorMsg,
        isDuplicate: err.response?.status === 409,
      });
      if (err.response?.status === 409) {
        toast.error(`DUPLICATE SCAN: ${scanBarcode.trim()} rejected`);
      } else {
        toast.error(errorMsg);
      }
    } finally {
      setIsScanning(false);
    }
  };

  const handleFinalizeInventorySession = async () => {
    if (!scannerAudit) return;
    const confirmed = window.confirm(
      'Are you sure you want to FINALIZE this physical inventory session? Missing copies and exceptions will be logged as formal audit discrepancies for librarian reconciliation.'
    );
    if (!confirmed) return;

    try {
      setIsFinalizingSession(true);
      const res = await api.post(`/audits/${scannerAudit.id}/inventory-session/finalize`, {});
      if (res.data?.success) {
        toast.success(res.data.message || 'Inventory session finalized!');
        setIsScannerModalOpen(false);
        fetchDashboardData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to finalize session');
    } finally {
      setIsFinalizingSession(false);
    }
  };

  // ─── Discrepancy Management Handlers ───────────────────────────────
  const handleOpenDiscrepancies = async (audit: AuditItem) => {
    setDiscrepancyAudit(audit);
    try {
      const res = await api.get(`/audits/${audit.id}/discrepancies`);
      if (res.data?.success) {
        setDiscrepancies(res.data.data);
        setIsDiscrepancyModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load discrepancies');
    }
  };

  const handleOpenActionModal = (discrepancy: DiscrepancyItem) => {
    setSelectedDiscrepancy(discrepancy);
    setActionTakenText('');
    setActionNotesText('');
    setActionResultingStatus(
      discrepancy.status === 'OPEN'
        ? 'UNDER_INVESTIGATION'
        : discrepancy.status === 'UNDER_INVESTIGATION'
        ? 'RESOLVED'
        : 'CLOSED'
    );
    setIsActionModalOpen(true);
  };

  const handleLogCorrectiveAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDiscrepancy || !actionTakenText.trim()) {
      toast.error('Action taken description is required.');
      return;
    }

    try {
      setIsLoggingAction(true);
      const res = await api.post(`/audits/discrepancies/${selectedDiscrepancy.id}/actions`, {
        actionTaken: actionTakenText.trim(),
        resultingStatus: actionResultingStatus,
        notes: actionNotesText.trim() || undefined,
      });

      if (res.data?.success) {
        toast.success('Corrective action recorded successfully');
        setIsActionModalOpen(false);
        // Refresh discrepancies list
        if (discrepancyAudit) {
          const updatedList = await api.get(`/audits/${discrepancyAudit.id}/discrepancies`);
          setDiscrepancies(updatedList.data.data);
        }
        fetchDashboardData();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record corrective action');
    } finally {
      setIsLoggingAction(false);
    }
  };

  // ─── Report & Certificate Viewer Handlers ──────────────────────────
  const handleOpenReport = async (audit: AuditItem) => {
    setReportAudit(audit);
    setIsCertificateView(false);
    try {
      setIsReportLoading(true);
      const res = await api.get(`/audits/${audit.id}/report`);
      if (res.data?.success) {
        setReportData(res.data.data);
        setIsReportModalOpen(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to compile audit report');
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleDownloadCsv = async (auditId: string, type: 'summary' | 'discrepancies' | 'scans') => {
    try {
      const res = await api.get(`/audits/${auditId}/export?type=${type}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${type}_export_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success(`${type.toUpperCase()} CSV exported`);
    } catch (err) {
      toast.error('Failed to export CSV');
    }
  };

  // Filtered Audits
  const filteredAudits = audits.filter((a) => {
    const matchesType = typeFilter === 'ALL' || a.type === typeFilter;
    const matchesStatus = statusFilter === 'ALL' || a.status === statusFilter;
    const matchesSearch =
      searchTerm === '' ||
      a.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.auditNumber.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesStatus && matchesSearch;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'NOT_STARTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" /> Not Started
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" /> In Progress
          </span>
        );
      case 'PENDING_RECONCILIATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <AlertTriangle className="w-3 h-3 text-indigo-400" /> Pending Recon
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Completed
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-slate-400 border border-slate-800">
            <Lock className="w-3 h-3 text-slate-500" /> Closed
          </span>
        );
      default:
        return <span className="text-xs text-slate-400">{status}</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'MONTHLY':
        return <span className="text-xs font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">MONTHLY</span>;
      case 'QUARTERLY':
        return <span className="text-xs font-bold text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">QUARTERLY</span>;
      case 'SEMI_ANNUAL_INVENTORY':
        return <span className="text-xs font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">INVENTORY</span>;
      case 'ANNUAL':
        return <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">ANNUAL</span>;
      default:
        return <span className="text-xs text-slate-400">{type}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 p-6 rounded-2xl border border-slate-800 backdrop-blur-xl">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">Institutional Audit & Operations</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                R.G. Kedia College of Commerce — Periodic, Physical Inventory & Annual Statutory Audits
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/20 transition"
          >
            <PlusCircle className="w-4 h-4" /> Initiate Audit Engagement
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs font-medium text-slate-400">Total Audits</div>
            <div className="text-2xl font-black text-white mt-1">{metrics.totalAudits}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">All scheduled engagements</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs font-medium text-amber-400">In Progress</div>
            <div className="text-2xl font-black text-amber-400 mt-1">{metrics.inProgressAudits}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Active data verification</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs font-medium text-indigo-400">Pending Recon</div>
            <div className="text-2xl font-black text-indigo-400 mt-1">{metrics.pendingReconciliationAudits}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Physical discrepancy review</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs font-medium text-rose-400">Open Discrepancies</div>
            <div className="text-2xl font-black text-rose-400 mt-1">{metrics.openDiscrepancies}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Awaiting corrective actions</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl">
            <div className="text-xs font-medium text-emerald-400">Completed / Closed</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{metrics.completedAudits}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Immutable frozen snapshots</div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/40 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search audits by title or AUD number..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5" />
            <span>Type:</span>
          </div>
          {['ALL', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL_INVENTORY', 'ANNUAL'].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-2.5 py-1 text-xs rounded-lg font-semibold transition ${
                typeFilter === t
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200'
              }`}
            >
              {t === 'SEMI_ANNUAL_INVENTORY' ? 'INVENTORY' : t}
            </button>
          ))}

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-lg px-2.5 py-1 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NOT_STARTED">Not Started</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="PENDING_RECONCILIATION">Pending Recon</option>
            <option value="COMPLETED">Completed</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>
      </div>

      {/* Audits Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Audit Ref</th>
                <th className="py-3 px-4">Title & Scope</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Coverage Period</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-center">Discrepancies</th>
                <th className="py-3 px-4 text-right">Operational Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
                    Loading institutional audits...
                  </td>
                </tr>
              ) : filteredAudits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <BookOpen className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                    No library audits matching current criteria.
                  </td>
                </tr>
              ) : (
                filteredAudits.map((audit) => (
                  <tr key={audit.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-amber-400">
                      {audit.auditNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-slate-200">{audit.title}</div>
                      <div className="text-[11px] text-slate-500">
                        Lead: {audit.leadLibrarian?.name || 'Institutional Librarian'}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">{getTypeBadge(audit.type)}</td>
                    <td className="py-3.5 px-4 text-slate-300 text-[11px]">
                      {new Date(audit.periodStart).toLocaleDateString()} — {new Date(audit.periodEnd).toLocaleDateString()}
                      {audit.academicYear && (
                        <span className="block text-[10px] text-slate-500">AY: {audit.academicYear}</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4">{getStatusBadge(audit.status)}</td>
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => handleOpenDiscrepancies(audit)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-xs ${
                          audit.discrepancyCount > 0
                            ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30 hover:bg-rose-500/20'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {audit.discrepancyCount}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {/* Barcode Scanner Workspace for inventory audits */}
                        {audit.type === 'SEMI_ANNUAL_INVENTORY' && (
                          <button
                            onClick={() => handleOpenScanner(audit)}
                            title="Open Physical Barcode Scanner Workspace"
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/20 transition"
                          >
                            <ScanLine className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {/* Report & Certificate Viewer */}
                        <button
                          onClick={() => handleOpenReport(audit)}
                          title="View Operational & Statutory Report"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>

                        {/* CSV Export */}
                        <button
                          onClick={() => handleDownloadCsv(audit.id, 'summary')}
                          title="Export RFC 4180 CSV Evidence"
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        {/* Lifecycle Status & Notes */}
                        <button
                          onClick={() => handleOpenDetail(audit.id)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-lg border border-slate-700 transition"
                        >
                          Lifecycle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal 1: Initiate Audit Engagement ─────────────────────── */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Initiate Library Audit Engagement"
      >
        <form onSubmit={handleCreateAudit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Engagement Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { type: 'MONTHLY', label: 'Monthly Operations', desc: 'Circulation & loss tally' },
                { type: 'QUARTERLY', label: 'Quarterly Review', desc: '3-month consolidation' },
                { type: 'SEMI_ANNUAL_INVENTORY', label: 'Stock Inventory', desc: 'Physical shelf barcode audit' },
                { type: 'ANNUAL', label: 'Annual Statutory', desc: 'Osmania University academic year' },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.type}
                  onClick={() => {
                    setCreateType(opt.type as any);
                    if (opt.type === 'MONTHLY') setCreateTitle('Monthly Library Operations Audit');
                    if (opt.type === 'QUARTERLY') setCreateTitle('Quarterly Operational Review');
                    if (opt.type === 'SEMI_ANNUAL_INVENTORY') setCreateTitle('Physical Stock Verification Audit');
                    if (opt.type === 'ANNUAL') setCreateTitle('Annual Institutional Statutory Audit');
                  }}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    createType === opt.type
                      ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-white">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Audit Engagement Title
            </label>
            <input
              type="text"
              required
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              placeholder="e.g. Monthly Library Operations Audit — October 2026"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Coverage Period Start
              </label>
              <input
                type="date"
                required
                value={createPeriodStart}
                onChange={(e) => setCreatePeriodStart(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Coverage Period End
              </label>
              <input
                type="date"
                required
                value={createPeriodEnd}
                onChange={(e) => setCreatePeriodEnd(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Academic Year
            </label>
            <input
              type="text"
              value={createAcademicYear}
              onChange={(e) => setCreateAcademicYear(e.target.value)}
              placeholder="e.g. 2026-2027"
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Scope Observations
            </label>
            <textarea
              rows={2}
              value={createObservations}
              onChange={(e) => setCreateObservations(e.target.value)}
              placeholder="Scope, focus areas, or initial instructions for audit team..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? 'Initiating...' : 'Initiate Audit'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal 2: Audit Detail / Lifecycle Progression ───────────── */}
      {selectedAudit && (
        <Modal
          isOpen={isDetailModalOpen}
          onClose={() => setIsDetailModalOpen(false)}
          title={`Audit Workspace — ${selectedAudit.auditNumber}`}
        >
          <div className="space-y-5">
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white">{selectedAudit.title}</span>
                {getStatusBadge(selectedAudit.status)}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-2 border-t border-slate-900">
                <div>Type: {getTypeBadge(selectedAudit.type)}</div>
                <div>Academic Year: <span className="text-slate-200">{selectedAudit.academicYear || 'N/A'}</span></div>
                <div>Coverage: <span className="text-slate-200">{new Date(selectedAudit.periodStart).toLocaleDateString()} — {new Date(selectedAudit.periodEnd).toLocaleDateString()}</span></div>
                <div>Lead Librarian: <span className="text-slate-200">{selectedAudit.leadLibrarian?.name || 'Authorized Librarian'}</span></div>
              </div>
            </div>

            {/* Lifecycle Progression Actions */}
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Lifecycle Progression Workflow
              </label>

              {selectedAudit.status === 'NOT_STARTED' && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-400">Ready to commence verification?</span>
                  <button
                    onClick={() => handleAdvanceStatus('IN_PROGRESS')}
                    disabled={isUpdatingStatus}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition"
                  >
                    Start Audit Engagement
                  </button>
                </div>
              )}

              {selectedAudit.status === 'IN_PROGRESS' && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl space-y-2">
                  <div className="text-xs text-slate-400">Engagement is currently active. Advance when ready:</div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAdvanceStatus('PENDING_RECONCILIATION')}
                      disabled={isUpdatingStatus}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Mark Pending Reconciliation
                    </button>
                    <button
                      onClick={() => handleAdvanceStatus('COMPLETED')}
                      disabled={isUpdatingStatus}
                      className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                    >
                      Complete & Freeze Snapshot
                    </button>
                  </div>
                </div>
              )}

              {selectedAudit.status === 'PENDING_RECONCILIATION' && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                  <span className="text-xs text-slate-400">Reconcile physical and digital discrepancies before closure.</span>
                  <button
                    onClick={() => handleAdvanceStatus('COMPLETED')}
                    disabled={isUpdatingStatus}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition"
                  >
                    Finalize & Complete
                  </button>
                </div>
              )}

              {selectedAudit.status === 'COMPLETED' && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center justify-between">
                  <div className="text-xs text-slate-300">
                    <span className="text-emerald-400 font-semibold">Audit is Complete.</span> Review findings and formally lock record.
                  </div>
                  <button
                    onClick={() => handleAdvanceStatus('CLOSED')}
                    disabled={isUpdatingStatus}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-rose-900/80 text-rose-300 font-bold text-xs rounded-lg transition border border-rose-800/60"
                  >
                    Lock & Close Permanently
                  </button>
                </div>
              )}

              {selectedAudit.status === 'CLOSED' && (
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl flex items-center gap-2 text-xs text-slate-400">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span>This audit is permanently CLOSED. Snapshot and findings are frozen for institutional governance.</span>
                </div>
              )}
            </div>

            {/* Observations & Recommendations */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Librarian Observations
                </label>
                <textarea
                  rows={2}
                  disabled={selectedAudit.status === 'CLOSED'}
                  value={detailObservations}
                  onChange={(e) => setDetailObservations(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Corrective Recommendations
                </label>
                <textarea
                  rows={2}
                  disabled={selectedAudit.status === 'CLOSED'}
                  value={detailRecommendations}
                  onChange={(e) => setDetailRecommendations(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50 resize-none"
                />
              </div>

              {selectedAudit.status !== 'CLOSED' && (
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNotes}
                    disabled={isUpdatingStatus}
                    className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700"
                  >
                    Save Notes
                  </button>
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal 3: Physical Barcode Scanner Workspace (Sub-Phase 11C) ── */}
      {scannerAudit && (
        <Modal
          isOpen={isScannerModalOpen}
          onClose={() => setIsScannerModalOpen(false)}
          title={`Physical Inventory Scanner — ${scannerAudit.auditNumber}`}
        >
          <div className="space-y-5">
            {/* Progress Metrics Bar */}
            {inventorySession && (
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-white">Shelf Audit Progress</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {inventorySession.session?.progressPercentage || 0}% Complete
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-amber-500 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${inventorySession.session?.progressPercentage || 0}%` }}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center pt-2 border-t border-slate-900 text-[11px]">
                  <div>
                    <span className="text-slate-500 block">Expected</span>
                    <span className="font-bold text-white">{inventorySession.session?.totalExpected}</span>
                  </div>
                  <div>
                    <span className="text-emerald-500 block">Matched</span>
                    <span className="font-bold text-emerald-400">{inventorySession.session?.totalMatched}</span>
                  </div>
                  <div>
                    <span className="text-indigo-400 block">Issued (Safe)</span>
                    <span className="font-bold text-indigo-300">{inventorySession.session?.totalIssued}</span>
                  </div>
                  <div>
                    <span className="text-rose-400 block">Missing</span>
                    <span className="font-bold text-rose-400">{inventorySession.session?.totalMissing}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Barcode Input Form */}
            <form onSubmit={handleRecordScan} className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Scan / Enter Copy Barcode
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    autoFocus
                    value={scanBarcode}
                    onChange={(e) => setScanBarcode(e.target.value)}
                    placeholder="Scan or type barcode (e.g. BC-10042) and hit Enter..."
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs font-mono text-amber-300 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    value={scanShelf}
                    onChange={(e) => setScanShelf(e.target.value)}
                    placeholder="Shelf (e.g. A-1)"
                    className="w-28 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500"
                  />
                  <button
                    type="submit"
                    disabled={isScanning}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition disabled:opacity-50"
                  >
                    {isScanning ? 'Verifying...' : 'Record'}
                  </button>
                </div>
              </div>

              {/* Last Scan Feedback Toast inside modal */}
              {lastScanResult && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    lastScanResult.success
                      ? lastScanResult.matchStatus === 'MATCHED'
                        ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                        : lastScanResult.matchStatus === 'SHELF_MISMATCH'
                        ? 'bg-amber-950/40 border-amber-800/60 text-amber-300'
                        : 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300'
                      : 'bg-rose-950/40 border-rose-800/60 text-rose-300'
                  }`}
                >
                  {lastScanResult.success ? (
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <div className="font-bold">
                      {lastScanResult.success
                        ? `Scan Accepted: ${lastScanResult.barcode} [${lastScanResult.matchStatus}]`
                        : `Scan Rejected: ${lastScanResult.error}`}
                    </div>
                    {lastScanResult.details && (
                      <div className="text-[11px] opacity-80 mt-0.5">
                        Title: {lastScanResult.details.title} | Copy #{lastScanResult.details.copyNumber} | Status: {lastScanResult.details.status}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </form>

            {/* Exceptions & Recent Scans */}
            {inventorySession && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-400 font-bold uppercase tracking-wider">
                  <span>Detected Exceptions ({inventorySession.exceptions?.length || 0})</span>
                  <span>Recent Scans ({inventorySession.recentScans?.length || 0})</span>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-800/80 p-2 rounded-xl bg-slate-950/40">
                  {inventorySession.exceptions?.map((exc: any) => (
                    <div key={exc.id} className="text-xs p-2 bg-slate-900 border border-slate-800 rounded-lg flex justify-between items-center">
                      <div>
                        <span className="font-mono text-amber-400">{exc.barcode}</span>
                        <span className="text-slate-400 ml-2">Shelf: {exc.scannedShelf || 'N/A'}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        {exc.matchStatus}
                      </span>
                    </div>
                  ))}
                  {(!inventorySession.exceptions || inventorySession.exceptions.length === 0) && (
                    <div className="text-center py-4 text-xs text-slate-500">No scan exceptions recorded yet.</div>
                  )}
                </div>
              </div>
            )}

            {/* Finalize Session Action */}
            <div className="pt-2 flex justify-between items-center border-t border-slate-800">
              <span className="text-[11px] text-slate-500">
                Finalizing will compile discrepancies and advance audit to Pending Reconciliation.
              </span>
              <button
                type="button"
                onClick={handleFinalizeInventorySession}
                disabled={isFinalizingSession}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition disabled:opacity-50"
              >
                {isFinalizingSession ? 'Finalizing...' : 'Finalize Physical Session'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal 4: Discrepancy & Corrective Action Workspace (Sub-Phase 11D) ── */}
      {discrepancyAudit && (
        <Modal
          isOpen={isDiscrepancyModalOpen}
          onClose={() => setIsDiscrepancyModalOpen(false)}
          title={`Discrepancies & Corrective Actions — ${discrepancyAudit.auditNumber}`}
        >
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex gap-1.5">
                {['ALL', 'OPEN', 'UNDER_INVESTIGATION', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setDiscrepancyStatusFilter(st)}
                    className={`px-2 py-1 text-[11px] font-bold rounded-lg ${
                      discrepancyStatusFilter === st
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleDownloadCsv(discrepancyAudit.id, 'discrepancies')}
                className="flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
              >
                <Download className="w-3 h-3" /> Export CSV
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2">
              {discrepancies
                .filter((d) => discrepancyStatusFilter === 'ALL' || d.status === discrepancyStatusFilter)
                .map((disc) => (
                  <div key={disc.id} className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-white text-xs">
                          {disc.book?.title || 'Unregistered / Physical Item'}
                        </div>
                        <div className="text-[11px] font-mono text-amber-400">Barcode: {disc.barcode || 'N/A'}</div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                          disc.severity === 'HIGH' || disc.severity === 'CRITICAL'
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        }`}>
                          {disc.severity}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {disc.status}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-300">{disc.description}</p>
                    {disc.resolutionNotes && (
                      <div className="text-[11px] text-emerald-400 bg-emerald-950/30 p-2 rounded border border-emerald-900/40">
                        Resolution: {disc.resolutionNotes}
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-2 border-t border-slate-900 text-[10px] text-slate-500">
                      <span>Category: {disc.category}</span>
                      {disc.status !== 'CLOSED' && (
                        <button
                          onClick={() => handleOpenActionModal(disc)}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold rounded-lg border border-amber-500/20"
                        >
                          Record Action
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {discrepancies.length === 0 && (
                <div className="text-center py-8 text-xs text-slate-500">No discrepancies documented for this engagement.</div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ─── Modal 5: Record Corrective Action Form ───────────────────── */}
      {selectedDiscrepancy && (
        <Modal
          isOpen={isActionModalOpen}
          onClose={() => setIsActionModalOpen(false)}
          title="Record Corrective Action"
        >
          <form onSubmit={handleLogCorrectiveAction} className="space-y-4">
            <div className="text-xs text-slate-400 bg-slate-950 p-3 rounded-xl border border-slate-800">
              <span className="font-bold text-white block">Item: {selectedDiscrepancy.book?.title || selectedDiscrepancy.barcode}</span>
              <span>Current Status: <span className="text-amber-400 font-bold">{selectedDiscrepancy.status}</span></span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Action Taken Description
              </label>
              <textarea
                required
                rows={2}
                value={actionTakenText}
                onChange={(e) => setActionTakenText(e.target.value)}
                placeholder="Detail corrective step (e.g. rebound at bindery, relabeled barcode, shelf relocated)..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Resulting Status Transition
              </label>
              <select
                value={actionResultingStatus}
                onChange={(e) => setActionResultingStatus(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="UNDER_INVESTIGATION">Under Investigation</option>
                <option value="ACTION_REQUIRED">Action Required</option>
                <option value="RESOLVED">Resolved</option>
                <option value="CLOSED">Closed (Terminal)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                Resolution / Audit Notes
              </label>
              <textarea
                rows={2}
                value={actionNotesText}
                onChange={(e) => setActionNotesText(e.target.value)}
                placeholder="Optional administrative or compliance sign-off notes..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsActionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoggingAction}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition disabled:opacity-50"
              >
                {isLoggingAction ? 'Recording...' : 'Record Action'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ─── Modal 6: Operational & Annual Report Viewer / Official Certificate (Sub-Phases 11B, 11E, 11F) ── */}
      {reportAudit && (
        <Modal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          title={isCertificateView ? 'Official Institutional Audit Certificate' : `Operational Audit Report — ${reportAudit.auditNumber}`}
        >
          {isReportLoading ? (
            <div className="py-12 text-center text-slate-500">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-amber-500 mb-2" />
              Compiling operational metrics...
            </div>
          ) : isCertificateView ? (
            /* Printable Institutional Certificate Layout */
            <div className="space-y-6 p-6 bg-white text-slate-900 rounded-2xl border-4 border-amber-900/30 print:p-0 print:border-none">
              <div className="text-center border-b-2 border-slate-900 pb-4">
                <h2 className="text-xl font-black uppercase tracking-wider text-slate-950">
                  R.G. Kedia College of Commerce
                </h2>
                <p className="text-xs font-semibold text-slate-600">Affiliated to Osmania University, Hyderabad</p>
                <h3 className="text-sm font-bold uppercase tracking-widest text-amber-900 mt-2">
                  Library Operations & Statutory Audit Certificate
                </h3>
                <p className="text-[11px] font-mono text-slate-500">Ref No: {reportAudit.auditNumber}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-bold text-slate-700">Engagement Title:</span> {reportAudit.title}
                </div>
                <div>
                  <span className="font-bold text-slate-700">Academic Year:</span> {reportAudit.academicYear || '2025-2026'}
                </div>
                <div>
                  <span className="font-bold text-slate-700">Audit Scope:</span> {reportAudit.type}
                </div>
                <div>
                  <span className="font-bold text-slate-700">Coverage Period:</span> {new Date(reportAudit.periodStart).toLocaleDateString()} — {new Date(reportAudit.periodEnd).toLocaleDateString()}
                </div>
              </div>

              {/* Certified Metrics Table */}
              {reportData && (
                <div className="border border-slate-300 rounded-lg overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-slate-100 text-slate-800 font-bold border-b border-slate-300">
                      <tr>
                        <th className="py-2 px-3">Audit Metric</th>
                        <th className="py-2 px-3 text-right">Certified Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      <tr>
                        <td className="py-1.5 px-3">Total Catalog Titles</td>
                        <td className="py-1.5 px-3 text-right font-bold">{reportData.collection?.totalTitles}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3">Total Physical Copies in Stock</td>
                        <td className="py-1.5 px-3 text-right font-bold">{reportData.collection?.totalCopies}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3">Active Eligible Copies</td>
                        <td className="py-1.5 px-3 text-right">{reportData.collection?.activeCopies}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3">Total Circulation Issues in Period</td>
                        <td className="py-1.5 px-3 text-right font-bold">{reportData.circulation?.totalIssued}</td>
                      </tr>
                      <tr>
                        <td className="py-1.5 px-3">Overdue Delinquency Rate</td>
                        <td className="py-1.5 px-3 text-right">{reportData.overdueAging?.totalOverdueLoans} Loans</td>
                      </tr>
                      {reportData.annualInstitutional && (
                        <>
                          <tr>
                            <td className="py-1.5 px-3 font-semibold">Circulation - B.Com Program</td>
                            <td className="py-1.5 px-3 text-right">{reportData.annualInstitutional.programCirculation?.bcom}</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-semibold">Circulation - BBA Program</td>
                            <td className="py-1.5 px-3 text-right">{reportData.annualInstitutional.programCirculation?.bba}</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-semibold">Circulation - B.Sc Program</td>
                            <td className="py-1.5 px-3 text-right">{reportData.annualInstitutional.programCirculation?.bsc}</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-semibold">Discrepancy Reconciliation Rate</td>
                            <td className="py-1.5 px-3 text-right font-bold text-emerald-700">
                              {reportData.annualInstitutional.regulatoryCompliance?.reconciliationRatePercentage}%
                            </td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              <p className="text-[11px] text-slate-600 leading-relaxed italic text-center">
                This document certifies that the library holdings, circulation registers, and physical inventory condition have been formally inspected and verified under Osmania University statutory library regulations.
              </p>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-300 text-center text-xs">
                <div>
                  <div className="h-10 border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1" />
                  <span className="font-bold text-slate-800">Lead Librarian Sign-off</span>
                  <span className="block text-[10px] text-slate-500">R.G. Kedia College Library</span>
                </div>
                <div>
                  <div className="h-10 border-b border-dashed border-slate-400 w-3/4 mx-auto mb-1" />
                  <span className="font-bold text-slate-800">Principal / Director</span>
                  <span className="block text-[10px] text-slate-500">R.G. Kedia College of Commerce</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-4 print:hidden">
                <button
                  onClick={() => setIsCertificateView(false)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-semibold"
                >
                  Back to Report
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold"
                >
                  <Printer className="w-4 h-4" /> Print Certificate
                </button>
              </div>
            </div>
          ) : (
            /* Digital Operational Report View */
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                <div>
                  <span className="font-bold text-white block">{reportAudit.title}</span>
                  <span className="text-slate-400 text-[11px]">Academic Year: {reportAudit.academicYear || '2025-2026'}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleDownloadCsv(reportAudit.id, 'summary')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-lg border border-slate-700"
                  >
                    <Download className="w-3.5 h-3.5" /> Summary CSV
                  </button>
                  <button
                    onClick={() => setIsCertificateView(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg"
                  >
                    <Printer className="w-3.5 h-3.5" /> Printable Certificate
                  </button>
                </div>
              </div>

              {reportData && (
                <div className="space-y-3 text-xs max-h-96 overflow-y-auto">
                  {/* Collection Section */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-amber-400 text-xs uppercase tracking-wider block">Collection & Stock Analytics</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-slate-300">
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Total Titles</span>
                        <span className="font-bold text-white text-base">{reportData.collection?.totalTitles}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Total Copies</span>
                        <span className="font-bold text-white text-base">{reportData.collection?.totalCopies}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Location Coverage</span>
                        <span className="font-bold text-emerald-400 text-base">{reportData.collection?.shelfLocationCoveragePercentage}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Circulation Section */}
                  <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                    <span className="font-bold text-indigo-400 text-xs uppercase tracking-wider block">Circulation Activity</span>
                    <div className="grid grid-cols-3 gap-2 text-center text-slate-300">
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Total Issues</span>
                        <span className="font-bold text-white text-base">{reportData.circulation?.totalIssued}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Total Returns</span>
                        <span className="font-bold text-white text-base">{reportData.circulation?.totalReturned}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-lg">
                        <span className="text-slate-500 block text-[10px]">Renewals</span>
                        <span className="font-bold text-white text-base">{reportData.circulation?.totalRenewals}</span>
                      </div>
                    </div>
                  </div>

                  {/* Annual Institutional Breakdown */}
                  {reportData.annualInstitutional && (
                    <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 space-y-2">
                      <span className="font-bold text-emerald-400 text-xs uppercase tracking-wider block">
                        Annual Program Circulation (Osmania University)
                      </span>
                      <div className="grid grid-cols-4 gap-2 text-center text-slate-300">
                        <div className="bg-slate-900/60 p-2 rounded-lg">
                          <span className="text-slate-500 block text-[10px]">B.Com</span>
                          <span className="font-bold text-white">{reportData.annualInstitutional.programCirculation?.bcom}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2 rounded-lg">
                          <span className="text-slate-500 block text-[10px]">BBA</span>
                          <span className="font-bold text-white">{reportData.annualInstitutional.programCirculation?.bba}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2 rounded-lg">
                          <span className="text-slate-500 block text-[10px]">B.Sc</span>
                          <span className="font-bold text-white">{reportData.annualInstitutional.programCirculation?.bsc}</span>
                        </div>
                        <div className="bg-slate-900/60 p-2 rounded-lg">
                          <span className="text-slate-500 block text-[10px]">Faculty</span>
                          <span className="font-bold text-white">{reportData.annualInstitutional.programCirculation?.faculty}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 pt-1">
                        Comparative Disclosure: {reportData.annualInstitutional.priorYearComparison?.disclosure}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

export default AuditManagement;
