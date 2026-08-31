import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Book, Program } from '../../types';
import BookCard from '../../components/common/BookCard';
import Modal from '../../components/common/Modal';
import { Search, Filter, BookOpen, CheckCircle, Tag, Layers, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export const BrowseBooks: React.FC = () => {
  const { user } = useAuth();
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>(user?.program || '');
  const [selectedBranch, setSelectedBranch] = useState<string>(user?.branch || '');
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Borrow Modal
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [borrowMessage, setBorrowMessage] = useState('');
  const [isBorrowModalOpen, setIsBorrowModalOpen] = useState(false);

  const fetchBooks = async () => {
    try {
      setLoading(true);
      const res = await api.get('/books', {
        params: {
          search: search || undefined,
          program: selectedProgram || undefined,
          branch: selectedBranch || undefined,
          segment: selectedSegment || undefined,
          category: selectedCategory || undefined,
        },
      });
      setBooks(res.data.books || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch library books');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, [selectedProgram, selectedBranch, selectedSegment, selectedCategory]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBooks();
  };

  const handleRequestBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBook) return;
    try {
      await api.post('/lending/request-borrow', {
        bookId: selectedBook.id,
        message: borrowMessage,
      });
      toast.success('Borrow request submitted to librarian! You will receive a notification when ready for pickup.');
      setIsBorrowModalOpen(false);
      setBorrowMessage('');
      setSelectedBook(null);
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
          <h1 className="text-2xl font-black text-slate-900">Library Book Catalog</h1>
          <p className="text-xs text-slate-500 mt-1">
            Browse textbook copies, second language readers, and reference guides across all branches
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold bg-amber-50 text-amber-900 px-3.5 py-2 rounded-xl border border-amber-200">
          <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
          <span>{books.length} Titles Found</span>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by book title, author name, subject, or ISBN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
          >
            Search
          </button>
        </form>

        {/* Filter Dropdowns */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          {/* Program filter */}
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Degree Program
            </label>
            <select
              value={selectedProgram}
              onChange={(e) => {
                setSelectedProgram(e.target.value);
                setSelectedBranch('');
              }}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
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
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
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
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
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
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
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

      {/* Books Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            Loading library books...
          </div>
        ) : books.length === 0 ? (
          <div className="col-span-full py-16 text-center bg-white rounded-2xl border border-slate-200">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-800">No Books Found</h3>
            <p className="text-xs text-slate-500 mt-1">Try broadening your search or adjusting your branch filters.</p>
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

      {/* Borrow Request Modal */}
      <Modal
        isOpen={isBorrowModalOpen}
        onClose={() => setIsBorrowModalOpen(false)}
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
            <label className="block font-bold text-slate-700 mb-1">
              Purpose / Reason for Borrowing (Optional)
            </label>
            <textarea
              rows={3}
              value={borrowMessage}
              onChange={(e) => setBorrowMessage(e.target.value)}
              placeholder="e.g. Preparing for upcoming semester exams / seminar presentation"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
            />
          </div>

          <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-900">
            <strong>Standard Lending Policy:</strong> Books are issued for up to 14 days. Please return on or before the due date to avoid ₹2/day overdue fees.
          </div>

          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsBorrowModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition"
            >
              Submit Request to Librarian
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default BrowseBooks;
