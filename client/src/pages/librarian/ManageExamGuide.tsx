import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { ExamPaper, Program } from '../../types';
import Modal from '../../components/common/Modal';
import { Plus, Search, FileText, Download, Trash2, GraduationCap, CheckCircle2, UploadCloud } from 'lucide-react';
import toast from 'react-hot-toast';

export const ManageExamGuide: React.FC = () => {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedSemester, setSelectedSemester] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [search, setSearch] = useState('');

  // Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    subject: '',
    program: 'BCOM' as Program,
    branch: 'General',
    year: 2024,
    semester: 1,
    type: 'PREVIOUS_YEAR',
    description: '',
  });

  const fetchPapers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/exam/papers', {
        params: {
          program: selectedProgram || undefined,
          semester: selectedSemester || undefined,
          type: selectedType || undefined,
          subject: search || undefined,
        },
      });
      setPapers(res.data.papers || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load exam papers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, [selectedProgram, selectedSemester, selectedType]);

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error('Please select a PDF or document file to upload');
      return;
    }

    try {
      const data = new FormData();
      data.append('file', file);
      data.append('title', formData.title);
      data.append('subject', formData.subject);
      data.append('program', formData.program);
      data.append('branch', formData.branch);
      data.append('year', formData.year.toString());
      data.append('semester', formData.semester.toString());
      data.append('type', formData.type);
      data.append('description', formData.description);

      await api.post('/exam/papers', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      toast.success('Exam question paper uploaded successfully!');
      setIsUploadModalOpen(false);
      setFile(null);
      fetchPapers();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to upload paper');
    }
  };

  const handleDeletePaper = async (id: string, title: string) => {
    if (!window.confirm(`Delete question paper "${title}"?`)) return;
    try {
      await api.delete(`/exam/papers/${id}`);
      toast.success('Exam paper deleted');
      fetchPapers();
    } catch (err) {
      toast.error('Failed to delete paper');
    }
  };

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
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload New Question Paper / Bank</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by subject name (e.g. Financial Accounting, Statistics, DBMS)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchPapers()}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
          >
            <option value="">All Programs</option>
            <option value="BCOM">B.Com</option>
            <option value="BBA">BBA</option>
            <option value="BSC">B.Sc</option>
          </select>

          <select
            value={selectedSemester}
            onChange={(e) => setSelectedSemester(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
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
            onChange={(e) => setSelectedType(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
          >
            <option value="">All Paper Types</option>
            <option value="PREVIOUS_YEAR">Previous Year Paper</option>
            <option value="IMPORTANT_QUESTIONS">Important Questions</option>
            <option value="STUDY_GUIDE">Study Guide / Notes</option>
          </select>
        </div>
      </div>

      {/* Papers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            Loading question papers repository...
          </div>
        ) : papers.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
            <GraduationCap className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Question Papers Found</h3>
            <p className="text-xs text-slate-500 mt-1">Upload university papers or important questions above.</p>
          </div>
        ) : (
          papers.map((paper) => (
            <div
              key={paper.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
            >
              <div>
                {/* Badges */}
                <div className="flex items-center justify-between gap-2 mb-2.5">
                  <span
                    className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      paper.type === 'PREVIOUS_YEAR'
                        ? 'bg-amber-100 text-amber-900'
                        : paper.type === 'IMPORTANT_QUESTIONS'
                        ? 'bg-purple-100 text-purple-900'
                        : 'bg-blue-100 text-blue-900'
                    }`}
                  >
                    {paper.type === 'PREVIOUS_YEAR'
                      ? 'Previous Year Exam'
                      : paper.type === 'IMPORTANT_QUESTIONS'
                      ? 'Important Qs Bank'
                      : 'Study Guide'}
                  </span>

                  <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                    {paper.year} • Sem {paper.semester}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug">{paper.title}</h3>
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
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <a
                  href={paper.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-900 hover:text-amber-600 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download File</span>
                </a>

                <button
                  onClick={() => handleDeletePaper(paper.id, paper.title)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Delete paper"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      <Modal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
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
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                    branch: prog === 'BCOM' ? 'General' : prog === 'BBA' ? 'General Business Administration' : 'Computer Science & Data',
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
                min="2018"
                max="2030"
                value={formData.year}
                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Semester *</label>
              <select
                value={formData.semester}
                onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}
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
            <label className="block font-bold text-slate-700 mb-1">Select PDF / Document File *</label>
            <input
              type="file"
              required
              accept=".pdf,.doc,.docx,.jpg,.png"
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsUploadModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition"
            >
              Upload to Student Portal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ManageExamGuide;
