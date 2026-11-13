import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { Flag, Lock, MessageSquare, Shield, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchUserPosts } from '../../lib/communityService';
import { db } from '../../lib/firebase';
import { canMessageMember, canViewFullProfile } from '../../lib/userService';
import {
  FeedPost,
  formatFirestoreDate,
  ROLE_LABELS,
  UserDirectoryEntry,
} from '../../types/luga';
import { UserAvatar } from './UserAvatar';

interface UserProfileModalProps {
  uid: string | null;
  onClose: () => void;
  onMessageUser: (uid: string) => void;
  onReportUser: (target: { targetId: string; targetSummary: string }) => void;
}

export function UserProfileModal({
  uid,
  onClose,
  onMessageUser,
  onReportUser,
}: UserProfileModalProps) {
  const { profile } = useAuth();
  const [member, setMember] = useState<UserDirectoryEntry | null>(null);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!uid) {
      setMember(null);
      setPosts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void Promise.all([getDoc(doc(db, 'userDirectory', uid)), fetchUserPosts(uid, 12)])
      .then(([snap, userPosts]) => {
        if (cancelled) return;
        if (snap.exists()) {
          setMember(snap.data() as UserDirectoryEntry);
        } else {
          setMember(null);
        }
        setPosts(userPosts);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (!uid || !profile) return null;

  const canView = member ? canViewFullProfile(profile, member) : false;
  const msgCheck = member ? canMessageMember(profile, member) : { allowed: false };
  const isSelf = profile.uid === uid;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/55 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Member profile"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        {loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading member profile...</div>
        ) : !member ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm text-slate-500">Member profile could not be loaded.</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Cover Banner */}
            <div className="relative h-28 bg-emerald-900 dark:bg-emerald-950 overflow-hidden">
              {member.coverUrl && canView && (
                <img
                  src={member.coverUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close member profile"
                className="absolute top-3 right-3 h-9 w-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pb-5">
              <div className="-mt-10 flex items-end justify-between gap-3">
                <UserAvatar
                  name={member.fullName}
                  avatarUrl={member.avatarUrl}
                  size="xl"
                  online={member.showOnlineStatus !== false && member.isOnline === true}
                  className="ring-4 ring-white dark:ring-slate-900 rounded-full"
                />
                {!isSelf && (
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      disabled={!msgCheck.allowed}
                      title={msgCheck.reason}
                      onClick={() => {
                        onClose();
                        onMessageUser(member.uid);
                      }}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Message</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onReportUser({
                          targetId: member.uid,
                          targetSummary: `User: ${member.fullName} (@${member.username})`,
                        });
                      }}
                      aria-label="Report member"
                      className="min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-red-600 flex items-center justify-center"
                    >
                      <Flag className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {member.fullName}
                  </h2>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    @{member.username}
                  </span>
                </div>
                <p className="text-xs text-emerald-800 dark:text-emerald-400 font-medium mt-0.5 flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" />
                  <span>
                    {ROLE_LABELS[member.role]} · {member.classOrDept}
                  </span>
                </p>

                {member.showOnlineStatus !== false && member.isOnline ? (
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">
                    Active now
                  </p>
                ) : member.showLastSeen !== false && member.lastActiveAt ? (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Last seen {formatFirestoreDate(member.lastActiveAt)}
                  </p>
                ) : null}

                {!msgCheck.allowed && !isSelf && msgCheck.reason && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                    {msgCheck.reason}
                  </p>
                )}
              </div>

              {!canView ? (
                <div className="mt-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
                  <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                  <span>
                    This member restricts detailed bio & activity to {member.classOrDept} classmates and staff.
                  </span>
                </div>
              ) : (
                <>
                  {member.bio && (
                    <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {member.bio}
                    </p>
                  )}

                  <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      Recent Posts ({posts.length})
                    </h3>
                    {posts.length === 0 ? (
                      <p className="text-xs text-slate-500">No community posts yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {posts.slice(0, 5).map((p) => (
                          <div
                            key={p.id}
                            className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1"
                          >
                            {p.caption && (
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {p.caption}
                              </p>
                            )}
                            <p className="text-slate-600 dark:text-slate-300 line-clamp-2">
                              {p.content}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {formatFirestoreDate(p.createdAt)} · {p.likesCount} likes · {p.commentsCount} comments
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
