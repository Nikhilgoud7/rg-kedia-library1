import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BookOpen, ShieldCheck, GraduationCap, UserCheck, Key, ArrowRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'STUDENT' | 'FACULTY'>('STUDENT');
  const [identifier, setIdentifier] = useState('1052-24-401-001'); // default student roll
  const [password, setPassword] = useState('password123');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      toast.error('Please enter both your ID and password');
      return;
    }

    setIsLoading(true);
    try {
      const isEmail = identifier.includes('@');
      const credentials = isEmail
        ? { email: identifier, password }
        : { rollNumber: identifier, password };

      const user = await login(credentials);
      toast.success(`Welcome back, ${user.name}!`);

      // Redirect based on role
      if (user.mustChangePassword) {
        navigate('/change-password');
      } else if (user.role === 'LIBRARIAN') {
        navigate('/librarian');
      } else if (user.role === 'TEACHER') {
        navigate('/teacher');
      } else {
        navigate('/student');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to login. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoFill = (id: string, pass: string, tab: 'STUDENT' | 'FACULTY') => {
    setActiveTab(tab);
    setIdentifier(id);
    setPassword(pass);
    toast.success('Credentials filled! Click Sign In to continue.');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center relative overflow-hidden">
      {/* College Background Image with Gradient Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="/images/college.jpg"
          alt="R.G. Kedia College Campus"
          className="w-full h-full object-cover object-center opacity-25 scale-105 filter blur-xs"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-900/60" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-4 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          
          {/* Left Column: College Branding & Heritage */}
          <div className="lg:col-span-6 text-white space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2 rounded-full border border-white/15">
              <img
                src="/images/logo.png"
                alt="Marwadi Siksha Samithi Logo"
                className="w-10 h-10 object-contain drop-shadow-md"
              />
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-amber-400 block">
                  Marwadi Siksha Samithi
                </span>
                <span className="text-[10px] text-slate-300">Estd. 1924 • Sultan Bazar, Hyderabad</span>
              </div>
            </div>

            <div>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
                Ramnath Guljarilal Kedia{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-yellow-400">
                  College of Commerce
                </span>
              </h1>
              <p className="text-amber-300 font-serif italic text-base mt-2">
                " सा विद्या या विमुक्तये " — Knowledge is that which liberates
              </p>
            </div>

            <p className="text-slate-300 text-sm leading-relaxed max-w-lg">
              Integrated Digital Library Management & Academic Resource Portal. Access over thousands of textbooks, reference journals, branch-wise question banks, and degree exam guides for B.Com, BBA, and B.Sc.
            </p>

            {/* Quick Feature Pillars */}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-center">
                <BookOpen className="w-5 h-5 text-amber-400 mx-auto mb-1.5" />
                <h4 className="text-xs font-bold text-slate-200">Catalog</h4>
                <p className="text-[10px] text-slate-400">Live stock & copies</p>
              </div>
              <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-center">
                <GraduationCap className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                <h4 className="text-xs font-bold text-slate-200">Exam Guide</h4>
                <p className="text-[10px] text-slate-400">Past papers & IMP Qs</p>
              </div>
              <div className="bg-slate-900/60 backdrop-blur-md p-3.5 rounded-xl border border-slate-800 text-center">
                <ShieldCheck className="w-5 h-5 text-blue-400 mx-auto mb-1.5" />
                <h4 className="text-xs font-bold text-slate-200">Roles</h4>
                <p className="text-[10px] text-slate-400">Student/Staff/Librarian</p>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Login Card */}
          <div className="lg:col-span-6 max-w-md w-full mx-auto">
            <div className="bg-white rounded-3xl p-7 shadow-2xl border border-slate-100 relative">
              
              {/* Tab Selector */}
              <div className="flex rounded-xl bg-slate-100 p-1 mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('STUDENT');
                    setIdentifier('1052-24-401-001');
                    setPassword('password123');
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'STUDENT'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  Student Portal
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('FACULTY');
                    setIdentifier('librarian@rgkedia.edu.in');
                    setPassword('admin123');
                  }}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                    activeTab === 'FACULTY'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Staff & Librarian
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    {activeTab === 'STUDENT' ? 'Student Roll Number / Email' : 'Official College Email'}
                  </label>
                  <input
                    type="text"
                    required
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={activeTab === 'STUDENT' ? 'e.g. 1052-24-401-001' : 'e.g. librarian@rgkedia.edu.in'}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:border-amber-500 text-sm font-medium"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm transition shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoading ? (
                    'Authenticating...'
                  ) : (
                    <>
                      <span>Sign In to Library</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Demo Account Quick-Fill Buttons */}
              <div className="mt-6 pt-5 border-t border-slate-100">
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  <span>Verified Demo Profiles (Click to test)</span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDemoFill('librarian@rgkedia.edu.in', 'admin123', 'FACULTY')}
                    className="p-2 text-left rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 transition cursor-pointer"
                  >
                    <div className="text-[11px] font-bold">👤 Chief Librarian</div>
                    <div className="text-[10px] text-amber-700 truncate">librarian@rgkedia.edu.in</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDemoFill('sunitha.commerce@rgkedia.edu.in', 'password123', 'FACULTY')}
                    className="p-2 text-left rounded-lg bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-900 transition cursor-pointer"
                  >
                    <div className="text-[11px] font-bold">👨‍🏫 Faculty (B.Com)</div>
                    <div className="text-[10px] text-blue-700 truncate">sunitha.commerce@rgkedia.edu.in</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDemoFill('1052-24-401-001', 'password123', 'STUDENT')}
                    className="p-2 text-left rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 transition cursor-pointer"
                  >
                    <div className="text-[11px] font-bold">🎓 Student (Rahul S.)</div>
                    <div className="text-[10px] text-emerald-700">Roll: 1052-24-401-001</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDemoFill('1052-24-403-008', 'password123', 'STUDENT')}
                    className="p-2 text-left rounded-lg bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-900 transition cursor-pointer"
                  >
                    <div className="text-[11px] font-bold">🎓 Student (Ananya D.)</div>
                    <div className="text-[10px] text-purple-700">Roll: 1052-24-403-008</div>
                  </button>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default LoginPage;
