import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { ExamPaper, Program } from '../../types';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  UploadCloud,
  Search,
  Download,
  Trash2,
  GraduationCap,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
  FileText,
  AlertCircle,
  X,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
} from 'lucide-react';
import { downloadExamPaper } from '../../lib/downloadExamPaper';
import toast from 'react-hot-toast';

export const ManageExamGuide: React.FC = () => {
  const { user } = useAuth();
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Server-side Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(9);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    program: 'BCOM' as Program,
    branch: 'General',
    year: 2024,
    semester: 1,
    type: 'PREVIOUS_YEAR' as 'PREVIOUS_YEAR' | 'IMPORTANT_QUESTIONS' | 'STUDY_GUIDE',
    description: '',
  });

  // Delete Confirmation Modal State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [paperToDelete, setPaperToDelete] = useState<{ id: string; title: string; subject: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchPapers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/exam/papers', {
        params: {
          page,
          limit,
          program: selectedProgram || undefined,
          semester: selectedSemester || undefined,
          type: selectedType || undefined,
          status: selectedStatus === 'ALL' ? undefined : (selectedStatus === 'PUBLISHED' ? 'published' : 'pending'),
          search: search || undefined,
        },
      });

      setPapers(res.data.papers || []);
      if (res.data.pagination) {
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages || 1);
      } else {
        setTotal(res.data.papers?.length || 0);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error('Failed to load exam papers:', err);
      const msg = err.response?.data?.error || 'Failed to load exam papers repository.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, limit, selectedProgram, selectedSemester, selectedType, selectedStatus, search]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  // Search submission
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const handleClearFilters = () => {
    setSelectedProgram('');
    setSelectedSemester('');
    setSelectedType('');
    setSelectedStatus('ALL');
    setSearch('');
    setSearchInput('');
    setPage(1);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a PDF or document file to upload');
      return;
    }

    try {
      setIsSubmitting(true);
      const data = new FormData();
      data.append('file', file);
      data.append('title', formData.title.trim());
      data.append('subject', formData.subject.trim());
      data.append('program', formData.program);
      data.append('branch', formData.branch.trim());
      data.append('year', formData.year.toString());
      data.append('semester', formData.semester.toString());
      data.append('type', formData.type);
      if (formData.description.trim()) {
        data.append('description', formData.description.trim());
      }

      await api.post('/exam/papers', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Exam question paper uploaded successfully!');
      setIsUploadModalOpen(false);
      setFile(null);
      setFormData({
        title: '',
        subject: '',
        program: 'BCOM',
        branch: 'General',
        year: 2024,
        semester: 1,
        type: 'PREVIOUS_YEAR',
        description: '',
      });
      setPage(1);
      fetchPapers();
    } catch (err: any) {
      console.error('Upload failed:', err);
      toast.error(err.response?.data?.error || 'Failed to upload question paper');
    } finally {
      setIsSubmitting(false);
    }
  };


  const handleTogglePublish = async (paper: ExamPaper) => {
    try {
      setActionLoadingId(paper.id);
      if (paper.publishedAt) {
        await api.put(`/exam/papers/${paper.id}/unpublish`);
        toast.success(`Exam paper "${paper.title}" unpublished.`);
      } else {
        await api.put(`/exam/papers/${paper.id}/publish`);
        toast.success(`Exam paper "${paper.title}" published! Visible to students.`);
      }
      fetchPapers();
    } catch (err: any) {
      console.error('Publication toggle error:', err);
      toast.error(err.response?.data?.error || 'Failed to update publication status.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenDeleteModal = (paper: ExamPaper) => {
    setPaperToDelete({ id: paper.id, title: paper.title, subject: paper.subject });
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!paperToDelete) return;

    try {
      setIsDeleting(true);
      await api.delete(`/exam/papers/${paperToDelete.id}`);
      toast.success(`Exam paper "${paperToDelete.title}" deleted.`);
      setDeleteModalOpen(false);
      setPaperToDelete(null);

      // If last item on page, go to previous page
      if (papers.length === 1 && page > 1) {
        setPage((p) => p - 1);
      } else {
        fetchPapers();
      }
    } catch (err: any) {
      console.error('Delete failed:', err);
      toast.error(err.response?.data?.error || 'Failed to delete question paper');
    } finally {
      setIsDeleting(false);
    }
  };

  const hasActiveFilters = Boolean(selectedProgram || selectedSemester || selectedType || selectedStatus !== 'ALL' || search);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Exam Guide & Question Paper Repository</h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain past Osmania University question papers, model question banks, and faculty study materials
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              title: '',
              subject: '',
              program: 'BCOM',
              branch: 'General',
              year: 2024,
              semester: 1,
              type: 'PREVIOUS_YEAR',
              description: '',
            });
            setIsUploadModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition"
          aria-label="Upload New Question Paper or Bank"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload New Question Paper / Bank</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search by title, subject, or description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 font-medium"
                aria-label="Search question papers"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition shadow-2xs"
            >
              Search
            </button>
          </form>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
              aria-label="Filter by Program"
            >
              <option value="">All Programs</option>
              <option value="BCOM">B.Com</option>
              <option value="BBA">BBA</option>
              <option value="BSC">B.Sc</option>
            </select>

            <select
              value={selectedSemester}
              onChange={(e) => {
                setSelectedSemester(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
              aria-label="Filter by Semester"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6].map((s) => (
                <option key={s} value={s}>
                  Semester {s}
                </option>
              ))}
            </select>

            <select
              value={selectedType}
              onChange={(e) => {
                setSelectedType(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
              aria-label="Filter by Paper Type"
            >
              <option value="">All Types</option>
              <option value="PREVIOUS_YEAR">Previous Year Paper</option>
              <option value="IMPORTANT_QUESTIONS">Important Questions</option>
              <option value="STUDY_GUIDE">Study Guide / Notes</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
              aria-label="Filter by Publication Status"
            >
              <option value="ALL">All Statuses</option>
              <option value="PUBLISHED">Published</option>
              <option value="PENDING">Pending Review</option>
            </select>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
              aria-label="Select Items Per Page"
            >
              <option value={6}>6 per page</option>
              <option value={9}>9 per page</option>
              <option value={12}>12 per page</option>
              <option value={24}>24 per page</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
                aria-label="Clear active filters"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Summary */}
        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-900">{total}</strong> total resource{total === 1 ? '' : 's'}
            {search && (
              <> matching &ldquo;<span className="text-amber-600 font-semibold">{search}</span>&rdquo;</>
            )}
          </span>
          {totalPages > 1 && (
            <span>
              Page <strong className="text-slate-900">{page}</strong> of <strong className="text-slate-900">{totalPages}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Error Feedback Banner */}
      {error && !loading && (
        <div className="p-4 bg-red-50 rounded-2xl border border-red-200 flex items-center justify-between gap-3 text-xs text-red-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchPapers}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-900 font-bold rounded-lg transition"
            aria-label="Retry loading exam papers"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Papers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          // Loading Skeletons
          Array.from({ length: limit }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs animate-pulse flex flex-col justify-between h-56"
            >
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="h-4 bg-slate-200 rounded-full w-24"></div>
                  <div className="h-4 bg-slate-200 rounded-md w-16"></div>
                </div>
                <div className="h-5 bg-slate-200 rounded-md w-3/4"></div>
                <div className="h-3 bg-slate-200 rounded-md w-1/2"></div>
                <div className="h-3 bg-slate-200 rounded-md w-1/3"></div>
                <div className="h-8 bg-slate-100 rounded-xl w-full"></div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                <div className="h-4 bg-slate-200 rounded w-20"></div>
                <div className="h-6 bg-slate-200 rounded w-6"></div>
              </div>
            </div>
          ))
        ) : papers.length === 0 ? (
          // Empty State
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
            <GraduationCap className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-800">No Question Papers Found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {hasActiveFilters
                ? 'No resources matched your selected filters or search terms. Try loosening your criteria or resetting filters.'
                : 'No university exam question papers or study guides have been uploaded yet.'}
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
              >
                Clear All Filters
              </button>
            )}
          </div>
        ) : (
          papers.map((paper) => (
            <div
              key={paper.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                {/* Badges */}
                <div className="flex items-center justify-between gap-2 mb-2.5 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        paper.type === 'PREVIOUS_YEAR'
                          ? 'bg-amber-100 text-amber-900 border border-amber-200'
                          : paper.type === 'IMPORTANT_QUESTIONS'
                          ? 'bg-purple-100 text-purple-900 border border-purple-200'
                          : 'bg-blue-100 text-blue-900 border border-blue-200'
                      }`}
                    >
                      {paper.type === 'PREVIOUS_YEAR'
                        ? 'Previous Year Exam'
                        : paper.type === 'IMPORTANT_QUESTIONS'
                        ? 'Important Qs Bank'
                        : 'Study Guide'}
                    </span>

                    {paper.publishedAt ? (
                      <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Published
                      </span>
                    ) : (
                      <span className="text-[10px] font-extrabold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-amber-600" />
                        Pending Review
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {paper.year} • Sem {paper.semester}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug line-clamp-2">{paper.title}</h3>
                <p className="text-xs font-semibold text-amber-600 mt-1">{paper.subject}</p>

                <div className="mt-2 text-[11px] text-slate-500 font-medium">
                  {paper.program} — {paper.branch}
                </div>

                {paper.description && (
                  <p className="text-[11px] text-slate-600 mt-2 line-clamp-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                    {paper.description}
                  </p>
                )}

                <div className="mt-3 text-[10px] text-slate-400">
                  Uploaded by: <span className="font-semibold text-slate-600">{paper.uploadedBy?.name || 'Faculty'}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => downloadExamPaper(paper)}
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-900 hover:text-amber-600 transition cursor-pointer"
                  aria-label={`Download ${paper.title} file`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </button>

                <div className="flex items-center gap-2">
                  {user?.role === 'LIBRARIAN' && (
                    <button
                      type="button"
                      disabled={actionLoadingId === paper.id}
                      onClick={() => handleTogglePublish(paper)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
                        paper.publishedAt
                          ? 'text-slate-600 hover:text-amber-700 bg-slate-100 hover:bg-amber-100'
                          : 'text-emerald-800 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200'
                      }`}
                      title={paper.publishedAt ? 'Unpublish (hide from students)' : 'Publish (make visible to students)'}
                    >
                      {paper.publishedAt ? (
                        <>
                          <EyeOff className="w-3 h-3" />
                          <span>Unpublish</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3 h-3" />
                          <span>Publish</span>
                        </>
                      )}
                    </button>
                  )}

                  {(user?.role === 'LIBRARIAN' || paper.uploadedById === user?.id) && (
                    <button
                      type="button"
                      onClick={() => handleOpenDeleteModal(paper)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                      title="Delete paper"
                      aria-label={`Delete ${paper.title} paper`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
            <strong className="text-slate-900">{totalPages}</strong> ({total} total resources)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition shadow-2xs"
              aria-label="Previous Page"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600" />
            </button>
            <span className="font-bold text-slate-700 px-2">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition shadow-2xs"
              aria-label="Next Page"
            >
              <ChevronRight className="w-4 h-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => {
          if (!isSubmitting) {
            setIsUploadModalOpen(false);
          }
        }}
        title="Upload Question Paper or Important Questions Bank"
        maxWidth="xl"
      >
        <form onSubmit={handleUploadSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Document Title *</label>
            <input
              type="text"
              required
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="e.g. Financial Accounting - II Nov 2023 OU Paper"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Subject Name *</label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="e.g. Corporate Accounting"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Resource Category *</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as any })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
              >
                <option value="PREVIOUS_YEAR">Previous Year Question Paper (OU Exam)</option>
                <option value="IMPORTANT_QUESTIONS">Curated Important Questions Bank</option>
                <option value="STUDY_GUIDE">Faculty Study Notes / Formula Guide</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Program *</label>
              <select
                value={formData.program}
                onChange={(e) => {
                  const prog = e.target.value as Program;
                  setFormData({
                    ...formData,
                    program: prog,
                    branch:
                      prog === 'BCOM'
                        ? 'General'
                        : prog === 'BBA'
                        ? 'General Business Administration'
                        : 'Computer Science & Data',
                  });
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
              >
                <option value="BCOM">Bachelor of Commerce (B.Com)</option>
                <option value="BBA">Bachelor of Business Admin (BBA)</option>
                <option value="BSC">Bachelor of Science (B.Sc)</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Branch *</label>
              {formData.program === 'BCOM' && (
                <select
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="General">B.Com General</option>
                  <option value="Computer Applications">B.Com Computer Applications</option>
                  <option value="Business Analytics">B.Com Business Analytics</option>
                  <option value="Honors">B.Com Honors</option>
                </select>
              )}
              {formData.program === 'BBA' && (
                <select
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="General Business Administration">General Business Administration</option>
                </select>
              )}
              {formData.program === 'BSC' && (
                <select
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Mathematics">B.Sc Mathematics</option>
                  <option value="Statistics">B.Sc Statistics</option>
                  <option value="Computer Science & Data">B.Sc Computer Science & Data</option>
                </select>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Exam Year *</label>
              <input
                type="number"
                required
                min="2000"
                max={new Date().getFullYear() + 2}
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) || 2024 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Semester *</label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
              >
                {[1, 2, 3, 4, 5, 6].map((s) => (
                  <option key={s} value={s}>
                    Semester {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Select PDF / Document File * (Max 10MB)</label>
            <input
              type="file"
              required
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => setFile(e.target.files ? e.target.files[0] : null)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-slate-900 file:text-white hover:file:bg-amber-500 hover:file:text-slate-950"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Summary / Key Question Topics</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g. Unit 1: Journal Entries, Unit 2: Depreciation methods, Unit 3: Final Accounts..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsUploadModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {isSubmitting ? 'Uploading...' : 'Upload to Repository'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteModalOpen(false);
            setPaperToDelete(null);
          }
        }}
        title="Confirm Deletion of Exam Paper"
        maxWidth="md"
      >
        {paperToDelete && (
          <div className="space-y-4 text-xs">
            <div className="p-4 bg-red-50 rounded-2xl border border-red-200 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-red-900 text-sm">Delete Question Paper</h4>
                <p className="text-red-700 mt-1">
                  Are you sure you want to permanently delete:
                </p>
                <p className="font-bold text-slate-900 mt-1 text-sm">
                  &ldquo;{paperToDelete.title}&rdquo; ({paperToDelete.subject})
                </p>
                <p className="text-slate-500 text-[11px] mt-2">
                  This will remove the file from storage and remove it from student view. This action will be recorded in the administrative audit trail.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => {
                  setDeleteModalOpen(false);
                  setPaperToDelete(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ManageExamGuide;
