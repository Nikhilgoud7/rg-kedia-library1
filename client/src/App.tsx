import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Toaster } from 'react-hot-toast';

// Common Components
import Navbar from './components/common/Navbar';
import Sidebar from './components/common/Sidebar';

// Pages
import LoginPage from './pages/LoginPage';

// Librarian Pages
import LibrarianDashboard from './pages/librarian/Dashboard';
import ManageBooks from './pages/librarian/ManageBooks';
import ManageUsers from './pages/librarian/ManageUsers';
import LendingRequests from './pages/librarian/LendingRequests';
import IssuedBooks from './pages/librarian/IssuedBooks';
import ManageExamGuide from './pages/librarian/ManageExamGuide';
import LibrarianProfile from './pages/librarian/Profile';
import LibrarianSettings from './pages/librarian/Settings';
import LibrarianNotifications from './pages/librarian/Notifications';

// Student Pages
import StudentDashboard from './pages/student/Dashboard';
import BrowseBooks from './pages/student/BrowseBooks';
import MyBorrowings from './pages/student/MyBorrowings';
import ExamGuide from './pages/student/ExamGuide';
import Notifications from './pages/student/Notifications';
import StudentProfile from './pages/student/Profile';
import StudentSettings from './pages/student/Settings';

// Teacher Pages
import TeacherDashboard from './pages/teacher/Dashboard';
import TeacherBrowseBooks from './pages/teacher/BrowseBooks';
import RequestReturn from './pages/teacher/RequestReturn';
import TeacherProfile from './pages/teacher/Profile';
import TeacherSettings from './pages/teacher/Settings';
import TeacherNotifications from './pages/teacher/Notifications';

// Layout wrapper for authenticated pages
const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
};

// Route Guard
const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: string[];
}> = ({ children, allowedRoles }) => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400 mx-auto" />
          <p className="text-xs font-bold text-slate-300">Loading R.G. Kedia College Library...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    // Redirect to user's home dashboard
    if (user.role === 'LIBRARIAN') return <Navigate to="/librarian" replace />;
    if (user.role === 'TEACHER') return <Navigate to="/teacher" replace />;
    return <Navigate to="/student" replace />;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
};

// Root index redirector
const RootRedirect: React.FC = () => {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) return null;
  if (!isAuthenticated || !user) return <Navigate to="/login" replace />;

  if (user.role === 'LIBRARIAN') return <Navigate to="/librarian" replace />;
  if (user.role === 'TEACHER') return <Navigate to="/teacher" replace />;
  return <Navigate to="/student" replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#0f172a',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '12px',
              border: '1px solid #334155',
            },
          }}
        />

        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RootRedirect />} />

          {/* Librarian Routes */}
          <Route
            path="/librarian"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <LibrarianDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/books"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <ManageBooks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/users"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <ManageUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/requests"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <LendingRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/issued"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <IssuedBooks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/exam-guide"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <ManageExamGuide />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/profile"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <LibrarianProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/notifications"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <LibrarianNotifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/librarian/settings"
            element={
              <ProtectedRoute allowedRoles={['LIBRARIAN']}>
                <LibrarianSettings />
              </ProtectedRoute>
            }
          />

          {/* Student Routes */}
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/browse"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <BrowseBooks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/borrowings"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <MyBorrowings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/exam-guide"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <ExamGuide />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/notifications"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <Notifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/profile"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <StudentProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/settings"
            element={
              <ProtectedRoute allowedRoles={['STUDENT']}>
                <StudentSettings />
              </ProtectedRoute>
            }
          />

          {/* Teacher Routes */}
          <Route
            path="/teacher"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/browse"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <TeacherBrowseBooks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/borrowings"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <MyBorrowings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/request-return"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <RequestReturn />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/exam-guide"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <ManageExamGuide />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/profile"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <TeacherProfile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/notifications"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <TeacherNotifications />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/settings"
            element={
              <ProtectedRoute allowedRoles={['TEACHER']}>
                <TeacherSettings />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
