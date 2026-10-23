import React, { useState, useEffect } from 'react';
import { BookOpen, ImageOff } from 'lucide-react';

export interface BookCoverImageProps {
  coverUrl?: string | null;
  title: string;
  author?: string | null;
  size?: 'sm' | 'md' | 'lg' | 'full';
  className?: string;
  aspectRatio?: string;
  loading?: 'lazy' | 'eager';
  showSpineAccent?: boolean;
}

/**
 * BookCoverImage
 * 
 * Production-ready cover component for RG-Kedia Library Management System:
 * 1. Displays the optimized WebP cover returned by the Phase 8C backend.
 * 2. Elegant fallback to a generic book placeholder when coverUrl is missing or null.
 * 3. Graceful error recovery: switches to placeholder immediately on HTTP 404 or load error (no broken image icons).
 * 4. Zero permanent disk writes or external image fetches.
 * 5. Screen reader accessible with informative alt text and ARIA semantics.
 */
export const BookCoverImage: React.FC<BookCoverImageProps> = ({
  coverUrl,
  title,
  author,
  size = 'md',
  className = '',
  aspectRatio = 'aspect-[2/3]',
  loading = 'lazy',
  showSpineAccent = true,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reset state when coverUrl changes (e.g. after replacement or removal)
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [coverUrl]);

  // Size configurations
  const sizeClasses = {
    sm: 'w-10 h-14 text-[9px]',
    md: 'w-20 h-28 text-xs',
    lg: 'w-36 h-52 text-sm',
    full: 'w-full h-full text-sm',
  };

  const containerSizeClass = sizeClasses[size] || sizeClasses.md;

  // Placeholder view
  const renderPlaceholder = () => (
    <div
      className={`relative ${containerSizeClass} ${aspectRatio} rounded-lg overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-amber-950 text-white flex flex-col justify-between p-2 shadow-xs select-none border border-slate-700/60 ${className}`}
      role="img"
      aria-label={`Placeholder cover for ${title}`}
    >
      {/* Decorative Book Spine Effect */}
      {showSpineAccent && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 bg-amber-400/40 border-r border-amber-300/20"
          aria-hidden="true"
        />
      )}

      {/* Top Header / Subject Accent */}
      <div className="flex items-center justify-between pl-1">
        <BookOpen
          className={`${
            size === 'sm' ? 'w-3 h-3' : size === 'md' ? 'w-4 h-4' : 'w-5 h-5'
          } text-amber-400 shrink-0`}
          aria-hidden="true"
        />
        {size !== 'sm' && (
          <span className="text-[9px] uppercase tracking-wider font-extrabold text-amber-300/80">
            RGK
          </span>
        )}
      </div>

      {/* Title & Author snippet */}
      <div className="pl-1 my-auto">
        <p
          className={`font-black leading-tight text-slate-100 line-clamp-3 ${
            size === 'sm' ? 'text-[9px]' : size === 'md' ? 'text-[11px]' : 'text-xs'
          }`}
          title={title}
        >
          {title}
        </p>
        {author && size !== 'sm' && (
          <p className="text-[9px] text-amber-200/70 font-medium truncate mt-0.5" title={author}>
            {author}
          </p>
        )}
      </div>

      {/* Footer Branding Bar */}
      <div className="pl-1 pt-1 border-t border-slate-700/50 flex items-center justify-between text-[8px] text-slate-400">
        <span>College Library</span>
      </div>
    </div>
  );

  // If no cover URL is available or an error occurred during loading, show placeholder
  if (!coverUrl || hasError) {
    return renderPlaceholder();
  }

  return (
    <div
      className={`relative ${containerSizeClass} ${aspectRatio} rounded-lg overflow-hidden bg-slate-100 border border-slate-200 shadow-xs shrink-0 group ${className}`}
    >
      {/* Loading Skeleton Indicator */}
      {!isLoaded && !hasError && (
        <div
          className="absolute inset-0 bg-slate-200 animate-pulse flex items-center justify-center"
          aria-hidden="true"
        >
          <BookOpen className="w-4 h-4 text-slate-400 animate-bounce" />
        </div>
      )}

      {/* Actual WebP Cover Image */}
      <img
        src={coverUrl}
        alt={`Cover of ${title}`}
        loading={loading}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setHasError(true);
          setIsLoaded(false);
        }}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Book Spine Shadow Accent */}
      {showSpineAccent && isLoaded && (
        <div
          className="absolute left-0 top-0 bottom-0 w-1 bg-black/20 pointer-events-none"
          aria-hidden="true"
        />
      )}
    </div>
  );
};

export default BookCoverImage;
