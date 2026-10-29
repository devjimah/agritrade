import axios from "axios";
import { api } from "./api";
import type { CropType } from "@/lib/crops";

export type ProposalKind =
  | "create_farmer"
  | "create_advance"
  | "create_repayment"
  | "create_credit_sale"
  | "create_payment"
  | "create_customer"
  | "adjust_stock";

export type ProposalStatus = "pending" | "applying" | "confirmed" | "rejected";

export type PaymentMethod = "cash" | "mobile_money" | "bank";

/** Payload money fields are integer pesewas, same as every other API value. */
export interface ProposalPayload {
  fullName?: string;
  phone?: string;
  village?: string;
  location?: string;
  farmerId?: string;
  advanceId?: string;
  customerId?: string;
  creditSaleId?: string;
  amountGiven?: number;
  amountPaid?: number;
  pricePerBag?: number;
  cropType?: CropType;
  expectedBags?: number;
  bagsSupplied?: number;
  bagsTaken?: number;
  paymentMethod?: PaymentMethod;
  /** adjust_stock: signed whole bags (-3 removes three). */
  changeBags?: number;
  reason?: string;
}

/**
 * What the proposal points at, resolved by the server from the DB, never
 * taken from the model's summary. `missing` = the id resolves to nothing.
 */
export interface ProposalTarget {
  missing?: boolean;
  farmer?: { _id: string; fullName: string; phone: string; village?: string };
  customer?: { _id: string; fullName: string; phone: string; location?: string };
  advance?: {
    _id: string;
    cropType: CropType;
    amountGiven: number;
    expectedBags: number;
    bagsRepaid: number;
    repaymentStatus: string;
  };
  creditSale?: {
    _id: string;
    cropType: CropType;
    bagsTaken: number;
    totalAmount: number;
    balanceRemaining: number;
    paymentStatus: string;
  };
  /** adjust_stock: bags on hand now. */
  stock?: { cropType: CropType; quantityBags: number };
}

export interface AiProposal {
  _id: string;
  kind: ProposalKind;
  payload: ProposalPayload;
  originalPayload?: ProposalPayload;
  status: ProposalStatus;
  summary: string;
  evidence: {
    source: "chat" | "notebook_image";
    sourceText: string;
    confidence: number;
    rationale?: string;
  };
  batchId?: string;
  rejectionReason?: string;
  lastError?: string;
  editedAt?: string;
  target: ProposalTarget | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProposalListData {
  proposals: AiProposal[];
  total: number;
  page: number;
  pages: number;
}

export interface ToolTraceEntry {
  name: string;
  ok: boolean;
  error?: string;
}

export interface AgentReply {
  reply: string;
  proposalIds: string[];
  toolTrace: ToolTraceEntry[];
  batchId?: string;
  /** The saved conversation this exchange was added to: send it with the next message. */
  conversationId: string;
}

/** What the assistant is doing right now, streamed while a request runs. */
export type AgentProgress = { stage: "thinking"; step: number } | { stage: "tool"; name: string };

/** A streamed request that failed after it started: the server reports it in the last line, not the status. */
export class AgentStreamError extends Error {}

/**
 * Posts with `stream: true` and reads the NDJSON reply as it arrives.
 * onDownloadProgress sees the text received so far; only complete lines are
 * parsed, and each line is handled once. The final parse of the whole body
 * is what decides the result.
 */
async function postAgent(
  path: string,
  body: Record<string, unknown>,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentReply> {
  let handled = 0;
  try {
    const res = await api.post(path, { ...body, stream: true }, {
      adapter: "xhr",
      responseType: "text",
      transformResponse: (data) => data,
      onDownloadProgress: (e) => {
        const text = (e.event?.target as XMLHttpRequest | undefined)?.responseText ?? "";
        const complete = text.slice(0, text.lastIndexOf("\n") + 1);
        for (const line of complete.slice(handled).split("\n")) {
          if (!line) continue;
          const event = JSON.parse(line) as { type: string } & AgentProgress;
          if (event.type === "progress") onProgress?.(event);
        }
        handled = complete.length;
      },
    });
    const lines = String(res.data).trim().split("\n").filter(Boolean);
    const last = lines.length ? JSON.parse(lines[lines.length - 1]) : null;
    if (last?.type === "done") return last.data as AgentReply;
    throw new AgentStreamError(
      last?.type === "error" ? last.message : "The assistant stopped before answering. Try again."
    );
  } catch (err) {
    // A refusal before streaming (400, 404, 429) arrives as text here, because
    // of responseType: parse it so getApiErrorMessage can read the message.
    if (axios.isAxiosError(err) && typeof err.response?.data === "string") {
      try {
        err.response.data = JSON.parse(err.response.data);
      } catch {
        // Not JSON (e.g. the rate limiter's plain-text reply): keep the generic message.
      }
    }
    throw err;
  }
}

export function sendAgentMessage(
  message: string,
  conversationId: string | null,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentReply> {
  return postAgent("/ai/chat", { message, conversationId: conversationId ?? undefined }, onProgress);
}

export function importNotebookPage(
  imageBase64: string,
  mimeType: "image/jpeg" | "image/png" | "image/webp",
  conversationId: string | null,
  onProgress?: (progress: AgentProgress) => void
): Promise<AgentReply> {
  return postAgent(
    "/ai/import-notebook",
    { imageBase64, mimeType, conversationId: conversationId ?? undefined },
    onProgress
  );
}

export interface ConversationSummary {
  _id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  _id: string;
  role: "user" | "assistant";
  content: string;
  isPhoto?: boolean;
  trace?: ToolTraceEntry[];
  proposalIds?: string[];
  batchId?: string;
  createdAt: string;
}

export interface Conversation extends ConversationSummary {
  messages: ConversationMessage[];
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const res = await api.get("/ai/conversations");
  return res.data.data.conversations;
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await api.get(`/ai/conversations/${id}`);
  return res.data.data.conversation;
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/ai/conversations/${id}`);
}

export interface UsageTotals {
  requests: number;
  failed: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Requests whose tokens the Model API didn't report: unknown, not zero. */
  unreported: number;
}

export interface UsageReport {
  days: number;
  totals: UsageTotals;
  byDay: (UsageTotals & { date: string })[];
}

export async function getAiUsage(days = 30): Promise<UsageReport> {
  const res = await api.get("/ai/usage", { params: { days } });
  return res.data.data;
}

export async function listProposals(params: {
  status?: ProposalStatus;
  batchId?: string;
  ids?: string[];
  page?: number;
  limit?: number;
}): Promise<ProposalListData> {
  const { ids, ...rest } = params;
  const res = await api.get("/ai/proposals", {
    params: { ...rest, ids: ids?.length ? ids.join(",") : undefined },
  });
  return res.data.data;
}

export async function confirmProposal(id: string): Promise<AiProposal> {
  const res = await api.post(`/ai/proposals/${id}/confirm`);
  return res.data.data.proposal;
}

export async function rejectProposal(id: string, reason: string): Promise<AiProposal> {
  const res = await api.post(`/ai/proposals/${id}/reject`, { reason });
  return res.data.data.proposal;
}

/** Values only; the server refuses changes to which farmer/advance/customer/sale it targets. */
export async function editProposal(id: string, changes: ProposalPayload): Promise<AiProposal> {
  const res = await api.patch(`/ai/proposals/${id}`, { changes });
  return res.data.data.proposal;
}
