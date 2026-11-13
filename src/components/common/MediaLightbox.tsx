import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { CustomVideoPlayer } from './CustomVideoPlayer';

export type LightboxMedia =
  | { kind: 'images'; urls: string[]; initialIndex?: number; caption?: string }
  | { kind: 'video'; url: string; posterUrl?: string; caption?: string };

interface MediaLightboxProps {
  media: LightboxMedia | null;
  onClose: () => void;
}

export function MediaLightbox({ media, onClose }: MediaLightboxProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (media?.kind === 'images') {
      setIndex(media.initialIndex ?? 0);
    } else {
      setIndex(0);
    }
  }, [media]);

  useEffect(() => {
    if (!media) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (media.kind === 'images' && media.urls.length > 1) {
        if (e.key === 'ArrowLeft') {
          setIndex((i) => (i - 1 + media.urls.length) % media.urls.length);
        } else if (e.key === 'ArrowRight') {
          setIndex((i) => (i + 1) % media.urls.length);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [media, onClose]);

  if (!media) return null;

  const currentImageUrl =
    media.kind === 'images' ? media.urls[index] || media.urls[0] : media.url;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Media preview"
      className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col justify-between p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between gap-3 text-white z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          {media.kind === 'images' && media.urls.length > 1 && (
            <span className="text-xs font-mono text-slate-300">
              {index + 1} / {media.urls.length}
            </span>
          )}
          {media.caption && (
            <p className="text-xs sm:text-sm text-slate-200 truncate">{media.caption}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href={currentImageUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            aria-label="Open original media"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <Download className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media viewer"
            className="min-h-[40px] min-w-[40px] rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 flex items-center justify-center relative my-2"
        onClick={(e) => e.stopPropagation()}
      >
        {media.kind === 'images' ? (
          <>
            {media.urls.length > 1 && (
              <button
                type="button"
                onClick={() =>
                  setIndex((i) => (i - 1 + media.urls.length) % media.urls.length)
                }
                aria-label="Previous image"
                className="absolute left-2 sm:left-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <img
              src={currentImageUrl}
              alt={media.caption || 'Preview'}
              referrerPolicy="no-referrer"
              className="max-h-full max-w-full object-contain rounded-lg"
            />
            {media.urls.length > 1 && (
              <button
                type="button"
                onClick={() => setIndex((i) => (i + 1) % media.urls.length)}
                aria-label="Next image"
                className="absolute right-2 sm:right-4 z-10 min-h-[44px] min-w-[44px] rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}
          </>
        ) : (
          <div className="w-full max-w-3xl max-h-full aspect-video sm:aspect-auto flex items-center justify-center">
            <CustomVideoPlayer
              src={media.url}
              poster={media.posterUrl}
              variant="card"
              autoPlayWhenVisible
              className="w-full max-h-[82vh]"
            />
          </div>
        )}
      </div>

      {media.kind === 'images' && media.urls.length > 1 && (
        <div
          className="flex items-center justify-center gap-2 overflow-x-auto py-1"
          onClick={(e) => e.stopPropagation()}
        >
          {media.urls.map((u, idx) => (
            <button
              key={u + idx}
              type="button"
              onClick={() => setIndex(idx)}
              className={`h-12 w-12 rounded-lg overflow-hidden border-2 shrink-0 ${
                idx === index ? 'border-emerald-500' : 'border-transparent opacity-60 hover:opacity-100'
              }`}
            >
              <img src={u} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
