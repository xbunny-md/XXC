import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  Info,
  Lock,
  Moon,
  Sun,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  BRAND,
  REQUESTABLE_ROLE_OPTIONS,
  RequestableRole,
} from '../types/luga';
import campusHeroBanner from '../assets/images/campus_hero_banner_1794523997415.jpg';
import { BrandMark } from './BrandMark';

const CAMPUS_BANNER_SRC = campusHeroBanner;

type AuthTab = 'signin' | 'register';

export function AuthPortal() {
  const {
    firebaseUser,
    authError,
    clearAuthError,
    signInWithGoogle,
    registerProfile,
    signOutUser,
  } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<AuthTab>(firebaseUser ? 'register' : 'signin');
  const [bannerError, setBannerError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showAuthHelp, setShowAuthHelp] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [requestedRole, setRequestedRole] = useState<RequestableRole>('student');
  const [classOrDept, setClassOrDept] = useState('');
  const [studentRegNo, setStudentRegNo] = useState('');
  const [house, setHouse] = useState('');
  const [schoolRegCode, setSchoolRegCode] = useState('LUGA-2026');

  useEffect(() => {
    if (firebaseUser) {
      setActiveTab('register');
      if (!fullName && firebaseUser.displayName) {
        setFullName(firebaseUser.displayName);
      }
      if (!username && firebaseUser.email) {
        const prefix = firebaseUser.email
          .split('@')[0]
          .replace(/[^a-zA-Z0-9_]/g, '_')
          .slice(0, 24);
        setUsername(prefix.length >= 3 ? prefix : `${prefix}_luga`);
      }
    }
  }, [firebaseUser, fullName, username]);

  const handleGoogleSignIn = async () => {
    setFormError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      await signInWithGoogle();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegistrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    clearAuthError();
    setSubmitting(true);
    try {
      let user = firebaseUser;
      if (!user) {
        user = await signInWithGoogle();
        if (!user) {
          setSubmitting(false);
          return;
        }
      }
      await registerProfile(
        {
          fullName,
          username,
          requestedRole,
          classOrDept,
          house: house.trim() || undefined,
          studentRegNo:
            requestedRole === 'student' || requestedRole === 'class_monitor'
              ? studentRegNo
              : undefined,
          schoolRegCode,
        },
        user
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  const needsRegNumber = requestedRole === 'student' || requestedRole === 'class_monitor';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch">
        {/* Left Editorial Campus Showcase */}
        <section className="lg:col-span-6 relative min-h-[300px] lg:min-h-screen overflow-hidden bg-emerald-950 flex flex-col justify-between p-6 sm:p-10 lg:p-12">
          {!bannerError ? (
            <img
              src={CAMPUS_BANNER_SRC}
              alt="Mwanalugali Secondary School Campus"
              referrerPolicy="no-referrer"
              onError={() => setBannerError(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/55 to-black/30" />

          <div className="relative z-10 flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl overflow-hidden border border-white/25 bg-white p-0.5 shrink-0">
              <img
                src={logoError ? BRAND.backupLogoUrl : BRAND.officialLogoUrl}
                alt="Mwanalugali Secondary School Official Logo"
                referrerPolicy="no-referrer"
                onError={() => setLogoError(true)}
                className="h-full w-full object-contain"
              />
            </div>
            <div>
              <p className="font-display text-lg font-bold tracking-tight text-white">
                {BRAND.platformName}
              </p>
              <p className="text-xs text-emerald-200/90">{BRAND.schoolName}</p>
            </div>
          </div>

          <div className="relative z-10 mt-12 lg:mt-0 max-w-xl">
            <p className="text-xs font-medium tracking-wide text-amber-300 mb-3">
              {BRAND.communityIdentity} · Official Digital Campus
            </p>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight [text-wrap:balance]">
              {BRAND.tagline}
            </h1>
            <p className="mt-4 text-sm sm:text-base text-slate-200 leading-relaxed max-w-lg">
              The unified academic and social community for Mwanalugali Secondary School students, teachers, headmaster, administrators, and alumni.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 border-t border-white/15">
              <div>
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <Users className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>School Feed &amp; Groups</span>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Class streams, clubs, sports, and alumni circles.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <GraduationCap className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>Private Results</span>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Protected student marks and term transcripts.
                </p>
              </div>
              <div>
                <div className="flex items-center gap-2 text-white font-medium text-sm">
                  <BookOpen className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
                  <span>Timetables &amp; Study</span>
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Notes, past papers, schedules, and events.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Interactive Auth Panel */}
        <section className="lg:col-span-6 flex flex-col justify-between p-6 sm:p-10 lg:p-14 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <BrandMark size="md" showSubtext />
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 text-sm font-medium whitespace-nowrap shrink-0"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Dark</span>
                </>
              )}
            </button>
          </div>

          <div className="my-auto py-8 w-full max-w-md mx-auto">
            {firebaseUser && (
              <div className="mb-6 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Signed in as {firebaseUser.email}
                </p>
                <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300">
                  Complete your Mwanalugali Secondary School profile below to request community access.
                </p>
                <button
                  type="button"
                  onClick={() => void signOutUser()}
                  className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300 underline hover:no-underline"
                >
                  Use a different account
                </button>
              </div>
            )}

            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-6"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'signin'}
                onClick={() => {
                  setActiveTab('signin');
                  setFormError(null);
                  clearAuthError();
                }}
                className={`min-h-[42px] px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'signin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'register'}
                onClick={() => {
                  setActiveTab('register');
                  setFormError(null);
                  clearAuthError();
                }}
                className={`min-h-[42px] px-4 py-2 text-sm font-semibold rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === 'register'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Register
              </button>
            </div>

            {(authError || formError) && (
              <div
                role="alert"
                className="mb-5 p-3.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 flex items-start gap-2.5 text-sm text-red-800 dark:text-red-200"
              >
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{formError || authError}</span>
              </div>
            )}

            {activeTab === 'signin' ? (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Welcome back to LUGA HUB
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
                    Sign in with your verified Google account to access Mwanalugali Secondary School updates, classes, and results.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleGoogleSignIn()}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-3 whitespace-nowrap"
                >
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{submitting ? 'Connecting...' : 'Continue with Google'}</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>

                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                  <button
                    type="button"
                    onClick={() => setShowAuthHelp((prev) => !prev)}
                    className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Need Email/Password sign-in or first-time registration?</span>
                  </button>
                  {showAuthHelp && (
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                      <p>
                        New members should switch to the <strong>Register</strong> tab and enter an active school registration code (default: <span className="font-mono">LUGA-2026</span>).
                      </p>
                      <p>
                        Google Sign-In is configured on this Firebase project. To enable standalone Email/Password login later, turn on Email/Password in Firebase Console &gt; Authentication &gt; Sign-in method.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegistrationSubmit} className="space-y-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Join LUGA HUB
                  </h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Register with your school details. Accounts require administrator approval before accessing private modules.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="reg-fullname" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <input
                      id="reg-fullname"
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Juma Hassan Kambi"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                  <div>
                    <label htmlFor="reg-username" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Username
                    </label>
                    <input
                      id="reg-username"
                      type="text"
                      required
                      minLength={3}
                      maxLength={30}
                      pattern="^[a-zA-Z0-9_]+$"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. juma_kambi"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="reg-role" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Community Role
                    </label>
                    <select
                      id="reg-role"
                      value={requestedRole}
                      onChange={(e) => setRequestedRole(e.target.value as RequestableRole)}
                      className="w-full min-h-[44px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    >
                      {REQUESTABLE_ROLE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="reg-class" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      Class / Department
                    </label>
                    <input
                      id="reg-class"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={classOrDept}
                      onChange={(e) => setClassOrDept(e.target.value)}
                      placeholder="e.g. Form 4A or Physics Dept"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {needsRegNumber && (
                    <div>
                      <label htmlFor="reg-student-no" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                        Student Reg. Number
                      </label>
                      <input
                        id="reg-student-no"
                        type="text"
                        maxLength={40}
                        value={studentRegNo}
                        onChange={(e) => setStudentRegNo(e.target.value)}
                        placeholder="e.g. MSS/2026/0142"
                        className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                      />
                    </div>
                  )}
                  <div className={needsRegNumber ? '' : 'sm:col-span-2'}>
                    <label htmlFor="reg-house" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                      House / Dormitory (Optional)
                    </label>
                    <input
                      id="reg-house"
                      type="text"
                      maxLength={40}
                      value={house}
                      onChange={(e) => setHouse(e.target.value)}
                      placeholder="e.g. Kilimanjaro House"
                      className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="reg-school-code" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                    School Registration Code
                  </label>
                  <input
                    id="reg-school-code"
                    type="text"
                    required
                    minLength={4}
                    maxLength={32}
                    value={schoolRegCode}
                    onChange={(e) => setSchoolRegCode(e.target.value.toUpperCase())}
                    placeholder="LUGA-2026"
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[48px] px-5 py-3 rounded-xl bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 text-white font-semibold text-sm transition-colors flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>
                    {submitting
                      ? 'Submitting Registration...'
                      : firebaseUser
                        ? 'Submit School Registration'
                        : 'Verify with Google & Register'}
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              </form>
            )}
          </div>

          <footer className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span>
              {BRAND.platformName} · {BRAND.schoolShortName}
            </span>
            <span>{BRAND.communityIdentity}</span>
          </footer>
        </section>
      </div>
    </div>
  );
}
