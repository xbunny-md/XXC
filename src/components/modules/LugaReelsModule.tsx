import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, type QueryDocumentSnapshot } from 'firebase/firestore';
import {
  Bookmark,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Film,
  Flag,
  Heart,
  Loader2,
  MessageCircle,
  Plus,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchReelsPage,
  incrementPostShareCount,
  toggleBookmark,
  togglePostLike,
} from '../../lib/communityService';
import { db } from '../../lib/firebase';
import { FeedPost, formatFirestoreDate } from '../../types/luga';
import { CommentsSheet } from '../common/CommentsSheet';
import { CustomVideoPlayer } from '../common/CustomVideoPlayer';
import { UserAvatar } from '../common/UserAvatar';
import { UserProfileModal } from '../common/UserProfileModal';
import { ReportModal } from '../layout/ReportModal';
import { CreateMediaModal } from './CreateMediaModal';

interface LugaReelsModuleProps {
  searchQuery?: string;
  composerTrigger?: number;
  onMessageUser: (uid: string) => void;
}

function renderHashtagText(text: string) {
  const parts = text.split(/(\s+)/);
  return parts.map((part, idx) =>
    /^#[\w-]+$/.test(part) ? (
      <span key={idx} className="text-emerald-300 font-medium">
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    )
  );
}

interface ReelImageCarouselProps {
  urls: string[];
  alt: string;
}

function ReelImageCarousel({ urls, alt }: ReelImageCarouselProps) {
  const [idx, setIdx] = useState(0);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const safeIdx = Math.min(idx, Math.max(0, urls.length - 1));
  const currentUrl = urls[safeIdx];

  const prev = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIdx((i) => (i - 1 + urls.length) % urls.length);
  };

  const next = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setIdx((i) => (i + 1) % urls.length);
  };

  return (
    <div
      className="relative h-full w-full bg-slate-950 overflow-hidden flex items-center justify-center"
      onTouchStart={(e) => {
        const touch = e.touches[0];
        if (touch) touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || urls.length <= 1) return;
        const touch = e.changedTouches[0];
        if (!touch) return;
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) {
            setIdx((i) => (i + 1) % urls.length);
          } else {
            setIdx((i) => (i - 1 + urls.length) % urls.length);
          }
        }
      }}
    >
      {/* Ambient blurred backdrop prevents harsh letterboxing on landscape/portrait mismatch */}
      <img
        src={currentUrl}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        className="absolute inset-0 h-full w-full object-cover blur-2xl opacity-35 scale-110 pointer-events-none"
      />
      <img
        src={currentUrl}
        alt={alt}
        referrerPolicy="no-referrer"
        className="relative h-full w-full object-contain select-none transition-opacity duration-200"
      />

      {urls.length > 1 && (
        <>
          <span className="absolute top-3.5 left-3.5 z-10 px-2 py-0.5 rounded-md bg-black/55 text-white font-mono text-[11px] tabular-nums">
            {safeIdx + 1}/{urls.length}
          </span>

          <button
            type="button"
            onClick={prev}
            aria-label="Previous photo"
            className="absolute left-2.5 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={next}
            aria-label="Next photo"
            className="absolute right-16 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/50 hover:bg-black/75 text-white flex items-center justify-center"
          >
            <ChevronRight className="h-4 w-4" />
          </button>

          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIdx(i);
                }}
                aria-label={`Photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${
                  i === safeIdx ? 'w-4 bg-white' : 'w-1.5 bg-white/45'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function LugaReelsModule({
  searchQuery = '',
  composerTrigger = 0,
  onMessageUser,
}: LugaReelsModuleProps) {
  const { profile } = useAuth();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [reels, setReels] = useState<FeedPost[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});
  const [expandedDesc, setExpandedDesc] = useState<Record<string, boolean>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [commentsPost, setCommentsPost] = useState<FeedPost | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'post' | 'comment' | 'user' | 'group';
    targetId: string;
    targetSummary: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (composerTrigger > 0) {
      setCreateOpen(true);
    }
  }, [composerTrigger]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const syncUserInteractions = useCallback(
    async (items: FeedPost[]) => {
      if (!profile || items.length === 0) return;
      const likesMap: Record<string, boolean> = {};
      const bmMap: Record<string, boolean> = {};
      await Promise.all(
        items.map(async (p) => {
          try {
            const [likeSnap, bmSnap] = await Promise.all([
              getDoc(doc(db, 'posts', p.id, 'likes', profile.uid)),
              getDoc(doc(db, 'users', profile.uid, 'bookmarks', `post_${p.id}`)),
            ]);
            likesMap[p.id] = likeSnap.exists();
            bmMap[p.id] = bmSnap.exists();
          } catch {
            // ignore partial status lookup errors
          }
        })
      );
      setLikedIds((prev) => ({ ...prev, ...likesMap }));
      setBookmarkedIds((prev) => ({ ...prev, ...bmMap }));
    },
    [profile]
  );

  const loadInitialReels = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const page = await fetchReelsPage({ pageSize: 10, cursor: null });
      setReels(page.posts);
      setCursor(page.lastDoc);
      setHasMore(page.hasMore);
      setActiveIndex(0);
      await syncUserInteractions(page.posts);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load LUGA REELS right now.');
    } finally {
      setLoading(false);
    }
  }, [syncUserInteractions]);

  const loadMoreReels = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    try {
      const page = await fetchReelsPage({ pageSize: 10, cursor });
      if (page.posts.length > 0) {
        setReels((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const unique = page.posts.filter((p) => !seen.has(p.id));
          return [...prev, ...unique];
        });
        await syncUserInteractions(page.posts);
      }
      setCursor(page.lastDoc);
      setHasMore(page.hasMore);
    } catch {
      // Allow retry on next scroll without disrupting active playback
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, cursor, syncUserInteractions]);

  useEffect(() => {
    void loadInitialReels();
  }, [loadInitialReels]);

  const filteredReels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return reels;
    return reels.filter(
      (p) =>
        p.authorName.toLowerCase().includes(q) ||
        (p.authorUsername || '').toLowerCase().includes(q) ||
        (p.caption || '').toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [reels, searchQuery]);

  // Track visible slide
  useEffect(() => {
    const root = containerRef.current;
    if (!root || filteredReels.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.65) {
            const idx = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(idx)) setActiveIndex(idx);
          }
        }
      },
      { root, threshold: [0.65] }
    );

    slideRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [filteredReels]);

  // Trigger infinite scroll pagination ahead of reaching the end
  useEffect(() => {
    if (
      !searchQuery.trim() &&
      hasMore &&
      !loadingMore &&
      filteredReels.length > 0 &&
      activeIndex >= filteredReels.length - 3
    ) {
      void loadMoreReels();
    }
  }, [activeIndex, filteredReels.length, hasMore, loadingMore, searchQuery, loadMoreReels]);

  const scrollToSlide = (targetIdx: number) => {
    const clamped = Math.max(0, Math.min(filteredReels.length - 1, targetIdx));
    slideRefs.current[clamped]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleToggleLike = async (post: FeedPost) => {
    if (!profile) return;
    const wasLiked = Boolean(likedIds[post.id]);
    setLikedIds((prev) => ({ ...prev, [post.id]: !wasLiked }));
    setReels((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, likesCount: Math.max(0, p.likesCount + (wasLiked ? -1 : 1)) }
          : p
      )
    );
    try {
      await togglePostLike(post, profile.uid, profile.fullName);
    } catch {
      void loadInitialReels();
    }
  };

  const handleToggleBookmark = async (post: FeedPost) => {
    if (!profile) return;
    const saved = Boolean(bookmarkedIds[post.id]);
    setBookmarkedIds((prev) => ({ ...prev, [post.id]: !saved }));
    await toggleBookmark(
      profile.uid,
      {
        itemId: post.id,
        itemType: 'post',
        title: (post.caption || post.content).slice(0, 120),
        summary: `Post by ${post.authorName}`,
        authorName: post.authorName,
      },
      saved
    );
    setToast(saved ? 'Removed from saved items' : 'Saved to bookmarks');
  };

  const handleShare = async (post: FeedPost) => {
    const text = `${post.authorName} (@${post.authorUsername || 'lugaboyz'}) on LUGA REELS:\n${post.caption || post.content}\n${window.location.origin}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'LUGA REELS', text });
      } catch {
        // user cancelled share
      }
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setToast('Link copied to clipboard');
    }
    await incrementPostShareCount(post);
    setReels((prev) =>
      prev.map((p) => (p.id === post.id ? { ...p, sharesCount: (p.sharesCount || 0) + 1 } : p))
    );
  };

  const handlePublished = (newPost: FeedPost) => {
    setReels((prev) => [newPost, ...prev.filter((p) => p.id !== newPost.id)]);
    setActiveIndex(0);
    setToast('Published to LUGA REELS');
    window.requestAnimationFrame(() => {
      slideRefs.current[0]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const activeIsVideo = Boolean(filteredReels[activeIndex]?.videoUrl);

  return (
    <div className="relative h-[calc(100dvh-110px)] lg:h-[calc(100dvh-64px)] w-full bg-slate-950 overflow-hidden select-none">
      {/* Minimal Floating Top-Right Controls */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        {activeIsVideo && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? 'Unmute video' : 'Mute video'}
            className="min-h-[44px] min-w-[44px] rounded-full bg-black/55 hover:bg-black/75 backdrop-blur-xs text-white flex items-center justify-center transition-colors"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
        )}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="min-h-[44px] px-4 rounded-full bg-emerald-800/95 hover:bg-emerald-700 backdrop-blur-xs text-white text-xs font-semibold flex items-center gap-1.5 shadow-lg transition-colors"
        >
          <Plus className="h-4 w-4" />
          <span>Post</span>
        </button>
      </div>

      {/* Subtle Toast Banner */}
      {toast && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 px-3.5 py-2 rounded-xl bg-slate-900/95 border border-slate-700 text-xs text-white shadow-lg">
          {toast}
        </div>
      )}

      {loading ? (
        <div className="h-full w-full flex flex-col items-center justify-center text-white gap-2.5">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-400" />
          <p className="text-xs text-slate-300">Loading LUGA REELS...</p>
        </div>
      ) : loadError ? (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-3">
          <p className="text-sm font-semibold text-rose-400">Could not load LUGA REELS</p>
          <p className="text-xs text-slate-400 max-w-sm break-words">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadInitialReels()}
            className="min-h-[44px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Retry
          </button>
        </div>
      ) : filteredReels.length === 0 ? (
        <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center space-y-3">
          <Film className="h-10 w-10 text-emerald-400" />
          <h2 className="font-display text-lg font-bold text-white">
            {searchQuery.trim() ? 'No matching media found' : 'No photos or videos yet'}
          </h2>
          <p className="text-xs text-slate-400 max-w-sm">
            {searchQuery.trim()
              ? 'Try clearing the search bar or searching another keyword.'
              : 'Be the first to share a campus photo, carousel, or video into LUGA REELS.'}
          </p>
          {!searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="min-h-[44px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              <span>Share Media</span>
            </button>
          )}
        </div>
      ) : (
        <div className="relative h-full w-full flex items-center justify-center">
          {/* Desktop Up / Down Reel Navigation */}
          <div className="hidden md:flex flex-col items-center gap-2.5 absolute right-6 top-1/2 -translate-y-1/2 z-20">
            <button
              type="button"
              disabled={activeIndex === 0}
              onClick={() => scrollToSlide(activeIndex - 1)}
              aria-label="Previous post"
              className="h-11 w-11 rounded-full bg-slate-900/90 border border-slate-700 text-white disabled:opacity-35 flex items-center justify-center hover:bg-slate-800 transition-colors"
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <span className="font-mono text-[11px] text-slate-400 tabular-nums">
              {activeIndex + 1}/{filteredReels.length}
            </span>
            <button
              type="button"
              disabled={activeIndex >= filteredReels.length - 1}
              onClick={() => scrollToSlide(activeIndex + 1)}
              aria-label="Next post"
              className="h-11 w-11 rounded-full bg-slate-900/90 border border-slate-700 text-white disabled:opacity-35 flex items-center justify-center hover:bg-slate-800 transition-colors"
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* Vertical Snap Scroller */}
          <div
            ref={containerRef}
            className="h-full w-full lg:max-w-[480px] xl:max-w-[520px] lg:mx-auto overflow-y-auto snap-y snap-mandatory bg-slate-950 lg:border-x lg:border-slate-900"
          >
            {filteredReels.map((post, idx) => {
              const isLiked = Boolean(likedIds[post.id]);
              const isSaved = Boolean(bookmarkedIds[post.id]);
              const isExpanded = Boolean(expandedDesc[post.id]);

              const imageList =
                Array.isArray(post.imageUrls) && post.imageUrls.length > 0
                  ? post.imageUrls
                  : post.imageUrl
                    ? [post.imageUrl]
                    : [];
              const hasVideo = Boolean(post.videoUrl);

              return (
                <div
                  key={post.id}
                  ref={(el) => {
                    slideRefs.current[idx] = el;
                  }}
                  data-index={idx}
                  className="relative h-full w-full snap-start snap-always overflow-hidden bg-slate-950"
                >
                  {hasVideo ? (
                    <CustomVideoPlayer
                      src={post.videoUrl || ''}
                      poster={post.videoThumbnailUrl}
                      variant="reel"
                      isActive={activeIndex === idx}
                      muted={muted}
                      onMutedChange={setMuted}
                    />
                  ) : (
                    <ReelImageCarousel
                      urls={imageList}
                      alt={post.caption || post.content}
                    />
                  )}

                  {/* Bottom Readability Gradient */}
                  <div
                    className={`pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent ${
                      hasVideo ? 'h-48 bottom-10' : 'h-44'
                    }`}
                  />

                  {/* Right Vertical Action Rail */}
                  <div
                    className={`absolute right-2.5 z-10 flex flex-col items-center gap-3 text-white ${
                      hasVideo ? 'bottom-16' : 'bottom-6'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setProfileUid(post.authorId)}
                      className="rounded-full ring-2 ring-white"
                      aria-label={`View ${post.authorName} profile`}
                    >
                      <UserAvatar
                        name={post.authorName}
                        avatarUrl={post.authorAvatarUrl}
                        size="sm"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleToggleLike(post)}
                      aria-label="Like"
                      className="flex flex-col items-center gap-0.5 min-w-[44px]"
                    >
                      <span
                        className={`h-11 w-11 rounded-full bg-black/50 flex items-center justify-center ${
                          isLiked ? 'text-rose-400' : 'text-white'
                        }`}
                      >
                        <Heart className={`h-5 w-5 ${isLiked ? 'fill-current' : ''}`} />
                      </span>
                      <span className="text-[11px] font-mono font-semibold tabular-nums drop-shadow">
                        {post.likesCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCommentsPost(post)}
                      aria-label="Comments"
                      className="flex flex-col items-center gap-0.5 min-w-[44px]"
                    >
                      <span className="h-11 w-11 rounded-full bg-black/50 flex items-center justify-center">
                        <MessageCircle className="h-5 w-5" />
                      </span>
                      <span className="text-[11px] font-mono font-semibold tabular-nums drop-shadow">
                        {post.commentsCount}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleToggleBookmark(post)}
                      aria-label="Bookmark"
                      className="flex flex-col items-center gap-0.5 min-w-[44px]"
                    >
                      <span
                        className={`h-11 w-11 rounded-full bg-black/50 flex items-center justify-center ${
                          isSaved ? 'text-amber-300' : 'text-white'
                        }`}
                      >
                        <Bookmark className={`h-5 w-5 ${isSaved ? 'fill-current' : ''}`} />
                      </span>
                      <span className="text-[10px] font-medium drop-shadow">
                        {isSaved ? 'Saved' : 'Save'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleShare(post)}
                      aria-label="Share"
                      className="flex flex-col items-center gap-0.5 min-w-[44px]"
                    >
                      <span className="h-11 w-11 rounded-full bg-black/50 flex items-center justify-center">
                        <Share2 className="h-5 w-5" />
                      </span>
                      <span className="text-[11px] font-mono font-semibold tabular-nums drop-shadow">
                        {post.sharesCount || 0}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setReportTarget({
                          targetType: 'post',
                          targetId: post.id,
                          targetSummary: `Post by ${post.authorName}: ${(post.caption || post.content).slice(0, 120)}`,
                        })
                      }
                      aria-label="Report post"
                      className="h-10 w-10 rounded-full bg-black/50 flex items-center justify-center text-slate-200 hover:text-amber-300"
                    >
                      <Flag className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Bottom-Left Creator & Caption Overlay */}
                  <div
                    className={`absolute left-3.5 right-16 z-10 text-white ${
                      hasVideo ? 'bottom-16' : 'bottom-6'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setProfileUid(post.authorId)}
                      className="text-left flex items-center gap-1.5 hover:underline"
                    >
                      <span className="font-display text-sm font-bold drop-shadow">
                        {post.authorName}
                      </span>
                      {post.authorUsername && (
                        <span className="text-xs text-slate-200 drop-shadow">
                          @{post.authorUsername}
                        </span>
                      )}
                    </button>
                    <p className="text-[11px] text-slate-300 drop-shadow mt-0.5">
                      {post.authorRole} · {formatFirestoreDate(post.createdAt)}
                    </p>
                    {post.caption && (
                      <p className="text-xs font-semibold mt-1 drop-shadow">
                        {renderHashtagText(post.caption)}
                      </p>
                    )}
                    {post.content && post.content !== post.caption && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedDesc((prev) => ({ ...prev, [post.id]: !prev[post.id] }))
                        }
                        className={`text-left text-xs text-slate-100 mt-0.5 drop-shadow ${
                          isExpanded ? '' : 'line-clamp-2'
                        }`}
                      >
                        {renderHashtagText(post.content)}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {loadingMore && (
              <div className="h-16 flex items-center justify-center text-slate-400 text-xs gap-2">
                <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                <span>Loading more...</span>
              </div>
            )}
          </div>
        </div>
      )}

      <CreateMediaModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onPublished={handlePublished}
      />

      <CommentsSheet
        post={commentsPost}
        onClose={() => setCommentsPost(null)}
        onCommentsCountChange={(postId, count) =>
          setReels((prev) =>
            prev.map((p) => (p.id === postId ? { ...p, commentsCount: count } : p))
          )
        }
        onOpenUserProfile={(uid) => {
          setCommentsPost(null);
          setProfileUid(uid);
        }}
      />

      <UserProfileModal
        uid={profileUid}
        onClose={() => setProfileUid(null)}
        onMessageUser={onMessageUser}
        onReportUser={(t) =>
          setReportTarget({
            targetType: 'user',
            targetId: t.targetId,
            targetSummary: t.targetSummary,
          })
        }
      />

      <ReportModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmitted={() => setToast('Report submitted for administrator review')}
      />
    </div>
  );
}
