// client/src/components/librarian/BulkImportModal.tsx — Librarian Bulk Book Import Modal with Preview Grid & Confirmation Workflow

import React, { useState, useRef, useEffect, useMemo } from 'react';
import api from '../../lib/api';
import Modal from '../common/Modal';
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  Search,
  Filter,
  Check,
  Info,
  ShieldAlert,
  Database,
  Layers,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  parseCsv,
  preValidateCsvData,
  MAX_IMPORT_FILE_SIZE,
  RawCsvRow,
} from '../../lib/csvHelper';
import {
  BulkImportRowValidationError,
  BulkImportSummary,
  BulkImportDatabaseDuplicates,
  BulkImportExecutionResponse,
} from '../../types';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'upload' | 'preview' | 'confirm' | 'result';

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isValidatingServer, setIsValidatingServer] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  // Parsed and validated data
  const [rawRows, setRawRows] = useState<RawCsvRow[]>([]);
  const [clientErrors, setClientErrors] = useState<BulkImportRowValidationError[]>([]);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [dbDuplicates, setDbDuplicates] = useState<BulkImportDatabaseDuplicates | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Execution result
  const [executionResult, setExecutionResult] = useState<BulkImportExecutionResponse | null>(null);

  // Confirmation state
  const [confirmCheckbox, setConfirmCheckbox] = useState(false);

  // Table filtering & pagination
  const [filterMode, setFilterMode] = useState<'all' | 'valid' | 'invalid'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens or closes
  useEffect(() => {
    if (!isOpen) {
      setStep('upload');
      setFile(null);
      setFileContent('');
      setRawRows([]);
      setClientErrors([]);
      setSummary(null);
      setDbDuplicates(null);
      setServerError(null);
      setExecutionResult(null);
      setConfirmCheckbox(false);
      setFilterMode('all');
      setSearchQuery('');
      setCurrentPage(1);
    }
  }, [isOpen]);

  // Download official CSV template
  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get('/books/import/template', {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'rg_kedia_book_import_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Template downloaded successfully.');
    } catch (err: any) {
      console.error('Error downloading template:', err);
      toast.error('Failed to download import template.');
    }
  };

  // Process chosen or dropped file
  const processFile = async (selectedFile: File) => {
    setServerError(null);

    // 1. Validate extension
    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.csv')) {
      toast.error('Invalid file type. Only CSV files (.csv) are supported.');
      return;
    }

    // 2. Validate file size
    if (selectedFile.size > MAX_IMPORT_FILE_SIZE) {
      toast.error(
        `File size exceeds 5MB limit (${(selectedFile.size / (1024 * 1024)).toFixed(2)} MB). Please reduce file size.`
      );
      return;
    }

    setFile(selectedFile);
    setIsReadingFile(true);

    try {
      // In-memory reading
      const text = await selectedFile.text();
      setFileContent(text);

      if (!text.trim()) {
        toast.error('The selected CSV file is empty.');
        setIsReadingFile(false);
        return;
      }

      // Parse RFC 4180 CSV locally
      const parsed = parseCsv(text);
      if (parsed.length <= 1) {
        toast.error('CSV contains headers only or has no data rows.');
        setIsReadingFile(false);
        return;
      }

      const headers = parsed[0];
      const dataRows = parsed.slice(1);

      // Client-side pre-validation
      const { rawRows: parsedRawRows, errors, summary: initialSummary } = preValidateCsvData(
        headers,
        dataRows
      );
      setRawRows(parsedRawRows);
      setClientErrors(errors);
      setSummary(initialSummary);
      setStep('preview');

      // Trigger authoritative server-side validation & duplicate check
      validateWithServer(selectedFile, text);
    } catch (err: any) {
      console.error('Error processing CSV file:', err);
      toast.error('Failed to read and parse CSV file.');
    } finally {
      setIsReadingFile(false);
    }
  };

  // Call authoritative backend validation endpoint
  const validateWithServer = async (fileObj: File, textContent: string) => {
    setIsValidatingServer(true);
    setServerError(null);

    try {
      // Prefer FormData multipart upload matching production behavior
      const formData = new FormData();
      formData.append('file', fileObj);

      const res = await api.post('/books/import/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const { validation, databaseDuplicates } = res.data || {};
      if (validation) {
        if (Array.isArray(validation.errors)) {
          setClientErrors(validation.errors);
        }
        if (validation.summary) {
          setSummary(validation.summary);
        }
      }
      if (databaseDuplicates) {
        setDbDuplicates(databaseDuplicates);
      }
    } catch (err: any) {
      // Fallback: try JSON payload if multipart had network/proxy issue
      try {
        const jsonRes = await api.post('/books/import/validate', {
          csvContent: textContent,
        });
        const { validation, databaseDuplicates } = jsonRes.data || {};
        if (validation?.errors) setClientErrors(validation.errors);
        if (validation?.summary) setSummary(validation.summary);
        if (databaseDuplicates) setDbDuplicates(databaseDuplicates);
      } catch (fallbackErr: any) {
        console.error('Server validation error:', fallbackErr);
        const errMsg =
          fallbackErr.response?.data?.error ||
          err.response?.data?.error ||
          'Failed to validate file with the server.';
        setServerError(errMsg);
      }
    } finally {
      setIsValidatingServer(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  // Map of errors by row number
  const errorsByRow = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const err of clientErrors) {
      if (err.row > 0) {
        const list = map.get(err.row) || [];
        list.push(`${err.column}: ${err.message}`);
        map.set(err.row, list);
      }
    }

    // Include database duplicate ISBNs
    if (dbDuplicates?.existingIsbns) {
      for (const dup of dbDuplicates.existingIsbns) {
        if (dup.row > 0) {
          const list = map.get(dup.row) || [];
          list.push(
            `Database Conflict: ISBN "${dup.isbn}" already registered to book "${(dup as any).title || (dup as any).existingTitle || ''}"`
          );
          map.set(dup.row, list);
        }
      }
    }

    // Include database duplicate Barcodes
    if (dbDuplicates?.existingBarcodes) {
      for (const dup of dbDuplicates.existingBarcodes) {
        if (dup.row > 0) {
          const list = map.get(dup.row) || [];
          list.push(
            `Database Conflict: Barcode "${dup.barcode}" already registered on book "${(dup as any).bookTitle || (dup as any).existingBookTitle || ''}"`
          );
          map.set(dup.row, list);
        }
      }
    }

    return map;
  }, [clientErrors, dbDuplicates]);

  // Compute total validation issues count
  const totalIssueCount = useMemo(() => {
    let count = clientErrors.length;
    if (dbDuplicates?.existingIsbns) count += dbDuplicates.existingIsbns.length;
    if (dbDuplicates?.existingBarcodes) count += dbDuplicates.existingBarcodes.length;
    return count;
  }, [clientErrors, dbDuplicates]);

  const hasErrors = totalIssueCount > 0;

  // Filtered rows for the preview table
  const filteredRows = useMemo(() => {
    return rawRows.filter((r) => {
      const isRowInvalid = errorsByRow.has(r.rowNumber);

      if (filterMode === 'valid' && isRowInvalid) return false;
      if (filterMode === 'invalid' && !isRowInvalid) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          r.title.toLowerCase().includes(q) ||
          r.author.toLowerCase().includes(q) ||
          r.isbn.toLowerCase().includes(q) ||
          r.segment.toLowerCase().includes(q) ||
          r.barcodes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [rawRows, errorsByRow, filterMode, searchQuery]);

  // Paginated rows
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, currentPage, pageSize]);

  // Execute bulk import
  const handleExecuteImport = async () => {
    if (!file || !confirmCheckbox || isExecuting || hasErrors) {
      return;
    }

    setIsExecuting(true);
    setServerError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/books/import/execute', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      const data: BulkImportExecutionResponse = res.data;
      setExecutionResult(data);
      setStep('result');
      toast.success(data.message || 'Bulk book import completed successfully!');

      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      console.error('Import execution error:', err);
      const resData = err.response?.data;
      const errMsg =
        resData?.error || 'Server error occurred during transactional bulk book import.';
      setServerError(errMsg);

      if (resData?.databaseDuplicates) {
        setDbDuplicates(resData.databaseDuplicates);
      }
      if (resData?.validation?.errors) {
        setClientErrors(resData.validation.errors);
      }

      setStep('preview');
      toast.error(errMsg);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isExecuting ? () => {} : onClose}
      title={
        step === 'confirm'
          ? 'Confirm Bulk Book Catalog Import'
          : step === 'result'
          ? 'Bulk Book Import Results'
          : 'Bulk Book Catalog Import (CSV)'
      }
      maxWidth="6xl"
    >
      <div className="space-y-4">
        {/* Navigation Step Indicators */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${
                step === 'upload'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-200'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              1
            </span>
            <span className={step === 'upload' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Upload File
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-slate-300 mx-1" />

            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${
                step === 'preview'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-200'
                  : step === 'confirm' || step === 'result'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              2
            </span>
            <span className={step === 'preview' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Validate & Preview
            </span>

            <ArrowRight className="w-3.5 h-3.5 text-slate-300 mx-1" />

            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full font-bold ${
                step === 'confirm'
                  ? 'bg-amber-500 text-slate-950 ring-2 ring-amber-200'
                  : step === 'result'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              3
            </span>
            <span className={step === 'confirm' ? 'font-bold text-slate-900' : 'text-slate-500'}>
              Confirm Import
            </span>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            title="Download blank sample spreadsheet template (.csv)"
            aria-label="Download Sample CSV Template"
          >
            <Download className="w-3.5 h-3.5 text-slate-600" />
            <span>Download CSV Template</span>
          </button>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* STEP 1: UPLOAD VIEW */}
        {/* ------------------------------------------------------------------ */}
        {step === 'upload' && (
          <div className="space-y-4 py-2">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-amber-500 bg-amber-50/60 scale-[1.01]'
                  : 'border-slate-300 hover:border-amber-400 bg-slate-50/50 hover:bg-amber-50/20'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileInputChange}
                className="hidden"
                aria-label="Select CSV file for book catalog bulk import"
              />

              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shadow-xs">
                {isReadingFile ? (
                  <RefreshCw className="w-7 h-7 animate-spin text-amber-600" />
                ) : (
                  <FileSpreadsheet className="w-7 h-7 text-amber-600" />
                )}
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  {isReadingFile
                    ? 'Reading and parsing CSV in memory...'
                    : 'Click to select CSV file, or drag & drop here'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Supports standard CSV spreadsheets up to 5 MB (max 1,000 titles per import).
                </p>
              </div>

              <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-100/70 px-3 py-1 rounded-full">
                <Upload className="w-3.5 h-3.5" />
                <span>Select .csv file from your computer</span>
              </div>
            </div>

            {/* Instruction Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs space-y-2 text-slate-600">
              <div className="flex items-center gap-2 font-bold text-slate-800">
                <Info className="w-4 h-4 text-amber-600" />
                <span>Import Format Guidelines</span>
              </div>
              <ul className="list-disc pl-5 space-y-1">
                <li>
                  <strong>Required Columns:</strong> Title, Author, Segment.
                </li>
                <li>
                  <strong>Physical Inventory:</strong> Specify <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">TotalCopies</code> (1–100). Physical copies will be created with status <span className="font-semibold text-emerald-700">AVAILABLE</span>.
                </li>
                <li>
                  <strong>Barcodes:</strong> Multiple barcodes should be semicolon-separated (e.g.{' '}
                  <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">BC-101;BC-102</code>).
                </li>
                <li>
                  <strong>Curriculum Mappings:</strong> Semicolon-separated programs with optional branch (e.g.{' '}
                  <code className="bg-slate-200 px-1 py-0.5 rounded text-slate-800">BCOM:General;BBA;BSC</code>).
                </li>
                <li>
                  <strong>Data Safety:</strong> Files are processed in memory and never permanently stored. PostgreSQL advisory locks serialize database execution.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 2: PREVIEW & VALIDATION GRID */}
        {/* ------------------------------------------------------------------ */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Top Summary Header */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-slate-500 block text-[11px]">Total Books</span>
                <span className="text-base font-extrabold text-slate-900">
                  {summary?.totalBooks ?? rawRows.length}
                </span>
              </div>

              <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5">
                <span className="text-emerald-700 block text-[11px]">Valid Rows</span>
                <span className="text-base font-extrabold text-emerald-700">
                  {summary?.validRowCount ?? rawRows.length - (clientErrors.length ? 1 : 0)}
                </span>
              </div>

              <div
                className={`${
                  hasErrors ? 'bg-rose-50 border-rose-300' : 'bg-slate-50 border-slate-200'
                } border rounded-xl p-2.5`}
              >
                <span
                  className={`${hasErrors ? 'text-rose-700' : 'text-slate-500'} block text-[11px]`}
                >
                  Validation Issues
                </span>
                <span
                  className={`text-base font-extrabold ${
                    hasErrors ? 'text-rose-700' : 'text-slate-900'
                  }`}
                >
                  {totalIssueCount}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-slate-500 block text-[11px]">Total Copies</span>
                <span className="text-base font-extrabold text-slate-900">
                  {summary?.totalPhysicalCopies ?? 0}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-slate-500 block text-[11px]">Unique ISBNs</span>
                <span className="text-base font-extrabold text-slate-900">
                  {summary?.uniqueIsbns ?? 0}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5">
                <span className="text-slate-500 block text-[11px]">Total Barcodes</span>
                <span className="text-base font-extrabold text-slate-900">
                  {summary?.totalBarcodes ?? 0}
                </span>
              </div>
            </div>

            {/* Validation Banner */}
            {isValidatingServer ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold animate-pulse">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                <span>Checking duplicate ISBNs and barcodes against library database...</span>
              </div>
            ) : hasErrors ? (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>Validation Issues Detected: Please correct errors before importing.</span>
                </div>
                <p className="text-[11px] text-rose-700">
                  {clientErrors.length > 0 && `${clientErrors.length} validation rule error(s). `}
                  {dbDuplicates?.existingIsbns?.length
                    ? `${dbDuplicates.existingIsbns.length} duplicate ISBN(s) already in library. `
                    : ''}
                  {dbDuplicates?.existingBarcodes?.length
                    ? `${dbDuplicates.existingBarcodes.length} barcode(s) already assigned in database.`
                    : ''}
                </p>
              </div>
            ) : serverError ? (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>{serverError}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs font-semibold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  All {rawRows.length} book titles and {summary?.totalPhysicalCopies} copies are valid and ready to import.
                </span>
              </div>
            )}

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <span className="text-slate-500 font-semibold mr-1">View:</span>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('all');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterMode === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All Rows ({rawRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('valid');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterMode === 'valid'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  Valid Only ({summary?.validRowCount ?? rawRows.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFilterMode('invalid');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-lg font-bold transition ${
                    filterMode === 'invalid'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 text-rose-800 hover:bg-rose-100'
                  }`}
                >
                  Errors ({errorsByRow.size})
                </button>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter preview titles, ISBN..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* Scrollable Data Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="overflow-x-auto max-h-[420px]">
                <table className="min-w-full text-left text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0 z-10 text-[11px] font-bold text-slate-600 tracking-wider uppercase">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 w-12 text-center">
                        Row
                      </th>
                      <th scope="col" className="px-3 py-2.5 w-24">
                        Status
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[180px]">
                        Title
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[130px]">
                        Author
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[120px]">
                        ISBN
                      </th>
                      <th scope="col" className="px-3 py-2.5 w-24">
                        Category
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[110px]">
                        Segment
                      </th>
                      <th scope="col" className="px-3 py-2.5 w-16 text-center">
                        Copies
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[130px]">
                        Barcodes
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[110px]">
                        Conditions
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[110px]">
                        Shelf
                      </th>
                      <th scope="col" className="px-3 py-2.5 min-w-[120px]">
                        Programs
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedRows.length === 0 ? (
                      <tr>
                        <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                          No matching records found.
                        </td>
                      </tr>
                    ) : (
                      paginatedRows.map((r) => {
                        const rowErrors = errorsByRow.get(r.rowNumber);
                        const isInvalid = Boolean(rowErrors && rowErrors.length > 0);

                        return (
                          <React.Fragment key={r.rowNumber}>
                            <tr
                              className={`transition ${
                                isInvalid
                                  ? 'bg-rose-50/50 hover:bg-rose-50'
                                  : 'hover:bg-slate-50/80'
                              }`}
                            >
                              <td className="px-3 py-2 text-center text-slate-400 font-mono text-[11px]">
                                {r.rowNumber}
                              </td>
                              <td className="px-3 py-2">
                                {isInvalid ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                    <XCircle className="w-3 h-3 text-rose-600" />
                                    Error
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    Valid
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-semibold text-slate-900 max-w-[220px] truncate" title={r.title}>
                                {r.title || <span className="text-rose-500 italic">Missing</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate" title={r.author}>
                                {r.author || <span className="text-rose-500 italic">Missing</span>}
                              </td>
                              <td className="px-3 py-2 font-mono text-slate-600 text-[11px]">
                                {r.isbn || <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-600">
                                <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-semibold text-slate-700">
                                  {r.category || 'TEXTBOOK'}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate" title={r.segment}>
                                {r.segment || <span className="text-rose-500 italic">Missing</span>}
                              </td>
                              <td className="px-3 py-2 text-center font-bold text-slate-800">
                                {r.totalCopies || '1'}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-slate-600 max-w-[140px] truncate" title={r.barcodes}>
                                {r.barcodes || <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate" title={r.copyConditions}>
                                {r.copyConditions || 'Good'}
                              </td>
                              <td className="px-3 py-2 text-slate-600 max-w-[120px] truncate" title={r.shelfLocation}>
                                {r.shelfLocation || <span className="text-slate-400">—</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-600 max-w-[140px] truncate" title={r.programs}>
                                {r.programs || <span className="text-slate-400">—</span>}
                              </td>
                            </tr>
                            {/* Inline error feedback for invalid rows */}
                            {isInvalid && rowErrors && (
                              <tr className="bg-rose-50/70 text-rose-800 text-[11px]">
                                <td colSpan={12} className="px-4 py-1.5 border-b border-rose-100">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                    <span className="font-bold">Row {r.rowNumber} Errors:</span>
                                    {rowErrors.map((errText, idx) => (
                                      <span
                                        key={idx}
                                        className="inline-block bg-white/80 border border-rose-200 px-2 py-0.5 rounded text-rose-900"
                                      >
                                        {errText}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-xs text-slate-600">
                  <span>
                    Showing {(currentPage - 1) * pageSize + 1} to{' '}
                    {Math.min(currentPage * pageSize, filteredRows.length)} of{' '}
                    {filteredRows.length} records
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 font-semibold transition"
                    >
                      Previous
                    </button>
                    <span className="font-bold text-slate-800 px-2">
                      Page {currentPage} of {totalPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 font-semibold transition"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setStep('upload');
                  setFile(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Choose Different File
              </button>

              <button
                type="button"
                disabled={hasErrors || isValidatingServer}
                onClick={() => setStep('confirm')}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition"
              >
                <span>Proceed to Confirmation</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 3: EXPLICIT CONFIRMATION VIEW */}
        {/* ------------------------------------------------------------------ */}
        {step === 'confirm' && (
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5 font-bold text-sm text-amber-900">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <span>Explicit Inventory Modification Authorization</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed">
                You are about to insert real inventory catalog data into the R.G. Kedia College Library database.
                This operation will create new book records, generate tracked physical copies, and link curriculum degrees.
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-center">
                  <span className="text-[11px] text-slate-500 block">Total Books</span>
                  <span className="text-lg font-black text-slate-900">{rawRows.length}</span>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-center">
                  <span className="text-[11px] text-slate-500 block">Physical Copies</span>
                  <span className="text-lg font-black text-slate-900">{summary?.totalPhysicalCopies}</span>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-center">
                  <span className="text-[11px] text-slate-500 block">Copy Status</span>
                  <span className="text-xs font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-block mt-1">
                    AVAILABLE
                  </span>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200 text-center">
                  <span className="text-[11px] text-slate-500 block">Concurrency Lock</span>
                  <span className="text-xs font-extrabold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full inline-block mt-1">
                    Advisory Locked
                  </span>
                </div>
              </div>
            </div>

            {/* Checkbox confirmation */}
            <label className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/70 transition">
              <input
                type="checkbox"
                checked={confirmCheckbox}
                onChange={(e) => setConfirmCheckbox(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500"
                aria-label="Confirm library inventory bulk import"
              />
              <span className="text-xs text-slate-800 font-medium">
                I confirm that I have verified the preview records and authorize adding these{' '}
                <strong className="text-slate-950">{rawRows.length} book titles</strong> and{' '}
                <strong className="text-slate-950">{summary?.totalPhysicalCopies} physical copies</strong> to the R.G. Kedia College Library catalog.
              </span>
            </label>

            {serverError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Confirmation Buttons */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isExecuting}
                onClick={() => setStep('preview')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Preview</span>
              </button>

              <button
                type="button"
                disabled={!confirmCheckbox || isExecuting}
                onClick={handleExecuteImport}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-extrabold text-xs rounded-xl shadow-xs transition"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Executing Transactional Import...</span>
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4 text-white" />
                    <span>Confirm & Execute Import</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* STEP 4: RESULT SUMMARY VIEW */}
        {/* ------------------------------------------------------------------ */}
        {step === 'result' && (
          <div className="space-y-4 py-4 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-9 h-9" />
            </div>

            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                Bulk Book Import Completed Successfully!
              </h3>
              <p className="text-xs text-slate-600 mt-1">
                {executionResult?.message ||
                  `Imported ${executionResult?.summary?.totalBooksImported ?? rawRows.length} books.`}
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto text-xs py-2">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-slate-500 block text-[11px]">Books Added</span>
                <span className="text-lg font-black text-emerald-700">
                  {executionResult?.summary?.totalBooksImported ?? rawRows.length}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-slate-500 block text-[11px]">Copies Created</span>
                <span className="text-lg font-black text-emerald-700">
                  {executionResult?.summary?.totalCopiesImported ?? summary?.totalPhysicalCopies}
                </span>
              </div>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <span className="text-slate-500 block text-[11px]">Batches Committed</span>
                <span className="text-lg font-black text-slate-900">
                  {executionResult?.summary?.totalBatches ?? 1}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs transition"
              >
                Close & View Catalog
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default BulkImportModal;
