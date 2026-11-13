import { Bell, Moon, Plus, Search, Sun } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { BRAND, ModuleId } from '../../types/luga';
import { BrandMark } from '../BrandMark';
import { UserAvatar } from '../common/UserAvatar';
import { NAV_ITEMS } from './navigationConfig';

interface TopHeaderProps {
  activeModule: ModuleId;
  searchQuery: string;
  unreadNotifications: number;
  onSearchChange: (value: string) => void;
  onOpenGlobalSearch: () => void;
  onOpenNotifications: () => void;
  onSelectModule: (id: ModuleId) => void;
  onPrimaryAction: () => void;
}

export function TopHeader({
  activeModule,
  searchQuery,
  unreadNotifications,
  onSearchChange,
  onOpenGlobalSearch,
  onOpenNotifications,
  onSelectModule,
  onPrimaryAction,
}: TopHeaderProps) {
  const { profile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const current = NAV_ITEMS.find((item) => item.id === activeModule) ?? NAV_ITEMS[0];

  const primaryCtaLabel = 'New Post';

  return (
    <header className="sticky top-0 z-30 h-[52px] lg:h-16 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 px-3 sm:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="lg:hidden">
          <BrandMark size="sm" />
        </div>
        <div className="hidden lg:block min-w-0">
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white truncate">
            {current.label}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {BRAND.platformName} · {BRAND.schoolShortName}
          </p>
        </div>
        <span className="lg:hidden text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
          {current.shortLabel}
        </span>
      </div>

      {/* Desktop Global Search Input + Modal Trigger */}
      <div className="hidden md:flex flex-1 max-w-md items-center gap-2">
        <label htmlFor="luga-global-search" className="sr-only">
          Search LUGA HUB
        </label>
        <div className="relative flex-1">
          <Search
            className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="luga-global-search"
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onOpenGlobalSearch();
              }
            }}
            placeholder="Filter or press Enter to search all..."
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-700"
          />
        </div>
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          Search All
        </button>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenGlobalSearch}
          aria-label="Search LUGA HUB"
          className="md:hidden min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
        >
          <Search className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label={`Notifications (${unreadNotifications} unread)`}
          className="relative min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5"
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadNotifications > 0 && (
            <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {unreadNotifications}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="min-h-[40px] min-w-[40px] px-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={onPrimaryAction}
          className="hidden sm:inline-flex min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white text-xs font-semibold items-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{primaryCtaLabel}</span>
        </button>

        {profile && (
          <button
            type="button"
            onClick={() => onSelectModule('profile')}
            aria-label="Open profile"
            className="lg:hidden min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center shrink-0"
          >
            <UserAvatar
              name={profile.fullName}
              avatarUrl={profile.avatarUrl}
              size="sm"
              rounded="lg"
            />
          </button>
        )}
      </div>
    </header>
  );
}
