import React, { useState, useEffect, useId } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';
import { User } from '../../types';
import {
  User as UserIcon,
  Mail,
  Phone,
  GraduationCap,
  Hash,
  Calendar,
  Shield,
  CheckCircle,
  XCircle,
  Pencil,
  Save,
  X,
  RefreshCcw,
  AlertTriangle,
  Loader2,
  Building,
  Award,
} from 'lucide-react';
import toast from 'react-hot-toast';

export const ProfilePage: React.FC = () => {
  const { refreshProfile } = useAuth();
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const nameInputId = useId();
  const phoneInputId = useId();

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; phone?: string }>({});

  const fetchProfile = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get('/user/profile');
      setProfile(res.data.user);
    } catch (err: any) {
      console.error(err);
      setError('Failed to load your profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const startEditing = () => {
    if (!profile) return;
    setEditName(profile.name);
    setEditPhone(profile.phone || '');
    setFieldErrors({});
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setFieldErrors({});
  };

  const validateForm = (): boolean => {
    const errors: { name?: string; phone?: string } = {};

    if (!editName.trim()) {
      errors.name = 'Name is required.';
    } else if (editName.trim().length > 100) {
      errors.name = 'Name must be 100 characters or fewer.';
    }

    if (editPhone.trim()) {
      const phoneRegex = /^[+\d][\d\s\-().]{5,19}$/;
      if (!phoneRegex.test(editPhone.trim())) {
        errors.phone = 'Please enter a valid phone number (6-20 digits).';
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      setSaving(true);
      const res = await api.put('/user/profile', {
        name: editName.trim(),
        phone: editPhone.trim() || null,
      });
      setProfile(res.data.user);
      setIsEditing(false);
      toast.success('Profile updated successfully!');
      await refreshProfile();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to update profile.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
        <p className="text-slate-400 font-medium text-sm">Loading your profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-3" />
        <h3 className="text-slate-800 font-bold mb-1">Could not load profile</h3>
        <p className="text-slate-500 text-sm mb-4">{error || 'Profile data unavailable.'}</p>
        <button
          onClick={fetchProfile}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-bold flex items-center gap-2 transition"
        >
          <RefreshCcw className="w-4 h-4" /> Try Again
        </button>
      </div>
    );
  }

  const roleLabel = profile.role === 'LIBRARIAN' ? 'Librarian Admin' : profile.role === 'TEACHER' ? 'Faculty' : 'Student';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 text-white shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center text-2xl font-black shadow-sm shrink-0">
            {profile.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black">{profile.name}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="text-[11px] font-extrabold uppercase tracking-widest text-amber-400 bg-white/10 px-2.5 py-0.5 rounded-full border border-white/15">
                {roleLabel}
              </span>
              {profile.rollNumber && (
                <span className="text-xs text-slate-300 font-medium">
                  Roll: {profile.rollNumber}
                </span>
              )}
            </div>
          </div>
        </div>

        {!isEditing && (
          <button
            onClick={startEditing}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5"
          >
            <Pencil className="w-4 h-4" />
            Edit Profile
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Account & Contact */}
        <div className="lg:col-span-5 space-y-6">
          {/* Account Info Card */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-500" />
              Account Information
            </h2>
            <div className="space-y-4">
              <InfoRow icon={Mail} label="Email" value={profile.email} />
              <InfoRow
                icon={Shield}
                label="Role"
                value={
                  <span className="px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {roleLabel}
                  </span>
                }
              />
              {profile.rollNumber && (
                <InfoRow icon={Hash} label="Roll Number" value={profile.rollNumber} />
              )}
              <InfoRow
                icon={profile.active ? CheckCircle : XCircle}
                label="Account Status"
                value={
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold ${
                      profile.active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    {profile.active ? 'Active' : 'Inactive'}
                  </span>
                }
              />
              <InfoRow icon={Calendar} label="Member Since" value={formatDate(profile.createdAt)} />
            </div>
          </div>

          {/* Contact Info Card (Editable) */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <Phone className="w-4 h-4 text-amber-500" />
              Contact Information
            </h2>

            {isEditing ? (
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label htmlFor={nameInputId} className="block text-xs font-bold text-slate-700 mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id={nameInputId}
                      type="text"
                      value={editName}
                      onChange={(e) => {
                        setEditName(e.target.value);
                        if (fieldErrors.name) setFieldErrors((p) => ({ ...p, name: undefined }));
                      }}
                      aria-invalid={!!fieldErrors.name}
                      aria-describedby={fieldErrors.name ? `${nameInputId}-error` : undefined}
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition ${
                        fieldErrors.name
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-amber-200 focus:border-amber-400'
                      }`}
                      placeholder="Enter your full name"
                      maxLength={100}
                    />
                  </div>
                  {fieldErrors.name && (
                    <p id={`${nameInputId}-error`} role="alert" className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.name}</p>
                  )}
                </div>

                <div>
                  <label htmlFor={phoneInputId} className="block text-xs font-bold text-slate-700 mb-1.5">
                    Phone Number <span className="text-slate-400">(Optional)</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id={phoneInputId}
                      type="tel"
                      value={editPhone}
                      onChange={(e) => {
                        setEditPhone(e.target.value);
                        if (fieldErrors.phone) setFieldErrors((p) => ({ ...p, phone: undefined }));
                      }}
                      aria-invalid={!!fieldErrors.phone}
                      aria-describedby={fieldErrors.phone ? `${phoneInputId}-error` : undefined}
                      className={`w-full pl-10 pr-3 py-2.5 text-sm border rounded-xl focus:outline-none focus:ring-2 transition ${
                        fieldErrors.phone
                          ? 'border-red-300 focus:ring-red-200'
                          : 'border-slate-200 focus:ring-amber-200 focus:border-amber-400'
                      }`}
                      placeholder="e.g. +91 98765 43210"
                      maxLength={20}
                    />
                  </div>
                  {fieldErrors.phone && (
                    <p id={`${phoneInputId}-error`} role="alert" className="text-xs text-red-500 mt-1 font-medium">{fieldErrors.phone}</p>
                  )}
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl transition shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {saving ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={saving}
                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <InfoRow icon={UserIcon} label="Full Name" value={profile.name} />
                <InfoRow
                  icon={Phone}
                  label="Phone"
                  value={profile.phone || <span className="text-slate-400 italic">Not provided</span>}
                />
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Role-Specific Details */}
        <div className="lg:col-span-7">
          {profile.role === 'STUDENT' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-amber-500" />
                Academic Information
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded ml-1 uppercase">
                  Read Only
                </span>
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Academic details are managed by the college administration. Contact the librarian to update these fields.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOnlyField label="Program" value={profile.program || '—'} />
                <ReadOnlyField label="Branch" value={profile.branch || '—'} />
                <ReadOnlyField label="Year" value={profile.year != null ? `Year ${profile.year}` : '—'} />
                <ReadOnlyField label="Semester" value={profile.semester != null ? `Semester ${profile.semester}` : '—'} />
                <ReadOnlyField label="Second Language" value={profile.secondLanguage || '—'} />
                <ReadOnlyField label="Roll Number" value={profile.rollNumber || '—'} />
              </div>
            </div>
          )}

          {profile.role === 'TEACHER' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Building className="w-4 h-4 text-amber-500" />
                Faculty Affiliation
                <span className="text-[10px] text-slate-400 font-semibold bg-slate-100 px-2 py-0.5 rounded ml-1 uppercase">
                  Read Only
                </span>
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Faculty assignment and department details are maintained by the college administration.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ReadOnlyField label="Assigned Program" value={profile.program || 'General Academic'} />
                <ReadOnlyField label="Department / Branch" value={profile.branch || 'Commerce & Sciences'} />
              </div>
            </div>
          )}

          {profile.role === 'LIBRARIAN' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Administrative Access Control
              </h2>
              <p className="text-xs text-slate-500 mb-5">
                Librarian accounts have elevated access rights across all modules of the R.G. Kedia College Library Management System.
              </p>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                  <Shield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">System Administrator Permissions</h4>
                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
                      Includes full catalog CRUD, user management, loan issuance & returns approval, exam paper management, and fine management.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/** Reusable info row */
const InfoRow: React.FC<{
  icon: React.FC<{ className?: string }>;
  label: string;
  value: React.ReactNode;
}> = ({ icon: Icon, label, value }) => (
  <div className="flex items-start gap-3">
    <div className="p-2 rounded-lg bg-slate-50 shrink-0">
      <Icon className="w-4 h-4 text-slate-500" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <div className="text-sm font-medium text-slate-800 mt-0.5 break-words">{value}</div>
    </div>
  </div>
);

/** Read-only field styling */
const ReadOnlyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <label className="block text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
      {label}
    </label>
    <div className="px-3 py-2.5 text-sm font-medium text-slate-700 bg-slate-50 border border-slate-100 rounded-xl">
      {value}
    </div>
  </div>
);

export default ProfilePage;
