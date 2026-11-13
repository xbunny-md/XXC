import { Bell, CheckCheck, X } from 'lucide-react';
import { markAllNotificationsRead, markNotificationRead } from '../../lib/communityService';
import { formatFirestoreDate, ModuleId, NotificationItem } from '../../types/luga';

interface NotificationsDrawerProps {
  open: boolean;
  notifications: NotificationItem[];
  onClose: () => void;
  onNavigate: (moduleId: ModuleId) => void;
}

export function NotificationsDrawer({
  open,
  notifications,
  onClose,
  onNavigate,
}: NotificationsDrawerProps) {
  if (!open) return null;

  const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);

  const targetModuleFor = (kind?: NotificationItem['kind']): ModuleId => {
    switch (kind) {
      case 'message':
        return 'messages';
      case 'call':
        return 'calls';
      case 'announcement':
        return 'announcements';
      case 'academic':
        return 'results';
      case 'event':
        return 'schedule';
      case 'group':
        return 'groups';
      default:
        return 'reels';
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end">
      <div
        role="dialog"
        aria-label="Notifications Center"
        className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 flex flex-col"
      >
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Notifications
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {unreadIds.length > 0 && (
              <button
                type="button"
                onClick={() => void markAllNotificationsRead(unreadIds)}
                className="min-h-[36px] px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center gap-1"
              >
                <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Mark all read</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close notifications"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                You are all caught up
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Alerts for messages, post comments, reactions, announcements, and events appear here.
              </p>
            </div>
          ) : (
            notifications.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (!item.read) void markNotificationRead(item.id);
                  onNavigate(targetModuleFor(item.kind));
                  onClose();
                }}
                className={`w-full px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                  item.read ? 'opacity-75' : 'bg-emerald-50/40 dark:bg-emerald-950/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {item.title}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                    {formatFirestoreDate(item.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {item.body}
                </p>
                {!item.read && (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Unread
                  </p>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
