# LUGA HUB Security Specification

## 1. Data Invariants
1. **No Self-Assigned Privileged Roles**: During `/users/{userId}` creation, a non-admin user may only create a record with `role == 'student'` or `requestedRole in ['student', 'teacher', 'class_teacher', 'class_monitor', 'alumni']` and `status == 'pending'`. Only verified administrators (`super_admin`, `school_admin`, or bootstrapped admin email with `email_verified == true`) may approve accounts or assign `role`.
2. **PII Isolation (Split Collection)**: Private user PII (`email`, `studentRegNo`, `schoolRegCode`, `phone`) lives strictly in `/users/{userId}`, readable only by the document owner or administrators. Public community discovery uses `/userDirectory/{userId}` containing no PII and honoring user privacy flags (`showOnlineStatus`, `showLastSeen`, `allowMessagesFrom`, `profileVisibility`).
3. **Strict Result Confidentiality**: `/results/{resultId}` documents are readable only when `resource.data.studentId == request.auth.uid && resource.data.published == true` OR when the caller is an authorized educator/admin (`teacher`, `class_teacher`, `headmaster`, `school_admin`, `super_admin`).
4. **Private Messaging Isolation & Receipts**: `/conversations/{conversationId}/messages/{messageId}` can only be read or created if the caller exists in `/conversations/{conversationId}/participants/{request.auth.uid}`. Atomic batch conversation creation uses `getAfter(...)` so participant subcollection writes succeed only for the conversation creator. Message delivery/read status updates (`status`, `deliveredAt`, `seenAt`) are restricted strictly to non-sender participants (`existing().senderId != request.auth.uid`).
5. **Group Chat Governance & Admin Controls**: In `/groups/{groupId}`, non-admin active members cannot modify group info when `onlyAdminsCanEditInfo == true`, cannot send messages when `onlyAdminsCanMessage == true`, and cannot self-promote to `admin` or approve their own `pending` membership.
6. **Immutable Audit Trail**: `/auditLogs/{logId}` can only be created by administrators and can never be updated or deleted.
7. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
8. **Server Timestamps & Media Allowlisting**: `createdAt` and `updatedAt` must match `request.time`. All fields are strictly allowlisted via `keys().hasOnly(...)` including ImgBB image URLs and Cloudinary video metadata (`videoUrl`, `videoPublicId`, `videoFormat`, `videoDuration`, `videoThumbnailUrl`).

## 2. Adversarial Security Test Matrix
1. **Privilege Escalation on Registration**: Student sends `{ uid: caller, role: "super_admin", status: "approved", ... }` on `create /users/{caller}` -> DENIED.
2. **Role Self-Upgrade on Profile Edit**: Approved student sends `update /users/{caller}` changing `role` to `"teacher"` -> DENIED (`affectedKeys().hasOnly(...)` blocks `role` and `status`).
3. **Unverified Email Spoof**: Attacker signs in with unverified `email_verified: false` matching admin email -> DENIED (`email_verified == true` required).
4. **Cross-Student Result Scraping**: Student A calls `get /results/{resultOfStudentB}` or `list /results` without `studentId == auth.uid` -> DENIED.
5. **Unpublished Result Peek**: Student reads own result while `published == false` -> DENIED.
6. **Private Message Eavesdropping**: Non-participant reads `/conversations/{convId}/messages/{msgId}` -> DENIED.
7. **Shadow Field Injection**: User injects `{ isVerifiedAdmin: true }` into `/posts/{postId}` -> DENIED (`keys().hasOnly(...)`).
8. **ID Poisoning**: Attacker writes document with 1KB junk document ID -> DENIED (`isValidId` regex + max 128 chars).
9. **Author Spoofing**: User A creates a `/posts/{postId}` with `authorId: userB` -> DENIED (`authorId == request.auth.uid`).
10. **Audit Log Tampering**: Admin attempts `delete` or `update` on `/auditLogs/{logId}` -> DENIED (`allow update, delete: if false`).
11. **PII Blanket Read**: Student A attempts `list /users` or `get /users/{studentB}` -> DENIED.
12. **Client Timestamp Forgery**: User submits `createdAt` from year 2099 -> DENIED (`createdAt == request.time`).
13. **Admin-Only Group Posting Bypass**: Regular member attempts `create /groups/{groupId}/posts/{postId}` when `onlyAdminsCanMessage == true` -> DENIED.
14. **Self-Promotion in Group**: Group member updates `/groups/{groupId}/members/{caller}` changing `groupRole` to `'admin'` -> DENIED.
