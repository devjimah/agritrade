import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { useBusyTracker } from "@/hooks/useBusyTracker";
import { usePolling } from "@/hooks/usePolling";
import { getApiErrorMessage } from "@/services/api";
import {
  AgentStreamError,
  getConversation,
  importNotebookPage,
  listProposals,
  sendAgentMessage,
} from "@/services/ai";
import type { AgentProgress, AgentReply, AiProposal, Conversation, ToolTraceEntry } from "@/services/ai";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Assistant only: which tools ran, in order, and whether each succeeded. */
  trace?: ToolTraceEntry[];
  proposalIds?: string[];
  batchId?: string;
  /** User only: a notebook photo turn. */
  isPhoto?: boolean;
  /** Object URL of the photo, this page load only (never persisted). */
  previewUrl?: string;
  /** Request failed. Failed turns exist only in this tab: the server never saved them. */
  failed?: boolean;
  /** Error reply only: the user message it belongs to, so a retry can remove both. */
  failedFor?: string;
}

/** Which conversation this browser is on; the messages themselves live on the server. */
const CONVERSATION_KEY = "agritrade_ai_conversation";
/** Long edge of a notebook photo after downscaling: legible, and well under the 8 MB body limit. */
const MAX_IMAGE_EDGE = 2000;

function loadConversationId(): string | null {
  try {
    return localStorage.getItem(CONVERSATION_KEY);
  } catch {
    return null;
  }
}

function saveConversationId(id: string | null) {
  try {
    if (id) localStorage.setItem(CONVERSATION_KEY, id);
    else localStorage.removeItem(CONVERSATION_KEY);
  } catch {
    // Blocked storage: the chat works, it just starts fresh on reload.
  }
}

function fromServer(convo: Conversation): ChatMessage[] {
  return convo.messages.map((m) => ({
    id: m._id,
    role: m.role,
    content: m.content,
    trace: m.trace,
    proposalIds: m.proposalIds,
    batchId: m.batchId,
    isPhoto: m.isPhoto,
  }));
}

function errorMessage(err: unknown): string {
  return err instanceof AgentStreamError ? err.message : getApiErrorMessage(err);
}

/** Downscale and re-encode as JPEG so a 12 MP phone photo becomes a few hundred KB. */
async function photoToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * Conversation state for the assistant, shared by the full chat page and the
 * lite (voice-first) screen. The server stores each conversation; this
 * browser remembers which one it is on, so both views, a reload and the
 * history list all show the same thing.
 */
export function useAssistantChat({ onReply }: { onReply?: (message: ChatMessage) => void } = {}) {
  const [conversationId, setConversationId] = useState<string | null>(loadConversationId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(() => conversationId !== null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<AgentProgress | null>(null);
  const [proposals, setProposals] = useState<Record<string, AiProposal>>({});
  const { anyBusy, handlerFor } = useBusyTracker();
  /** Photos of failed turns, kept so Retry can resend them. This page load only. */
  const retryPhotos = useRef(new Map<string, string>());

  useEffect(() => {
    saveConversationId(conversationId);
  }, [conversationId]);

  const openConversation = useCallback(async (id: string) => {
    setLoadingConversation(true);
    try {
      const convo = await getConversation(id);
      setConversationId(convo._id);
      setMessages(fromServer(convo));
      setProposals({});
    } catch (err) {
      // Deleted, or another user's on a shared browser: start fresh instead.
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        setConversationId(null);
        setMessages([]);
      }
    } finally {
      setLoadingConversation(false);
    }
  }, []);

  // Load once on mount; later switches go through openConversation directly.
  const initialId = useRef(conversationId);
  useEffect(() => {
    if (initialId.current) openConversation(initialId.current);
  }, [openConversation]);

  // Most recent 50: the server's `ids` cap. Older cards fall back to a link to the queue.
  const proposalIds = useMemo(
    () => messages.flatMap((m) => m.proposalIds ?? []).slice(-50),
    [messages]
  );
  const idsKey = proposalIds.join(",");

  const loadProposals = useCallback(async () => {
    if (!idsKey) return;
    try {
      const data = await listProposals({ ids: idsKey.split(","), limit: 50 });
      setProposals(Object.fromEntries(data.proposals.map((p) => [p._id, p])));
    } catch {
      // Cards keep their last state; the next poll or action retries.
    }
  }, [idsKey]);

  useEffect(() => {
    loadProposals();
  }, [loadProposals]);

  usePolling(loadProposals, 15000, !anyBusy && proposalIds.length > 0);

  async function run(userMessage: ChatMessage, call: (onProgress: (p: AgentProgress) => void) => Promise<AgentReply>) {
    setMessages((prev) => [...prev, userMessage]);
    setSending(true);
    setProgress(null);
    try {
      const result = await call(setProgress);
      setConversationId(result.conversationId);
      retryPhotos.current.delete(userMessage.id);
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.reply || "(no reply)",
        trace: result.toolTrace,
        proposalIds: result.proposalIds,
        batchId: result.batchId,
      };
      setMessages((prev) => [...prev, reply]);
      onReply?.(reply);
    } catch (err) {
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: errorMessage(err),
        failed: true,
        failedFor: userMessage.id,
      };
      setMessages((prev) => [
        ...prev.map((m) => (m.id === userMessage.id ? { ...m, failed: true } : m)),
        reply,
      ]);
      onReply?.(reply);
    } finally {
      setSending(false);
      setProgress(null);
    }
  }

  function sendText(message: string) {
    run({ id: crypto.randomUUID(), role: "user", content: message }, (onProgress) =>
      sendAgentMessage(message, conversationId, onProgress)
    );
  }

  function sendBase64(base64: string, userMessage: ChatMessage) {
    retryPhotos.current.set(userMessage.id, base64);
    run(userMessage, (onProgress) => importNotebookPage(base64, "image/jpeg", conversationId, onProgress));
  }

  function send(text: string): boolean {
    const message = text.trim();
    if (!message || sending || loadingConversation) return false;
    sendText(message);
    return true;
  }

  async function sendPhoto(file: File | undefined) {
    if (!file || sending || loadingConversation) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: `Notebook photo: ${file.name}`,
      isPhoto: true,
      previewUrl: URL.createObjectURL(file),
    };
    let base64: string;
    try {
      base64 = await photoToBase64(file);
    } catch {
      setMessages((prev) => [
        ...prev,
        { ...userMessage, failed: true },
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "That file could not be read as an image. Try a JPEG or PNG photo.",
          failed: true,
        },
      ]);
      return;
    }
    sendBase64(base64, userMessage);
  }

  /** A failed turn can be resent: always for text, for a photo only while this page still holds it. */
  function canRetry(m: ChatMessage): boolean {
    if (m.role !== "user" || !m.failed) return false;
    return m.isPhoto ? retryPhotos.current.has(m.id) : true;
  }

  /** Drops the failed turn and its error reply, then sends the same thing again. */
  function retry(messageId: string) {
    const failed = messages.find((m) => m.id === messageId);
    if (!failed || !canRetry(failed) || sending) return;
    const photo = retryPhotos.current.get(messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId && m.failedFor !== messageId));
    if (failed.isPhoto && photo) {
      sendBase64(photo, { ...failed, id: crypto.randomUUID(), failed: false });
      retryPhotos.current.delete(messageId);
    } else {
      sendText(failed.content);
    }
  }

  function clear() {
    for (const m of messages) if (m.previewUrl) URL.revokeObjectURL(m.previewUrl);
    retryPhotos.current.clear();
    setConversationId(null);
    setMessages([]);
    setProposals({});
  }

  return {
    conversationId,
    messages,
    sending,
    progress,
    loadingConversation,
    proposals,
    loadProposals,
    handlerFor,
    send,
    sendPhoto,
    retry,
    canRetry,
    clear,
    openConversation,
  };
}
