import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  BookOpen,
  Users,
  GitPullRequest,
  CheckSquare,
  FileText,
  BookmarkCheck,
  RotateCcw,
  Sparkles,
  Layers,
  GraduationCap,
  Bell,
  UserCircle,
  Settings,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { user } = useAuth();

  const getNavItems = () => {
    switch (user?.role) {
      case 'LIBRARIAN':
        return [
          { to: '/librarian', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/librarian/books', label: 'Book Inventory', icon: BookOpen },
          { to: '/librarian/requests', label: 'Lending Requests', icon: GitPullRequest },
          { to: '/librarian/issued', label: 'Issued Books & Returns', icon: CheckSquare },
          { to: '/librarian/exam-guide', label: 'Exam Guide & Papers', icon: FileText },
          { to: '/librarian/users', label: 'Student & Faculty Users', icon: Users },
          { to: '/librarian/profile', label: 'My Profile', icon: UserCircle },
          { to: '/librarian/settings', label: 'Settings', icon: Settings },
        ];
      case 'TEACHER':
        return [
          { to: '/teacher', label: 'Dashboard', icon: LayoutDashboard },
          { to: '/teacher/browse', label: 'Browse Library Books', icon: BookOpen },
          { to: '/teacher/borrowings', label: 'My Borrowed Books', icon: BookmarkCheck },
          { to: '/teacher/request-return', label: 'Request Book Return', icon: RotateCcw },
          { to: '/teacher/exam-guide', label: 'Exam Guide & Uploads', icon: GraduationCap },
          { to: '/teacher/profile', label: 'My Profile', icon: UserCircle },
          { to: '/teacher/settings', label: 'Settings', icon: Settings },
        ];
      case 'STUDENT':
      default:
        return [
          { to: '/student', label: 'My Dashboard', icon: LayoutDashboard },
          { to: '/student/browse', label: 'Browse & Borrow Books', icon: BookOpen },
          { to: '/student/borrowings', label: 'My Issued Books', icon: BookmarkCheck },
          { to: '/student/exam-guide', label: 'Exam Guide & QP Papers', icon: GraduationCap },
          { to: '/student/notifications', label: 'Notifications', icon: Bell },
          { to: '/student/profile', label: 'My Profile', icon: UserCircle },
          { to: '/student/settings', label: 'Settings', icon: Settings },
        ];
    }
  };

  const navItems = getNavItems();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-[calc(100vh-4rem)]">
      {/* College Info Header */}
      <div className="p-5 border-b border-slate-800/80">
        <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <Layers className="w-4 h-4 text-amber-400" />
          <span>UG Library Portal</span>
        </div>
        <div className="mt-2 text-xs text-slate-400 font-medium leading-relaxed">
          {user?.role === 'STUDENT' && (
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-bold block">{user.program}</span>
              <span className="text-amber-400 block text-[11px] font-semibold">{user.branch}</span>
              <span className="text-slate-400 text-[10px]">Sem {user.semester || 1} • Lang: {user.secondLanguage || 'None'}</span>
            </div>
          )}
          {user?.role === 'TEACHER' && (
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-bold block">Faculty Portal</span>
              <span className="text-amber-400 text-[11px] block">{user.branch || user.program || 'Commerce & Sciences'}</span>
            </div>
          )}
          {user?.role === 'LIBRARIAN' && (
            <div className="bg-slate-800/60 p-2.5 rounded-lg border border-slate-700/50">
              <span className="text-slate-200 font-bold block">Librarian Administration</span>
              <span className="text-emerald-400 text-[11px] font-semibold block">Full Access Control</span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split('/').length <= 2}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / Sanskrit Motto */}
      <div className="p-4 border-t border-slate-800 text-center">
        <p className="text-[11px] font-serif text-amber-300/80 tracking-wide">
          " सा विद्या या विमुक्तये "
        </p>
        <p className="text-[9px] text-slate-500 mt-0.5">
          Knowledge is that which liberates
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
