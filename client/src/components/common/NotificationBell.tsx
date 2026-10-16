import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock, AlertTriangle, Info, CheckCircle } from 'lucide-react';
import api from '../../lib/api';
import { Notification } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = async () => {
    try {
      const res = await api.get('/lending/notifications/unread-count');
      if (typeof res.data?.unreadCount === 'number') {
        setUnreadCount(res.data.unreadCount);
      }
    } catch (err) {
      // Graceful error handling: log and preserve existing UI state
      console.warn('Failed to fetch unread notification count', err);
    }
  };

  const fetchFullNotifications = async () => {
    try {
      const res = await api.get('/lending/notifications');
      const list: Notification[] = res.data.notifications || [];
      setNotifications(list);
      setUnreadCount(typeof res.data.unreadCount === 'number' ? res.data.unreadCount : list.filter((n) => !n.read).length);
    } catch (err) {
      console.error('Failed to fetch notifications list', err);
    }
  };

  // Poll lightweight unread count every 60s, pausing when browser tab is hidden
  useEffect(() => {
    let intervalId: any = null;

    const startPolling = () => {
      if (!intervalId) {
        intervalId = setInterval(fetchUnreadCount, 60000); // 60s free-tier friendly polling
      }
    };

    const stopPolling = () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    // Initial count fetch
    fetchUnreadCount();
    startPolling();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUnreadCount();
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Fetch full notifications list only when notification panel is opened
  useEffect(() => {
    if (isOpen) {
      fetchFullNotifications();
    }
  }, [isOpen]);

  const markAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.put(`/lending/notifications/${id}/read`);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch (err) {
      console.error('Failed to mark read', err);
    }
  };

  const handleNotificationClick = async (n: Notification) => {
    if (!n.read) {
      await markAsRead(n.id);
    }
    setIsOpen(false);
    if (n.link && typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//')) {
      navigate(n.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'OVERDUE':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'APPROVAL':
        return <CheckCircle className="w-4 h-4 text-emerald-500" />;
      case 'REQUEST':
        return <Clock className="w-4 h-4 text-amber-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow-xs">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-xl ring-1 ring-slate-900/10 z-50 overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50">
              <h3 className="font-bold text-sm text-slate-800">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No notifications yet
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3.5 hover:bg-slate-50 transition flex items-start gap-3 cursor-pointer ${
                      !n.read ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <div className="mt-0.5">{getIcon(n.type)}</div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-800">{n.title}</p>
                        {!n.read && (
                          <button
                            onClick={(e) => markAsRead(n.id, e)}
                            className="text-[10px] text-slate-400 hover:text-slate-700 flex items-center gap-0.5"
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" /> Mark read
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                      <span className="text-[10px] text-slate-400 mt-1.5 block">
                        {new Date(n.createdAt).toLocaleDateString()} at{' '}
                        {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
              <Link
                to={
                  user?.role === 'LIBRARIAN'
                    ? '/librarian/notifications'
                    : user?.role === 'TEACHER'
                    ? '/teacher/notifications'
                    : '/student/notifications'
                }
                onClick={() => setIsOpen(false)}
                className="text-xs font-bold text-amber-600 hover:text-amber-700 block w-full py-1"
              >
                View all notifications
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default NotificationBell;
