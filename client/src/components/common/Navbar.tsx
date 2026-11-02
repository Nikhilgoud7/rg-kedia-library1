import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Menu, X } from 'lucide-react';
import NotificationBell from './NotificationBell';

interface NavbarProps {
  toggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ toggleSidebar, isSidebarOpen }) => {
  const { user, logout } = useAuth();

  const getRoleBadge = () => {
    switch (user?.role) {
      case 'LIBRARIAN':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 border border-amber-300">Librarian Admin</span>;
      case 'TEACHER':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 border border-blue-300">Faculty</span>;
      case 'STUDENT':
        return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">Student ({user.program} - {user.branch})</span>;
      default:
        return null;
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand and Logo */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {toggleSidebar && (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
                aria-expanded={isSidebarOpen}
                className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors lg:hidden focus:outline-hidden focus:ring-2 focus:ring-amber-500 cursor-pointer"
              >
                {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
              </button>
            )}

            <img
              src="/images/logo.png"
              alt="R.G. Kedia College Logo"
              className="h-10 w-10 sm:h-11 sm:w-11 object-contain drop-shadow-xs shrink-0"
              onError={(e) => {
                // Fallback to icon if image fails
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-base sm:text-lg text-slate-900 tracking-tight">R.G. Kedia College</span>
                <span className="hidden sm:inline-block text-xs bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded">U.G. Library</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden md:block">
                Marwadi Siksha Samithi • Estd. 1924 • Sultan Bazar, Hyderabad
              </p>
            </div>
          </div>

          {/* User Section & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-4">
            <NotificationBell />

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-800 leading-none">{user?.name}</div>
                <div className="mt-1 flex items-center justify-end">{getRoleBadge()}</div>
              </div>

              <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs shrink-0">
                {user?.name?.charAt(0) || 'U'}
              </div>

              <button
                onClick={logout}
                title="Sign out"
                className="p-1.5 sm:p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
