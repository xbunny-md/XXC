export type UserRole =
  | 'super_admin'
  | 'school_admin'
  | 'headmaster'
  | 'teacher'
  | 'class_teacher'
  | 'class_monitor'
  | 'student'
  | 'alumni';

export type RequestableRole =
  | 'student'
  | 'teacher'
  | 'class_teacher'
  | 'class_monitor'
  | 'alumni';

export type AccountStatus = 'pending' | 'approved' | 'suspended';

export type ModuleId =
  | 'reels'
  | 'messages'
  | 'calls'
  | 'groups'
  | 'announcements'
  | 'schedule'
  | 'results'
  | 'resources'
  | 'polls'
  | 'achievements'
  | 'lost_found'
  | 'bookmarks'
  | 'profile'
  | 'admin';

export interface PrivacySettings {
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  sendReadReceipts: boolean;
  allowMessagesFrom: 'everyone' | 'staff_and_classmates' | 'nobody';
  profileVisibility: 'community' | 'class_only';
}

export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  showOnlineStatus: true,
  showLastSeen: true,
  sendReadReceipts: true,
  allowMessagesFrom: 'everyone',
  profileVisibility: 'community',
};

export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  email: string;
  role: UserRole;
  requestedRole?: RequestableRole;
  status: AccountStatus;
  classOrDept: string;
  studentRegNo?: string;
  schoolRegCode: string;
  house?: string;
  phone?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  privacy?: PrivacySettings;
  lastActiveAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface UserDirectoryEntry {
  uid: string;
  fullName: string;
  username: string;
  role: UserRole;
  status: AccountStatus;
  classOrDept: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  isOnline?: boolean;
  showOnlineStatus?: boolean;
  showLastSeen?: boolean;
  allowMessagesFrom?: 'everyone' | 'staff_and_classmates' | 'nobody';
  profileVisibility?: 'community' | 'class_only';
  lastActiveAt?: unknown;
  updatedAt?: unknown;
}

export interface SchoolCodeItem {
  id: string;
  code: string;
  label: string;
  roleHint: 'any' | 'student' | 'teacher' | 'alumni';
  active: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export type PostCategory = 'general' | 'academics' | 'sports' | 'clubs' | 'alumni';

export interface FeedPost {
  id: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  authorRole: string;
  caption?: string;
  content: string;
  mediaType?: 'text' | 'image' | 'video';
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  videoPublicId?: string;
  videoFormat?: string;
  videoDuration?: number;
  videoThumbnailUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
  category: PostCategory;
  likesCount: number;
  commentsCount: number;
  sharesCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface PostComment {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  content: string;
  parentCommentId?: string;
  replyToName?: string;
  likesCount?: number;
  edited?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface BookmarkItem {
  id: string;
  itemId: string;
  itemType: 'post' | 'announcement' | 'resource';
  title: string;
  summary?: string;
  authorName?: string;
  createdAt?: unknown;
}

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'seen';

export interface ConversationItem {
  id: string;
  title?: string;
  isGroup: boolean;
  participantIds: string[];
  participantNames?: Record<string, string>;
  participantAvatars?: Record<string, string>;
  lastMessage?: string;
  lastMessageSenderId?: string;
  lastMessageStatus?: 'sent' | 'delivered' | 'seen';
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ConversationParticipantItem {
  userId: string;
  conversationId: string;
  unreadCount: number;
  pinned?: boolean;
  archived?: boolean;
  typing?: boolean;
  typingUpdatedAt?: unknown;
  lastDeliveredAt?: unknown;
  lastReadAt?: unknown;
  joinedAt?: unknown;
}

export interface MessageItem {
  id: string;
  conversationId: string;
  senderId: string;
  senderName?: string;
  senderAvatarUrl?: string;
  text: string;
  mediaType?: 'text' | 'image' | 'video';
  imageUrl?: string;
  imageUrls?: string[];
  videoUrl?: string;
  videoPublicId?: string;
  videoFormat?: string;
  videoDuration?: number;
  videoThumbnailUrl?: string;
  replyToMessageId?: string;
  replyToSenderName?: string;
  replyToText?: string;
  forwarded?: boolean;
  edited?: boolean;
  deletedForEveryone?: boolean;
  deletedForIds?: string[];
  reactions?: Record<string, string>;
  status?: 'sent' | 'delivered' | 'seen';
  deliveredAt?: unknown;
  seenAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type GroupType = 'class' | 'subject' | 'sports' | 'club' | 'community';

export interface GroupItem {
  id: string;
  name: string;
  description: string;
  type: GroupType;
  avatarUrl?: string;
  privacy?: 'open' | 'approval_required';
  onlyAdminsCanMessage?: boolean;
  onlyAdminsCanEditInfo?: boolean;
  pinnedMessageId?: string;
  pinnedMessageText?: string;
  lastMessage?: string;
  lastMessageAt?: unknown;
  activeCallId?: string;
  activeCallType?: 'audio' | 'video';
  activeCallRoomName?: string;
  createdBy: string;
  memberCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GroupMemberItem {
  userId: string;
  groupId: string;
  memberName?: string;
  memberUsername?: string;
  memberAvatarUrl?: string;
  groupRole: 'admin' | 'moderator' | 'member';
  status?: 'active' | 'pending';
  typing?: boolean;
  unreadCount?: number;
  lastReadAt?: unknown;
  joinedAt?: unknown;
}

export interface GroupPostItem {
  id: string;
  groupId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  content: string;
  isAnnouncement: boolean;
  mediaType?: 'text' | 'image' | 'video';
  imageUrls?: string[];
  videoUrl?: string;
  videoPublicId?: string;
  videoFormat?: string;
  videoDuration?: number;
  videoThumbnailUrl?: string;
  replyToId?: string;
  replyToAuthorName?: string;
  replyToContent?: string;
  reactions?: Record<string, string>;
  edited?: boolean;
  deletedForEveryone?: boolean;
  readByIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AnnouncementCategory = 'general' | 'examination' | 'academic' | 'events' | 'important';

export interface AnnouncementItem {
  id: string;
  title: string;
  body: string;
  category: AnnouncementCategory;
  pinned: boolean;
  authorId: string;
  authorName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ResourceItem {
  id: string;
  title: string;
  description?: string;
  type: 'notes' | 'past_paper' | 'syllabus';
  subjectId: string;
  classId: string;
  fileUrl: string;
  uploadedBy: string;
  uploaderName?: string;
  createdAt?: unknown;
}

export interface AssignmentItem {
  id: string;
  title: string;
  description: string;
  subjectId: string;
  classId: string;
  dueDate: string;
  teacherId: string;
  teacherName?: string;
  createdAt?: unknown;
}

export interface TimetableSlotItem {
  id: string;
  kind: 'lesson' | 'exam';
  className: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacherName: string;
  room?: string;
  createdBy: string;
  createdAt?: unknown;
}

export interface SchoolEventItem {
  id: string;
  title: string;
  description?: string;
  category: 'academic' | 'exam' | 'sports' | 'club' | 'general';
  eventDate: string;
  location?: string;
  createdBy: string;
  createdAt?: unknown;
}

export interface PollItem {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  totalVotes: number;
  audience: 'all' | 'students' | 'staff' | 'alumni';
  closed: boolean;
  createdBy: string;
  creatorName: string;
  createdAt?: unknown;
}

export interface LostFoundItem {
  id: string;
  kind: 'lost' | 'found';
  title: string;
  description: string;
  location?: string;
  resolved: boolean;
  reporterId: string;
  reporterName: string;
  createdAt?: unknown;
}

export interface AchievementItem {
  id: string;
  title: string;
  recipientName: string;
  category: 'academic' | 'sports' | 'leadership' | 'competition' | 'community';
  description: string;
  awardedDate?: string;
  publishedBy: string;
  createdAt?: unknown;
}

export interface ReportItem {
  id: string;
  targetType: 'post' | 'comment' | 'user' | 'group';
  targetId: string;
  targetSummary?: string;
  reason: string;
  reporterId: string;
  reporterName: string;
  status: 'open' | 'reviewed' | 'resolved' | 'dismissed';
  reviewedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NotificationItem {
  id: string;
  userId: string;
  actorId?: string;
  kind?: 'message' | 'social' | 'announcement' | 'academic' | 'event' | 'group' | 'call';
  title: string;
  body: string;
  read: boolean;
  createdAt?: unknown;
}

export type CallScope = 'private' | 'group';
export type CallMediaType = 'audio' | 'video';
export type CallStatus = 'ringing' | 'active' | 'ended' | 'missed' | 'declined' | 'failed';

export interface CallSession {
  id: string;
  callId: string;
  roomName: string;
  scope: CallScope;
  callType: CallMediaType;
  conversationId?: string;
  groupId?: string;
  groupName?: string;
  callerId: string;
  callerName: string;
  callerAvatarUrl?: string;
  calleeId?: string;
  calleeName?: string;
  calleeAvatarUrl?: string;
  participantIds: string[];
  joinedIds: string[];
  declinedIds?: string[];
  status: CallStatus;
  startedAt?: unknown;
  endedAt?: unknown;
  durationSeconds?: number;
  endReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface FcmTokenRecord {
  token: string;
  platform: string;
  updatedAt?: unknown;
  createdAt?: unknown;
}

export interface ExamItem {
  id: string;
  title: string;
  term: string;
  year: string;
  published: boolean;
  createdBy: string;
  createdAt?: unknown;
}

export interface ResultItem {
  id: string;
  studentId: string;
  studentName?: string;
  examId: string;
  examTitle?: string;
  classId: string;
  subjectId: string;
  subjectName?: string;
  marks: number;
  grade: string;
  remarks?: string;
  published: boolean;
  recordedBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AiLearningLevel = 'simple' | 'form_1_2' | 'form_3_4' | 'form_5_6';
export type AiLanguagePref = 'auto' | 'en' | 'sw';
export type AiMessageRating = 'up' | 'down' | 'none';

export interface AiAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  previewUrl?: string;
  dataBase64?: string;
  textContent?: string;
}

export interface AiStoredAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface AiConversation {
  id: string;
  userId: string;
  title: string;
  learningLevel: AiLearningLevel;
  languagePref: AiLanguagePref;
  lastMessagePreview?: string;
  messageCount: number;
  pinned?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AiMessage {
  id: string;
  conversationId: string;
  userId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
  attachments?: AiStoredAttachment[];
  rating?: AiMessageRating;
  edited?: boolean;
  regenerated?: boolean;
  error?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type AiStructuredBlock =
  | {
      type: 'suggestions';
      items: string[];
    }
  | {
      type: 'actions';
      title?: string;
      items: Array<{ label: string; prompt: string }>;
    }
  | {
      type: 'steps';
      title: string;
      items: Array<{ step: number; title: string; detail: string; formula?: string }>;
    }
  | {
      type: 'accordion';
      title?: string;
      items: Array<{ heading: string; body: string }>;
    }
  | {
      type: 'flashcards';
      title: string;
      cards: Array<{ front: string; back: string; hint?: string }>;
    }
  | {
      type: 'quiz';
      title: string;
      questions: Array<{
        question: string;
        options: string[];
        correctIndex: number;
        explanation: string;
      }>;
    }
  | {
      type: 'checklist';
      title: string;
      items: Array<{ id: string; label: string; done?: boolean }>;
    }
  | {
      type: 'chart';
      kind: 'bar' | 'line' | 'pie';
      title: string;
      xLabel?: string;
      yLabel?: string;
      data: Array<{ label: string; value: number }>;
    }
  | {
      type: 'poll';
      question: string;
      options: string[];
    }
  | {
      type: 'study_card';
      subject: string;
      topic: string;
      summary: string;
      keyPoints: string[];
    }
  | {
      type: 'downloadable_file';
      filename: string;
      mimeType: string;
      content: string;
      description?: string;
    };

export const BRAND = {
  platformName: 'LUGA HUB',
  schoolName: 'MWANALUGALI SECONDARY SCHOOL',
  schoolShortName: 'Mwanalugali Secondary School',
  communityIdentity: 'LUGA BOYZ',
  tagline: 'One School. One Community. One Connection.',
  officialLogoUrl: '/luga-logo-enhanced.jpg',
  backupLogoUrl: '/luga-logo-original.jpg',
} as const;

export const VALID_SCHOOL_CODES = ['LUGA-2026', 'LUGABOYZ-2026', 'MWANALUGALI-2026'] as const;

export const BOOTSTRAPPED_ADMIN_EMAIL = 'jkambi00@gmail.com';
export const BOOTSTRAPPED_ADMIN_EMAILS = ['jkambi00@gmail.com', 'qbotmanager@gmail.com'] as const;

export const VALID_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,30}$/;

export const FIELD_LIMITS = {
  fullNameMin: 2,
  fullNameMax: 100,
  usernameMin: 3,
  usernameMax: 30,
  classOrDeptMin: 2,
  classOrDeptMax: 80,
  studentRegNoMax: 40,
  schoolRegCodeMin: 4,
  schoolRegCodeMax: 32,
  houseMax: 40,
  phoneMax: 30,
  bioMax: 300,
  avatarUrlMax: 500,
} as const;

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Administrator',
  school_admin: 'School Administrator',
  headmaster: 'Headmaster',
  teacher: 'Teacher',
  class_teacher: 'Class Teacher',
  class_monitor: 'Class Monitor',
  student: 'Student',
  alumni: 'Alumni',
};

export const REQUESTABLE_ROLE_OPTIONS: { value: RequestableRole; label: string; hint: string }[] = [
  { value: 'student', label: 'Student', hint: 'Current student at Mwanalugali Secondary School' },
  { value: 'class_monitor', label: 'Class Monitor', hint: 'Appointed class representative' },
  { value: 'teacher', label: 'Teacher', hint: 'Subject teacher & academic staff' },
  { value: 'class_teacher', label: 'Class Teacher', hint: 'Assigned stream class teacher' },
  { value: 'alumni', label: 'Alumni', hint: 'Former LUGA BOYZ graduate' },
];

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: [
    'Approve, suspend, and assign roles across all LUGA HUB accounts',
    'Create and deactivate Mwanalugali Secondary School registration codes',
    'Review moderation reports, manage groups, and audit platform activity',
    'Publish official announcements, academic results, and school schedules',
  ],
  school_admin: [
    'Approve pending registrations and manage member roles',
    'Create and manage school registration codes and schedules',
    'Moderate reported content and publish official announcements',
    'Manage academic examinations and resource libraries',
  ],
  headmaster: [
    'Publish pinned school-wide announcements and events',
    'Oversee academic results, timetables, and student achievements',
    'Review moderation reports and school community groups',
  ],
  teacher: [
    'Upload and edit subject examination results and assignments',
    'Share study notes, past papers, and syllabi',
    'Manage class timetables, events, and subject groups',
  ],
  class_teacher: [
    'Manage stream results, timetables, and class announcements',
    'Coordinate class groups and share academic resources',
    'Moderate class discussions and create polls',
  ],
  class_monitor: [
    'Coordinate class updates, events, and study polls',
    'Report lost & found items and share community updates',
    'Participate in all student and group modules',
  ],
  student: [
    'Share posts, videos, react, comment, bookmark, and join school groups',
    'Message classmates and teachers privately in real time',
    'View personal examination results, timetables, and study resources',
  ],
  alumni: [
    'Connect with LUGA BOYZ graduates and mentorship groups',
    'Share updates, vote in open polls, and stay informed on events',
    'Access alumni community messaging and announcements',
  ],
};

export function isAdminRole(role?: UserRole): boolean {
  return role === 'super_admin' || role === 'school_admin' || role === 'headmaster';
}

export function isStaffRole(role?: UserRole): boolean {
  return (
    role === 'super_admin' ||
    role === 'school_admin' ||
    role === 'headmaster' ||
    role === 'teacher' ||
    role === 'class_teacher'
  );
}

export function isPollCreatorRole(role?: UserRole): boolean {
  return isStaffRole(role) || role === 'class_monitor';
}

export function computeProfileCompletion(profile: UserProfile): {
  percentage: number;
  missing: string[];
} {
  const checks: { label: string; ok: boolean }[] = [
    { label: 'Full name', ok: Boolean(profile.fullName?.trim()) },
    { label: 'Username', ok: Boolean(profile.username?.trim()) },
    { label: 'Class / Dept', ok: Boolean(profile.classOrDept?.trim()) },
    { label: 'Profile photo', ok: Boolean(profile.avatarUrl?.trim()) },
    { label: 'Biography', ok: Boolean(profile.bio?.trim()) },
    { label: 'House / Dormitory', ok: Boolean(profile.house?.trim()) },
  ];
  const done = checks.filter((c) => c.ok).length;
  const percentage = Math.round((done / checks.length) * 100);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  return { percentage, missing };
}

export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    return (value as { seconds: number }).seconds * 1000;
  }
  return 0;
}

export function formatFirestoreDate(value: unknown): string {
  if (!value) return 'Just now';
  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === 'object' && value !== null && 'toDate' in value) {
    date = (value as { toDate: () => Date }).toDate();
  } else if (typeof value === 'object' && value !== null && 'seconds' in value) {
    date = new Date((value as { seconds: number }).seconds * 1000);
  }
  if (!date || Number.isNaN(date.getTime())) return 'Just now';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatTimeShort(value: unknown): string {
  const ms = toMillis(value);
  if (!ms) return '';
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDurationSeconds(sec?: number): string {
  if (!sec || sec <= 0) return '0:00';
  const total = Math.round(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}
