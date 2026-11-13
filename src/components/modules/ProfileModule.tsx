import React, { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import {
  Award,
  Camera,
  CheckCircle2,
  FileText,
  Loader2,
  Lock,
  Monitor,
  Moon,
  Save,
  Sun,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ThemePreference, useTheme } from '../../context/ThemeContext';
import { fetchUserPosts } from '../../lib/communityService';
import { db } from '../../lib/firebase';
import { uploadCommunityImage } from '../../lib/mediaService';
import { resolvePrivacy } from '../../lib/userService';
import {
  AchievementItem,
  computeProfileCompletion,
  FeedPost,
  FIELD_LIMITS,
  formatFirestoreDate,
  PrivacySettings,
  ROLE_LABELS,
  ROLE_PERMISSIONS,
} from '../../types/luga';
import { CustomVideoPlayer } from '../common/CustomVideoPlayer';
import { UserAvatar } from '../common/UserAvatar';

export function ProfileModule() {
  const { profile, updateProfile, updateMedia, updatePrivacy } = useAuth();
  const { preference, setThemePreference } = useTheme();

  const [activeTab, setActiveTab] = useState<'details' | 'privacy' | 'posts' | 'achievements'>(
    'details'
  );

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [classOrDept, setClassOrDept] = useState('');
  const [studentRegNo, setStudentRegNo] = useState('');
  const [house, setHouse] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  const [privacy, setPrivacy] = useState<PrivacySettings>(() => resolvePrivacy(profile));
  const [myPosts, setMyPosts] = useState<FeedPost[]>([]);
  const [achievements, setAchievements] = useState<AchievementItem[]>([]);

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPrivacy, setSavingPrivacy] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFullName(profile.fullName);
      setUsername(profile.username);
      setClassOrDept(profile.classOrDept);
      setStudentRegNo(profile.studentRegNo || '');
      setHouse(profile.house || '');
      setPhone(profile.phone || '');
      setBio(profile.bio || '');
      setPrivacy(resolvePrivacy(profile));
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    void fetchUserPosts(profile.uid, 30).then(setMyPosts).catch(() => {});

    const unsub = onSnapshot(
      query(collection(db, 'achievements'), orderBy('createdAt', 'desc'), limit(40)),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<AchievementItem, 'id'>) }))
          .filter((a) =>
            a.recipientName.toLowerCase().includes(profile.fullName.toLowerCase())
          );
        setAchievements(list);
      },
      () => {}
    );
    return () => unsub();
  }, [profile?.uid, profile?.fullName]);

  if (!profile) return null;

  const completion = computeProfileCompletion(profile);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setSavedNotice(null);
    setUploadingAvatar(true);
    try {
      const url = await uploadCommunityImage(file);
      await updateMedia({ avatarUrl: url });
      setSavedNotice('Profile photo updated via ImgBB.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload profile photo.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setSavedNotice(null);
    setUploadingCover(true);
    try {
      const url = await uploadCommunityImage(file);
      await updateMedia({ coverUrl: url });
      setSavedNotice('Cover banner updated via ImgBB.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to upload cover banner.');
    } finally {
      setUploadingCover(false);
    }
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    setSaving(true);
    try {
      await updateProfile({
        fullName,
        username,
        classOrDept,
        studentRegNo,
        house,
        phone,
        bio,
      });
      setSavedNotice('Profile updated in Firestore.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePrivacy = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedNotice(null);
    setSavingPrivacy(true);
    try {
      await updatePrivacy(privacy);
      setSavedNotice('Privacy settings updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save privacy settings.');
    } finally {
      setSavingPrivacy(false);
    }
  };

  const themeOptions: { id: ThemePreference; label: string; icon: typeof Sun }[] = [
    { id: 'light', label: 'Light Mode', icon: Sun },
    { id: 'dark', label: 'Dark Mode', icon: Moon },
    { id: 'system', label: 'Device Default', icon: Monitor },
  ];

  return (
    <div className="space-y-6">
      {/* Cover Photo + Avatar Card */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="relative h-36 sm:h-44 bg-emerald-900 dark:bg-emerald-950">
          {profile.coverUrl && (
            <img
              src={profile.coverUrl}
              alt="Profile cover"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          )}
          <label className="absolute bottom-3 right-3 min-h-[36px] px-3 py-1.5 rounded-lg bg-black/65 hover:bg-black/80 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer">
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={uploadingCover}
              onChange={(e) => void handleCoverUpload(e)}
              className="sr-only"
            />
            {uploadingCover ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
            <span>{uploadingCover ? 'Uploading...' : 'Change Cover'}</span>
          </label>
        </div>

        <div className="px-5 sm:px-6 pb-6 space-y-5">
          <div className="-mt-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="relative shrink-0">
                <UserAvatar
                  name={profile.fullName}
                  avatarUrl={profile.avatarUrl}
                  size="xl"
                  online={privacy.showOnlineStatus}
                  className="ring-4 ring-white dark:ring-slate-900 rounded-full"
                />
                <label
                  title="Upload profile photo (ImgBB)"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-emerald-800 hover:bg-emerald-900 text-white flex items-center justify-center cursor-pointer shadow"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingAvatar}
                    onChange={(e) => void handleAvatarUpload(e)}
                    className="sr-only"
                  />
                  {uploadingAvatar ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Camera className="h-3.5 w-3.5" />
                  )}
                </label>
              </div>
              <div className="min-w-0 pt-2">
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white truncate">
                  {profile.fullName}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono">@{profile.username}</span> · {ROLE_LABELS[profile.role]} ·{' '}
                  {profile.classOrDept}
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <p className="text-xs text-slate-500 dark:text-slate-400">Profile Completion</p>
              <p className="font-mono text-lg font-bold text-emerald-800 dark:text-emerald-400">
                {completion.percentage}%
              </p>
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-emerald-700 dark:bg-emerald-500 transition-all"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>

          {/* Theme Toggle */}
          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Appearance &amp; Theme
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Saved across sessions on this device.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const active = preference === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setThemePreference(opt.id)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {savedNotice && (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>{savedNotice}</span>
        </p>
      )}

      {/* Profile Section Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'details' as const, label: 'Personal Details' },
          { id: 'privacy' as const, label: 'Privacy Controls' },
          { id: 'posts' as const, label: `My Posts (${myPosts.length})` },
          { id: 'achievements' as const, label: `Honors (${achievements.length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
              activeTab === tab.id
                ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'details' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-4">
            Personal Details
          </h3>
          <form onSubmit={handleSaveDetails} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-name" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Full Name
                </label>
                <input
                  id="prof-name"
                  type="text"
                  required
                  minLength={FIELD_LIMITS.fullNameMin}
                  maxLength={FIELD_LIMITS.fullNameMax}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label htmlFor="prof-username" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Username
                </label>
                <input
                  id="prof-username"
                  type="text"
                  required
                  minLength={FIELD_LIMITS.usernameMin}
                  maxLength={FIELD_LIMITS.usernameMax}
                  pattern="^[a-zA-Z0-9_]+$"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-class" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Class or Department
                </label>
                <input
                  id="prof-class"
                  type="text"
                  required
                  minLength={FIELD_LIMITS.classOrDeptMin}
                  maxLength={FIELD_LIMITS.classOrDeptMax}
                  value={classOrDept}
                  onChange={(e) => setClassOrDept(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label htmlFor="prof-reg" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Student Reg. Number
                </label>
                <input
                  id="prof-reg"
                  type="text"
                  maxLength={FIELD_LIMITS.studentRegNoMax}
                  value={studentRegNo}
                  onChange={(e) => setStudentRegNo(e.target.value)}
                  placeholder="Optional for staff & alumni"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="prof-house" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  House / Dormitory
                </label>
                <input
                  id="prof-house"
                  type="text"
                  maxLength={FIELD_LIMITS.houseMax}
                  value={house}
                  onChange={(e) => setHouse(e.target.value)}
                  placeholder="e.g. Kilimanjaro House"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>

              <div>
                <label htmlFor="prof-phone" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Contact Phone (Private)
                </label>
                <input
                  id="prof-phone"
                  type="tel"
                  maxLength={FIELD_LIMITS.phoneMax}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Optional"
                  className="w-full min-h-[44px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
                />
              </div>
            </div>

            <div>
              <label htmlFor="prof-bio" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Short Biography
              </label>
              <textarea
                id="prof-bio"
                rows={3}
                maxLength={FIELD_LIMITS.bioMax}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Share your subjects, clubs, house, or alumni year..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Administrative roles can only be modified by school administrators.
              </span>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[42px] px-5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 dark:hover:bg-emerald-600 disabled:opacity-60 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Save className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'privacy' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Privacy &amp; Messaging Controls
            </h3>
          </div>

          <form onSubmit={handleSavePrivacy} className="space-y-4 text-sm">
            <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-xs">
                  Show Online Status
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Allow school members to see when you are actively online.
                </p>
              </div>
              <input
                type="checkbox"
                checked={privacy.showOnlineStatus}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, showOnlineStatus: e.target.checked }))
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-xs">
                  Show Last Seen Timestamp
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Display your last active time in direct chats and member profile modals.
                </p>
              </div>
              <input
                type="checkbox"
                checked={privacy.showLastSeen}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, showLastSeen: e.target.checked }))
                }
              />
            </label>

            <label className="flex items-center justify-between gap-4 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
              <div>
                <p className="font-semibold text-slate-900 dark:text-white text-xs">
                  Send Read Receipts
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Let senders see green checkmarks when you read their private messages.
                </p>
              </div>
              <input
                type="checkbox"
                checked={privacy.sendReadReceipts}
                onChange={(e) =>
                  setPrivacy((p) => ({ ...p, sendReadReceipts: e.target.checked }))
                }
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Who Can Start Private Chats With Me
                </label>
                <select
                  value={privacy.allowMessagesFrom}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      allowMessagesFrom: e.target.value as PrivacySettings['allowMessagesFrom'],
                    }))
                  }
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  <option value="everyone">All approved LUGA HUB members</option>
                  <option value="staff_and_classmates">Teachers &amp; my classmates only</option>
                  <option value="nobody">Restrict new incoming DMs</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Profile Bio &amp; Posts Visibility
                </label>
                <select
                  value={privacy.profileVisibility}
                  onChange={(e) =>
                    setPrivacy((p) => ({
                      ...p,
                      profileVisibility: e.target.value as PrivacySettings['profileVisibility'],
                    }))
                  }
                  className="w-full h-11 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                >
                  <option value="community">All LUGA HUB community members</option>
                  <option value="class_only">Classmates &amp; school staff only</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingPrivacy}
                className="min-h-[42px] px-5 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-2"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{savingPrivacy ? 'Saving...' : 'Save Privacy Settings'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'posts' && (
        <section className="space-y-3">
          {myPosts.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
              <FileText className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                You haven&apos;t published any posts or reels yet.
              </p>
            </div>
          ) : (
            myPosts.map((p) => {
              const imgs =
                p.imageUrls && p.imageUrls.length > 0
                  ? p.imageUrls
                  : p.imageUrl
                  ? [p.imageUrl]
                  : [];
              return (
                <article
                  key={p.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2.5"
                >
                  <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span className="capitalize font-semibold text-emerald-700 dark:text-emerald-400">
                      {p.category} · {p.mediaType || 'text'}
                    </span>
                    <span className="font-mono">{formatFirestoreDate(p.createdAt)}</span>
                  </div>
                  {p.caption && (
                    <h4 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {p.caption}
                    </h4>
                  )}
                  <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                    {p.content}
                  </p>
                  {imgs.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5">
                      {imgs.map((u, i) => (
                        <img
                          key={u + i}
                          src={u}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="aspect-square rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}
                  {p.videoUrl && (
                    <CustomVideoPlayer
                      src={p.videoUrl}
                      poster={p.videoThumbnailUrl}
                      variant="card"
                    />
                  )}
                  <p className="text-xs text-slate-500 font-mono">
                    {p.likesCount} likes · {p.commentsCount} comments · {p.sharesCount || 0} shares
                  </p>
                </article>
              );
            })
          )}
        </section>
      )}

      {activeTab === 'achievements' && (
        <section className="space-y-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Recognized Achievements
              </h3>
            </div>
            {achievements.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                No school awards matched to {profile.fullName} yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {achievements.map((a) => (
                  <div
                    key={a.id}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950"
                  >
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">{a.title}</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 capitalize">
                      {a.category} {a.awardedDate ? `· ${a.awardedDate}` : ''}
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                      {a.description}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-3">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Account &amp; Role Verification
            </h3>
            <dl className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Verified Email</dt>
                <dd className="font-mono text-slate-900 dark:text-white">{profile.email}</dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Assigned Role</dt>
                <dd className="font-semibold text-slate-900 dark:text-white">
                  {ROLE_LABELS[profile.role]}
                </dd>
              </div>
              <div className="py-2.5 flex justify-between gap-4">
                <dt className="text-slate-500 dark:text-slate-400">Registration Code</dt>
                <dd className="font-mono text-slate-900 dark:text-white">{profile.schoolRegCode}</dd>
              </div>
            </dl>
            <div className="pt-2">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                Permitted Capabilities
              </p>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {ROLE_PERMISSIONS[profile.role].map((item) => (
                  <li key={item}>· {item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
