import {
  arrayRemove,
  arrayUnion,
  deleteField,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  BRAND,
  CallMediaType,
  CallScope,
  CallSession,
  GroupItem,
  toMillis,
  UserDirectoryEntry,
  UserProfile,
} from '../types/luga';
import { sendNotification } from './communityService';
import { app, auth, db, handleFirestoreError, OperationType } from './firebase';

export interface LiveKitConnectionInfo {
  serverUrl: string;
  token: string;
  roomName: string;
  identity: string;
  participantName: string;
  mode: 'production-sdk' | 'server-sandbox-bridge';
}

export interface LiveKitServerStatus {
  projectId: string;
  serverUrl: string;
  mode: 'production-sdk' | 'server-sandbox-bridge';
  fcmPushServerConfigured: boolean;
}

export async function fetchLiveKitStatus(): Promise<LiveKitServerStatus | null> {
  try {
    const resp = await fetch('/api/livekit/status');
    if (!resp.ok) return null;
    return (await resp.json()) as LiveKitServerStatus;
  } catch {
    return null;
  }
}

export async function fetchLiveKitToken(params: {
  callId: string;
  scope: CallScope;
  conversationId?: string;
  groupId?: string;
  participantName: string;
  avatarUrl?: string;
}): Promise<LiveKitConnectionInfo> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Please sign in again before starting a call.');
  }
  const idToken = await user.getIdToken();
  const resp = await fetch('/api/livekit/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  const data = (await resp.json().catch(() => ({}))) as Partial<LiveKitConnectionInfo> & {
    error?: string;
  };
  if (!resp.ok || !data.token || !data.serverUrl) {
    throw new Error(data.error || 'Unable to authorize LiveKit call session.');
  }

  return {
    serverUrl: data.serverUrl,
    token: data.token,
    roomName: data.roomName || params.callId,
    identity: data.identity || user.uid,
    participantName: data.participantName || params.participantName,
    mode: data.mode || 'server-sandbox-bridge',
  };
}

async function notifyFcmEndpoint(params: {
  callId: string;
  title: string;
  body: string;
  callType: CallMediaType;
}): Promise<void> {
  try {
    const user = auth.currentUser;
    if (!user) return;
    const idToken = await user.getIdToken();
    await fetch('/api/calls/notify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(params),
    });
  } catch {
    // Non-fatal: Firestore signaling already notifies online recipients immediately.
  }
}

export async function startPrivateCallSession(params: {
  caller: UserProfile;
  peer: UserDirectoryEntry;
  conversationId: string;
  callType: CallMediaType;
}): Promise<CallSession> {
  const callId = `call_${Date.now()}_${params.caller.uid.slice(0, 6)}`;
  const roomName = `luga_dm_${callId}`;
  const participantIds = Array.from(new Set([params.caller.uid, params.peer.uid]));

  const firestorePayload: Record<string, unknown> = {
    callId,
    roomName,
    scope: 'private',
    callType: params.callType,
    conversationId: params.conversationId,
    callerId: params.caller.uid,
    callerName: params.caller.fullName.slice(0, 100),
    calleeId: params.peer.uid,
    calleeName: params.peer.fullName.slice(0, 100),
    participantIds,
    joinedIds: [params.caller.uid],
    declinedIds: [],
    status: 'ringing',
    durationSeconds: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.caller.avatarUrl) {
    firestorePayload.callerAvatarUrl = params.caller.avatarUrl.slice(0, 500);
  }
  if (params.peer.avatarUrl) {
    firestorePayload.calleeAvatarUrl = params.peer.avatarUrl.slice(0, 500);
  }

  try {
    await setDoc(doc(db, 'calls', callId), firestorePayload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `calls/${callId}`);
  }

  const callTypeLabel = params.callType === 'video' ? 'video call' : 'voice call';
  void sendNotification({
    userId: params.peer.uid,
    actorId: params.caller.uid,
    kind: 'call',
    title: `Incoming ${callTypeLabel} from ${params.caller.fullName}`,
    body: `${params.caller.fullName} is calling you on ${BRAND.platformName}.`,
  });

  void notifyFcmEndpoint({
    callId,
    title: `Incoming ${callTypeLabel}`,
    body: `${params.caller.fullName} is calling you on ${BRAND.platformName}`,
    callType: params.callType,
  });

  return {
    id: callId,
    callId,
    roomName,
    scope: 'private',
    callType: params.callType,
    conversationId: params.conversationId,
    callerId: params.caller.uid,
    callerName: params.caller.fullName,
    callerAvatarUrl: params.caller.avatarUrl,
    calleeId: params.peer.uid,
    calleeName: params.peer.fullName,
    calleeAvatarUrl: params.peer.avatarUrl,
    participantIds,
    joinedIds: [params.caller.uid],
    declinedIds: [],
    status: 'ringing',
    durationSeconds: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function startGroupCallSession(params: {
  caller: UserProfile;
  group: GroupItem;
  memberIds: string[];
  callType: CallMediaType;
}): Promise<CallSession> {
  const callId = `call_${Date.now()}_${params.caller.uid.slice(0, 6)}`;
  const roomName = `luga_grp_${callId}`;
  const participantIds = Array.from(new Set([params.caller.uid, ...params.memberIds])).slice(0, 40);

  const firestorePayload: Record<string, unknown> = {
    callId,
    roomName,
    scope: 'group',
    callType: params.callType,
    groupId: params.group.id,
    groupName: params.group.name.slice(0, 120),
    callerId: params.caller.uid,
    callerName: params.caller.fullName.slice(0, 100),
    participantIds,
    joinedIds: [params.caller.uid],
    declinedIds: [],
    status: 'ringing',
    durationSeconds: 0,
    startedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.caller.avatarUrl) {
    firestorePayload.callerAvatarUrl = params.caller.avatarUrl.slice(0, 500);
  }

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'calls', callId), firestorePayload);
    batch.update(doc(db, 'groups', params.group.id), {
      activeCallId: callId,
      activeCallType: params.callType,
      activeCallRoomName: roomName,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `calls/${callId}`);
  }

  const callTypeLabel = params.callType === 'video' ? 'video call' : 'voice call';
  participantIds
    .filter((uid) => uid !== params.caller.uid)
    .slice(0, 20)
    .forEach((uid) => {
      void sendNotification({
        userId: uid,
        actorId: params.caller.uid,
        kind: 'call',
        title: `Group ${callTypeLabel} in ${params.group.name}`,
        body: `${params.caller.fullName} started a ${callTypeLabel}. Tap to join.`,
      });
    });

  void notifyFcmEndpoint({
    callId,
    title: `${params.group.name} (${callTypeLabel})`,
    body: `${params.caller.fullName} started a group ${callTypeLabel}`,
    callType: params.callType,
  });

  return {
    id: callId,
    callId,
    roomName,
    scope: 'group',
    callType: params.callType,
    groupId: params.group.id,
    groupName: params.group.name,
    callerId: params.caller.uid,
    callerName: params.caller.fullName,
    callerAvatarUrl: params.caller.avatarUrl,
    participantIds,
    joinedIds: [params.caller.uid],
    declinedIds: [],
    status: 'ringing',
    durationSeconds: 0,
    startedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function fetchCallSessionById(callId: string): Promise<CallSession | null> {
  try {
    const snap = await getDoc(doc(db, 'calls', callId));
    if (!snap.exists()) return null;
    return {
      id: snap.id,
      ...(snap.data() as Omit<CallSession, 'id'>),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `calls/${callId}`);
  }
}

export async function acceptCallSession(call: CallSession, uid: string): Promise<void> {
  const patch: Record<string, unknown> = {
    status: 'active',
    joinedIds: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  };
  if (!call.participantIds.includes(uid) && call.participantIds.length < 40) {
    patch.participantIds = arrayUnion(uid);
  }
  if (!call.startedAt) {
    patch.startedAt = serverTimestamp();
  }
  try {
    await updateDoc(doc(db, 'calls', call.callId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `calls/${call.callId}`);
  }
}

export async function declineCallSession(call: CallSession, uid: string): Promise<void> {
  const patch: Record<string, unknown> = {
    declinedIds: arrayUnion(uid),
    updatedAt: serverTimestamp(),
  };
  if (call.scope === 'private') {
    patch.status = 'declined';
    patch.endedAt = serverTimestamp();
    patch.durationSeconds = 0;
    patch.endReason = 'declined';
  }
  try {
    await updateDoc(doc(db, 'calls', call.callId), patch);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `calls/${call.callId}`);
  }
}

export async function markCallSessionMissed(
  call: CallSession,
  reason: 'no_answer' | 'cancelled_by_caller' = 'no_answer'
): Promise<void> {
  try {
    await updateDoc(doc(db, 'calls', call.callId), {
      status: 'missed',
      endedAt: serverTimestamp(),
      durationSeconds: 0,
      endReason: reason,
      updatedAt: serverTimestamp(),
    });
    if (call.scope === 'private' && call.calleeId) {
      await sendNotification({
        userId: call.calleeId,
        actorId: call.callerId,
        kind: 'call',
        title: `Missed ${call.callType} call`,
        body: `You missed a ${call.callType} call from ${call.callerName}.`,
      });
    }
  } catch {
    // Best-effort timeout status update
  }
}

export async function leaveOrEndCallSession(call: CallSession, uid: string): Promise<void> {
  const startedMs = toMillis(call.startedAt);
  const rawSeconds = startedMs > 0 ? Math.max(0, Math.round((Date.now() - startedMs) / 1000)) : 0;
  const durationSeconds = Math.min(86400, rawSeconds);

  if (call.scope === 'group') {
    const remainingJoined = (call.joinedIds || []).filter((id) => id !== uid);
    const shouldEndRoom = remainingJoined.length === 0;
    try {
      const batch = writeBatch(db);
      const callPatch: Record<string, unknown> = {
        joinedIds: arrayRemove(uid),
        updatedAt: serverTimestamp(),
      };
      if (shouldEndRoom) {
        callPatch.status = 'ended';
        callPatch.endedAt = serverTimestamp();
        callPatch.durationSeconds = durationSeconds;
        callPatch.endReason = 'completed';
      }
      batch.update(doc(db, 'calls', call.callId), callPatch);

      if (shouldEndRoom && call.groupId) {
        batch.update(doc(db, 'groups', call.groupId), {
          activeCallId: deleteField(),
          activeCallType: deleteField(),
          activeCallRoomName: deleteField(),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
    } catch {
      // Ignore concurrent termination updates
    }
    return;
  }

  // Private 1-to-1 call
  if (call.status === 'ringing' && call.callerId === uid) {
    await markCallSessionMissed(call, 'cancelled_by_caller');
    return;
  }

  try {
    await updateDoc(doc(db, 'calls', call.callId), {
      status: 'ended',
      endedAt: serverTimestamp(),
      durationSeconds: call.status === 'active' ? durationSeconds : 0,
      endReason: 'completed',
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore concurrent updates when peer already ended call
  }
}

// ---------------------------------------------------------------------------
// Web Audio API Ringtone & Ringback Engine (Zero External Audio Dependencies)
// ---------------------------------------------------------------------------
let ringIntervalId: number | null = null;
let ringAudioCtx: AudioContext | null = null;

function playTonePulse(freqA: number, freqB: number, durationMs: number, volume = 0.05) {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!ringAudioCtx) {
      ringAudioCtx = new AudioCtx();
    }
    if (ringAudioCtx.state === 'suspended') {
      void ringAudioCtx.resume().catch(() => {});
    }
    const now = ringAudioCtx.currentTime;
    const gain = ringAudioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    gain.connect(ringAudioCtx.destination);

    const oscA = ringAudioCtx.createOscillator();
    oscA.type = 'sine';
    oscA.frequency.setValueAtTime(freqA, now);
    oscA.connect(gain);
    oscA.start(now);
    oscA.stop(now + durationMs / 1000 + 0.02);

    const oscB = ringAudioCtx.createOscillator();
    oscB.type = 'sine';
    oscB.frequency.setValueAtTime(freqB, now);
    oscB.connect(gain);
    oscB.start(now);
    oscB.stop(now + durationMs / 1000 + 0.02);
  } catch {
    // Ignore browser autoplay restrictions silently
  }
}

export function stopCallRingtones(): void {
  if (ringIntervalId !== null) {
    window.clearInterval(ringIntervalId);
    ringIntervalId = null;
  }
  try {
    navigator.vibrate?.(0);
  } catch {
    // ignore
  }
}

export function startIncomingRingtone(): void {
  stopCallRingtones();
  const pulse = () => {
    playTonePulse(523.25, 659.25, 320, 0.06);
    window.setTimeout(() => playTonePulse(659.25, 783.99, 340, 0.06), 360);
    try {
      navigator.vibrate?.([280, 180, 280]);
    } catch {
      // ignore
    }
  };
  pulse();
  ringIntervalId = window.setInterval(pulse, 2200);
}

export function startOutgoingRingback(): void {
  stopCallRingtones();
  const pulse = () => {
    playTonePulse(440, 480, 750, 0.035);
  };
  pulse();
  ringIntervalId = window.setInterval(pulse, 2600);
}

// ---------------------------------------------------------------------------
// Firebase Cloud Messaging & Browser Notification Registration
// ---------------------------------------------------------------------------
export async function registerCallPushNotifications(
  uid: string,
  requestPermission = false,
  onForegroundPayload?: (payload: { title?: string; body?: string; callId?: string }) => void
): Promise<{ permission: NotificationPermission | 'unsupported'; tokenSaved: boolean }> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return { permission: 'unsupported', tokenSaved: false };
  }

  let permission = Notification.permission;
  if (requestPermission && permission === 'default') {
    permission = await Notification.requestPermission();
  }
  if (permission !== 'granted') {
    return { permission, tokenSaved: false };
  }

  let swReg: ServiceWorkerRegistration | undefined;
  if ('serviceWorker' in navigator) {
    try {
      swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    } catch {
      // Continue gracefully if service worker registration is blocked
    }
  }

  let resolvedToken = `web_notif_${uid.slice(0, 12)}_${navigator.userAgent.length}`;
  try {
    const messagingMod = await import('firebase/messaging');
    const supported = await messagingMod.isSupported();
    if (supported) {
      const messaging = messagingMod.getMessaging(app);
      messagingMod.onMessage(messaging, (payload) => {
        onForegroundPayload?.({
          title: payload.notification?.title || (payload.data?.title as string | undefined),
          body: payload.notification?.body || (payload.data?.body as string | undefined),
          callId: payload.data?.callId as string | undefined,
        });
      });

      const vapidKey = (import.meta.env.VITE_FCM_VAPID_KEY || '').trim();
      if (vapidKey && swReg) {
        const fcmToken = await messagingMod.getToken(messaging, {
          vapidKey,
          serviceWorkerRegistration: swReg,
        });
        if (fcmToken && fcmToken.length >= 10) {
          resolvedToken = fcmToken.slice(0, 500);
        }
      }
    }
  } catch {
    // Fallback to service-worker local notification token marker
  }

  try {
    const tokenId = `tok_${resolvedToken.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)}`;
    const platform = /Android/i.test(navigator.userAgent)
      ? 'android_web'
      : /iPhone|iPad/i.test(navigator.userAgent)
      ? 'ios_web'
      : 'desktop_web';

    const ref = doc(db, 'users', uid, 'fcmTokens', tokenId);
    const existing = await getDoc(ref);
    if (existing.exists()) {
      await updateDoc(ref, {
        token: resolvedToken,
        platform,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        token: resolvedToken,
        platform,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return { permission, tokenSaved: true };
  } catch {
    return { permission, tokenSaved: false };
  }
}

export async function showIncomingCallBrowserNotification(call: CallSession): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const title =
    call.scope === 'group'
      ? `${call.groupName || 'Group'} ${call.callType} call`
      : `Incoming ${call.callType} call from ${call.callerName}`;
  const body =
    call.scope === 'group'
      ? `${call.callerName} started a group ${call.callType} call on ${BRAND.platformName}.`
      : `Tap to answer ${call.callerName} on ${BRAND.platformName}.`;

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (reg) {
        await reg.showNotification(title, {
          body,
          icon: BRAND.officialLogoUrl,
          badge: BRAND.officialLogoUrl,
          tag: `luga_call_${call.callId}`,
          requireInteraction: true,
        });
        return;
      }
    }
    new Notification(title, {
      body,
      icon: BRAND.officialLogoUrl,
      tag: `luga_call_${call.callId}`,
    });
  } catch {
    // Ignore browser notification constraints
  }
}
