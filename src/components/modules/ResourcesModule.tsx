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
} from 'firebase/firestore';
import { Bookmark, BookOpen, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { toggleBookmark } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { AssignmentItem, isStaffRole, ResourceItem } from '../../types/luga';

interface ResourcesModuleProps {
  searchQuery: string;
}

export function ResourcesModule({ searchQuery }: ResourcesModuleProps) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'resources' | 'assignments'>('resources');
  const [resources, setResources] = useState<ResourceItem[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [bookmarkedIds, setBookmarkedIds] = useState<Record<string, boolean>>({});
  const [typeFilter, setTypeFilter] = useState<'all' | ResourceItem['type']>('all');
  const [showAdd, setShowAdd] = useState(false);

  const [title, setTitle] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [classId, setClassId] = useState('');
  const [resType, setResType] = useState<ResourceItem['type']>('notes');
  const [fileUrl, setFileUrl] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const isStaff = isStaffRole(profile?.role);

  useEffect(() => {
    const unsubRes = onSnapshot(
      query(collection(db, 'resources'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        setResources(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ResourceItem, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'resources')
    );

    const unsubAssign = onSnapshot(
      query(collection(db, 'assignments'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        setAssignments(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AssignmentItem, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'assignments')
    );

    return () => {
      unsubRes();
      unsubAssign();
    };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', profile.uid, 'bookmarks')),
      (snap) => {
        const map: Record<string, boolean> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as { itemId: string; itemType: string };
          if (data.itemType === 'resource') map[data.itemId] = true;
        });
        setBookmarkedIds(map);
      },
      () => {}
    );
    return () => unsub();
  }, [profile]);

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isStaff) return;
    const id = `res_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      const payload: Record<string, unknown> = {
        title: title.trim().slice(0, 160),
        type: resType,
        subjectId: subjectId.trim().slice(0, 60),
        classId: classId.trim().slice(0, 60),
        fileUrl: fileUrl.trim().slice(0, 500),
        uploadedBy: profile.uid,
        uploaderName: profile.fullName,
        createdAt: serverTimestamp(),
      };
      if (description.trim()) payload.description = description.trim().slice(0, 600);
      await setDoc(doc(db, 'resources', id), payload);
      setTitle('');
      setFileUrl('');
      setDescription('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `resources/${id}`);
    }
  };

  const handleSaveAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isStaff) return;
    const id = `asgn_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'assignments', id), {
        title: title.trim().slice(0, 160),
        description: description.trim().slice(0, 1500),
        subjectId: subjectId.trim().slice(0, 60),
        classId: classId.trim().slice(0, 60),
        dueDate: dueDate.trim().slice(0, 40),
        teacherId: profile.uid,
        teacherName: profile.fullName,
        createdAt: serverTimestamp(),
      });
      setTitle('');
      setDescription('');
      setDueDate('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `assignments/${id}`);
    }
  };

  const term = searchQuery.trim().toLowerCase();
  const filteredResources = resources.filter((r) => {
    const matchesType = typeFilter === 'all' || r.type === typeFilter;
    const matchesTerm =
      !term ||
      r.title.toLowerCase().includes(term) ||
      r.subjectId.toLowerCase().includes(term) ||
      r.classId.toLowerCase().includes(term);
    return matchesType && matchesTerm;
  });

  const filteredAssignments = assignments.filter(
    (a) =>
      !term ||
      a.title.toLowerCase().includes(term) ||
      a.subjectId.toLowerCase().includes(term) ||
      a.classId.toLowerCase().includes(term)
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Academic Resources &amp; Assignments
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Study notes, past examination papers, syllabi, and class assignments.
          </p>
        </div>

        {isStaff && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showAdd ? 'Close Form' : tab === 'resources' ? 'Share Resource' : 'Post Assignment'}</span>
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => setTab('resources')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'resources'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Study Library ({resources.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('assignments')}
            className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold ${
              tab === 'assignments'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-300'
            }`}
          >
            Assignments ({assignments.length})
          </button>
        </div>

        {tab === 'resources' && (
          <div className="flex items-center gap-1.5">
            {(['all', 'notes', 'past_paper', 'syllabus'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`min-h-[36px] px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                  typeFilter === t
                    ? 'bg-emerald-800 text-white'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        )}
      </div>

      {showAdd && isStaff && (
        <form
          onSubmit={tab === 'resources' ? handleSaveResource : handleSaveAssignment}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              type="text"
              required
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              placeholder="Subject e.g. Biology"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <input
              type="text"
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              placeholder="Class e.g. Form 3"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>

          {tab === 'resources' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                aria-label="Resource type"
                value={resType}
                onChange={(e) => setResType(e.target.value as ResourceItem['type'])}
                className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                <option value="notes">Study Notes</option>
                <option value="past_paper">Past Exam Paper</option>
                <option value="syllabus">Syllabus</option>
              </select>
              <input
                type="url"
                required
                value={fileUrl}
                onChange={(e) => setFileUrl(e.target.value)}
                placeholder="Document URL (Google Drive / PDF link)"
                className="sm:col-span-2 min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />
            </div>
          ) : (
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
          )}

          <textarea
            rows={2}
            required={tab === 'assignments'}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Instructions or summary..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />

          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold"
            >
              Publish
            </button>
          </div>
        </form>
      )}

      {tab === 'resources' ? (
        filteredResources.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
            <BookOpen className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              No study resources uploaded yet
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Teachers can share notes, past papers, and syllabi for students to bookmark and study.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredResources.map((res) => {
              const saved = Boolean(bookmarkedIds[res.id]);
              return (
                <div
                  key={res.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                      {res.title}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span className="capitalize">{res.type.replace('_', ' ')}</span> ·{' '}
                      {res.subjectId} · {res.classId} · {res.uploaderName || 'Teacher'}
                    </p>
                    {res.description && (
                      <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">
                        {res.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {profile && (
                      <button
                        type="button"
                        aria-label="Bookmark resource"
                        onClick={() =>
                          void toggleBookmark(
                            profile.uid,
                            {
                              itemId: res.id,
                              itemType: 'resource',
                              title: res.title,
                              summary: `${res.subjectId} · ${res.classId}`,
                              authorName: res.uploaderName,
                            },
                            saved
                          )
                        }
                        className={`min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center ${
                          saved ? 'text-amber-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      >
                        <Bookmark className={`h-4 w-4 ${saved ? 'fill-current' : ''}`} />
                      </button>
                    )}
                    <a
                      href={res.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5"
                    >
                      <span>Open</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    {isStaff && (
                      <button
                        type="button"
                        aria-label="Delete resource"
                        onClick={() => void deleteDoc(doc(db, 'resources', res.id))}
                        className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : filteredAssignments.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No class assignments posted yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAssignments.map((asgn) => (
            <div
              key={asgn.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {asgn.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {asgn.subjectId} · {asgn.classId} · Due{' '}
                    <span className="font-mono font-semibold">{asgn.dueDate}</span>
                  </p>
                </div>
                {isStaff && (
                  <button
                    type="button"
                    aria-label="Delete assignment"
                    onClick={() => void deleteDoc(doc(db, 'assignments', asgn.id))}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300">{asgn.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
