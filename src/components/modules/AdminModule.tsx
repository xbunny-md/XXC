import React, { useEffect, useState } from 'react';
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { Flag, KeyRound, ScrollText, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  createSchoolCode,
  resolveModerationReport,
  toggleSchoolCodeActive,
} from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import { adminUpdateMemberRoleAndStatus } from '../../lib/userService';
import {
  AccountStatus,
  formatFirestoreDate,
  isAdminRole,
  ReportItem,
  ROLE_LABELS,
  SchoolCodeItem,
  UserDirectoryEntry,
  UserRole,
} from '../../types/luga';

interface AdminModuleProps {
  searchQuery: string;
}

type AdminTab = 'members' | 'codes' | 'reports' | 'logs';

interface AuditLogRow {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  details?: string;
  createdAt?: unknown;
}

const ALL_ROLES: UserRole[] = [
  'student',
  'class_monitor',
  'teacher',
  'class_teacher',
  'headmaster',
  'school_admin',
  'alumni',
  'super_admin',
];

export function AdminModule({ searchQuery }: AdminModuleProps) {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('members');
  const [members, setMembers] = useState<UserDirectoryEntry[]>([]);
  const [codes, setCodes] = useState<SchoolCodeItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [newCode, setNewCode] = useState('');
  const [newCodeLabel, setNewCodeLabel] = useState('');
  const [newCodeRoleHint, setNewCodeRoleHint] = useState<SchoolCodeItem['roleHint']>('student');

  useEffect(() => {
    const unsubMembers = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('updatedAt', 'desc'), limit(60)),
      (snapshot) => {
        setMembers(snapshot.docs.map((d) => d.data() as UserDirectoryEntry));
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'userDirectory');
      }
    );

    const unsubCodes = onSnapshot(
      query(collection(db, 'schoolCodes'), orderBy('createdAt', 'desc'), limit(30)),
      (snapshot) => {
        setCodes(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SchoolCodeItem, 'id'>) }))
        );
      },
      () => {}
    );

    const unsubReports = onSnapshot(
      query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(40)),
      (snapshot) => {
        setReports(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ReportItem, 'id'>) }))
        );
      },
      () => {}
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'auditLogs'), orderBy('createdAt', 'desc'), limit(40)),
      (snapshot) => {
        setAuditLogs(
          snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditLogRow, 'id'>) }))
        );
      },
      () => {}
    );

    return () => {
      unsubMembers();
      unsubCodes();
      unsubReports();
      unsubLogs();
    };
  }, []);

  if (!profile || !isAdminRole(profile.role)) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Administrator authorization is required to view this console.
        </p>
      </div>
    );
  }

  const canModifyMembers = profile.role === 'super_admin' || profile.role === 'school_admin';

  const handleUpdateMember = async (
    targetUid: string,
    newRole: UserRole,
    newStatus: AccountStatus
  ) => {
    setBusyId(targetUid);
    setActionMessage(null);
    try {
      await adminUpdateMemberRoleAndStatus(profile.uid, targetUid, newRole, newStatus);
      setActionMessage('Member permissions updated and logged.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to update member.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCreateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode.trim() || !newCodeLabel.trim()) return;
    setActionMessage(null);
    try {
      await createSchoolCode({
        code: newCode,
        label: newCodeLabel,
        roleHint: newCodeRoleHint,
        actorUid: profile.uid,
      });
      setNewCode('');
      setNewCodeLabel('');
      setActionMessage('School registration code created.');
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : 'Unable to create code.');
    }
  };

  const filteredMembers = members.filter((m) => {
    const matchesStatus = statusFilter === 'all' || m.status === statusFilter;
    const term = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !term ||
      m.fullName.toLowerCase().includes(term) ||
      m.username.toLowerCase().includes(term) ||
      m.classOrDept.toLowerCase().includes(term);
    return matchesStatus && matchesSearch;
  });

  const pendingCount = members.filter((m) => m.status === 'pending').length;
  const approvedCount = members.filter((m) => m.status === 'approved').length;
  const openReportsCount = reports.filter((r) => r.status === 'open').length;

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Community Members</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {members.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Pending Approvals</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">
            {pendingCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Approved Accounts</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {approvedCount}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Open Reports</p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums text-red-700 dark:text-red-400">
            {openReportsCount}
          </p>
        </div>
      </section>

      {/* Admin Sub-Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'members', label: 'Members & Roles', icon: Users },
            { id: 'codes', label: 'School Codes', icon: KeyRound },
            { id: 'reports', label: `Reports (${openReportsCount})`, icon: Flag },
            { id: 'logs', label: 'Audit Logs', icon: ScrollText },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {actionMessage && (
        <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">{actionMessage}</p>
      )}

      {activeTab === 'members' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Member Directory &amp; RBAC Control
              </h2>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(['all', 'pending', 'approved', 'suspended'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">Loading directory...</p>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6">
              No member records match the selected filter.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredMembers.map((member) => {
                const isSelf = member.uid === profile.uid;
                return (
                  <div
                    key={member.uid}
                    className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                        {member.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono">@{member.username}</span> · {member.classOrDept} ·{' '}
                        <span className="capitalize">{member.status}</span> · {ROLE_LABELS[member.role]}
                      </p>
                    </div>

                    {canModifyMembers && !isSelf && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <select
                          aria-label={`Role for ${member.fullName}`}
                          value={member.role}
                          disabled={busyId === member.uid}
                          onChange={(e) =>
                            void handleUpdateMember(
                              member.uid,
                              e.target.value as UserRole,
                              member.status
                            )
                          }
                          className="h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-800 dark:text-slate-200"
                        >
                          {ALL_ROLES.filter(
                            (r) => r !== 'super_admin' || profile.role === 'super_admin'
                          ).map((roleOption) => (
                            <option key={roleOption} value={roleOption}>
                              {ROLE_LABELS[roleOption]}
                            </option>
                          ))}
                        </select>

                        {member.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={busyId === member.uid}
                            onClick={() =>
                              void handleUpdateMember(member.uid, member.role, 'approved')
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold whitespace-nowrap"
                          >
                            Approve
                          </button>
                        )}

                        {member.status !== 'suspended' && (
                          <button
                            type="button"
                            disabled={busyId === member.uid}
                            onClick={() =>
                              void handleUpdateMember(member.uid, member.role, 'suspended')
                            }
                            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold whitespace-nowrap"
                          >
                            Suspend
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'codes' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              School Registration Codes
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Create and deactivate registration codes distributed to incoming classes, teachers, and alumni. Default fallback code: <span className="font-mono">LUGA-2026</span>.
            </p>
          </div>

          {canModifyMembers && (
            <form onSubmit={handleCreateCode} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <input
                type="text"
                required
                minLength={4}
                maxLength={32}
                value={newCode}
                onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                placeholder="Code e.g. FORM1-2026"
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100"
              />
              <input
                type="text"
                required
                minLength={2}
                maxLength={80}
                value={newCodeLabel}
                onChange={(e) => setNewCodeLabel(e.target.value)}
                placeholder="Label e.g. Form 1 Intake"
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              />
              <select
                aria-label="Code role hint"
                value={newCodeRoleHint}
                onChange={(e) => setNewCodeRoleHint(e.target.value as SchoolCodeItem['roleHint'])}
                className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs text-slate-900 dark:text-slate-100"
              >
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="alumni">Alumni</option>
                <option value="any">Any Member</option>
              </select>
              <button
                type="submit"
                className="min-h-[42px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold whitespace-nowrap"
              >
                Create Code
              </button>
            </form>
          )}

          {codes.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              No custom school codes created yet. Built-in default code <span className="font-mono">LUGA-2026</span> remains active.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {codes.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">
                      {item.code}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {item.label} · {item.roleHint} · {item.active ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                  {canModifyMembers && (
                    <button
                      type="button"
                      onClick={() => void toggleSchoolCodeActive(item, profile.uid)}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      {item.active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'reports' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Moderation Reports
          </h2>
          {reports.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              No moderation reports have been filed.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {reports.map((rep) => (
                <div key={rep.id} className="py-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {rep.targetType.toUpperCase()} report by {rep.reporterName} ·{' '}
                      <span className="capitalize">{rep.status}</span>
                    </p>
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                      {formatFirestoreDate(rep.createdAt)}
                    </span>
                  </div>
                  {rep.targetSummary && (
                    <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-lg">
                      {rep.targetSummary}
                    </p>
                  )}
                  <p className="text-xs text-slate-700 dark:text-slate-200">Reason: {rep.reason}</p>

                  {rep.status === 'open' && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {rep.targetType === 'post' && (
                        <button
                          type="button"
                          onClick={() =>
                            void resolveModerationReport({
                              report: rep,
                              newStatus: 'resolved',
                              actorUid: profile.uid,
                              deleteTargetPost: true,
                            })
                          }
                          className="min-h-[36px] px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-800 text-white text-xs font-semibold"
                        >
                          Remove Post &amp; Resolve
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          void resolveModerationReport({
                            report: rep,
                            newStatus: 'dismissed',
                            actorUid: profile.uid,
                          })
                        }
                        className="min-h-[36px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'logs' && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Administrative Audit Logs
          </h2>
          {auditLogs.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              No audit log entries recorded yet.
            </p>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {auditLogs.map((log) => (
                <div key={log.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {log.action} · {log.targetType} ({log.targetId})
                    </p>
                    {log.details && (
                      <p className="text-slate-500 dark:text-slate-400">{log.details}</p>
                    )}
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                    {formatFirestoreDate(log.createdAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
