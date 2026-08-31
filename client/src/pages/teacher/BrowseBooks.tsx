import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Book, Lending } from '../../types';
import Modal from '../../components/common/Modal';
import { Search, BookOpen, Users, Clock, RotateCcw, CheckCircle2, XCircle, MapPin, Send } from 'lucide-react';
import toast from 'react-hot-toast';

export const TeacherBrowseBooks: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedSegment, setSelectedSegment] = useState('');
  const [selectedProgram, setSelectedProgram] = useState('');
  const [loading, setLoading] = useState(true);

  // Book Detail & Copy Tracking Modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [bookDetail, setBookDetail] = useState<Book | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Return Request Modal
  const [targetLending, setTargetLending] = useState<Lending | null>(null);
  const [returnMessage, setReturnMessage] = useState('');
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);

  // Faculty Borrow Modal
  const [isFacultyBorrowModalOpen, setIsFacultyBorrowModalOpen] = useState(false);
  const [borrowMessage, setBorrowMessage] = useState('');

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/books', {
        params: {
          search: search || undefined,
          segment: selectedSegment || undefined,
          program: selectedProgram || undefined,
        },
      });
      setBooks(res.data.books || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, [selectedSegment, selectedProgram]);

  const handleOpenDetail = async (book: Book) => {
    try {
      const res = await api.get(`/books/${book.id}`);
      setBookDetail(res.data.book);
      setSelectedBook(book);
      setIsDetailModalOpen(true);
    } catch (err) {
      toast.error('Failed to load book details');
    }
  };

  const handleSendReturnRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLending) return;
    try {
      await api.post(`/lending/request-return/${targetLending.id}`, {
        message: returnMessage,
      });
      toast.success(`Return request sent to student ${targetLending.user?.name}!`);
      setIsReturnModalOpen(false);
      setReturnMessage('');
      setTargetLending(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to send return request');
    }
  };

  const handleFacultyBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    try {
      await api.post('/lending/request-borrow', {
        bookId: selectedBook.id,
        message: `Faculty Reference: ${borrowMessage}`,
      });
      toast.success('Faculty borrow request submitted to librarian!');
      setIsFacultyBorrowModalOpen(false);
      setBorrowMessage('');
      fetchBooks();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request book');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Faculty Library Catalog & Copy Tracker</h1>
          <p className="text-xs text-slate-500 mt-1">
            Check live physical copies in stock, see which students currently have copies, and send return requests
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold bg-blue-50 text-blue-900 px-3.5 py-2 rounded-xl border border-blue-200">
          <Users className="w-4 h-4 text-blue-600 shrink-0" />
          <span>Student Copy Lookup Enabled</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={(e) => { e.preventDefault(); fetchBooks(); }} className="flex-1 w-full flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search books by title, author, subject, or ISBN..."
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

          <select
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
          >
            <option value="">All Segments</option>
            <option value="Accounting & Finance">Accounting & Finance</option>
            <option value="Statistics & Analytics">Statistics & Analytics</option>
            <option value="Computer Science & Data">Computer Science & Data</option>
            <option value="Business & Management">Business & Management</option>
            <option value="Mathematics">Mathematics</option>
            <option value="Languages & Humanities">Languages & Humanities</option>
          </select>
        </div>
      </div>

      {/* Books Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-3.5 px-4">Book Title & Author</th>
                <th className="py-3.5 px-4">Subject Segment</th>
                <th className="py-3.5 px-4">Available Copies</th>
                <th className="py-3.5 px-4">Shelf Rack</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    Loading library catalog...
                  </td>
                </tr>
              ) : books.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-400">
                    No books matching your criteria
                  </td>
                </tr>
              ) : (
                books.map((book) => (
                  <tr key={book.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 max-w-sm">
                      <div className="font-bold text-slate-900 text-sm">{book.title}</div>
                      <div className="text-slate-500 font-medium">by {book.author}</div>
                      {book.isbn && (
                        <div className="text-[10px] text-slate-400 font-mono">ISBN: {book.isbn}</div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800">{book.segment}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                          book.availableCopies > 0
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {book.availableCopies > 0 ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" /> {book.availableCopies} of {book.totalCopies} Available
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" /> All {book.totalCopies} Issued
                          </>
                        )}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">
                        {book.shelfLocation || 'Unassigned'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenDetail(book)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-900 font-bold rounded-lg transition border border-blue-200 flex items-center gap-1"
                        >
                          <Users className="w-3.5 h-3.5" />
                          <span>View Holders ({book.totalCopies - book.availableCopies})</span>
                        </button>

                        <button
                          onClick={() => {
                            setSelectedBook(book);
                            setIsFacultyBorrowModalOpen(true);
                          }}
                          disabled={book.availableCopies <= 0}
                          className={`px-3 py-1.5 rounded-lg font-bold transition ${
                            book.availableCopies > 0
                              ? 'bg-slate-900 hover:bg-slate-800 text-white'
                              : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          Borrow
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Book Detail & Active Holders Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Copy Status: ${bookDetail?.title || ''}`}
        maxWidth="2xl"
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-slate-500">Author: <strong>{bookDetail?.author}</strong></p>
              <p className="text-slate-500">Segment: <strong>{bookDetail?.segment}</strong></p>
            </div>
            <div className="text-right">
              <span className="font-bold text-slate-800">
                {bookDetail?.availableCopies} of {bookDetail?.totalCopies} Copies Free
              </span>
              <p className="text-slate-400 font-mono">Location: {bookDetail?.shelfLocation}</p>
            </div>
          </div>

          <h4 className="font-bold text-slate-900 text-sm">Physical Copies Breakdown:</h4>

          <div className="space-y-2 max-h-80 overflow-y-auto">
            {bookDetail?.copies?.map((copy) => {
              const activeLending = copy.lendings && copy.lendings.length > 0 ? copy.lendings[0] : null;

              return (
                <div
                  key={copy.id}
                  className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-8 w-8 rounded-lg bg-slate-100 text-slate-800 font-black flex items-center justify-center font-mono">
                      #{copy.copyNumber}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            copy.status === 'AVAILABLE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {copy.status}
                        </span>
                        {copy.barcode && (
                          <span className="text-[10px] text-slate-400 font-mono">{copy.barcode}</span>
                        )}
                      </div>

                      {activeLending ? (
                        <div className="mt-1 text-slate-700 font-medium">
                          Held by: <strong className="text-slate-900">{activeLending.user?.name}</strong>{' '}
                          {activeLending.user?.rollNumber && (
                            <span className="font-mono text-[11px] text-slate-500">
                              ({activeLending.user.rollNumber})
                            </span>
                          )}
                          <div className="text-[10px] text-slate-400">
                            Due on: {new Date(activeLending.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-emerald-600 font-semibold text-[11px]">
                          Available on shelf for immediate lending
                        </div>
                      )}
                    </div>
                  </div>

                  {activeLending && (
                    <button
                      onClick={() => {
                        setTargetLending(activeLending);
                        setIsReturnModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg font-bold text-xs transition flex items-center gap-1"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Request Return</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-2 flex justify-end">
            <button
              onClick={() => setIsDetailModalOpen(false)}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Return Request Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => setIsReturnModalOpen(false)}
        title={`Request Return from ${targetLending?.user?.name || 'Student'}`}
        maxWidth="md"
      >
        <form onSubmit={handleSendReturnRequest} className="space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Send an urgent notification to{' '}
            <strong>{targetLending?.user?.name}</strong> (Roll: {targetLending?.user?.rollNumber}) to return this book for your upcoming lecture / syllabus reference.
          </p>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Reason / Note to Student</label>
            <textarea
              required
              rows={3}
              value={returnMessage}
              onChange={(e) => setReturnMessage(e.target.value)}
              placeholder="e.g. Urgently required for Unit-3 lecture discussion on Thursday."
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsReturnModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl"
            >
              Send Return Request
            </button>
          </div>
        </form>
      </Modal>

      {/* Faculty Borrow Modal */}
      <Modal
        isOpen={isFacultyBorrowModalOpen}
        onClose={() => setIsFacultyBorrowModalOpen(false)}
        title={`Faculty Borrow: ${selectedBook?.title || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleFacultyBorrow} className="space-y-4 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">Purpose / Course Subject</label>
            <input
              type="text"
              required
              value={borrowMessage}
              onChange={(e) => setBorrowMessage(e.target.value)}
              placeholder="e.g. Teaching reference for B.Com Sem 4 Corporate Accounting"
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsFacultyBorrowModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl"
            >
              Submit Faculty Request
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TeacherBrowseBooks;
