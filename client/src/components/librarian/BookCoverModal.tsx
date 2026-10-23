import React, { useState, useRef, useEffect } from 'react';
import api from '../../lib/api';
import { Book } from '../../types';
import Modal from '../common/Modal';
import BookCoverImage from '../common/BookCoverImage';
import {
  Upload,
  Trash2,
  CheckCircle,
  AlertCircle,
  Loader2,
  Image as ImageIcon,
  RotateCw,
  FileText,
  X,
  AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface BookCoverModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book | null;
  onCoverUpdated: (bookId: string, newCoverUrl: string | null) => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const BookCoverModal: React.FC<BookCoverModalProps> = ({
  isOpen,
  onClose,
  book,
  onCoverUpdated,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileDetails, setFileDetails] = useState<{ size: string; width?: number; height?: number } | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clean up object URLs when previewUrl changes or modal unmounts
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset state when opening/closing or changing target book
  useEffect(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileDetails(null);
    setValidationError(null);
    setIsUploading(false);
    setIsDeleting(false);
    setShowDeleteConfirm(false);
    setIsDragging(false);
  }, [isOpen, book?.id]);

  if (!book) return null;

  const validateAndSetFile = (file: File) => {
    setValidationError(null);

    // Extension check
    const extension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      const err = `Unsupported file format (${extension}). Please select a JPEG, PNG, or WebP image.`;
      setValidationError(err);
      toast.error(err);
      return false;
    }

    // MIME type check
    if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
      const err = `Invalid MIME type (${file.type}). Only JPEG, PNG, and WebP are allowed.`;
      setValidationError(err);
      toast.error(err);
      return false;
    }

    // Size check (5MB limit)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      const err = `File size (${sizeMB} MB) exceeds maximum allowed limit of 5 MB.`;
      setValidationError(err);
      toast.error(err);
      return false;
    }

    // Zero-byte check
    if (file.size === 0) {
      const err = 'Selected image file is empty (0 bytes).';
      setValidationError(err);
      toast.error(err);
      return false;
    }

    // Clean up prior blob URL
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    // Generate local preview URL
    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);

    // Format file size
    const formattedSize =
      file.size < 1024 * 1024
        ? `${(file.size / 1024).toFixed(1)} KB`
        : `${(file.size / (1024 * 1024)).toFixed(2)} MB`;

    // Attempt to inspect preview image dimensions
    const img = new Image();
    img.onload = () => {
      setFileDetails({
        size: formattedSize,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };
    img.onerror = () => {
      setFileDetails({ size: formattedSize });
    };
    img.src = objectUrl;

    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
    // Reset file input value to allow re-selecting same file if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleClearPreview = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileDetails(null);
    setValidationError(null);
  };

  // Upload or replace book cover
  const handleUploadCover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setValidationError(null);

      const formData = new FormData();
      formData.append('cover', selectedFile, selectedFile.name);

      const res = await api.post(`/books/${book.id}/cover`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const updatedCoverUrl = res.data.coverUrl;
      toast.success(res.data.message || 'Book cover updated successfully!');
      onCoverUpdated(book.id, updatedCoverUrl);

      handleClearPreview();
      onClose();
    } catch (err: any) {
      console.error('Cover upload error:', err);
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to upload book cover.';
      setValidationError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsUploading(false);
    }
  };

  // Delete book cover
  const handleDeleteCover = async () => {
    try {
      setIsDeleting(true);
      setValidationError(null);

      const res = await api.delete(`/books/${book.id}/cover`);

      if (res.data?.warning) {
        toast(res.data.warning, { icon: '⚠️' });
      }
      toast.success(res.data?.message || 'Book cover removed successfully.');
      onCoverUpdated(book.id, null);

      setShowDeleteConfirm(false);
      handleClearPreview();
      onClose();
    } catch (err: any) {
      console.error('Cover delete error:', err);
      const errorMsg =
        err.response?.data?.error || err.message || 'Failed to remove book cover.';
      setValidationError(errorMsg);
      toast.error(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };

  const hasExistingCover = Boolean(book.coverImage);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !isUploading && !isDeleting && onClose()}
      title={`Book Cover Artwork — ${book.title}`}
      maxWidth="2xl"
    >
      <div className="space-y-6 text-xs text-slate-700">
        {/* Validation or Server Error Alert */}
        {validationError && (
          <div
            className="p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-800"
            role="alert"
          >
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold">Cover Upload Issue</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">{validationError}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* Column 1: Current Active Cover / Status */}
          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col items-center text-center">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              {hasExistingCover ? 'Current Active Cover' : 'Default College Artwork'}
            </span>

            <div className="my-2 shadow-md rounded-lg overflow-hidden border border-slate-300">
              <BookCoverImage
                coverUrl={book.coverImage}
                title={book.title}
                author={book.author}
                size="lg"
              />
            </div>

            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">{book.title}</h4>
              <p className="text-slate-500 text-[11px]">by {book.author}</p>
              {book.isbn && (
                <p className="font-mono text-[10px] text-slate-400">ISBN: {book.isbn}</p>
              )}
            </div>

            <div className="pt-2 w-full border-t border-slate-200 flex items-center justify-between text-[11px]">
              <span
                className={`font-semibold px-2 py-0.5 rounded-full ${
                  hasExistingCover
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {hasExistingCover ? 'Custom Image Active' : 'Placeholder Artwork'}
              </span>

              {hasExistingCover && !showDeleteConfirm && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isUploading || isDeleting}
                  className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 font-bold hover:underline transition disabled:opacity-50"
                  aria-label="Remove existing cover"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Cover</span>
                </button>
              )}
            </div>

            {/* Removal Confirmation Dialog */}
            {showDeleteConfirm && (
              <div
                className="w-full mt-2 p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 text-left"
                role="alertdialog"
                aria-label="Confirm cover deletion"
              >
                <div className="flex items-center gap-2 text-red-900 font-bold text-xs">
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>Remove cover artwork?</span>
                </div>
                <p className="text-[11px] text-red-700 leading-normal">
                  The book will immediately revert to the standard college placeholder. This
                  cannot be undone without re-uploading.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(false)}
                    disabled={isDeleting}
                    className="px-2.5 py-1 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteCover}
                    disabled={isDeleting}
                    className="px-3 py-1 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition flex items-center gap-1 disabled:opacity-50"
                  >
                    {isDeleting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{isDeleting ? 'Removing...' : 'Confirm Remove'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Column 2: Upload / Replace Workspace */}
          <div className="space-y-4">
            <div className="space-y-1">
              <h4 className="font-bold text-slate-900 text-sm">
                {hasExistingCover ? 'Replace Cover Image' : 'Upload New Cover Image'}
              </h4>
              <p className="text-slate-500 text-[11px]">
                Accepts JPEG, PNG, or WebP up to 5 MB. Image is automatically resized and
                compressed into an optimized WebP thumbnail (under 50 KB).
              </p>
            </div>

            {/* Drag & Drop Upload Zone */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              className="hidden"
              id="book-cover-file-input"
              aria-label="Select book cover image file"
            />

            {!previewUrl ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center ${
                  isDragging
                    ? 'border-amber-500 bg-amber-50/70 scale-[0.99]'
                    : 'border-slate-300 hover:border-amber-400 bg-white hover:bg-slate-50'
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Click or drag and drop to select a cover image file"
              >
                <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-xs">
                    Click to choose file or drag & drop here
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    JPEG, PNG, or WebP • Max size 5 MB
                  </p>
                </div>
              </div>
            ) : (
              /* Pre-Upload Inspection & Preview Card */
              <div className="p-4 bg-amber-50/50 border border-amber-200 rounded-2xl space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-amber-900 border-b border-amber-200 pb-2">
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-amber-600" />
                    <span>Selected Image Preview</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClearPreview}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-amber-100 transition"
                    title="Clear selection"
                    aria-label="Clear selected file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex gap-4 items-center">
                  <div className="w-20 h-28 aspect-[2/3] rounded-lg overflow-hidden border border-slate-300 shadow-sm shrink-0 bg-slate-100">
                    <img
                      src={previewUrl}
                      alt="Selected preview"
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex-1 space-y-1 text-[11px]">
                    <p className="font-bold text-slate-800 truncate" title={selectedFile?.name}>
                      {selectedFile?.name}
                    </p>
                    <p className="text-slate-500">
                      File Size: <strong>{fileDetails?.size || 'Calculating...'}</strong>
                    </p>
                    {fileDetails?.width && fileDetails?.height && (
                      <p className="text-slate-500">
                        Dimensions: <strong>{fileDetails.width} × {fileDetails.height} px</strong>
                      </p>
                    )}
                    <span className="inline-block mt-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Ready for processing
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-[11px] transition inline-flex items-center justify-center gap-1.5"
                >
                  <RotateCw className="w-3 h-3 text-slate-400" />
                  <span>Choose Different File</span>
                </button>
              </div>
            )}

            {/* Submit Upload Button */}
            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={onClose}
                disabled={isUploading || isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleUploadCover}
                disabled={!selectedFile || isUploading || isDeleting}
                className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing & Uploading...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>{hasExistingCover ? 'Replace Cover' : 'Upload Cover'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default BookCoverModal;
