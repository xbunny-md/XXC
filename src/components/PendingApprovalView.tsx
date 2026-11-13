import { Clock, LogOut, Moon, ShieldAlert, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { BRAND, ROLE_LABELS } from '../types/luga';
import { BrandMark } from './BrandMark';

export function PendingApprovalView() {
  const { profile, signOutUser } = useAuth();
  const { theme, toggleTheme } = useTheme();

  if (!profile) return null;

  const isSuspended = profile.status === 'suspended';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="h-16 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
        <BrandMark size="md" showSubtext />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] px-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="min-h-[44px] px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium flex items-center gap-2 whitespace-nowrap"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-4">
            <div
              className={`h-11 w-11 rounded-xl flex items-center justify-center ${
                isSuspended
                  ? 'bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300'
                  : 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
              }`}
            >
              {isSuspended ? (
                <ShieldAlert className="h-5 w-5" aria-hidden="true" />
              ) : (
                <Clock className="h-5 w-5" aria-hidden="true" />
              )}
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {isSuspended ? 'Account Suspended' : 'Registration Pending Approval'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {BRAND.platformName} · {BRAND.schoolShortName}
              </p>
            </div>
          </div>

          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            {isSuspended
              ? 'Your LUGA HUB access has been suspended by a school administrator. Contact the Mwanalugali Secondary School administration office for assistance.'
              : 'Your community profile has been saved and is awaiting verification by a Mwanalugali Secondary School administrator. This page updates automatically once approved.'}
          </p>

          <dl className="mt-6 divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800 text-sm">
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Member Name</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{profile.fullName}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Username</dt>
              <dd className="font-mono text-slate-900 dark:text-white">@{profile.username}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Requested Role</dt>
              <dd className="font-medium text-slate-900 dark:text-white">
                {profile.requestedRole ? ROLE_LABELS[profile.requestedRole] : ROLE_LABELS[profile.role]}
              </dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">Class / Department</dt>
              <dd className="font-medium text-slate-900 dark:text-white">{profile.classOrDept}</dd>
            </div>
            <div className="py-3 flex items-center justify-between gap-4">
              <dt className="text-slate-500 dark:text-slate-400">School Code</dt>
              <dd className="font-mono text-slate-900 dark:text-white">{profile.schoolRegCode}</dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
