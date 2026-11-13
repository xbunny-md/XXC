import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { CornerDownRight, Heart, Pencil, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  addPostComment,
  deletePostComment,
  editPostComment,
  fetchPostComments,
  toggleCommentLike,
} from '../../lib/communityService';
import { db } from '../../lib/firebase';
import { FeedPost, formatFirestoreDate, isAdminRole, PostComment } from '../../types/luga';
import { UserAvatar } from './UserAvatar';

interface CommentsSheetProps {
  post: FeedPost | null;
  onClose: () => void;
  onCommentsCountChange: (postId: string, newCount: number) => void;
  onOpenUserProfile?: (uid: string) => void;
}

export function CommentsSheet({
  post,
  onClose,
  onCommentsCountChange,
  onOpenUserProfile,
}: CommentsSheetProps) {
  const { profile } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [likedIds, setLikedIds] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyTarget, setReplyTarget] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    if (!post || !profile) {
      setComments([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPostComments(post.id)
      .then(async (list) => {
        if (cancelled) return;
        setComments(list);
        onCommentsCountChange(post.id, Math.max(list.length, post.commentsCount || 0));

        const likeMap: Record<string, boolean> = {};
        await Promise.all(
          list.slice(0, 35).map(async (c) => {
            try {
              const snap = await getDoc(doc(db, 'posts', post.id, 'comments', c.id, 'likes', profile.uid));
              if (snap.exists()) likeMap[c.id] = true;
            } catch {
              // ignore
            }
          })
        );
        if (!cancelled) setLikedIds(likeMap);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [post?.id, profile?.uid]);

  if (!post || !profile) return null;

  const isMod = isAdminRole(profile.role);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    try {
      const created = await addPostComment(
        post,
        {
          uid: profile.uid,
          fullName: profile.fullName,
          username: profile.username,
          avatarUrl: profile.avatarUrl,
        },
        draft,
        replyTarget
          ? { parentCommentId: replyTarget.id, replyToName: replyTarget.name }
          : undefined
      );
      const next = [...comments, created];
      setComments(next);
      setDraft('');
      setReplyTarget(null);
      onCommentsCountChange(post.id, (post.commentsCount || 0) + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveEdit = async (comment: PostComment) => {
    if (!editDraft.trim()) return;
    await editPostComment(post.id, comment.id, editDraft);
    setComments((prev) =>
      prev.map((c) => (c.id === comment.id ? { ...c, content: editDraft.trim(), edited: true } : c))
    );
    setEditingId(null);
    setEditDraft('');
  };

  const handleDelete = async (comment: PostComment) => {
    await deletePostComment(post, comment.id);
    setComments((prev) => prev.filter((c) => c.id !== comment.id));
    onCommentsCountChange(post.id, Math.max(0, (post.commentsCount || 1) - 1));
  };

  const handleToggleLike = async (comment: PostComment) => {
    const nowLiked = await toggleCommentLike(post.id, comment, profile.uid);
    setLikedIds((prev) => ({ ...prev, [comment.id]: nowLiked }));
    setComments((prev) =>
      prev.map((c) =>
        c.id === comment.id
          ? {
              ...c,
              likesCount: Math.max(0, (c.likesCount || 0) + (nowLiked ? 1 : -1)),
            }
          : c
      )
    );
  };

  // Group top-level comments and nested replies
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = comments.reduce<Record<string, PostComment[]>>((acc, c) => {
    if (c.parentCommentId) {
      acc[c.parentCommentId] = acc[c.parentCommentId] || [];
      acc[c.parentCommentId].push(c);
    }
    return acc;
  }, {});

  const renderComment = (c: PostComment, isReply = false) => {
    const canEdit = c.authorId === profile.uid;
    const canDelete = c.authorId === profile.uid || isMod;
    const isLiked = Boolean(likedIds[c.id]);

    return (
      <div
        key={c.id}
        className={`flex items-start gap-2.5 ${isReply ? 'ml-9 pl-3 border-l border-slate-200 dark:border-slate-800' : ''}`}
      >
        <button
          type="button"
          onClick={() => onOpenUserProfile?.(c.authorId)}
          className="shrink-0"
        >
          <UserAvatar name={c.authorName} avatarUrl={c.authorAvatarUrl} size="xs" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/80 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenUserProfile?.(c.authorId)}
                  className="text-xs font-semibold text-slate-900 dark:text-white hover:underline truncate"
                >
                  {c.authorName}
                </button>
                {c.authorUsername && (
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    @{c.authorUsername}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-400 shrink-0">
                {formatFirestoreDate(c.createdAt)}
              </span>
            </div>

            {c.replyToName && (
              <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                <CornerDownRight className="h-3 w-3" />
                <span>Replying to {c.replyToName}</span>
              </p>
            )}

            {editingId === c.id ? (
              <div className="mt-1.5 space-y-2">
                <input
                  type="text"
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  maxLength={800}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleSaveEdit(c)}
                    className="px-2.5 py-1 rounded bg-emerald-800 text-white text-[11px] font-semibold"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-700 dark:text-slate-200 mt-1 whitespace-pre-wrap break-words">
                {c.content}
                {c.edited && <span className="ml-1.5 text-[10px] text-slate-400">(edited)</span>}
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => void handleToggleLike(c)}
              className={`flex items-center gap-1 hover:text-emerald-700 dark:hover:text-emerald-400 ${
                isLiked ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''
              }`}
            >
              <Heart className={`h-3 w-3 ${isLiked ? 'fill-current' : ''}`} />
              <span>{c.likesCount || 0}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyTarget({ id: c.parentCommentId || c.id, name: c.authorName });
              }}
              className="hover:text-slate-900 dark:hover:text-white"
            >
              Reply
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(c.id);
                  setEditDraft(c.content);
                }}
                className="hover:text-slate-900 dark:hover:text-white flex items-center gap-0.5"
              >
                <Pencil className="h-2.5 w-2.5" />
                <span>Edit</span>
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => void handleDelete(c)}
                className="hover:text-red-600 dark:hover:text-red-400 flex items-center gap-0.5"
              >
                <Trash2 className="h-2.5 w-2.5" />
                <span>Delete</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Post comments"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[85vh] flex flex-col rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        {/* Header */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div>
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Comments ({comments.length})
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[260px]">
              {post.caption || post.content}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="min-h-[40px] min-w-[40px] rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Comments List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <p className="text-xs text-slate-500 text-center py-8">Loading comments...</p>
          ) : comments.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-8">
              No comments yet. Be the first to reply to {post.authorName}!
            </p>
          ) : (
            topLevel.map((cmt) => (
              <div key={cmt.id} className="space-y-2.5">
                {renderComment(cmt)}
                {(repliesByParent[cmt.id] || []).map((reply) => renderComment(reply, true))}
              </div>
            ))
          )}
        </div>

        {/* Input Form */}
        <form
          onSubmit={handleSubmit}
          className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 space-y-2 shrink-0"
        >
          {replyTarget && (
            <div className="flex items-center justify-between text-xs px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300">
              <span>Replying to {replyTarget.name}</span>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="font-semibold hover:underline"
              >
                Cancel
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <UserAvatar name={profile.fullName} avatarUrl={profile.avatarUrl} size="xs" />
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={800}
              placeholder={replyTarget ? `Reply to ${replyTarget.name}...` : 'Write a comment...'}
              className="flex-1 min-h-[42px] px-3.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-700"
            />
            <button
              type="submit"
              disabled={submitting || !draft.trim()}
              aria-label="Send comment"
              className="min-h-[42px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Post</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
