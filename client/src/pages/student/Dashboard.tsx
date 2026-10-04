import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Lending, Book, ExamPaper } from '../../types';
import StatCard from '../../components/common/StatCard';
import BookCard from '../../components/common/BookCard';
import Modal from '../../components/common/Modal';
import {
  BookOpen,
  BookmarkCheck,
  GraduationCap,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  FileText,
  Bell,
  RefreshCw,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const isMountedRef = useRef(true);

  const [borrowedBooks, setBorrowedBooks] = useState<(Lending & { isOverdue?: boolean; daysOverdue?: number; finePolicy?: string })[]>([]);
  const [recommendedBooks, setRecommendedBooks] = useState<Book[]>([]);
  const [recentExamPapers, setRecentExamPapers] = useState<ExamPaper[]>([]);
  const [totalExamPapersCount, setTotalExamPapersCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  // Borrow Modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowMessage, setBorrowMessage] = useState('');
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [submittingBorrow, setSubmittingBorrow] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [lendingsSettled, booksSettled, papersSettled, notifSettled] = await Promise.allSettled([
        api.get('/lending/my-books'),
        api.get('/books', {
          params: {
            program: user?.program || undefined,
            branch: user?.branch || undefined,
            limit: 4,
          },
        }),
        api.get('/exam/papers', {
          params: {
            program: user?.program || undefined,
            semester: user?.semester || undefined,
          },
        }),
        api.get('/lending/notifications'),
      ]);

      if (!isMountedRef.current) return;

      const errors: string[] = [];

      // Process lendings
      if (lendingsSettled.status === 'fulfilled') {
        const rawLendings = lendingsSettled.value.data.lendings || [];
        setBorrowedBooks(rawLendings.filter((l: Lending) => l.status === 'ISSUED'));
      } else {
        errors.push('issued books');
        console.error('Failed to load lendings:', lendingsSettled.reason);
      }

      // Process recommended books
      if (booksSettled.status === 'fulfilled') {
        setRecommendedBooks(booksSettled.value.data.books || []);
      } else {
        errors.push('recommended textbooks');
        console.error('Failed to load recommended books:', booksSettled.reason);
      }

      // Process exam papers
      if (papersSettled.status === 'fulfilled') {
        const allPapers: ExamPaper[] = papersSettled.value.data.papers || [];
        setTotalExamPapersCount(allPapers.length);
        setRecentExamPapers(allPapers.slice(0, 3));
      } else {
        errors.push('exam question papers');
        console.error('Failed to load exam papers:', papersSettled.reason);
      }

      // Process notifications
      if (notifSettled.status === 'fulfilled') {
        setNotifications(notifSettled.value.data.notifications || []);
      } else {
        errors.push('notifications');
        console.error('Failed to load notifications:', notifSettled.reason);
      }

      setFetchErrors(errors);
    } catch (err) {
      if (isMountedRef.current) {
        setFetchErrors(['dashboard resources']);
      }
      console.error('Dashboard fetch error:', err);
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  useEffect(() => {
    isMountedRef.current = true;
    fetchData();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchData]);

  const handleRequestBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    try {
      setSubmittingBorrow(true);
      await api.post('/lending/request-borrow', {
        bookId: selectedBook.id,
        message: borrowMessage,
      });
      toast.success('Borrow request submitted to librarian! You will be notified once approved.');
      if (isMountedRef.current) {
        setIsBorrowModalOpen(false);
        setBorrowMessage('');
        setSelectedBook(null);
      }
      await fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to submit request');
    } finally {
      if (isMountedRef.current) {
        setSubmittingBorrow(false);
      }
    }
  };

  const overdueBooks = borrowedBooks.filter(
    (l) => l.isOverdue || new Date(l.dueDate) < new Date()
  );
  const overdueCount = overdueBooks.length;
  const totalFine = borrowedBooks.reduce((sum, l) => sum + (l.fine || 0), 0);
  const unreadNotifs = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      {/* Student Welcome Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
              Roll No: {user?.rollNumber || 'Student'}
            </span>
            <span className="text-xs text-slate-300 font-medium">
              {user?.program} • {user?.branch} (Sem {user?.semester})
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black mt-2">
            Namaste, {user?.name}!
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
            Welcome to R.G. Kedia College Library Portal. Check your due dates, borrow curriculum textbooks, and download university question papers.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/student/browse"
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <BookOpen className="w-4 h-4" />
            <span>Search Books</span>
          </Link>
          <Link
            to="/student/exam-guide"
            className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition border border-white/20 flex items-center gap-1.5"
          >
            <GraduationCap className="w-4 h-4" />
            <span>Exam Papers</span>
          </Link>
        </div>
      </div>

      {/* Error banner if any section failed during fetch */}
      {fetchErrors.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 text-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <span className="font-bold">Notice:</span> Some dashboard data could not be refreshed ({fetchErrors.join(', ')}).
            </div>
          </div>
          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl transition self-start sm:self-auto disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Loading state skeleton/spinner */}
      {loading && !borrowedBooks.length && !recommendedBooks.length && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <p className="text-sm font-bold text-slate-700">Loading your student dashboard...</p>
          <p className="text-xs text-slate-400">Fetching your active loans, recommendations, and exam papers.</p>
        </div>
      )}

      {/* Quick Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Currently Borrowed"
          value={borrowedBooks.length}
          subtitle="Active books issued in your name"
          icon={BookmarkCheck}
          color="blue"
        />
        <StatCard
          title="Overdue Notice"
          value={overdueCount}
          subtitle={
            overdueCount > 0
              ? totalFine > 0
                ? `Total Fine Due: ₹${totalFine} (₹2/day)`
                : "Return today to avoid ₹2/day fine"
              : totalFine > 0
              ? `Total Fine Due: ₹${totalFine}`
              : "All books returned on time"
          }
          icon={AlertTriangle}
          color={overdueCount > 0 ? "red" : "emerald"}
        />
        <StatCard
          title="Exam QP Resources"
          value={totalExamPapersCount}
          subtitle="Available for your semester"
          icon={GraduationCap}
          color="amber"
        />
        <Link to="/student/notifications" className="block">
          <StatCard
            title="Notifications"
            value={unreadNotifs}
            subtitle={unreadNotifs === 1 ? "1 unread alert" : `${unreadNotifs} unread alerts`}
            icon={Bell}
            color={unreadNotifs > 0 ? "red" : "indigo"}
          />
        </Link>
      </div>

      {/* Main Grid: My Borrowed Books + Exam Papers */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Active Borrowings */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">My Issued Books</h2>
                <p className="text-xs text-slate-500">Books currently in your possession</p>
              </div>
              <Link
                to="/student/borrowings"
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                View details <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {borrowedBooks.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100">
                <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-600">No books currently borrowed</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Explore the library catalog to request your course textbooks.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {borrowedBooks.map((lending) => {
                  const isOverdue = lending.isOverdue || new Date(lending.dueDate) < new Date();
                  return (
                    <div
                      key={lending.id}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition flex items-center justify-between gap-3 bg-slate-50/50"
                    >
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">
                          {lending.bookCopy?.book?.title}
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          by {lending.bookCopy?.book?.author} • Copy #{lending.bookCopy?.copyNumber}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block ${
                            isOverdue
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          Due: {new Date(lending.dueDate).toLocaleDateString()}
                        </span>
                        {isOverdue && (
                          <span className="block text-[10px] text-red-600 font-bold mt-0.5">
                            Overdue! {lending.fine ? `(Fine: ₹${lending.fine})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Second Language Choice: <strong>{user?.secondLanguage || 'Telugu'}</strong></span>
            <span className="text-[11px] font-mono text-slate-400">Library Limit: 3 books max</span>
          </div>
        </div>

        {/* Right Side: Quick Exam Papers Access */}
        <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Exam Guide</h2>
                <p className="text-xs text-slate-500">Latest university papers & question banks</p>
              </div>
              <Link
                to="/student/exam-guide"
                className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                All Papers <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {recentExamPapers.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-xl border border-slate-100">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-600">No exam papers available</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Check back later or browse other semesters in the Exam Guide.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {recentExamPapers.map((paper) => (
                  <a
                    key={paper.id}
                    href={paper.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3 rounded-xl border border-slate-100 hover:border-amber-300 hover:bg-amber-50/30 transition flex items-center justify-between gap-2 block group"
                  >
                    <div className="flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                      <div>
                        <h4 className="font-bold text-xs text-slate-800 group-hover:text-amber-700 transition">
                          {paper.title}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {paper.subject} • {paper.year}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold bg-slate-100 text-slate-700 px-2 py-0.5 rounded group-hover:bg-amber-500 group-hover:text-slate-950 transition">
                      Download
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 text-xs text-amber-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="text-[11px] font-semibold">
              Previous 5-year question papers available for Sem {user?.semester || 1}
            </span>
          </div>
        </div>

      </div>

      {/* Recommended Books for this Student's Branch */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Recommended for {user?.program} ({user?.branch})
            </h2>
            <p className="text-xs text-slate-500">Core textbooks and reference guides prescribed for your branch</p>
          </div>
          <Link
            to="/student/browse"
            className="text-xs font-bold text-amber-600 hover:text-amber-700 flex items-center gap-1"
          >
            Browse full catalog <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {recommendedBooks.length === 0 ? (
          <div className="py-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
            <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
            <p className="text-xs font-semibold text-slate-600">No recommended books found for your branch</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Explore the full library catalog to browse all available subjects and textbooks.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recommendedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                actionLabel="Request Book"
                onAction={(b) => {
                  setSelectedBook(b);
                  setIsBorrowModalOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Borrow Request Modal */}
      <Modal
        isOpen={isBorrowModalOpen}
        onClose={() => setIsBorrowModalOpen(false)}
        title={`Request Book: ${selectedBook?.title || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleRequestBorrow} className="space-y-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <h4 className="font-bold text-slate-900">{selectedBook?.title}</h4>
            <p className="text-slate-500 mt-0.5">by {selectedBook?.author}</p>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-emerald-600">
                {selectedBook?.availableCopies} Copies in Library
              </span>
              <span className="text-slate-500 font-mono">Location: {selectedBook?.shelfLocation}</span>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Purpose / Note for Librarian (Optional)
            </label>
            <textarea
              rows={3}
              value={borrowMessage}
              onChange={(e) => setBorrowMessage(e.target.value)}
              placeholder="e.g. For semester exam preparation / assignment reference"
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsBorrowModalOpen(false)}
              disabled={submittingBorrow}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingBorrow}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {submittingBorrow && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingBorrow ? 'Submitting...' : 'Submit Borrow Request'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StudentDashboard;
