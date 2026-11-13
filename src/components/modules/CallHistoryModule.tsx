import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import {
  Bell,
  BellOff,
  MessageSquare,
  Phone,
  PhoneCall,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  Users,
  Video,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import { db } from '../../lib/firebase';
import {
  CallMediaType,
  CallSession,
  formatDurationSeconds,
  formatFirestoreDate,
  formatTimeShort,
  GroupItem,
  UserDirectoryEntry,
} from '../../types/luga';
import { UserAvatar } from '../common/UserAvatar';

interface CallHistoryModuleProps {
  searchQuery?: string;
  onOpenChat: (peerUid: string) => void;
  onOpenGroups: () => void;
}

type CallFilter = 'all' | 'missed' | 'audio' | 'video';

export function CallHistoryModule({
  searchQuery = '',
  onOpenChat,
  onOpenGroups,
}: CallHistoryModuleProps) {
  const { profile } = useAuth();
  const {
    calls,
    notificationPermission,
    markCallHistoryViewed,
    enableCallNotifications,
    initiatePrivateCall,
    initiateGroupCall,
    joinActiveGroupCall,
  } = useCalls();

  const [filter, setFilter] = useState<CallFilter>('all');
  const [directoryByUid, setDirectoryByUid] = useState<Record<string, UserDirectoryEntry>>({});
  const [groupsById, setGroupsById] = useState<Record<string, GroupItem>>({});
  const [notifFeedback, setNotifFeedback] = useState<string | null>(null);

  useEffect(() => {
    markCallHistoryViewed();
  }, [calls.length, markCallHistoryViewed]);

  useEffect(() => {
    const unsubDir = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('fullName', 'asc'), limit(120)),
      (snap) => {
        const map: Record<string, UserDirectoryEntry> = {};
        snap.docs.forEach((d) => {
          const entry = d.data() as UserDirectoryEntry;
          map[entry.uid] = entry;
        });
        setDirectoryByUid(map);
      },
      () => {}
    );

    const unsubGroups = onSnapshot(
      query(collection(db, 'groups'), limit(50)),
      (snap) => {
        const map: Record<string, GroupItem> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...(d.data() as Omit<GroupItem, 'id'>) };
        });
        setGroupsById(map);
      },
      () => {}
    );

    return () => {
      unsubDir();
      unsubGroups();
    };
  }, []);

  const stats = useMemo(() => {
    if (!profile) return { total: 0, missed: 0, group: 0 };
    const missed = calls.filter(
      (c) => c.status === 'missed' && c.callerId !== profile.uid
    ).length;
    const group = calls.filter((c) => c.scope === 'group').length;
    return { total: calls.length, missed, group };
  }, [calls, profile?.uid]);

  const filteredCalls = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    return calls.filter((c) => {
      if (filter === 'missed' && c.status !== 'missed') return false;
      if (filter === 'audio' && c.callType !== 'audio') return false;
      if (filter === 'video' && c.callType !== 'video') return false;
      if (!term) return true;
      const haystack = [
        c.callerName,
        c.calleeName || '',
        c.groupName || '',
        c.callType,
        c.status,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [calls, filter, searchQuery]);

  const handleEnableAlerts = async () => {
    setNotifFeedback(null);
    const res = await enableCallNotifications();
    if (res.permission === 'granted') {
      setNotifFeedback('Call notifications are active on this device.');
    } else if (res.permission === 'denied') {
      setNotifFeedback('Browser notifications are blocked in site settings.');
    } else {
      setNotifFeedback('Push notifications are unavailable on this browser.');
    }
  };

  const handleCallback = async (call: CallSession, callType: CallMediaType) => {
    if (!profile) return;
    if (call.scope === 'group' && call.groupId) {
      const grp = groupsById[call.groupId];
      if (!grp) {
        onOpenGroups();
        return;
      }
      if (grp.activeCallId) {
        await joinActiveGroupCall(grp);
      } else {
        await initiateGroupCall({
          group: grp,
          memberIds: call.participantIds,
          callType,
        });
      }
      return;
    }

    const peerUid = call.callerId === profile.uid ? call.calleeId : call.callerId;
    if (!peerUid) return;
    const peerEntry: UserDirectoryEntry = directoryByUid[peerUid] || {
      uid: peerUid,
      fullName: call.callerId === profile.uid ? call.calleeName || 'Member' : call.callerName,
      username: 'member',
      role: 'student',
      status: 'approved',
      classOrDept: 'LUGA HUB',
      avatarUrl:
        call.callerId === profile.uid ? call.calleeAvatarUrl : call.callerAvatarUrl,
    };

    const sorted = [profile.uid, peerUid].sort();
    const convId =
      call.conversationId || `dm_${sorted[0].slice(0, 20)}_${sorted[1].slice(0, 20)}`;

    await initiatePrivateCall({
      peer: peerEntry,
      conversationId: convId,
      callType,
    });
  };

  if (!profile) return null;

  return (
    <div className="space-y-5">
      {/* Header & Push Alerts Control */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <PhoneCall className="h-5 w-5 text-emerald-700 dark:text-emerald-400" />
            <span>Calls &amp; Call History</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Real-time 1-to-1 and group voice/video calls powered by LiveKit Cloud.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {notificationPermission === 'granted' ? (
            <span className="min-h-[38px] px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <Bell className="h-3.5 w-3.5" />
              <span>Call Alerts Active</span>
            </span>
          ) : notificationPermission === 'denied' ? (
            <span className="min-h-[38px] px-3 py-1.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <BellOff className="h-3.5 w-3.5" />
              <span>Notifications Blocked</span>
            </span>
          ) : notificationPermission === 'default' ? (
            <button
              type="button"
              onClick={() => void handleEnableAlerts()}
              className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Bell className="h-3.5 w-3.5" />
              <span>Enable Call Alerts</span>
            </button>
          ) : null}
        </div>
      </section>

      {notifFeedback && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">
          {notifFeedback}
        </div>
      )}

      {/* Summary Stats */}
      <section className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Total Calls</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white font-mono">
            {stats.total}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Missed Calls</p>
          <p className="mt-1 font-display text-xl font-bold text-red-600 dark:text-red-400 font-mono">
            {stats.missed}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Group Calls</p>
          <p className="mt-1 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400 font-mono">
            {stats.group}
          </p>
        </div>
      </section>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'all', label: 'All Calls' },
            { id: 'missed', label: 'Missed' },
            { id: 'audio', label: 'Voice Calls' },
            { id: 'video', label: 'Video Calls' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
              filter === tab.id
                ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Call List */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
        {filteredCalls.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Phone className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              No calls recorded yet
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Start a voice or video call directly from any private chat in Messages or inside a Group chat header.
            </p>
          </div>
        ) : (
          filteredCalls.map((call) => {
            const isOutgoing = call.callerId === profile.uid;
            const peerUid = isOutgoing ? call.calleeId : call.callerId;
            const peerDir = peerUid ? directoryByUid[peerUid] : undefined;
            const title =
              call.scope === 'group'
                ? call.groupName || 'Group Call'
                : isOutgoing
                ? call.calleeName || peerDir?.fullName || 'LUGA Member'
                : call.callerName;
            const avatarUrl =
              call.scope === 'group'
                ? groupsById[call.groupId || '']?.avatarUrl
                : isOutgoing
                ? call.calleeAvatarUrl || peerDir?.avatarUrl
                : call.callerAvatarUrl || peerDir?.avatarUrl;

            const isMissed = call.status === 'missed' && !isOutgoing;
            const isDeclined = call.status === 'declined';
            const groupHasOngoing =
              call.scope === 'group' &&
              Boolean(call.groupId && groupsById[call.groupId]?.activeCallId === call.callId);

            return (
              <div
                key={call.callId}
                className="p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar name={title} avatarUrl={avatarUrl} size="md" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p
                        className={`text-sm font-semibold truncate ${
                          isMissed
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {title}
                      </p>
                      {call.scope === 'group' && (
                        <Users
                          className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0"
                          aria-label="Group call"
                        />
                      )}
                    </div>

                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      {isMissed ? (
                        <PhoneMissed className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      ) : isOutgoing ? (
                        <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <PhoneIncoming className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      )}
                      <span>
                        {isMissed
                          ? 'Missed'
                          : isDeclined
                          ? 'Declined'
                          : isOutgoing
                          ? 'Outgoing'
                          : 'Incoming'}
                      </span>
                      <span>·</span>
                      <span className="capitalize">{call.callType}</span>
                      {typeof call.durationSeconds === 'number' && call.durationSeconds > 0 && (
                        <>
                          <span>·</span>
                          <span className="font-mono">
                            {formatDurationSeconds(call.durationSeconds)}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      <span>
                        {formatFirestoreDate(call.createdAt)} {formatTimeShort(call.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {groupHasOngoing && call.groupId ? (
                    <button
                      type="button"
                      onClick={() => void joinActiveGroupCall(groupsById[call.groupId!])}
                      className="min-h-[38px] px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold"
                    >
                      Join Live
                    </button>
                  ) : (
                    <>
                      {call.scope === 'private' && peerUid && (
                        <button
                          type="button"
                          onClick={() => onOpenChat(peerUid)}
                          title="Open chat"
                          aria-label={`Message ${title}`}
                          className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleCallback(call, 'audio')}
                        title="Voice callback"
                        aria-label={`Voice call ${title}`}
                        className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 flex items-center justify-center"
                      >
                        <Phone className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleCallback(call, 'video')}
                        title="Video callback"
                        aria-label={`Video call ${title}`}
                        className="h-10 w-10 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white flex items-center justify-center"
                      >
                        <Video className="h-4 w-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
