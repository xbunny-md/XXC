import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  RefreshCw,
  Send,
  Square,
  X,
} from 'lucide-react';
import {
  deleteTrailingAiMessages,
  listenAiMessages,
  LUGA_AI_IDENTITY,
  readAiAttachmentFile,
  saveAssistantAiMessage,
  saveUserAiMessage,
  streamAiChat,
} from '../../lib/aiService';
import {
  AiAttachment,
  AiConversation,
  AiMessage,
  formatTimeShort,
  UserProfile,
} from '../../types/luga';
import { LugaAiAvatar } from './LugaAiAvatar';

interface LugaAiChatPaneProps {
  profile: UserProfile;
  conversation: AiConversation;
  onBack: () => void;
}

function renderFormattedInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong key={`${keyPrefix}_b_${match.index}`} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}_c_${match.index}`}
          className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[0.88em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = tokenRegex.lastIndex;
    match = tokenRegex.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

function SimpleMessageText({ content }: { content: string }) {
  const blocks = content.split(/\n{2,}/);
  return (
    <div className="space-y-2 text-sm leading-relaxed break-words">
      {blocks.map((block, bIdx) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith('```') && trimmed.endsWith('```') && trimmed.length > 6) {
          const inner = trimmed.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '');
          return (
            <pre
              key={bIdx}
              className="p-2.5 rounded-lg bg-slate-100 dark:bg-slate-950 font-mono text-xs overflow-x-auto"
            >
              <code>{inner}</code>
            </pre>
          );
        }
        return (
          <p key={bIdx} className="whitespace-pre-wrap">
            {renderFormattedInline(block, `b${bIdx}`)}
          </p>
        );
      })}
    </div>
  );
}

export function LugaAiChatPane({ profile, conversation, onBack }: LugaAiChatPaneProps) {
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setMessages([]);
    setErrorMsg(null);
    const unsub = listenAiMessages(profile.uid, conversation.id, setMessages);
    return () => unsub();
  }, [profile.uid, conversation.id]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isThinking, streamingText]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [conversation.id]);

  const handleAttachFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    setErrorMsg(null);
    const remaining = Math.max(0, 4 - attachments.length);
    if (remaining === 0) {
      setErrorMsg('You can attach up to 4 files per message.');
      return;
    }

    try {
      const loaded = await Promise.all(files.slice(0, remaining).map(readAiAttachmentFile));
      setAttachments((prev) => [...prev, ...loaded].slice(0, 4));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to read attachment.');
    }
  };

  const runGeneration = async (opts: {
    userPrompt: string;
    history: Array<{ role: 'user' | 'assistant'; content: string }>;
    sendAttachments?: AiAttachment[];
    baseCount: number;
  }) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsThinking(true);
    setIsStreaming(false);
    setStreamingText('');
    setErrorMsg(null);

    let accumulated = '';

    try {
      const result = await streamAiChat({
        userPrompt: opts.userPrompt,
        history: opts.history,
        attachments: opts.sendAttachments,
        signal: controller.signal,
        onChunk: (_delta, full) => {
          accumulated = full;
          setIsThinking(false);
          setIsStreaming(true);
          setStreamingText(full);
        },
      });

      const finalContent = result.fullText || accumulated;
      if (finalContent.trim()) {
        await saveAssistantAiMessage({
          uid: profile.uid,
          convId: conversation.id,
          content: finalContent,
          currentMessageCount: opts.baseCount,
        });
      }
    } catch (err) {
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      if (isAbort) {
        if (accumulated.trim()) {
          await saveAssistantAiMessage({
            uid: profile.uid,
            convId: conversation.id,
            content: accumulated.trim(),
            currentMessageCount: opts.baseCount,
          });
        }
      } else {
        const message = err instanceof Error ? err.message : 'Unable to reach LUGA AI.';
        setErrorMsg(message);
        await saveAssistantAiMessage({
          uid: profile.uid,
          convId: conversation.id,
          content: message,
          error: true,
          currentMessageCount: opts.baseCount,
        });
      }
    } finally {
      setIsThinking(false);
      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isThinking || isStreaming) return;
    const text = draft.trim();
    const currentAttachments = [...attachments];
    if (!text && currentAttachments.length === 0) return;

    setDraft('');
    setAttachments([]);

    const historySnapshot = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    const baseCount = messages.length;
    await saveUserAiMessage({
      uid: profile.uid,
      convId: conversation.id,
      content: text || `Attached: ${currentAttachments.map((a) => a.name).join(', ')}`,
      attachments: currentAttachments,
      currentMessageCount: baseCount,
    });

    await runGeneration({
      userPrompt: text,
      history: historySnapshot,
      sendAttachments: currentAttachments,
      baseCount: baseCount + 1,
    });
  };

  const handleRetryError = async (errorIdx: number) => {
    if (isThinking || isStreaming) return;
    let userIdx = errorIdx;
    while (userIdx >= 0 && messages[userIdx].role !== 'user') {
      userIdx -= 1;
    }
    if (userIdx < 0) return;

    const userMsg = messages[userIdx];
    const toDeleteIds = messages.slice(userIdx + 1).map((m) => m.id);
    await deleteTrailingAiMessages({
      uid: profile.uid,
      convId: conversation.id,
      deleteIds: toDeleteIds,
      remainingCount: userIdx + 1,
    });

    const historyBefore = messages
      .slice(0, userIdx)
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }));

    await runGeneration({
      userPrompt: userMsg.content,
      history: historyBefore,
      baseCount: userIdx + 1,
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Minimal Header: Avatar + LUGA AI */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to chats"
          className="md:hidden min-h-[40px] min-w-[40px] -ml-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <LugaAiAvatar size="sm" showBadge={false} />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white truncate">
              {LUGA_AI_IDENTITY.name}
            </h3>
            <BadgeCheck
              className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0"
              aria-label="Verified AI"
            />
          </div>
          {(isThinking || isStreaming) && (
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">typing...</p>
          )}
        </div>
      </div>

      {/* Message Bubbles */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/50">
        {messages.map((m, idx) => {
          const isUser = m.role === 'user';

          if (isUser) {
            return (
              <div key={m.id} className="flex flex-col items-end">
                <div className="max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-xs px-3.5 py-2.5 bg-emerald-800 dark:bg-emerald-700 text-white text-sm space-y-1.5">
                  {m.attachments && m.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {m.attachments.map((att) => (
                        <span
                          key={att.id}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-900/70 text-[11px] text-emerald-100"
                        >
                          {att.mimeType.startsWith('image/') ? (
                            <ImageIcon className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          <span className="truncate max-w-[160px]">{att.name}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="whitespace-pre-wrap leading-relaxed break-words">{m.content}</p>
                  <div className="flex justify-end text-[10px] text-emerald-100/80 font-mono">
                    {formatTimeShort(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={m.id} className="flex flex-col items-start">
              <div
                className={`max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 border ${
                  m.error
                    ? 'bg-red-50/80 dark:bg-red-950/30 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200'
                    : 'bg-white dark:bg-slate-800 border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                }`}
              >
                <SimpleMessageText content={m.content} />
                <div className="mt-1 flex items-center justify-between gap-3 text-[10px] opacity-70">
                  <span className="font-mono">{formatTimeShort(m.createdAt)}</span>
                  {m.error && (
                    <button
                      type="button"
                      onClick={() => void handleRetryError(idx)}
                      className="inline-flex items-center gap-1 font-semibold underline hover:opacity-100"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isThinking && (
          <div className="flex flex-col items-start">
            <div className="rounded-2xl rounded-bl-xs px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-600" />
              <span>...</span>
            </div>
          </div>
        )}

        {isStreaming && streamingText && (
          <div className="flex flex-col items-start">
            <div className="max-w-[88%] sm:max-w-[78%] rounded-2xl rounded-bl-xs px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-900 dark:text-slate-100">
              <SimpleMessageText content={streamingText} />
            </div>
          </div>
        )}

        <div ref={scrollEndRef} />
      </div>

      {errorMsg && (
        <div className="px-4 py-1.5 bg-red-50 dark:bg-red-950/40 border-t border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span className="truncate">{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} aria-label="Dismiss error">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Simple WhatsApp-style Composer */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 shrink-0">
        {attachments.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              >
                {att.previewUrl ? (
                  <img
                    src={att.previewUrl}
                    alt={att.name}
                    className="h-5 w-5 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                )}
                <span className="truncate max-w-[130px]">{att.name}</span>
                <button
                  type="button"
                  onClick={() => setAttachments((prev) => prev.filter((a) => a.id !== att.id))}
                  aria-label="Remove attachment"
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={(e) => void handleSend(e)} className="flex items-center gap-2">
          <label
            title="Attach image or text file"
            className="min-h-[42px] min-w-[42px] rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-pointer text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <input
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json"
              disabled={isThinking || isStreaming}
              onChange={(e) => void handleAttachFiles(e)}
              className="sr-only"
            />
            <Paperclip className="h-4 w-4" aria-hidden="true" />
          </label>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={isThinking || isStreaming}
            placeholder="Chat with LUGA AI..."
            className="flex-1 min-h-[42px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100"
          />

          {isThinking || isStreaming ? (
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop response"
              className="min-h-[42px] min-w-[42px] px-3.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center justify-center shrink-0"
            >
              <Square className="h-4 w-4 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!draft.trim() && attachments.length === 0}
              aria-label="Send message"
              className="min-h-[42px] min-w-[42px] px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center shrink-0"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
