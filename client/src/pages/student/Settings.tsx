import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  LogOut,
  User as UserIcon,
  Shield,
  Mail,
  Hash,
  BookOpen,
  Info,
} from 'lucide-react';

export const Settings: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

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
            <p className="text-slate-500 text-sm mt-0.5">Manage your account and session</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Account Overview */}
        <div className="lg:col-span-5">
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
                <SettingsRow icon={Shield} label="Role" value={
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {user?.role || '—'}
                  </span>
                } />
                {user?.rollNumber && (
                  <SettingsRow icon={Hash} label="Roll Number" value={user.rollNumber} />
                )}
                {user?.program && (
                  <SettingsRow icon={BookOpen} label="Program" value={`${user.program}${user.branch ? ` — ${user.branch}` : ''}`} />
                )}
                <SettingsRow icon={Mail} label="Email" value={user?.email || '—'} />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Settings & Actions */}
        <div className="lg:col-span-7 space-y-6">
          {/* Additional Settings Placeholder */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-amber-500" />
              Application Settings
            </h2>

            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                <Info className="w-7 h-7 text-slate-300" />
              </div>
              <h3 className="text-slate-800 font-bold mb-1">No additional settings available</h3>
              <p className="text-slate-500 text-xs max-w-sm">
                All available settings are shown here. Additional preferences will appear as new features are added to the library system.
              </p>
            </div>
          </div>

          {/* Session / Logout */}
          <div className="bg-white rounded-2xl border border-red-100 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <LogOut className="w-4 h-4 text-red-500" />
              Session
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Signing out will end your current session. You will need to log in again to access the library portal.
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

export default Settings;
