import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Notification } from '../../types';
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle, CheckSquare, RefreshCcw, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';

interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const NotificationPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({ total: 0, page: 1, limit: 20, totalPages: 1 });

  const fetchNotifications = async (targetPage = page) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/lending/notifications', { params: { page: targetPage, limit: 20 } });
      setNotifications(res.data.notifications || []);
      if (typeof res.data.unreadCount === 'number') {
        setUnreadCount(res.data.unreadCount);
      } else {
        setUnreadCount((res.data.notifications || []).filter((n: Notification) => !n.read).length);
      }
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications(page);
  }, [page]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      setIsMarking(true);
      await api.put(`/lending/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
      toast.success('Notification marked as read');
    } catch (err) {
      console.error('Failed to mark read', err);
      toast.error('Failed to update notification');
    } finally {
      setIsMarking(false);
    }
  };

  const markAllAsRead = async () => {
    try {
      setIsMarking(true);
      await api.put('/lending/notifications/read-all');
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true }))
      );
      setUnreadCount(0);
      toast.success('All notifications marked as read');
    } catch (err) {
      console.error('Failed to mark all read', err);
      toast.error('Failed to update notifications');
    } finally {
      setIsMarking(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.delete(`/lending/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success('Notification deleted');
      await fetchNotifications(page);
    } catch (err) {
      console.error('Failed to delete notification', err);
      toast.error('Failed to delete notification');
    }
  };

  const handleClearRead = async () => {
    try {
      await api.delete('/lending/notifications/clear-read');
      toast.success('Read notifications cleared');
      await fetchNotifications(1);
    } catch (err) {
      console.error('Failed to clear read notifications', err);
      toast.error('Failed to clear read notifications');
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      await markAsRead(n.id);
    }
    if (n.link && typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//')) {
      navigate(n.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'OVERDUE':
        return <AlertTriangle className="w-6 h-6 text-red-500" />;
      case 'APPROVAL':
        return <CheckCircle className="w-6 h-6 text-emerald-500" />;
      case 'REQUEST':
        return <Clock className="w-6 h-6 text-amber-500" />;
      default:
        return <Info className="w-6 h-6 text-blue-500" />;
    }
  };

  const filteredNotifs = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.read;
    if (filter === 'READ') return n.read;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <Bell className="w-6 h-6 text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Notifications</h1>
            <p className="text-slate-500 text-sm mt-0.5">Stay updated on your library activities, dues, and requests</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto shrink-0">
            <button
              onClick={() => setFilter('ALL')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex-1 text-center whitespace-nowrap ${
                filter === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('UNREAD')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex-1 text-center whitespace-nowrap ${
                filter === 'UNREAD' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Unread ({unreadCount})
            </button>
            <button
              onClick={() => setFilter('READ')}
              className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors flex-1 text-center whitespace-nowrap ${
                filter === 'READ' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Read
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={markAllAsRead}
              disabled={unreadCount === 0 || isMarking}
              className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all flex-1 sm:flex-none ${
                unreadCount > 0
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                  : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-not-allowed'
              }`}
            >
              <CheckSquare className="w-4 h-4" />
              Mark all read
            </button>
            <button
              onClick={handleClearRead}
              className="px-3 py-2 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 flex-1 sm:flex-none"
              title="Clear read notifications"
            >
              <Trash2 className="w-4 h-4" />
              Clear read
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs min-h-[400px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-64 space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            <p className="text-slate-400 font-medium text-sm">Loading notifications...</p>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
            <h3 className="text-slate-800 font-bold mb-1">Could not load notifications</h3>
            <p className="text-slate-500 text-sm mb-4">{error}</p>
            <button
              onClick={() => fetchNotifications(page)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition"
            >
              <RefreshCcw className="w-4 h-4" /> Try Again
            </button>
          </div>
        ) : filteredNotifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
              <Bell className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-slate-800 font-bold mb-1">No notifications yet</h3>
            <p className="text-slate-500 text-sm max-w-sm">
              {filter === 'UNREAD'
                ? "You don't have any unread notifications."
                : "You're all caught up! When you borrow books or make requests, you'll see updates here."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredNotifs.map((n) => (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row gap-4 sm:gap-6 items-start cursor-pointer ${
                  !n.read
                    ? 'bg-amber-50/30 border-amber-200 hover:border-amber-300 shadow-xs relative overflow-hidden'
                    : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                }`}
              >
                {!n.read && (
                  <div className="absolute top-0 left-0 bottom-0 w-1 bg-amber-500" />
                )}

                <div className={`p-3 rounded-xl shrink-0 ${!n.read ? 'bg-white shadow-xs' : 'bg-slate-50'}`}>
                  {getIcon(n.type)}
                </div>

                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h3 className={`text-sm sm:text-base font-bold ${!n.read ? 'text-slate-900' : 'text-slate-700'}`}>
                      {n.title}
                    </h3>
                    {!n.read && (
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-red-100 text-red-700">
                        New
                      </span>
                    )}
                  </div>

                  <p className={`text-sm mb-3 ${!n.read ? 'text-slate-700 font-medium' : 'text-slate-600'}`}>
                    {n.message}
                  </p>

                  <div className="flex items-center gap-4 text-xs font-medium text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 uppercase tracking-wider text-[10px]">
                      {n.type}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end">
                  {!n.read && (
                    <button
                      onClick={(e) => markAsRead(n.id, e)}
                      disabled={isMarking}
                      className="px-3 py-1.5 bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-600 text-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Mark Read
                    </button>
                  )}
                  <button
                    onClick={(e) => handleDelete(n.id, e)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete notification"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between pt-4 border-t border-slate-100 text-xs font-semibold text-slate-600">
                <span>Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)</span>
                <div className="flex gap-2">
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    disabled={page >= pagination.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPage;
