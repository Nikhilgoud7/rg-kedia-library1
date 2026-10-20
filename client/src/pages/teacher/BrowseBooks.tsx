import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../lib/api';
import { Book, Lending } from '../../types';
import Modal from '../../components/common/Modal';
import {
  Search,
  BookOpen,
  Users,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  MapPin,
  Send,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  AlertCircle,
  Loader2,
  FilterX,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const TeacherBrowseBooks: React.FC = () => {
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Catalog State
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const [page, setPage] = useState<number>(1);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
  });

  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

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
  const [submittingBorrow, setSubmittingBorrow] = useState(false);

  const fetchBooks = useCallback(
    async (targetPage: number, searchVal: string) => {
      const currentRequestId = ++requestIdRef.current;
      try {
        setLoading(true);
        setFetchError(null);
        const res = await api.get('/books', {
          params: {
            search: searchVal.trim() || undefined,
            program: selectedProgram || undefined,
            branch: selectedBranch || undefined,
            segment: selectedSegment || undefined,
            category: selectedCategory || undefined,
            page: targetPage,
            limit: 12,
          },
        });

        if (currentRequestId !== requestIdRef.current || !isMountedRef.current) return;

        setBooks(res.data.books || []);
        if (res.data.pagination) {
          setPagination(res.data.pagination);
        }
      } catch (err: any) {
        if (currentRequestId !== requestIdRef.current || !isMountedRef.current) return;
        console.error('Fetch books error:', err);
        setFetchError('Failed to load library catalog. Please check your connection and try again.');
        toast.error('Failed to fetch library books');
      } finally {
        if (currentRequestId === requestIdRef.current && isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [selectedProgram, selectedBranch, selectedSegment, selectedCategory]
  );

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Fetch when page, appliedSearch, or filters change
  useEffect(() => {
    fetchBooks(page, appliedSearch);
  }, [fetchBooks, page, appliedSearch]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search);
  };

  const handleFilterChange = (setter: (val: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > pagination.totalPages) return;
    setPage(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleClearAllFilters = () => {
    setSearch('');
    setAppliedSearch('');
    setSelectedProgram('');
    setSelectedBranch('');
    setSelectedSegment('');
    setSelectedCategory('');
    setPage(1);
  };

  const isAnyFilterActive =
    appliedSearch || selectedProgram || selectedBranch || selectedSegment || selectedCategory;

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
      setSubmittingBorrow(true);
      await api.post('/lending/request-borrow', {
        bookId: selectedBook.id,
        message: `Faculty Reference: ${borrowMessage}`,
      });
      toast.success('Faculty borrow request submitted to librarian!');
      setIsFacultyBorrowModalOpen(false);
      setBorrowMessage('');
      fetchBooks(page, appliedSearch);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to request book');
    } finally {
      if (isMountedRef.current) {
        setSubmittingBorrow(false);
      }
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
          <span>{loading ? 'Searching...' : `${pagination.total} Titles Found`}</span>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search books by title, author, subject, or ISBN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition disabled:opacity-50"
          >
            Search
          </button>
        </form>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Program filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Degree Program
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => {
                handleFilterChange(setSelectedProgram, e.target.value);
                setSelectedBranch('');
              }}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Programs</option>
              <option value="BCOM">B.Com (Bachelor of Commerce)</option>
              <option value="BBA">BBA (Business Administration)</option>
              <option value="BSC">B.Sc (Bachelor of Science)</option>
            </select>
          </div>

          {/* Branch filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Specific Branch
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => handleFilterChange(setSelectedBranch, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Branches</option>
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

          {/* Segment filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Subject Segment
            </label>
            <select
              value={selectedSegment}
              onChange={(e) => handleFilterChange(setSelectedSegment, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Subject Segments</option>
              <option value="Accounting & Finance">Accounting & Finance</option>
              <option value="Statistics & Analytics">Statistics & Analytics</option>
              <option value="Computer Science & Data">Computer Science & Data</option>
              <option value="Business & Management">Business & Management</option>
              <option value="Mathematics">Mathematics</option>
              <option value="Languages & Humanities">Languages & Humanities</option>
            </select>
          </div>

          {/* Category filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Book Type
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => handleFilterChange(setSelectedCategory, e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="">All Book Types</option>
              <option value="TEXTBOOK">Standard Textbook</option>
              <option value="REFERENCE">Reference Guide</option>
              <option value="LANGUAGE">Second Language Reader</option>
              <option value="GENERAL">General Reading</option>
            </select>
          </div>
        </div>

        {/* Clear All Filters Button */}
        {isAnyFilterActive && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleClearAllFilters}
              className="text-xs font-bold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Clear All Filters</span>
            </button>
          </div>
        )}
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="p-8 text-center bg-white rounded-2xl border border-red-200 shadow-xs space-y-3">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
          <h3 className="text-base font-bold text-slate-800">Could not load catalog</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">{fetchError}</p>
          <button
            onClick={() => fetchBooks(page, appliedSearch)}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {/* Books Table */}
      {!fetchError && (
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
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        <span>Loading library catalog...</span>
                      </div>
                    </td>
                  </tr>
                ) : books.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-400">
                      <div className="space-y-2">
                        <p className="font-semibold text-slate-600">No books matching your criteria</p>
                        {isAnyFilterActive && (
                          <button
                            onClick={handleClearAllFilters}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs inline-flex items-center gap-1 transition"
                          >
                            <FilterX className="w-3 h-3" />
                            <span>Clear Filters</span>
                          </button>
                        )}
                      </div>
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
                            <span>
                              View Holders (
                              {book.copies
                                ? book.copies.filter((c: any) => c.status === 'ISSUED').length
                                : Math.max(0, book.totalCopies - book.availableCopies)}
                              )
                            </span>
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
      )}

      {/* Pagination Controls */}
      {!fetchError && !loading && pagination.totalPages > 1 && (
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <span className="text-slate-500 font-medium">
            Showing Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong> ({pagination.total} total books)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="px-3 py-2 bg-slate-50 font-mono text-slate-700 font-bold rounded-xl border border-slate-200">
              {pagination.page} / {pagination.totalPages}
            </span>

            <button
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
                              : copy.status === 'ISSUED'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : copy.status === 'DAMAGED'
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : copy.status === 'LOST'
                              ? 'bg-red-50 text-red-700 border border-red-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {copy.status}
                        </span>
                        {copy.barcode && (
                          <span className="text-[10px] text-slate-500 font-mono font-medium">{copy.barcode}</span>
                        )}
                        {copy.shelfLocation && (
                          <span className="text-[10px] text-slate-400">Rack: {copy.shelfLocation}</span>
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
                      ) : copy.status === 'AVAILABLE' ? (
                        <div className="mt-0.5 text-emerald-600 font-semibold text-[11px]">
                          Available on shelf for immediate lending
                        </div>
                      ) : copy.status === 'DAMAGED' ? (
                        <div className="mt-0.5 text-rose-600 font-semibold text-[11px]">
                          Damaged ({copy.condition || 'Damaged'}) — unavailable for checkout
                        </div>
                      ) : copy.status === 'LOST' ? (
                        <div className="mt-0.5 text-slate-500 font-semibold text-[11px]">
                          Reported lost — unavailable for checkout
                        </div>
                      ) : copy.status === 'WITHDRAWN' ? (
                        <div className="mt-0.5 text-slate-400 font-semibold text-[11px]">
                          Withdrawn from circulation
                        </div>
                      ) : (
                        <div className="mt-0.5 text-slate-500 font-semibold text-[11px]">
                          Status: {copy.status}
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
        onClose={() => !submittingBorrow && setIsFacultyBorrowModalOpen(false)}
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
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={submittingBorrow}
              onClick={() => setIsFacultyBorrowModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingBorrow}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              {submittingBorrow && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingBorrow ? 'Submitting...' : 'Submit Faculty Request'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TeacherBrowseBooks;
