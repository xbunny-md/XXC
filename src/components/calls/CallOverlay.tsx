import '@livekit/components-styles';
import { useEffect, useMemo, useState } from 'react';
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useAudioPlayback,
  useConnectionState,
  useFacingMode,
  useLocalParticipant,
  useMediaDevices,
  useParticipants,
  useRoomContext,
  useSpeakingParticipants,
  useTracks,
  VideoTrack,
} from '@livekit/components-react';
import { ConnectionState, MediaDeviceFailure, Track } from 'livekit-client';
import {
  AlertTriangle,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  RefreshCw,
  SwitchCamera,
  Users,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import { CallSession, formatDurationSeconds, toMillis } from '../../types/luga';
import { UserAvatar } from '../common/UserAvatar';

function cleanParticipantName(rawName: string | undefined, identity: string): string {
  const base = (rawName || identity || 'Member').replace(/\s*\([a-zA-Z0-9]{4,8}\)$/, '').trim();
  return base || 'LUGA Member';
}

function resolveCallHeaderInfo(call: CallSession, currentUid: string) {
  if (call.scope === 'group') {
    return {
      title: call.groupName || 'Group Call',
      subtitle:
        call.callerId === currentUid
          ? `Group ${call.callType} call`
          : `Started by ${call.callerName}`,
      avatarName: call.groupName || 'Group',
      avatarUrl: call.callerAvatarUrl,
    };
  }
  const isCaller = call.callerId === currentUid;
  const peerName = isCaller ? call.calleeName || 'LUGA Member' : call.callerName;
  const peerAvatar = isCaller ? call.calleeAvatarUrl : call.callerAvatarUrl;
  return {
    title: peerName,
    subtitle: call.callType === 'video' ? 'LUGA HUB Video Call' : 'LUGA HUB Voice Call',
    avatarName: peerName,
    avatarUrl: peerAvatar,
  };
}

interface StageProps {
  call: CallSession;
  currentUid: string;
  minimized: boolean;
  onMinimizeToggle: (next: boolean) => void;
  onHangup: () => void;
  onRetry: () => void;
  mediaError: string | null;
}

function ActiveCallStage({
  call,
  currentUid,
  minimized,
  onMinimizeToggle,
  onHangup,
  onRetry,
  mediaError,
}: StageProps) {
  const room = useRoomContext();
  const connectionState = useConnectionState(room);
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    lastMicrophoneError,
    lastCameraError,
  } = useLocalParticipant();
  const participants = useParticipants();
  const speakingParticipants = useSpeakingParticipants();
  const cameraTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
  const audioOutputs = useMediaDevices({ kind: 'audiooutput' });
  const videoInputs = useMediaDevices({ kind: 'videoinput' });
  const { canPlayAudio, startAudio } = useAudioPlayback(room);
  const { callPhase, setCallPhase, callError } = useCalls();

  const [speakerMuted, setSpeakerMuted] = useState(false);
  const [selectedAudioOutput, setSelectedAudioOutput] = useState<string>('');
  const [showAudioMenu, setShowAudioMenu] = useState(false);
  const [facingPreference, setFacingPreference] = useState<'user' | 'environment'>('user');
  const [videoDeviceIndex, setVideoDeviceIndex] = useState(0);
  const [connectedSinceMs, setConnectedSinceMs] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const localCameraTrack = cameraTracks.find((t) => t.participant.isLocal);
  const detectedFacing = useFacingMode(
    localCameraTrack || {
      participant: localParticipant,
      source: Track.Source.Camera,
    }
  );

  // Sync connection state into CallContext
  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      if (call.scope === 'group' || call.status === 'active') {
        setCallPhase('connected');
      }
      setConnectedSinceMs((prev) => prev ?? Date.now());
    } else if (connectionState === ConnectionState.Reconnecting) {
      setCallPhase('reconnecting');
    } else if (connectionState === ConnectionState.Connecting) {
      if (callPhase === 'idle') setCallPhase('connecting');
    }
  }, [connectionState, call.scope, call.status, callPhase, setCallPhase]);

  // Live call duration timer
  useEffect(() => {
    const remoteParticipants = participants.filter((p) => !p.isLocal);
    const hasJoinedRemote = remoteParticipants.length > 0 || call.status === 'active';
    if (!hasJoinedRemote) {
      setElapsedSeconds(0);
      return;
    }

    const anchorMs = toMillis(call.startedAt) || connectedSinceMs || Date.now();
    const tick = () => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - anchorMs) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [participants, call.status, call.startedAt, connectedSinceMs]);

  const headerInfo = useMemo(() => resolveCallHeaderInfo(call, currentUid), [call, currentUid]);
  const remoteParticipants = participants.filter((p) => !p.isLocal);
  const remoteCameraTracks = cameraTracks.filter((t) => !t.participant.isLocal);
  const speakingIds = new Set(speakingParticipants.map((p) => p.identity));

  const statusText = useMemo(() => {
    if (connectionState === ConnectionState.Reconnecting) return 'Reconnecting...';
    if (connectionState === ConnectionState.Connecting) return 'Connecting...';
    if (call.scope === 'private' && call.status === 'ringing' && remoteParticipants.length === 0) {
      return callPhase === 'outgoing_calling' ? 'Calling...' : 'Ringing...';
    }
    if (elapsedSeconds > 0 || call.status === 'active') {
      return formatDurationSeconds(elapsedSeconds);
    }
    return call.scope === 'group'
      ? `${participants.length} in call`
      : 'Connected';
  }, [
    connectionState,
    call.scope,
    call.status,
    remoteParticipants.length,
    callPhase,
    elapsedSeconds,
    participants.length,
  ]);

  const handleToggleMic = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      // Captured by lastMicrophoneError
    }
  };

  const handleToggleCamera = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled);
    } catch {
      // Captured by lastCameraError
    }
  };

  const handleSwitchCamera = async () => {
    const nextFacing =
      (detectedFacing === 'environment' || facingPreference === 'environment')
        ? 'user'
        : 'environment';
    setFacingPreference(nextFacing);

    try {
      if (videoInputs.length > 1) {
        const nextIdx = (videoDeviceIndex + 1) % videoInputs.length;
        setVideoDeviceIndex(nextIdx);
        await room.switchActiveDevice('videoinput', videoInputs[nextIdx].deviceId);
        return;
      }
      if (isCameraEnabled) {
        await localParticipant.setCameraEnabled(false);
      }
      await localParticipant.setCameraEnabled(true, {
        facingMode: nextFacing,
      });
    } catch {
      // Fallback safely if browser exposes single fixed webcam
    }
  };

  const handleSwitchAudioOutput = async (deviceId: string) => {
    setSelectedAudioOutput(deviceId);
    setShowAudioMenu(false);
    try {
      await room.switchActiveDevice('audiooutput', deviceId);
    } catch {
      // Browser may restrict setSinkId (e.g., iOS Safari)
    }
  };

  const activeErrorMessage =
    callError ||
    mediaError ||
    lastMicrophoneError?.message ||
    lastCameraError?.message ||
    null;

  return (
    <>
      <RoomAudioRenderer muted={speakerMuted} volume={speakerMuted ? 0 : 1} />

      {minimized ? (
        <div
          role="region"
          aria-label="Minimized active call"
          className="fixed bottom-[72px] lg:bottom-5 right-4 z-50 w-[min(92vw,340px)] rounded-2xl bg-slate-900 text-white border border-slate-700 shadow-2xl p-3 flex items-center justify-between gap-3"
        >
          <button
            type="button"
            onClick={() => onMinimizeToggle(false)}
            className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
          >
            <UserAvatar
              name={headerInfo.avatarName}
              avatarUrl={headerInfo.avatarUrl}
              size="sm"
              online={connectionState === ConnectionState.Connected}
            />
            <div className="min-w-0">
              <p className="text-xs font-bold truncate">{headerInfo.title}</p>
              <p className="text-[11px] font-mono text-emerald-400 truncate">
                {statusText}
              </p>
            </div>
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => void handleToggleMic()}
              aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
              className={`h-9 w-9 rounded-full flex items-center justify-center ${
                isMicrophoneEnabled ? 'bg-slate-800 hover:bg-slate-700' : 'bg-amber-600 text-white'
              }`}
            >
              {isMicrophoneEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onMinimizeToggle(false)}
              aria-label="Expand call window"
              className="h-9 w-9 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onHangup}
              aria-label="End call"
              className="h-9 w-9 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Active Call"
          className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden"
        >
          {/* Top Call Header */}
          <header className="px-4 sm:px-6 py-3.5 bg-slate-900/80 border-b border-slate-800/80 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <UserAvatar
                name={headerInfo.avatarName}
                avatarUrl={headerInfo.avatarUrl}
                size="sm"
                online={connectionState === ConnectionState.Connected}
              />
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold truncate">
                  {headerInfo.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="font-mono text-emerald-400">{statusText}</span>
                  {call.scope === 'group' && (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Users className="h-3 w-3" />
                      {participants.length}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onMinimizeToggle(true)}
              aria-label="Minimize call"
              className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5 shrink-0"
            >
              <Minimize2 className="h-4 w-4" />
              <span className="hidden sm:inline">Minimize</span>
            </button>
          </header>

          {/* Banners: Autoplay / Reconnection / Device Errors */}
          <div className="px-4 pt-2 space-y-2 shrink-0">
            {!canPlayAudio && (
              <div className="max-w-lg mx-auto rounded-xl bg-emerald-900/80 border border-emerald-700 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                <span>Tap to enable incoming call audio playback on this device.</span>
                <button
                  type="button"
                  onClick={() => void startAudio()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-semibold shrink-0"
                >
                  Enable Sound
                </button>
              </div>
            )}

            {connectionState === ConnectionState.Reconnecting && (
              <div className="max-w-lg mx-auto rounded-xl bg-amber-950/90 border border-amber-700 px-4 py-2 flex items-center justify-center gap-2 text-xs text-amber-200">
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Network unstable — attempting to reconnect call...</span>
              </div>
            )}

            {activeErrorMessage && (
              <div className="max-w-lg mx-auto rounded-xl bg-red-950/90 border border-red-800 px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-red-100">
                <span className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="truncate">{activeErrorMessage}</span>
                </span>
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-2.5 py-1 rounded-lg bg-red-800 hover:bg-red-700 font-semibold shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Main Video / Audio Call Stage */}
          <main className="relative flex-1 min-h-0 p-3 sm:p-6 flex items-center justify-center overflow-y-auto">
            {call.scope === 'group' ? (
              /* Group Call Grid */
              <div
                className={`w-full max-w-5xl grid gap-3 sm:gap-4 ${
                  participants.length <= 1
                    ? 'grid-cols-1 max-w-lg'
                    : participants.length <= 2
                    ? 'grid-cols-1 sm:grid-cols-2'
                    : participants.length <= 4
                    ? 'grid-cols-2'
                    : 'grid-cols-2 lg:grid-cols-3'
                }`}
              >
                {participants.map((participant) => {
                  const camTrack = cameraTracks.find(
                    (t) => t.participant.identity === participant.identity
                  );
                  const isSpeaking = speakingIds.has(participant.identity);
                  const micMuted = !participant.isMicrophoneEnabled;
                  const displayName = cleanParticipantName(
                    participant.name,
                    participant.identity
                  );

                  return (
                    <div
                      key={participant.identity}
                      className={`relative aspect-video min-h-[160px] sm:min-h-[220px] rounded-2xl overflow-hidden bg-slate-900 border-2 flex items-center justify-center transition-colors ${
                        isSpeaking ? 'border-emerald-500' : 'border-slate-800'
                      }`}
                    >
                      {camTrack ? (
                        <VideoTrack
                          trackRef={camTrack}
                          className={`h-full w-full object-cover ${
                            participant.isLocal && facingPreference === 'user' ? '-scale-x-100' : ''
                          }`}
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2.5 p-4 text-center">
                          <UserAvatar
                            name={displayName}
                            size="lg"
                            online={isSpeaking}
                          />
                          <p className="text-sm font-semibold text-white">{displayName}</p>
                        </div>
                      )}

                      <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded-lg bg-black/65 backdrop-blur-xs text-xs font-medium truncate">
                          {participant.isLocal ? `${displayName} (You)` : displayName}
                        </span>
                        {micMuted && (
                          <span className="h-7 w-7 rounded-full bg-red-600/90 flex items-center justify-center shrink-0">
                            <MicOff className="h-3.5 w-3.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* One-to-One Voice / Video Stage */
              <div className="relative w-full h-full max-w-4xl flex items-center justify-center">
                {remoteCameraTracks.length > 0 ? (
                  <div className="w-full h-full max-h-[72vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
                    <VideoTrack
                      trackRef={remoteCameraTracks[0]}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center space-y-4 p-6">
                    <div
                      className={`rounded-full p-2 transition-all ${
                        remoteParticipants.some((p) => speakingIds.has(p.identity))
                          ? 'ring-4 ring-emerald-500/70'
                          : call.status === 'ringing'
                          ? 'ring-4 ring-emerald-500/30 animate-pulse'
                          : ''
                      }`}
                    >
                      <UserAvatar
                        name={headerInfo.avatarName}
                        avatarUrl={headerInfo.avatarUrl}
                        size="xl"
                      />
                    </div>
                    <div className="space-y-1">
                      <h3 className="font-display text-xl sm:text-2xl font-bold">
                        {headerInfo.title}
                      </h3>
                      <p className="text-sm font-mono text-emerald-400">{statusText}</p>
                      <p className="text-xs text-slate-400">
                        {remoteParticipants.length === 0
                          ? `Waiting for ${headerInfo.title} to answer...`
                          : call.callType === 'video'
                          ? 'Camera is turned off'
                          : 'Connected voice audio'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Local Self-View PiP for 1-to-1 Video */}
                {localCameraTrack && isCameraEnabled && (
                  <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-5 w-28 sm:w-40 aspect-[3/4] sm:aspect-video rounded-xl overflow-hidden border-2 border-slate-700 bg-slate-900 shadow-2xl">
                    <VideoTrack
                      trackRef={localCameraTrack}
                      className={`h-full w-full object-cover ${
                        facingPreference === 'user' ? '-scale-x-100' : ''
                      }`}
                    />
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Bottom Controls Bar */}
          <footer className="relative px-4 py-4 sm:py-5 bg-slate-900/90 border-t border-slate-800/80 shrink-0">
            {showAudioMenu && audioOutputs.length > 0 && (
              <div className="max-w-xs mx-auto mb-3 rounded-xl bg-slate-800 border border-slate-700 p-2 space-y-1 text-xs">
                <p className="px-2 py-1 font-semibold text-slate-300">Audio Output Device</p>
                {audioOutputs.map((dev, idx) => (
                  <button
                    key={dev.deviceId || idx}
                    type="button"
                    onClick={() => void handleSwitchAudioOutput(dev.deviceId)}
                    className={`w-full text-left px-2.5 py-2 rounded-lg truncate ${
                      selectedAudioOutput === dev.deviceId
                        ? 'bg-emerald-700 text-white'
                        : 'hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    {dev.label || `Speaker ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
              {/* Speaker Mute / Audio Output Control */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSpeakerMuted((m) => !m)}
                  aria-label={speakerMuted ? 'Unmute speaker' : 'Mute speaker'}
                  className={`h-12 w-12 sm:h-13 sm:w-13 rounded-full flex items-center justify-center transition-colors ${
                    speakerMuted
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 text-white'
                  }`}
                >
                  {speakerMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
                {audioOutputs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setShowAudioMenu((s) => !s)}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-200"
                  >
                    Output
                  </button>
                )}
              </div>

              {/* Camera On / Off */}
              <button
                type="button"
                onClick={() => void handleToggleCamera()}
                aria-label={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
                className={`h-12 w-12 sm:h-13 sm:w-13 rounded-full flex items-center justify-center transition-colors ${
                  isCameraEnabled
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-slate-700/70 text-slate-300'
                }`}
              >
                {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
              </button>

              {/* Mobile / Multi-Camera Switcher */}
              {(isCameraEnabled || videoInputs.length > 1) && (
                <button
                  type="button"
                  onClick={() => void handleSwitchCamera()}
                  aria-label="Switch camera"
                  title="Switch front/back camera"
                  className="h-12 w-12 sm:h-13 sm:w-13 rounded-full bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center transition-colors"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
              )}

              {/* Microphone Mute / Unmute */}
              <button
                type="button"
                onClick={() => void handleToggleMic()}
                aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
                className={`h-12 w-12 sm:h-13 sm:w-13 rounded-full flex items-center justify-center transition-colors ${
                  isMicrophoneEnabled
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-amber-600 hover:bg-amber-500 text-white'
                }`}
              >
                {isMicrophoneEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
              </button>

              {/* End Call */}
              <button
                type="button"
                onClick={onHangup}
                aria-label="End call"
                className="h-12 px-6 sm:h-13 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center gap-2 transition-colors"
              >
                <PhoneOff className="h-5 w-5" />
                <span className="hidden sm:inline">End</span>
              </button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}

export function CallOverlay() {
  const { profile } = useAuth();
  const {
    activeCall,
    incomingCall,
    liveKitSession,
    callPhase,
    callNotice,
    callError,
    minimized,
    setMinimized,
    setCallPhase,
    clearCallFeedback,
    answerIncomingCall,
    rejectIncomingCall,
    hangupCall,
    retryCallConnection,
  } = useCalls();

  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeCall) setMediaError(null);
  }, [activeCall?.callId]);

  if (!profile) return null;

  const incomingInfo = incomingCall ? resolveCallHeaderInfo(incomingCall, profile.uid) : null;
  const activeInfo = activeCall ? resolveCallHeaderInfo(activeCall, profile.uid) : null;

  return (
    <>
      {/* Timed Call Status Toast */}
      {callNotice && !activeCall && !incomingCall && (
        <div
          role="status"
          className="fixed top-4 right-4 z-50 max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-4 py-3 flex items-center justify-between gap-3 text-xs font-medium text-slate-800 dark:text-slate-100"
        >
          <span>{callNotice}</span>
          <button
            type="button"
            onClick={clearCallFeedback}
            aria-label="Dismiss call notice"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && incomingInfo && !activeCall && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Incoming Call"
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md text-white flex items-center justify-center p-5"
        >
          <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 p-7 text-center space-y-6 shadow-2xl">
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                Incoming {incomingCall.scope === 'group' ? 'Group ' : ''}
                {incomingCall.callType === 'video' ? 'Video Call' : 'Voice Call'}
              </p>
              <p className="text-xs text-slate-400">LUGA HUB Community</p>
            </div>

            <div className="flex flex-col items-center gap-3">
              <div className="rounded-full p-2 ring-4 ring-emerald-500/40 animate-pulse">
                <UserAvatar
                  name={incomingInfo.avatarName}
                  avatarUrl={incomingInfo.avatarUrl}
                  size="xl"
                />
              </div>
              <div className="space-y-1">
                <h2 className="font-display text-2xl font-bold">{incomingInfo.title}</h2>
                <p className="text-xs text-slate-300">{incomingInfo.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-8 pt-2">
              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => void rejectIncomingCall(incomingCall)}
                  aria-label="Decline call"
                  className="h-16 w-16 rounded-full bg-red-600 hover:bg-red-700 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  <PhoneOff className="h-6 w-6" />
                </button>
                <span className="text-xs font-semibold text-slate-300">Decline</span>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => void answerIncomingCall(incomingCall)}
                  aria-label="Accept call"
                  className="h-16 w-16 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                >
                  {incomingCall.callType === 'video' ? (
                    <Video className="h-6 w-6" />
                  ) : (
                    <Phone className="h-6 w-6" />
                  )}
                </button>
                <span className="text-xs font-semibold text-emerald-300">Accept</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Token Outgoing Calling / Error Screen */}
      {activeCall && !liveKitSession && activeInfo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Connecting call"
          className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col items-center justify-between p-6"
        >
          <div className="text-center pt-4">
            <p className="text-xs font-semibold text-emerald-400">LUGA HUB Calling</p>
          </div>

          <div className="flex flex-col items-center text-center space-y-4 max-w-sm">
            <div className="rounded-full p-2 ring-4 ring-emerald-500/30 animate-pulse">
              <UserAvatar
                name={activeInfo.avatarName}
                avatarUrl={activeInfo.avatarUrl}
                size="xl"
              />
            </div>
            <h2 className="font-display text-2xl font-bold">{activeInfo.title}</h2>
            <p className="text-sm text-slate-300">
              {callPhase === 'error'
                ? callError || 'Call connection failed.'
                : 'Calling... Preparing encrypted LiveKit room'}
            </p>
            {callPhase === 'error' && (
              <button
                type="button"
                onClick={() => void retryCallConnection()}
                className="min-h-[42px] px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Retry Connection</span>
              </button>
            )}
          </div>

          <div className="pb-6">
            <button
              type="button"
              onClick={() => void hangupCall()}
              aria-label="Cancel call"
              className="h-14 px-7 rounded-full bg-red-600 hover:bg-red-700 text-white font-semibold text-sm flex items-center gap-2"
            >
              <PhoneOff className="h-5 w-5" />
              <span>End Call</span>
            </button>
          </div>
        </div>
      )}

      {/* LiveKit Connected Call Stage */}
      {activeCall && liveKitSession && (
        <LiveKitRoom
          serverUrl={liveKitSession.serverUrl}
          token={liveKitSession.token}
          connect={true}
          audio={true}
          video={activeCall.callType === 'video'}
          options={{
            adaptiveStream: true,
            dynacast: true,
          }}
          onConnected={() => {
            setMediaError(null);
            if (activeCall.scope === 'group' || activeCall.status === 'active') {
              setCallPhase('connected');
            }
          }}
          onError={(err) => {
            setMediaError(err.message || 'Audio/video connection encountered an error.');
          }}
          onMediaDeviceFailure={(failure?: MediaDeviceFailure, kind?: MediaDeviceKind) => {
            if (failure === MediaDeviceFailure.PermissionDenied) {
              setMediaError(
                `Please allow ${kind === 'videoinput' ? 'camera' : 'microphone'} permission in your browser settings.`
              );
            } else if (failure === MediaDeviceFailure.NotFound) {
              setMediaError(
                `No ${kind === 'videoinput' ? 'camera' : 'microphone'} device detected on this device.`
              );
            } else {
              setMediaError('Unable to access microphone or camera device.');
            }
          }}
        >
          <ActiveCallStage
            call={activeCall}
            currentUid={profile.uid}
            minimized={minimized}
            onMinimizeToggle={setMinimized}
            onHangup={() => void hangupCall()}
            onRetry={() => void retryCallConnection()}
            mediaError={mediaError}
          />
        </LiveKitRoom>
      )}
    </>
  );
}
