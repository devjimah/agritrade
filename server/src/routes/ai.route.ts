import { NextFunction, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { AgentResult, chat, importNotebookPage, OnAgentEvent } from "../ai/agent";
import { AppError } from "../errors/AppError";
import { requireAuth } from "../middleware/auth";
import * as conversationService from "../services/ai-conversation.service";
import * as proposalService from "../services/ai-proposal.service";
import { getUsageReport } from "../services/ai-usage.service";
import { AuthRequest } from "../types";
import {
  agentChatSchema,
  editProposalSchema,
  listProposalsQuerySchema,
  notebookImportSchema,
  rejectProposalSchema,
  usageQuerySchema,
} from "../validators/ai-proposal.validator";
import { objectIdSchema } from "../validators/farmer.validator";

const router = Router();
router.use(requireAuth);

// Every model call spends API credits: cap per IP.
const aiLimiter = rateLimit({ windowMs: 60_000, limit: 20 });

type Handler = (req: AuthRequest, res: Response) => Promise<unknown>;
const wrap = (fn: Handler) => (req: AuthRequest, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);
const staffId = (req: AuthRequest) => {
  if (!req.user) throw new AppError("Not authenticated", 401);
  return req.user.id;
};

/**
 * Runs an agent request and answers either as one JSON body or, with
 * `stream`, as NDJSON: `{type:"progress",...}` lines while the agent works,
 * then exactly one `{type:"done",data}` or `{type:"error",message}` line.
 * Once streaming has started the status is already 200, so failures travel
 * in that last line instead of the status code.
 */
async function respond(res: Response, stream: boolean, run: (onEvent: OnAgentEvent) => Promise<unknown>) {
  if (!stream) {
    res.json({ success: true, data: await run(() => {}) });
    return;
  }
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // nginx: don't hold lines back
  res.flushHeaders();
  const line = (obj: unknown) => res.write(`${JSON.stringify(obj)}\n`);
  try {
    line({ type: "done", data: await run((event) => line({ type: "progress", ...event })) });
  } catch (err) {
    if (!(err instanceof AppError)) console.error("Unhandled error:", err);
    line({
      type: "error",
      status: err instanceof AppError ? err.statusCode : 500,
      message: err instanceof AppError ? err.message : "Internal server error",
    });
  }
  res.end();
}

/** Saves one finished exchange and returns the reply with the conversation it belongs to. */
async function saveExchange(
  req: AuthRequest,
  conversationId: string | undefined,
  user: { content: string; isPhoto?: boolean },
  result: AgentResult & { batchId?: string }
) {
  const convo = await conversationService.appendExchange(staffId(req), conversationId, user.content, [
    { role: "user", ...user },
    {
      role: "assistant",
      content: result.reply || "(no reply)",
      trace: result.toolTrace,
      proposalIds: result.proposalIds,
      batchId: result.batchId,
    },
  ]);
  return { ...result, conversationId: convo._id.toString() };
}

router.post("/chat", aiLimiter, wrap(async (req, res) => {
  const { message, conversationId, stream } = agentChatSchema.parse(req.body);
  // Resolve (and ownership-check) before streaming starts, so a bad id is a plain 404.
  const convo = conversationId ? await conversationService.getConversation(staffId(req), conversationId) : null;
  await respond(res, stream, async (onEvent) => {
    const result = await chat(message, conversationService.historyFor(convo), { staffId: staffId(req) }, onEvent);
    return saveExchange(req, conversationId, { content: message }, result);
  });
}));

router.post("/import-notebook", aiLimiter, wrap(async (req, res) => {
  const { imageBase64, mimeType, conversationId, stream } = notebookImportSchema.parse(req.body);
  if (conversationId) await conversationService.getConversation(staffId(req), conversationId);
  await respond(res, stream, async (onEvent) => {
    const result = await importNotebookPage(imageBase64, mimeType, { staffId: staffId(req) }, onEvent);
    return saveExchange(req, conversationId, { content: "Notebook photo", isPhoto: true }, result);
  });
}));

router.get("/conversations", wrap(async (req, res) => {
  const conversations = await conversationService.listConversations(staffId(req));
  res.json({ success: true, data: { conversations } });
}));

router.get("/conversations/:id", wrap(async (req, res) => {
  const id = objectIdSchema.parse(req.params.id);
  const conversation = await conversationService.getConversation(staffId(req), id);
  res.json({ success: true, data: { conversation } });
}));

router.delete("/conversations/:id", wrap(async (req, res) => {
  const id = objectIdSchema.parse(req.params.id);
  await conversationService.deleteConversation(staffId(req), id);
  res.json({ success: true, data: null });
}));

router.get("/usage", wrap(async (req, res) => {
  const { days } = usageQuerySchema.parse(req.query);
  res.json({ success: true, data: await getUsageReport(days) });
}));

router.get("/proposals", wrap(async (req, res) => {
  const result = await proposalService.listProposals(listProposalsQuerySchema.parse(req.query));
  res.json({ success: true, data: result });
}));

router.post("/proposals/:id/confirm", wrap(async (req, res) => {
  const id = objectIdSchema.parse(req.params.id);
  const proposal = await proposalService.confirmProposal(id, staffId(req));
  res.json({ success: true, data: { proposal } });
}));

router.patch("/proposals/:id", wrap(async (req, res) => {
  const id = objectIdSchema.parse(req.params.id);
  const { changes } = editProposalSchema.parse(req.body);
  const proposal = await proposalService.editProposal(id, staffId(req), changes);
  res.json({ success: true, data: { proposal } });
}));

router.post("/proposals/:id/reject", wrap(async (req, res) => {
  const id = objectIdSchema.parse(req.params.id);
  const { reason } = rejectProposalSchema.parse(req.body);
  const proposal = await proposalService.rejectProposal(id, staffId(req), reason);
  res.json({ success: true, data: { proposal } });
}));

export default router;
