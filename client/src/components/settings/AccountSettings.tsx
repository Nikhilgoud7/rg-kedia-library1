import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import ChangePasswordForm from './ChangePasswordForm';
import {
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  Shield,
  Mail,
  Hash,
  BookOpen,
} from 'lucide-react';

export const AccountSettings: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const roleLabel = user?.role === 'LIBRARIAN' ? 'Librarian Admin' : user?.role === 'TEACHER' ? 'Faculty' : 'Student';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
            <SettingsIcon className="w-6 h-6 text-slate-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900">Settings</h1>
            <p className="text-slate-500 text-sm mt-0.5">Manage your account credentials and active session</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account Overview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-amber-500" />
              Account Overview
            </h2>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center text-lg font-black shrink-0">
                  {user?.name?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{user?.name || 'User'}</p>
                  <p className="text-xs text-slate-500">{user?.email || '—'}</p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4 space-y-3">
                <SettingsRow
                  icon={Shield}
                  label="Role"
                  value={
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      {roleLabel}
                    </span>
                  }
                />
                {user?.rollNumber && (
                  <SettingsRow icon={Hash} label="Roll Number" value={user.rollNumber} />
                )}
                {user?.program && (
                  <SettingsRow icon={BookOpen} label="Program / Department" value={`${user.program}${user.branch ? ` — ${user.branch}` : ''}`} />
                )}
                <SettingsRow icon={Mail} label="Email" value={user?.email || '—'} />
              </div>
            </div>
          </div>

          {/* Session / Logout */}
          <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-red-500" />
              Active Session
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Signing out will clear your authentication cookie and terminate your current session.
            </p>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 font-extrabold text-xs rounded-xl transition border border-red-200 flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>

        {/* Right Column: Password Change */}
        <div className="lg:col-span-7 space-y-6">
          <ChangePasswordForm />
        </div>
      </div>
    </div>
  );
};

/** Reusable settings row */
const SettingsRow: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-center gap-3">
    <div className="p-1.5 rounded-lg bg-slate-50 shrink-0">
      <Icon className="w-3.5 h-3.5 text-slate-400" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="text-sm font-medium text-slate-800 mt-0.5">{value}</div>
    </div>
  </div>
);

export default AccountSettings;
