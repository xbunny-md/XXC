import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import { ModuleId, NotificationItem, toMillis } from '../../types/luga';
import { DesktopSidebar } from './DesktopSidebar';
import { GlobalSearchModal } from './GlobalSearchModal';
import { MobileBottomNav } from './MobileBottomNav';
import { NotificationsDrawer } from './NotificationsDrawer';
import { RightInfoPanel } from './RightInfoPanel';
import { TopHeader } from './TopHeader';

interface AppShellProps {
  activeModule: ModuleId;
  onSelectModule: (id: ModuleId) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onPrimaryAction: () => void;
  children: React.ReactNode;
}

export function AppShell({
  activeModule,
  onSelectModule,
  searchQuery,
  onSearchChange,
  onPrimaryAction,
  children,
}: AppShellProps) {
  const { profile } = useAuth();
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', profile.uid),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<NotificationItem, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
          .slice(0, 30);
        setNotifications(items);
      },
      () => {}
    );
    return () => unsub();
  }, [profile]);

  const unreadNotifications = notifications.filter((n) => !n.read).length;
  const unreadMessages = notifications.filter((n) => !n.read && n.kind === 'message').length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      <DesktopSidebar
        activeModule={activeModule}
        unreadMessages={unreadMessages}
        onSelectModule={onSelectModule}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader
          activeModule={activeModule}
          searchQuery={searchQuery}
          unreadNotifications={unreadNotifications}
          onSearchChange={onSearchChange}
          onOpenGlobalSearch={() => setSearchModalOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
          onSelectModule={onSelectModule}
          onPrimaryAction={onPrimaryAction}
        />

        {activeModule === 'reels' ? (
          <main className="flex-1 min-w-0 pb-[58px] lg:pb-0">{children}</main>
        ) : (
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 lg:pb-10">
            <div className="flex items-start gap-6">
              <div className="flex-1 min-w-0">{children}</div>
              <RightInfoPanel onSelectModule={onSelectModule} />
            </div>
          </main>
        )}
      </div>

      <MobileBottomNav
        activeModule={activeModule}
        unreadMessages={unreadMessages}
        onSelectModule={onSelectModule}
      />

      <GlobalSearchModal
        open={searchModalOpen}
        initialQuery={searchQuery}
        onClose={() => setSearchModalOpen(false)}
        onNavigate={onSelectModule}
      />

      <NotificationsDrawer
        open={notificationsOpen}
        notifications={notifications}
        onClose={() => setNotificationsOpen(false)}
        onNavigate={onSelectModule}
      />
    </div>
  );
}
