import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Lending, BookRequest, ExamPaper, Notification } from '../../types';
import StatCard from '../../components/common/StatCard';
import {
  BookOpen,
  RotateCcw,
  GraduationCap,
  ArrowRight,
  UserCheck,
  UploadCloud,
  Bell,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Loader2,
  GitPullRequest,
  BookmarkCheck,
} from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Local helper function to calculate overdue / due-soon status for a lending.
 * Overdue is determined from lending.isOverdue || now > dueDate.
 * Threshold for due-soon matches backend lazy WARNING notification threshold (due in <= 3 days).
 */
export function getLendingDueStatus(lending: Lending, now = new Date()) {
  const dueDate = new Date(lending.dueDate);
  const isOverdue = lending.isOverdue || now > dueDate;
  const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  const isDueSoon = !isOverdue && daysLeft >= 0 && daysLeft <= 3;
  const daysOverdue = Math.max(1, Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

  return { dueDate, isOverdue, isDueSoon, daysLeft, daysOverdue };
}

export const TeacherDashboard: React.FC = () => {
  const { user } = useAuth();
  const isMountedRef = useRef(true);

  const [borrowedBooks, setBorrowedBooks] = useState<Lending[]>([]);
  const [allIssuedLendings, setAllIssuedLendings] = useState<Lending[]>([]);
  const [pendingRequests, setPendingRequests] = useState<BookRequest[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [myUploadedPapersCount, setMyUploadedPapersCount] = useState<number>(0);
  const [totalPapersCount, setTotalPapersCount] = useState<number>(0);

  const [loading, setLoading] = useState(true);
  const [fetchErrors, setFetchErrors] = useState<string[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        myBooksSettled,
        myRequestsSettled,
        allLendingsSettled,
        notifSettled,
        papersSettled,
      ] = await Promise.allSettled([
        api.get('/lending/my-books', { params: { status: 'ISSUED', limit: 50 } }),
        api.get('/lending/my-requests', { params: { type: 'BORROW', status: 'PENDING' } }),
        api.get('/lending/all'),
        api.get('/lending/notifications'),
        api.get('/exam/papers'),
      ]);

      if (!isMountedRef.current) return;

      const errors: string[] = [];

      // Process Faculty Loans (Includes all active loans: on-time and overdue)
      if (myBooksSettled.status === 'fulfilled') {
        const rawLendings = myBooksSettled.value.data.lendings || [];
        setBorrowedBooks(rawLendings.filter((l: Lending) => l.status === 'ISSUED'));
      } else {
        errors.push('faculty loans');
        console.error('Failed to load faculty loans:', myBooksSettled.reason);
      }

      // Process Pending Requests
      if (myRequestsSettled.status === 'fulfilled') {
        setPendingRequests(myRequestsSettled.value.data.requests || []);
      } else {
        errors.push('pending requests');
        console.error('Failed to load pending requests:', myRequestsSettled.reason);
      }

      // Process All Student Checkouts (/lending/all already returns all active loans)
      if (allLendingsSettled.status === 'fulfilled') {
        setAllIssuedLendings(allLendingsSettled.value.data.lendings || []);
      } else {
        errors.push('student checkouts');
        console.error('Failed to load student checkouts:', allLendingsSettled.reason);
      }

      // Process Notifications
      if (notifSettled.status === 'fulfilled') {
        const notifData = notifSettled.value.data;
        const notifList = notifData.notifications || [];
        setNotifications(notifList);
        if (typeof notifData.unreadCount === 'number') {
          setUnreadCount(notifData.unreadCount);
        } else {
          setUnreadCount(notifList.filter((n: Notification) => !n.read).length);
        }
      } else {
        errors.push('notifications');
        console.error('Failed to load notifications:', notifSettled.reason);
      }

      // Process Exam Papers
      if (papersSettled.status === 'fulfilled') {
        const papers: ExamPaper[] = papersSettled.value.data.papers || [];
        setTotalPapersCount(papers.length);
        const myCount = papers.filter(
          (p: any) => p.uploadedById === user?.id || p.uploadedBy?.id === user?.id
        ).length;
        setMyUploadedPapersCount(myCount);
      } else {
        errors.push('exam question papers');
        console.error('Failed to load exam papers:', papersSettled.reason);
      }

      setFetchErrors(errors);
    } catch (err) {
      if (isMountedRef.current) {
        setFetchErrors(['dashboard resources']);
      }
      console.error('Teacher dashboard fetch error:', err);
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

  // Calculations for Overdue / Due Soon faculty loans using local helper
  const now = new Date();
  const overdueCount = borrowedBooks.filter((l) => getLendingDueStatus(l, now).isOverdue).length;
  const dueSoonCount = borrowedBooks.filter((l) => getLendingDueStatus(l, now).isDueSoon).length;

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

        <div className="flex flex-wrap items-center gap-2">
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
      {loading && !borrowedBooks.length && !allIssuedLendings.length && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm font-bold text-slate-700">Loading your faculty dashboard...</p>
          <p className="text-xs text-slate-400">Fetching your loans, pending requests, student checkouts, and notifications.</p>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="My Faculty Loans"
          value={borrowedBooks.length}
          subtitle="Reference books currently issued to you"
          icon={BookmarkCheck}
          color="blue"
        />

        <Link to="/teacher/borrowings" className="block">
          <StatCard
            title="Pending Requests"
            value={pendingRequests.length}
            subtitle={
              pendingRequests.length === 1
                ? '1 request awaiting approval'
                : `${pendingRequests.length} requests awaiting approval`
            }
            icon={GitPullRequest}
            color={pendingRequests.length > 0 ? 'amber' : 'indigo'}
          />
        </Link>

        <StatCard
          title="Overdue & Due Soon"
          value={
            overdueCount > 0
              ? `${overdueCount} Overdue`
              : dueSoonCount > 0
              ? `${dueSoonCount} Due Soon`
              : '0 Alerts'
          }
          subtitle={
            overdueCount > 0
              ? `${overdueCount} book${overdueCount > 1 ? 's' : ''} past due date`
              : dueSoonCount > 0
              ? `${dueSoonCount} book${dueSoonCount > 1 ? 's' : ''} due within 3 days`
              : 'All faculty loans in good standing'
          }
          icon={AlertTriangle}
          color={overdueCount > 0 ? 'red' : dueSoonCount > 0 ? 'amber' : 'emerald'}
        />

        <StatCard
          title="Student Checkouts"
          value={allIssuedLendings.length}
          subtitle="Active student loans across college"
          icon={UserCheck}
          color="emerald"
        />

        <Link to="/teacher/notifications" className="block">
          <StatCard
            title="Notifications"
            value={unreadCount}
            subtitle={unreadCount === 1 ? '1 unread alert' : `${unreadCount} unread alerts`}
            icon={Bell}
            color={unreadCount > 0 ? 'red' : 'indigo'}
          />
        </Link>

        <StatCard
          title="Exam QP Contributor"
          value={
            myUploadedPapersCount > 0
              ? `${myUploadedPapersCount} Uploaded`
              : `${totalPapersCount} Papers`
          }
          subtitle={
            myUploadedPapersCount > 0
              ? `${myUploadedPapersCount} question paper(s) contributed by you`
              : `${totalPapersCount} total question paper(s) in repository`
          }
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
            {borrowedBooks.map((lending) => {
              const { dueDate, isOverdue, isDueSoon, daysLeft, daysOverdue } = getLendingDueStatus(
                lending,
                now
              );

              return (
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
                    <span className="text-slate-500 font-medium">
                      Copy #{lending.bookCopy?.copyNumber}
                      {lending.bookCopy?.barcode ? ` (${lending.bookCopy.barcode})` : ''}
                    </span>
                    <div className="text-right">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-block ${
                          isOverdue
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : isDueSoon
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        Due: {dueDate.toLocaleDateString()}
                      </span>
                      {isOverdue && (
                        <span className="block text-[10px] text-red-600 font-bold mt-0.5">
                          Overdue by {daysOverdue} Day{daysOverdue > 1 ? 's' : ''}
                        </span>
                      )}
                      {isDueSoon && (
                        <span className="block text-[10px] text-amber-600 font-bold mt-0.5">
                          Due in {daysLeft === 0 ? 'today' : `${daysLeft} day(s)`}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Access Cards */}
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
