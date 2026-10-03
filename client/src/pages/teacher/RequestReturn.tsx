import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Lending } from '../../types';
import Modal from '../../components/common/Modal';
import { RotateCcw, Search, BookOpen, Send, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

export const RequestReturn: React.FC = () => {
  const [lendings, setLendings] = useState<Lending[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedLending, setSelectedLending] = useState<Lending | null>(null);
  const [returnMessage, setReturnMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchLendings = async () => {
    try {
      setLoading(true);
      const res = await api.get('/lending/all', {
        params: {
          program: selectedProgram || undefined,
          search: search || undefined,
        },
      });
      setLendings(res.data.lendings || []);
    } catch (err: any) {
      console.error('Failed to fetch student checkouts:', err);
      toast.error(err.response?.data?.error || 'Failed to load student checkouts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLendings();
  }, [selectedProgram]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLendings();
  };

  const handleSendReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLending) return;
    try {
      await api.post(`/lending/request-return/${selectedLending.id}`, {
        message: returnMessage,
      });
      toast.success(`Return notification sent to ${selectedLending.user?.name}!`);
      setIsModalOpen(false);
      setReturnMessage('');
      setSelectedLending(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send return request');
    }
  };

  const filtered = lendings.filter((l) => {
    const term = search.toLowerCase();
    const student = l.user?.name?.toLowerCase() || '';
    const roll = l.user?.rollNumber?.toLowerCase() || '';
    const title = l.bookCopy?.book?.title?.toLowerCase() || '';
    return student.includes(term) || roll.includes(term) || title.includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Student Book Return Requests</h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse all books currently issued to students and send early return notices for your lectures
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold bg-amber-50 text-amber-900 px-3.5 py-2 rounded-xl border border-amber-200">
          <RotateCcw className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{lendings.length} Books Currently With Students</span>
        </div>
      </div>

      {/* Search and Program Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search by student roll number, student name, or book title..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500"
          />
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
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
        </div>
      </div>

      {/* Lendings Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-3.5 px-4">Student Info</th>
                <th className="py-3.5 px-4">Book Title & Copy</th>
                <th className="py-3.5 px-4">Program & Branch</th>
                <th className="py-3.5 px-4">Scheduled Due Date</th>
                <th className="py-3.5 px-4 text-right">Faculty Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading student borrowing records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No matching student borrow records found
                  </td>
                </tr>
              ) : (
                filtered.map((lending) => {
                  const now = new Date();
                  const dueDate = new Date(lending.dueDate);
                  const isOverdue = now > dueDate;

                  return (
                    <tr key={lending.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-slate-900 text-sm">{lending.user?.name}</div>
                        <div className="font-mono text-[11px] text-slate-600 font-semibold">
                          Roll: {lending.user?.rollNumber || 'Faculty / Staff'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-800 text-xs">
                          {lending.bookCopy?.book?.title}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          by {lending.bookCopy?.book?.author} • Copy #{lending.bookCopy?.copyNumber}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="font-semibold text-slate-800">{lending.user?.program}</span>
                        <span className="text-slate-500 block text-[11px]">
                          {lending.user?.branch}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`font-semibold ${
                            isOverdue ? 'text-red-600 font-bold' : 'text-slate-700'
                          }`}
                        >
                          {dueDate.toLocaleDateString()}
                        </span>
                        {isOverdue && (
                          <span className="block text-[10px] text-red-600 font-bold">
                            (Overdue)
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => {
                            setSelectedLending(lending);
                            setIsModalOpen(true);
                          }}
                          className="px-3.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl text-xs transition shadow-xs inline-flex items-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Request Return</span>
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

      {/* Return Request Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={`Request Return from ${selectedLending?.user?.name || 'Student'}`}
        maxWidth="md"
      >
        <form onSubmit={handleSendReturn} className="space-y-4 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
            <h4 className="font-bold text-slate-900">{selectedLending?.bookCopy?.book?.title}</h4>
            <p className="text-slate-500">
              Held by: <strong>{selectedLending?.user?.name}</strong> (Roll: {selectedLending?.user?.rollNumber})
            </p>
            <p className="text-slate-400 text-[11px]">
              Branch: {selectedLending?.user?.program} - {selectedLending?.user?.branch}
            </p>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Reason / Note for Student</label>
            <textarea
              required
              rows={3}
              value={returnMessage}
              onChange={(e) => setReturnMessage(e.target.value)}
              placeholder="e.g. Please return this book to the library by tomorrow for lecture preparation."
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl"
            >
              Send Notice to Student
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default RequestReturn;
