import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { Notification } from '../../types';
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle, CheckSquare, RefreshCcw } from 'lucide-react';
import toast from 'react-hot-toast';

export const NotificationPage: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD' | 'READ'>('ALL');
  const [isMarking, setIsMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/lending/notifications');
      setNotifications(res.data.notifications || []);
    } catch (err: any) {
      console.error('Failed to load notifications:', err);
      setError('Failed to load notifications. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      setIsMarking(true);
      await api.put(`/lending/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
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
      toast.success('All notifications marked as read');
    } catch (err) {
      console.error('Failed to mark all read', err);
      toast.error('Failed to update notifications');
    } finally {
      setIsMarking(false);
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

  const unreadCount = notifications.filter((n) => !n.read).length;

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

          <button
            onClick={markAllAsRead}
            disabled={unreadCount === 0 || isMarking}
            className={`px-4 py-2.5 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all w-full sm:w-auto justify-center ${
              unreadCount > 0
                ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                : 'bg-slate-50 text-slate-400 border border-slate-100 cursor-not-allowed'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Mark all read
          </button>
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
              onClick={fetchNotifications}
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
                className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col sm:flex-row gap-4 sm:gap-6 items-start ${
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

                {!n.read && (
                  <button
                    onClick={() => markAsRead(n.id)}
                    disabled={isMarking}
                    className="shrink-0 px-4 py-2 bg-white border border-slate-200 hover:border-amber-400 hover:text-amber-600 text-slate-600 rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs w-full sm:w-auto justify-center"
                  >
                    <Check className="w-4 h-4" />
                    Mark Read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationPage;
