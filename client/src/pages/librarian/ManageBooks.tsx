import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { Book, Program } from '../../types';
import Modal from '../../components/common/Modal';
import {
  Plus,
  Search,
  Trash2,
  Edit,
  BookOpen,
  MapPin,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  FileQuestion,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ManageBooks: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [search, setSearch] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [selectedSegment, setSelectedSegment] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalBooks, setTotalBooks] = useState(0);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCopiesModalOpen, setIsCopiesModalOpen] = useState(false);
  const [selectedBookForCopies, setSelectedBookForCopies] = useState<any | null>(null);
  const [currentBook, setCurrentBook] = useState<Book | null>(null);

  // Delete Confirmation Modal State
  const [bookToDelete, setBookToDelete] = useState<{ id: string; title: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State (Add)
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    edition: '',
    publicationYear: new Date().getFullYear(),
    category: 'TEXTBOOK',
    segment: 'Accounting & Finance',
    description: '',
    totalCopies: 5,
    shelfLocation: 'Rack A-1',
    programs: [{ program: 'BCOM', branch: 'General' }],
  });

  // Form State (Edit)
  const [editFormData, setEditFormData] = useState({
    title: '',
    author: '',
    isbn: '',
    publisher: '',
    edition: '',
    publicationYear: new Date().getFullYear(),
    category: 'TEXTBOOK',
    segment: 'Accounting & Finance',
    description: '',
    shelfLocation: 'Rack A-1',
  });

  const fetchBooks = async (targetPage = page) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/books', {
        params: {
          search: search.trim() || undefined,
          program: selectedProgram || undefined,
          segment: selectedSegment || undefined,
          page: String(targetPage),
          limit: String(limit),
        },
      });
      setBooks(res.data.books || []);
      if (res.data.pagination) {
        setPage(res.data.pagination.page);
        setTotalPages(res.data.pagination.totalPages);
        setTotalBooks(res.data.pagination.total);
      }
    } catch (err: any) {
      console.error('Fetch books error:', err);
      const msg = err.response?.data?.error || 'Failed to fetch books. Please check network connection.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
    fetchBooks(1);
  }, [selectedProgram, selectedSegment, limit]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchBooks(1);
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedProgram('');
    setSelectedSegment('');
    setPage(1);
  };

  const handleCreateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      await api.post('/books', formData);
      toast.success('Book created successfully with physical copies!');
      setIsAddModalOpen(false);
      fetchBooks(1);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to create book');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (b: Book) => {
    setCurrentBook(b);
    setEditFormData({
      title: b.title || '',
      author: b.author || '',
      isbn: b.isbn || '',
      publisher: b.publisher || '',
      edition: b.edition || '',
      publicationYear: b.publicationYear || new Date().getFullYear(),
      category: b.category || 'TEXTBOOK',
      segment: b.segment || 'Accounting & Finance',
      description: b.description || '',
      shelfLocation: b.shelfLocation || 'Rack A-1',
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBook) return;
    try {
      setIsSubmitting(true);
      await api.put(`/books/${currentBook.id}`, editFormData);
      toast.success('Book updated successfully');
      setIsEditModalOpen(false);
      fetchBooks(page);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to update book');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDeleteBook = async () => {
    if (!bookToDelete) return;
    try {
      setIsDeleting(true);
      await api.delete(`/books/${bookToDelete.id}`);
      toast.success(`"${bookToDelete.title}" deleted successfully`);
      setBookToDelete(null);
      fetchBooks(page);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete book');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Book Inventory Management</h1>
          <p className="text-xs text-slate-500 mt-1">
            Maintain college library book stock, shelf placements, and copy availability
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              title: '',
              author: '',
              isbn: '',
              publisher: '',
              edition: '',
              publicationYear: new Date().getFullYear(),
              category: 'TEXTBOOK',
              segment: 'Accounting & Finance',
              description: '',
              totalCopies: 5,
              shelfLocation: 'Rack A-1',
              programs: [{ program: 'BCOM', branch: 'General' }],
            });
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition"
          aria-label="Add New Book Title"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Book Title</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by title, author, ISBN, or subject..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
              aria-label="Search book inventory"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
            aria-label="Submit search"
          >
            Search
          </button>
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                fetchBooks(1);
              }}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Program filter */}
          <select
            value={selectedProgram}
            onChange={(e) => setSelectedProgram(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            aria-label="Filter by academic program"
          >
            <option value="">All Programs</option>
            <option value="BCOM">B.Com (All branches)</option>
            <option value="BBA">BBA</option>
            <option value="BSC">B.Sc</option>
          </select>

          {/* Segment filter */}
          <select
            value={selectedSegment}
            onChange={(e) => setSelectedSegment(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            aria-label="Filter by subject segment"
          >
            <option value="">All Segments</option>
            <option value="Accounting & Finance">Accounting & Finance</option>
            <option value="Statistics & Analytics">Statistics & Analytics</option>
            <option value="Computer Science & Data">Computer Science & Data</option>
            <option value="Business & Management">Business & Management</option>
            <option value="Mathematics">Mathematics</option>
            <option value="Languages & Humanities">Languages & Humanities</option>
          </select>

          {/* Items per page selector */}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
            aria-label="Items per page"
          >
            <option value={10}>10 / page</option>
            <option value={20}>20 / page</option>
            <option value={50}>50 / page</option>
          </select>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchBooks(page)}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold flex items-center gap-1 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Books Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs" aria-label="Book Inventory Catalog">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th scope="col" className="py-3.5 px-4">Book Details</th>
                <th scope="col" className="py-3.5 px-4">Segment & Category</th>
                <th scope="col" className="py-3.5 px-4">Copies (Avail / Total)</th>
                <th scope="col" className="py-3.5 px-4">Shelf Location</th>
                <th scope="col" className="py-3.5 px-4">Curriculum Mapping</th>
                <th scope="col" className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                // Skeleton loading rows
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded-md w-48 mb-2" />
                      <div className="h-3 bg-slate-100 rounded-md w-28" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded-md w-28 mb-1" />
                      <div className="h-3 bg-slate-100 rounded-md w-16" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-4 bg-slate-200 rounded-md w-16 mb-1" />
                      <div className="h-3 bg-slate-100 rounded-md w-24" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-6 bg-slate-100 rounded-md w-24" />
                    </td>
                    <td className="py-4 px-4">
                      <div className="h-5 bg-slate-100 rounded-md w-28" />
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="h-7 bg-slate-200 rounded-lg w-28 ml-auto" />
                    </td>
                  </tr>
                ))
              ) : books.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <div className="max-w-xs mx-auto space-y-3">
                      <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                        <FileQuestion className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-bold text-slate-800">No books found</p>
                      <p className="text-xs text-slate-500">
                        {search || selectedProgram || selectedSegment
                          ? 'No catalog items match your search or filter settings.'
                          : 'No book records currently in inventory.'}
                      </p>
                      {(search || selectedProgram || selectedSegment) && (
                        <button
                          onClick={handleClearFilters}
                          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                        >
                          Clear Search & Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                books.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="font-bold text-slate-900 text-sm leading-snug">{b.title}</div>
                      <div className="text-slate-500 mt-0.5 font-medium">by {b.author}</div>
                      {b.isbn && <div className="text-[10px] text-slate-400 font-mono mt-0.5">ISBN: {b.isbn}</div>}
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800 block">{b.segment}</span>
                      <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                        {b.category}
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`font-black text-sm ${
                            b.availableCopies > 0 ? 'text-emerald-600' : 'text-red-600'
                          }`}
                        >
                          {b.availableCopies}
                        </span>
                        <span className="text-slate-400">/</span>
                        <span className="font-bold text-slate-700">{b.totalCopies}</span>
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {b.totalCopies - b.availableCopies} currently issued
                      </span>
                    </td>

                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2 py-1 rounded-md">
                        <MapPin className="w-3 h-3 text-amber-500" />
                        {b.shelfLocation || 'Unassigned'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 max-w-xs">
                      <div className="flex flex-wrap gap-1">
                        {b.bookPrograms && b.bookPrograms.length > 0 ? (
                          b.bookPrograms.map((bp, i) => (
                            <span
                              key={i}
                              className="text-[10px] bg-slate-100 text-slate-700 font-semibold px-1.5 py-0.5 rounded"
                            >
                              {bp.program} {bp.branch ? `(${bp.branch})` : ''}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-slate-400">General Catalog</span>
                        )}
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(b)}
                          title="Edit Book Details"
                          aria-label={`Edit book ${b.title}`}
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const res = await api.get(`/books/${b.id}`);
                              setSelectedBookForCopies(res.data.book);
                              setIsCopiesModalOpen(true);
                            } catch (err) {
                              toast.error('Failed to load book copies');
                            }
                          }}
                          title="Manage Physical Copies"
                          aria-label={`Manage copies of ${b.title}`}
                          className="px-2.5 py-1 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition flex items-center gap-1"
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          <span>Copies ({b.totalCopies})</span>
                        </button>
                        <button
                          onClick={() => setBookToDelete({ id: b.id, title: b.title })}
                          title="Delete book"
                          aria-label={`Delete book ${b.title}`}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Server-Side Pagination Bar */}
        {!loading && totalBooks > 0 && (
          <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
            <span className="font-semibold">
              Showing <span className="font-bold text-slate-900">{books.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
              <span className="font-bold text-slate-900">{Math.min(page * limit, totalBooks)}</span> of{' '}
              <span className="font-bold text-slate-900">{totalBooks}</span> book titles
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchBooks(page - 1)}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="px-3 py-1 font-bold text-slate-800 bg-white border border-slate-200 rounded-lg">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => fetchBooks(page + 1)}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                aria-label="Next page"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Add Book Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Book to College Catalog"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateBook} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Book Title *</label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Cost Accounting"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Author(s) *</label>
              <input
                type="text"
                required
                value={formData.author}
                onChange={(e) => setFormData({ ...formData, author: e.target.value })}
                placeholder="e.g. S.P. Jain & K.L. Narang"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">ISBN Number</label>
              <input
                type="text"
                value={formData.isbn}
                onChange={(e) => setFormData({ ...formData, isbn: e.target.value })}
                placeholder="e.g. 978-9352994786"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Publisher</label>
              <input
                type="text"
                value={formData.publisher}
                onChange={(e) => setFormData({ ...formData, publisher: e.target.value })}
                placeholder="e.g. Kalyani Publishers"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Edition</label>
              <input
                type="text"
                value={formData.edition}
                onChange={(e) => setFormData({ ...formData, edition: e.target.value })}
                placeholder="e.g. 14th Edition"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Segment / Subject *</label>
              <select
                value={formData.segment}
                onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="Accounting & Finance">Accounting & Finance</option>
                <option value="Statistics & Analytics">Statistics & Analytics</option>
                <option value="Computer Science & Data">Computer Science & Data</option>
                <option value="Business & Management">Business & Management</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Languages & Humanities">Languages & Humanities</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="TEXTBOOK">Textbook</option>
                <option value="REFERENCE">Reference Guide</option>
                <option value="GENERAL">General Reading</option>
                <option value="LANGUAGE">Language Text</option>
                <option value="JOURNAL">Research Journal</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Initial Physical Copies *</label>
              <input
                type="number"
                min="1"
                max="50"
                required
                value={formData.totalCopies}
                onChange={(e) => setFormData({ ...formData, totalCopies: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Shelf Location in Library</label>
              <input
                type="text"
                value={formData.shelfLocation}
                onChange={(e) => setFormData({ ...formData, shelfLocation: e.target.value })}
                placeholder="e.g. Rack A-3 (Commerce)"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Program & Branch Relevance</label>
              <select
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'BCOM_ALL') {
                    setFormData({ ...formData, programs: [{ program: 'BCOM', branch: 'General' }, { program: 'BCOM', branch: 'Computer Applications' }] });
                  } else if (val === 'BBA') {
                    setFormData({ ...formData, programs: [{ program: 'BBA', branch: 'General Business Administration' }] });
                  } else if (val === 'BSC') {
                    setFormData({ ...formData, programs: [{ program: 'BSC', branch: 'Computer Science & Data' }] });
                  }
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                <option value="BCOM_ALL">B.Com (Commerce / Comp App / Analytics)</option>
                <option value="BBA">BBA (Business Administration)</option>
                <option value="BSC">B.Sc (Maths / Stats / CS)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Syllabus Overview / Notes</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief syllabus units covered in this textbook..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save & Generate Copies'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Book Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Book Title — ${currentBook?.title || ''}`}
        maxWidth="2xl"
      >
        <form onSubmit={handleUpdateBook} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Book Title *</label>
              <input
                type="text"
                required
                value={editFormData.title}
                onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Author(s) *</label>
              <input
                type="text"
                required
                value={editFormData.author}
                onChange={(e) => setEditFormData({ ...editFormData, author: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">ISBN Number</label>
              <input
                type="text"
                value={editFormData.isbn}
                onChange={(e) => setEditFormData({ ...editFormData, isbn: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Publisher</label>
              <input
                type="text"
                value={editFormData.publisher}
                onChange={(e) => setEditFormData({ ...editFormData, publisher: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Edition</label>
              <input
                type="text"
                value={editFormData.edition}
                onChange={(e) => setEditFormData({ ...editFormData, edition: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Segment / Subject *</label>
              <select
                value={editFormData.segment}
                onChange={(e) => setEditFormData({ ...editFormData, segment: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="Accounting & Finance">Accounting & Finance</option>
                <option value="Statistics & Analytics">Statistics & Analytics</option>
                <option value="Computer Science & Data">Computer Science & Data</option>
                <option value="Business & Management">Business & Management</option>
                <option value="Mathematics">Mathematics</option>
                <option value="Languages & Humanities">Languages & Humanities</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Category</label>
              <select
                value={editFormData.category}
                onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
              >
                <option value="TEXTBOOK">Textbook</option>
                <option value="REFERENCE">Reference Guide</option>
                <option value="GENERAL">General Reading</option>
                <option value="LANGUAGE">Language Text</option>
                <option value="JOURNAL">Research Journal</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Shelf Location</label>
              <input
                type="text"
                value={editFormData.shelfLocation}
                onChange={(e) => setEditFormData({ ...editFormData, shelfLocation: e.target.value })}
                placeholder="e.g. Rack B-2"
                className="w-full px-3 py-2 rounded-xl border border-slate-200"
              />
            </div>
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">Syllabus Overview / Notes</label>
            <textarea
              rows={3}
              value={editFormData.description}
              onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
              className="w-full px-3 py-2 rounded-xl border border-slate-200"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <Modal
          isOpen={true}
          onClose={() => setBookToDelete(null)}
          title="Confirm Book Deletion"
          maxWidth="md"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-red-900">Are you sure you want to delete this book?</p>
                <p className="text-red-700 mt-1 font-semibold">{bookToDelete.title}</p>
                <p className="text-red-600 mt-2 text-[11px] leading-relaxed">
                  All unissued physical copies will be permanently deleted. This operation cannot be undone if no active loans are outstanding.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBookToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 text-slate-700 hover:bg-slate-100 rounded-xl font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteBook}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl transition shadow-xs disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Physical Copies Management Modal */}
      {selectedBookForCopies && (
        <Modal
          isOpen={isCopiesModalOpen}
          onClose={() => {
            setIsCopiesModalOpen(false);
            setSelectedBookForCopies(null);
          }}
          title={`Physical Copies — ${selectedBookForCopies.title}`}
          maxWidth="3xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-slate-700 font-semibold">
              <div>
                Author: <span className="font-bold">{selectedBookForCopies.author}</span>
              </div>
              <div>
                Available Copies: <span className="font-extrabold text-emerald-600">{selectedBookForCopies.availableCopies}</span> / {selectedBookForCopies.totalCopies}
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden" aria-label="Book physical copies">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                  <tr>
                    <th scope="col" className="p-2.5">Copy #</th>
                    <th scope="col" className="p-2.5">Barcode</th>
                    <th scope="col" className="p-2.5">Condition</th>
                    <th scope="col" className="p-2.5">Status</th>
                    <th scope="col" className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selectedBookForCopies.copies?.map((copy: any) => (
                    <CopyRow
                      key={copy.id}
                      copy={copy}
                      bookId={selectedBookForCopies.id}
                      onUpdated={async () => {
                        fetchBooks(page);
                        const refreshed = await api.get(`/books/${selectedBookForCopies.id}`);
                        setSelectedBookForCopies(refreshed.data.book);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsCopiesModalOpen(false);
                  setSelectedBookForCopies(null);
                }}
                className="px-4 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

/** Row component for editing an individual physical copy */
const CopyRow: React.FC<{
  copy: any;
  bookId: string;
  onUpdated: () => void;
}> = ({ copy, onUpdated }) => {
  const [condition, setCondition] = useState(copy.condition || 'Good');
  const [status, setStatus] = useState(copy.status || 'AVAILABLE');
  const [barcode, setBarcode] = useState(copy.barcode || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put(`/books/copies/${copy.id}`, {
        condition,
        status,
        barcode,
      });
      toast.success(`Copy #${copy.copyNumber} updated successfully!`);
      onUpdated();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update copy');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="hover:bg-slate-50">
      <td className="p-2.5 font-bold text-slate-900">Copy #{copy.copyNumber}</td>
      <td className="p-2.5">
        <input
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Barcode (e.g. BC-1001)"
          className="w-32 px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono focus:ring-1 focus:ring-amber-500"
          aria-label={`Barcode for copy ${copy.copyNumber}`}
        />
      </td>
      <td className="p-2.5">
        <select
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white font-medium"
          aria-label={`Condition for copy ${copy.copyNumber}`}
        >
          <option value="Good">Good</option>
          <option value="Fair">Fair</option>
          <option value="Poor">Poor</option>
          <option value="Damaged">Damaged</option>
        </select>
      </td>
      <td className="p-2.5">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="px-2 py-1 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
          aria-label={`Status for copy ${copy.copyNumber}`}
        >
          <option value="AVAILABLE">AVAILABLE</option>
          <option value="ISSUED">ISSUED</option>
          <option value="RESERVED">RESERVED</option>
          <option value="LOST">LOST</option>
          <option value="DAMAGED">DAMAGED</option>
        </select>
      </td>
      <td className="p-2.5 text-right">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] rounded-lg transition disabled:opacity-50"
          aria-label={`Save copy ${copy.copyNumber}`}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </td>
    </tr>
  );
};

export default ManageBooks;
