import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  AccountStatus,
  BOOTSTRAPPED_ADMIN_EMAILS,
  DEFAULT_PRIVACY_SETTINGS,
  FIELD_LIMITS,
  isStaffRole,
  PrivacySettings,
  RequestableRole,
  SchoolCodeItem,
  USERNAME_REGEX,
  UserDirectoryEntry,
  UserProfile,
  UserRole,
  VALID_ID_REGEX,
  VALID_SCHOOL_CODES,
} from '../types/luga';
import { db, handleFirestoreError, OperationType } from './firebase';

export interface RegistrationPayload {
  fullName: string;
  username: string;
  requestedRole: RequestableRole;
  classOrDept: string;
  studentRegNo?: string;
  schoolRegCode: string;
  house?: string;
  phone?: string;
  bio?: string;
}

export interface ProfileUpdatePayload {
  fullName: string;
  username: string;
  classOrDept: string;
  studentRegNo?: string;
  house?: string;
  phone?: string;
  bio?: string;
}

function clampText(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

export function resolvePrivacy(profile?: Partial<UserProfile> | null): PrivacySettings {
  return {
    ...DEFAULT_PRIVACY_SETTINGS,
    ...(profile?.privacy || {}),
  };
}

export function canMessageMember(
  viewer: UserProfile | null,
  target: UserDirectoryEntry
): { allowed: boolean; reason?: string } {
  if (!viewer) return { allowed: false, reason: 'Sign in required.' };
  if (viewer.uid === target.uid) return { allowed: false, reason: 'Cannot message yourself.' };

  const policy = target.allowMessagesFrom ?? 'everyone';
  if (policy === 'everyone') return { allowed: true };
  if (policy === 'nobody') {
    if (viewer.role === 'super_admin' || viewer.role === 'school_admin') {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `${target.fullName} has restricted incoming direct messages.`,
    };
  }
  if (policy === 'staff_and_classmates') {
    const sameClass =
      viewer.classOrDept.trim().toLowerCase() === target.classOrDept.trim().toLowerCase();
    if (isStaffRole(viewer.role) || sameClass) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: `${target.fullName} only accepts messages from teachers and classmates (${target.classOrDept}).`,
    };
  }
  return { allowed: true };
}

export function canViewFullProfile(
  viewer: UserProfile | null,
  target: UserDirectoryEntry
): boolean {
  if (!viewer) return false;
  if (viewer.uid === target.uid || isStaffRole(viewer.role)) return true;
  if (target.profileVisibility === 'class_only') {
    return viewer.classOrDept.trim().toLowerCase() === target.classOrDept.trim().toLowerCase();
  }
  return true;
}

export function validateRegistrationInput(input: RegistrationPayload): string | null {
  const fullName = input.fullName.trim();
  const username = input.username.trim();
  const classOrDept = input.classOrDept.trim();
  const schoolRegCode = input.schoolRegCode.trim().toUpperCase();

  if (fullName.length < FIELD_LIMITS.fullNameMin || fullName.length > FIELD_LIMITS.fullNameMax) {
    return `Full name must be between ${FIELD_LIMITS.fullNameMin} and ${FIELD_LIMITS.fullNameMax} characters.`;
  }
  if (!USERNAME_REGEX.test(username)) {
    return 'Username must be 3–30 characters using only letters, numbers, and underscores.';
  }
  if (classOrDept.length < FIELD_LIMITS.classOrDeptMin || classOrDept.length > FIELD_LIMITS.classOrDeptMax) {
    return `Class or department must be between ${FIELD_LIMITS.classOrDeptMin} and ${FIELD_LIMITS.classOrDeptMax} characters.`;
  }
  if (
    schoolRegCode.length < FIELD_LIMITS.schoolRegCodeMin ||
    schoolRegCode.length > FIELD_LIMITS.schoolRegCodeMax
  ) {
    return 'Please enter a valid Mwanalugali Secondary School registration code.';
  }
  if (input.studentRegNo && input.studentRegNo.trim().length > FIELD_LIMITS.studentRegNoMax) {
    return `Student registration number cannot exceed ${FIELD_LIMITS.studentRegNoMax} characters.`;
  }
  return null;
}

async function verifySchoolRegistrationCode(rawCode: string): Promise<boolean> {
  const normalized = rawCode.trim().toUpperCase();
  if (VALID_SCHOOL_CODES.includes(normalized as (typeof VALID_SCHOOL_CODES)[number])) {
    return true;
  }
  try {
    const codeDocId = normalized.replace(/[^a-zA-Z0-9_-]/g, '_');
    const snap = await getDoc(doc(db, 'schoolCodes', codeDocId));
    if (snap.exists()) {
      const data = snap.data() as SchoolCodeItem;
      return data.active === true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function createUserProfileRecord(
  firebaseUser: User,
  input: RegistrationPayload
): Promise<void> {
  if (!VALID_ID_REGEX.test(firebaseUser.uid)) {
    throw new Error('Invalid user identifier.');
  }
  if (!firebaseUser.email || !firebaseUser.emailVerified) {
    throw new Error('A verified email address is required to register on LUGA HUB.');
  }

  const validationError = validateRegistrationInput(input);
  if (validationError) {
    throw new Error(validationError);
  }

  const codeValid = await verifySchoolRegistrationCode(input.schoolRegCode);
  if (!codeValid) {
    throw new Error(
      'Invalid or inactive school registration code. Contact your administrator (default: LUGA-2026).'
    );
  }

  const isBootstrappedAdmin = (BOOTSTRAPPED_ADMIN_EMAILS as readonly string[]).includes(
    firebaseUser.email.toLowerCase()
  );
  const assignedRole: UserRole = isBootstrappedAdmin ? 'super_admin' : 'student';
  const assignedStatus: AccountStatus = isBootstrappedAdmin ? 'approved' : 'pending';

  const fullName = clampText(input.fullName, FIELD_LIMITS.fullNameMax);
  const username = clampText(input.username, FIELD_LIMITS.usernameMax);
  const classOrDept = clampText(input.classOrDept, FIELD_LIMITS.classOrDeptMax);
  const schoolRegCode = clampText(input.schoolRegCode.toUpperCase(), FIELD_LIMITS.schoolRegCodeMax);
  const bio = clampText(input.bio || '', FIELD_LIMITS.bioMax);
  const house = clampText(input.house || '', FIELD_LIMITS.houseMax);
  const phone = clampText(input.phone || '', FIELD_LIMITS.phoneMax);
  const studentRegNo = clampText(input.studentRegNo || '', FIELD_LIMITS.studentRegNoMax);
  const avatarUrl = clampText(firebaseUser.photoURL || '', FIELD_LIMITS.avatarUrlMax);

  const privateDoc: Record<string, unknown> = {
    uid: firebaseUser.uid,
    fullName,
    username,
    email: firebaseUser.email,
    role: assignedRole,
    requestedRole: input.requestedRole,
    status: assignedStatus,
    classOrDept,
    schoolRegCode,
    privacy: DEFAULT_PRIVACY_SETTINGS,
    lastActiveAt: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (studentRegNo) privateDoc.studentRegNo = studentRegNo;
  if (house) privateDoc.house = house;
  if (phone) privateDoc.phone = phone;
  if (bio) privateDoc.bio = bio;
  if (avatarUrl) privateDoc.avatarUrl = avatarUrl;

  const directoryDoc: Record<string, unknown> = {
    uid: firebaseUser.uid,
    fullName,
    username,
    role: assignedRole,
    status: assignedStatus,
    classOrDept,
    isOnline: assignedStatus === 'approved',
    showOnlineStatus: true,
    showLastSeen: true,
    allowMessagesFrom: 'everyone',
    profileVisibility: 'community',
    lastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (bio) directoryDoc.bio = bio;
  if (avatarUrl) directoryDoc.avatarUrl = avatarUrl;

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', firebaseUser.uid), privateDoc);
  batch.set(doc(db, 'userDirectory', firebaseUser.uid), directoryDoc);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${firebaseUser.uid}`);
  }
}

export async function updateOwnUserProfile(
  uid: string,
  currentProfile: UserProfile,
  updates: ProfileUpdatePayload
): Promise<void> {
  const fullName = clampText(updates.fullName, FIELD_LIMITS.fullNameMax);
  const username = clampText(updates.username, FIELD_LIMITS.usernameMax);
  const classOrDept = clampText(updates.classOrDept, FIELD_LIMITS.classOrDeptMax);
  const studentRegNo = clampText(updates.studentRegNo || '', FIELD_LIMITS.studentRegNoMax);
  const house = clampText(updates.house || '', FIELD_LIMITS.houseMax);
  const phone = clampText(updates.phone || '', FIELD_LIMITS.phoneMax);
  const bio = clampText(updates.bio || '', FIELD_LIMITS.bioMax);

  if (fullName.length < FIELD_LIMITS.fullNameMin) {
    throw new Error(`Full name must be at least ${FIELD_LIMITS.fullNameMin} characters.`);
  }
  if (!USERNAME_REGEX.test(username)) {
    throw new Error('Username must be 3–30 characters (letters, numbers, underscores).');
  }
  if (classOrDept.length < FIELD_LIMITS.classOrDeptMin) {
    throw new Error(`Class or department must be at least ${FIELD_LIMITS.classOrDeptMin} characters.`);
  }

  const privacy = resolvePrivacy(currentProfile);
  const nextPrivate: Record<string, unknown> = {
    uid: currentProfile.uid,
    fullName,
    username,
    email: currentProfile.email,
    role: currentProfile.role,
    status: currentProfile.status,
    classOrDept,
    schoolRegCode: currentProfile.schoolRegCode,
    privacy,
    lastActiveAt: serverTimestamp(),
    createdAt: currentProfile.createdAt,
    updatedAt: serverTimestamp(),
  };
  if (currentProfile.requestedRole) nextPrivate.requestedRole = currentProfile.requestedRole;
  if (studentRegNo) nextPrivate.studentRegNo = studentRegNo;
  if (house) nextPrivate.house = house;
  if (phone) nextPrivate.phone = phone;
  if (bio) nextPrivate.bio = bio;
  if (currentProfile.avatarUrl) nextPrivate.avatarUrl = currentProfile.avatarUrl;
  if (currentProfile.coverUrl) nextPrivate.coverUrl = currentProfile.coverUrl;

  const nextDirectory: Record<string, unknown> = {
    uid: currentProfile.uid,
    fullName,
    username,
    role: currentProfile.role,
    status: currentProfile.status,
    classOrDept,
    isOnline: privacy.showOnlineStatus,
    showOnlineStatus: privacy.showOnlineStatus,
    showLastSeen: privacy.showLastSeen,
    allowMessagesFrom: privacy.allowMessagesFrom,
    profileVisibility: privacy.profileVisibility,
    lastActiveAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (bio) nextDirectory.bio = bio;
  if (currentProfile.avatarUrl) nextDirectory.avatarUrl = currentProfile.avatarUrl;
  if (currentProfile.coverUrl) nextDirectory.coverUrl = currentProfile.coverUrl;

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), nextPrivate);
  batch.set(doc(db, 'userDirectory', uid), nextDirectory);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updateProfileMedia(
  uid: string,
  media: { avatarUrl?: string; coverUrl?: string }
): Promise<void> {
  const privatePatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };
  const directoryPatch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (media.avatarUrl !== undefined) {
    const clean = media.avatarUrl.trim().slice(0, FIELD_LIMITS.avatarUrlMax);
    privatePatch.avatarUrl = clean;
    directoryPatch.avatarUrl = clean;
  }
  if (media.coverUrl !== undefined) {
    const clean = media.coverUrl.trim().slice(0, FIELD_LIMITS.avatarUrlMax);
    privatePatch.coverUrl = clean;
    directoryPatch.coverUrl = clean;
  }

  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), privatePatch);
  batch.update(doc(db, 'userDirectory', uid), directoryPatch);

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function updatePrivacySettings(
  uid: string,
  privacy: PrivacySettings
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', uid), {
    privacy,
    updatedAt: serverTimestamp(),
  });
  batch.update(doc(db, 'userDirectory', uid), {
    isOnline: privacy.showOnlineStatus,
    showOnlineStatus: privacy.showOnlineStatus,
    showLastSeen: privacy.showLastSeen,
    allowMessagesFrom: privacy.allowMessagesFrom,
    profileVisibility: privacy.profileVisibility,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
  }
}

export async function setUserOnlinePresence(
  uid: string,
  isOnline: boolean,
  showOnlineStatus = true
): Promise<void> {
  try {
    await updateDoc(doc(db, 'userDirectory', uid), {
      isOnline: showOnlineStatus ? isOnline : false,
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore non-critical presence sync if directory record hasn't synced yet.
  }
}

export async function touchUserLastActive(uid: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'userDirectory', uid), {
      lastActiveAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Ignore non-critical heartbeat.
  }
}

export async function fetchSchoolDirectory(maxItems = 80): Promise<UserDirectoryEntry[]> {
  try {
    const q = query(
      collection(db, 'userDirectory'),
      orderBy('updatedAt', 'desc'),
      limit(maxItems)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as UserDirectoryEntry);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'userDirectory');
  }
}

export async function adminUpdateMemberRoleAndStatus(
  actorUid: string,
  targetUid: string,
  newRole: UserRole,
  newStatus: AccountStatus
): Promise<void> {
  try {
    const targetSnap = await getDoc(doc(db, 'users', targetUid));
    if (!targetSnap.exists()) {
      throw new Error('Target user record not found.');
    }
    const existing = targetSnap.data() as UserProfile;
    const privacy = resolvePrivacy(existing);

    const updatedPrivate: Record<string, unknown> = {
      ...existing,
      role: newRole,
      status: newStatus,
      updatedAt: serverTimestamp(),
    };

    const updatedDirectory: Record<string, unknown> = {
      uid: existing.uid,
      fullName: existing.fullName,
      username: existing.username,
      role: newRole,
      status: newStatus,
      classOrDept: existing.classOrDept,
      showOnlineStatus: privacy.showOnlineStatus,
      showLastSeen: privacy.showLastSeen,
      allowMessagesFrom: privacy.allowMessagesFrom,
      profileVisibility: privacy.profileVisibility,
      updatedAt: serverTimestamp(),
    };
    if (existing.bio) updatedDirectory.bio = existing.bio;
    if (existing.avatarUrl) updatedDirectory.avatarUrl = existing.avatarUrl;
    if (existing.coverUrl) updatedDirectory.coverUrl = existing.coverUrl;
    if (existing.lastActiveAt) updatedDirectory.lastActiveAt = existing.lastActiveAt;

    const logId = `log_${Date.now()}_${targetUid.slice(0, 8)}`;
    const notifId = `notif_${Date.now()}_${targetUid.slice(0, 8)}`;
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', targetUid), updatedPrivate);
    batch.set(doc(db, 'userDirectory', targetUid), updatedDirectory);
    batch.set(doc(db, 'auditLogs', logId), {
      actorId: actorUid,
      action: 'update_member_access',
      targetType: 'user',
      targetId: targetUid,
      details: `Set role=${newRole}, status=${newStatus}`,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, 'notifications', notifId), {
      userId: targetUid,
      actorId: actorUid,
      kind: 'academic',
      title: newStatus === 'approved' ? 'Account Approved on LUGA HUB' : 'Account Status Updated',
      body: `Your LUGA HUB access status is now ${newStatus} (${newRole}).`,
      read: false,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}
