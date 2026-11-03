import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';
import {
  GraduationCap,
  UserCheck,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Clock,
  AlertCircle,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface RegisterPageProps {
  defaultTab?: 'STUDENT' | 'TEACHER';
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ defaultTab }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const queryType = searchParams.get('type')?.toUpperCase();
  const initialRole: 'STUDENT' | 'TEACHER' =
    queryType === 'TEACHER' || queryType === 'FACULTY'
      ? 'TEACHER'
      : defaultTab === 'TEACHER'
      ? 'TEACHER'
      : 'STUDENT';

  const [activeTab, setActiveTab] = useState<'STUDENT' | 'TEACHER'>(initialRole);
  const [isLoading, setIsLoading] = useState(false);
  const [submittedData, setSubmittedData] = useState<{
    name: string;
    email: string;
    role: string;
    program: string;
    rollNumber?: string;
    semester?: number;
  } | null>(null);

  // Common Form States
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'MALE' | 'FEMALE' | 'OTHER'>('MALE');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Student-specific States
  const [rollNumber, setRollNumber] = useState('');
  const [studentProgram, setStudentProgram] = useState('BCOM');
  const [studentBranch, setStudentBranch] = useState('Computer Applications');
  const [semester, setSemester] = useState('1');

  // Teacher-specific States
  const [teacherProgram, setTeacherProgram] = useState('Commerce');
  const [teacherBranch, setTeacherBranch] = useState('');

  useEffect(() => {
    if (queryType === 'TEACHER' || queryType === 'FACULTY') {
      setActiveTab('TEACHER');
    } else if (queryType === 'STUDENT') {
      setActiveTab('STUDENT');
    }
  }, [queryType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Password and confirm password do not match');
      return;
    }

    setIsLoading(true);
    try {
      if (activeTab === 'STUDENT') {
        if (!rollNumber.trim()) {
          toast.error('Please enter your Roll Number / Hall Ticket Number');
          setIsLoading(false);
          return;
        }

        const payload = {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          rollNumber: rollNumber.trim().toUpperCase(),
          program: studentProgram,
          branch: studentBranch.trim() || undefined,
          semester: parseInt(semester, 10),
          gender,
          phone: phone.trim() || undefined,
          password,
          confirmPassword,
        };

        const response = await api.post('/auth/register/student', payload);
        toast.success('Registration submitted! Awaiting librarian approval.');
        setSubmittedData({
          name: payload.name,
          email: payload.email,
          role: 'STUDENT',
          program: payload.program,
          rollNumber: payload.rollNumber,
          semester: payload.semester,
        });
      } else {
        // Teacher registration - NO Staff ID or semester
        const payload = {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          program: teacherProgram.trim(),
          branch: teacherBranch.trim() || undefined,
          gender,
          phone: phone.trim() || undefined,
          password,
          confirmPassword,
        };

        const response = await api.post('/auth/register/teacher', payload);
        toast.success('Registration submitted! Awaiting librarian approval.');
        setSubmittedData({
          name: payload.name,
          email: payload.email,
          role: 'TEACHER',
          program: payload.program,
        });
      }
    } catch (err: any) {
      console.error('Registration error:', err);
      const errorMsg =
        err.response?.data?.error || 'Registration failed. Please check your information.';
      toast.error(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center relative overflow-hidden py-10">
      {/* College Background Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/college.jpg"
          alt="R.G. Kedia College Campus"
          className="w-full h-full object-cover object-center opacity-20 scale-105 filter blur-xs"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/85 to-slate-900/70" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-4 w-full">
        {/* Header Branding */}
        <div className="text-center mb-8 space-y-3">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-amber-400 transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Sign In</span>
          </Link>

          <div className="flex items-center justify-center gap-3">
            <img
              src="/images/logo.png"
              alt="Marwadi Siksha Samithi Logo"
              className="w-12 h-12 object-contain drop-shadow-md"
            />
            <div className="text-left">
              <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400 block">
                Marwadi Siksha Samithi
              </span>
              <span className="text-[11px] text-slate-300">
                Ramnath Guljarilal Kedia College of Commerce
              </span>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Library Membership Self-Registration
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Submit your information for library access. All new accounts are reviewed and approved by the college Librarian before access is granted.
          </p>
        </div>

        {/* Success Confirmation Card */}
        {submittedData ? (
          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-2xl border border-slate-200 text-center max-w-xl mx-auto animate-fade-in">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-5 text-amber-600">
              <Clock className="w-9 h-9 animate-pulse" />
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold bg-amber-100 text-amber-800 uppercase tracking-wider mb-3">
              <span>Status: Awaiting Librarian Approval</span>
            </div>

            <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-2">
              Registration Submitted!
            </h2>

            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              Thank you, <strong className="text-slate-900">{submittedData.name}</strong>. Your library membership registration has been received and is queued for verification by the college librarian.
            </p>

            {/* Submission Summary */}
            <div className="bg-slate-50 rounded-2xl p-4 text-left text-xs space-y-2 border border-slate-200 mb-6">
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Applicant Name</span>
                <span className="text-slate-900 font-bold">{submittedData.name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Account Role</span>
                <span className="text-amber-700 font-bold">
                  {submittedData.role === 'STUDENT' ? 'Student' : 'Faculty / Teacher'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/60">
                <span className="text-slate-500 font-medium">Registered Email</span>
                <span className="text-slate-900 font-bold">{submittedData.email}</span>
              </div>
              {submittedData.rollNumber && (
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 font-medium">Roll Number</span>
                  <span className="text-slate-900 font-mono font-bold">
                    {submittedData.rollNumber}
                  </span>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-slate-500 font-medium">Program / Dept</span>
                <span className="text-slate-900 font-bold">
                  {submittedData.program}
                  {submittedData.semester ? ` (Sem ${submittedData.semester})` : ''}
                </span>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 mb-6 flex items-start gap-2.5 text-left">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                You cannot log in until your application is approved. Once the librarian verifies your enrollment, you can sign in with your email/roll number and password.
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Return to Login</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          /* Registration Form Card */
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200">
            {/* Role Tabs */}
            <div className="flex rounded-2xl bg-slate-100 p-1.5 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('STUDENT')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                  activeTab === 'STUDENT'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <GraduationCap className="w-4 h-4 text-amber-600" />
                <span>Student Registration</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('TEACHER')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer ${
                  activeTab === 'TEACHER'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4 text-blue-600" />
                <span>Faculty / Teacher Registration</span>
              </button>
            </div>

            {/* Librarian Approval Notice */}
            <div className="mb-6 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2.5">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>
                <strong>Approval Required:</strong> After submitting, an existing Librarian will review your details before your account is activated.
              </span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={activeTab === 'STUDENT' ? 'e.g. Rahul Sharma' : 'e.g. Dr. Sunitha Rao'}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      activeTab === 'STUDENT'
                        ? 'student@rgkedia.edu.in'
                        : 'faculty@rgkedia.edu.in'
                    }
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium bg-white"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                {/* Student specific: Roll Number */}
                {activeTab === 'STUDENT' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Roll Number / Hall Ticket <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={rollNumber}
                      onChange={(e) => setRollNumber(e.target.value)}
                      placeholder="e.g. 1052-24-401-001"
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium uppercase font-mono"
                    />
                  </div>
                )}

                {/* Student specific: Program & Semester */}
                {activeTab === 'STUDENT' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Course / Program <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={studentProgram}
                        onChange={(e) => setStudentProgram(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium bg-white"
                      >
                        <option value="BCOM">B.Com (Bachelor of Commerce)</option>
                        <option value="BBA">B.B.A (Business Administration)</option>
                        <option value="BSC">B.Sc (Bachelor of Science)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Semester <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium bg-white"
                      >
                        <option value="1">Semester 1 (Year 1)</option>
                        <option value="2">Semester 2 (Year 1)</option>
                        <option value="3">Semester 3 (Year 2)</option>
                        <option value="4">Semester 4 (Year 2)</option>
                        <option value="5">Semester 5 (Year 3)</option>
                        <option value="6">Semester 6 (Year 3)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Branch / Specialization
                      </label>
                      <input
                        type="text"
                        value={studentBranch}
                        onChange={(e) => setStudentBranch(e.target.value)}
                        placeholder="e.g. Computer Applications, General, Tax"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                      />
                    </div>
                  </>
                )}

                {/* Teacher specific: Department / Program & Specialization */}
                {activeTab === 'TEACHER' && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Department / Program <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={teacherProgram}
                        onChange={(e) => setTeacherProgram(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium bg-white"
                      >
                        <option value="Commerce">Department of Commerce (B.Com)</option>
                        <option value="Management">Department of Business Administration (BBA)</option>
                        <option value="Computer Science">Department of Computer Science (B.Sc)</option>
                        <option value="Languages">Department of Languages</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                        Specialization / Designation
                      </label>
                      <input
                        type="text"
                        value={teacherBranch}
                        onChange={(e) => setTeacherBranch(e.target.value)}
                        placeholder="e.g. Financial Accounting, Marketing"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                      />
                    </div>
                  </>
                )}

                {/* Phone Number */}
                <div className={activeTab === 'TEACHER' ? 'sm:col-span-2' : ''}>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Phone Number (Optional)
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Password (Min 8 chars) <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Create a strong password"
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat your password"
                      className="w-full px-4 py-2.5 pr-10 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 text-sm font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full mt-6 py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? (
                  'Submitting Application...'
                ) : (
                  <>
                    <span>Submit {activeTab === 'STUDENT' ? 'Student' : 'Faculty'} Registration</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {/* Back to Login link */}
              <div className="text-center pt-4 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Already registered or have an account?{' '}
                  <Link to="/login" className="text-amber-600 hover:text-amber-700 font-bold hover:underline">
                    Sign in here
                  </Link>
                </span>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default RegisterPage;
