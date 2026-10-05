import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Lending, BookRequest } from '../../types';
import { BookmarkCheck, Clock, AlertTriangle, CheckCircle2, XCircle, BookOpen, Layers } from 'lucide-react';
import toast from 'react-hot-toast';

export const MyBorrowings: React.FC = () => {
  const [lendings, setLendings] = useState<Lending[]>([]);
  const [requests, setRequests] = useState<BookRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'ISSUED' | 'REQUESTS' | 'HISTORY'>('ISSUED');
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [lendingsRes, requestsRes] = await Promise.all([
        api.get('/lending/my-books'),
        api.get('/lending/my-requests'),
      ]);
      setLendings(lendingsRes.data.lendings || []);
      setRequests(requestsRes.data.requests || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load borrowing records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const activeLendings = lendings.filter((l) => l.status === 'ISSUED');
  const historyLendings = lendings.filter((l) => l.status === 'RETURNED');

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">My Library Pass & Borrowings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Check your return due dates, pending borrow approvals, and complete lending history
          </p>
        </div>
        <div className="flex rounded-xl bg-slate-100 p-1">
          <button
            onClick={() => setActiveTab('ISSUED')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'ISSUED'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Currently Issued ({activeLendings.length})
          </button>
          <button
            onClick={() => setActiveTab('REQUESTS')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'REQUESTS'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pending Requests ({requests.length})
          </button>
          <button
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'HISTORY'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past History ({historyLendings.length})
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'ISSUED' && (
        <div className="space-y-4">
          {activeLendings.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <BookmarkCheck className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">No Books Currently Issued</h3>
              <p className="text-xs text-slate-500 mt-1">
                You have zero books currently checked out in your name.
              </p>
            </div>
          ) : (
            activeLendings.map((lending) => {
              const now = new Date();
              const dueDate = new Date(lending.dueDate);
              const isOverdue = now > dueDate;
              const daysLeft = Math.ceil(
                (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              );

              return (
                <div
                  key={lending.id}
                  className={`bg-white p-6 rounded-2xl border shadow-xs transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isOverdue ? 'border-red-300 bg-red-50/20' : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {lending.bookCopy?.book?.segment || 'Textbook'}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400">
                        Copy #{lending.bookCopy?.copyNumber}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">
                      {lending.bookCopy?.book?.title}
                    </h3>
                    <p className="text-xs text-slate-500">by {lending.bookCopy?.book?.author}</p>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
                      <span>Issued: {new Date(lending.issuedDate).toLocaleDateString()}</span>
                      <span>•</span>
                      <span>
                        Return Due: <strong>{dueDate.toLocaleDateString()}</strong>
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    {isOverdue ? (
                      <div className="p-3 bg-red-100 rounded-xl border border-red-200 text-right inline-block">
                        <div className="flex items-center justify-end gap-1 text-xs font-bold text-red-800">
                          <AlertTriangle className="w-4 h-4 text-red-600" />
                          <span>Overdue by {Math.abs(daysLeft)} Days</span>
                        </div>
                        <p className="text-[11px] text-red-700 mt-0.5">
                          Please return to library as soon as possible.
                        </p>
                      </div>
                    ) : (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-right inline-block">
                        <div className="flex items-center justify-end gap-1 text-xs font-bold text-emerald-800">
                          <Clock className="w-4 h-4 text-emerald-600" />
                          <span>{daysLeft} Days Remaining</span>
                        </div>
                        <p className="text-[11px] text-emerald-700 mt-0.5">
                          Please return by {dueDate.toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {activeTab === 'REQUESTS' && (
        <div className="space-y-4">
          {requests.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <Clock className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <h3 className="text-base font-bold text-slate-800">No Pending Requests</h3>
              <p className="text-xs text-slate-500 mt-1">
                You have not submitted any pending borrow requests.
              </p>
            </div>
          ) : (
            requests.map((req) => (
              <div
                key={req.id}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between gap-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                        req.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-900'
                          : req.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-red-100 text-red-900'
                      }`}
                    >
                      {req.status}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {new Date(req.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-1.5">{req.book?.title}</h4>
                  <p className="text-xs text-slate-500">by {req.book?.author}</p>
                  {req.message && (
                    <p className="text-xs text-slate-600 mt-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                      Note: {req.message}
                    </p>
                  )}
                  {req.responseMessage && (
                    <p className="text-xs text-amber-800 mt-1 bg-amber-50 p-2 rounded-lg border border-amber-200">
                      Librarian: {req.responseMessage}
                    </p>
                  )}
                </div>

                <div className="text-right">
                  {req.status === 'PENDING' && (
                    <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200">
                      Under Review
                    </span>
                  )}
                  {req.status === 'APPROVED' && (
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                      Approved for Pickup
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'HISTORY' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-3 px-4">Book Title</th>
                <th className="py-3 px-4">Issued On</th>
                <th className="py-3 px-4">Returned On</th>
                <th className="py-3 px-4">Late Days</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLendings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No past return records yet
                  </td>
                </tr>
              ) : (
                historyLendings.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {l.bookCopy?.book?.title}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(l.issuedDate).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {l.returnedDate ? new Date(l.returnedDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      {l.daysOverdue ? `${l.daysOverdue} days late` : 'On Time'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-bold">
                        Returned
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MyBorrowings;
