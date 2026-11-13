import React, { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  Award,
  BarChart3,
  Bookmark,
  CheckCircle2,
  MessageSquare,
  Plus,
  SearchCheck,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { fetchBookmarks, toggleBookmark } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  AchievementItem,
  BookmarkItem,
  isPollCreatorRole,
  isStaffRole,
  LostFoundItem,
  ModuleId,
  PollItem,
} from '../../types/luga';

// ---------------------------------------------------------------------------
// E. Polls & Voting
// ---------------------------------------------------------------------------
export function PollsModule() {
  const { profile } = useAuth();
  const [polls, setPolls] = useState<PollItem[]>([]);
  const [votedOption, setVotedOption] = useState<Record<string, number>>({});
  const [showCreate, setShowCreate] = useState(false);
  const [question, setQuestion] = useState('');
  const [optionsText, setOptionsText] = useState('Yes\nNo');
  const [audience, setAudience] = useState<PollItem['audience']>('all');

  const canCreate = isPollCreatorRole(profile?.role);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'polls'), orderBy('createdAt', 'desc'), limit(25)),
      (snap) => {
        setPolls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PollItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'polls')
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!profile || polls.length === 0) return;
    let active = true;
    void Promise.all(
      polls.map((p) => getDoc(doc(db, 'polls', p.id, 'votes', profile.uid)))
    ).then((snaps) => {
      if (!active) return;
      const map: Record<string, number> = {};
      polls.forEach((p, idx) => {
        if (snaps[idx].exists()) {
          map[p.id] = (snaps[idx].data() as { optionIndex: number }).optionIndex;
        }
      });
      setVotedOption(map);
    });
    return () => {
      active = false;
    };
  }, [polls, profile]);

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canCreate) return;
    const opts = optionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    if (opts.length < 2) return;
    const pollId = `poll_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'polls', pollId), {
        question: question.trim().slice(0, 240),
        options: opts,
        counts: opts.map(() => 0),
        totalVotes: 0,
        audience,
        closed: false,
        createdBy: profile.uid,
        creatorName: profile.fullName,
        createdAt: serverTimestamp(),
      });
      setQuestion('');
      setOptionsText('Yes\nNo');
      setShowCreate(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `polls/${pollId}`);
    }
  };

  const handleVote = async (poll: PollItem, optionIdx: number) => {
    if (!profile || poll.closed || votedOption[poll.id] !== undefined) return;
    const nextCounts = poll.counts.map((c, idx) => (idx === optionIdx ? c + 1 : c));
    const batch = writeBatch(db);
    batch.set(doc(db, 'polls', poll.id, 'votes', profile.uid), {
      userId: profile.uid,
      pollId: poll.id,
      optionIndex: optionIdx,
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'polls', poll.id), {
      counts: nextCounts,
      totalVotes: poll.totalVotes + 1,
    });
    try {
      await batch.commit();
      setVotedOption((prev) => ({ ...prev, [poll.id]: optionIdx }));
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `polls/${poll.id}/votes/${profile.uid}`);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            School Polls &amp; Voting
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Community polls for student council, clubs, and campus decisions. One vote per member.
          </p>
        </div>
        {canCreate && (
          <button
            type="button"
            onClick={() => setShowCreate((p) => !p)}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showCreate ? 'Close' : 'Create Poll'}</span>
          </button>
        )}
      </section>

      {showCreate && canCreate && (
        <form
          onSubmit={handleCreatePoll}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <input
            type="text"
            required
            minLength={4}
            maxLength={240}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Poll question..."
            className="w-full min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
          <textarea
            rows={3}
            required
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="One option per line (2 to 6 options)"
            className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
          <div className="flex items-center justify-between gap-3">
            <select
              aria-label="Poll audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value as PollItem['audience'])}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <option value="all">All Community</option>
              <option value="students">Students</option>
              <option value="staff">Staff</option>
              <option value="alumni">Alumni</option>
            </select>
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 text-white text-xs font-semibold"
            >
              Launch Poll
            </button>
          </div>
        </form>
      )}

      {polls.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <BarChart3 className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No active polls yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Authorized teachers, administrators, and class monitors can create community polls.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {polls.map((poll) => {
            const userVote = votedOption[poll.id];
            const hasVoted = userVote !== undefined;
            return (
              <div
                key={poll.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {poll.question}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      By {poll.creatorName} · {poll.audience} ·{' '}
                      <span className="font-mono">{poll.totalVotes}</span> votes ·{' '}
                      {poll.closed ? 'Closed' : 'Open'}
                    </p>
                  </div>
                  {(profile?.uid === poll.createdBy || isStaffRole(profile?.role)) && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateDoc(doc(db, 'polls', poll.id), { closed: !poll.closed })
                      }
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold shrink-0"
                    >
                      {poll.closed ? 'Reopen' : 'Close'}
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {poll.options.map((opt, idx) => {
                    const count = poll.counts[idx] || 0;
                    const pct = poll.totalVotes > 0 ? Math.round((count / poll.totalVotes) * 100) : 0;
                    const isPicked = userVote === idx;
                    return (
                      <button
                        key={`${poll.id}_${idx}`}
                        type="button"
                        disabled={hasVoted || poll.closed}
                        onClick={() => void handleVote(poll, idx)}
                        className={`w-full text-left p-3 rounded-lg border transition-colors ${
                          isPicked
                            ? 'border-emerald-700 bg-emerald-50/70 dark:bg-emerald-950/40'
                            : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-900 dark:text-white">
                          <span>
                            {opt} {isPicked ? '(Your vote)' : ''}
                          </span>
                          {(hasVoted || poll.closed) && (
                            <span className="font-mono tabular-nums">
                              {count} ({pct}%)
                            </span>
                          )}
                        </div>
                        {(hasVoted || poll.closed) && (
                          <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full bg-emerald-700 dark:bg-emerald-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// F. Lost & Found
// ---------------------------------------------------------------------------
export function LostFoundModule({
  onContactReporter,
}: {
  onContactReporter: (uid: string) => void;
}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<LostFoundItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'lost' | 'found'>('all');
  const [showAdd, setShowAdd] = useState(false);

  const [kind, setKind] = useState<'lost' | 'found'>('lost');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'lostFound'), orderBy('createdAt', 'desc'), limit(40)),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<LostFoundItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'lostFound')
    );
    return () => unsub();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    const id = `lf_${Date.now()}_${profile.uid.slice(0, 6)}`;
    const payload: Record<string, unknown> = {
      kind,
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 600),
      resolved: false,
      reporterId: profile.uid,
      reporterName: profile.fullName,
      createdAt: serverTimestamp(),
    };
    if (location.trim()) payload.location = location.trim().slice(0, 100);
    try {
      await setDoc(doc(db, 'lostFound', id), payload);
      setTitle('');
      setLocation('');
      setDescription('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `lostFound/${id}`);
    }
  };

  const filtered = items.filter((i) => filter === 'all' || i.kind === filter);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Campus Lost &amp; Found
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Report lost or found books, ID cards, calculators, and uniforms, and contact the reporter safely via LUGA HUB chat.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((p) => !p)}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{showAdd ? 'Close' : 'Report Item'}</span>
        </button>
      </section>

      {showAdd && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              aria-label="Lost or found"
              value={kind}
              onChange={(e) => setKind(e.target.value as 'lost' | 'found')}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <option value="lost">Lost Item</option>
              <option value="found">Found Item</option>
            </select>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Item name e.g. Casio Scientific Calculator"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location e.g. Library / Form 4B"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
          <textarea
            rows={2}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Distinguishing details..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 text-white text-xs font-semibold"
            >
              Post Report
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-1.5">
        {(['all', 'lost', 'found'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize ${
              filter === f
                ? 'bg-emerald-800 text-white'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <SearchCheck className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No lost or found reports
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Report a missing or found school item above.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => {
            const isOwner = profile?.uid === item.reporterId;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {item.kind === 'lost' ? 'Lost' : 'Found'}: {item.title}{' '}
                    {item.resolved ? '· Resolved' : ''}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Reported by {item.reporterName}
                    {item.location ? ` · ${item.location}` : ''}
                  </p>
                  <p className="mt-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {item.description}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isOwner && !item.resolved && (
                    <button
                      type="button"
                      onClick={() => onContactReporter(item.reporterId)}
                      className="min-h-[38px] px-3.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span>Message</span>
                    </button>
                  )}
                  {(isOwner || isStaffRole(profile?.role)) && (
                    <button
                      type="button"
                      onClick={() =>
                        void updateDoc(doc(db, 'lostFound', item.id), {
                          resolved: !item.resolved,
                        })
                      }
                      className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{item.resolved ? 'Reopen' : 'Mark Resolved'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// G. Official Student Achievements
// ---------------------------------------------------------------------------
export function AchievementsModule() {
  const { profile } = useAuth();
  const [items, setItems] = useState<AchievementItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);

  const [title, setTitle] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [category, setCategory] = useState<AchievementItem['category']>('academic');
  const [awardedDate, setAwardedDate] = useState('');
  const [description, setDescription] = useState('');

  const canPublish = isStaffRole(profile?.role);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'achievements'), orderBy('createdAt', 'desc'), limit(40)),
      (snap) => {
        setItems(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AchievementItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'achievements')
    );
    return () => unsub();
  }, []);

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canPublish) return;
    const id = `ach_${Date.now()}_${profile.uid.slice(0, 6)}`;
    const payload: Record<string, unknown> = {
      title: title.trim().slice(0, 140),
      recipientName: recipientName.trim().slice(0, 100),
      category,
      description: description.trim().slice(0, 800),
      publishedBy: profile.uid,
      createdAt: serverTimestamp(),
    };
    if (awardedDate.trim()) payload.awardedDate = awardedDate.trim().slice(0, 30);
    try {
      await setDoc(doc(db, 'achievements', id), payload);
      setTitle('');
      setRecipientName('');
      setAwardedDate('');
      setDescription('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `achievements/${id}`);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Student &amp; School Achievements
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Celebrating academic excellence, sports trophies, leadership, and national competitions.
          </p>
        </div>
        {canPublish && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showAdd ? 'Close' : 'Publish Honor'}</span>
          </button>
        )}
      </section>

      {showAdd && canPublish && (
        <form
          onSubmit={handlePublish}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Achievement title"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              type="text"
              required
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="Student / Team name"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select
              aria-label="Achievement category"
              value={category}
              onChange={(e) => setCategory(e.target.value as AchievementItem['category'])}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <option value="academic">Academic Excellence</option>
              <option value="sports">Sports</option>
              <option value="leadership">Leadership</option>
              <option value="competition">Competitions</option>
              <option value="community">Community Service</option>
            </select>
            <input
              type="date"
              value={awardedDate}
              onChange={(e) => setAwardedDate(e.target.value)}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
          </div>
          <textarea
            rows={2}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Recognition details..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 text-white text-xs font-semibold"
            >
              Publish Achievement
            </button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <Award className="h-7 w-7 mx-auto text-amber-600 dark:text-amber-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No official achievements posted yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Authorized teachers and school administrators publish official student honors here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((ach) => (
            <div
              key={ach.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                    {ach.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {ach.recipientName} · <span className="capitalize">{ach.category}</span>
                    {ach.awardedDate ? ` · ${ach.awardedDate}` : ''}
                  </p>
                </div>
                {canPublish && (
                  <button
                    type="button"
                    aria-label="Delete achievement"
                    onClick={() => void deleteDoc(doc(db, 'achievements', ach.id))}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{ach.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// H. Bookmarks & Saved Items
// ---------------------------------------------------------------------------
export function BookmarksModule({
  onSelectModule,
}: {
  onSelectModule: (id: ModuleId) => void;
}) {
  const { profile } = useAuth();
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const rows = await fetchBookmarks(profile.uid);
      setBookmarks(rows);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [profile]);

  if (!profile) return null;

  const targetFor = (t: BookmarkItem['itemType']): ModuleId => {
    if (t === 'announcement') return 'announcements';
    if (t === 'resource') return 'resources';
    return 'reels';
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
          Saved Bookmarks
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Posts, announcements, and study resources you saved for quick revision later.
        </p>
      </section>

      {loading ? (
        <p className="text-sm text-slate-500">Loading saved items...</p>
      ) : bookmarks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <Bookmark className="h-7 w-7 mx-auto text-amber-600 dark:text-amber-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No saved items yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tap Save on any LUGA REELS post, announcement, or study resource to access it quickly here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookmarks.map((bm) => (
            <div
              key={bm.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                  {bm.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="capitalize">{bm.itemType}</span>
                  {bm.authorName ? ` · ${bm.authorName}` : ''}
                </p>
                {bm.summary && (
                  <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{bm.summary}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => onSelectModule(targetFor(bm.itemType))}
                  className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                >
                  Open
                </button>
                <button
                  type="button"
                  aria-label="Remove bookmark"
                  onClick={() => {
                    void toggleBookmark(
                      profile.uid,
                      {
                        itemId: bm.itemId,
                        itemType: bm.itemType,
                        title: bm.title,
                      },
                      true
                    ).then(() => setBookmarks((prev) => prev.filter((x) => x.id !== bm.id)));
                  }}
                  className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
