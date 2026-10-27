import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { ExamPaper, Program } from '../../types';
import { downloadExamPaper } from '../../lib/downloadExamPaper';
import {
  GraduationCap,
  FileText,
  Download,
  Search,
  Filter,
  Layers,
  Sparkles,
  BookOpen,
  Calendar,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ExamGuide: React.FC = () => {
  const { user } = useAuth();
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [selectedProgram, setSelectedProgram] = useState<string>(user?.program || 'BCOM');
  const [selectedBranch, setSelectedBranch] = useState<string>(user?.branch || '');
  const [selectedSemester, setSelectedSemester] = useState<string>(
    user?.semester ? user.semester.toString() : '1'
  );
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchPapers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/exam/papers', {
        params: {
          program: selectedProgram || undefined,
          branch: selectedBranch || undefined,
          semester: selectedSemester || undefined,
          type: selectedType === 'ALL' ? undefined : selectedType,
          subject: search || undefined,
        },
      });
      setPapers(res.data.papers || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load exam guide resources');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPapers();
  }, [selectedProgram, selectedBranch, selectedSemester, selectedType]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchPapers();
  };

  const prevYearPapers = papers.filter((p) => p.type === 'PREVIOUS_YEAR');
  const importantQuestions = papers.filter((p) => p.type === 'IMPORTANT_QUESTIONS');
  const studyGuides = papers.filter((p) => p.type === 'STUDY_GUIDE');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-amber-600 via-amber-700 to-slate-950 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest bg-white/20 px-2.5 py-0.5 rounded-full">
              Osmania University Degree Pattern
            </span>
            <span className="text-xs text-amber-200">B.Com • BBA • B.Sc</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black mt-2">
            Degree Exam Guide & Question Bank
          </h1>
          <p className="text-amber-100 text-xs sm:text-sm mt-1 max-w-2xl">
            Curated repository of previous year university question papers, chapter-wise high-weightage questions, and faculty study formula guides.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-white/10 backdrop-blur-md p-3 rounded-2xl border border-white/20 text-center">
            <span className="text-2xl font-black block">{papers.length}</span>
            <span className="text-[10px] text-amber-200 uppercase font-bold">Resources Found</span>
          </div>
        </div>
      </div>

      {/* Program, Branch & Semester Navigation Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        
        {/* Top Filter Buttons for Programs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              onClick={() => {
                setSelectedProgram('BCOM');
                setSelectedBranch('');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                selectedProgram === 'BCOM'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              B.Com (Commerce)
            </button>
            <button
              onClick={() => {
                setSelectedProgram('BBA');
                setSelectedBranch('General Business Administration');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                selectedProgram === 'BBA'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              BBA (Management)
            </button>
            <button
              onClick={() => {
                setSelectedProgram('BSC');
                setSelectedBranch('');
              }}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition ${
                selectedProgram === 'BSC'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              B.Sc (Sciences & Data)
            </button>
          </div>

          {/* Semester Selector */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1">
            <span className="text-[10px] font-extrabold uppercase text-slate-400 mr-1">Semester:</span>
            {[1, 2, 3, 4, 5, 6].map((sem) => (
              <button
                key={sem}
                onClick={() => setSelectedSemester(sem.toString())}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition flex items-center justify-center shrink-0 ${
                  selectedSemester === sem.toString()
                    ? 'bg-amber-500 text-slate-950 font-black shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {sem}
              </button>
            ))}
          </div>
        </div>

        {/* Secondary Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-3 border-t border-slate-100 items-center">
          
          {/* Branch Dropdown */}
          <div className="sm:col-span-4">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            >
              <option value="">All Branches / Specializations</option>
              {selectedProgram === 'BCOM' && (
                <>
                  <option value="General">B.Com General</option>
                  <option value="Computer Applications">B.Com Computer Applications</option>
                  <option value="Business Analytics">B.Com Business Analytics</option>
                  <option value="Honors">B.Com Honors</option>
                </>
              )}
              {selectedProgram === 'BBA' && (
                <option value="General Business Administration">General Business Administration</option>
              )}
              {selectedProgram === 'BSC' && (
                <>
                  <option value="Mathematics">B.Sc Mathematics</option>
                  <option value="Statistics">B.Sc Statistics</option>
                  <option value="Computer Science & Data">B.Sc Computer Science & Data</option>
                </>
              )}
            </select>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="sm:col-span-8 flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                placeholder="Search subject (e.g. Financial Accounting, DBMS, Statistics, Telugu)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            >
              Search
            </button>
          </form>
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
          <button
            onClick={() => setSelectedType('ALL')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              selectedType === 'ALL'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Resources ({papers.length})
          </button>
          <button
            onClick={() => setSelectedType('PREVIOUS_YEAR')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              selectedType === 'PREVIOUS_YEAR'
                ? 'bg-amber-500 text-slate-950 font-black'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Previous Year Papers ({prevYearPapers.length})
          </button>
          <button
            onClick={() => setSelectedType('IMPORTANT_QUESTIONS')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              selectedType === 'IMPORTANT_QUESTIONS'
                ? 'bg-purple-600 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Important Question Banks ({importantQuestions.length})
          </button>
          <button
            onClick={() => setSelectedType('STUDY_GUIDE')}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              selectedType === 'STUDY_GUIDE'
                ? 'bg-blue-600 text-white font-bold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Formula & Study Notes ({studyGuides.length})
          </button>
        </div>

      </div>

      {/* Question Papers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            Loading exam guide materials...
          </div>
        ) : papers.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Question Papers in this Selection</h3>
            <p className="text-xs text-slate-500 mt-1">
              Select another semester or branch to explore available exam papers.
            </p>
          </div>
        ) : (
          papers.map((paper) => (
            <div
              key={paper.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between group"
            >
              <div>
                {/* Header Tag */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full ${
                      paper.type === 'PREVIOUS_YEAR'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : paper.type === 'IMPORTANT_QUESTIONS'
                        ? 'bg-purple-100 text-purple-900 border border-purple-200'
                        : 'bg-blue-100 text-blue-900 border border-blue-200'
                    }`}
                  >
                    {paper.type === 'PREVIOUS_YEAR'
                      ? 'Previous Year Exam Paper'
                      : paper.type === 'IMPORTANT_QUESTIONS'
                      ? 'Important Question Bank'
                      : 'Faculty Study Guide'}
                  </span>

                  <span className="text-[10px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                    {paper.year}
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-amber-600 transition">
                  {paper.title}
                </h3>
                <p className="text-xs font-semibold text-slate-600 mt-1">
                  Subject: <span className="text-amber-600">{paper.subject}</span>
                </p>

                <div className="mt-2 text-[11px] text-slate-500">
                  {paper.program} • {paper.branch} • Semester {paper.semester}
                </div>

                {paper.description && (
                  <p className="text-[11px] text-slate-600 mt-2.5 line-clamp-3 bg-slate-50 p-2.5 rounded-xl border border-slate-100 leading-relaxed">
                    {paper.description}
                  </p>
                )}
              </div>

              {/* Download / Open Action */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-400">
                  Verified by {paper.uploadedBy?.name || 'Faculty'}
                </span>
                <button
                  type="button"
                  onClick={() => downloadExamPaper(paper)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-amber-500 text-white hover:text-slate-950 text-xs font-extrabold transition shadow-xs cursor-pointer"
                  aria-label={`Download ${paper.title}`}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download / View</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Second Language Note */}
      <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 flex items-start gap-3 text-xs text-amber-900">
        <Sparkles className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold">Second Language Exam Papers & Guides</h4>
          <p className="text-amber-800 mt-0.5 leading-relaxed">
            Question papers for Telugu, Sanskrit, Hindi, and Arabic second languages are uploaded for all Degree Semesters. Search for your language subject above to access them.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ExamGuide;
