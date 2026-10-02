import React, { useState } from 'react';
import api from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, KeyRound, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';

export const ChangePasswordForm: React.FC = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string; confirmPassword?: string }>({});

  const validate = (): boolean => {
    const errs: { currentPassword?: string; newPassword?: string; confirmPassword?: string } = {};

    if (!currentPassword) {
      errs.currentPassword = 'Current password is required.';
    }

    if (!newPassword) {
      errs.newPassword = 'New password is required.';
    } else if (newPassword.length < 6) {
      errs.newPassword = 'New password must be at least 6 characters.';
    }

    if (newPassword !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      const res = await api.put('/auth/change-password', {
        currentPassword,
        newPassword,
      });

      toast.success(res.data.message || 'Password changed successfully. Please log in again.');
      
      // Perform logout & navigate to login as session has been invalidated
      await logout();
      navigate('/login', { replace: true });
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to change password.';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
      <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
        <KeyRound className="w-4 h-4 text-amber-500" />
        Change Password
      </h2>
      <p className="text-xs text-slate-500 mb-5">
        Updating your password will end all active sessions across your devices. You will need to log in again with your new password.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Current Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (errors.currentPassword) setErrors((p) => ({ ...p, currentPassword: undefined }));
              }}
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition ${
                errors.currentPassword
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-amber-200 focus:border-amber-400'
              }`}
              placeholder="Enter current password"
            />
          </div>
          {errors.currentPassword && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.currentPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (errors.newPassword) setErrors((p) => ({ ...p, newPassword: undefined }));
              }}
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition ${
                errors.newPassword
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-amber-200 focus:border-amber-400'
              }`}
              placeholder="Minimum 6 characters"
            />
          </div>
          {errors.newPassword && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.newPassword}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">
            Confirm New Password <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: undefined }));
              }}
              className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition ${
                errors.confirmPassword
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-slate-200 focus:ring-amber-200 focus:border-amber-400'
              }`}
              placeholder="Re-enter new password"
            />
          </div>
          {errors.confirmPassword && (
            <p className="text-xs text-red-500 mt-1 font-medium">{errors.confirmPassword}</p>
          )}
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChangePasswordForm;
