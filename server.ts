import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import type { Request, Response } from 'express';
import { AccessToken } from 'livekit-server-sdk';
import { createServer as createViteServer } from 'vite';

const PORT = 3000;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024; // 80 MB
const ALLOWED_VIDEO_MIMES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

// LiveKit Project Config (LUGAHUB)
const LIVEKIT_PROJECT_ID = 'p_2iczk6tbvy7';
const LIVEKIT_SERVER_URL = 'wss://lugahub-u5ms3l1h.livekit.cloud';
// Server-side Sandbox Token Server fallback for non-production development only
const LIVEKIT_SANDBOX_ID = 'lugahub-sshnib';
const LIVEKIT_SANDBOX_URL = 'https://lugahub-sshnib.sandbox.livekit.io';
const LIVEKIT_SANDBOX_API_ENDPOINT =
  'https://cloud-api.livekit.io/api/sandbox/connection-details';

interface FirebaseConfigJson {
  projectId?: string;
  firestoreDatabaseId?: string;
}

function getFirebaseAppletConfig(): FirebaseConfigJson {
  try {
    const raw = fs.readFileSync(
      path.resolve(import.meta.dirname, 'firebase-applet-config.json'),
      'utf-8'
    );
    return JSON.parse(raw) as FirebaseConfigJson;
  } catch {
    return {};
  }
}

const CLOUDINARY_CLOUD_NAME = 'dxtzxh93n';
const CLOUDINARY_API_KEY = '266743129994811';
const CLOUDINARY_API_SECRET = 'C9lESU3gTueY7pyyj2wFGcLQhhk';

// Server-side AI configuration (strictly never exposed to frontend)
const GROQ_API_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_PRIMARY_MODEL = 'openai/gpt-oss-120b';
const GROQ_FALLBACK_MODEL = 'qwen/qwen3.8-27b';
const GROQ_VISION_MODEL = 'qwen/qwen3.8-27b';
const AI_DAILY_QUOTA = 150;
const AI_BURST_LIMIT_PER_MIN = 15;
const AI_MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const AI_ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
]);

function getServerGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || '').trim();
}

interface AiRateRecord {
  dayKey: string;
  dailyCount: number;
  recentTimestamps: number[];
}

const aiUserUsageMap = new Map<string, AiRateRecord>();

function getUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function getAiQuotaSnapshot(uid: string) {
  const dayKey = getUtcDayKey();
  const existing = aiUserUsageMap.get(uid);
  const now = Date.now();
  if (!existing || existing.dayKey !== dayKey) {
    return {
      dayKey,
      usedToday: 0,
      dailyLimit: AI_DAILY_QUOTA,
      remainingToday: AI_DAILY_QUOTA,
      burstLimitPerMinute: AI_BURST_LIMIT_PER_MIN,
      recentCount: 0,
    };
  }
  const recent = existing.recentTimestamps.filter((ts) => now - ts < 60_000);
  return {
    dayKey,
    usedToday: existing.dailyCount,
    dailyLimit: AI_DAILY_QUOTA,
    remainingToday: Math.max(0, AI_DAILY_QUOTA - existing.dailyCount),
    burstLimitPerMinute: AI_BURST_LIMIT_PER_MIN,
    recentCount: recent.length,
  };
}

function consumeAiQuota(uid: string): { allowed: boolean; error?: string; snapshot: ReturnType<typeof getAiQuotaSnapshot> } {
  const dayKey = getUtcDayKey();
  const now = Date.now();
  let rec = aiUserUsageMap.get(uid);
  if (!rec || rec.dayKey !== dayKey) {
    rec = { dayKey, dailyCount: 0, recentTimestamps: [] };
    aiUserUsageMap.set(uid, rec);
  }
  rec.recentTimestamps = rec.recentTimestamps.filter((ts) => now - ts < 60_000);

  if (rec.recentTimestamps.length >= AI_BURST_LIMIT_PER_MIN) {
    return {
      allowed: false,
      error: 'Too many messages sent too quickly. Please wait a few seconds and try again.',
      snapshot: getAiQuotaSnapshot(uid),
    };
  }

  if (rec.dailyCount >= AI_DAILY_QUOTA) {
    return {
      allowed: false,
      error: `Daily LUGA AI limit (${AI_DAILY_QUOTA} messages/day) reached. Please continue tomorrow.`,
      snapshot: getAiQuotaSnapshot(uid),
    };
  }

  rec.dailyCount += 1;
  rec.recentTimestamps.push(now);
  return {
    allowed: true,
    snapshot: getAiQuotaSnapshot(uid),
  };
}

function buildLugaAiSystemInstruction(opts: {
  studentName: string;
  roleLabel: string;
  classOrDept: string;
}): string {
  return [
    'You are LUGA AI, the friendly and helpful assistant for MWANALUGALI SECONDARY SCHOOL (LUGA BOYZ) inside LUGA HUB.',
    `You are chatting with ${opts.studentName} (${opts.roleLabel}, ${opts.classOrDept}).`,
    'Respond naturally like a helpful friend and study companion in clear, conversational English or Kiswahili — always match the language the user writes in (Swahili or English, or mix naturally if asked).',
    'Keep explanations clear, accurate, concise, and easy to read on a mobile phone. Use simple formatting (short paragraphs, numbered steps, or bullet points) only when helpful.',
    'If asked who you are, say you are LUGA AI, the school assistant for LUGA HUB. Never mention underlying AI providers, APIs, or model names.',
  ].join('\n');
}

function getCloudinaryServerConfig() {
  return {
    configured: true,
    mode: 'signed' as const,
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
    unsignedPreset: null,
  };
}

function getLiveKitServerConfig() {
  const apiKey = (process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = (process.env.LIVEKIT_API_SECRET || '').trim();
  const serverUrl = (process.env.LIVEKIT_URL || LIVEKIT_SERVER_URL).trim();

  if (apiKey && apiSecret) {
    return {
      mode: 'production-sdk' as const,
      serverUrl,
      apiKey,
      apiSecret,
    };
  }

  return {
    mode: 'server-sandbox-bridge' as const,
    serverUrl,
    apiKey: null,
    apiSecret: null,
  };
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function verifyAuthenticatedMember(
  req: Request
): Promise<{ uid: string; email?: string; idToken: string } | null> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const claims = decodeJwtPayload(token);
  const { projectId } = getFirebaseAppletConfig();
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) return null;
  if (projectId && claims.aud !== projectId) return null;
  if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;

  return {
    uid: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
    idToken: token,
  };
}

interface FirestoreRestDoc {
  name?: string;
  fields?: Record<string, Record<string, unknown>>;
}

async function fetchFirestoreDocWithUserToken(
  docPath: string,
  idToken: string
): Promise<FirestoreRestDoc | null> {
  const { projectId, firestoreDatabaseId } = getFirebaseAppletConfig();
  if (!projectId) return null;
  const dbId = firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(dbId)}/documents/${docPath}`;

  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  if (!resp.ok) {
    return null;
  }
  return (await resp.json()) as FirestoreRestDoc;
}

function readStringField(
  fields: Record<string, Record<string, unknown>> | undefined,
  key: string
): string {
  const val = fields?.[key]?.stringValue;
  return typeof val === 'string' ? val : '';
}

function readStringArrayField(
  fields: Record<string, Record<string, unknown>> | undefined,
  key: string
): string[] {
  const values = (fields?.[key]?.arrayValue as { values?: Array<{ stringValue?: string }> } | undefined)
    ?.values;
  if (!Array.isArray(values)) return [];
  return values.map((v) => v.stringValue || '').filter(Boolean);
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'luga-hub' });
  });

  app.get('/api/media/status', (_req: Request, res: Response) => {
    const cloud = getCloudinaryServerConfig();
    res.json({
      imgbbConfigured: true,
      cloudinaryConfigured: cloud.configured,
      cloudinaryMode: cloud.mode,
      cloudinaryCloudName: cloud.cloudName,
      cloudinaryUploadPreset: cloud.unsignedPreset,
      maxImageBytes: 10 * 1024 * 1024,
      maxVideoBytes: MAX_VIDEO_BYTES,
      requiredVars: cloud.configured
        ? []
        : [
            'CLOUDINARY_CLOUD_NAME',
            'CLOUDINARY_API_KEY',
            'CLOUDINARY_API_SECRET',
          ],
    });
  });

  app.post('/api/media/cloudinary-signature', async (req: Request, res: Response) => {
    const member = await verifyAuthenticatedMember(req);
    if (!member) {
      res.status(401).json({ error: 'Authentication required before requesting video upload credentials.' });
      return;
    }

    const body = (req.body || {}) as {
      folder?: string;
      mimeType?: string;
      fileSizeBytes?: number;
    };

    const mimeType = typeof body.mimeType === 'string' ? body.mimeType.toLowerCase().trim() : '';
    const fileSizeBytes = typeof body.fileSizeBytes === 'number' ? body.fileSizeBytes : 0;

    if (!ALLOWED_VIDEO_MIMES.has(mimeType)) {
      res.status(400).json({
        error: 'Unsupported video format. Please upload MP4, WebM, MOV, or M4V video files.',
      });
      return;
    }

    if (fileSizeBytes <= 0 || fileSizeBytes > MAX_VIDEO_BYTES) {
      res.status(400).json({
        error: 'Video file must be between 1 byte and 80 MB.',
      });
      return;
    }

    const cloud = getCloudinaryServerConfig();
    const rawFolder = typeof body.folder === 'string' ? body.folder.replace(/[^a-zA-Z0-9/_-]/g, '') : 'feed';
    const safeFolder = `luga_hub/${rawFolder}/${member.uid}`.slice(0, 120);
    const timestamp = Math.floor(Date.now() / 1000);

    // Cloudinary signature sorts parameters alphabetically and appends API secret
    const paramsToSign = `folder=${safeFolder}&timestamp=${timestamp}`;
    const signature = crypto
      .createHash('sha1')
      .update(`${paramsToSign}${cloud.apiSecret}`)
      .digest('hex');

    res.json({
      mode: 'signed',
      cloudName: cloud.cloudName,
      apiKey: cloud.apiKey,
      timestamp,
      signature,
      folder: safeFolder,
    });
  });

  // ---------------------------------------------------------------------------
  // LiveKit Cloud Status & Secure Token Generation
  // ---------------------------------------------------------------------------
  app.get('/api/livekit/status', (_req: Request, res: Response) => {
    const lk = getLiveKitServerConfig();
    res.json({
      projectId: LIVEKIT_PROJECT_ID,
      serverUrl: lk.serverUrl,
      mode: lk.mode,
      fcmPushServerConfigured: Boolean((process.env.FCM_SERVER_KEY || '').trim()),
    });
  });

  app.post('/api/livekit/token', async (req: Request, res: Response) => {
    const member = await verifyAuthenticatedMember(req);
    if (!member) {
      res.status(401).json({ error: 'Firebase authentication required for LiveKit calls.' });
      return;
    }

    const body = (req.body || {}) as {
      callId?: string;
      scope?: 'private' | 'group';
      conversationId?: string;
      groupId?: string;
      participantName?: string;
      avatarUrl?: string;
    };

    const callId = typeof body.callId === 'string' ? body.callId.trim() : '';
    const scope = body.scope;
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
    const safeIdRegex = /^[a-zA-Z0-9_-]{4,128}$/;

    if (!safeIdRegex.test(callId)) {
      res.status(400).json({ error: 'Valid callId is required.' });
      return;
    }
    if (scope !== 'private' && scope !== 'group') {
      res.status(400).json({ error: 'Call scope must be private or group.' });
      return;
    }

    // Verify user profile is approved
    const userDoc = await fetchFirestoreDocWithUserToken(
      `users/${encodeURIComponent(member.uid)}`,
      member.idToken
    );
    const userStatus = readStringField(userDoc?.fields, 'status');
    const fullName =
      readStringField(userDoc?.fields, 'fullName') ||
      (typeof body.participantName === 'string' ? body.participantName.trim() : '') ||
      'LUGA Member';

    if (userDoc && userStatus && userStatus !== 'approved') {
      res.status(403).json({ error: 'Only approved LUGA HUB members can join audio/video calls.' });
      return;
    }

    // Authorize membership against Firestore using caller's verified Firebase ID token
    let roomName = '';
    if (scope === 'private') {
      if (!safeIdRegex.test(conversationId)) {
        res.status(400).json({ error: 'Valid conversationId is required for private calls.' });
        return;
      }
      const [convDoc, partDoc] = await Promise.all([
        fetchFirestoreDocWithUserToken(
          `conversations/${encodeURIComponent(conversationId)}`,
          member.idToken
        ),
        fetchFirestoreDocWithUserToken(
          `conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(member.uid)}`,
          member.idToken
        ),
      ]);
      const convParticipants = readStringArrayField(convDoc?.fields, 'participantIds');
      if (!convDoc || !partDoc || !convParticipants.includes(member.uid)) {
        res.status(403).json({
          error: 'Only authorized conversation participants can initiate or join private calls.',
        });
        return;
      }
      roomName = `luga_dm_${callId}`;
    } else {
      if (!safeIdRegex.test(groupId)) {
        res.status(400).json({ error: 'Valid groupId is required for group calls.' });
        return;
      }
      const memberDoc = await fetchFirestoreDocWithUserToken(
        `groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(member.uid)}`,
        member.idToken
      );
      const memberStatus = readStringField(memberDoc?.fields, 'status') || 'active';
      if (!memberDoc || memberStatus !== 'active') {
        res.status(403).json({
          error: 'Only active group members can initiate or join group calls.',
        });
        return;
      }
      roomName = `luga_grp_${callId}`;
    }

    // Validate the Firestore CallSession record if it already exists
    const callDoc = await fetchFirestoreDocWithUserToken(
      `calls/${encodeURIComponent(callId)}`,
      member.idToken
    );
    if (callDoc?.fields) {
      const docRoomName = readStringField(callDoc.fields, 'roomName');
      const docStatus = readStringField(callDoc.fields, 'status');
      if (docRoomName && docRoomName !== roomName) {
        roomName = docRoomName;
      }
      if (docStatus === 'ended' || docStatus === 'declined' || docStatus === 'missed') {
        res.status(410).json({ error: 'This call has already ended.' });
        return;
      }
    }

    const lk = getLiveKitServerConfig();

    // Production path: sign JWT directly with livekit-server-sdk (zero dev sandbox usage)
    if (lk.mode === 'production-sdk' && lk.apiKey && lk.apiSecret) {
      const at = new AccessToken(lk.apiKey, lk.apiSecret, {
        identity: member.uid,
        name: fullName,
        ttl: '2h',
        metadata: JSON.stringify({
          uid: member.uid,
          avatarUrl: typeof body.avatarUrl === 'string' ? body.avatarUrl.slice(0, 300) : '',
        }),
      });
      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });
      const token = await at.toJwt();
      res.json({
        serverUrl: lk.serverUrl,
        token,
        roomName,
        identity: member.uid,
        participantName: fullName,
        mode: 'production-sdk',
      });
      return;
    }

    // Strict production guard if explicitly demanded without keys
    if (process.env.REQUIRE_LIVEKIT_PRODUCTION_KEYS === 'true') {
      res.status(503).json({
        error:
          'Production LiveKit token generation requires LIVEKIT_API_KEY and LIVEKIT_API_SECRET.',
      });
      return;
    }

    // Server-side Sandbox Token Server bridge (keeps sandbox ID & endpoint off frontend)
    try {
      const participantLabel = `${fullName} (${member.uid.slice(0, 6)})`;
      const sandboxResp = await fetch(LIVEKIT_SANDBOX_API_ENDPOINT, {
        method: 'POST',
        headers: {
          'X-Sandbox-ID': LIVEKIT_SANDBOX_ID,
          'Content-Type': 'application/json',
          Origin: LIVEKIT_SANDBOX_URL,
        },
        body: JSON.stringify({
          room_name: roomName,
          participant_name: participantLabel,
        }),
      });

      if (!sandboxResp.ok) {
        const errText = await sandboxResp.text().catch(() => '');
        res.status(502).json({
          error: `LiveKit token server failed (${sandboxResp.status}). ${errText.slice(0, 140)}`,
        });
        return;
      }

      const sandboxData = (await sandboxResp.json()) as {
        serverUrl?: string;
        participantToken?: string;
        roomName?: string;
        participantName?: string;
      };

      if (!sandboxData.participantToken) {
        res.status(502).json({ error: 'LiveKit token server returned an empty token.' });
        return;
      }

      res.json({
        serverUrl: sandboxData.serverUrl || LIVEKIT_SERVER_URL,
        token: sandboxData.participantToken,
        roomName: sandboxData.roomName || roomName,
        identity: sandboxData.participantName || participantLabel,
        participantName: fullName,
        mode: 'server-sandbox-bridge',
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to connect to LiveKit token service.',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // FCM Call Notification Trigger (optional FCM server key + Firestore signal)
  // ---------------------------------------------------------------------------
  app.post('/api/calls/notify', async (req: Request, res: Response) => {
    const member = await verifyAuthenticatedMember(req);
    if (!member) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const body = (req.body || {}) as {
      callId?: string;
      title?: string;
      body?: string;
      callType?: 'audio' | 'video';
      tokens?: string[];
    };

    const fcmServerKey = (process.env.FCM_SERVER_KEY || '').trim();
    const tokens = Array.isArray(body.tokens)
      ? body.tokens.filter((t): t is string => typeof t === 'string' && t.length > 10).slice(0, 40)
      : [];

    if (!fcmServerKey || tokens.length === 0) {
      res.json({
        deliveredViaFcm: false,
        reason: fcmServerKey ? 'no_recipient_tokens' : 'fcm_server_key_unset',
        realtimeSignalingActive: true,
      });
      return;
    }

    try {
      const fcmResp = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          Authorization: `key=${fcmServerKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          registration_ids: tokens,
          priority: 'high',
          notification: {
            title: body.title || 'Incoming LUGA HUB Call',
            body: body.body || 'Tap to answer call',
            icon: '/luga-logo-enhanced.jpg',
          },
          data: {
            type: 'incoming_call',
            callId: body.callId || '',
            callType: body.callType || 'audio',
            url: '/',
          },
        }),
      });
      res.json({
        deliveredViaFcm: fcmResp.ok,
        status: fcmResp.status,
        realtimeSignalingActive: true,
      });
    } catch {
      res.json({
        deliveredViaFcm: false,
        realtimeSignalingActive: true,
      });
    }
  });

  // ---------------------------------------------------------------------------
  // LUGA AI Status & Real-Time SSE Streaming Endpoint
  // ---------------------------------------------------------------------------
  app.get('/api/ai/status', async (req: Request, res: Response) => {
    const member = await verifyAuthenticatedMember(req);
    if (!member) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }

    const apiKey = getServerGroqApiKey();
    const quota = getAiQuotaSnapshot(member.uid);
    res.json({
      configured: Boolean(apiKey),
      maxAttachmentBytes: AI_MAX_ATTACHMENT_BYTES,
      allowedMimeTypes: Array.from(AI_ALLOWED_MIME_TYPES),
      quota,
    });
  });

  app.post(
    '/api/ai/chat',
    express.json({ limit: '14mb' }),
    async (req: Request, res: Response) => {
      const member = await verifyAuthenticatedMember(req);
      if (!member) {
        res.status(401).json({ error: 'Please sign in to chat with LUGA AI.' });
        return;
      }

      const apiKey = getServerGroqApiKey();
      if (!apiKey) {
        res.status(503).json({ error: 'LUGA AI is temporarily unavailable. Please try again shortly.' });
        return;
      }

      const userDoc = await fetchFirestoreDocWithUserToken(
        `users/${encodeURIComponent(member.uid)}`,
        member.idToken
      );
      const userStatus = readStringField(userDoc?.fields, 'status');
      const isBootstrapped =
        member.email === 'jkambi00@gmail.com' || member.email === 'qbotmanager@gmail.com';
      if (!isBootstrapped && userDoc && userStatus && userStatus !== 'approved') {
        res.status(403).json({ error: 'Only approved LUGA HUB members can chat with LUGA AI.' });
        return;
      }

      const studentName = readStringField(userDoc?.fields, 'fullName') || 'LUGA Student';
      const roleLabel = readStringField(userDoc?.fields, 'role') || 'student';
      const classOrDept = readStringField(userDoc?.fields, 'classOrDept') || 'Mwanalugali Secondary';

      const body = (req.body || {}) as {
        userPrompt?: string;
        history?: Array<{ role?: string; content?: string }>;
        attachments?: Array<{
          name?: string;
          mimeType?: string;
          sizeBytes?: number;
          dataBase64?: string;
          textContent?: string;
        }>;
      };

      const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt.trim() : '';
      const attachments = Array.isArray(body.attachments) ? body.attachments.slice(0, 4) : [];

      if (!userPrompt && attachments.length === 0) {
        res.status(400).json({ error: 'Please enter a message or attach a file.' });
        return;
      }
      if (userPrompt.length > 16000) {
        res.status(400).json({ error: 'Message exceeds maximum length (16,000 characters).' });
        return;
      }

      type OpenAiContentPart =
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } };

      const userContentParts: OpenAiContentPart[] = [];
      let hasImageAttachment = false;

      for (const att of attachments) {
        const mime = typeof att.mimeType === 'string' ? att.mimeType.toLowerCase().trim() : '';
        const name = typeof att.name === 'string' ? att.name.slice(0, 120) : 'attachment';
        if (!AI_ALLOWED_MIME_TYPES.has(mime)) {
          res.status(400).json({
            error: `Unsupported file type (${mime || name}). Allowed: PNG, JPG, WEBP, GIF, TXT, MD, CSV, JSON.`,
          });
          return;
        }
        if (typeof att.textContent === 'string' && att.textContent.trim()) {
          userContentParts.push({
            type: 'text',
            text: `[Attached File: ${name}]\n${att.textContent.slice(0, 24000)}`,
          });
        } else if (typeof att.dataBase64 === 'string' && att.dataBase64.trim() && mime.startsWith('image/')) {
          const cleanB64 = att.dataBase64.replace(/^data:[^;]+;base64,/, '');
          const approxBytes = Math.floor((cleanB64.length * 3) / 4);
          if (approxBytes > AI_MAX_ATTACHMENT_BYTES) {
            res.status(400).json({
              error: `Attachment "${name}" exceeds the 8 MB limit.`,
            });
            return;
          }
          hasImageAttachment = true;
          userContentParts.push({
            type: 'image_url',
            image_url: {
              url: `data:${mime};base64,${cleanB64}`,
            },
          });
        }
      }

      if (userPrompt) {
        userContentParts.push({ type: 'text', text: userPrompt });
      } else if (userContentParts.length > 0) {
        userContentParts.push({
          type: 'text',
          text: 'Please look at what I attached and help me understand it.',
        });
      }

      const quotaCheck = consumeAiQuota(member.uid);
      if (!quotaCheck.allowed) {
        res.status(429).json({
          error: quotaCheck.error,
          quota: quotaCheck.snapshot,
        });
        return;
      }

      const systemInstruction = buildLugaAiSystemInstruction({
        studentName,
        roleLabel,
        classOrDept,
      });

      const historyItems = Array.isArray(body.history) ? body.history.slice(-16) : [];
      const groqMessages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string | OpenAiContentPart[];
      }> = [{ role: 'system', content: systemInstruction }];

      for (const h of historyItems) {
        const contentText = typeof h.content === 'string' ? h.content.trim() : '';
        if (!contentText) continue;
        const role = h.role === 'assistant' || h.role === 'model' ? 'assistant' : 'user';
        groqMessages.push({
          role,
          content: contentText.slice(0, 12000),
        });
      }

      const finalUserMessageContent =
        !hasImageAttachment && userContentParts.every((p) => p.type === 'text')
          ? userContentParts.map((p) => (p.type === 'text' ? p.text : '')).join('\n\n')
          : userContentParts;

      groqMessages.push({
        role: 'user',
        content: finalUserMessageContent,
      });

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      let clientClosed = false;
      const upstreamController = new AbortController();
      req.on('close', () => {
        clientClosed = true;
        upstreamController.abort();
      });

      const sendSse = (event: string, payload: unknown) => {
        if (clientClosed || res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      };

      const runGroqStream = async (modelName: string) => {
        const upstream = await fetch(GROQ_API_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          signal: upstreamController.signal,
          body: JSON.stringify({
            model: modelName,
            messages: groqMessages,
            temperature: 0.65,
            max_tokens: 2048,
            stream: true,
          }),
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => '');
          let msg = `LUGA AI could not respond right now (${upstream.status}).`;
          try {
            const parsed = JSON.parse(errText) as { error?: { message?: string } };
            if (parsed?.error?.message) {
              msg = parsed.error.message;
            }
          } catch {
            // keep generic message
          }
          const err = new Error(msg);
          (err as Error & { statusCode?: number }).statusCode = upstream.status;
          throw err;
        }

        if (!upstream.body) {
          throw new Error('LUGA AI response stream was unavailable.');
        }

        // Never expose underlying provider/model name to frontend
        sendSse('meta', { model: 'luga-ai', quota: quotaCheck.snapshot });

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let sseBuffer = '';

        const processLineBlock = (block: string) => {
          const lines = block.split(/\r?\n/);
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const dataPayload = trimmed.slice(5).trim();
            if (!dataPayload || dataPayload === '[DONE]') continue;
            try {
              const json = JSON.parse(dataPayload) as {
                choices?: Array<{ delta?: { content?: string } }>;
              };
              const delta = json.choices?.[0]?.delta?.content;
              if (typeof delta === 'string' && delta.length > 0) {
                sendSse('chunk', { text: delta });
              }
            } catch {
              // ignore malformed partial frames
            }
          }
        };

        while (true) {
          if (clientClosed) break;
          const { done, value } = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, { stream: true });

          let sep = sseBuffer.indexOf('\n\n');
          while (sep !== -1) {
            const block = sseBuffer.slice(0, sep);
            sseBuffer = sseBuffer.slice(sep + 2);
            if (block.trim()) processLineBlock(block);
            sep = sseBuffer.indexOf('\n\n');
          }
        }

        if (sseBuffer.trim()) {
          processLineBlock(sseBuffer);
        }
      };

      try {
          const primaryModel = hasImageAttachment ? GROQ_VISION_MODEL : GROQ_PRIMARY_MODEL;
        try {
          await runGroqStream(primaryModel);
        } catch (primaryErr) {
          if (clientClosed) return;
          const status = (primaryErr as Error & { statusCode?: number }).statusCode;
          const msg = primaryErr instanceof Error ? primaryErr.message.toLowerCase() : '';
          const shouldFallback =
            !hasImageAttachment &&
            (status === 404 || status === 429 || status === 503 || msg.includes('model') || msg.includes('rate'));
          if (shouldFallback) {
            await runGroqStream(GROQ_FALLBACK_MODEL);
          } else {
            throw primaryErr;
          }
        }

        if (!clientClosed) {
          sendSse('done', { ok: true, quota: quotaCheck.snapshot });
        }
      } catch (err) {
        if (clientClosed) return;
        const raw = err instanceof Error ? err.message : 'Unable to reach LUGA AI right now.';
        const redacted = apiKey ? raw.replaceAll(apiKey, '[REDACTED]') : raw;
        const sanitized = redacted
          .replace(/groq|openai\/gpt-oss[^\s,]*|qwen[^\s,]*|llama[^\s,]*/gi, 'LUGA AI');
        sendSse('error', {
          error: sanitized.slice(0, 260),
          quota: quotaCheck.snapshot,
        });
      } finally {
        if (!res.writableEnded) {
          res.end();
        }
      }
    }
  );

  const isProd =
    process.env.NODE_ENV === 'production' &&
    fs.existsSync(path.resolve(import.meta.dirname, 'dist'));

  if (isProd) {
    const distPath = path.resolve(import.meta.dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LUGA HUB server running on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
