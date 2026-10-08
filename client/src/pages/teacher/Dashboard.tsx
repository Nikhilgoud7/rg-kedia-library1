import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Lending, Book } from '../../types';
import StatCard from '../../components/common/StatCard';
import BookCard from '../../components/common/BookCard';
import { BookOpen, RotateCcw, GraduationCap, ArrowRight, UserCheck, Sparkles, UploadCloud } from 'lucide-react';
import { Link } from 'react-router-dom';

export const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const [borrowedBooks, setBorrowedBooks] = useState<Lending[]>([]);
  const [allIssuedLendings, setAllIssuedLendings] = useState<Lending[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [myBooksRes, allLendingsRes] = await Promise.all([
          api.get('/lending/my-books', { params: { status: 'ISSUED', limit: 50 } }),
          api.get('/lending/all'),
        ]);
        setBorrowedBooks(
          (myBooksRes.data.lendings || []).filter((l: Lending) => l.status === 'ISSUED')
        );
        setAllIssuedLendings(allLendingsRes.data.lendings || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-blue-900 via-slate-900 to-slate-950 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-300 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
            Faculty Portal • {user?.program || 'Commerce & Science'}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black mt-2">
            Welcome, {user?.name}!
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Access teaching reference materials, monitor student book checkouts, request early returns for lectures, and upload exam question papers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/teacher/browse"
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4" />
            <span>Search Library</span>
          </Link>
          <Link
            to="/teacher/request-return"
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition border border-white/20 flex items-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Student Book Returns</span>
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="My Faculty Loans"
          value={borrowedBooks.length}
          subtitle="Reference books currently issued to you"
          icon={BookOpen}
          color="blue"
        />
        <StatCard
          title="Student Checkouts"
          value={allIssuedLendings.length}
          subtitle="Active student loans across college"
          icon={UserCheck}
          color="emerald"
        />
        <StatCard
          title="Exam QP Contributor"
          value="Active"
          subtitle="Upload model papers for students"
          icon={UploadCloud}
          color="amber"
        />
      </div>

      {/* Faculty Borrowed Books Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Faculty Borrowed Titles</h2>
            <p className="text-xs text-slate-500">Books issued under your faculty library account</p>
          </div>
          <Link
            to="/teacher/borrowings"
            className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            Manage <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {borrowedBooks.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-600">No books currently borrowed</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Explore the library to request syllabus references.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {borrowedBooks.map((lending) => (
              <div
                key={lending.id}
                className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-col justify-between"
              >
                <div>
                  <span className="text-[10px] font-bold uppercase bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                    {lending.bookCopy?.book?.segment}
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 mt-2">
                    {lending.bookCopy?.book?.title}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">by {lending.bookCopy?.book?.author}</p>
                </div>

                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Copy #{lending.bookCopy?.copyNumber}</span>
                  <span className="font-bold text-slate-800">
                    Due: {new Date(lending.dueDate).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Access Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/teacher/request-return"
          className="p-6 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 hover:border-amber-400 transition flex items-center justify-between group"
        >
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">
              Student Outreach
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Find Who Has a Book & Request Return
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              See the exact student roll numbers holding specific copies and send return reminders.
            </p>
          </div>
          <RotateCcw className="w-8 h-8 text-amber-500 shrink-0 group-hover:rotate-45 transition transform" />
        </Link>

        <Link
          to="/teacher/exam-guide"
          className="p-6 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 hover:border-blue-400 transition flex items-center justify-between group"
        >
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
              Department Portal
            </span>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              Upload Question Papers & Question Banks
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Share model questions, formulas, and Osmania University exam solutions.
            </p>
          </div>
          <GraduationCap className="w-8 h-8 text-blue-500 shrink-0 group-hover:scale-110 transition transform" />
        </Link>
      </div>
    </div>
  );
};

export default TeacherDashboard;
