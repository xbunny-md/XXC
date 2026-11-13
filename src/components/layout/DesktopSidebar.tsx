import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import { BRAND, ModuleId, ROLE_LABELS } from '../../types/luga';
import { BrandMark } from '../BrandMark';
import { UserAvatar } from '../common/UserAvatar';
import { getVisibleNavItems, NavItemConfig } from './navigationConfig';

interface DesktopSidebarProps {
  activeModule: ModuleId;
  unreadMessages: number;
  onSelectModule: (id: ModuleId) => void;
}

const GROUPS: NavItemConfig['group'][] = ['Community', 'Academics', 'Campus Life', 'Account'];

export function DesktopSidebar({
  activeModule,
  unreadMessages,
  onSelectModule,
}: DesktopSidebarProps) {
  const { profile, signOutUser } = useAuth();
  const { missedCallsCount } = useCalls();
  const navItems = getVisibleNavItems(profile?.role);

  return (
    <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-h-screen sticky top-0 h-screen">
      <div className="h-16 px-5 border-b border-slate-200 dark:border-slate-800 flex items-center">
        <BrandMark size="md" showSubtext />
      </div>

      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {GROUPS.map((groupName) => {
          const items = navItems.filter((item) => item.group === groupName);
          if (items.length === 0) return null;
          return (
            <div key={groupName} className="space-y-1">
              <p className="px-3 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                {groupName}
              </p>
              {items.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                const showUnread = item.id === 'messages' && unreadMessages > 0;
                const showMissed = item.id === 'calls' && missedCallsCount > 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectModule(item.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full min-h-[40px] px-3 py-2 rounded-lg flex items-center justify-between gap-2 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {showUnread && (
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums ${
                          active ? 'text-emerald-100' : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {unreadMessages}
                      </span>
                    )}
                    {showMissed && (
                      <span
                        className={`text-xs font-mono font-semibold tabular-nums ${
                          active ? 'text-red-100' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {missedCallsCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      {profile && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <button
            type="button"
            onClick={() => onSelectModule('profile')}
            className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <UserAvatar
              name={profile.fullName}
              avatarUrl={profile.avatarUrl}
              size="sm"
              rounded="lg"
              online={profile.privacy?.showOnlineStatus !== false}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {profile.fullName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {ROLE_LABELS[profile.role]} · {profile.classOrDept}
              </p>
            </div>
          </button>

          <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {BRAND.communityIdentity}
            </span>
            <button
              type="button"
              onClick={() => void signOutUser()}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
