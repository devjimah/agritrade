import { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import {
  AiConversationDocument,
  AiConversationModel,
  IAiConversationMessage,
  MAX_STORED_MESSAGES,
} from "../models/ai-conversation.model";

/** Same caps the client used to apply before history moved server-side. */
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;

export type NewMessage = Omit<IAiConversationMessage, "createdAt" | "proposalIds"> & { proposalIds?: string[] };

/** Owner-scoped: another staff member's conversation is a 404, not a 403, so ids don't leak. */
export async function getConversation(staffId: Types.ObjectId, id: string): Promise<AiConversationDocument> {
  const convo = await AiConversationModel.findOne({ _id: id, staffId });
  if (!convo) throw new AppError("Conversation not found", 404);
  return convo;
}

export async function listConversations(staffId: Types.ObjectId, limit = 20) {
  return AiConversationModel.find({ staffId }, "title createdAt updatedAt")
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();
}

export async function deleteConversation(staffId: Types.ObjectId, id: string): Promise<void> {
  const { deletedCount } = await AiConversationModel.deleteOne({ _id: id, staffId });
  if (!deletedCount) throw new AppError("Conversation not found", 404);
}

/**
 * What the model sees: text turns only, newest 20. Photo turns are skipped
 * because the image isn't kept, but the assistant's reply to one stays.
 */
export function historyFor(convo: AiConversationDocument | null) {
  if (!convo) return [];
  return convo.messages
    .filter((m) => !m.isPhoto && m.content.trim())
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_TURN_CHARS) }));
}

/**
 * Appends one completed exchange (user turn + reply). Creates the
 * conversation on its first exchange, so a request that fails before the
 * model answers never leaves an empty conversation behind.
 */
export async function appendExchange(
  staffId: Types.ObjectId,
  conversationId: string | undefined,
  title: string,
  messages: NewMessage[]
): Promise<AiConversationDocument> {
  const now = new Date();
  const stamped = messages.map((m) => ({ ...m, createdAt: now }));
  if (conversationId) {
    const updated = await AiConversationModel.findOneAndUpdate(
      { _id: conversationId, staffId },
      { $push: { messages: { $each: stamped, $slice: -MAX_STORED_MESSAGES } } },
      { returnDocument: "after" }
    );
    if (updated) return updated;
    // Deleted while the model was answering. The reply (and any proposals it
    // made) already exist, so keep it in a new conversation rather than fail.
  }
  return AiConversationModel.create({ staffId, title: title.slice(0, 120) || "Chat", messages: stamped });
}
