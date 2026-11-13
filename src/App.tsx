import { useState } from 'react';
import { AuthPortal } from './components/AuthPortal';
import { BrandMark } from './components/BrandMark';
import { CallOverlay } from './components/calls/CallOverlay';
import { AppShell } from './components/layout/AppShell';
import { AdminModule } from './components/modules/AdminModule';
import { AnnouncementsModule } from './components/modules/AnnouncementsModule';
import { CallHistoryModule } from './components/modules/CallHistoryModule';
import {
  AchievementsModule,
  BookmarksModule,
  LostFoundModule,
  PollsModule,
} from './components/modules/CampusLifeModules';
import { GroupsModule } from './components/modules/GroupsModule';
import { LugaReelsModule } from './components/modules/LugaReelsModule';
import { MessagesModule } from './components/modules/MessagesModule';
import { ProfileModule } from './components/modules/ProfileModule';
import { ResourcesModule } from './components/modules/ResourcesModule';
import { ResultsModule } from './components/modules/ResultsModule';
import { ScheduleModule } from './components/modules/ScheduleModule';
import { PendingApprovalView } from './components/PendingApprovalView';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { ThemeProvider } from './context/ThemeContext';
import { ModuleId } from './types/luga';

function LugaHubRouter() {
  const { firebaseUser, profile, authReady, profileLoading, connectionOffline } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleId>('reels');
  const [searchQuery, setSearchQuery] = useState('');
  const [composerFocusTrigger, setComposerFocusTrigger] = useState(0);
  const [messagePeerUid, setMessagePeerUid] = useState<string | null>(null);

  if (!authReady || (firebaseUser && profileLoading && !profile)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-6 gap-4">
        <BrandMark size="lg" showSubtext />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Connecting to LUGA HUB...
        </p>
      </div>
    );
  }

  if (!firebaseUser || !profile) {
    return <AuthPortal />;
  }

  if (profile.status !== 'approved') {
    return <PendingApprovalView />;
  }

  const handlePrimaryAction = () => {
    if (activeModule !== 'reels') {
      setActiveModule('reels');
    }
    setComposerFocusTrigger((n) => n + 1);
  };

  return (
    <CallProvider>
      <AppShell
        activeModule={activeModule}
        onSelectModule={setActiveModule}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onPrimaryAction={handlePrimaryAction}
      >
        {connectionOffline && (
          <div className="mb-4 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-800 dark:text-amber-200">
            Firestore connection appears offline. Changes will sync once connectivity resumes.
          </div>
        )}

        {activeModule === 'reels' && (
          <LugaReelsModule
            searchQuery={searchQuery}
            composerTrigger={composerFocusTrigger}
            onMessageUser={(uid) => {
              setMessagePeerUid(uid);
              setActiveModule('messages');
            }}
          />
        )}
        {activeModule === 'messages' && (
          <MessagesModule
            initialPeerUid={messagePeerUid}
            onClearInitialPeer={() => setMessagePeerUid(null)}
          />
        )}
        {activeModule === 'calls' && (
          <CallHistoryModule
            searchQuery={searchQuery}
            onOpenChat={(uid) => {
              setMessagePeerUid(uid);
              setActiveModule('messages');
            }}
            onOpenGroups={() => setActiveModule('groups')}
          />
        )}
        {activeModule === 'groups' && (
          <GroupsModule
            searchQuery={searchQuery}
            onMessageUser={(uid) => {
              setMessagePeerUid(uid);
              setActiveModule('messages');
            }}
          />
        )}
        {activeModule === 'announcements' && <AnnouncementsModule searchQuery={searchQuery} />}
        {activeModule === 'schedule' && <ScheduleModule />}
        {activeModule === 'results' && <ResultsModule />}
        {activeModule === 'resources' && <ResourcesModule searchQuery={searchQuery} />}
        {activeModule === 'polls' && <PollsModule />}
        {activeModule === 'achievements' && <AchievementsModule />}
        {activeModule === 'lost_found' && (
          <LostFoundModule
            onContactReporter={(uid) => {
              setMessagePeerUid(uid);
              setActiveModule('messages');
            }}
          />
        )}
        {activeModule === 'bookmarks' && (
          <BookmarksModule onSelectModule={setActiveModule} />
        )}
        {activeModule === 'profile' && <ProfileModule />}
        {activeModule === 'admin' && <AdminModule searchQuery={searchQuery} />}
      </AppShell>
      <CallOverlay />
    </CallProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LugaHubRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
