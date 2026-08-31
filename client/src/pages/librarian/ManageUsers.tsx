import React, { useState, useEffect } from 'react';
import api from '../../lib/api';
import { User, Role, Program, SecondLanguage } from '../../types';
import Modal from '../../components/common/Modal';
import { Plus, Search, Users, Key, GraduationCap, ShieldCheck, CheckCircle2, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export const ManageUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [programFilter, setProgramFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: 'password123',
    role: 'STUDENT' as Role,
    rollNumber: '',
    program: 'BCOM' as Program,
    branch: 'General',
    year: 1,
    semester: 1,
    secondLanguage: 'TELUGU' as SecondLanguage,
    phone: '',
  });

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/users', {
        params: {
          role: roleFilter || undefined,
          program: programFilter || undefined,
          search: search || undefined,
        },
      });
      setUsers(res.data.users || []);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [roleFilter, programFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/users', formData);
      toast.success('User account created successfully!');
      setIsAddModalOpen(false);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword) return;
    try {
      await api.put(`/admin/users/${selectedUser.id}/reset-password`, { newPassword });
      toast.success(`Password reset for ${selectedUser.name}!`);
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reset password');
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.put(`/admin/users/${user.id}`, { active: !user.active });
      toast.success(`User ${user.active ? 'deactivated' : 'activated'}`);
      fetchUsers();
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Student & Faculty Directory</h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage library membership cards, branch affiliations, and second language choices
          </p>
        </div>
        <button
          onClick={() => {
            setFormData({
              name: '',
              email: '',
              password: 'password123',
              role: 'STUDENT',
              rollNumber: '',
              program: 'BCOM',
              branch: 'General',
              year: 1,
              semester: 1,
              secondLanguage: 'TELUGU',
              phone: '',
            });
            setIsAddModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition"
        >
          <Plus className="w-4 h-4" />
          <span>Register New Member</span>
        </button>
      </div>

      {/* Filters and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 w-full flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              placeholder="Search by student name, roll number, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition"
          >
            Search
          </button>
        </form>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
          >
            <option value="">All Roles</option>
            <option value="STUDENT">Students</option>
            <option value="TEACHER">Faculty Members</option>
            <option value="LIBRARIAN">Librarians</option>
          </select>

          <select
            value={programFilter}
            onChange={(e) => setProgramFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-700 font-medium"
          >
            <option value="">All Programs</option>
            <option value="BCOM">B.Com</option>
            <option value="BBA">BBA</option>
            <option value="BSC">B.Sc</option>
          </select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                <th className="py-3.5 px-4">Member Name & Email</th>
                <th className="py-3.5 px-4">Role & Roll Number</th>
                <th className="py-3.5 px-4">Program & Branch</th>
                <th className="py-3.5 px-4">Second Language</th>
                <th className="py-3.5 px-4">Contact</th>
                <th className="py-3.5 px-4 text-right">Account Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    Loading users directory...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    No members found
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 text-sm">{u.name}</div>
                      <div className="text-slate-500 font-medium">{u.email}</div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          u.role === 'STUDENT'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : u.role === 'TEACHER'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {u.role}
                      </span>
                      {u.rollNumber && (
                        <div className="text-slate-700 font-mono font-bold mt-1 text-[11px]">
                          {u.rollNumber}
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.program ? (
                        <div>
                          <span className="font-bold text-slate-800">{u.program}</span>
                          <span className="text-slate-500 block text-[11px] font-medium">{u.branch}</span>
                          {u.semester && (
                            <span className="text-[10px] text-slate-400">Semester {u.semester}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">General Staff</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {u.secondLanguage ? (
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {u.secondLanguage}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {u.phone || '—'}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setIsPasswordModalOpen(true);
                          }}
                          title="Reset Password"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(u)}
                          title={u.active ? 'Deactivate user' : 'Activate user'}
                          className={`p-1.5 rounded-lg transition ${
                            u.active
                              ? 'text-emerald-600 hover:bg-emerald-50'
                              : 'text-red-500 hover:bg-red-50'
                          }`}
                        >
                          {u.active ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Register New Student or Faculty Member"
        maxWidth="xl"
      >
        <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Ramesh Reddy"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="e.g. ramesh.r@student.rgkedia.edu.in"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-medium"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Role *</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
              >
                <option value="STUDENT">Student</option>
                <option value="TEACHER">Faculty Member (Teacher)</option>
                <option value="LIBRARIAN">Librarian Administrator</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1">Initial Password *</label>
              <input
                type="text"
                required
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
              />
            </div>
          </div>

          {formData.role === 'STUDENT' && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Roll Number (Unique) *</label>
                  <input
                    type="text"
                    required
                    value={formData.rollNumber}
                    onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })}
                    placeholder="e.g. 1052-24-401-050"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Degree Program *</label>
                  <select
                    value={formData.program}
                    onChange={(e) => {
                      const prog = e.target.value as Program;
                      setFormData({
                        ...formData,
                        program: prog,
                        branch: prog === 'BCOM' ? 'General' : prog === 'BBA' ? 'General Business Administration' : 'Computer Science & Data',
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                  >
                    <option value="BCOM">Bachelor of Commerce (B.Com)</option>
                    <option value="BBA">Bachelor of Business Administration (BBA)</option>
                    <option value="BSC">Bachelor of Science (B.Sc)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Branch / Specialization *</label>
                  {formData.program === 'BCOM' && (
                    <select
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="General">B.Com General</option>
                      <option value="Computer Applications">B.Com Computer Applications</option>
                      <option value="Business Analytics">B.Com Business Analytics</option>
                      <option value="Honors">B.Com Honors</option>
                    </select>
                  )}
                  {formData.program === 'BBA' && (
                    <select
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="General Business Administration">General Business Administration</option>
                    </select>
                  )}
                  {formData.program === 'BSC' && (
                    <select
                      value={formData.branch}
                      onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="Mathematics">B.Sc Mathematics</option>
                      <option value="Statistics">B.Sc Statistics</option>
                      <option value="Computer Science & Data">B.Sc Computer Science & Data</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Second Language Choice *</label>
                  <select
                    value={formData.secondLanguage}
                    onChange={(e) => setFormData({ ...formData, secondLanguage: e.target.value as SecondLanguage })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-bold"
                  >
                    <option value="TELUGU">Telugu (తెలుగు)</option>
                    <option value="SANSKRIT">Sanskrit (संस्कृतम्)</option>
                    <option value="HINDI">Hindi (हिन्दी)</option>
                    <option value="ARABIC">Arabic (العربية)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Current Year</label>
                  <select
                    value={formData.year}
                    onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="1">1st Year</option>
                    <option value="2">2nd Year</option>
                    <option value="3">3rd Year</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Current Semester</label>
                  <select
                    value={formData.semester}
                    onChange={(e) => setFormData({ ...formData, semester: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6].map((s) => (
                      <option key={s} value={s}>
                        Semester {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block font-bold text-slate-700 mb-1">Phone Number (Optional)</label>
            <input
              type="text"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="e.g. 9849012345"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
            />
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold rounded-xl shadow-xs transition"
            >
              Register Member
            </button>
          </div>
        </form>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
        title={`Reset Password for ${selectedUser?.name || 'User'}`}
        maxWidth="md"
      >
        <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
          <p className="text-slate-500 leading-relaxed">
            Enter a new password for this account. Minimum 6 characters required.
          </p>
          <div>
            <label className="block font-bold text-slate-700 mb-1">New Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono"
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPasswordModalOpen(false)}
              className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-bold transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl font-bold transition"
            >
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default ManageUsers;
