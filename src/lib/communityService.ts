import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  updateDoc,
  where,
  writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  BookmarkItem,
  FeedPost,
  PostCategory,
  PostComment,
  ReportItem,
  SchoolCodeItem,
  toMillis,
} from '../types/luga';
import { db, handleFirestoreError, OperationType } from './firebase';

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export async function sendNotification(params: {
  userId: string;
  actorId: string;
  kind: 'message' | 'social' | 'announcement' | 'academic' | 'event' | 'group' | 'call';
  title: string;
  body: string;
}): Promise<void> {
  if (!params.userId || params.userId === params.actorId) return;
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'notifications', id), {
      userId: params.userId,
      actorId: params.actorId,
      kind: params.kind,
      title: params.title.slice(0, 140),
      body: params.body.slice(0, 400),
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch {
    // Do not block primary user workflow if notification delivery fails.
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'notifications', notificationId), { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `notifications/${notificationId}`);
  }
}

export async function markAllNotificationsRead(notificationIds: string[]): Promise<void> {
  if (notificationIds.length === 0) return;
  const batch = writeBatch(db);
  notificationIds.slice(0, 100).forEach((id) => {
    batch.update(doc(db, 'notifications', id), { read: true });
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'notifications');
  }
}

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------
export async function toggleBookmark(
  uid: string,
  item: {
    itemId: string;
    itemType: 'post' | 'announcement' | 'resource';
    title: string;
    summary?: string;
    authorName?: string;
  },
  currentlySaved: boolean
): Promise<void> {
  const bookmarkId = `${item.itemType}_${item.itemId}`;
  const ref = doc(db, 'users', uid, 'bookmarks', bookmarkId);
  try {
    if (currentlySaved) {
      await deleteDoc(ref);
    } else {
      const payload: Record<string, unknown> = {
        itemId: item.itemId,
        itemType: item.itemType,
        title: item.title.slice(0, 180),
        createdAt: serverTimestamp(),
      };
      if (item.summary) payload.summary = item.summary.slice(0, 400);
      if (item.authorName) payload.authorName = item.authorName.slice(0, 100);
      await setDoc(ref, payload);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${uid}/bookmarks/${bookmarkId}`);
  }
}

export async function fetchBookmarks(uid: string): Promise<BookmarkItem[]> {
  try {
    const q = query(
      collection(db, 'users', uid, 'bookmarks'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<BookmarkItem, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `users/${uid}/bookmarks`);
  }
}

// ---------------------------------------------------------------------------
// Posts, Reels, Likes, Comments, Pagination
// ---------------------------------------------------------------------------
export async function fetchPostsPage(params: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot | null;
  category?: 'all' | PostCategory;
}): Promise<{ posts: FeedPost[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const size = params.pageSize ?? 12;
  try {
    if (params.category && params.category !== 'all') {
      // Single-field where query avoids unindexed composite where+orderBy errors.
      const q = query(
        collection(db, 'posts'),
        where('category', '==', params.category),
        limit(80)
      );
      const snap = await getDocs(q);
      const posts = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FeedPost, 'id'>),
        }))
        .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      return {
        posts,
        lastDoc: null,
        hasMore: false,
      };
    }

    const constraints = [orderBy('createdAt', 'desc'), ...(params.cursor ? [startAfter(params.cursor)] : []), limit(size + 1)];
    const q = query(collection(db, 'posts'), ...constraints);
    const snap = await getDocs(q);
    const hasMore = snap.docs.length > size;
    const docsSlice = hasMore ? snap.docs.slice(0, size) : snap.docs;
    const posts = docsSlice.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<FeedPost, 'id'>),
    }));
    return {
      posts,
      lastDoc: docsSlice.length > 0 ? docsSlice[docsSlice.length - 1] : null,
      hasMore,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export function isEligibleReelPost(post: FeedPost): boolean {
  const hasVideo = Boolean(post.videoUrl && post.videoUrl.trim().length > 0);
  const hasImages =
    Boolean(post.imageUrl && post.imageUrl.trim().length > 0) ||
    (Array.isArray(post.imageUrls) && post.imageUrls.some((u) => Boolean(u && u.trim())));
  return hasVideo || hasImages;
}

export async function fetchReelsPage(params?: {
  pageSize?: number;
  cursor?: QueryDocumentSnapshot | null;
}): Promise<{ posts: FeedPost[]; lastDoc: QueryDocumentSnapshot | null; hasMore: boolean }> {
  const targetCount = params?.pageSize ?? 10;
  let currentCursor = params?.cursor ?? null;
  const collected: FeedPost[] = [];
  let hasMore = true;
  let safetyLoops = 0;

  try {
    while (collected.length < targetCount && hasMore && safetyLoops < 5) {
      safetyLoops += 1;
      const batchLimit = Math.max(15, targetCount * 2);
      const constraints = [
        orderBy('createdAt', 'desc'),
        ...(currentCursor ? [startAfter(currentCursor)] : []),
        limit(batchLimit),
      ];
      const snap = await getDocs(query(collection(db, 'posts'), ...constraints));
      if (snap.empty) {
        hasMore = false;
        break;
      }

      for (const d of snap.docs) {
        const post = { id: d.id, ...(d.data() as Omit<FeedPost, 'id'>) };
        currentCursor = d;
        if (isEligibleReelPost(post)) {
          collected.push(post);
          if (collected.length >= targetCount) break;
        }
      }

      if (snap.docs.length < batchLimit) {
        hasMore = false;
      }
    }

    return {
      posts: collected,
      lastDoc: currentCursor,
      hasMore,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export async function fetchUserPosts(uid: string, maxItems = 40): Promise<FeedPost[]> {
  try {
    const q = query(collection(db, 'posts'), where('authorId', '==', uid), limit(maxItems));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<FeedPost, 'id'>) }))
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'posts');
  }
}

export interface CreatePostPayload {
  authorId: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
  authorRole: string;
  caption?: string;
  content: string;
  category: PostCategory;
  mediaType?: 'text' | 'image' | 'video';
  imageUrls?: string[];
  videoUrl?: string;
  videoPublicId?: string;
  videoFormat?: string;
  videoDuration?: number;
  videoThumbnailUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
}

export async function createCommunityPost(params: CreatePostPayload): Promise<string> {
  const postId = `post_${Date.now()}_${params.authorId.slice(0, 6)}`;
  const cleanImages = (params.imageUrls || [])
    .map((u) => u.trim())
    .filter(Boolean)
    .slice(0, 6);

  const detectedMediaType: 'text' | 'image' | 'video' =
    params.mediaType ||
    (params.videoUrl?.trim() ? 'video' : cleanImages.length > 0 ? 'image' : 'text');

  const fallbackContent =
    params.content.trim() ||
    params.caption?.trim() ||
    (detectedMediaType === 'video' ? 'Shared a video' : 'Shared a photo');

  const payload: Record<string, unknown> = {
    authorId: params.authorId,
    authorName: params.authorName.slice(0, 100),
    authorRole: params.authorRole.slice(0, 40),
    content: fallbackContent.slice(0, 2000),
    mediaType: detectedMediaType,
    category: params.category,
    likesCount: 0,
    commentsCount: 0,
    sharesCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.authorUsername?.trim()) {
    payload.authorUsername = params.authorUsername.trim().slice(0, 30);
  }
  if (params.authorAvatarUrl?.trim()) {
    payload.authorAvatarUrl = params.authorAvatarUrl.trim().slice(0, 500);
  }
  if (params.caption?.trim()) {
    payload.caption = params.caption.trim().slice(0, 200);
  }
  if (cleanImages.length > 0) {
    payload.imageUrl = cleanImages[0].slice(0, 500);
    payload.imageUrls = cleanImages.map((u) => u.slice(0, 500));
  }
  if (params.videoUrl?.trim()) {
    payload.videoUrl = params.videoUrl.trim().slice(0, 600);
    if (params.videoPublicId) payload.videoPublicId = params.videoPublicId.slice(0, 240);
    if (params.videoFormat) payload.videoFormat = params.videoFormat.slice(0, 20);
    if (typeof params.videoDuration === 'number' && !Number.isNaN(params.videoDuration)) {
      payload.videoDuration = Math.round(params.videoDuration * 10) / 10;
    }
    if (params.videoThumbnailUrl) {
      payload.videoThumbnailUrl = params.videoThumbnailUrl.slice(0, 600);
    }
    if (typeof params.videoWidth === 'number') payload.videoWidth = Math.round(params.videoWidth);
    if (typeof params.videoHeight === 'number') payload.videoHeight = Math.round(params.videoHeight);
  }

  try {
    await setDoc(doc(db, 'posts', postId), payload);
    return postId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${postId}`);
  }
}

export async function updateCommunityPost(
  postId: string,
  updates: {
    caption?: string;
    content: string;
    category: PostCategory;
    imageUrls?: string[];
  }
): Promise<void> {
  const payload: Record<string, unknown> = {
    content: updates.content.trim().slice(0, 2000),
    category: updates.category,
    updatedAt: serverTimestamp(),
  };
  if (updates.caption !== undefined) {
    payload.caption = updates.caption.trim().slice(0, 200);
  }
  if (updates.imageUrls !== undefined) {
    const cleanImages = updates.imageUrls.map((u) => u.trim()).filter(Boolean).slice(0, 6);
    payload.imageUrls = cleanImages;
    if (cleanImages[0]) {
      payload.imageUrl = cleanImages[0].slice(0, 500);
    }
  }
  try {
    await updateDoc(doc(db, 'posts', postId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}`);
  }
}

export async function deleteCommunityPost(postId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'posts', postId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${postId}`);
  }
}

export async function incrementPostShareCount(post: FeedPost): Promise<void> {
  try {
    await updateDoc(doc(db, 'posts', post.id), {
      sharesCount: (post.sharesCount || 0) + 1,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-critical telemetry increment
  }
}

export async function togglePostLike(
  post: FeedPost,
  uid: string,
  actorName: string
): Promise<boolean> {
  const likeRef = doc(db, 'posts', post.id, 'likes', uid);
  const postRef = doc(db, 'posts', post.id);
  try {
    const existingLike = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (existingLike.exists()) {
      batch.delete(likeRef);
      batch.update(postRef, {
        likesCount: Math.max(0, (post.likesCount || 0) - 1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(likeRef, {
        userId: uid,
        postId: post.id,
        createdAt: serverTimestamp(),
      });
      batch.update(postRef, {
        likesCount: (post.likesCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      await sendNotification({
        userId: post.authorId,
        actorId: uid,
        kind: 'social',
        title: 'New reaction on your post',
        body: `${actorName} liked your post: "${(post.caption || post.content).slice(0, 60)}"`,
      });
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${post.id}/likes/${uid}`);
  }
}

export async function fetchPostComments(postId: string): Promise<PostComment[]> {
  try {
    const q = query(
      collection(db, 'posts', postId, 'comments'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<PostComment, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `posts/${postId}/comments`);
  }
}

export async function addPostComment(
  post: FeedPost,
  author: {
    uid: string;
    fullName: string;
    username?: string;
    avatarUrl?: string;
  },
  content: string,
  replyTo?: { parentCommentId: string; replyToName: string }
): Promise<PostComment> {
  const commentId = `cmt_${Date.now()}_${author.uid.slice(0, 6)}`;
  const cleanContent = content.trim().slice(0, 800);
  const payload: Record<string, unknown> = {
    postId: post.id,
    authorId: author.uid,
    authorName: author.fullName.slice(0, 100),
    content: cleanContent,
    likesCount: 0,
    edited: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (author.username?.trim()) payload.authorUsername = author.username.trim().slice(0, 30);
  if (author.avatarUrl?.trim()) payload.authorAvatarUrl = author.avatarUrl.trim().slice(0, 500);
  if (replyTo) {
    payload.parentCommentId = replyTo.parentCommentId;
    payload.replyToName = replyTo.replyToName.slice(0, 100);
  }

  const batch = writeBatch(db);
  batch.set(doc(db, 'posts', post.id, 'comments', commentId), payload);
  batch.update(doc(db, 'posts', post.id), {
    commentsCount: (post.commentsCount || 0) + 1,
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
    await sendNotification({
      userId: post.authorId,
      actorId: author.uid,
      kind: 'social',
      title: `${author.fullName} commented on your post`,
      body: cleanContent.slice(0, 120),
    });
    return {
      id: commentId,
      postId: post.id,
      authorId: author.uid,
      authorName: author.fullName,
      authorUsername: author.username,
      authorAvatarUrl: author.avatarUrl,
      content: cleanContent,
      parentCommentId: replyTo?.parentCommentId,
      replyToName: replyTo?.replyToName,
      likesCount: 0,
      edited: false,
      createdAt: new Date(),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `posts/${post.id}/comments/${commentId}`);
  }
}

export async function editPostComment(
  postId: string,
  commentId: string,
  content: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'posts', postId, 'comments', commentId), {
      content: content.trim().slice(0, 800),
      edited: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `posts/${postId}/comments/${commentId}`);
  }
}

export async function deletePostComment(post: FeedPost, commentId: string): Promise<void> {
  const batch = writeBatch(db);
  batch.delete(doc(db, 'posts', post.id, 'comments', commentId));
  batch.update(doc(db, 'posts', post.id), {
    commentsCount: Math.max(0, (post.commentsCount || 1) - 1),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `posts/${post.id}/comments/${commentId}`);
  }
}

export async function toggleCommentLike(
  postId: string,
  comment: PostComment,
  uid: string
): Promise<boolean> {
  const likeRef = doc(db, 'posts', postId, 'comments', comment.id, 'likes', uid);
  const cmtRef = doc(db, 'posts', postId, 'comments', comment.id);
  try {
    const snap = await getDoc(likeRef);
    const batch = writeBatch(db);
    if (snap.exists()) {
      batch.delete(likeRef);
      batch.update(cmtRef, {
        likesCount: Math.max(0, (comment.likesCount || 0) - 1),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return false;
    } else {
      batch.set(likeRef, {
        userId: uid,
        commentId: comment.id,
        postId,
        createdAt: serverTimestamp(),
      });
      batch.update(cmtRef, {
        likesCount: (comment.likesCount || 0) + 1,
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return true;
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `posts/${postId}/comments/${comment.id}/likes/${uid}`);
  }
}

// ---------------------------------------------------------------------------
// School Registration Codes (Admin)
// ---------------------------------------------------------------------------
export async function createSchoolCode(params: {
  code: string;
  label: string;
  roleHint: SchoolCodeItem['roleHint'];
  actorUid: string;
}): Promise<void> {
  const normalized = params.code.trim().toUpperCase().slice(0, 32);
  const codeId = normalized.replace(/[^a-zA-Z0-9_-]/g, '_');
  const batch = writeBatch(db);
  batch.set(doc(db, 'schoolCodes', codeId), {
    code: normalized,
    label: params.label.trim().slice(0, 80),
    roleHint: params.roleHint,
    active: true,
    createdBy: params.actorUid,
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, 'auditLogs', `log_${Date.now()}_${codeId.slice(0, 8)}`), {
    actorId: params.actorUid,
    action: 'create_school_code',
    targetType: 'schoolCode',
    targetId: codeId,
    details: `Created code ${normalized} (${params.label})`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `schoolCodes/${codeId}`);
  }
}

export async function toggleSchoolCodeActive(
  item: SchoolCodeItem,
  actorUid: string
): Promise<void> {
  try {
    await updateDoc(doc(db, 'schoolCodes', item.id), {
      active: !item.active,
    });
    await setDoc(doc(db, 'auditLogs', `log_${Date.now()}_${item.id.slice(0, 8)}`), {
      actorId: actorUid,
      action: item.active ? 'deactivate_school_code' : 'activate_school_code',
      targetType: 'schoolCode',
      targetId: item.id,
      details: `Toggled ${item.code} active=${!item.active}`,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `schoolCodes/${item.id}`);
  }
}

// ---------------------------------------------------------------------------
// Reporting & Moderation
// ---------------------------------------------------------------------------
export async function submitModerationReport(params: {
  targetType: ReportItem['targetType'];
  targetId: string;
  targetSummary: string;
  reason: string;
  reporterId: string;
  reporterName: string;
}): Promise<void> {
  const reportId = `rep_${Date.now()}_${params.reporterId.slice(0, 6)}`;
  try {
    await setDoc(doc(db, 'reports', reportId), {
      targetType: params.targetType,
      targetId: params.targetId,
      targetSummary: params.targetSummary.slice(0, 240),
      reason: params.reason.trim().slice(0, 400),
      reporterId: params.reporterId,
      reporterName: params.reporterName.slice(0, 100),
      status: 'open',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `reports/${reportId}`);
  }
}

export async function resolveModerationReport(params: {
  report: ReportItem;
  newStatus: ReportItem['status'];
  actorUid: string;
  deleteTargetPost?: boolean;
}): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'reports', params.report.id), {
    status: params.newStatus,
    reviewedBy: params.actorUid,
    updatedAt: serverTimestamp(),
  });
  if (params.deleteTargetPost && params.report.targetType === 'post') {
    batch.delete(doc(db, 'posts', params.report.targetId));
  }
  batch.set(doc(db, 'auditLogs', `log_${Date.now()}_${params.report.id.slice(0, 8)}`), {
    actorId: params.actorUid,
    action: 'review_report',
    targetType: 'report',
    targetId: params.report.id,
    details: `Status=${params.newStatus}, target=${params.report.targetType}:${params.report.targetId}`,
    createdAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${params.report.id}`);
  }
}
