/**
 * LUGA HUB Security Rules Verification Matrix
 * Documents adversarial payloads expected to return PERMISSION_DENIED.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Privilege Escalation on Registration',
    collectionPath: '/users/student_uid_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      uid: 'student_uid_1',
      role: 'super_admin',
      status: 'approved',
    },
  },
  {
    id: 2,
    name: 'Role Self-Upgrade on Profile Edit',
    collectionPath: '/users/student_uid_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: {
      role: 'teacher',
    },
  },
  {
    id: 3,
    name: 'Unverified Email Spoof',
    collectionPath: '/announcements/ann_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      title: 'Fake Closure',
      email_verified: false,
    },
  },
  {
    id: 4,
    name: 'Cross-Student Result Scraping',
    collectionPath: '/results/res_student_2',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { callerUid: 'student_uid_1', targetStudentId: 'student_uid_2' },
  },
  {
    id: 5,
    name: 'Unpublished Result Peek',
    collectionPath: '/results/res_draft_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { studentId: 'student_uid_1', published: false },
  },
  {
    id: 6,
    name: 'Private Message Eavesdropping',
    collectionPath: '/conversations/conv_1/messages/msg_1',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { callerUid: 'outsider_uid' },
  },
  {
    id: 7,
    name: 'Shadow Field Injection',
    collectionPath: '/posts/post_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: {
      authorId: 'student_uid_1',
      content: 'Hello',
      isVerifiedAdmin: true,
    },
  },
  {
    id: 8,
    name: 'ID Poisoning',
    collectionPath: `/posts/${'a'.repeat(200)}`,
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { content: 'Oversized doc ID' },
  },
  {
    id: 9,
    name: 'Author Spoofing',
    collectionPath: '/posts/post_2',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { authorId: 'victim_uid', content: 'Impersonated post' },
  },
  {
    id: 10,
    name: 'Audit Log Tampering',
    collectionPath: '/auditLogs/log_1',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    payload: {},
  },
  {
    id: 11,
    name: 'PII Blanket Read',
    collectionPath: '/users',
    operation: 'list',
    expected: 'PERMISSION_DENIED',
    payload: { callerRole: 'student' },
  },
  {
    id: 12,
    name: 'Client Timestamp Forgery',
    collectionPath: '/posts/post_3',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2099-01-01T00:00:00Z' },
  },
  {
    id: 13,
    name: 'Admin-Only Group Posting Bypass',
    collectionPath: '/groups/group_1/posts/gmsg_1',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { callerRole: 'member', onlyAdminsCanMessage: true, content: 'Bypass' },
  },
  {
    id: 14,
    name: 'Group Self-Promotion',
    collectionPath: '/groups/group_1/members/student_uid_1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { groupRole: 'admin' },
  },
];
