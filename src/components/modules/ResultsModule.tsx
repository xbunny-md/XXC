import React, { useEffect, useState } from 'react';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { GraduationCap, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { sendNotification } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { ExamItem, isStaffRole, ResultItem, toMillis, UserDirectoryEntry } from '../../types/luga';

function computeGrade(marks: number): string {
  if (marks >= 75) return 'A';
  if (marks >= 65) return 'B';
  if (marks >= 45) return 'C';
  if (marks >= 30) return 'D';
  return 'F';
}

export function ResultsModule() {
  const { profile } = useAuth();
  const [myResults, setMyResults] = useState<ResultItem[]>([]);
  const [staffResults, setStaffResults] = useState<ResultItem[]>([]);
  const [exams, setExams] = useState<ExamItem[]>([]);
  const [students, setStudents] = useState<UserDirectoryEntry[]>([]);
  const [viewMode, setViewMode] = useState<'personal' | 'manage'>('personal');
  const [showExamForm, setShowExamForm] = useState(false);

  const [examTitle, setExamTitle] = useState('');
  const [examTerm, setExamTerm] = useState('Term 1');
  const [examYear, setExamYear] = useState('2026');

  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedExamId, setSelectedExamId] = useState('');
  const [className, setClassName] = useState('Form 4A');
  const [subjectName, setSubjectName] = useState('');
  const [marks, setMarks] = useState('');
  const [remarks, setRemarks] = useState('');
  const [publishNow, setPublishNow] = useState(true);

  const isStaff = isStaffRole(profile?.role);

  useEffect(() => {
    if (isStaff) setViewMode('manage');
  }, [isStaff]);

  useEffect(() => {
    if (!profile) return;

    const unsubMine = onSnapshot(
      query(
        collection(db, 'results'),
        where('studentId', '==', profile.uid),
        where('published', '==', true),
        limit(80)
      ),
      (snap) => {
        setMyResults(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ResultItem, 'id'>) }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'results')
    );

    if (!isStaff) {
      return () => unsubMine();
    }

    const staffQuery =
      profile.role === 'super_admin'
        ? query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(80))
        : query(
            collection(db, 'results'),
            where('recordedBy', '==', profile.uid),
            limit(80)
          );

    const unsubStaff = onSnapshot(
      staffQuery,
      (snap) => {
        setStaffResults(
          snap.docs
            .map((d) => ({ id: d.id, ...(d.data() as Omit<ResultItem, 'id'>) }))
            .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
        );
      },
      () => {}
    );

    const unsubExams = onSnapshot(
      query(collection(db, 'examinations'), orderBy('createdAt', 'desc'), limit(20)),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ExamItem, 'id'>) }));
        setExams(list);
        if (list.length > 0 && !selectedExamId) setSelectedExamId(list[0].id);
      },
      () => {}
    );

    const unsubStudents = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('fullName', 'asc'), limit(80)),
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as UserDirectoryEntry)
          .filter((u) => u.status === 'approved' && (u.role === 'student' || u.role === 'class_monitor'));
        setStudents(list);
        if (list.length > 0 && !selectedStudentId) setSelectedStudentId(list[0].uid);
      },
      () => {}
    );

    return () => {
      unsubMine();
      unsubStaff();
      unsubExams();
      unsubStudents();
    };
  }, [profile, isStaff]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isStaff) return;
    const examId = `exam_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'examinations', examId), {
        title: examTitle.trim().slice(0, 100),
        term: examTerm.trim().slice(0, 40),
        year: examYear.trim().slice(0, 10),
        published: true,
        createdBy: profile.uid,
        createdAt: serverTimestamp(),
      });
      setExamTitle('');
      setSelectedExamId(examId);
      setShowExamForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `examinations/${examId}`);
    }
  };

  const handleRecordResult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !isStaff || !selectedStudentId || !selectedExamId) return;
    const numMarks = Number(marks);
    if (Number.isNaN(numMarks) || numMarks < 0 || numMarks > 100) return;

    const student = students.find((s) => s.uid === selectedStudentId);
    const exam = exams.find((ex) => ex.id === selectedExamId);
    const resultId = `res_${Date.now()}_${selectedStudentId.slice(0, 6)}`;
    try {
      await setDoc(doc(db, 'results', resultId), {
        studentId: selectedStudentId,
        studentName: student?.fullName || 'Student',
        examId: selectedExamId,
        examTitle: exam?.title || 'Examination',
        classId: className.trim().slice(0, 60),
        subjectId: subjectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40),
        subjectName: subjectName.trim().slice(0, 80),
        marks: numMarks,
        grade: computeGrade(numMarks),
        remarks: remarks.trim().slice(0, 200),
        published: publishNow,
        recordedBy: profile.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (publishNow) {
        await sendNotification({
          userId: selectedStudentId,
          actorId: profile.uid,
          kind: 'academic',
          title: 'New Examination Result Published',
          body: `${subjectName.trim()} (${exam?.title || 'Exam'}): ${numMarks}% (${computeGrade(numMarks)})`,
        });
      }
      setSubjectName('');
      setMarks('');
      setRemarks('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `results/${resultId}`);
    }
  };

  const toggleResultPublish = async (res: ResultItem) => {
    try {
      await updateDoc(doc(db, 'results', res.id), {
        published: !res.published,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `results/${res.id}`);
    }
  };

  const totalMarks = myResults.reduce((sum, r) => sum + r.marks, 0);
  const averageMarks = myResults.length > 0 ? (totalMarks / myResults.length).toFixed(1) : '0.0';

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            Academic Results Portal
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Private examination records enforced by Firestore student-owner and staff rules.
          </p>
        </div>

        {isStaff && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('manage')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                viewMode === 'manage'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              Manage Marks
            </button>
            <button
              type="button"
              onClick={() => setViewMode('personal')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                viewMode === 'personal'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              My View
            </button>
          </div>
        )}
      </section>

      {isStaff && viewMode === 'manage' ? (
        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Record Examination Marks
              </h3>
              <button
                type="button"
                onClick={() => setShowExamForm((p) => !p)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Examination</span>
              </button>
            </div>

            {showExamForm && (
              <form onSubmit={handleCreateExam} className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  value={examTitle}
                  onChange={(e) => setExamTitle(e.target.value)}
                  placeholder="Exam e.g. Midterm Form 4"
                  className="sm:col-span-2 min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <input
                  type="text"
                  required
                  value={examTerm}
                  onChange={(e) => setExamTerm(e.target.value)}
                  placeholder="Term 1"
                  className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[40px] px-4 rounded-lg bg-emerald-800 text-white text-xs font-semibold"
                >
                  Save Exam
                </button>
              </form>
            )}

            <form onSubmit={handleRecordResult} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                aria-label="Select student"
                required
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {students.length === 0 ? (
                  <option value="">No approved students yet</option>
                ) : (
                  students.map((st) => (
                    <option key={st.uid} value={st.uid}>
                      {st.fullName} ({st.classOrDept})
                    </option>
                  ))
                )}
              </select>

              <select
                aria-label="Select examination"
                required
                value={selectedExamId}
                onChange={(e) => setSelectedExamId(e.target.value)}
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              >
                {exams.length === 0 ? (
                  <option value="">Create an examination first</option>
                ) : (
                  exams.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.title} ({ex.term} {ex.year})
                    </option>
                  ))
                )}
              </select>

              <input
                type="text"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="Class e.g. Form 4A"
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />

              <input
                type="text"
                required
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                placeholder="Subject e.g. Chemistry"
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />

              <input
                type="number"
                required
                min={0}
                max={100}
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                placeholder="Marks (0-100)"
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
              />

              <input
                type="text"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Remarks (optional)"
                className="min-h-[42px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
              />

              <div className="sm:col-span-3 flex items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={publishNow}
                    onChange={(e) => setPublishNow(e.target.checked)}
                  />
                  <span>Publish immediately to student</span>
                </label>
                <button
                  type="submit"
                  disabled={students.length === 0 || exams.length === 0}
                  className="min-h-[40px] px-5 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold"
                >
                  Save Result
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Recorded Examination Entries
              </h3>
            </div>
            {staffResults.length === 0 ? (
              <p className="p-6 text-sm text-slate-500">No examination marks recorded yet.</p>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {staffResults.map((res) => (
                  <div
                    key={res.id}
                    className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {res.studentName || res.studentId} · {res.subjectName || res.subjectId}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {res.examTitle || res.examId} · {res.classId} ·{' '}
                        {res.published ? 'Published' : 'Draft'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-slate-900 dark:text-white">
                        {res.marks}% ({res.grade})
                      </span>
                      <button
                        type="button"
                        onClick={() => void toggleResultPublish(res)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-semibold"
                      >
                        {res.published ? 'Unpublish' : 'Publish'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Published Subjects</p>
              <p className="mt-1 font-display text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {myResults.length}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Total Marks</p>
              <p className="mt-1 font-display text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {totalMarks}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">Overall Average</p>
              <p className="mt-1 font-display text-2xl font-bold font-mono text-emerald-700 dark:text-emerald-400">
                {averageMarks}%
              </p>
            </div>
          </section>

          {myResults.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
              <GraduationCap className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                No published examination results yet
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Once your teachers publish term examination marks, your personal transcript will appear here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Subject</th>
                    <th className="py-3 px-4 font-semibold">Examination</th>
                    <th className="py-3 px-4 font-semibold text-right">Marks</th>
                    <th className="py-3 px-4 font-semibold text-right">Grade</th>
                    <th className="py-3 px-4 font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {myResults.map((res) => (
                    <tr key={res.id}>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                        {res.subjectName || res.subjectId}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400">
                        {res.examTitle || res.examId}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">{res.marks}%</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {res.grade}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {res.remarks || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
