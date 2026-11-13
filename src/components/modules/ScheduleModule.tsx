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
import { Calendar, Clock, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { isStaffRole, SchoolEventItem, TimetableSlotItem } from '../../types/luga';

type ScheduleTab = 'lesson' | 'exam' | 'events';

export function ScheduleModule() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<ScheduleTab>('lesson');
  const [slots, setSlots] = useState<TimetableSlotItem[]>([]);
  const [events, setEvents] = useState<SchoolEventItem[]>([]);
  const [classFilter, setClassFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  // Timetable form
  const [className, setClassName] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState('Monday');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:20');
  const [subject, setSubject] = useState('');
  const [teacherName, setTeacherName] = useState('');
  const [room, setRoom] = useState('');

  // Event form
  const [evtTitle, setEvtTitle] = useState('');
  const [evtCategory, setEvtCategory] = useState<SchoolEventItem['category']>('academic');
  const [evtDate, setEvtDate] = useState('');
  const [evtLocation, setEvtLocation] = useState('');
  const [evtDesc, setEvtDesc] = useState('');

  const canManage = isStaffRole(profile?.role);

  useEffect(() => {
    const unsubSlots = onSnapshot(
      query(collection(db, 'timetables'), orderBy('createdAt', 'desc'), limit(80)),
      (snap) => {
        setSlots(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TimetableSlotItem, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'timetables')
    );

    const unsubEvents = onSnapshot(
      query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        setEvents(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SchoolEventItem, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'events')
    );

    return () => {
      unsubSlots();
      unsubEvents();
    };
  }, []);

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManage) return;
    const id = `slot_${Date.now()}_${profile.uid.slice(0, 6)}`;
    const payload: Record<string, unknown> = {
      kind: tab === 'exam' ? 'exam' : 'lesson',
      className: className.trim().slice(0, 60),
      dayOfWeek: dayOfWeek.trim().slice(0, 20),
      startTime: startTime.trim().slice(0, 20),
      endTime: endTime.trim().slice(0, 20),
      subject: subject.trim().slice(0, 80),
      teacherName: teacherName.trim().slice(0, 100),
      createdBy: profile.uid,
      createdAt: serverTimestamp(),
    };
    if (room.trim()) payload.room = room.trim().slice(0, 40);
    try {
      await setDoc(doc(db, 'timetables', id), payload);
      setSubject('');
      setRoom('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `timetables/${id}`);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !canManage) return;
    const id = `evt_${Date.now()}_${profile.uid.slice(0, 6)}`;
    const payload: Record<string, unknown> = {
      title: evtTitle.trim().slice(0, 140),
      category: evtCategory,
      eventDate: evtDate.trim().slice(0, 30),
      createdBy: profile.uid,
      createdAt: serverTimestamp(),
    };
    if (evtLocation.trim()) payload.location = evtLocation.trim().slice(0, 100);
    if (evtDesc.trim()) payload.description = evtDesc.trim().slice(0, 800);
    try {
      await setDoc(doc(db, 'events', id), payload);
      setEvtTitle('');
      setEvtDate('');
      setEvtLocation('');
      setEvtDesc('');
      setShowAdd(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `events/${id}`);
    }
  };

  const filteredSlots = slots.filter(
    (s) =>
      s.kind === (tab === 'exam' ? 'exam' : 'lesson') &&
      (!classFilter.trim() || s.className.toLowerCase().includes(classFilter.trim().toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            School Timetable &amp; Events Calendar
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Lesson schedules, examination timetables, sports fixtures, and club meetings.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => setShowAdd((p) => !p)}
            className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{showAdd ? 'Close Form' : tab === 'events' ? 'Add Event' : 'Add Schedule Slot'}</span>
          </button>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {(
            [
              { id: 'lesson', label: 'Class Timetable' },
              { id: 'exam', label: 'Exam Schedule' },
              { id: 'events', label: 'Events Calendar' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab !== 'events' && (
          <input
            type="search"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            placeholder="Filter by class e.g. Form 4A"
            className="h-10 px-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
          />
        )}
      </div>

      {showAdd && canManage && tab !== 'events' && (
        <form
          onSubmit={handleAddSlot}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 sm:grid-cols-3 gap-3"
        >
          <input
            type="text"
            required
            value={className}
            onChange={(e) => setClassName(e.target.value)}
            placeholder="Class e.g. Form 4A"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <input
            type="text"
            required
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(e.target.value)}
            placeholder={tab === 'exam' ? 'Date / Day e.g. Mon Nov 18' : 'Day e.g. Monday'}
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <input
            type="text"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject e.g. Mathematics"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <input
            type="text"
            required
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            placeholder="Start e.g. 08:00"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
          />
          <input
            type="text"
            required
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            placeholder="End e.g. 09:20"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
          />
          <input
            type="text"
            required
            value={teacherName}
            onChange={(e) => setTeacherName(e.target.value)}
            placeholder="Teacher / Invigilator"
            className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <input
            type="text"
            value={room}
            onChange={(e) => setRoom(e.target.value)}
            placeholder="Room / Hall (optional)"
            className="sm:col-span-2 min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <button
            type="submit"
            className="min-h-[40px] px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold"
          >
            Save Slot
          </button>
        </form>
      )}

      {showAdd && canManage && tab === 'events' && (
        <form
          onSubmit={handleAddEvent}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              value={evtTitle}
              onChange={(e) => setEvtTitle(e.target.value)}
              placeholder="Event title"
              className="sm:col-span-2 min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
            <select
              aria-label="Event category"
              value={evtCategory}
              onChange={(e) => setEvtCategory(e.target.value as SchoolEventItem['category'])}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            >
              <option value="academic">Academic</option>
              <option value="exam">Examination</option>
              <option value="sports">Sports</option>
              <option value="club">Club Meeting</option>
              <option value="general">General</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="date"
              required
              value={evtDate}
              onChange={(e) => setEvtDate(e.target.value)}
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono"
            />
            <input
              type="text"
              value={evtLocation}
              onChange={(e) => setEvtLocation(e.target.value)}
              placeholder="Location e.g. Main Assembly Hall"
              className="min-h-[40px] px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>
          <textarea
            rows={2}
            value={evtDesc}
            onChange={(e) => setEvtDesc(e.target.value)}
            placeholder="Event details..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold"
            >
              Publish Event
            </button>
          </div>
        </form>
      )}

      {tab !== 'events' ? (
        filteredSlots.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
            <Clock className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              No {tab === 'exam' ? 'examination slots' : 'lesson timetable entries'} yet
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Teachers and administrators can add class periods and exam schedules above.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {filteredSlots.map((slot) => (
              <div
                key={slot.id}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                    {slot.subject} · {slot.className}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {slot.dayOfWeek} ·{' '}
                    <span className="font-mono">
                      {slot.startTime}–{slot.endTime}
                    </span>{' '}
                    · {slot.teacherName}
                    {slot.room ? ` · ${slot.room}` : ''}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Delete slot"
                    onClick={() => void deleteDoc(doc(db, 'timetables', slot.id))}
                    className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center self-start sm:self-center"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <Calendar className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No school events scheduled yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Upcoming sports fixtures, exam dates, and club meetings will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((evt) => (
            <div
              key={evt.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex items-start justify-between gap-4"
            >
              <div>
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  {evt.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  <span className="font-mono">{evt.eventDate}</span> ·{' '}
                  <span className="capitalize">{evt.category}</span>
                  {evt.location ? ` · ${evt.location}` : ''}
                </p>
                {evt.description && (
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    {evt.description}
                  </p>
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  aria-label="Delete event"
                  onClick={() => void deleteDoc(doc(db, 'events', evt.id))}
                  className="min-h-[36px] min-w-[36px] rounded-lg text-slate-500 hover:text-red-600 flex items-center justify-center shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
