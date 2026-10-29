import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Types } from "mongoose";
import { clearTestDb, setupTestDb, teardownTestDb } from "../tests/setup";
import { AiConversationModel } from "../models/ai-conversation.model";
import { AiProposalModel } from "../models/ai-proposal.model";
import { AiUsageModel } from "../models/ai-usage.model";
import { UserModel } from "../models/user.model";
import { hashPassword } from "../utils/password";
import { signToken } from "../utils/jwt";

// agent.ts reads these at import time, so set them before the app loads.
process.env.META_MODEL_API_KEY = "test-key";
process.env.META_MODEL = "test-model";

let app: import("express").Express;
let token: string;
let otherToken: string;

beforeAll(async () => {
  await setupTestDb();
  app = (await import("../app")).default;
});
afterAll(teardownTestDb);
afterEach(() => vi.unstubAllGlobals());

beforeEach(async () => {
  await clearTestDb();
  const make = async (email: string) => {
    const user = await UserModel.create({
      fullName: "Staff", email, passwordHash: await hashPassword("secret123"), role: "staff",
    });
    return signToken({ sub: user._id.toString(), role: user.role });
  };
  token = await make("ama@example.com");
  otherToken = await make("kofi@example.com");
});

const auth = (t = token) => ({ Authorization: `Bearer ${t}` });

type ModelReply = { content?: string; tool_calls?: unknown[]; usage?: Record<string, number> | null };

/** Stubs the Model API: each call returns the next scripted reply and records the request body. */
function mockModel(...replies: ModelReply[]) {
  const bodies: { messages: { role: string; content: unknown }[] }[] = [];
  const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const r = replies.shift();
    if (!r) return new Response("no more scripted replies", { status: 500 });
    const usage = r.usage === null ? undefined : (r.usage ?? { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
    return Response.json({
      choices: [{ message: { content: r.content ?? null, tool_calls: r.tool_calls } }],
      ...(usage ? { usage } : {}),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return bodies;
}

const toolCall = (name: string, args: unknown) => ({
  id: `call_${name}`, type: "function", function: { name, arguments: JSON.stringify(args) },
});

describe("POST /api/ai/chat conversations", () => {
  it("saves the exchange and replays it as history on the next message", async () => {
    const bodies = mockModel({ content: "Hello!" }, { content: "Still here." });

    const first = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(first.status).toBe(200);
    const { conversationId } = first.body.data;
    expect(conversationId).toBeTruthy();

    const second = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Are you there?", conversationId });
    expect(second.body.data.conversationId).toBe(conversationId);

    // system + previous user/assistant turns + new user turn
    expect(bodies[1].messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(bodies[1].messages[2].content).toBe("Hello!");

    const convo = await AiConversationModel.findById(conversationId);
    expect(convo!.title).toBe("Hi");
    expect(convo!.messages.map((m) => m.content)).toEqual(["Hi", "Hello!", "Are you there?", "Still here."]);
  });

  it("does not save anything when the model call fails", async () => {
    mockModel(); // first call -> 500
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(res.status).toBe(502);
    expect(await AiConversationModel.countDocuments()).toBe(0);
  });

  it("keeps conversations private to their owner", async () => {
    mockModel({ content: "Hello!" });
    const { conversationId } = (await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" })).body.data;

    expect((await request(app).get(`/api/ai/conversations/${conversationId}`).set(auth(otherToken))).status).toBe(404);
    expect((await request(app).post("/api/ai/chat").set(auth(otherToken)).send({ message: "x", conversationId })).status).toBe(404);
    expect((await request(app).get("/api/ai/conversations").set(auth(otherToken))).body.data.conversations).toHaveLength(0);
    expect((await request(app).get("/api/ai/conversations").set(auth())).body.data.conversations).toHaveLength(1);
  });

  it("deletes a conversation", async () => {
    mockModel({ content: "Hello!" });
    const { conversationId } = (await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" })).body.data;
    expect((await request(app).delete(`/api/ai/conversations/${conversationId}`).set(auth())).status).toBe(200);
    expect(await AiConversationModel.countDocuments()).toBe(0);
  });
});

describe("POST /api/ai/chat streaming", () => {
  const lines = (text: string) => text.trim().split("\n").map((l) => JSON.parse(l));

  it("streams progress for each model call and tool, then the result", async () => {
    mockModel({ tool_calls: [toolCall("get_inventory", {})] }, { content: "You have 0 bags." });
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Stock?", stream: true });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/ndjson/);
    const events = lines(res.text);
    expect(events.slice(0, -1)).toEqual([
      { type: "progress", stage: "thinking", step: 0 },
      { type: "progress", stage: "tool", name: "get_inventory" },
      { type: "progress", stage: "thinking", step: 1 },
    ]);
    expect(events.at(-1)).toMatchObject({ type: "done", data: { reply: "You have 0 bags.", conversationId: expect.any(String) } });
  });

  it("reports a failure as the last line", async () => {
    mockModel();
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi", stream: true });
    expect(lines(res.text).at(-1)).toMatchObject({ type: "error", status: 502, message: expect.stringMatching(/Model API error 500/) });
  });

  it("still rejects a bad request with a normal status before streaming", async () => {
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "", stream: true });
    expect(res.status).toBe(400);
  });
});

describe("usage tracking", () => {
  it("records tokens and calls per request, and failed requests too", async () => {
    mockModel({ tool_calls: [toolCall("get_inventory", {})] }, { content: "Done" });
    await request(app).post("/api/ai/chat").set(auth()).send({ message: "Stock?" });
    mockModel();
    await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });

    const rows = await AiUsageModel.find().sort({ createdAt: 1 });
    expect(rows[0]).toMatchObject({ calls: 2, promptTokens: 200, totalTokens: 240, usageReported: true, ok: true, model: "test-model" });
    expect(rows[1]).toMatchObject({ calls: 1, ok: false, usageReported: false });

    const report = await request(app).get("/api/ai/usage").set(auth());
    expect(report.body.data.totals).toMatchObject({ requests: 2, failed: 1, calls: 3, totalTokens: 240, unreported: 1 });
    expect(report.body.data.byDay).toHaveLength(1);
  });

  it("marks a response without a usage field as unreported, not zero", async () => {
    mockModel({ content: "Hi", usage: null });
    await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(await AiUsageModel.findOne()).toMatchObject({ usageReported: false, totalTokens: 0 });
  });

  it("records nothing when the request never reaches the model", async () => {
    mockModel();
    await request(app).post("/api/ai/chat").set(auth()).send({ message: "x", conversationId: new Types.ObjectId().toString() });
    expect(await AiUsageModel.countDocuments()).toBe(0);
  });
});

describe("model API guards", () => {
  it("answers 502 when the model returns no choices", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [] })));
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/no message/);
  });

  it("answers 504 when the model call times out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }));
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(res.status).toBe(504);
  });

  it("answers 502 when the model API is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Hi" });
    expect(res.status).toBe(502);
    expect(res.body.error.message).toMatch(/unreachable/);
  });

  it("stops creating proposals at 30 per request and tells the model why", async () => {
    const calls = Array.from({ length: 31 }, (_, i) => ({
      ...toolCall("propose_stock_adjustment", {
        cropType: "maize", changeBags: 1, reason: "found on recount",
        summary: `Row ${i + 1}: 1 bag maize found`, sourceText: `row ${i + 1}`, confidence: 0.9,
      }),
      id: `call_${i}`,
    }));
    const bodies = mockModel({ tool_calls: calls }, { content: "Proposed 30, skipped 1." });

    const res = await request(app).post("/api/ai/chat").set(auth()).send({ message: "Recount" });
    expect(res.status).toBe(200);
    expect(res.body.data.proposalIds).toHaveLength(30);
    expect(await AiProposalModel.countDocuments()).toBe(30);

    // The 31st call still got a tool reply, carrying the limit error.
    const toolReplies = bodies[1].messages.filter((m) => m.role === "tool");
    expect(toolReplies).toHaveLength(31);
    expect(String(toolReplies[30].content)).toMatch(/Limit of 30 proposals/);
  });
});
