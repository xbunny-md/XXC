import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Film,
  ImagePlus,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { createCommunityPost } from '../../lib/communityService';
import {
  uploadMultipleImagesToImgBB,
  uploadVideoToCloudinary,
} from '../../lib/mediaService';
import { FeedPost, PostCategory, ROLE_LABELS } from '../../types/luga';

interface CreateMediaModalProps {
  open: boolean;
  onClose: () => void;
  onPublished: (post: FeedPost) => void;
}

const CATEGORIES: Array<{ value: PostCategory; label: string }> = [
  { value: 'general', label: 'General' },
  { value: 'academics', label: 'Academics' },
  { value: 'sports', label: 'Sports' },
  { value: 'clubs', label: 'Clubs' },
  { value: 'alumni', label: 'Alumni' },
];

export function CreateMediaModal({ open, onClose, onPublished }: CreateMediaModalProps) {
  const { profile } = useAuth();

  const [mode, setMode] = useState<'image' | 'video'>('image');
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);

  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<PostCategory>('general');

  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  const imagePreviews = useMemo(
    () => imageFiles.map((f) => ({ file: f, url: URL.createObjectURL(f) })),
    [imageFiles]
  );

  const videoPreviewUrl = useMemo(
    () => (videoFile ? URL.createObjectURL(videoFile) : null),
    [videoFile]
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [imagePreviews]);

  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
    };
  }, [videoPreviewUrl]);

  useEffect(() => {
    if (previewIdx >= imageFiles.length) {
      setPreviewIdx(Math.max(0, imageFiles.length - 1));
    }
  }, [imageFiles.length, previewIdx]);

  if (!open || !profile) return null;

  const resetAll = () => {
    setImageFiles([]);
    setVideoFile(null);
    setPreviewIdx(0);
    setCaption('');
    setCategory('general');
    setProgress(0);
    setProgressLabel('');
    setError(null);
  };

  const handleClose = () => {
    if (publishing) return;
    resetAll();
    onClose();
  };

  const handleSelectImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setMode('image');
    setVideoFile(null);
    setImageFiles((prev) => [...prev, ...files].slice(0, 6));
  };

  const handleSelectVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setMode('video');
    setImageFiles([]);
    setVideoFile(file);
  };

  const removeImageAt = (idx: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const hasMedia = mode === 'image' ? imageFiles.length > 0 : Boolean(videoFile);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasMedia || publishing) return;
    setError(null);
    setPublishing(true);

    try {
      const cleanCaption = caption.trim();
      const postContent =
        cleanCaption || (mode === 'video' ? 'Shared a video' : 'Shared photos');

      if (mode === 'image' && imageFiles.length > 0) {
        setProgressLabel(
          imageFiles.length === 1
            ? 'Uploading photo...'
            : `Uploading ${imageFiles.length} photos...`
        );
        setProgress(20);
        const uploaded = await uploadMultipleImagesToImgBB(imageFiles);
        setProgress(85);
        const urls = uploaded.map((u) => u.url);
        setProgressLabel('Publishing to LUGA REELS...');
        const postId = await createCommunityPost({
          authorId: profile.uid,
          authorName: profile.fullName,
          authorUsername: profile.username,
          authorAvatarUrl: profile.avatarUrl,
          authorRole: ROLE_LABELS[profile.role],
          caption: cleanCaption ? cleanCaption.slice(0, 200) : undefined,
          content: postContent,
          category,
          mediaType: 'image',
          imageUrls: urls,
        });
        setProgress(100);
        onPublished({
          id: postId,
          authorId: profile.uid,
          authorName: profile.fullName,
          authorUsername: profile.username,
          authorAvatarUrl: profile.avatarUrl,
          authorRole: ROLE_LABELS[profile.role],
          caption: cleanCaption ? cleanCaption.slice(0, 200) : undefined,
          content: postContent,
          category,
          mediaType: 'image',
          imageUrl: urls[0],
          imageUrls: urls,
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          createdAt: new Date(),
        });
      } else if (mode === 'video' && videoFile) {
        setProgressLabel('Uploading video...');
        setProgress(5);
        const meta = await uploadVideoToCloudinary(videoFile, 'feed', (pct) => {
          setProgress(pct);
          setProgressLabel(`Uploading video... ${pct}%`);
        });
        setProgressLabel('Publishing to LUGA REELS...');
        const postId = await createCommunityPost({
          authorId: profile.uid,
          authorName: profile.fullName,
          authorUsername: profile.username,
          authorAvatarUrl: profile.avatarUrl,
          authorRole: ROLE_LABELS[profile.role],
          caption: cleanCaption ? cleanCaption.slice(0, 200) : undefined,
          content: postContent,
          category,
          mediaType: 'video',
          videoUrl: meta.videoUrl,
          videoPublicId: meta.videoPublicId,
          videoFormat: meta.videoFormat,
          videoDuration: meta.videoDuration,
          videoThumbnailUrl: meta.videoThumbnailUrl,
          videoWidth: meta.videoWidth,
          videoHeight: meta.videoHeight,
        });
        onPublished({
          id: postId,
          authorId: profile.uid,
          authorName: profile.fullName,
          authorUsername: profile.username,
          authorAvatarUrl: profile.avatarUrl,
          authorRole: ROLE_LABELS[profile.role],
          caption: cleanCaption ? cleanCaption.slice(0, 200) : undefined,
          content: postContent,
          category,
          mediaType: 'video',
          videoUrl: meta.videoUrl,
          videoPublicId: meta.videoPublicId,
          videoFormat: meta.videoFormat,
          videoDuration: meta.videoDuration,
          videoThumbnailUrl: meta.videoThumbnailUrl,
          videoWidth: meta.videoWidth,
          videoHeight: meta.videoHeight,
          likesCount: 0,
          commentsCount: 0,
          sharesCount: 0,
          createdAt: new Date(),
        });
      }

      resetAll();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to publish media right now.');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={handleClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create LUGA REELS post"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Share to LUGA REELS
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Photos and videos publish directly into the Reels feed
            </p>
          </div>
          <button
            type="button"
            disabled={publishing}
            onClick={handleClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handlePublish(e)} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Media Stage / Picker */}
          {!hasMedia ? (
            <div className="rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 p-6 text-center space-y-4">
              <div className="mx-auto h-12 w-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
                <Upload className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  Choose photos or a video
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Up to 6 photos (JPG, PNG, WebP) or 1 video (MP4, WebM, MOV)
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <label className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
                  <ImagePlus className="h-4 w-4" />
                  <span>Select Photos</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    disabled={publishing}
                    onChange={handleSelectImages}
                    className="sr-only"
                  />
                </label>
                <label className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold inline-flex items-center gap-2 cursor-pointer">
                  <Film className="h-4 w-4" />
                  <span>Select Video</span>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                    disabled={publishing}
                    onChange={handleSelectVideo}
                    className="sr-only"
                  />
                </label>
              </div>
            </div>
          ) : mode === 'image' && imagePreviews.length > 0 ? (
            <div className="space-y-2.5">
              <div className="relative h-64 sm:h-72 rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center">
                <img
                  src={imagePreviews[previewIdx]?.url}
                  alt={`Preview ${previewIdx + 1}`}
                  className="h-full w-full object-contain"
                />
                {imagePreviews.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewIdx((i) => (i - 1 + imagePreviews.length) % imagePreviews.length)
                      }
                      aria-label="Previous photo"
                      className="absolute left-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewIdx((i) => (i + 1) % imagePreviews.length)}
                      aria-label="Next photo"
                      className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-black/55 text-white flex items-center justify-center"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <span className="absolute top-2.5 left-3 text-[11px] font-mono text-white bg-black/55 px-2 py-0.5 rounded-md">
                      {previewIdx + 1}/{imagePreviews.length}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {imagePreviews.map((item, idx) => (
                  <div
                    key={item.url}
                    className={`relative h-14 w-14 rounded-lg overflow-hidden shrink-0 border-2 ${
                      idx === previewIdx ? 'border-emerald-600' : 'border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreviewIdx(idx)}
                      className="h-full w-full block"
                    >
                      <img src={item.url} alt="" className="h-full w-full object-cover" />
                    </button>
                    {!publishing && (
                      <button
                        type="button"
                        onClick={() => removeImageAt(idx)}
                        aria-label="Remove photo"
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/75 text-white flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}

                {imagePreviews.length < 6 && !publishing && (
                  <label
                    title="Add more photos"
                    className="h-14 w-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center text-slate-500 hover:text-emerald-700 cursor-pointer shrink-0"
                  >
                    <Plus className="h-5 w-5" />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      multiple
                      onChange={handleSelectImages}
                      className="sr-only"
                    />
                  </label>
                )}
              </div>
            </div>
          ) : (
            videoPreviewUrl && (
              <div className="space-y-2">
                <div className="relative h-64 sm:h-72 rounded-2xl bg-slate-950 overflow-hidden flex items-center justify-center">
                  <video
                    src={videoPreviewUrl}
                    controls
                    playsInline
                    className="h-full w-full object-contain"
                  />
                  {!publishing && (
                    <button
                      type="button"
                      onClick={() => setVideoFile(null)}
                      aria-label="Remove video"
                      className="absolute top-2.5 right-2.5 h-9 w-9 rounded-full bg-black/65 text-white flex items-center justify-center hover:bg-black/85"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )
          )}

          {/* Caption & Category */}
          <div className="space-y-3">
            <textarea
              rows={3}
              maxLength={2000}
              disabled={publishing}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption and #hashtags..."
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
            />

            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="luga-post-category"
                className="text-xs font-semibold text-slate-600 dark:text-slate-300"
              >
                Topic
              </label>
              <select
                id="luga-post-category"
                disabled={publishing}
                value={category}
                onChange={(e) => setCategory(e.target.value as PostCategory)}
                className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-900 dark:text-slate-100"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {publishing && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono text-emerald-700 dark:text-emerald-400">
                <span className="flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>{progressLabel || 'Uploading...'}</span>
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-emerald-700 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={publishing}
              onClick={handleClose}
              className="min-h-[42px] px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!hasMedia || publishing}
              className="min-h-[42px] px-5 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5"
            >
              {publishing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Publishing...</span>
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  <span>Publish</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
