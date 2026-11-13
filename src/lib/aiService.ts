import {
  collection,
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
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import {
  AiAttachment,
  AiConversation,
  AiMessage,
  AiStoredAttachment,
  toMillis,
} from '../types/luga';

export const PRIMARY_AI_CONV_ID = 'luga_ai_main';

export const LUGA_AI_IDENTITY = {
  id: 'luga_ai_official',
  name: 'LUGA AI',
} as const;

export interface AiQuotaSnapshot {
  dayKey: string;
  usedToday: number;
  dailyLimit: number;
  remainingToday: number;
  burstLimitPerMinute: number;
  recentCount: number;
}

export interface AiStatusResponse {
  configured: boolean;
  maxAttachmentBytes: number;
  allowedMimeTypes: string[];
  quota: AiQuotaSnapshot;
}

const MAX_AI_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export function listenAiConversations(
  uid: string,
  onUpdate: (conversations: AiConversation[]) => void
) {
  const q = query(
    collection(db, 'users', uid, 'aiConversations'),
    orderBy('updatedAt', 'desc'),
    limit(20)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<AiConversation, 'id'>),
        }))
        .sort((a, b) => {
          // Prefer existing non-empty or primary conversation first so history is preserved
          if (a.id === PRIMARY_AI_CONV_ID && b.id !== PRIMARY_AI_CONV_ID && (a.messageCount || 0) >= (b.messageCount || 0)) {
            return -1;
          }
          if (b.id === PRIMARY_AI_CONV_ID && a.id !== PRIMARY_AI_CONV_ID && (b.messageCount || 0) >= (a.messageCount || 0)) {
            return 1;
          }
          return toMillis(b.updatedAt) - toMillis(a.updatedAt);
        });
      onUpdate(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/aiConversations`)
  );
}

export function pickPrimaryAiConversation(conversations: AiConversation[]): AiConversation | null {
  if (conversations.length === 0) return null;
  const primary = conversations.find((c) => c.id === PRIMARY_AI_CONV_ID);
  const withHistory = conversations.find((c) => (c.messageCount || 0) > 0);
  if (primary && (primary.messageCount || 0) > 0) return primary;
  if (withHistory) return withHistory;
  return primary || conversations[0];
}

export async function ensurePrimaryAiConversation(uid: string): Promise<string> {
  const ref = doc(db, 'users', uid, 'aiConversations', PRIMARY_AI_CONV_ID);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        userId: uid,
        title: 'LUGA AI',
        learningLevel: 'form_3_4',
        languagePref: 'auto',
        lastMessagePreview: 'Chat with LUGA AI',
        messageCount: 0,
        pinned: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return PRIMARY_AI_CONV_ID;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.CREATE,
      `users/${uid}/aiConversations/${PRIMARY_AI_CONV_ID}`
    );
  }
}

export function listenAiMessages(
  uid: string,
  convId: string,
  onUpdate: (messages: AiMessage[]) => void
) {
  const q = query(
    collection(db, 'users', uid, 'aiConversations', convId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(150)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AiMessage, 'id'>),
      }));
      onUpdate(list);
    },
    (err) =>
      handleFirestoreError(
        err,
        OperationType.LIST,
        `users/${uid}/aiConversations/${convId}/messages`
      )
  );
}

export async function saveUserAiMessage(opts: {
  uid: string;
  convId: string;
  content: string;
  attachments?: AiAttachment[];
  currentMessageCount?: number;
  messageId?: string;
}): Promise<string> {
  const msgId = opts.messageId || `aimsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const storedAttachments: AiStoredAttachment[] = (opts.attachments || []).slice(0, 4).map((a) => ({
    id: a.id,
    name: a.name.slice(0, 120),
    mimeType: a.mimeType.slice(0, 80),
    sizeBytes: a.sizeBytes,
  }));

  const safeContent = (opts.content.trim() || '[Attachment]').slice(0, 39000);
  const batch = writeBatch(db);
  const msgPayload: Record<string, unknown> = {
    conversationId: opts.convId,
    userId: opts.uid,
    role: 'user',
    content: safeContent,
    createdAt: serverTimestamp(),
  };
  if (storedAttachments.length > 0) {
    msgPayload.attachments = storedAttachments;
  }

  batch.set(doc(db, 'users', opts.uid, 'aiConversations', opts.convId, 'messages', msgId), msgPayload);
  batch.update(doc(db, 'users', opts.uid, 'aiConversations', opts.convId), {
    lastMessagePreview: safeContent.slice(0, 180),
    messageCount: (opts.currentMessageCount ?? 0) + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return msgId;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${opts.uid}/aiConversations/${opts.convId}/messages/${msgId}`
    );
  }
}

export async function saveAssistantAiMessage(opts: {
  uid: string;
  convId: string;
  content: string;
  error?: boolean;
  currentMessageCount?: number;
  messageId?: string;
}): Promise<string> {
  const msgId = opts.messageId || `aimsg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const safeContent = (opts.content.trim() || 'Response stopped.').slice(0, 39000);
  const preview = safeContent.replace(/```[\s\S]*?```/g, ' ').replace(/\s+/g, ' ').trim();

  const batch = writeBatch(db);
  const msgPayload: Record<string, unknown> = {
    conversationId: opts.convId,
    userId: opts.uid,
    role: 'assistant',
    content: safeContent,
    model: 'luga-ai',
    createdAt: serverTimestamp(),
  };
  if (opts.error) msgPayload.error = true;

  batch.set(doc(db, 'users', opts.uid, 'aiConversations', opts.convId, 'messages', msgId), msgPayload);
  batch.update(doc(db, 'users', opts.uid, 'aiConversations', opts.convId), {
    lastMessagePreview: (preview || 'LUGA AI replied').slice(0, 180),
    messageCount: (opts.currentMessageCount ?? 0) + 1,
    updatedAt: serverTimestamp(),
  });

  try {
    await batch.commit();
    return msgId;
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.WRITE,
      `users/${opts.uid}/aiConversations/${opts.convId}/messages/${msgId}`
    );
  }
}

export async function deleteTrailingAiMessages(opts: {
  uid: string;
  convId: string;
  deleteIds: string[];
  remainingCount: number;
}) {
  if (opts.deleteIds.length === 0) return;
  const batch = writeBatch(db);
  opts.deleteIds.forEach((id) => {
    batch.delete(doc(db, 'users', opts.uid, 'aiConversations', opts.convId, 'messages', id));
  });
  batch.update(doc(db, 'users', opts.uid, 'aiConversations', opts.convId), {
    messageCount: Math.max(0, opts.remainingCount),
    updatedAt: serverTimestamp(),
  });
  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(
      err,
      OperationType.DELETE,
      `users/${opts.uid}/aiConversations/${opts.convId}`
    );
  }
}

export async function clearAiErrorMarker(uid: string, convId: string, msgId: string) {
  try {
    await updateDoc(doc(db, 'users', uid, 'aiConversations', convId, 'messages', msgId), {
      error: false,
      updatedAt: serverTimestamp(),
    });
  } catch {
    // non-fatal
  }
}

export async function readAiAttachmentFile(file: File): Promise<AiAttachment> {
  if (file.size <= 0 || file.size > MAX_AI_ATTACHMENT_BYTES) {
    throw new Error(`"${file.name}" exceeds the 8 MB upload limit.`);
  }

  const lower = file.name.toLowerCase();
  let mime = (file.type || '').toLowerCase();
  if (!mime) {
    if (lower.endsWith('.md')) mime = 'text/markdown';
    else if (lower.endsWith('.csv')) mime = 'text/csv';
    else if (lower.endsWith('.json')) mime = 'application/json';
    else if (lower.endsWith('.txt')) mime = 'text/plain';
  }

  const isText =
    mime === 'text/plain' ||
    mime === 'text/markdown' ||
    mime === 'text/csv' ||
    mime === 'application/json';
  const isImage =
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/webp' ||
    mime === 'image/gif';

  if (!isText && !isImage) {
    throw new Error(
      `Unsupported file "${file.name}". Please attach an image (PNG, JPG, WEBP, GIF) or text file (TXT, MD, CSV, JSON).`
    );
  }

  const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  if (isText) {
    const textContent = await file.text();
    return {
      id,
      name: file.name,
      mimeType: mime,
      sizeBytes: file.size,
      textContent: textContent.slice(0, 24000),
    };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error(`Unable to read "${file.name}".`));
    reader.readAsDataURL(file);
  });

  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return {
    id,
    name: file.name,
    mimeType: mime,
    sizeBytes: file.size,
    previewUrl: dataUrl,
    dataBase64: base64,
  };
}

export async function fetchAiStatus(): Promise<AiStatusResponse | null> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  const resp = await fetch('/api/ai/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  return (await resp.json()) as AiStatusResponse;
}

export async function streamAiChat(opts: {
  userPrompt: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  attachments?: AiAttachment[];
  signal: AbortSignal;
  onChunk: (delta: string, accumulated: string) => void;
  onDone?: (info: { quota?: AiQuotaSnapshot }) => void;
}): Promise<{ fullText: string; quota?: AiQuotaSnapshot }> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) {
    throw new Error('Please sign in again to chat with LUGA AI.');
  }

  const resp = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    signal: opts.signal,
    body: JSON.stringify({
      userPrompt: opts.userPrompt,
      history: opts.history.slice(-14).map((m) => ({
        role: m.role,
        content: m.content.slice(0, 8000),
      })),
      attachments: (opts.attachments || []).map((a) => ({
        name: a.name,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        dataBase64: a.dataBase64,
        textContent: a.textContent,
      })),
    }),
  });

  if (!resp.ok) {
    let errMsg = `Unable to reach LUGA AI (${resp.status}).`;
    try {
      const json = (await resp.json()) as { error?: string };
      if (json.error) errMsg = json.error;
    } catch {
      // keep fallback
    }
    throw new Error(errMsg);
  }

  if (!resp.body) {
    throw new Error('Streaming response unavailable.');
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  let latestQuota: AiQuotaSnapshot | undefined;

  const processEventBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let eventName = 'message';
    const dataLines: string[] = [];

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join('\n');
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(rawData) as Record<string, unknown>;
    } catch {
      return;
    }

    if (eventName === 'chunk') {
      const delta = typeof parsed.text === 'string' ? parsed.text : '';
      if (delta) {
        fullText += delta;
        opts.onChunk(delta, fullText);
      }
    } else if (eventName === 'done') {
      if (parsed.quota && typeof parsed.quota === 'object') {
        latestQuota = parsed.quota as AiQuotaSnapshot;
      }
      opts.onDone?.({ quota: latestQuota });
    } else if (eventName === 'error') {
      const msg = typeof parsed.error === 'string' ? parsed.error : 'Unable to reach LUGA AI.';
      throw new Error(msg);
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex = buffer.indexOf('\n\n');
    while (sepIndex !== -1) {
      const block = buffer.slice(0, sepIndex).trim();
      buffer = buffer.slice(sepIndex + 2);
      if (block) {
        processEventBlock(block);
      }
      sepIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    processEventBlock(buffer.trim());
  }

  return { fullText, quota: latestQuota };
}
