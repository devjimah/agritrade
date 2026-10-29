import { AppError } from "../errors/AppError";
import { recordUsage } from "../services/ai-usage.service";
import { runTool, ToolContext, TOOL_SPECS } from "./tools";

/**
 * Meta Model API exposes an OpenAI-compatible chat completions endpoint.
 * Checked against dev.meta.ai/docs (tool-calling, image-understanding, models):
 *  - META_MODEL: "muse-spark-1.3" is the recommended text+image model with
 *    tool calling; every Muse Spark version accepts image input.
 *  - tool_calls: OpenAI shape, `function.arguments` is a JSON string; reply
 *    with one role:"tool" message per call; the assistant message carrying
 *    tool_calls must be echoed back or the API returns 400.
 *  - tool_choice: only "auto" is accepted ("none"/"required"/named -> 400).
 *  - images: content part { type: "image_url", image_url: { url: "data:..." } },
 *    jpeg/png/gif/webp, up to 50 MB each.
 *  - usage: read from the OpenAI-shaped `usage` field IF the response has
 *    one. Not confirmed against the Meta docs, so a missing field is
 *    recorded as "unreported", never as zero tokens.
 */
const BASE_URL = process.env.META_API_BASE_URL ?? "https://api.meta.ai/v1";
const MODEL = process.env.META_MODEL ?? "";
const API_KEY = process.env.META_MODEL_API_KEY ?? "";
const MAX_STEPS = 8; // hard cap on tool round-trips per request (credit budget)
const CALL_TIMEOUT_MS = 90_000; // one model call; a notebook photo is the slow case
const MAX_PROPOSALS = 30; // per request: a messy page must not flood the review queue

type Msg =
  | { role: "system" | "user" | "assistant"; content: unknown; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

// A function, not a constant: a long-running server must not keep telling the
// model the date it booted.
const systemPrompt = () => `You are the assistant inside AgriTrade, a credit and stock ledger for a cereal trader in Ghana.
Rules:
- You can READ data freely. You can NEVER write data directly: every change is a propose_* call that the trader reviews.
- Always resolve people with search_farmers / search_customers first. If several match, do not guess: ask the trader, or propose with low confidence and explain in rationale.
- Farmer repayments are BAGS of crop against an advance, not cash. Customers pay CASH against credit sales.
- Amounts in tool arguments are cedis as decimal strings. Report figures read from tools are in pesewas: divide by 100 and show as GH₵.
- Never invent ids, names, amounts or dates. If a value is missing or illegible, say so.
- A new buyer is propose_customer (after search_customers finds no match), never propose_farmer.
- Stock lost, spoiled or found on a recount is propose_stock_adjustment. Sales and deliveries are never stock adjustments.
- Repayment claims are farmers' own reports from the portal. You can list them, but only the trader confirms them, in the claims queue.
- For history or period questions use get_transactions or get_activity_summary with real dates, not the dashboard.
- Reply briefly in plain English. After proposing, tell the trader what is waiting for their review.
Today is ${new Date().toISOString().slice(0, 10)}.`;

type Usage = { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };

async function complete(messages: Msg[]) {
  if (!API_KEY || !MODEL) throw new AppError("AI is not configured (META_MODEL_API_KEY / META_MODEL)", 503);
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: MODEL, messages, tools: TOOL_SPECS, tool_choice: "auto" }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new AppError(`Model API did not answer within ${CALL_TIMEOUT_MS / 1000}s`, 504);
    }
    throw new AppError(`Model API unreachable: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  if (!res.ok) throw new AppError(`Model API error ${res.status}: ${(await res.text()).slice(0, 300)}`, 502);
  const data = (await res.json()) as {
    choices?: { message?: { content: string | null; tool_calls?: ToolCall[] } }[];
    usage?: Usage;
  };
  const message = data.choices?.[0]?.message;
  if (!message) throw new AppError("Model API returned no message", 502);
  return { message, usage: data.usage };
}

/** Live progress for the chat UI: one event before each model call and each tool run. */
export type AgentEvent = { stage: "thinking"; step: number } | { stage: "tool"; name: string };
export type OnAgentEvent = (event: AgentEvent) => void;

export interface AgentResult {
  reply: string;
  proposalIds: string[];
  toolTrace: { name: string; ok: boolean; error?: string }[]; // shown in the demo: judges see the agent "think"
}

export async function runAgent(
  userContent: unknown,
  history: Msg[],
  ctx: ToolContext,
  onEvent: OnAgentEvent = () => {}
): Promise<AgentResult> {
  const started = Date.now();
  const spent = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, usageReported: true };
  let error: string | undefined;
  try {
    return await loop(userContent, history, ctx, onEvent, spent);
  } catch (err) {
    error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    throw err;
  } finally {
    // An unconfigured server never called the API: nothing was spent.
    if (spent.calls > 0) {
      await recordUsage({
        staffId: ctx.staffId, source: ctx.source, model: MODEL, ...spent,
        durationMs: Date.now() - started, ok: !error, error,
      });
    }
  }
}

async function loop(
  userContent: unknown,
  history: Msg[],
  ctx: ToolContext,
  onEvent: OnAgentEvent,
  spent: { calls: number; promptTokens: number; completionTokens: number; totalTokens: number; usageReported: boolean }
): Promise<AgentResult> {
  const messages: Msg[] = [{ role: "system", content: systemPrompt() }, ...history, { role: "user", content: userContent }];
  const proposalIds: string[] = [];
  const toolTrace: AgentResult["toolTrace"] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    onEvent({ stage: "thinking", step });
    spent.calls++;
    let completion: Awaited<ReturnType<typeof complete>>;
    try {
      completion = await complete(messages);
    } catch (err) {
      // A failed call may still have been billed; its tokens are unknown.
      spent.usageReported = false;
      throw err;
    }
    const { message: msg, usage } = completion;
    if (usage) {
      spent.promptTokens += usage.prompt_tokens ?? 0;
      spent.completionTokens += usage.completion_tokens ?? 0;
      spent.totalTokens += usage.total_tokens ?? (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0);
    } else {
      spent.usageReported = false;
    }
    if (!msg.tool_calls?.length) return { reply: msg.content ?? "", proposalIds, toolTrace };

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    for (const call of msg.tool_calls) {
      onEvent({ stage: "tool", name: call.function.name });
      // Every call still gets a tool reply (the API requires one per call), so
      // over the cap the model is told to stop instead of the call being dropped.
      const out =
        call.function.name.startsWith("propose_") && proposalIds.length >= MAX_PROPOSALS
          ? JSON.stringify({
              error: `Limit of ${MAX_PROPOSALS} proposals per request reached. Do not propose more; tell the trader which entries were left out.`,
            })
          : await runTool(call.function.name, call.function.arguments, ctx);
      const parsed = JSON.parse(out) as { error?: string; proposalId?: string } | null;
      toolTrace.push({ name: call.function.name, ok: !parsed?.error, ...(parsed?.error ? { error: parsed.error.slice(0, 300) } : {}) });
      if (parsed?.proposalId) proposalIds.push(String(parsed.proposalId));
      messages.push({ role: "tool", tool_call_id: call.id, content: out });
    }
  }
  return { reply: "I stopped after too many steps. Please rephrase or split the request.", proposalIds, toolTrace };
}

/** Text chat: "Abdul from Savelugu brought 5 bags of maize". */
export function chat(
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  ctx: Omit<ToolContext, "source">,
  onEvent?: OnAgentEvent
) {
  return runAgent(message, history, { ...ctx, source: "chat" }, onEvent);
}

/** Notebook import: one photographed page -> one proposal per legible row, grouped by batchId. */
export function importNotebookPage(
  imageBase64: string,
  mimeType: string,
  ctx: Omit<ToolContext, "source" | "batchId">,
  onEvent?: OnAgentEvent
) {
  const batchId = crypto.randomUUID();
  const content = [
    {
      type: "text",
      text:
        "This is a page from my handwritten credit notebook. For each row: transcribe it exactly as sourceText, " +
        "find the farmer or customer, and propose the matching entry. Skip rows you cannot read and list them in your reply.",
    },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
  ];
  return runAgent(content, [], { ...ctx, source: "notebook_image", batchId }, onEvent).then((r) => ({ ...r, batchId }));
}
