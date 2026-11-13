import { useEffect, useState } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import {
  BookOpen,
  Calendar,
  FileText,
  Megaphone,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { ModuleId } from '../../types/luga';

interface GlobalSearchModalProps {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onNavigate: (moduleId: ModuleId) => void;
}

interface SearchResultRow {
  id: string;
  kind: 'member' | 'group' | 'post' | 'announcement' | 'resource' | 'event';
  title: string;
  subtitle: string;
  targetModule: ModuleId;
}

export function GlobalSearchModal({
  open,
  initialQuery,
  onClose,
  onNavigate,
}: GlobalSearchModalProps) {
  const [term, setTerm] = useState(initialQuery);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SearchResultRow[]>([]);

  useEffect(() => {
    setTerm(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadIndex = async () => {
      setLoading(true);
      try {
        const [membersSnap, groupsSnap, postsSnap, annSnap, resSnap, evtSnap] =
          await Promise.all([
            getDocs(query(collection(db, 'userDirectory'), orderBy('updatedAt', 'desc'), limit(25))),
            getDocs(query(collection(db, 'groups'), orderBy('updatedAt', 'desc'), limit(20))),
            getDocs(query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(20))),
            getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'), limit(20))),
            getDocs(query(collection(db, 'resources'), orderBy('createdAt', 'desc'), limit(20))),
            getDocs(query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(20))),
          ]);

        if (!active) return;
        const combined: SearchResultRow[] = [];

        membersSnap.docs.forEach((d) => {
          const data = d.data() as { fullName: string; username: string; classOrDept: string; role: string };
          combined.push({
            id: `member_${d.id}`,
            kind: 'member',
            title: data.fullName,
            subtitle: `@${data.username} · ${data.classOrDept} · ${data.role}`,
            targetModule: 'groups',
          });
        });
        groupsSnap.docs.forEach((d) => {
          const data = d.data() as { name: string; type: string; description: string };
          combined.push({
            id: `group_${d.id}`,
            kind: 'group',
            title: data.name,
            subtitle: `${data.type} · ${data.description.slice(0, 70)}`,
            targetModule: 'groups',
          });
        });
        postsSnap.docs.forEach((d) => {
          const data = d.data() as { authorName: string; content: string; category: string };
          combined.push({
            id: `post_${d.id}`,
            kind: 'post',
            title: data.content.slice(0, 80),
            subtitle: `Post by ${data.authorName} · ${data.category}`,
            targetModule: 'reels',
          });
        });
        annSnap.docs.forEach((d) => {
          const data = d.data() as { title: string; category: string; authorName: string };
          combined.push({
            id: `ann_${d.id}`,
            kind: 'announcement',
            title: data.title,
            subtitle: `Announcement · ${data.category} · ${data.authorName}`,
            targetModule: 'announcements',
          });
        });
        resSnap.docs.forEach((d) => {
          const data = d.data() as { title: string; subjectId: string; classId: string; type: string };
          combined.push({
            id: `res_${d.id}`,
            kind: 'resource',
            title: data.title,
            subtitle: `${data.type} · ${data.subjectId} · ${data.classId}`,
            targetModule: 'resources',
          });
        });
        evtSnap.docs.forEach((d) => {
          const data = d.data() as { title: string; eventDate: string; category: string };
          combined.push({
            id: `evt_${d.id}`,
            kind: 'event',
            title: data.title,
            subtitle: `Event · ${data.eventDate} · ${data.category}`,
            targetModule: 'schedule',
          });
        });

        setRows(combined);
      } catch {
        // Ignore partial search errors cleanly
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadIndex();
    return () => {
      active = false;
    };
  }, [open]);

  if (!open) return null;

  const q = term.trim().toLowerCase();
  const filtered = rows
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.subtitle.toLowerCase().includes(q))
    .slice(0, 24);

  const iconFor = (kind: SearchResultRow['kind']) => {
    switch (kind) {
      case 'member':
        return <User className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
      case 'group':
        return <Users className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
      case 'post':
        return <FileText className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
      case 'announcement':
        return <Megaphone className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case 'resource':
        return <BookOpen className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
      case 'event':
        return <Calendar className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-start justify-center p-4 sm:pt-16">
      <div
        role="dialog"
        aria-label="Global Search"
        className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
      >
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            type="search"
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search students, teachers, groups, posts, announcements, resources, events..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {loading ? (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              Searching LUGA HUB...
            </p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-sm text-slate-500 dark:text-slate-400">
              No matching records found for &ldquo;{term}&rdquo;.
            </p>
          ) : (
            filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.targetModule);
                  onClose();
                }}
                className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 flex items-start gap-3 transition-colors"
              >
                <div className="mt-0.5 shrink-0">{iconFor(item.kind)}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {item.title}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
