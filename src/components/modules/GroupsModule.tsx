import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  Crown,
  Edit3,
  Film,
  Flag,
  ImagePlus,
  Info,
  Loader2,
  Lock,
  Phone,
  PhoneCall,
  Pin,
  Plus,
  Reply,
  Send,
  Settings,
  Shield,
  SmilePlus,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCalls } from '../../context/CallContext';
import { sendNotification } from '../../lib/communityService';
import { db, handleFirestoreError, OperationType } from '../../lib/firebase';
import {
  uploadCommunityImage,
  uploadMultipleImagesToImgBB,
  uploadVideoToCloudinary,
  UploadedVideoMeta,
} from '../../lib/mediaService';
import {
  formatFirestoreDate,
  formatTimeShort,
  GroupItem,
  GroupMemberItem,
  GroupPostItem,
  GroupType,
  isAdminRole,
  toMillis,
  UserDirectoryEntry,
} from '../../types/luga';
import { CustomVideoPlayer } from '../common/CustomVideoPlayer';
import { LightboxMedia, MediaLightbox } from '../common/MediaLightbox';
import { UserAvatar } from '../common/UserAvatar';
import { UserProfileModal } from '../common/UserProfileModal';
import { ReportModal } from '../layout/ReportModal';

interface GroupsModuleProps {
  searchQuery: string;
  onMessageUser?: (uid: string) => void;
}

const GROUP_TYPES: { id: 'all' | GroupType; label: string }[] = [
  { id: 'all', label: 'All Groups' },
  { id: 'class', label: 'Classes' },
  { id: 'subject', label: 'Subjects' },
  { id: 'sports', label: 'Sports' },
  { id: 'club', label: 'Clubs' },
  { id: 'community', label: 'Community' },
];

const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '🙏', '🔥'];

export function GroupsModule({ searchQuery, onMessageUser }: GroupsModuleProps) {
  const { profile } = useAuth();
  const { initiateGroupCall, joinActiveGroupCall, activeCall } = useCalls();
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<number | null>(null);

  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [myMemberDocs, setMyMemberDocs] = useState<Record<string, GroupMemberItem | null>>({});
  const [directory, setDirectory] = useState<UserDirectoryEntry[]>([]);
  const [filter, setFilter] = useState<'all' | GroupType>('all');

  // Create Group State
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<GroupType>('class');
  const [privacy, setPrivacy] = useState<'open' | 'approval_required'>('open');
  const [newGroupAvatar, setNewGroupAvatar] = useState('');
  const [uploadingGroupAvatar, setUploadingGroupAvatar] = useState(false);
  const [creating, setCreating] = useState(false);

  // Active Group Chat State
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [members, setMembers] = useState<GroupMemberItem[]>([]);
  const [groupMessages, setGroupMessages] = useState<GroupPostItem[]>([]);
  const [showInfoPanel, setShowInfoPanel] = useState(false);
  const [infoTab, setInfoTab] = useState<'members' | 'media' | 'settings'>('members');

  // Group Message Composer
  const [postText, setPostText] = useState('');
  const [isAnnouncement, setIsAnnouncement] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [pendingVideo, setPendingVideo] = useState<UploadedVideoMeta | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [replyTo, setReplyTo] = useState<GroupPostItem | null>(null);
  const [editingMsg, setEditingMsg] = useState<GroupPostItem | null>(null);
  const [emojiMenuId, setEmojiMenuId] = useState<string | null>(null);
  const [addMemberSearch, setAddMemberSearch] = useState('');

  // Edit Group Info State
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [lightboxMedia, setLightboxMedia] = useState<LightboxMedia | null>(null);
  const [profileUid, setProfileUid] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<{
    targetType: 'post' | 'comment' | 'user' | 'group';
    targetId: string;
    targetSummary: string;
  } | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'groups'), orderBy('updatedAt', 'desc'), limit(50)),
      (snap) => {
        setGroups(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GroupItem, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groups')
    );

    const unsubDir = onSnapshot(
      query(collection(db, 'userDirectory'), orderBy('fullName', 'asc'), limit(100)),
      (snap) => {
        setDirectory(
          snap.docs
            .map((d) => d.data() as UserDirectoryEntry)
            .filter((u) => u.status === 'approved')
        );
      },
      () => {}
    );

    return () => {
      unsub();
      unsubDir();
    };
  }, []);

  // Real-time own membership listener per visible group
  useEffect(() => {
    if (!profile || groups.length === 0) return;
    const unsubs = groups.slice(0, 30).map((g) =>
      onSnapshot(
        doc(db, 'groups', g.id, 'members', profile.uid),
        (snap) => {
          setMyMemberDocs((prev) => ({
            ...prev,
            [g.id]: snap.exists() ? (snap.data() as GroupMemberItem) : null,
          }));
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [profile?.uid, groups.map((g) => g.id).join(',')]);

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === selectedGroupId) ?? null,
    [groups, selectedGroupId]
  );

  // Listen to active group members & messages
  useEffect(() => {
    if (!selectedGroupId || !profile) {
      setMembers([]);
      setGroupMessages([]);
      return;
    }

    const unsubMembers = onSnapshot(
      collection(db, 'groups', selectedGroupId, 'members'),
      (snap) => {
        setMembers(snap.docs.map((d) => d.data() as GroupMemberItem));
      },
      () => {}
    );

    const unsubMsgs = onSnapshot(
      query(
        collection(db, 'groups', selectedGroupId, 'posts'),
        orderBy('createdAt', 'asc'),
        limit(80)
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupPostItem, 'id'>),
        }));
        setGroupMessages(list);

        // Mark recent messages read by me if active member
        const myDoc = myMemberDocs[selectedGroupId];
        if (myDoc && myDoc.status !== 'pending') {
          void updateDoc(doc(db, 'groups', selectedGroupId, 'members', profile.uid), {
            lastReadAt: serverTimestamp(),
            unreadCount: 0,
          }).catch(() => {});

          const unreadRecent = list
            .slice(-15)
            .filter(
              (m) =>
                m.authorId !== profile.uid &&
                !(m.readByIds || []).includes(profile.uid) &&
                (m.readByIds || []).length < 40
            );
          if (unreadRecent.length > 0) {
            const batch = writeBatch(db);
            unreadRecent.forEach((m) => {
              batch.update(doc(db, 'groups', selectedGroupId, 'posts', m.id), {
                readByIds: arrayUnion(profile.uid),
                updatedAt: serverTimestamp(),
              });
            });
            void batch.commit().catch(() => {});
          }
        }
      },
      () => {}
    );

    return () => {
      unsubMembers();
      unsubMsgs();
    };
  }, [selectedGroupId, profile?.uid]);

  useEffect(() => {
    if (selectedGroup) {
      setEditGroupName(selectedGroup.name);
      setEditGroupDesc(selectedGroup.description);
    }
  }, [selectedGroup?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [groupMessages.length, selectedGroupId]);

  const handleGroupAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    forExistingGroup = false
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setUploadingGroupAvatar(true);
    try {
      const url = await uploadCommunityImage(file);
      if (forExistingGroup && selectedGroup) {
        await updateDoc(doc(db, 'groups', selectedGroup.id), {
          avatarUrl: url.slice(0, 500),
          updatedAt: serverTimestamp(),
        });
        setToast('Group profile picture updated via ImgBB.');
      } else {
        setNewGroupAvatar(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Group picture upload failed.');
    } finally {
      setUploadingGroupAvatar(false);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setCreating(true);
    setError(null);
    const groupId = `grp_${Date.now()}_${profile.uid.slice(0, 6)}`;
    try {
      const batch = writeBatch(db);
      const groupPayload: Record<string, unknown> = {
        name: name.trim().slice(0, 100),
        description: description.trim().slice(0, 500),
        type,
        privacy,
        onlyAdminsCanMessage: false,
        onlyAdminsCanEditInfo: true,
        createdBy: profile.uid,
        memberCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (newGroupAvatar) groupPayload.avatarUrl = newGroupAvatar.slice(0, 500);

      batch.set(doc(db, 'groups', groupId), groupPayload);
      batch.set(doc(db, 'groups', groupId, 'members', profile.uid), {
        userId: profile.uid,
        groupId,
        memberName: profile.fullName.slice(0, 100),
        memberUsername: profile.username.slice(0, 30),
        ...(profile.avatarUrl ? { memberAvatarUrl: profile.avatarUrl.slice(0, 500) } : {}),
        groupRole: 'admin',
        status: 'active',
        typing: false,
        unreadCount: 0,
        lastReadAt: serverTimestamp(),
        joinedAt: serverTimestamp(),
      });
      await batch.commit();
      setName('');
      setDescription('');
      setNewGroupAvatar('');
      setShowCreate(false);
      setSelectedGroupId(groupId);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `groups/${groupId}`);
    } finally {
      setCreating(false);
    }
  };

  const handleJoinLeave = async (group: GroupItem) => {
    if (!profile) return;
    const myDoc = myMemberDocs[group.id];
    const batch = writeBatch(db);
    const memberRef = doc(db, 'groups', group.id, 'members', profile.uid);
    const groupRef = doc(db, 'groups', group.id);
    try {
      if (myDoc) {
        batch.delete(memberRef);
        if (myDoc.status !== 'pending') {
          batch.update(groupRef, {
            memberCount: Math.max(0, group.memberCount - 1),
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        if (selectedGroupId === group.id) setSelectedGroupId(null);
      } else {
        const needsApproval = group.privacy === 'approval_required';
        batch.set(memberRef, {
          userId: profile.uid,
          groupId: group.id,
          memberName: profile.fullName.slice(0, 100),
          memberUsername: profile.username.slice(0, 30),
          ...(profile.avatarUrl ? { memberAvatarUrl: profile.avatarUrl.slice(0, 500) } : {}),
          groupRole: 'member',
          status: needsApproval ? 'pending' : 'active',
          typing: false,
          unreadCount: 0,
          lastReadAt: serverTimestamp(),
          joinedAt: serverTimestamp(),
        });
        if (!needsApproval) {
          batch.update(groupRef, {
            memberCount: group.memberCount + 1,
            updatedAt: serverTimestamp(),
          });
        }
        await batch.commit();
        if (needsApproval) {
          setToast('Join request sent to group admins.');
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `groups/${group.id}/members/${profile.uid}`);
    }
  };

  const setGroupTyping = (typing: boolean) => {
    if (!selectedGroupId || !profile) return;
    void updateDoc(doc(db, 'groups', selectedGroupId, 'members', profile.uid), {
      typing,
    }).catch(() => {});
  };

  const handlePostTextChange = (val: string) => {
    setPostText(val);
    setGroupTyping(val.trim().length > 0);
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => setGroupTyping(false), 2400);
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
      setError(err instanceof Error ? err.message : 'ImgBB upload failed.');
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
      const meta = await uploadVideoToCloudinary(file, 'groups', setVideoProgress);
      setPendingVideo(meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cloudinary video upload failed.');
    } finally {
      setUploadingVideo(false);
    }
  };

  const handleSendGroupMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !selectedGroup) return;

    if (editingMsg) {
      if (!postText.trim()) return;
      await updateDoc(doc(db, 'groups', selectedGroup.id, 'posts', editingMsg.id), {
        content: postText.trim().slice(0, 1500),
        edited: true,
        updatedAt: serverTimestamp(),
      });
      setEditingMsg(null);
      setPostText('');
      return;
    }

    if (!postText.trim() && pendingImages.length === 0 && !pendingVideo) return;

    setGroupTyping(false);
    const mediaType: 'text' | 'image' | 'video' = pendingVideo
      ? 'video'
      : pendingImages.length > 0
      ? 'image'
      : 'text';
    const contentVal =
      postText.trim() ||
      (mediaType === 'video' ? 'Shared a video' : mediaType === 'image' ? 'Shared photos' : '');
    const postId = `gpost_${Date.now()}_${profile.uid.slice(0, 6)}`;

    const payload: Record<string, unknown> = {
      groupId: selectedGroup.id,
      authorId: profile.uid,
      authorName: profile.fullName.slice(0, 100),
      content: contentVal.slice(0, 1500),
      isAnnouncement,
      mediaType,
      readByIds: [profile.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (profile.avatarUrl) payload.authorAvatarUrl = profile.avatarUrl.slice(0, 500);
    if (pendingImages.length > 0) {
      payload.imageUrls = pendingImages.map((u) => u.slice(0, 500));
    }
    if (pendingVideo) {
      payload.videoUrl = pendingVideo.videoUrl.slice(0, 600);
      payload.videoPublicId = pendingVideo.videoPublicId.slice(0, 240);
      payload.videoFormat = pendingVideo.videoFormat.slice(0, 20);
      payload.videoDuration = pendingVideo.videoDuration;
      if (pendingVideo.videoThumbnailUrl) {
        payload.videoThumbnailUrl = pendingVideo.videoThumbnailUrl.slice(0, 600);
      }
    }
    if (replyTo) {
      payload.replyToId = replyTo.id;
      payload.replyToAuthorName = replyTo.authorName.slice(0, 100);
      payload.replyToContent = replyTo.content.slice(0, 300);
    }

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'groups', selectedGroup.id, 'posts', postId), payload);
      batch.update(doc(db, 'groups', selectedGroup.id), {
        lastMessage: `${profile.fullName.split(' ')[0]}: ${contentVal}`.slice(0, 300),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      setPostText('');
      setIsAnnouncement(false);
      setPendingImages([]);
      setPendingVideo(null);
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send group message.');
    }
  };

  const handleReactGroupMsg = async (msg: GroupPostItem, emoji: string) => {
    if (!profile || !selectedGroup) return;
    const next = { ...(msg.reactions || {}) };
    if (next[profile.uid] === emoji) {
      delete next[profile.uid];
    } else {
      next[profile.uid] = emoji;
    }
    setEmojiMenuId(null);
    await updateDoc(doc(db, 'groups', selectedGroup.id, 'posts', msg.id), {
      reactions: next,
      updatedAt: serverTimestamp(),
    });
  };

  const handleDeleteGroupMsg = async (msg: GroupPostItem) => {
    if (!selectedGroup) return;
    await updateDoc(doc(db, 'groups', selectedGroup.id, 'posts', msg.id), {
      content: 'This message was deleted',
      deletedForEveryone: true,
      imageUrls: [],
      videoUrl: '',
      updatedAt: serverTimestamp(),
    });
  };

  const handlePinMessage = async (msg: GroupPostItem) => {
    if (!selectedGroup) return;
    await updateDoc(doc(db, 'groups', selectedGroup.id), {
      pinnedMessageId: msg.id,
      pinnedMessageText: `${msg.authorName}: ${msg.content}`.slice(0, 280),
      updatedAt: serverTimestamp(),
    });
    setToast('Message pinned to group header.');
  };

  const handleClearPinned = async () => {
    if (!selectedGroup) return;
    await updateDoc(doc(db, 'groups', selectedGroup.id), {
      pinnedMessageId: '',
      pinnedMessageText: '',
      updatedAt: serverTimestamp(),
    });
  };

  // Group Admin Controls
  const handleSaveGroupInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGroup) return;
    setSavingGroupInfo(true);
    try {
      await updateDoc(doc(db, 'groups', selectedGroup.id), {
        name: editGroupName.trim().slice(0, 100),
        description: editGroupDesc.trim().slice(0, 500),
        updatedAt: serverTimestamp(),
      });
      setToast('Group info updated.');
    } finally {
      setSavingGroupInfo(false);
    }
  };

  const handleToggleSetting = async (
    field: 'onlyAdminsCanMessage' | 'onlyAdminsCanEditInfo' | 'privacy',
    value: boolean | 'open' | 'approval_required'
  ) => {
    if (!selectedGroup) return;
    await updateDoc(doc(db, 'groups', selectedGroup.id), {
      [field]: value,
      updatedAt: serverTimestamp(),
    });
  };

  const handleAddMemberToGroup = async (user: UserDirectoryEntry) => {
    if (!selectedGroup || !profile) return;
    const batch = writeBatch(db);
    batch.set(doc(db, 'groups', selectedGroup.id, 'members', user.uid), {
      userId: user.uid,
      groupId: selectedGroup.id,
      memberName: user.fullName.slice(0, 100),
      memberUsername: user.username.slice(0, 30),
      ...(user.avatarUrl ? { memberAvatarUrl: user.avatarUrl.slice(0, 500) } : {}),
      groupRole: 'member',
      status: 'active',
      typing: false,
      unreadCount: 0,
      joinedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'groups', selectedGroup.id), {
      memberCount: selectedGroup.memberCount + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    await sendNotification({
      userId: user.uid,
      actorId: profile.uid,
      kind: 'group',
      title: `Added to ${selectedGroup.name}`,
      body: `${profile.fullName} added you to the group "${selectedGroup.name}".`,
    });
    setToast(`Added ${user.fullName} to group.`);
  };

  const handleMemberRoleToggle = async (member: GroupMemberItem) => {
    if (!selectedGroup) return;
    const nextRole = member.groupRole === 'admin' ? 'member' : 'admin';
    await updateDoc(doc(db, 'groups', selectedGroup.id, 'members', member.userId), {
      groupRole: nextRole,
    });
  };

  const handleApprovePending = async (member: GroupMemberItem) => {
    if (!selectedGroup || !profile) return;
    const batch = writeBatch(db);
    batch.update(doc(db, 'groups', selectedGroup.id, 'members', member.userId), {
      status: 'active',
    });
    batch.update(doc(db, 'groups', selectedGroup.id), {
      memberCount: selectedGroup.memberCount + 1,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    await sendNotification({
      userId: member.userId,
      actorId: profile.uid,
      kind: 'group',
      title: `Approved to join ${selectedGroup.name}`,
      body: `You are now an active member of ${selectedGroup.name}.`,
    });
  };

  const handleRemoveMember = async (member: GroupMemberItem) => {
    if (!selectedGroup) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, 'groups', selectedGroup.id, 'members', member.userId));
    if (member.status !== 'pending') {
      batch.update(doc(db, 'groups', selectedGroup.id), {
        memberCount: Math.max(0, selectedGroup.memberCount - 1),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  };

  if (selectedGroup && profile) {
    const myMember = myMemberDocs[selectedGroup.id];
    const isActiveMember = Boolean(myMember && myMember.status !== 'pending');
    const isPending = Boolean(myMember && myMember.status === 'pending');
    const isGroupAdmin =
      isAdminRole(profile.role) || (isActiveMember && myMember?.groupRole === 'admin');
    const isGroupModOrAdmin = isGroupAdmin || myMember?.groupRole === 'moderator';
    const canSendMessage =
      isActiveMember && (!selectedGroup.onlyAdminsCanMessage || isGroupModOrAdmin);
    const canEditInfo =
      isGroupAdmin || (isActiveMember && selectedGroup.onlyAdminsCanEditInfo !== true);

    const activeMembers = members.filter((m) => m.status !== 'pending');
    const pendingMembers = members.filter((m) => m.status === 'pending');
    const typingNames = activeMembers
      .filter((m) => m.typing && m.userId !== profile.uid)
      .map((m) => (m.memberName || 'Someone').split(' ')[0]);

    const sharedMediaMsgs = groupMessages.filter(
      (m) => !m.deletedForEveryone && ((m.imageUrls && m.imageUrls.length > 0) || m.videoUrl)
    );
    const nonMembers = directory.filter(
      (u) =>
        !members.some((m) => m.userId === u.uid) &&
        (!addMemberSearch.trim() ||
          u.fullName.toLowerCase().includes(addMemberSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(addMemberSearch.toLowerCase()))
    );

    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden flex flex-col h-[calc(100dvh-160px)] min-h-[540px] max-h-[820px]">
        {/* Group Chat Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => {
                setSelectedGroupId(null);
                setShowInfoPanel(false);
              }}
              aria-label="Back to groups"
              className="min-h-[38px] min-w-[38px] rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setShowInfoPanel((p) => !p)}
              className="flex items-center gap-2.5 min-w-0 text-left"
            >
              <UserAvatar
                name={selectedGroup.name}
                avatarUrl={selectedGroup.avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
                  {selectedGroup.name}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {typingNames.length > 0
                    ? `${typingNames.join(', ')} typing...`
                    : `${selectedGroup.memberCount} members · ${selectedGroup.type}`}
                </p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {isActiveMember && (
              <>
                <button
                  type="button"
                  disabled={Boolean(activeCall)}
                  onClick={() =>
                    void initiateGroupCall({
                      group: selectedGroup,
                      memberIds: activeMembers.map((m) => m.userId),
                      callType: 'audio',
                    })
                  }
                  aria-label="Start group voice call"
                  title="Group voice call"
                  className="min-h-[38px] min-w-[38px] rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 disabled:opacity-50 flex items-center justify-center"
                >
                  <Phone className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={Boolean(activeCall)}
                  onClick={() =>
                    void initiateGroupCall({
                      group: selectedGroup,
                      memberIds: activeMembers.map((m) => m.userId),
                      callType: 'video',
                    })
                  }
                  aria-label="Start group video call"
                  title="Group video call"
                  className="min-h-[38px] min-w-[38px] rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white flex items-center justify-center"
                >
                  <Video className="h-4 w-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={() => setShowInfoPanel((p) => !p)}
              className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 ${
                showInfoPanel
                  ? 'border-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
              }`}
            >
              <Info className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Group Info</span>
              {pendingMembers.length > 0 && isGroupAdmin && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px]">
                  {pendingMembers.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() =>
                setReportTarget({
                  targetType: 'group',
                  targetId: selectedGroup.id,
                  targetSummary: `Group: ${selectedGroup.name}`,
                })
              }
              aria-label="Report group"
              className="min-h-[36px] min-w-[36px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-red-600 flex items-center justify-center"
            >
              <Flag className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Ongoing Group Call Banner */}
        {selectedGroup.activeCallId && isActiveMember && !showInfoPanel && (
          <div className="px-4 py-2.5 bg-emerald-800 dark:bg-emerald-900 text-white flex items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <PhoneCall className="h-4 w-4 animate-pulse shrink-0" />
              <span className="font-semibold truncate">
                Ongoing Group {selectedGroup.activeCallType === 'video' ? 'Video' : 'Voice'} Call
              </span>
            </div>
            <button
              type="button"
              onClick={() => void joinActiveGroupCall(selectedGroup)}
              className="min-h-[32px] px-3 rounded-lg bg-white text-emerald-900 hover:bg-emerald-50 font-bold shrink-0"
            >
              {activeCall?.callId === selectedGroup.activeCallId ? 'Return to Call' : 'Join Call'}
            </button>
          </div>
        )}

        {/* Pinned Message Banner */}
        {selectedGroup.pinnedMessageText && !showInfoPanel && (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/50 border-b border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between gap-2 text-xs shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Pin className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
              <span className="truncate text-emerald-900 dark:text-emerald-200 font-medium">
                {selectedGroup.pinnedMessageText}
              </span>
            </div>
            {isGroupAdmin && (
              <button
                type="button"
                onClick={() => void handleClearPinned()}
                className="text-[11px] underline text-emerald-800 dark:text-emerald-300 shrink-0"
              >
                Unpin
              </button>
            )}
          </div>
        )}

        {toast && (
          <div className="mx-4 mt-2 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-xs text-emerald-800 dark:text-emerald-200 flex justify-between shrink-0">
            <span>{toast}</span>
            <button type="button" onClick={() => setToast(null)} className="underline">
              Close
            </button>
          </div>
        )}

        {showInfoPanel ? (
          /* Group Info, Admin Controls & Shared Media View */
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3.5">
                <div className="relative">
                  <UserAvatar
                    name={selectedGroup.name}
                    avatarUrl={selectedGroup.avatarUrl}
                    size="xl"
                  />
                  {canEditInfo && (
                    <label
                      title="Change group picture (ImgBB)"
                      className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-emerald-800 text-white flex items-center justify-center cursor-pointer shadow"
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => void handleGroupAvatarUpload(e, true)}
                        className="sr-only"
                      />
                      {uploadingGroupAvatar ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                    </label>
                  )}
                </div>
                <div>
                  <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {selectedGroup.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {selectedGroup.type} · {selectedGroup.memberCount} members ·{' '}
                    {selectedGroup.privacy === 'approval_required'
                      ? 'Approval required'
                      : 'Open group'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleJoinLeave(selectedGroup)}
                className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-semibold ${
                  myMember
                    ? 'border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400'
                    : 'bg-emerald-800 text-white'
                }`}
              >
                {isPending ? 'Cancel Request' : myMember ? 'Leave Group' : 'Join Group'}
              </button>
            </div>

            <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setInfoTab('members')}
                className={`px-3 py-1.5 rounded-lg ${
                  infoTab === 'members'
                    ? 'bg-emerald-800 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Members ({activeMembers.length})
              </button>
              <button
                type="button"
                onClick={() => setInfoTab('media')}
                className={`px-3 py-1.5 rounded-lg ${
                  infoTab === 'media'
                    ? 'bg-emerald-800 text-white'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
              >
                Shared Media ({sharedMediaMsgs.length})
              </button>
              {canEditInfo && (
                <button
                  type="button"
                  onClick={() => setInfoTab('settings')}
                  className={`px-3 py-1.5 rounded-lg flex items-center gap-1 ${
                    infoTab === 'settings'
                      ? 'bg-emerald-800 text-white'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <Settings className="h-3.5 w-3.5" />
                  <span>Admin &amp; Info</span>
                </button>
              )}
            </div>

            {infoTab === 'members' && (
              <div className="space-y-4">
                {isGroupAdmin && pendingMembers.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/70 dark:bg-amber-950/30 space-y-2.5">
                    <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                      Pending Join Requests ({pendingMembers.length})
                    </h4>
                    {pendingMembers.map((pm) => (
                      <div key={pm.userId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {pm.memberName || pm.userId}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => void handleApprovePending(pm)}
                            className="px-2.5 py-1 rounded bg-emerald-800 text-white font-semibold"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(pm)}
                            className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isGroupAdmin && (
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Add Member</span>
                    </h4>
                    <input
                      type="search"
                      value={addMemberSearch}
                      onChange={(e) => setAddMemberSearch(e.target.value)}
                      placeholder="Search school directory to add..."
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                    {addMemberSearch.trim() && (
                      <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {nonMembers.slice(0, 8).map((u) => (
                          <div key={u.uid} className="py-2 flex items-center justify-between gap-2 text-xs">
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {u.fullName} (@{u.username})
                            </span>
                            <button
                              type="button"
                              onClick={() => void handleAddMemberToGroup(u)}
                              className="px-2.5 py-1 rounded bg-emerald-800 text-white font-semibold"
                            >
                              Add
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {activeMembers.map((m) => (
                    <div
                      key={m.userId}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setProfileUid(m.userId)}
                        className="flex items-center gap-2.5 min-w-0 text-left"
                      >
                        <UserAvatar
                          name={m.memberName || 'Member'}
                          avatarUrl={m.memberAvatarUrl}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1">
                            <span>{m.memberName || m.userId}</span>
                            {m.groupRole === 'admin' && (
                              <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                            {m.groupRole}
                          </p>
                        </div>
                      </button>

                      {isGroupAdmin && m.userId !== profile.uid && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void handleMemberRoleToggle(m)}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 font-semibold"
                          >
                            {m.groupRole === 'admin' ? 'Demote' : 'Make Admin'}
                          </button>
                          <button
                            type="button"
                            title="Remove member"
                            onClick={() => void handleRemoveMember(m)}
                            className="p-1.5 rounded text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {infoTab === 'media' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {sharedMediaMsgs.length === 0 ? (
                  <p className="col-span-full text-xs text-slate-500 py-6 text-center">
                    No photos or videos shared in this group yet.
                  </p>
                ) : (
                  sharedMediaMsgs.flatMap((m) => {
                    const items: React.ReactNode[] = [];
                    (m.imageUrls || []).forEach((u, idx) =>
                      items.push(
                        <button
                          key={m.id + idx}
                          type="button"
                          onClick={() =>
                            setLightboxMedia({
                              kind: 'images',
                              urls: m.imageUrls || [u],
                              initialIndex: idx,
                              caption: `${m.authorName} in ${selectedGroup.name}`,
                            })
                          }
                          className="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800"
                        >
                          <img src={u} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                        </button>
                      )
                    );
                    if (m.videoUrl) {
                      items.push(
                        <button
                          key={m.id + '_vid'}
                          type="button"
                          onClick={() =>
                            setLightboxMedia({
                              kind: 'video',
                              url: m.videoUrl!,
                              posterUrl: m.videoThumbnailUrl,
                              caption: `${m.authorName} in ${selectedGroup.name}`,
                            })
                          }
                          className="relative aspect-square rounded-lg overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-white"
                        >
                          {m.videoThumbnailUrl && (
                            <img
                              src={m.videoThumbnailUrl}
                              alt=""
                              className="h-full w-full object-cover opacity-75"
                            />
                          )}
                          <Film className="absolute h-6 w-6" />
                        </button>
                      );
                    }
                    return items;
                  })
                )}
              </div>
            )}

            {infoTab === 'settings' && canEditInfo && (
              <div className="space-y-5">
                <form onSubmit={handleSaveGroupInfo} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold mb-1">Group Name</label>
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={100}
                      value={editGroupName}
                      onChange={(e) => setEditGroupName(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1">Description</label>
                    <textarea
                      rows={3}
                      required
                      minLength={2}
                      maxLength={500}
                      value={editGroupDesc}
                      onChange={(e) => setEditGroupDesc(e.target.value)}
                      className="w-full p-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={savingGroupInfo}
                    className="min-h-[38px] px-4 rounded-lg bg-emerald-800 text-white text-xs font-semibold"
                  >
                    {savingGroupInfo ? 'Saving...' : 'Save Group Details'}
                  </button>
                </form>

                {isGroupAdmin && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Group Governance Controls</span>
                    </h4>
                    <label className="flex items-center justify-between gap-3 text-xs">
                      <span>Only admins can send messages</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGroup.onlyAdminsCanMessage)}
                        onChange={(e) =>
                          void handleToggleSetting('onlyAdminsCanMessage', e.target.checked)
                        }
                      />
                    </label>
                    <label className="flex items-center justify-between gap-3 text-xs">
                      <span>Only admins can edit group info</span>
                      <input
                        type="checkbox"
                        checked={Boolean(selectedGroup.onlyAdminsCanEditInfo)}
                        onChange={(e) =>
                          void handleToggleSetting('onlyAdminsCanEditInfo', e.target.checked)
                        }
                      />
                    </label>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span>Membership approval</span>
                      <select
                        value={selectedGroup.privacy || 'open'}
                        onChange={(e) =>
                          void handleToggleSetting(
                            'privacy',
                            e.target.value as 'open' | 'approval_required'
                          )
                        }
                        className="h-9 px-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                      >
                        <option value="open">Open join</option>
                        <option value="approval_required">Admin approval required</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Real-Time Group Chat Room */
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/60 dark:bg-slate-950/50">
              {groupMessages.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-10">
                  No messages in {selectedGroup.name} yet.
                </p>
              ) : (
                groupMessages.map((gp) => {
                  const mine = gp.authorId === profile.uid;
                  const canEditOrDelete = mine && !gp.deletedForEveryone;
                  const canAdminDelete = isGroupAdmin && !gp.deletedForEveryone;
                  const reactionEntries = Object.entries(gp.reactions || {});

                  return (
                    <div
                      key={gp.id}
                      className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      <div className="relative max-w-[85%] sm:max-w-[75%]">
                        {!gp.deletedForEveryone && isActiveMember && (
                          <div
                            className={`hidden group-hover:flex items-center gap-0.5 mb-1 px-1.5 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 ${
                              mine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            <button
                              type="button"
                              title="Reply"
                              onClick={() => setReplyTo(gp)}
                              className="p-1 hover:text-emerald-700"
                            >
                              <Reply className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              title="React"
                              onClick={() =>
                                setEmojiMenuId((cur) => (cur === gp.id ? null : gp.id))
                              }
                              className="p-1 hover:text-emerald-700"
                            >
                              <SmilePlus className="h-3.5 w-3.5" />
                            </button>
                            {isGroupAdmin && (
                              <button
                                type="button"
                                title="Pin message"
                                onClick={() => void handlePinMessage(gp)}
                                className="p-1 hover:text-emerald-700"
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {canEditOrDelete && (
                              <button
                                type="button"
                                title="Edit"
                                onClick={() => {
                                  setEditingMsg(gp);
                                  setPostText(gp.content);
                                }}
                                className="p-1 hover:text-emerald-700"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {(canEditOrDelete || canAdminDelete) && (
                              <button
                                type="button"
                                title="Delete message"
                                onClick={() => void handleDeleteGroupMsg(gp)}
                                className="p-1 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {emojiMenuId === gp.id && (
                          <div className="mb-1 inline-flex items-center gap-1 p-1 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm">
                            {REACTION_EMOJIS.map((em) => (
                              <button
                                key={em}
                                type="button"
                                onClick={() => void handleReactGroupMsg(gp, em)}
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
                          {!mine && (
                            <button
                              type="button"
                              onClick={() => setProfileUid(gp.authorId)}
                              className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1.5"
                            >
                              <span>{gp.authorName}</span>
                              {gp.isAnnouncement && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide">
                                  · Announcement
                                </span>
                              )}
                            </button>
                          )}
                          {mine && gp.isAnnouncement && (
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                              Group Announcement
                            </p>
                          )}

                          {gp.replyToContent && (
                            <div
                              className={`text-xs px-2.5 py-1.5 rounded-lg border-l-2 ${
                                mine
                                  ? 'bg-emerald-900/60 border-emerald-300 text-emerald-100'
                                  : 'bg-slate-100 dark:bg-slate-900 border-emerald-600 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              <p className="font-semibold text-[11px]">{gp.replyToAuthorName}</p>
                              <p className="truncate">{gp.replyToContent}</p>
                            </div>
                          )}

                          {!gp.deletedForEveryone && gp.imageUrls && gp.imageUrls.length > 0 && (
                            <div
                              className={`grid gap-1 ${
                                gp.imageUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                              }`}
                            >
                              {gp.imageUrls.map((u, idx) => (
                                <button
                                  key={u + idx}
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      kind: 'images',
                                      urls: gp.imageUrls || [u],
                                      initialIndex: idx,
                                      caption: gp.authorName,
                                    })
                                  }
                                  className="rounded-lg overflow-hidden"
                                >
                                  <img
                                    src={u}
                                    alt="Group photo"
                                    referrerPolicy="no-referrer"
                                    className="max-h-56 w-full object-cover"
                                  />
                                </button>
                              ))}
                            </div>
                          )}

                          {!gp.deletedForEveryone && gp.videoUrl && (
                            <CustomVideoPlayer
                              src={gp.videoUrl}
                              poster={gp.videoThumbnailUrl}
                              variant="card"
                            />
                          )}

                          <p
                            className={`whitespace-pre-wrap leading-relaxed break-words ${
                              gp.deletedForEveryone ? 'italic opacity-75 text-xs' : ''
                            }`}
                          >
                            {gp.content}
                          </p>

                          <div className="flex items-center justify-end gap-1.5 text-[10px] opacity-80">
                            {gp.edited && <span>(edited)</span>}
                            <span className="font-mono">{formatTimeShort(gp.createdAt)}</span>
                            {mine && (gp.readByIds?.length || 0) > 1 && (
                              <span
                                title={`Read by ${(gp.readByIds?.length || 1) - 1} member(s)`}
                                className="inline-flex items-center gap-0.5 text-emerald-300"
                              >
                                <CheckCheck className="h-3.5 w-3.5" />
                                <span className="font-mono">
                                  {(gp.readByIds?.length || 1) - 1}
                                </span>
                              </span>
                            )}
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
                                onClick={() => void handleReactGroupMsg(gp, em)}
                                className="px-1.5 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]"
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
              <div ref={chatEndRef} />
            </div>

            {error && <p className="px-4 py-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

            {/* Group Composer or Join Prompt */}
            {!isActiveMember ? (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  {isPending
                    ? 'Your request to join this group is awaiting admin approval.'
                    : 'Join this group to send messages, photos, and videos.'}
                </p>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => void handleJoinLeave(selectedGroup)}
                  className="min-h-[38px] px-4 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold shrink-0"
                >
                  {isPending ? 'Pending Approval' : 'Join Group'}
                </button>
              </div>
            ) : !canSendMessage ? (
              <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-center gap-2 shrink-0">
                <Lock className="h-3.5 w-3.5" />
                <span>Only group admins and moderators can send messages in this group.</span>
              </div>
            ) : (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2 shrink-0">
                {replyTo && (
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs">
                    <span className="truncate">
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        Replying to {replyTo.authorName}:{' '}
                      </strong>
                      {replyTo.content}
                    </span>
                    <button type="button" onClick={() => setReplyTo(null)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                {pendingImages.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto">
                    {pendingImages.map((u, idx) => (
                      <div key={u + idx} className="relative h-12 w-12 rounded-lg overflow-hidden shrink-0">
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
                  <div className="flex items-center justify-between px-3 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-xs">
                    <span>Video attached ({pendingVideo.videoFormat})</span>
                    <button type="button" onClick={() => setPendingVideo(null)}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <form onSubmit={handleSendGroupMessage} className="flex items-center gap-2">
                  <label
                    title="Attach photos (ImgBB)"
                    className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300"
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
                      <ImagePlus className="h-4 w-4" />
                    )}
                  </label>

                  <label
                    title="Attach video (Cloudinary)"
                    className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300"
                  >
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                      disabled={uploadingVideo || uploadingImages}
                      onChange={(e) => void handleVideoAttach(e)}
                      className="sr-only"
                    />
                    <Film className="h-4 w-4" />
                  </label>

                  <input
                    type="text"
                    maxLength={1500}
                    value={postText}
                    onChange={(e) => handlePostTextChange(e.target.value)}
                    placeholder={
                      editingMsg ? 'Edit message...' : `Message ${selectedGroup.name}...`
                    }
                    className="flex-1 min-h-[40px] px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
                  />

                  <button
                    type="submit"
                    disabled={
                      uploadingImages ||
                      uploadingVideo ||
                      (!postText.trim() && pendingImages.length === 0 && !pendingVideo)
                    }
                    className="min-h-[40px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{editingMsg ? 'Save' : 'Send'}</span>
                  </button>
                </form>

                {isGroupModOrAdmin && !editingMsg && (
                  <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={isAnnouncement}
                      onChange={(e) => setIsAnnouncement(e.target.checked)}
                    />
                    <span>Send as important group announcement</span>
                  </label>
                )}
              </div>
            )}
          </>
        )}

        <MediaLightbox media={lightboxMedia} onClose={() => setLightboxMedia(null)} />

        <UserProfileModal
          uid={profileUid}
          onClose={() => setProfileUid(null)}
          onMessageUser={(uid) => {
            setProfileUid(null);
            onMessageUser?.(uid);
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
          onSubmitted={() => setToast('Report submitted to school administrators.')}
        />
      </div>
    );
  }

  const filtered = groups.filter((g) => {
    const matchesType = filter === 'all' || g.type === filter;
    const term = searchQuery.trim().toLowerCase();
    const matchesTerm =
      !term ||
      g.name.toLowerCase().includes(term) ||
      g.description.toLowerCase().includes(term);
    return matchesType && matchesTerm;
  });

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
            School Groups &amp; Live Chat Rooms
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Classes, subject study circles, sports teams, clubs, and LUGA BOYZ alumni groups.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((p) => !p)}
          className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>{showCreate ? 'Close Form' : 'Create Group'}</span>
        </button>
      </section>

      {showCreate && (
        <form
          onSubmit={handleCreateGroup}
          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3"
        >
          <div className="flex items-center gap-3">
            <UserAvatar name={name || 'Group'} avatarUrl={newGroupAvatar} size="lg" />
            <label className="min-h-[38px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold cursor-pointer flex items-center gap-1.5">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => void handleGroupAvatarUpload(e, false)}
                className="sr-only"
              />
              <ImagePlus className="h-3.5 w-3.5" />
              <span>{uploadingGroupAvatar ? 'Uploading...' : 'Upload Group Photo (ImgBB)'}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Group name e.g. Form 4 Physics"
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            />
            <select
              aria-label="Group type"
              value={type}
              onChange={(e) => setType(e.target.value as GroupType)}
              className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="class">Class</option>
              <option value="subject">Subject</option>
              <option value="sports">Sports</option>
              <option value="club">Club / Society</option>
              <option value="community">Community</option>
            </select>
            <select
              aria-label="Group privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'open' | 'approval_required')}
              className="min-h-[42px] px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
            >
              <option value="open">Open join</option>
              <option value="approval_required">Admin approval required</option>
            </select>
          </div>
          <textarea
            rows={2}
            required
            minLength={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the group purpose and members..."
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm"
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating || uploadingGroupAvatar}
              className="min-h-[40px] px-4 py-2 rounded-lg bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold"
            >
              {creating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {GROUP_TYPES.map((gt) => (
          <button
            key={gt.id}
            type="button"
            onClick={() => setFilter(gt.id)}
            className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
              filter === gt.id
                ? 'bg-emerald-800 text-white dark:bg-emerald-700'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            {gt.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <Users className="h-7 w-7 mx-auto text-emerald-700 dark:text-emerald-400" />
          <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
            No groups created yet
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Create the first class, subject, sports, or alumni group above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((group) => {
            const myDoc = myMemberDocs[group.id];
            const isMember = Boolean(myDoc && myDoc.status !== 'pending');
            const isPending = Boolean(myDoc && myDoc.status === 'pending');
            const hasUnread =
              isMember &&
              toMillis(group.lastMessageAt) > toMillis(myDoc?.lastReadAt) &&
              toMillis(group.lastMessageAt) > 0;

            return (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <UserAvatar name={group.name} avatarUrl={group.avatarUrl} size="lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-base font-bold text-slate-900 dark:text-white truncate">
                        {group.name}
                      </h3>
                      {hasUnread && (
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600 shrink-0" title="New messages" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      <span className="capitalize">{group.type}</span> ·{' '}
                      <span className="font-mono">{group.memberCount}</span> members
                      {group.privacy === 'approval_required' ? ' · Approval required' : ''}
                    </p>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                      {group.lastMessage || group.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className="min-h-[38px] px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Open Group Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleJoinLeave(group)}
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 ${
                      isMember || isPending
                        ? 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                        : 'bg-emerald-800 hover:bg-emerald-900 text-white'
                    }`}
                  >
                    {isMember && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                    <span>{isPending ? 'Pending' : isMember ? 'Joined' : 'Join'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
