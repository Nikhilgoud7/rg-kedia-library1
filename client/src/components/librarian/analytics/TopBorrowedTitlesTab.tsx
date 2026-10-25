import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../../lib/api';
import { TopBorrowedData } from '../../../types/reports';
import StatCard from '../../common/StatCard';
import AnalyticsDateFilter from './AnalyticsDateFilter';
import CsvExportButton from './CsvExportButton';
import BookCoverImage from '../../common/BookCoverImage';
import {
  Trophy,
  BookOpen,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Inbox,
  Hash,
} from 'lucide-react';

export const TopBorrowedTitlesTab: React.FC = () => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [limit, setLimit] = useState(10);
  const [data, setData] = useState<TopBorrowedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeRequestId = useRef(0);

  const fetchTopBorrowed = useCallback(async () => {
    if (startDate && endDate && startDate > endDate) return;

    const reqId = ++activeRequestId.current;
    try {
      setLoading(true);
      setError(null);

      const params: Record<string, string | number> = { limit };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (programId) params.programId = programId;

      const res = await api.get('/reports/top-borrowed', { params });

      if (reqId === activeRequestId.current) {
        setData(res.data.data);
      }
    } catch (err: any) {
      if (reqId === activeRequestId.current) {
        console.error('Failed to load top borrowed titles:', err);
        setError(err.response?.data?.error || 'Unable to load top borrowed titles.');
      }
    } finally {
      if (reqId === activeRequestId.current) {
        setLoading(false);
      }
    }
  }, [startDate, endDate, programId, limit]);

  useEffect(() => {
    fetchTopBorrowed();
  }, [fetchTopBorrowed]);

  const queryParams = new URLSearchParams();
  queryParams.set('limit', String(limit));
  queryParams.set('format', 'csv');
  if (startDate) queryParams.set('startDate', startDate);
  if (endDate) queryParams.set('endDate', endDate);
  if (programId) queryParams.set('programId', programId);

  const csvEndpoint = `/reports/top-borrowed?${queryParams.toString()}`;
  const csvFilename = `top-borrowed-titles${programId ? `-${programId.toLowerCase()}` : ''}.csv`;

  const titles = data?.titles || [];
  const maxBorrows = Math.max(1, ...titles.map((t) => t.borrowCount));
  const topTitle = titles.length > 0 ? titles[0] : null;

  return (
    <div className="space-y-6">
      {/* Filters and Controls */}
      <AnalyticsDateFilter
        startDate={startDate}
        endDate={endDate}
        onDateChange={(s, e) => {
          setStartDate(s);
          setEndDate(e);
        }}
        programId={programId}
        onProgramChange={(p) => setProgramId(p)}
        showProgramFilter={true}
        showPeriodSelector={false}
        disabled={loading}
      />

      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Most Borrowed Library Titles</h2>
          <p className="text-xs text-slate-500">
            Catalog titles ranked by cumulative student and faculty borrowing frequency
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Limit selector */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-3 py-1 rounded-xl text-xs font-semibold">
            <span className="text-slate-400">Limit:</span>
            <select
              value={limit}
              disabled={loading}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="bg-transparent font-bold text-slate-800 focus:outline-hidden"
              aria-label="Result limit"
            >
              <option value={5}>Top 5</option>
              <option value={10}>Top 10</option>
              <option value={20}>Top 20</option>
              <option value={50}>Top 50</option>
            </select>
          </div>

          <CsvExportButton
            endpoint={csvEndpoint}
            filename={csvFilename}
            disabled={loading || !data}
          />
          <button
            type="button"
            onClick={fetchTopBorrowed}
            disabled={loading}
            className="p-2 bg-white hover:bg-slate-50 text-slate-600 rounded-xl border border-slate-200 transition shadow-xs disabled:opacity-50"
            aria-label="Refresh top borrowed report"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center gap-2 font-semibold">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchTopBorrowed}
            className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-900 rounded-lg font-bold transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 animate-pulse space-y-3">
              <div className="h-3 bg-slate-200 rounded w-24" />
              <div className="h-7 bg-slate-200 rounded w-16" />
              <div className="h-2.5 bg-slate-100 rounded w-32" />
            </div>
          ))
        ) : (
          <>
            <StatCard
              title="Titles Analyzed"
              value={data?.totalTitles ?? 0}
              subtitle="Catalog books with circulation history"
              icon={BookOpen}
              color="amber"
            />
            <StatCard
              title="Highest Circulation"
              value={topTitle ? `${topTitle.borrowCount} loans` : '0 loans'}
              subtitle={topTitle ? topTitle.title.slice(0, 32) : 'No data'}
              icon={Trophy}
              color="emerald"
            />
            <StatCard
              title="Filter Scope"
              value={programId ? `${programId} Program` : 'All Programs'}
              subtitle={`Showing top ${titles.length} ranked titles`}
              icon={TrendingUp}
              color="blue"
            />
          </>
        )}
      </div>

      {/* Ranked List & Visual Indicators */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <h3 className="text-sm font-bold text-slate-900">Ranked Borrowing Leaderboard</h3>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 rounded-xl border border-slate-100 animate-pulse flex items-center gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-200" />
                <div className="w-12 h-16 rounded bg-slate-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-48" />
                  <div className="h-3 bg-slate-100 rounded w-32" />
                </div>
                <div className="h-5 bg-slate-100 rounded w-20" />
              </div>
            ))}
          </div>
        ) : titles.length === 0 ? (
          <div className="py-12 text-center text-slate-400">
            <Inbox className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="text-xs font-bold text-slate-600">No borrowed titles match your filters</p>
            <p className="text-[11px] text-slate-400">Try adjusting or clearing the program and date filters.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {titles.map((book, index) => {
              const rank = index + 1;
              const percent = Math.round((book.borrowCount / maxBorrows) * 100);

              return (
                <div
                  key={book.bookId}
                  className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 p-2 rounded-xl transition"
                >
                  <div className="flex items-center gap-3">
                    {/* Rank Badge */}
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                        rank === 1
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : rank === 2
                          ? 'bg-slate-200 text-slate-800'
                          : rank === 3
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {rank === 1 ? <Trophy className="w-4 h-4 text-amber-600" /> : `#${rank}`}
                    </div>

                    {/* Book Cover */}
                    <BookCoverImage
                      coverUrl={book.coverImage}
                      title={book.title}
                      author={book.author}
                      size="sm"
                      className="shrink-0"
                    />

                    {/* Metadata */}
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate max-w-md sm:max-w-lg">
                        {book.title}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        by {book.author || 'Unknown'} {book.isbn ? `• ISBN: ${book.isbn}` : ''} •{' '}
                        <span className="font-semibold text-slate-700">{book.category}</span>
                      </p>
                      {book.programs && book.programs.length > 0 && (
                        <div className="flex items-center gap-1 mt-1 flex-wrap">
                          {book.programs.map((p) => (
                            <span
                              key={p}
                              className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Relative Frequency Bar & Count */}
                  <div className="flex items-center gap-3 sm:w-56 shrink-0 sm:justify-end">
                    <div className="flex-1 hidden sm:block">
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-extrabold text-slate-900">{book.borrowCount}</span>
                      <span className="text-[10px] text-slate-400 block font-medium">borrows</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default TopBorrowedTitlesTab;
