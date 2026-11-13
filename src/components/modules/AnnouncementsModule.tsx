import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Bookmark, Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toggleBookmark } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  AnnouncementCategory,
  AnnouncementItem,
  BRAND,
  formatFirestoreDate,
  isAdminRole,
  isStaffRole,
} from '../../types/luga';

interface AnnouncementsModuleProps {
  searchQuery: string;
}

const CATEGORIES: { id: 'all' | AnnouncementCategory; label: string }[] = [
  { id: 'all', label: 'All Notices' },
  { id: 'important', label: 'Important' },
  { id: 'examination', label: 'Examinations' },
  { id: 'academic', label: 'Academic' },
  { id: 'events', label: 'Events' },
  { id: 'general', label: 'General' },
];

export function AnnouncementsModule({ searchQuery }: AnnouncementsModuleProps) {
  const { profile } = useAuth();
  const [items, setItems] = useState<AnnouncementItem[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | AnnouncementCategory>('all');
  const [showComposer, setShowComposer] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('general');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  const canPublish = isStaffRole(profile?.role);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(40)),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AnnouncementItem, 'id'>),
        }));
        list.sort((a, b) => Number(b.pinned) - Number(a.pinned));
        setItems(list);
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'announcements');
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', profile.uid, 'bookmarks')),
      (snap) => {
        const map: Record<string, boolean> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { itemId: string; itemType: string };
          if (data.itemType === 'announcement') map[data.itemId] = true;
        });
        setBookmarkedIds(map);
      },
      () => {}
    );
    return () => unsub();
  }, [profile]);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canPublish) return;
    setSaving(true);
    const id = `ann_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'announcements', id), {
        title: title.trim().slice(0, 160),
        body: body.trim().slice(0, 3000),
        category,
        pinned,
        authorId: profile.uid,
        authorName: profile.fullName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setTitle('');
      setBody('');
      setPinned(false);
      setShowComposer(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `announcements/${id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (item: AnnouncementItem) => {
    try {
      await updateDoc(doc(db, 'announcements', item.id), {
        pinned: !item.pinned,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `announcements/${item.id}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'announcements', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `announcements/${id}`);
    }
  };

  const filtered = items.filter((item) => {
    const matchesCat = filter === 'all' || item.category === filter;
    const term = searchQuery.trim().toLowerCase();
    const matchesTerm =
      !term ||
      item.title.toLowerCase().includes(term) ||
      item.body.toLowerCase().includes(term) ||
      item.authorName.toLowerCase().includes(term);
    return matchesCat && matchesTerm;
  });

  return (
    <div className="space-y-6">
      {/* Official Banner Header with School Logo */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0">
            <img
              src={BRAND.officialLogoUrl}
              alt="Mwanalugali Secondary School Official Logo"
              referrerPolicy="no-referrer"
              className="h-full w-full object-contain"
            />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              Official School Announcements
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {BRAND.schoolName} · Verified notices from administration and faculty
            </p>
          </div>
        </div>

        {canPublish && (
          <button
            type="button"
            onClick={() => setShowComposer((p) => !p)}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 dark:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{showComposer ? 'Close Composer' : 'Publish Notice'}</span>
          </button>
        )}
      </section>

      {showComposer && canPublish && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <form onSubmit={handlePublish} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                minLength={3}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Announcement headline"
                className="sm:col-span-2 min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              />
              <select
                aria-label="Announcement category"
                value={category}
                onChange={(e) => setCategory(e.target.value as AnnouncementCategory)}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
              >
                <option value="general">General</option>
                <option value="important">Important</option>
                <option value="examination">Examination</option>
                <option value="academic">Academic</option>
                <option value="events">Events</option>
              </select>
            </div>
            <textarea
              rows={4}
              required
              minLength={3}
              maxLength={3000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the official notice details..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Pin to top of announcements</span>
              </label>
              <button
                type="submit"
                disabled={saving}
                className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold"
              >
                {saving ? 'Publishing...' : 'Publish Announcement'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {CATEGORIES.map((cat) => {
          const active = filter === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => setFilter(cat.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Loading announcements...</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <Megaphone className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No announcements in this category
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Official notices from the Headmaster, administrators, and teachers will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const canEdit = isAdminRole(profile?.role) || profile?.uid === item.authorId;
            const isSaved = Boolean(bookmarkedIds[item.id]);
            return (
              <article
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {item.pinned ? 'Pinned · ' : ''}
                      {item.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{item.category}</span> · {item.authorName} ·{' '}
                      <span className="font-mono">{formatFirestoreDate(item.createdAt)}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {profile && (
                      <button
                        type="button"
                        aria-label="Bookmark announcement"
                        onClick={() =>
                          void toggleBookmark(
                            profile.uid,
                            {
                              itemId: item.id,
                              itemType: 'announcement',
                              title: item.title,
                              summary: item.body.slice(0, 140),
                              authorName: item.authorName,
                            },
                            isSaved
                          )
                        }
                        className={`min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center ${
                          isSaved
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Bookmark className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          aria-label={item.pinned ? 'Unpin' : 'Pin'}
                          onClick={() => void handleTogglePin(item)}
                          className={`min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center ${
                            item.pinned
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Pin className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Delete announcement"
                          onClick={() => void handleDelete(item.id)}
                          className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {item.body}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
