import { useState } from 'react';
import {
  GraduationCap,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import { ModuleId } from '../../types/luga';
import { getVisibleNavItems } from './navigationConfig';

interface MobileBottomNavProps {
  activeModule: ModuleId;
  unreadMessages: number;
  onSelectModule: (id: ModuleId) => void;
}

const PRIMARY_MOBILE_TABS: { id: ModuleId; label: string; icon: typeof Home }[] = [
  { id: 'reels', label: 'Reels', icon: Home },
  { id: 'messages', label: 'Chat', icon: MessageSquare },
  { id: 'groups', label: 'Groups', icon: Users },
  { id: 'results', label: 'Results', icon: GraduationCap },
];

export function MobileBottomNav({
  activeModule,
  unreadMessages,
  onSelectModule,
}: MobileBottomNavProps) {
  const { profile, signOutUser } = useAuth();
  const { missedCallsCount } = useCalls();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const visibleItems = getVisibleNavItems(profile?.role);
  const secondaryItems = visibleItems.filter(
    (item) => !PRIMARY_MOBILE_TABS.some((tab) => tab.id === item.id)
  );
  const isSecondaryActive = secondaryItems.some((item) => item.id === activeModule);

  const handleSelect = (id: ModuleId) => {
    onSelectModule(id);
    setDrawerOpen(false);
  };

  return (
    <>
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/50 backdrop-blur-xs">
          <div
            className="bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 p-4 pb-6 space-y-2 max-h-[82vh] overflow-y-auto"
            role="dialog"
            aria-label="More navigation options"
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="font-display text-sm font-bold text-slate-900 dark:text-white">
                All LUGA HUB Modules
              </span>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = activeModule === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={`w-full min-h-[48px] px-3.5 py-2.5 rounded-xl flex items-center gap-3 text-sm font-medium transition-colors ${
                      active
                        ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="text-left min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold leading-tight truncate">{item.label}</p>
                        {item.id === 'calls' && missedCallsCount > 0 && (
                          <span className="text-[11px] font-mono font-bold text-red-500 shrink-0">
                            {missedCallsCount} missed
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs truncate ${
                          active ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => void signOutUser()}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-2.5"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[58px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 items-center"
      >
        {PRIMARY_MOBILE_TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeModule === tab.id;
          const showBadge = tab.id === 'messages' && unreadMessages > 0;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleSelect(tab.id)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active
                  ? 'text-emerald-800 dark:text-emerald-400 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5" aria-hidden="true" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300">
                    {unreadMessages}
                  </span>
                )}
              </span>
              <span className="whitespace-nowrap">{tab.label}</span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-expanded={drawerOpen}
          className={`min-h-[48px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
            isSecondaryActive || drawerOpen
              ? 'text-emerald-800 dark:text-emerald-400 font-semibold'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <span className="relative">
            <Menu className="h-5 w-5" aria-hidden="true" />
            {missedCallsCount > 0 && (
              <span className="absolute -top-1.5 -right-2.5 text-[10px] font-mono font-bold text-red-600 dark:text-red-400">
                {missedCallsCount}
              </span>
            )}
          </span>
          <span className="whitespace-nowrap">More</span>
        </button>
      </nav>
    </>
  );
}
