import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Edit3,
  Film,
  Forward,
  ImagePlus,
  Loader2,
  MessageSquare,
  Phone,
  Pin,
  Reply,
  Search,
  Send,
  SmilePlus,
  Trash2,
  UserPlus,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import {
  ensurePrimaryAiConversation,
  listenAiConversations,
  LUGA_AI_IDENTITY,
  pickPrimaryAiConversation,
} from '../../lib/aiService';
import { sendNotification } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  uploadMultipleImagesToImgBB,
  uploadVideoToCloudinary,
  UploadedVideoMeta,
} from '../../lib/mediaService';
import { canMessageMember, resolvePrivacy } from '../../lib/userService';
import {
  AiConversation,
  ConversationItem,
  ConversationParticipantItem,
  formatFirestoreDate,
  formatTimeShort,
  MessageItem,
  toMillis,
  UserDirectoryEntry,
} from '../../types/luga';
import { LugaAiAvatar } from '../ai/LugaAiAvatar';
import { LugaAiChatPane } from '../ai/LugaAiChatPane';
import { CustomVideoPlayer } from '../common/CustomVideoPlayer';
import { LightboxMedia, MediaLightbox } from '../common/MediaLightbox';
import { UserAvatar } from '../common/UserAvatar';
import { UserProfileModal } from '../common/UserProfileModal';
import { ReportModal } from '../layout/ReportModal';

interface MessagesModuleProps {
  initialPeerUid?: string | null;
  onClearInitialPeer?: () => void;
}

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

export function MessagesModule({ initialPeerUid, onClearInitialPeer }: MessagesModuleProps) {
  const { profile } = useAuth();
  const { initiatePrivateCall, activeCall } = useCalls();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [myParticipantMap, setMyParticipantMap] = useState<
    Record<string, ConversationParticipantItem>
  >({});
  const [activeParticipants, setActiveParticipants] = useState<ConversationParticipantItem[]>([]);

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [aiConversations, setAiConversations] = useState<AiConversation[]>([]);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [activeAiConvId, setActiveAiConvId] = useState<string | null>(null);
  const aiAutoInitRef = useRef<string | null>(null);
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [optimisticMsgs, setOptimisticMsgs] = useState<MessageItem[]>([]);

  const [convSearch, setConvSearch] = useState('');
  const [listTab, setListTab] = useState<'all' | 'pinned' | 'archived'>('all');
  const [showNewChat, setShowNewChat] = useState(false);

  // Composer state
  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingVideo, setPendingVideo] = useState<UploadedVideoMeta | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Message actions state
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [editingMsg, setEditingMsg] = useState<MessageItem | null>(null);
  const [emojiMenuMsgId, setEmojiMenuMsgId] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<MessageItem | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'post' | 'comment' | 'user' | 'group';
    targetId: string;
    targetSummary: string;
  } | null>(null);

  const myPrivacy = resolvePrivacy(profile);

  // Listen to conversations (single array-contains filter, sort client-side — zero composite index needed)
  useEffect(() => {
    if (!profile) return;
    const q = query(
      collection(db, 'conversations'),
      where('participantIds', 'array-contains', profile.uid),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<ConversationItem, 'id'>),
          }))
          .sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
        setConversations(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'conversations')
    );

    const unsubDir = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('fullName', 'asc'), limit(100)),
      (snap) => {
        setDirectory(
          snap.docs
            .map((d) => d.data() as UserDirectoryEntry)
            .filter((u) => u.uid !== profile.uid && u.status === 'approved')
        );
      },
      () => {}
    );

    const unsubAi = listenAiConversations(profile.uid, (list) => {
      setAiConversations(list);
      setAiLoaded(true);
    });

    return () => {
      unsub();
      unsubDir();
      unsubAi();
    };
  }, [profile?.uid]);

  // Ensure every user has exactly one permanent LUGA AI conversation automatically
  useEffect(() => {
    if (!profile || !aiLoaded) return;
    if (aiConversations.length === 0 && aiAutoInitRef.current !== profile.uid) {
      aiAutoInitRef.current = profile.uid;
      void ensurePrimaryAiConversation(profile.uid).catch(() => {
        aiAutoInitRef.current = null;
      });
    }
  }, [profile?.uid, aiLoaded, aiConversations.length]);

  // Listen to own participant docs for unread counts, pinned, and archived status
  useEffect(() => {
    if (!profile || conversations.length === 0) return;
    const unsubs = conversations.slice(0, 25).map((conv) =>
      onSnapshot(
        doc(db, 'conversations', conv.id, 'participants', profile.uid),
        (snap) => {
          if (snap.exists()) {
            setMyParticipantMap((prev) => ({
              ...prev,
              [conv.id]: snap.data() as ConversationParticipantItem,
            }));
          }
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [profile?.uid, conversations.map((c) => c.id).join(',')]);

  const directoryByUid = useMemo(() => {
    const map: Record<string, UserDirectoryEntry> = {};
    directory.forEach((u) => {
      map[u.uid] = u;
    });
    return map;
  }, [directory]);

  const openOrCreateDm = async (peer: UserDirectoryEntry) => {
    if (!profile) return;
    const msgCheck = canMessageMember(profile, peer);
    if (!msgCheck.allowed) {
      setError(msgCheck.reason || 'Messaging is restricted for this member.');
      return;
    }

    const existingInState = conversations.find(
      (c) =>
        !c.isGroup &&
        c.participantIds.includes(profile.uid) &&
        c.participantIds.includes(peer.uid)
    );
    if (existingInState) {
      setActiveAiConvId(null);
      setActiveConvId(existingInState.id);
      setShowNewChat(false);
      return;
    }

    const sorted = [profile.uid, peer.uid].sort();
    const convId = `dm_${sorted[0].slice(0, 20)}_${sorted[1].slice(0, 20)}`;
    setError(null);
    try {
      const existing = await getDoc(doc(db, 'conversations', convId));
      if (!existing.exists()) {
        const batch = writeBatch(db);
        batch.set(doc(db, 'conversations', convId), {
          isGroup: false,
          participantIds: sorted,
          participantNames: {
            [profile.uid]: profile.fullName,
            [peer.uid]: peer.fullName,
          },
          participantAvatars: {
            [profile.uid]: profile.avatarUrl || '',
            [peer.uid]: peer.avatarUrl || '',
          },
          lastMessage: 'Conversation started',
          createdBy: profile.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'conversations', convId, 'participants', profile.uid), {
          userId: profile.uid,
          conversationId: convId,
          unreadCount: 0,
          pinned: false,
          archived: false,
          typing: false,
          joinedAt: serverTimestamp(),
        });
        batch.set(doc(db, 'conversations', convId, 'participants', peer.uid), {
          userId: peer.uid,
          conversationId: convId,
          unreadCount: 0,
          pinned: false,
          archived: false,
          typing: false,
          joinedAt: serverTimestamp(),
        });
        await batch.commit();
      }
      setActiveAiConvId(null);
      setActiveConvId(convId);
      setShowNewChat(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start conversation.');
      handleFirestoreError(err, OperationType.WRITE, `conversations/${convId}`);
    }
  };

  const openLugaAi = async () => {
    if (!profile) return;
    setError(null);
    const existing = pickPrimaryAiConversation(aiConversations);
    if (existing) {
      setActiveConvId(null);
      setActiveAiConvId(existing.id);
      setShowNewChat(false);
      return;
    }
    try {
      const convId = await ensurePrimaryAiConversation(profile.uid);
      setActiveConvId(null);
      setActiveAiConvId(convId);
      setShowNewChat(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to open LUGA AI.');
    }
  };

  useEffect(() => {
    if (!initialPeerUid || directory.length === 0) return;
    const peer = directory.find((m) => m.uid === initialPeerUid);
    if (peer) {
      void openOrCreateDm(peer);
      onClearInitialPeer?.();
    }
  }, [initialPeerUid, directory]);

  // Listen to active conversation participants & messages + send real delivery/read receipts
  useEffect(() => {
    if (!activeConvId || !profile) {
      setMessages([]);
      setActiveParticipants([]);
      return;
    }

    const unsubParts = onSnapshot(
      collection(db, 'conversations', activeConvId, 'participants'),
      (snap) => {
        setActiveParticipants(snap.docs.map((d) => d.data() as ConversationParticipantItem));
      },
      () => {}
    );

    const q = query(
      collection(db, 'conversations', activeConvId, 'messages'),
      orderBy('createdAt', 'asc'),
      limit(100)
    );
    const unsubMsgs = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MessageItem, 'id'>),
        }));
        setMessages(list);

        // Acknowledge delivered / seen on incoming peer messages
        const incomingUnacked = list.filter(
          (m) =>
            m.senderId !== profile.uid &&
            (!m.deliveredAt || (myPrivacy.sendReadReceipts && !m.seenAt))
        );
        if (incomingUnacked.length > 0) {
          const batch = writeBatch(db);
          incomingUnacked.slice(-20).forEach((m) => {
            const patch: Record<string, unknown> = {
              updatedAt: serverTimestamp(),
            };
            if (!m.deliveredAt) {
              patch.deliveredAt = serverTimestamp();
              patch.status = myPrivacy.sendReadReceipts ? 'seen' : 'delivered';
            }
            if (myPrivacy.sendReadReceipts && !m.seenAt) {
              patch.seenAt = serverTimestamp();
              patch.status = 'seen';
            }
            batch.update(doc(db, 'conversations', activeConvId, 'messages', m.id), patch);
          });
          batch.update(doc(db, 'conversations', activeConvId, 'participants', profile.uid), {
            unreadCount: 0,
            lastDeliveredAt: serverTimestamp(),
            ...(myPrivacy.sendReadReceipts ? { lastReadAt: serverTimestamp() } : {}),
          });
          if (myPrivacy.sendReadReceipts) {
            batch.update(doc(db, 'conversations', activeConvId), {
              lastMessageStatus: 'seen',
              updatedAt: serverTimestamp(),
            });
          }
          void batch.commit().catch(() => {});
        } else {
          const myPart = myParticipantMap[activeConvId];
          if (myPart && myPart.unreadCount > 0) {
            void updateDoc(
              doc(db, 'conversations', activeConvId, 'participants', profile.uid),
              {
                unreadCount: 0,
                ...(myPrivacy.sendReadReceipts ? { lastReadAt: serverTimestamp() } : {}),
              }
            ).catch(() => {});
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `conversations/${activeConvId}/messages`)
    );

    return () => {
      unsubParts();
      unsubMsgs();
    };
  }, [activeConvId, profile?.uid, myPrivacy.sendReadReceipts]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, optimisticMsgs.length, activeConvId]);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const getPeerInfo = (conv: ConversationItem) => {
    const peerUid = conv.participantIds.find((id) => id !== profile?.uid) || '';
    const dir = directoryByUid[peerUid];
    const name =
      dir?.fullName ||
      (conv.participantNames && peerUid ? conv.participantNames[peerUid] : '') ||
      conv.title ||
      'Member';
    const avatarUrl =
      dir?.avatarUrl ||
      (conv.participantAvatars && peerUid ? conv.participantAvatars[peerUid] : '') ||
      '';
    const online = Boolean(dir && dir.showOnlineStatus !== false && dir.isOnline);
    const lastSeen =
      dir && dir.showLastSeen !== false && dir.lastActiveAt
        ? formatFirestoreDate(dir.lastActiveAt)
        : null;
    return { peerUid, dir, name, avatarUrl, online, lastSeen };
  };

  const setTypingStatus = (isTyping: boolean) => {
    if (!activeConvId || !profile) return;
    void updateDoc(doc(db, 'conversations', activeConvId, 'participants', profile.uid), {
      typing: isTyping,
      typingUpdatedAt: serverTimestamp(),
    }).catch(() => {});
  };

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!activeConvId || !profile) return;
    setTypingStatus(val.trim().length > 0);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      setTypingStatus(false);
    }, 2400);
  };

  const handleMultiImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const remaining = Math.max(0, 6 - pendingImages.length);
    if (remaining === 0) return;

    setError(null);
    setPendingVideo(null);
    setUploadingImages(true);
    try {
      const uploaded = await uploadMultipleImagesToImgBB(files.slice(0, remaining));
      setPendingImages((prev) => [...prev, ...uploaded.map((u) => u.url)].slice(0, 6));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ImgBB image upload failed.');
    } finally {
      setUploadingImages(false);
    }
  };

  const handleVideoAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setPendingImages([]);
    setUploadingVideo(true);
    setVideoProgress(5);
    try {
      const meta = await uploadVideoToCloudinary(file, 'chat', setVideoProgress);
      setPendingVideo(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cloudinary video upload failed.');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !activeConvId || !activeConv) return;

    // Handle edit existing message
    if (editingMsg) {
      if (!draft.trim()) return;
      setSending(true);
      try {
        await updateDoc(doc(db, 'conversations', activeConvId, 'messages', editingMsg.id), {
          text: draft.trim().slice(0, 2000),
          edited: true,
          updatedAt: serverTimestamp(),
        });
        setEditingMsg(null);
        setDraft('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to edit message.');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!draft.trim() && pendingImages.length === 0 && !pendingVideo) return;

    setSending(true);
    setError(null);
    setTypingStatus(false);

    const mediaType: 'text' | 'image' | 'video' = pendingVideo
      ? 'video'
      : pendingImages.length > 0
      ? 'image'
      : 'text';
    const textVal =
      draft.trim() ||
      (mediaType === 'video' ? 'Shared a video' : mediaType === 'image' ? 'Shared photos' : '');
    const msgId = `msg_${Date.now()}_${profile.uid.slice(0, 6)}`;

    const optimistic: MessageItem = {
      id: msgId,
      conversationId: activeConvId,
      senderId: profile.uid,
      senderName: profile.fullName,
      senderAvatarUrl: profile.avatarUrl,
      text: textVal,
      mediaType,
      imageUrls: pendingImages.length > 0 ? pendingImages : undefined,
      imageUrl: pendingImages[0],
      videoUrl: pendingVideo?.videoUrl,
      videoThumbnailUrl: pendingVideo?.videoThumbnailUrl,
      replyToMessageId: replyTo?.id,
      replyToSenderName: replyTo?.senderName,
      replyToText: replyTo?.text,
      createdAt: new Date(),
    };
    setOptimisticMsgs((prev) => [...prev, optimistic]);

    const currentImages = [...pendingImages];
    const currentVideo = pendingVideo;
    const currentReply = replyTo;

    setDraft('');
    setPendingImages([]);
    setPendingVideo(null);
    setReplyTo(null);

    try {
      const batch = writeBatch(db);
      const msgPayload: Record<string, unknown> = {
        conversationId: activeConvId,
        senderId: profile.uid,
        senderName: profile.fullName.slice(0, 100),
        text: textVal.slice(0, 2000),
        mediaType,
        status: 'sent',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (profile.avatarUrl) msgPayload.senderAvatarUrl = profile.avatarUrl.slice(0, 500);
      if (currentImages.length > 0) {
        msgPayload.imageUrl = currentImages[0].slice(0, 500);
        msgPayload.imageUrls = currentImages.map((u) => u.slice(0, 500));
      }
      if (currentVideo) {
        msgPayload.videoUrl = currentVideo.videoUrl.slice(0, 600);
        msgPayload.videoPublicId = currentVideo.videoPublicId.slice(0, 240);
        msgPayload.videoFormat = currentVideo.videoFormat.slice(0, 20);
        msgPayload.videoDuration = currentVideo.videoDuration;
        if (currentVideo.videoThumbnailUrl) {
          msgPayload.videoThumbnailUrl = currentVideo.videoThumbnailUrl.slice(0, 600);
        }
      }
      if (currentReply) {
        msgPayload.replyToMessageId = currentReply.id;
        if (currentReply.senderName) {
          msgPayload.replyToSenderName = currentReply.senderName.slice(0, 100);
        }
        msgPayload.replyToText = currentReply.text.slice(0, 300);
      }

      batch.set(doc(db, 'conversations', activeConvId, 'messages', msgId), msgPayload);
      batch.update(doc(db, 'conversations', activeConvId), {
        lastMessage:
          mediaType === 'video'
            ? `Video: ${textVal}`.slice(0, 200)
            : mediaType === 'image'
            ? `Photo: ${textVal}`.slice(0, 200)
            : textVal.slice(0, 200),
        lastMessageSenderId: profile.uid,
        lastMessageStatus: 'sent',
        updatedAt: serverTimestamp(),
      });

      const peerId = activeConv.participantIds.find((id) => id !== profile.uid);
      if (peerId) {
        batch.update(doc(db, 'conversations', activeConvId, 'participants', peerId), {
          unreadCount: increment(1),
        });
      }

      await batch.commit();

      if (peerId) {
        await sendNotification({
          userId: peerId,
          actorId: profile.uid,
          kind: 'message',
          title: `Message from ${profile.fullName}`,
          body: textVal.slice(0, 120),
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setOptimisticMsgs((prev) => prev.filter((o) => o.id !== msgId));
      setSending(false);
    }
  };

  const handleToggleConvFlag = async (convId: string, field: 'pinned' | 'archived') => {
    if (!profile) return;
    const current = Boolean(myParticipantMap[convId]?.[field]);
    try {
      await updateDoc(doc(db, 'conversations', convId, 'participants', profile.uid), {
        [field]: !current,
      });
    } catch {
      // ignore
    }
  };

  const handleReactMessage = async (msg: MessageItem, emoji: string) => {
    if (!profile || !activeConvId) return;
    const nextReactions = { ...(msg.reactions || {}) };
    if (nextReactions[profile.uid] === emoji) {
      delete nextReactions[profile.uid];
    } else {
      nextReactions[profile.uid] = emoji;
    }
    setEmojiMenuMsgId(null);
    await updateDoc(doc(db, 'conversations', activeConvId, 'messages', msg.id), {
      reactions: nextReactions,
      updatedAt: serverTimestamp(),
    });
  };

  const handleDeleteForMe = async (msg: MessageItem) => {
    if (!profile || !activeConvId) return;
    await updateDoc(doc(db, 'conversations', activeConvId, 'messages', msg.id), {
      deletedForIds: arrayUnion(profile.uid),
      updatedAt: serverTimestamp(),
    });
  };

  const handleDeleteForEveryone = async (msg: MessageItem) => {
    if (!profile || !activeConvId || msg.senderId !== profile.uid) return;
    await updateDoc(doc(db, 'conversations', activeConvId, 'messages', msg.id), {
      text: 'This message was deleted',
      deletedForEveryone: true,
      imageUrl: '',
      imageUrls: [],
      videoUrl: '',
      updatedAt: serverTimestamp(),
    });
  };

  const handleForwardToConv = async (targetConv: ConversationItem) => {
    if (!profile || !forwardMsg) return;
    const targetMsgId = `msg_${Date.now()}_${profile.uid.slice(0, 6)}`;
    const targetPeerId = targetConv.participantIds.find((id) => id !== profile.uid);
    const batch = writeBatch(db);
    const payload: Record<string, unknown> = {
      conversationId: targetConv.id,
      senderId: profile.uid,
      senderName: profile.fullName.slice(0, 100),
      text: forwardMsg.text.slice(0, 2000),
      mediaType: forwardMsg.mediaType || 'text',
      forwarded: true,
      status: 'sent',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (forwardMsg.imageUrls && forwardMsg.imageUrls.length > 0) {
      payload.imageUrls = forwardMsg.imageUrls;
      payload.imageUrl = forwardMsg.imageUrls[0];
    } else if (forwardMsg.imageUrl) {
      payload.imageUrl = forwardMsg.imageUrl;
    }
    if (forwardMsg.videoUrl) {
      payload.videoUrl = forwardMsg.videoUrl;
      if (forwardMsg.videoThumbnailUrl) payload.videoThumbnailUrl = forwardMsg.videoThumbnailUrl;
    }
    batch.set(doc(db, 'conversations', targetConv.id, 'messages', targetMsgId), payload);
    batch.update(doc(db, 'conversations', targetConv.id), {
      lastMessage: `Forwarded: ${forwardMsg.text}`.slice(0, 200),
      lastMessageSenderId: profile.uid,
      lastMessageStatus: 'sent',
      updatedAt: serverTimestamp(),
    });
    if (targetPeerId) {
      batch.update(doc(db, 'conversations', targetConv.id, 'participants', targetPeerId), {
        unreadCount: increment(1),
      });
    }
    await batch.commit();
    setForwardMsg(null);
    setToast('Message forwarded.');
  };

  const visibleConversations = conversations
    .filter((conv) => {
      const part = myParticipantMap[conv.id];
      if (listTab === 'archived') return Boolean(part?.archived);
      if (listTab === 'pinned') return Boolean(part?.pinned) && !part?.archived;
      return !part?.archived;
    })
    .filter((conv) => {
      const term = convSearch.trim().toLowerCase();
      if (!term) return true;
      const peer = getPeerInfo(conv);
      return (
        peer.name.toLowerCase().includes(term) ||
        (conv.lastMessage || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      const pa = myParticipantMap[a.id]?.pinned ? 1 : 0;
      const pb = myParticipantMap[b.id]?.pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return toMillis(b.updatedAt) - toMillis(a.updatedAt);
    });

  const mergedMessages = useMemo(() => {
    const serverIds = new Set(messages.map((m) => m.id));
    const pending = optimisticMsgs.filter((o) => !serverIds.has(o.id));
    return [...messages, ...pending].filter(
      (m) => !(m.deletedForIds || []).includes(profile?.uid || '')
    );
  }, [messages, optimisticMsgs, profile?.uid]);

  const activePeer = activeConv ? getPeerInfo(activeConv) : null;
  const peerParticipant = activeParticipants.find((p) => p.userId !== profile?.uid);
  const peerIsTyping = Boolean(peerParticipant?.typing);

  const renderDeliveryIcon = (msg: MessageItem, isOptimistic: boolean) => {
    if (isOptimistic) return <Clock className="h-3 w-3 opacity-80" />;
    if (msg.status === 'seen' || msg.seenAt) {
      return <CheckCheck className="h-3.5 w-3.5 text-emerald-300" />;
    }
    if (msg.status === 'delivered' || msg.deliveredAt) {
      return <CheckCheck className="h-3.5 w-3.5 opacity-80" />;
    }
    return <Check className="h-3.5 w-3.5 opacity-80" />;
  };

  const primaryAiConv = pickPrimaryAiConversation(aiConversations);
  const activeAiConv =
    aiConversations.find((c) => c.id === activeAiConvId) ??
    (activeAiConvId ? primaryAiConv : null);

  const showPinnedLugaAi =
    listTab !== 'archived' &&
    (!convSearch.trim() ||
      'luga ai'.includes(convSearch.trim().toLowerCase()) ||
      (primaryAiConv?.lastMessagePreview || '')
        .toLowerCase()
        .includes(convSearch.trim().toLowerCase()));

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden grid grid-cols-1 md:grid-cols-12 h-[calc(100dvh-160px)] min-h-[540px] max-h-[820px]">
      {/* Left Conversation List */}
      <aside
        className={`md:col-span-4 border-r border-slate-200 dark:border-slate-800 flex flex-col min-h-0 ${
          activeConvId || activeAiConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="p-3.5 border-b border-slate-200 dark:border-slate-800 space-y-2.5 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Chats
            </h2>
            <button
              type="button"
              onClick={() => setShowNewChat((p) => !p)}
              className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-1.5"
            >
              <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showNewChat ? 'Back' : 'New Chat'}</span>
            </button>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={convSearch}
              onChange={(e) => setConvSearch(e.target.value)}
              placeholder={showNewChat ? 'Search LUGA members...' : 'Search conversations...'}
              className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
            />
          </div>

          {!showNewChat && (
            <div className="flex items-center gap-1 text-[11px] font-semibold">
              {(['all', 'pinned', 'archived'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setListTab(tab)}
                  className={`px-2.5 py-1 rounded-lg capitalize ${
                    listTab === tab
                      ? 'bg-emerald-800 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}
        </div>

        {showNewChat ? (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {directory
              .filter((p) => {
                const t = convSearch.trim().toLowerCase();
                return (
                  !t ||
                  p.fullName.toLowerCase().includes(t) ||
                  p.username.toLowerCase().includes(t) ||
                  p.classOrDept.toLowerCase().includes(t)
                );
              })
              .map((peer) => {
                const check = canMessageMember(profile, peer);
                return (
                  <button
                    key={peer.uid}
                    type="button"
                    disabled={!check.allowed}
                    title={check.reason}
                    onClick={() => void openOrCreateDm(peer)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 disabled:opacity-50 flex items-center gap-3"
                  >
                    <UserAvatar
                      name={peer.fullName}
                      avatarUrl={peer.avatarUrl}
                      size="sm"
                      online={peer.showOnlineStatus !== false && peer.isOnline === true}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {peer.fullName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        @{peer.username} · {peer.classOrDept}
                      </p>
                      {!check.allowed && (
                        <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate">
                          Messages restricted by user privacy
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {/* Single Permanent LUGA AI Chat Entry */}
            {showPinnedLugaAi && (
              <button
                type="button"
                onClick={() => void openLugaAi()}
                className={`w-full px-3 py-3 flex items-center gap-3 text-left transition-colors ${
                  activeAiConvId
                    ? 'bg-emerald-50 dark:bg-emerald-950/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <LugaAiAvatar size="md" showBadge />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                      <span>{LUGA_AI_IDENTITY.name}</span>
                      <BadgeCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    </p>
                    {Boolean(primaryAiConv?.updatedAt) && (
                      <span className="text-[10px] font-mono text-slate-400 shrink-0">
                        {formatFirestoreDate(primaryAiConv?.updatedAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                    {primaryAiConv?.lastMessagePreview || 'Chat with LUGA AI'}
                  </p>
                </div>
              </button>
            )}

            {visibleConversations.length === 0 && !showPinnedLugaAi ? (
              <div className="p-6 text-center space-y-2">
                <MessageSquare className="h-6 w-6 mx-auto text-emerald-700 dark:text-emerald-400" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  No chats in this view yet.
                </p>
              </div>
            ) : (
              visibleConversations.map((conv) => {
                const active = conv.id === activeConvId;
                const peer = getPeerInfo(conv);
                const myPart = myParticipantMap[conv.id];
                const unread = myPart?.unreadCount || 0;

                return (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 px-3 py-3 transition-colors ${
                      active
                        ? 'bg-emerald-50 dark:bg-emerald-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveAiConvId(null);
                        setActiveConvId(conv.id);
                      }}
                      className="flex-1 min-w-0 flex items-center gap-3 text-left"
                    >
                      <UserAvatar
                        name={peer.name}
                        avatarUrl={peer.avatarUrl}
                        size="md"
                        online={peer.online}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                            {myPart?.pinned && (
                              <Pin className="h-3 w-3 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            )}
                            <span className="truncate">{peer.name}</span>
                          </p>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            {formatFirestoreDate(conv.updatedAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {conv.lastMessage || 'Open chat'}
                          </p>
                          {unread > 0 && (
                            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-emerald-700 text-white text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                              {unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        type="button"
                        title={myPart?.pinned ? 'Unpin chat' : 'Pin chat'}
                        onClick={() => void handleToggleConvFlag(conv.id, 'pinned')}
                        className="p-1 rounded text-slate-400 hover:text-emerald-700"
                      >
                        <Pin className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title={myPart?.archived ? 'Unarchive chat' : 'Archive chat'}
                        onClick={() => void handleToggleConvFlag(conv.id, 'archived')}
                        className="p-1 rounded text-slate-400 hover:text-amber-600"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </aside>

      {/* Right Chat Window */}
      <section
        className={`md:col-span-8 flex flex-col min-h-0 ${
          activeConvId || activeAiConvId ? 'flex' : 'hidden md:flex'
        }`}
      >
        {activeAiConv && profile ? (
          <LugaAiChatPane
            profile={profile}
            conversation={activeAiConv}
            onBack={() => setActiveAiConvId(null)}
          />
        ) : !activeConv || !activePeer ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <MessageSquare className="h-9 w-9 text-emerald-700 dark:text-emerald-400" />
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              LUGA HUB Messages
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
              Select a chat from the list or start a new conversation.
            </p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveConvId(null)}
                  aria-label="Back to conversations"
                  className="md:hidden min-h-[40px] min-w-[40px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => activePeer.peerUid && setProfileUid(activePeer.peerUid)}
                  className="flex items-center gap-2.5 min-w-0 text-left"
                >
                  <UserAvatar
                    name={activePeer.name}
                    avatarUrl={activePeer.avatarUrl}
                    size="sm"
                    online={activePeer.online}
                  />
                  <div className="min-w-0">
                    <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activePeer.name}
                    </h3>
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 truncate">
                      {peerIsTyping
                        ? 'typing...'
                        : activePeer.online
                        ? 'Online'
                        : activePeer.lastSeen
                        ? `Last seen ${activePeer.lastSeen}`
                        : 'Private conversation'}
                    </p>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={Boolean(activeCall)}
                  onClick={() => {
                    if (!profile || !activePeer.peerUid) return;
                    const peerEntry: UserDirectoryEntry = activePeer.dir || {
                      uid: activePeer.peerUid,
                      fullName: activePeer.name,
                      username: 'member',
                      role: 'student',
                      status: 'approved',
                      classOrDept: 'LUGA HUB',
                      avatarUrl: activePeer.avatarUrl,
                    };
                    const perm = canMessageMember(profile, peerEntry);
                    if (!perm.allowed) {
                      setError(perm.reason || 'Calling is restricted by user privacy.');
                      return;
                    }
                    void initiatePrivateCall({
                      peer: peerEntry,
                      conversationId: activeConv.id,
                      callType: 'audio',
                    });
                  }}
                  aria-label={`Voice call ${activePeer.name}`}
                  title="Voice call"
                  className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-50 flex items-center justify-center"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeCall)}
                  onClick={() => {
                    if (!profile || !activePeer.peerUid) return;
                    const peerEntry: UserDirectoryEntry = activePeer.dir || {
                      uid: activePeer.peerUid,
                      fullName: activePeer.name,
                      username: 'member',
                      role: 'student',
                      status: 'approved',
                      classOrDept: 'LUGA HUB',
                      avatarUrl: activePeer.avatarUrl,
                    };
                    const perm = canMessageMember(profile, peerEntry);
                    if (!perm.allowed) {
                      setError(perm.reason || 'Calling is restricted by user privacy.');
                      return;
                    }
                    void initiatePrivateCall({
                      peer: peerEntry,
                      conversationId: activeConv.id,
                      callType: 'video',
                    });
                  }}
                  aria-label={`Video call ${activePeer.name}`}
                  title="Video call"
                  className="min-h-[40px] min-w-[40px] rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white flex items-center justify-center"
                >
                  <Video className="h-4 w-4" />
                </button>
              </div>
            </div>

            {toast && (
              <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-xs text-emerald-800 dark:text-emerald-200 flex justify-between">
                <span>{toast}</span>
                <button type="button" onClick={() => setToast(null)} className="underline">
                  Close
                </button>
              </div>
            )}

            {/* Messages Scroll Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 dark:bg-slate-950/50">
              {mergedMessages.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-10">
                  No messages yet. Say hello to {activePeer.name}!
                </p>
              ) : (
                mergedMessages.map((m) => {
                  const mine = m.senderId === profile?.uid;
                  const isOptimistic = optimisticMsgs.some((o) => o.id === m.id);
                  const imgs =
                    m.imageUrls && m.imageUrls.length > 0
                      ? m.imageUrls
                      : m.imageUrl
                      ? [m.imageUrl]
                      : [];
                  const canDeleteEveryone =
                    mine &&
                    !m.deletedForEveryone &&
                    Date.now() - toMillis(m.createdAt) < 15 * 60 * 1000;
                  const reactionEntries = Object.entries(m.reactions || {});

                  return (
                    <div
                      key={m.id}
                      className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="relative max-w-[85%] sm:max-w-[75%]">
                        {/* Quick Message Toolbar */}
                        {!isOptimistic && !m.deletedForEveryone && (
                          <div
                            className={`hidden group-hover:flex items-center gap-0.5 mb-1 px-1.5 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-xs text-slate-600 dark:text-slate-300 ${
                              mine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <button
                              type="button"
                              title="Reply"
                              onClick={() => setReplyTo(m)}
                              className="p-1 hover:text-emerald-700"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="React"
                              onClick={() =>
                                setEmojiMenuMsgId((cur) => (cur === m.id ? null : m.id))
                              }
                              className="p-1 hover:text-emerald-700"
                            >
                              <SmilePlus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Forward"
                              onClick={() => setForwardMsg(m)}
                              className="p-1 hover:text-emerald-700"
                            >
                              <Forward className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Copy text"
                              onClick={() => {
                                void navigator.clipboard?.writeText(m.text);
                                setToast('Copied message text.');
                              }}
                              className="p-1 hover:text-emerald-700"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {mine && (
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => {
                                  setEditingMsg(m);
                                  setDraft(m.text);
                                }}
                                className="p-1 hover:text-emerald-700"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="Delete for me"
                              onClick={() => void handleDeleteForMe(m)}
                              className="p-1 hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            {canDeleteEveryone && (
                              <button
                                type="button"
                                onClick={() => void handleDeleteForEveryone(m)}
                                className="px-1.5 py-0.5 text-[10px] font-semibold text-red-600 hover:underline"
                              >
                                Unsend
                              </button>
                            )}
                          </div>
                        )}

                        {emojiMenuMsgId === m.id && (
                          <div className="mb-1 inline-flex items-center gap-1 p-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                            {REACTION_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => void handleReactMessage(m, em)}
                                className="h-7 w-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-sm"
                              >
                                {em}
                              </button>
                            ))}
                          </div>
                        )}

                        <div
                          className={`rounded-2xl px-3.5 py-2.5 text-sm space-y-1.5 ${
                            mine
                              ? 'bg-emerald-800 text-white dark:bg-emerald-700 rounded-br-xs'
                              : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/80 dark:border-slate-700 rounded-bl-xs'
                          }`}
                        >
                          {m.forwarded && (
                            <p className="text-[10px] italic opacity-80">Forwarded</p>
                          )}

                          {m.replyToText && (
                            <div
                              className={`text-xs px-2.5 py-1.5 rounded-lg border-l-2 ${
                                mine
                                  ? 'bg-emerald-900/60 border-emerald-300 text-emerald-100'
                                  : 'bg-slate-100 dark:bg-slate-900 border-emerald-600 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <p className="font-semibold text-[11px]">{m.replyToSenderName}</p>
                              <p className="truncate">{m.replyToText}</p>
                            </div>
                          )}

                          {!m.deletedForEveryone && imgs.length > 0 && (
                            <div
                              className={`grid gap-1 ${
                                imgs.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                              }`}
                            >
                              {imgs.map((u, idx) => (
                                <button
                                  key={u + idx}
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      kind: 'images',
                                      urls: imgs,
                                      initialIndex: idx,
                                      caption: m.senderName,
                                    })
                                  }
                                  className="rounded-lg overflow-hidden"
                                >
                                  <img
                                    src={u}
                                    alt="Attachment"
                                    referrerPolicy="no-referrer"
                                    className="max-h-56 w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}

                          {!m.deletedForEveryone && m.videoUrl && (
                            <CustomVideoPlayer
                              src={m.videoUrl}
                              poster={m.videoThumbnailUrl}
                              variant="card"
                            />
                          )}

                          <p
                            className={`whitespace-pre-wrap leading-relaxed break-words ${
                              m.deletedForEveryone ? 'italic opacity-75 text-xs' : ''
                            }`}
                          >
                            {m.text}
                          </p>

                          <div className="flex items-center justify-end gap-1.5 text-[10px] opacity-80">
                            {m.edited && <span>(edited)</span>}
                            <span className="font-mono">{formatTimeShort(m.createdAt)}</span>
                            {mine && renderDeliveryIcon(m, isOptimistic)}
                          </div>
                        </div>

                        {reactionEntries.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {Object.entries(
                              reactionEntries.reduce<Record<string, number>>((acc, [, em]) => {
                                acc[em] = (acc[em] || 0) + 1;
                                return acc;
                              }, {})
                            ).map(([em, count]) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => void handleReactMessage(m, em)}
                                className="px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] shadow-2xs"
                              >
                                {em} {count > 1 ? count : ''}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {error && <p className="px-4 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

            {/* Composer Previews (Reply, Edit, Pending Media) */}
            <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shrink-0">
              {replyTo && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Replying to {replyTo.senderName}:{' '}
                    </span>
                    <span className="text-slate-600 dark:text-slate-300 truncate">
                      {replyTo.text}
                    </span>
                  </div>
                  <button type="button" onClick={() => setReplyTo(null)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {editingMsg && (
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-xs text-amber-800 dark:text-amber-200">
                  <span>Editing message</span>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingMsg(null);
                      setDraft('');
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {pendingImages.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {pendingImages.map((u, idx) => (
                    <div key={u + idx} className="relative h-14 w-14 rounded-lg overflow-hidden shrink-0">
                      <img src={u} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() =>
                          setPendingImages((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="absolute top-0.5 right-0.5 h-5 w-5 rounded-full bg-black/70 text-white flex items-center justify-center"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadingVideo && (
                <p className="text-xs font-mono text-emerald-700 dark:text-emerald-400">
                  Uploading video to Cloudinary... {videoProgress}%
                </p>
              )}

              {pendingVideo && !uploadingVideo && (
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs">
                  <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300">
                    <Film className="h-3.5 w-3.5" /> Video attached ({pendingVideo.videoFormat})
                  </span>
                  <button type="button" onClick={() => setPendingVideo(null)}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                <label
                  title="Attach photos (ImgBB)"
                  className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    disabled={uploadingImages || uploadingVideo}
                    onChange={(e) => void handleMultiImageAttach(e)}
                    className="sr-only"
                  />
                  {uploadingImages ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  )}
                </label>

                <label
                  title="Attach video (Cloudinary)"
                  className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                    disabled={uploadingVideo || uploadingImages}
                    onChange={(e) => void handleVideoAttach(e)}
                    className="sr-only"
                  />
                  <Film className="h-4 w-4" aria-hidden="true" />
                </label>

                <input
                  type="text"
                  maxLength={2000}
                  value={draft}
                  onChange={(e) => handleDraftChange(e.target.value)}
                  placeholder={
                    editingMsg
                      ? 'Edit your message...'
                      : pendingImages.length > 0 || pendingVideo
                      ? 'Add a caption...'
                      : 'Message...'
                  }
                  className="flex-1 min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
                />

                <button
                  type="submit"
                  disabled={
                    sending ||
                    uploadingImages ||
                    uploadingVideo ||
                    (!draft.trim() && pendingImages.length === 0 && !pendingVideo)
                  }
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{editingMsg ? 'Save' : 'Send'}</span>
                </button>
              </form>
            </div>
          </>
        )}
      </section>

      {/* Forward Message Modal */}
      {forwardMsg && (
        <div
          className="fixed inset-0 z-50 bg-black/55 flex items-center justify-center p-4"
          onClick={() => setForwardMsg(null)}
        >
          <div
            role="dialog"
            aria-label="Forward message"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Forward Message To
              </h3>
              <button type="button" onClick={() => setForwardMsg(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {conversations.map((c) => {
                const peer = getPeerInfo(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => void handleForwardToConv(c)}
                    className="w-full py-2.5 px-2 text-left flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg"
                  >
                    <UserAvatar name={peer.name} avatarUrl={peer.avatarUrl} size="xs" />
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {peer.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />

      <UserProfileModal
        uid={profileUid}
        onClose={() => setProfileUid(null)}
        onMessageUser={(uid) => {
          const peer = directoryByUid[uid];
          if (peer) void openOrCreateDm(peer);
        }}
        onReportUser={(t) =>
          setReportTarget({
            targetType: 'user',
            targetId: t.targetId,
            targetSummary: t.targetSummary,
          })
        }
      />

      <ReportModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmitted={() => setToast('Report submitted.')}
      />
    </div>
  );
}
