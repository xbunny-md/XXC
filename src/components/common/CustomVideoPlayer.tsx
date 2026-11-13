import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getOptimizedVideoUrl, getVideoPosterUrl } from '../../lib/mediaService';
import { formatDurationSeconds } from '../../types/luga';

interface CustomVideoPlayerProps {
  src: string;
  poster?: string;
  variant?: 'reel' | 'card';
  isActive?: boolean;
  autoPlayWhenVisible?: boolean;
  muted?: boolean;
  onMutedChange?: (muted: boolean) => void;
  className?: string;
}

export function CustomVideoPlayer({
  src,
  poster,
  variant = 'card',
  isActive,
  autoPlayWhenVisible = false,
  muted: controlledMuted,
  onMutedChange,
  className = '',
}: CustomVideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [playing, setPlaying] = useState(false);
  const [internalMuted, setInternalMuted] = useState(variant === 'reel');
  const [volume, setVolume] = useState(0.85);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCenterFeedback, setShowCenterFeedback] = useState(false);
  const [userPausedManually, setUserPausedManually] = useState(false);

  const effectiveMuted = controlledMuted ?? internalMuted;
  const optimizedSrc = getOptimizedVideoUrl(src);
  const resolvedPoster = getVideoPosterUrl(src, poster);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = effectiveMuted;
    video.volume = effectiveMuted ? 0 : volume;
  }, [effectiveMuted, volume]);

  // Controlled reel playback: play ONLY the active video and pause all others
  useEffect(() => {
    if (isActive === undefined) return;
    const video = videoRef.current;
    if (!video) return;
    if (isActive && !userPausedManually) {
      setLoading(true);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
          // If browser blocks unmuted autoplay, retry muted smoothly
          video.muted = true;
          setInternalMuted(true);
          onMutedChange?.(true);
          void video.play().catch(() => {
            setPlaying(false);
            setLoading(false);
          });
        });
      }
    } else if (!isActive) {
      video.pause();
      setPlaying(false);
      setUserPausedManually(false);
    }
  }, [isActive, userPausedManually, onMutedChange]);

  // Card autoPlayWhenVisible via IntersectionObserver
  useEffect(() => {
    if (!autoPlayWhenVisible || isActive !== undefined) return;
    const el = containerRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.65 && !userPausedManually) {
          video.muted = true;
          void video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: [0.2, 0.65] }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoPlayWhenVisible, isActive, userPausedManually]);

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const triggerCenterFlash = () => {
    setShowCenterFeedback(true);
    window.setTimeout(() => setShowCenterFeedback(false), 550);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video || hasError) return;
    if (video.paused) {
      setUserPausedManually(false);
      setLoading(true);
      void video.play().catch(() => {
        video.muted = true;
        setInternalMuted(true);
        onMutedChange?.(true);
        void video.play().catch(() => {});
      });
    } else {
      setUserPausedManually(true);
      video.pause();
    }
    triggerCenterFlash();
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !effectiveMuted;
    setInternalMuted(next);
    onMutedChange?.(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = Number(e.target.value);
    setVolume(val);
    const shouldMute = val === 0;
    setInternalMuted(shouldMute);
    onMutedChange?.(shouldMute);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = shouldMute;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const val = Number(e.target.value);
    setCurrentTime(val);
    if (videoRef.current) {
      videoRef.current.currentTime = val;
    }
  };

  const toggleFullscreen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = containerRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Fullscreen denied by iframe policy; fallback silently
    }
  };

  const retryLoad = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    setHasError(false);
    setLoading(true);
    video.load();
    void video.play().catch(() => setLoading(false));
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      ref={containerRef}
      onClick={togglePlay}
      className={`relative overflow-hidden bg-slate-950 select-none group cursor-pointer ${
        variant === 'reel' ? 'h-full w-full' : 'rounded-xl aspect-video max-h-[460px] w-full'
      } ${className}`}
    >
      <video
        ref={videoRef}
        src={optimizedSrc}
        poster={resolvedPoster || undefined}
        playsInline
        loop={variant === 'reel'}
        preload={isActive === false ? 'metadata' : 'auto'}
        onLoadStart={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => {
          setPlaying(true);
          setLoading(false);
          setHasError(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (Number.isFinite(v.duration)) setDuration(v.duration);
        }}
        onTimeUpdate={(e) => {
          setCurrentTime(e.currentTarget.currentTime);
        }}
        onError={() => {
          setHasError(true);
          setLoading(false);
          setPlaying(false);
        }}
        className="w-full h-full object-contain"
      />

      {/* Loading Spinner */}
      {loading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/25 pointer-events-none">
          <Loader2 className="h-9 w-9 text-white animate-spin" />
        </div>
      )}

      {/* Error Recovery State */}
      {hasError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-900/95 text-white p-4 text-center"
        >
          <AlertTriangle className="h-7 w-7 text-amber-400" />
          <p className="text-xs text-slate-200 font-medium">Unable to stream this video right now.</p>
          <button
            type="button"
            onClick={retryLoad}
            className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Center Play / Pause Tap Feedback */}
      {!hasError && (!playing || showCenterFeedback) && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-14 w-14 rounded-full bg-black/55 backdrop-blur-xs text-white flex items-center justify-center">
            {playing ? <Pause className="h-6 w-6" /> : <Play className="h-6 w-6 ml-0.5" />}
          </div>
        </div>
      )}

      {/* Bottom Controls Bar */}
      {!hasError && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-3 pt-6 pb-2.5 space-y-1.5 transition-opacity ${
            variant === 'reel' ? 'opacity-100' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
          }`}
        >
          {/* Scrubber Bar */}
          <div className="relative flex items-center h-4">
            <div className="w-full h-1 rounded-full bg-white/30 overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-100"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step={0.1}
              value={currentTime}
              onChange={handleSeek}
              aria-label="Seek video progress"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-white text-xs">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  togglePlay();
                }}
                aria-label={playing ? 'Pause video' : 'Play video'}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-white/15"
              >
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>

              <span className="font-mono text-[11px] text-slate-200 tabular-nums">
                {formatDurationSeconds(currentTime)} / {formatDurationSeconds(duration)}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={toggleMute}
                aria-label={effectiveMuted ? 'Unmute video' : 'Mute video'}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-white/15"
              >
                {effectiveMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={effectiveMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="hidden sm:block w-16 accent-emerald-500 cursor-pointer"
              />
              <button
                type="button"
                onClick={(e) => void toggleFullscreen(e)}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen video'}
                className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg hover:bg-white/15"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
