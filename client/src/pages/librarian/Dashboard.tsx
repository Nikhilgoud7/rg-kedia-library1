import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { DashboardStats, Lending } from '../../types';
import StatCard from '../../components/common/StatCard';
import {
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  GitPullRequest,
  Clock,
  ArrowRight,
  AlertCircle,
  RefreshCw,
  FileCheck2,
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const LibrarianDashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentLendings, setRecentLendings] = useState<Lending[]>([]);
  const [booksByProgram, setBooksByProgram] = useState<{ program: string; count: number }[]>([]);
  const [booksByCategory, setBooksByCategory] = useState<{ category: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/admin/dashboard');
      setStats(res.data.stats);
      setRecentLendings(res.data.recentLendings || []);
      setBooksByProgram(res.data.booksByProgram || []);
      setBooksByCategory(res.data.booksByCategory || []);
    } catch (err: any) {
      console.error('Failed to load dashboard data', err);
      setError('Unable to load library console statistics. Please check server connectivity.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
            Librarian Central Administration
          </span>
          <h1 className="text-2xl sm:text-3xl font-black mt-1">
            R.G. Kedia College Library Console
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl">
            Real-time control over book stock, lending requests, student/faculty records, and university exam resources.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/librarian/books"
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
            aria-label="Navigate to book inventory management"
          >
            <BookOpen className="w-4 h-4" />
            <span>Manage Catalog</span>
          </Link>
          <Link
            to="/librarian/requests"
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition border border-white/20 flex items-center gap-1.5"
            aria-label="Navigate to pending lending requests queue"
          >
            <GitPullRequest className="w-4 h-4" />
            <span>Pending Requests</span>
          </Link>
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
            onClick={fetchDashboard}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold flex items-center gap-1 transition"
            aria-label="Retry loading dashboard"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Primary Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          // Skeleton metric cards
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-3 bg-slate-200 rounded w-24" />
                <div className="w-8 h-8 rounded-xl bg-slate-100" />
              </div>
              <div className="h-7 bg-slate-200 rounded w-16" />
              <div className="h-2.5 bg-slate-100 rounded w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title="Total Book Titles"
              value={stats?.totalBooks || 0}
              subtitle={`${stats?.totalCopies || 0} physical copies in stock`}
              icon={BookOpen}
              color="amber"
            />
            <StatCard
              title="Available to Issue"
              value={stats?.availableCopies || 0}
              subtitle={`${stats?.issuedCopies || 0} currently with students/staff`}
              icon={CheckCircle2}
              color="emerald"
            />
            <StatCard
              title="Pending Requests"
              value={stats?.pendingRequests || 0}
              subtitle="Awaiting librarian approval"
              icon={GitPullRequest}
              color="blue"
            />
            <StatCard
              title="Overdue Books"
              value={stats?.overdueCount || 0}
              subtitle="Books past scheduled return date"
              icon={AlertTriangle}
              color="red"
            />
          </>
        )}
      </div>

      {/* Secondary Information Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Recent Issued Books Stream */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Lending Activity</h2>
              <p className="text-xs text-slate-500">Books currently issued to students and faculty</p>
            </div>
            <Link
              to="/librarian/issued"
              className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              aria-label="View all issued books"
            >
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" aria-label="Recent lending activity">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 font-semibold uppercase">
                  <th scope="col" className="py-2.5 px-3">Book Title</th>
                  <th scope="col" className="py-2.5 px-3">Borrower</th>
                  <th scope="col" className="py-2.5 px-3">Issued Date</th>
                  <th scope="col" className="py-2.5 px-3">Due Date</th>
                  <th scope="col" className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-36" /></td>
                      <td className="py-3 px-3"><div className="h-4 bg-slate-200 rounded w-28" /></td>
                      <td className="py-3 px-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                      <td className="py-3 px-3"><div className="h-4 bg-slate-100 rounded w-20" /></td>
                      <td className="py-3 px-3 text-right"><div className="h-5 bg-slate-100 rounded-full w-14 ml-auto" /></td>
                    </tr>
                  ))
                ) : recentLendings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center">
                      <div className="max-w-xs mx-auto space-y-2">
                        <FileCheck2 className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="text-xs font-bold text-slate-700">No active lendings currently</p>
                        <p className="text-[11px] text-slate-400">Approved book loans will appear here in real-time.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  recentLendings.map((lending) => {
                    const isOverdue = new Date(lending.dueDate) < new Date();
                    return (
                      <tr key={lending.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-3 font-semibold text-slate-800">
                          {lending.bookCopy?.book?.title || 'Unknown Title'}
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          <span className="font-bold text-slate-800">{lending.user?.name}</span>
                          {lending.user?.rollNumber && (
                            <span className="block text-[10px] text-slate-400 font-mono">
                              {lending.user.rollNumber}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(lending.issuedDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-slate-500">
                          {new Date(lending.dueDate).toLocaleDateString()}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isOverdue
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {isOverdue ? 'Overdue' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Side: Program Breakdown */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h2 className="text-base font-bold text-slate-900 mb-1">Books by Program</h2>
            <p className="text-xs text-slate-500 mb-4">Curriculum mapping distribution</p>

            {loading ? (
              <div className="space-y-3 animate-pulse">
                <div className="h-10 bg-slate-100 rounded-xl" />
                <div className="h-10 bg-slate-100 rounded-xl" />
                <div className="h-10 bg-slate-100 rounded-xl" />
              </div>
            ) : booksByProgram.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">No curriculum mappings recorded</p>
            ) : (
              <div className="space-y-3">
                {booksByProgram.map((item) => (
                  <div key={item.program} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold text-slate-800">
                        {item.program === 'BCOM'
                          ? 'Bachelor of Commerce (B.Com)'
                          : item.program === 'BBA'
                          ? 'Bachelor of Business Admin (BBA)'
                          : 'Bachelor of Science (B.Sc)'}
                      </span>
                    </div>
                    <span className="text-xs font-extrabold bg-white px-2 py-0.5 rounded-md border border-slate-200 text-slate-700">
                      {item.count} titles
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-5">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900">Library Operating Hours</h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  Monday to Saturday: 9:00 AM – 5:00 PM<br />
                  Exam Days: 8:30 AM – 6:00 PM<br />
                  Return Window: Up to 30 days standard
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LibrarianDashboard;
