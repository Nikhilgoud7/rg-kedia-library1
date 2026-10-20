import React, { useState, useEffect, useCallback } from 'react';
import api from '../../lib/api';
import { Lending } from '../../types';
import Modal from '../../components/common/Modal';
import {
  CheckSquare,
  AlertTriangle,
  Search,
  Check,
  RotateCcw,
  Clock,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  User,
  ShieldCheck,
  AlertCircle,
  QrCode,
  Barcode,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const IssuedBooks: React.FC = () => {
  const [lendings, setLendings] = useState<Lending[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'OVERDUE'>('ALL');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Pagination state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Return modal state
  const [selectedReturnLending, setSelectedReturnLending] = useState<Lending | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [returnResolution, setReturnResolution] = useState<'RETURNED' | 'DAMAGED' | 'LOST'>('RETURNED');
  const [returnCondition, setReturnCondition] = useState('Damaged');
  const [returnNotes, setReturnNotes] = useState('');

  const fetchLendings = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
      };

      if (filter === 'OVERDUE') {
        params.overdueOnly = 'true';
      }

      if (search.trim()) {
        params.search = search.trim();
      }

      const res = await api.get('/lending/all', { params });
      setLendings(res.data.lendings || []);

      if (res.data.pagination) {
        setTotal(res.data.pagination.total);
        setTotalPages(res.data.pagination.totalPages || 1);
      } else {
        setTotal(res.data.lendings?.length || 0);
        setTotalPages(1);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to load lendings');
    } finally {
      setLoading(false);
    }
  }, [page, limit, filter, search]);

  useEffect(() => {
    fetchLendings();
  }, [fetchLendings]);

  const handleReturnConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReturnLending) return;
    try {
      setIsProcessingReturn(true);
      const payload: any = {
        resolution: returnResolution,
      };
      if (returnResolution === 'DAMAGED') {
        payload.condition = returnCondition;
      }
      if (returnNotes.trim()) {
        payload.notes = returnNotes.trim();
      }
      await api.post(`/lending/return/${selectedReturnLending.id}`, payload);

      const title = selectedReturnLending.bookCopy?.book?.title || 'Book';
      if (returnResolution === 'LOST') {
        toast.success(`Book "${title}" recorded as LOST (Zero fine applied).`);
      } else if (returnResolution === 'DAMAGED') {
        toast.success(`Book "${title}" recorded as DAMAGED (Zero fine applied).`);
      } else {
        toast.success(`Book "${title}" returned and copy marked AVAILABLE!`);
      }
      setIsReturnModalOpen(false);
      setSelectedReturnLending(null);
      fetchLendings();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process return');
    } finally {
      setIsProcessingReturn(false);
    }
  };

  // Barcode return modal state
  const [isBarcodeModalOpen, setIsBarcodeModalOpen] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
  const [scannedData, setScannedData] = useState<any | null>(null);
  const [barcodeResolution, setBarcodeResolution] = useState<'RETURNED' | 'DAMAGED' | 'LOST'>('RETURNED');
  const [barcodeCondition, setBarcodeCondition] = useState('Damaged');
  const [barcodeNotes, setBarcodeNotes] = useState('');
  const [isSubmittingBarcodeReturn, setIsSubmittingBarcodeReturn] = useState(false);

  const handleBarcodeLookup = async (codeToLookup?: string) => {
    const code = (codeToLookup || barcodeInput).trim();
    if (!code) {
      toast.error('Please enter or scan a barcode.');
      return;
    }
    try {
      setLookingUpBarcode(true);
      const res = await api.get(`/lending/lookup-barcode/${encodeURIComponent(code)}`);
      setScannedData(res.data);
      if (!res.data.activeLending) {
        toast.error(`Copy (${code}) has no active issued loan (Status: ${res.data.copy?.status}).`, { duration: 4000 });
      } else {
        toast.success(`Active loan found for "${res.data.copy?.book?.title}"!`);
      }
    } catch (err: any) {
      setScannedData(null);
      toast.error(err.response?.data?.error || `Barcode "${code}" not found.`);
    } finally {
      setLookingUpBarcode(false);
    }
  };

  const handleBarcodeReturnConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedData?.copy?.barcode) return;
    try {
      setIsSubmittingBarcodeReturn(true);
      const payload: any = {
        barcode: scannedData.copy.barcode,
        resolution: barcodeResolution,
      };
      if (barcodeResolution === 'DAMAGED') {
        payload.condition = barcodeCondition;
      }
      if (barcodeNotes.trim()) {
        payload.notes = barcodeNotes.trim();
      }
      const res = await api.post('/lending/return-by-barcode', payload);
      toast.success(res.data.message || 'Book returned successfully!');
      setIsBarcodeModalOpen(false);
      setScannedData(null);
      setBarcodeInput('');
      fetchLendings();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to process return by barcode.');
    } finally {
      setIsSubmittingBarcodeReturn(false);
    }
  };

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
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => {
              setIsBarcodeModalOpen(true);
              setBarcodeInput('');
              setScannedData(null);
              setBarcodeResolution('RETURNED');
              setBarcodeCondition('Damaged');
              setBarcodeNotes('');
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs transition shadow-xs flex items-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            <span>Return by Barcode</span>
          </button>

          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => {
                setFilter('ALL');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                filter === 'ALL'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Active
            </button>
            <button
              onClick={() => {
                setFilter('OVERDUE');
                setPage(1);
              }}
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
      </div>

      {/* Search Filter */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search active records by book title, student/teacher name, roll number, or copy barcode..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
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
                <th className="py-3.5 px-4">Overdue Status</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mb-2"></div>
                    <p className="text-xs font-medium">Loading issued records...</p>
                  </td>
                </tr>
              ) : lendings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Check className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
                    <p className="font-bold text-slate-700">No active records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {filter === 'OVERDUE'
                        ? 'Great news! No books are currently overdue.'
                        : 'No book copies are currently checked out.'}
                    </p>
                  </td>
                </tr>
              ) : (
                lendings.map((l) => {
                  const now = new Date();
                  const dueDate = new Date(l.dueDate);
                  const isOverdue = now > dueDate;
                  const daysOverdue = isOverdue
                    ? Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
                    : 0;

                  return (
                    <tr key={l.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="font-bold text-slate-900 text-sm">
                          {l.bookCopy?.book?.title || 'Book Title'}
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          by {l.bookCopy?.book?.author}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5 flex items-center gap-1.5 flex-wrap">
                          <span>Copy #{l.bookCopy?.copyNumber}</span>
                          {l.bookCopy?.barcode && (
                            <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-bold border border-slate-200">
                              {l.bookCopy.barcode}
                            </span>
                          )}
                          {l.bookCopy?.shelfLocation && (
                            <span className="text-slate-400">Rack: {l.bookCopy.shelfLocation}</span>
                          )}
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
                        <span
                          className={`font-semibold ${
                            isOverdue ? 'text-red-600 font-bold' : 'text-slate-800'
                          }`}
                        >
                          {dueDate.toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isOverdue ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-200">
                              <AlertTriangle className="w-3 h-3 text-red-500" />
                              {daysOverdue} Days Late
                            </span>
                            <span className="block text-[10px] text-slate-400 mt-0.5">
                              No monetary fine
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
                          onClick={() => {
                            setSelectedReturnLending(l);
                            setReturnResolution('RETURNED');
                            setReturnCondition('Damaged');
                            setReturnNotes('');
                            setIsReturnModalOpen(true);
                          }}
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

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-500">
              Showing Page <strong className="text-slate-900">{page}</strong> of{' '}
              <strong className="text-slate-900">{totalPages}</strong> ({total} total active loans)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition shadow-2xs"
                title="Previous Page"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <span className="font-bold text-slate-700 px-2">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-xl bg-white border border-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-100 transition shadow-2xs"
                title="Next Page"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Return Confirmation Modal */}
      <Modal
        isOpen={isReturnModalOpen}
        onClose={() => {
          setIsReturnModalOpen(false);
          setSelectedReturnLending(null);
        }}
        title={
          returnResolution === 'RETURNED'
            ? 'Process Book Return'
            : returnResolution === 'DAMAGED'
            ? 'Settle as Damaged Book'
            : 'Settle as Lost Book'
        }
        maxWidth="md"
      >
        {selectedReturnLending && (
          <form onSubmit={handleReturnConfirm} className="space-y-4 text-xs">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <div className="flex items-start gap-2">
                <BookOpen className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <h4 className="font-bold text-slate-900 text-sm">
                    {selectedReturnLending.bookCopy?.book?.title}
                  </h4>
                  <p className="text-slate-500 text-[11px]">
                    by {selectedReturnLending.bookCopy?.book?.author}
                  </p>
                  <p className="text-slate-400 text-[10px] font-mono mt-0.5">
                    Physical Copy #{selectedReturnLending.bookCopy?.copyNumber}
                  </p>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center gap-2">
                <User className="w-4 h-4 text-slate-400 shrink-0" />
                <div>
                  <span className="font-bold text-slate-800">
                    {selectedReturnLending.user?.name}
                  </span>
                  {selectedReturnLending.user?.rollNumber && (
                    <span className="text-slate-500 text-[11px] font-mono ml-1">
                      ({selectedReturnLending.user.rollNumber})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Resolution Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Return Resolution
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setReturnResolution('RETURNED')}
                  className={`p-2.5 rounded-xl border text-center transition font-bold flex flex-col items-center gap-1 ${
                    returnResolution === 'RETURNED'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <RotateCcw className="w-4 h-4 text-emerald-600" />
                  <span>Normal Return</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReturnResolution('DAMAGED')}
                  className={`p-2.5 rounded-xl border text-center transition font-bold flex flex-col items-center gap-1 ${
                    returnResolution === 'DAMAGED'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Mark Damaged</span>
                </button>
                <button
                  type="button"
                  onClick={() => setReturnResolution('LOST')}
                  className={`p-2.5 rounded-xl border text-center transition font-bold flex flex-col items-center gap-1 ${
                    returnResolution === 'LOST'
                      ? 'bg-red-50 border-red-500 text-red-800 ring-2 ring-red-500/20'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <AlertCircle className="w-4 h-4 text-red-600" />
                  <span>Mark Lost</span>
                </button>
              </div>
            </div>

            {/* Condition selector if damaged */}
            {returnResolution === 'DAMAGED' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Condition Rating
                </label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  <option value="Damaged">Damaged (Requires repair/evaluation)</option>
                  <option value="Poor">Poor (Significant wear/damage)</option>
                  <option value="Fair">Fair (Noticeable wear)</option>
                  <option value="Good">Good (Minor wear)</option>
                </select>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Settlement Notes (Optional)
              </label>
              <textarea
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="Reason or notes (e.g., water damage on pages 10-25, reported lost during transit)..."
                maxLength={500}
                rows={2}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            {/* Status / Policy Notice */}
            {returnResolution === 'RETURNED' ? (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Processing this return will restore the physical copy to <strong>AVAILABLE</strong>{' '}
                  and safely increment catalog inventory.
                </span>
              </div>
            ) : (
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Zero-Fine Policy Applied</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Under college policy, no monetary fines are assessed for lost or damaged books.
                  This will settle the loan record and mark the physical copy as{' '}
                  <strong>{returnResolution}</strong>.
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isProcessingReturn}
                onClick={() => {
                  setIsReturnModalOpen(false);
                  setSelectedReturnLending(null);
                }}
                className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessingReturn}
                className={`px-4 py-2 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5 ${
                  returnResolution === 'RETURNED'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : returnResolution === 'DAMAGED'
                    ? 'bg-amber-600 hover:bg-amber-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                <Check className="w-4 h-4" />
                {isProcessingReturn
                  ? 'Processing...'
                  : returnResolution === 'RETURNED'
                  ? 'Confirm Return'
                  : returnResolution === 'DAMAGED'
                  ? 'Confirm Damaged Return'
                  : 'Confirm Lost Settlement'}
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* Barcode Quick Return Modal */}
      <Modal
        isOpen={isBarcodeModalOpen}
        onClose={() => {
          if (!isSubmittingBarcodeReturn) {
            setIsBarcodeModalOpen(false);
            setScannedData(null);
            setBarcodeInput('');
          }
        }}
        title="Circulation Desk — Return by Barcode"
        maxWidth="lg"
      >
        <div className="space-y-4 text-xs">
          {/* Barcode Scan / Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleBarcodeLookup();
            }}
            className="flex items-center gap-2"
          >
            <div className="relative flex-1">
              <QrCode className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                autoFocus
                placeholder="Scan or enter barcode (e.g. BC-101)..."
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 text-xs font-mono rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:outline-hidden"
              />
            </div>
            <button
              type="submit"
              disabled={lookingUpBarcode || !barcodeInput.trim()}
              className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl font-bold transition flex items-center gap-1.5"
            >
              {lookingUpBarcode ? 'Searching...' : 'Lookup'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Scanned Copy & Loan Details */}
          {scannedData && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">{scannedData.copy?.book?.title}</h4>
                  <p className="text-slate-500 text-[11px]">by {scannedData.copy?.book?.author}</p>
                </div>
                <span className="font-mono text-[11px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                  {scannedData.copy?.barcode}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-white p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-400 block">Copy Number:</span>
                  <span className="font-bold text-slate-800">Copy #{scannedData.copy?.copyNumber}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Shelf Location:</span>
                  <span className="font-bold text-slate-800">{scannedData.copy?.shelfLocation || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Physical Condition:</span>
                  <span className="font-bold text-slate-800">{scannedData.copy?.condition || 'Good'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Current Status:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded-full inline-block text-[10px] ${
                      scannedData.copy?.status === 'ISSUED'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : scannedData.copy?.status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {scannedData.copy?.status}
                  </span>
                </div>
              </div>

              {/* Active Loan Details */}
              {scannedData.activeLending ? (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-blue-900 font-bold">
                    <span>Active Loan Information</span>
                    <span className="text-[10px] text-blue-700 font-mono">
                      Due: {new Date(scannedData.activeLending.dueDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-blue-800">
                    <div>
                      Borrower: <strong>{scannedData.activeLending.borrower?.name}</strong>{' '}
                      {scannedData.activeLending.borrower?.rollNumber && (
                        <span className="font-mono">({scannedData.activeLending.borrower.rollNumber})</span>
                      )}
                    </div>
                    <div className="text-[10px] text-blue-600">
                      {scannedData.activeLending.borrower?.program} {scannedData.activeLending.borrower?.branch} • {scannedData.activeLending.borrower?.email}
                    </div>
                  </div>

                  {/* Return Settlement Form */}
                  <form onSubmit={handleBarcodeReturnConfirm} className="space-y-3 pt-2 border-t border-blue-200/60">
                    <div>
                      <label className="block font-bold text-slate-800 mb-1">
                        Return Action / Resolution
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => setBarcodeResolution('RETURNED')}
                          className={`py-2 px-2.5 rounded-xl border text-center font-bold text-xs transition ${
                            barcodeResolution === 'RETURNED'
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Normal Return
                        </button>
                        <button
                          type="button"
                          onClick={() => setBarcodeResolution('DAMAGED')}
                          className={`py-2 px-2.5 rounded-xl border text-center font-bold text-xs transition ${
                            barcodeResolution === 'DAMAGED'
                              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Damaged
                        </button>
                        <button
                          type="button"
                          onClick={() => setBarcodeResolution('LOST')}
                          className={`py-2 px-2.5 rounded-xl border text-center font-bold text-xs transition ${
                            barcodeResolution === 'LOST'
                              ? 'bg-red-600 text-white border-red-600 shadow-xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Reported Lost
                        </button>
                      </div>
                    </div>

                    {barcodeResolution === 'DAMAGED' && (
                      <div>
                        <label className="block font-bold text-slate-700 mb-1">
                          Condition Assessment
                        </label>
                        <select
                          value={barcodeCondition}
                          onChange={(e) => setBarcodeCondition(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-amber-500"
                        >
                          <option value="Damaged">Damaged (General damage)</option>
                          <option value="Poor">Poor (Heavily worn/torn)</option>
                          <option value="Fair">Fair (Minor tear/writing)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Circulation Notes (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Scanned at front counter, spine intact"
                        value={barcodeNotes}
                        onChange={(e) => setBarcodeNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="pt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingBarcodeReturn}
                        onClick={() => {
                          setIsBarcodeModalOpen(false);
                          setScannedData(null);
                          setBarcodeInput('');
                        }}
                        className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingBarcodeReturn}
                        className={`px-4 py-2 text-white rounded-xl font-bold transition shadow-xs flex items-center gap-1.5 ${
                          barcodeResolution === 'RETURNED'
                            ? 'bg-emerald-600 hover:bg-emerald-700'
                            : barcodeResolution === 'DAMAGED'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        {isSubmittingBarcodeReturn
                          ? 'Processing...'
                          : barcodeResolution === 'RETURNED'
                          ? 'Confirm & Process Return'
                          : barcodeResolution === 'DAMAGED'
                          ? 'Confirm Damaged Return'
                          : 'Confirm Lost Settlement'}
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-[11px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    This copy is currently <strong>{scannedData.copy?.status}</strong> and has no active loan to return.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default IssuedBooks;
