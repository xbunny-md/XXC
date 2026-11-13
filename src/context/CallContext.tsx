import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import {
  acceptCallSession,
  declineCallSession,
  fetchCallSessionById,
  fetchLiveKitToken,
  leaveOrEndCallSession,
  LiveKitConnectionInfo,
  markCallSessionMissed,
  registerCallPushNotifications,
  showIncomingCallBrowserNotification,
  startGroupCallSession,
  startIncomingRingtone,
  startOutgoingRingback,
  startPrivateCallSession,
  stopCallRingtones,
} from '../lib/callService';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  CallMediaType,
  CallSession,
  GroupItem,
  toMillis,
  UserDirectoryEntry,
} from '../types/luga';
import { useAuth } from './AuthContext';

export type CallPhase =
  | 'idle'
  | 'outgoing_calling'
  | 'outgoing_ringing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

interface CallContextValue {
  calls: CallSession[];
  activeCall: CallSession | null;
  incomingCall: CallSession | null;
  liveKitSession: LiveKitConnectionInfo | null;
  callPhase: CallPhase;
  callNotice: string | null;
  callError: string | null;
  minimized: boolean;
  missedCallsCount: number;
  notificationPermission: NotificationPermission | 'unsupported';
  setMinimized: (value: boolean) => void;
  setCallPhase: (phase: CallPhase) => void;
  clearCallFeedback: () => void;
  initiatePrivateCall: (params: {
    peer: UserDirectoryEntry;
    conversationId: string;
    callType: CallMediaType;
  }) => Promise<void>;
  initiateGroupCall: (params: {
    group: GroupItem;
    memberIds: string[];
    callType: CallMediaType;
  }) => Promise<void>;
  joinActiveGroupCall: (group: GroupItem) => Promise<void>;
  answerIncomingCall: (call: CallSession) => Promise<void>;
  rejectIncomingCall: (call: CallSession) => Promise<void>;
  hangupCall: () => Promise<void>;
  retryCallConnection: () => Promise<void>;
  markCallHistoryViewed: () => void;
  enableCallNotifications: () => Promise<{
    permission: NotificationPermission | 'unsupported';
    tokenSaved: boolean;
  }>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();

  const [calls, setCalls] = useState<CallSession[]>([]);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [directActiveCall, setDirectActiveCall] = useState<CallSession | null>(null);
  const [liveKitSession, setLiveKitSession] = useState<LiveKitConnectionInfo | null>(null);
  const [callPhase, setCallPhase] = useState<CallPhase>('idle');
  const [callNotice, setCallNotice] = useState<string | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() =>
    typeof window !== 'undefined' && 'Notification' in window
      ? Notification.permission
      : 'unsupported'
  );

  const [lastSeenCallsMs, setLastSeenCallsMs] = useState<number>(() => {
    if (!profile?.uid || typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(`luga_calls_last_seen_${profile.uid}`);
    return raw ? Number(raw) || 0 : 0;
  });

  const missedTimerRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);
  const notifiedIncomingIdsRef = useRef<Set<string>>(new Set());
  const endingCallRef = useRef<boolean>(false);

  const showTimedNotice = useCallback((msg: string) => {
    setCallNotice(msg);
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setCallNotice(null);
    }, 4500);
  }, []);

  // Load saved last-seen timestamp when user logs in
  useEffect(() => {
    if (!profile?.uid || typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(`luga_calls_last_seen_${profile.uid}`);
    setLastSeenCallsMs(raw ? Number(raw) || 0 : 0);
  }, [profile?.uid]);

  // Real-time calls listener (single array-contains filter, sorted client-side)
  useEffect(() => {
    if (!profile || profile.status !== 'approved') {
      setCalls([]);
      return;
    }

    const q = query(
      collection(db, 'calls'),
      where('participantIds', 'array-contains', profile.uid),
      limit(50)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CallSession, 'id'>),
          }))
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setCalls(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'calls')
    );

    return () => unsub();
  }, [profile?.uid, profile?.status]);

  // Direct doc listener for the currently open call session
  useEffect(() => {
    if (!activeCallId || !profile) {
      setDirectActiveCall(null);
      return;
    }
    const unsub = onSnapshot(
      doc(db, 'calls', activeCallId),
      (snap) => {
        if (snap.exists()) {
          setDirectActiveCall({
            id: snap.id,
            ...(snap.data() as Omit<CallSession, 'id'>),
          });
        }
      },
      () => {}
    );
    return () => unsub();
  }, [activeCallId, profile?.uid]);

  // Register FCM / browser notifications automatically if already permitted
  useEffect(() => {
    if (!profile || profile.status !== 'approved') return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    setNotificationPermission(Notification.permission);
    if (Notification.permission === 'granted') {
      void registerCallPushNotifications(profile.uid, false, (payload) => {
        if (payload.title) showTimedNotice(payload.title);
      }).then((res) => {
        setNotificationPermission(res.permission);
      });
    }
  }, [profile?.uid, profile?.status, showTimedNotice]);

  const activeCall = useMemo(() => {
    if (!activeCallId) return null;
    return directActiveCall || calls.find((c) => c.callId === activeCallId) || null;
  }, [activeCallId, directActiveCall, calls]);

  // Identify any incoming ringing call not yet answered or declined
  const incomingCall = useMemo(() => {
    if (!profile || activeCallId) return null;
    const now = Date.now();
    return (
      calls.find((c) => {
        if (c.status !== 'ringing') return false;
        if (c.callerId === profile.uid) return false;
        if ((c.joinedIds || []).includes(profile.uid)) return false;
        if ((c.declinedIds || []).includes(profile.uid)) return false;
        const ageMs = now - toMillis(c.createdAt);
        // Ignore stale ringing calls older than 90 seconds
        if (toMillis(c.createdAt) > 0 && ageMs > 90000) return false;
        return true;
      }) || null
    );
  }, [calls, profile?.uid, activeCallId]);

  // Incoming ringtone & browser notification handler
  useEffect(() => {
    if (!incomingCall) {
      if (!activeCallId) {
        stopCallRingtones();
      }
      return;
    }

    startIncomingRingtone();
    if (!notifiedIncomingIdsRef.current.has(incomingCall.callId)) {
      notifiedIncomingIdsRef.current.add(incomingCall.callId);
      if (typeof document !== 'undefined' && document.hidden) {
        void showIncomingCallBrowserNotification(incomingCall);
      }
    }

    return () => {
      stopCallRingtones();
    };
  }, [incomingCall?.callId, activeCallId]);

  const clearMissedTimer = useCallback(() => {
    if (missedTimerRef.current !== null) {
      window.clearTimeout(missedTimerRef.current);
      missedTimerRef.current = null;
    }
  }, []);

  const resetActiveState = useCallback(() => {
    clearMissedTimer();
    stopCallRingtones();
    setActiveCallId(null);
    setDirectActiveCall(null);
    setLiveKitSession(null);
    setCallPhase('idle');
    setCallError(null);
    setMinimized(false);
    endingCallRef.current = false;
  }, [clearMissedTimer]);

  // React to remote state changes on activeCall (peer accepted, declined, missed, ended)
  useEffect(() => {
    if (!activeCall || !profile) return;

    if (activeCall.status === 'active') {
      clearMissedTimer();
      stopCallRingtones();
      if (callPhase === 'outgoing_calling' || callPhase === 'outgoing_ringing') {
        setCallPhase(liveKitSession ? 'connecting' : 'connecting');
      }
      return;
    }

    if (
      activeCall.status === 'declined' ||
      activeCall.status === 'ended' ||
      activeCall.status === 'missed'
    ) {
      clearMissedTimer();
      stopCallRingtones();
      if (!endingCallRef.current) {
        if (activeCall.status === 'declined') {
          showTimedNotice(
            `${activeCall.calleeName || 'Recipient'} declined the call.`
          );
        } else if (activeCall.status === 'missed') {
          showTimedNotice('No answer — call marked as missed.');
        } else {
          showTimedNotice('Call ended.');
        }
      }
      resetActiveState();
    }
  }, [activeCall?.status, activeCall?.calleeName, callPhase, liveKitSession, profile?.uid, clearMissedTimer, resetActiveState, showTimedNotice]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearMissedTimer();
      stopCallRingtones();
      if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    };
  }, [clearMissedTimer]);

  const missedCallsCount = useMemo(() => {
    if (!profile) return 0;
    return calls.filter(
      (c) =>
        c.status === 'missed' &&
        c.callerId !== profile.uid &&
        toMillis(c.createdAt) > lastSeenCallsMs
    ).length;
  }, [calls, profile?.uid, lastSeenCallsMs]);

  const markCallHistoryViewed = useCallback(() => {
    if (!profile?.uid) return;
    const now = Date.now();
    setLastSeenCallsMs(now);
    try {
      window.localStorage.setItem(`luga_calls_last_seen_${profile.uid}`, String(now));
    } catch {
      // ignore storage quota errors
    }
  }, [profile?.uid]);

  const initiatePrivateCall = useCallback(
    async (params: {
      peer: UserDirectoryEntry;
      conversationId: string;
      callType: CallMediaType;
    }) => {
      if (!profile) return;
      if (activeCallId) {
        showTimedNotice('You are already on another call.');
        return;
      }

      setCallError(null);
      setCallNotice(null);
      setMinimized(false);
      setCallPhase('outgoing_calling');
      startOutgoingRingback();

      try {
        const session = await startPrivateCallSession({
          caller: profile,
          peer: params.peer,
          conversationId: params.conversationId,
          callType: params.callType,
        });
        setDirectActiveCall(session);
        setActiveCallId(session.callId);

        const lk = await fetchLiveKitToken({
          callId: session.callId,
          scope: 'private',
          conversationId: params.conversationId,
          participantName: profile.fullName,
          avatarUrl: profile.avatarUrl,
        });
        setLiveKitSession(lk);
        setCallPhase((prev) => (prev === 'outgoing_calling' ? 'outgoing_ringing' : prev));

        clearMissedTimer();
        missedTimerRef.current = window.setTimeout(() => {
          void markCallSessionMissed(session, 'no_answer');
        }, 45000);
      } catch (err) {
        stopCallRingtones();
        clearMissedTimer();
        const msg = err instanceof Error ? err.message : 'Unable to start call.';
        setCallError(msg);
        setCallPhase('error');
      }
    },
    [profile, activeCallId, showTimedNotice, clearMissedTimer]
  );

  const joinActiveGroupCall = useCallback(
    async (group: GroupItem) => {
      if (!profile) return;
      if (!group.activeCallId) return;
      if (activeCallId === group.activeCallId) {
        setMinimized(false);
        return;
      }
      if (activeCallId) {
        showTimedNotice('Please end your current call before joining another.');
        return;
      }

      setCallError(null);
      setCallNotice(null);
      setMinimized(false);
      setCallPhase('connecting');

      try {
        const existing = await fetchCallSessionById(group.activeCallId);
        if (!existing || existing.status === 'ended' || existing.status === 'missed') {
          showTimedNotice('This group call has already ended.');
          setCallPhase('idle');
          return;
        }

        setDirectActiveCall(existing);
        setActiveCallId(existing.callId);

        const [, lk] = await Promise.all([
          acceptCallSession(existing, profile.uid),
          fetchLiveKitToken({
            callId: existing.callId,
            scope: 'group',
            groupId: group.id,
            participantName: profile.fullName,
            avatarUrl: profile.avatarUrl,
          }),
        ]);
        setLiveKitSession(lk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to join group call.';
        setCallError(msg);
        setCallPhase('error');
      }
    },
    [profile, activeCallId, showTimedNotice]
  );

  const initiateGroupCall = useCallback(
    async (params: {
      group: GroupItem;
      memberIds: string[];
      callType: CallMediaType;
    }) => {
      if (!profile) return;
      if (params.group.activeCallId) {
        await joinActiveGroupCall(params.group);
        return;
      }
      if (activeCallId) {
        showTimedNotice('You are already on another call.');
        return;
      }

      setCallError(null);
      setCallNotice(null);
      setMinimized(false);
      setCallPhase('connecting');

      try {
        const session = await startGroupCallSession({
          caller: profile,
          group: params.group,
          memberIds: params.memberIds,
          callType: params.callType,
        });
        setDirectActiveCall(session);
        setActiveCallId(session.callId);

        const lk = await fetchLiveKitToken({
          callId: session.callId,
          scope: 'group',
          groupId: params.group.id,
          participantName: profile.fullName,
          avatarUrl: profile.avatarUrl,
        });
        setLiveKitSession(lk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to start group call.';
        setCallError(msg);
        setCallPhase('error');
      }
    },
    [profile, activeCallId, joinActiveGroupCall, showTimedNotice]
  );

  const answerIncomingCall = useCallback(
    async (call: CallSession) => {
      if (!profile) return;
      stopCallRingtones();
      setCallError(null);
      setCallNotice(null);
      setMinimized(false);
      setDirectActiveCall(call);
      setActiveCallId(call.callId);
      setCallPhase('connecting');

      try {
        const [, lk] = await Promise.all([
          acceptCallSession(call, profile.uid),
          fetchLiveKitToken({
            callId: call.callId,
            scope: call.scope,
            conversationId: call.conversationId,
            groupId: call.groupId,
            participantName: profile.fullName,
            avatarUrl: profile.avatarUrl,
          }),
        ]);
        setLiveKitSession(lk);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unable to connect to incoming call.';
        setCallError(msg);
        setCallPhase('error');
      }
    },
    [profile]
  );

  const rejectIncomingCall = useCallback(
    async (call: CallSession) => {
      if (!profile) return;
      stopCallRingtones();
      await declineCallSession(call, profile.uid);
    },
    [profile]
  );

  const hangupCall = useCallback(async () => {
    if (!profile) {
      resetActiveState();
      return;
    }
    endingCallRef.current = true;
    const snapshot = activeCall;
    resetActiveState();
    if (snapshot) {
      await leaveOrEndCallSession(snapshot, profile.uid);
    }
  }, [profile, activeCall, resetActiveState]);

  const retryCallConnection = useCallback(async () => {
    if (!profile || !activeCall) return;
    setCallError(null);
    setCallPhase('connecting');
    try {
      const lk = await fetchLiveKitToken({
        callId: activeCall.callId,
        scope: activeCall.scope,
        conversationId: activeCall.conversationId,
        groupId: activeCall.groupId,
        participantName: profile.fullName,
        avatarUrl: profile.avatarUrl,
      });
      setLiveKitSession(lk);
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Reconnection failed.');
      setCallPhase('error');
    }
  }, [profile, activeCall]);

  const enableCallNotifications = useCallback(async () => {
    if (!profile) {
      return { permission: 'unsupported' as const, tokenSaved: false };
    }
    const result = await registerCallPushNotifications(profile.uid, true, (payload) => {
      if (payload.title) showTimedNotice(payload.title);
    });
    setNotificationPermission(result.permission);
    return result;
  }, [profile, showTimedNotice]);

  const clearCallFeedback = useCallback(() => {
    setCallNotice(null);
    setCallError(null);
  }, []);

  return (
    <CallContext.Provider
      value={{
        calls,
        activeCall,
        incomingCall,
        liveKitSession,
        callPhase,
        callNotice,
        callError,
        minimized,
        missedCallsCount,
        notificationPermission,
        setMinimized,
        setCallPhase,
        clearCallFeedback,
        initiatePrivateCall,
        initiateGroupCall,
        joinActiveGroupCall,
        answerIncomingCall,
        rejectIncomingCall,
        hangupCall,
        retryCallConnection,
        markCallHistoryViewed,
        enableCallNotifications,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCalls(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) {
    throw new Error('useCalls must be used within a CallProvider');
  }
  return ctx;
}
