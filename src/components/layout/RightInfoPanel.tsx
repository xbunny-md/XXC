import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { useAuth } from '../../context/AuthContext';
import { db } from '../../lib/firebase';
import {
  AnnouncementItem,
  BRAND,
  computeProfileCompletion,
  GroupItem,
  ModuleId,
  ROLE_LABELS,
  SchoolEventItem,
  UserDirectoryEntry,
} from '../../types/luga';

interface RightInfoPanelProps {
  onSelectModule: (id: ModuleId) => void;
}

export function RightInfoPanel({ onSelectModule }: RightInfoPanelProps) {
  const { profile } = useAuth();
  const [logoError, setLogoError] = useState(false);
  const [pinnedNotices, setPinnedNotices] = useState<AnnouncementItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<SchoolEventItem[]>([]);
  const [recentMembers, setRecentMembers] = useState<UserDirectoryEntry[]>([]);
  const [suggestedGroups, setSuggestedGroups] = useState<GroupItem[]>([]);

  useEffect(() => {
    if (!profile) return;

    const unsubNotices = onSnapshot(
      query(
        collection(db, 'announcements'),
        orderBy('createdAt', 'desc'),
        limit(20)
      ),
      (snap) => {
        setPinnedNotices(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<AnnouncementItem, 'id'>) }))
            .filter((n) => n.pinned)
            .slice(0, 3)
        );
      },
      () => {}
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(3)),
      (snap) => {
        setUpcomingEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SchoolEventItem, 'id'>) })));
      },
      () => {}
    );

    const unsubMembers = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('updatedAt', 'desc'), limit(4)),
      (snap) => {
        setRecentMembers(
          snap.docs
            .map((d) => d.data() as UserDirectoryEntry)
            .filter((m) => m.status === 'approved')
        );
      },
      () => {}
    );

    const unsubGroups = onSnapshot(
      query(collection(db, 'groups'), orderBy('updatedAt', 'desc'), limit(3)),
      (snap) => {
        setSuggestedGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupItem, 'id'>) })));
      },
      () => {}
    );

    return () => {
      unsubNotices();
      unsubEvents();
      unsubMembers();
      unsubGroups();
    };
  }, [profile]);

  if (!profile) return null;

  const completion = computeProfileCompletion(profile);

  return (
    <aside className="hidden xl:block w-80 shrink-0 space-y-5">
      {/* Official School Identity Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white p-0.5 shrink-0">
            <img
              src={logoError ? BRAND.backupLogoUrl : BRAND.officialLogoUrl}
              alt="Mwanalugali Secondary School Official Logo"
              referrerPolicy="no-referrer"
              onError={() => setLogoError(true)}
              className="h-full w-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
              {BRAND.schoolName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {BRAND.communityIdentity} · {BRAND.platformName}
            </p>
          </div>
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          {BRAND.tagline}
        </p>
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400">{ROLE_LABELS[profile.role]}</span>
          <span className="font-mono font-semibold text-emerald-800 dark:text-emerald-400">
            {completion.percentage}% profile
          </span>
        </div>
        {completion.percentage < 100 && (
          <button
            type="button"
            onClick={() => onSelectModule('profile')}
            className="w-full min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Complete Profile ({completion.missing[0]})
          </button>
        )}
      </div>

      {/* Pinned Announcements */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Pinned Notices
          </h2>
          <button
            type="button"
            onClick={() => onSelectModule('announcements')}
            className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
          >
            View all
          </button>
        </div>
        {pinnedNotices.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No pinned announcements at the moment.
          </p>
        ) : (
          <ul className="space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800">
            {pinnedNotices.map((notice) => (
              <li key={notice.id} className="pt-2 first:pt-0">
                <button
                  type="button"
                  onClick={() => onSelectModule('announcements')}
                  className="text-left w-full group"
                >
                  <p className="text-xs font-semibold text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 truncate">
                    {notice.title}
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    {notice.category} · {notice.authorName}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Upcoming Events */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Upcoming Events
          </h2>
          <button
            type="button"
            onClick={() => onSelectModule('schedule')}
            className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
          >
            Calendar
          </button>
        </div>
        {upcomingEvents.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            No upcoming events scheduled yet.
          </p>
        ) : (
          <ul className="space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800">
            {upcomingEvents.map((evt) => (
              <li key={evt.id} className="pt-2 first:pt-0">
                <button
                  type="button"
                  onClick={() => onSelectModule('schedule')}
                  className="text-left w-full"
                >
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {evt.title}
                  </p>
                  <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                    {evt.eventDate} · {evt.category}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Suggested Groups & Recently Active Members */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Suggested Groups
            </h2>
            <button
              type="button"
              onClick={() => onSelectModule('groups')}
              className="text-xs font-semibold text-emerald-800 dark:text-emerald-400 hover:underline"
            >
              Browse
            </button>
          </div>
          {suggestedGroups.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Create the first class or club group.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {suggestedGroups.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => onSelectModule('groups')}
                    className="w-full text-left text-xs py-1 flex items-center justify-between gap-2 hover:text-emerald-700 dark:hover:text-emerald-400"
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {g.name}
                    </span>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                      {g.memberCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            Recently Active
          </h2>
          {recentMembers.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">No recent members yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {recentMembers.map((m) => (
                <li key={m.uid} className="text-xs flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                    {m.fullName}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {m.classOrDept}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
