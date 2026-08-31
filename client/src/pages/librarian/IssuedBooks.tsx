import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Lending } from '../../types';
import { CheckSquare, AlertTriangle, Search, Check, RotateCcw, Clock, IndianRupee } from 'lucide-react';
import toast from 'react-hot-toast';

export const IssuedBooks: React.FC = () => {
  const [lendings, setLendings] = useState<Lending[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLendings = async () => {
    try {
      setLoading(true);
      const endpoint = filter === 'OVERDUE' ? '/lending/overdue' : '/lending/all';
      const res = await api.get(endpoint);
      const data = filter === 'OVERDUE' ? res.data.overdue : res.data.lendings;
      setLendings(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load lendings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLendings();
  }, [filter]);

  const handleReturn = async (lendingId: string, bookTitle: string) => {
    if (!window.confirm(`Confirm return of "${bookTitle}"?`)) return;
    try {
      const res = await api.post(`/lending/return/${lendingId}`);
      if (res.data.fine > 0) {
        toast.success(`Book returned! Collected fine of ₹${res.data.fine}`, { duration: 5000 });
      } else {
        toast.success(`Book "${bookTitle}" returned successfully!`);
      }
      fetchLendings();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process return');
    }
  };

  const filtered = lendings.filter((l) => {
    const term = search.toLowerCase();
    const title = l.bookCopy?.book?.title?.toLowerCase() || '';
    const student = l.user?.name?.toLowerCase() || '';
    const roll = l.user?.rollNumber?.toLowerCase() || '';
    return title.includes(term) || student.includes(term) || roll.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Active Book Lendings & Returns</h1>
          <p className="text-xs text-slate-500 mt-1">
            Track books currently issued to students and teachers, monitor due dates, and process returns
          </p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Active ({lendings.length})
          </button>
          <button
            onClick={() => setFilter('OVERDUE')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
              filter === 'OVERDUE'
                ? 'bg-red-600 text-white shadow-xs'
                : 'text-red-600 hover:bg-red-50'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Overdue Only
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search active records by book title, student name, or roll number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Lendings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-3.5 px-4">Book Details</th>
                <th className="py-3.5 px-4">Borrower Info</th>
                <th className="py-3.5 px-4">Issued On</th>
                <th className="py-3.5 px-4">Due Date</th>
                <th className="py-3.5 px-4">Overdue / Fine</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading issued records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No active issued records found
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const now = new Date();
                  const dueDate = new Date(l.dueDate);
                  const isOverdue = now > dueDate;
                  const daysOverdue = isOverdue
                    ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;
                  const fine = daysOverdue * 2; // ₹2/day

                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 text-sm">
                          {l.bookCopy?.book?.title || 'Book Title'}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          by {l.bookCopy?.book?.author}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Copy #{l.bookCopy?.copyNumber}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-xs">{l.user?.name}</div>
                        {l.user?.rollNumber ? (
                          <div className="text-slate-600 font-mono text-[11px] font-semibold">
                            {l.user.rollNumber}
                          </div>
                        ) : (
                          <div className="text-slate-400 text-[10px]">Faculty Staff</div>
                        )}
                        <div className="text-slate-500 text-[10px]">
                          {l.user?.program} ({l.user?.branch})
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-600">
                        {new Date(l.issuedDate).toLocaleDateString()}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`font-semibold ${isOverdue ? 'text-red-600 font-bold' : 'text-slate-800'}`}>
                          {dueDate.toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isOverdue ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-red-50 text-red-700 px-2 py-0.5 rounded-full border border-red-200">
                              <AlertTriangle className="w-3 h-3" />
                              {daysOverdue} Days Late
                            </span>
                            <span className="block text-[11px] font-bold text-red-600 mt-0.5">
                              Fine: ₹{fine}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full border border-emerald-200">
                            On Time
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() =>
                            handleReturn(l.id, l.bookCopy?.book?.title || 'Book')
                          }
                          className="px-3 py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl font-extrabold text-xs transition shadow-xs inline-flex items-center gap-1"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Return Book</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default IssuedBooks;
