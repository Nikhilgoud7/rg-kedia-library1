import React from 'react';
import { Book } from '../../types';
import { BookOpen, MapPin, Tag, CheckCircle2, XCircle, ArrowRight, UserCheck } from 'lucide-react';
import BookCoverImage from './BookCoverImage';

interface BookCardProps {
  book: Book;
  onAction?: (book: Book) => void;
  actionLabel?: string;
  showProgramTags?: boolean;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  onAction,
  actionLabel = 'Borrow Book',
  showProgramTags = true,
}) => {
  const isAvailable = book.availableCopies > 0;

  const getSegmentColor = (segment: string) => {
    if (segment.includes('Accounting') || segment.includes('Finance')) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (segment.includes('Statistics') || segment.includes('Math')) return 'bg-blue-50 text-blue-700 border-blue-200';
    if (segment.includes('Computer') || segment.includes('Data')) return 'bg-purple-50 text-purple-700 border-purple-200';
    if (segment.includes('Management') || segment.includes('Business')) return 'bg-amber-50 text-amber-700 border-amber-200';
    if (segment.includes('Language')) return 'bg-rose-50 text-rose-700 border-rose-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group">
      <div className="p-5">
        {/* Top Header: Segment & Availability Badge */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getSegmentColor(book.segment)}`}>
            {book.segment}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
              isAvailable
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {isAvailable ? (
              <>
                <CheckCircle2 className="w-3 h-3" /> {book.availableCopies} of {book.totalCopies} Available
              </>
            ) : (
              <>
                <XCircle className="w-3 h-3" /> 0 of {book.totalCopies} Available
              </>
            )}
          </span>
        </div>

        {/* Book Cover and Core Information */}
        <div className="flex gap-3.5 mb-3">
          <div className="shrink-0">
            <BookCoverImage
              coverUrl={book.coverImage}
              title={book.title}
              author={book.author}
              size="md"
            />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm leading-snug group-hover:text-amber-600 transition line-clamp-2">
              {book.title}
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-1 truncate">by {book.author}</p>

            {/* Publication & Edition Details */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-400">
              {book.publisher && <span className="truncate max-w-[120px]">{book.publisher}</span>}
              {book.edition && <span>• {book.edition}</span>}
              {book.isbn && <span className="font-mono text-[10px] block w-full mt-0.5 truncate">ISBN: {book.isbn}</span>}
            </div>
          </div>
        </div>

        {/* Shelf Location */}
        {book.shelfLocation && (
          <div className="mt-2.5 flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Shelf: {book.shelfLocation}</span>
          </div>
        )}

        {/* Relevant Programs & Branches */}
        {showProgramTags && book.bookPrograms && book.bookPrograms.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-slate-100">
            {book.bookPrograms.map((bp, idx) => (
              <span
                key={idx}
                className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md"
              >
                {bp.program} {bp.branch ? `(${bp.branch})` : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Action Footer */}
      {onAction && (
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">
            Category: {book.category}
          </span>
          <button
            onClick={() => onAction(book)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
              isAvailable
                ? 'bg-slate-900 text-white hover:bg-amber-600'
                : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
            }`}
          >
            <span>{actionLabel}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default BookCard;
