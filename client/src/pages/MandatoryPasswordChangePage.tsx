import React, { useState, useId } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../lib/api';
import { Lock, KeyRound, ShieldAlert, CheckCircle2, ArrowRight, Loader2, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';

export const MandatoryPasswordChangePage: React.FC = () => {
  const { user, isAuthenticated, loading, updateUser, logout } = useAuth();
  const navigate = useNavigate();

  const currentPasswordId = useId();
  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-400 mx-auto" />
          <p className="text-xs font-bold text-slate-300">Loading account status...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  // If account does not require a password change, redirect to home dashboard
  if (!user.mustChangePassword) {
    if (user.role === 'LIBRARIAN') return <Navigate to="/librarian" replace />;
    if (user.role === 'TEACHER') return <Navigate to="/teacher" replace />;
    return <Navigate to="/student" replace />;
  }

  const validate = (): boolean => {
    const errs: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};

    if (!currentPassword) {
      errs.currentPassword = 'Your current temporary password is required.';
    }

    if (!newPassword) {
      errs.newPassword = 'A new secure password is required.';
    } else if (newPassword.length < 8) {
      errs.newPassword = 'New password must be at least 8 characters long.';
    } else if (newPassword === currentPassword) {
      errs.newPassword = 'New password must be different from your current temporary password.';
    }

    if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Password confirmation does not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!validate()) return;

    try {
      setSubmitting(true);
      const res = await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      toast.success(res.data.message || 'Password updated successfully! Welcome to the library.');

      if (res.data.user) {
        updateUser(res.data.user);
        if (res.data.user.role === 'LIBRARIAN') navigate('/librarian', { replace: true });
        else if (res.data.user.role === 'TEACHER') navigate('/teacher', { replace: true });
        else navigate('/student', { replace: true });
      } else {
        // Fallback: log out and require login with new password
        await logout();
        navigate('/login', { replace: true });
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to update password. Please check your current password.';
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Ignored
    } finally {
      navigate('/login', { replace: true });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 z-0">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-4 shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Mandatory Password Change
          </h1>
          <p className="text-xs text-slate-400 mt-1.5 max-w-sm mx-auto">
            R.G. Kedia College of Commerce Information Security Policy requires you to set a personal password before continuing.
          </p>
        </div>

        {/* Account Info Pill */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 mb-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs">
            <div>
              <p className="text-slate-400 font-medium">Logged in as:</p>
              <p className="text-white font-bold">{user.name}</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                {user.role}
              </span>
              <p className="text-slate-400 text-[11px] mt-0.5">{user.email || user.rollNumber}</p>
            </div>
          </div>
        </div>

        {/* Password Form Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-sm">
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Current / Temporary Password */}
            <div>
              <label htmlFor={currentPasswordId} className="block text-xs font-bold text-slate-300 mb-1.5">
                Current / Temporary Password <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id={currentPasswordId}
                  type="password"
                  value={currentPassword}
                  onChange={(e) => {
                    setCurrentPassword(e.target.value);
                    if (errors.currentPassword) setErrors((p) => ({ ...p, currentPassword: undefined }));
                  }}
                  placeholder="Enter initial temporary password"
                  autoComplete="current-password"
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-950/80 text-white border rounded-xl placeholder:text-slate-600 focus:outline-none focus:ring-2 transition ${
                    errors.currentPassword
                      ? 'border-red-500/60 focus:ring-red-500/30'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                  }`}
                />
              </div>
              {errors.currentPassword && (
                <p className="text-[11px] text-red-400 mt-1">{errors.currentPassword}</p>
              )}
            </div>

            {/* New Password */}
            <div>
              <label htmlFor={newPasswordId} className="block text-xs font-bold text-slate-300 mb-1.5">
                New Personal Password <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id={newPasswordId}
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (errors.newPassword) setErrors((p) => ({ ...p, newPassword: undefined }));
                  }}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-950/80 text-white border rounded-xl placeholder:text-slate-600 focus:outline-none focus:ring-2 transition ${
                    errors.newPassword
                      ? 'border-red-500/60 focus:ring-red-500/30'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                  }`}
                />
              </div>
              {errors.newPassword && (
                <p className="text-[11px] text-red-400 mt-1">{errors.newPassword}</p>
              )}
            </div>

            {/* Confirm New Password */}
            <div>
              <label htmlFor={confirmPasswordId} className="block text-xs font-bold text-slate-300 mb-1.5">
                Confirm New Password <span className="text-amber-400">*</span>
              </label>
              <div className="relative">
                <CheckCircle2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  id={confirmPasswordId}
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: undefined }));
                  }}
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                  className={`w-full pl-10 pr-3.5 py-2.5 text-sm bg-slate-950/80 text-white border rounded-xl placeholder:text-slate-600 focus:outline-none focus:ring-2 transition ${
                    errors.confirmPassword
                      ? 'border-red-500/60 focus:ring-red-500/30'
                      : 'border-slate-800 focus:border-amber-400 focus:ring-amber-400/20'
                  }`}
                />
              </div>
              {errors.confirmPassword && (
                <p className="text-[11px] text-red-400 mt-1">{errors.confirmPassword}</p>
              )}
            </div>

            {/* Password Policy Checklist */}
            <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-850 text-[11px] text-slate-400 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${newPassword.length >= 8 ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className={newPassword.length >= 8 ? 'text-slate-200' : ''}>At least 8 characters long</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${newPassword && newPassword !== currentPassword ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className={newPassword && newPassword !== currentPassword ? 'text-slate-200' : ''}>Different from temporary password</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${confirmPassword && newPassword === confirmPassword ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                <span className={confirmPassword && newPassword === confirmPassword ? 'text-slate-200' : ''}>Passwords match</span>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full mt-2 py-3 px-4 rounded-xl font-bold text-sm bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-400/20 flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <span>Set New Password & Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Sign Out Option */}
          <div className="mt-6 pt-5 border-t border-slate-800 text-center">
            <button
              type="button"
              onClick={handleLogout}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Not your account? Sign out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MandatoryPasswordChangePage;
