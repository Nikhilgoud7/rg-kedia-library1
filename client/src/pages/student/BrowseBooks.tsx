import React, { useState, useEffect, useId, useRef, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Book } from '../../types';
import BookCard from '../../components/common/BookCard';
import Modal from '../../components/common/Modal';
import {
  Search,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  RefreshCcw,
  AlertCircle,
  Loader2,
  X,
  FilterX,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PaginationData {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const BrowseBooks: React.FC = () => {
  const { user } = useAuth();
  const requestIdRef = useRef(0);
  const isMountedRef = useRef(true);

  // Accessible element IDs
  const searchInputId = useId();
  const programSelectId = useId();
  const branchSelectId = useId();
  const segmentSelectId = useId();
  const categorySelectId = useId();
  const purposeTextareaId = useId();

  // Catalog State
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>(user?.program || '');
  const [selectedBranch, setSelectedBranch] = useState<string>(user?.branch || '');
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

  // Borrow Modal State
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowMessage, setBorrowMessage] = useState('');
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);
  const [submittingBorrow, setSubmittingBorrow] = useState(false);

  const isProfileFiltered =
    (user?.program && selectedProgram === user.program) ||
    (user?.branch && selectedBranch === user.branch);

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

  // Fetch when filters or page change
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

  const handleClearProfileFilterNote = () => {
    setSelectedProgram('');
    setSelectedBranch('');
    setPage(1);
  };

  const handleRequestBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    try {
      setSubmittingBorrow(true);
      await api.post('/lending/request-borrow', {
        bookId: selectedBook.id,
        message: borrowMessage.trim() || undefined,
      });
      toast.success('Borrow request submitted to librarian! You will receive a notification when ready for pickup.');
      if (isMountedRef.current) {
        setIsBorrowModalOpen(false);
        setBorrowMessage('');
        setSelectedBook(null);
      }
      fetchBooks(page, appliedSearch);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to request book';
      toast.error(errorMsg);
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
          <h1 className="text-2xl font-black text-slate-900">Library Book Catalog</h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse textbook copies, second language readers, and reference guides across all branches
          </p>
        </div>
        <div
          aria-live="polite"
          className="flex items-center gap-2 text-xs font-bold bg-amber-50 text-amber-900 px-3.5 py-2 rounded-xl border border-amber-200 self-start sm:self-auto"
        >
          <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{loading ? 'Searching...' : `${pagination.total} Titles Found`}</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Search Input Form */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <label htmlFor={searchInputId} className="sr-only">
              Search library books
            </label>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              id={searchInputId}
              type="text"
              aria-label="Search by book title, author name, subject, or ISBN"
              placeholder="Search by book title, author name, subject, or ISBN..."
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

        {/* Profile Filter Notice */}
        {isProfileFiltered && (
          <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/80 flex items-center justify-between gap-3 text-xs text-amber-900">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Filtered by your profile default: <strong>{selectedProgram}</strong>
                {selectedBranch ? ` (${selectedBranch})` : ''}
              </span>
            </div>
            <button
              onClick={handleClearProfileFilterNote}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-900 underline flex items-center gap-1 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
              Show All Programs
            </button>
          </div>
        )}

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Program filter */}
          <div>
            <label htmlFor={programSelectId} className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Degree Program
            </label>
            <select
              id={programSelectId}
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
            <label htmlFor={branchSelectId} className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Specific Branch
            </label>
            <select
              id={branchSelectId}
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
            <label htmlFor={segmentSelectId} className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Subject Segment
            </label>
            <select
              id={segmentSelectId}
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
            <label htmlFor={categorySelectId} className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Book Type
            </label>
            <select
              id={categorySelectId}
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

      {/* Books Grid */}
      {!fetchError && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
              <p className="text-xs font-semibold text-slate-600">Loading library books...</p>
            </div>
          ) : books.length === 0 ? (
            <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
              <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-800">No Books Found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                No catalog items match your search criteria or program filters. Try resetting filters to explore the full library stock.
              </p>
              <button
                onClick={handleClearAllFilters}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition inline-flex items-center gap-1.5"
              >
                <FilterX className="w-3.5 h-3.5" />
                <span>Clear All Filters</span>
              </button>
            </div>
          ) : (
            books.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                actionLabel="Request to Borrow"
                onAction={(b) => {
                  setSelectedBook(b);
                  setIsBorrowModalOpen(true);
                }}
              />
            ))
          )}
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

      {/* Borrow Request Modal */}
      <Modal
        isOpen={isBorrowModalOpen}
        onClose={() => !submittingBorrow && setIsBorrowModalOpen(false)}
        title={`Borrow Book Request: ${selectedBook?.title || ''}`}
        maxWidth="md"
      >
        <form onSubmit={handleRequestBorrow} className="space-y-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-1.5">
            <h4 className="font-bold text-slate-900 text-sm">{selectedBook?.title}</h4>
            <p className="text-slate-500">by {selectedBook?.author}</p>
            <div className="pt-2 flex items-center justify-between text-[11px]">
              <span className="font-semibold text-emerald-600">
                {selectedBook?.availableCopies} of {selectedBook?.totalCopies} Copies In Stock
              </span>
              <span className="font-mono text-slate-600 bg-white px-2 py-0.5 rounded border border-slate-200">
                {selectedBook?.shelfLocation}
              </span>
            </div>
          </div>

          <div>
            <label htmlFor={purposeTextareaId} className="block font-bold text-slate-700 mb-1">
              Purpose / Reason for Borrowing (Optional)
            </label>
            <textarea
              id={purposeTextareaId}
              rows={3}
              value={borrowMessage}
              onChange={(e) => setBorrowMessage(e.target.value)}
              placeholder="e.g. Preparing for upcoming semester exams / seminar presentation"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
            <strong>Standard Lending Policy:</strong> Books are issued for up to 30 days. Please return on or before the due date.
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submittingBorrow}
              onClick={() => setIsBorrowModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingBorrow}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition disabled:opacity-50 flex items-center gap-1.5"
            >
              {submittingBorrow && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{submittingBorrow ? 'Submitting Request...' : 'Submit Request to Librarian'}</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default BrowseBooks;
