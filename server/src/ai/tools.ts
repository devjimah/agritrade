import { Types } from "mongoose";
import { z } from "zod";
import { ProposalKind, ProposalSource } from "../models/ai-proposal.model";
import { listAdvances } from "../services/advance.service";
import { createProposal } from "../services/ai-proposal.service";
import { listCreditSales } from "../services/credit-sale.service";
import { listCustomers } from "../services/customer.service";
import { listFarmers } from "../services/farmer.service";
import { getInventory, listStockAdjustments } from "../services/inventory.service";
import { listClaims } from "../services/repayment-claim.service";
import { getDashboardReport, getDebtorsReport, getFarmerBalancesReport } from "../services/report.service";
import { getActivitySummary, listTransactions } from "../services/transaction.service";
import {
  CROP_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REPAYMENT_CLAIM_STATUSES,
  REPAYMENT_STATUSES,
  TRANSACTION_TYPES,
} from "../types";
import { ghsToPesewas } from "../validators/ai-proposal.validator";
import { objectIdSchema } from "../validators/farmer.validator";

/**
 * Two tool classes, enforced by construction:
 *  - READ tools call existing list/report services. Safe to run freely.
 *  - PROPOSE tools only ever create an inert AiProposal. No tool can move
 *    money or stock; that requires a trader clicking confirm.
 */

export interface ToolContext {
  staffId: Types.ObjectId;
  source: ProposalSource;
  batchId?: string;
}

const evidence = {
  summary: z.string().min(3).max(300).describe("One line for the trader, e.g. 'Abdul (Savelugu) delivered 5 bags maize'"),
  sourceText: z.string().min(1).max(2000).describe("The exact words or notebook row this proposal came from"),
  confidence: z.number().min(0).max(1).describe("Your confidence that every field is right, 0-1"),
  rationale: z.string().max(1000).optional().describe("Why you matched this farmer/advance; note any ambiguity"),
};
const cedis = z.string().describe('Amount in Ghana cedis as a decimal string, e.g. "300" or "1250.50". Never pesewas.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
/** Whole UTC days (Ghana is UTC+0): `from` at 00:00, `to` at 23:59:59.999. */
const startOf = (d: string) => new Date(`${d}T00:00:00.000Z`);
const endOf = (d: string) => new Date(`${d}T23:59:59.999Z`);

type ToolDef = {
  description: string;
  args: z.ZodObject;
  run: (args: any, ctx: ToolContext) => Promise<unknown>;
};

function propose(kind: ProposalKind, toPayload: (a: any) => Record<string, unknown>) {
  return async (a: any, ctx: ToolContext) => {
    const p = await createProposal({
      kind,
      payload: toPayload(a),
      summary: a.summary,
      evidence: { source: ctx.source, sourceText: a.sourceText, confidence: a.confidence, rationale: a.rationale },
      batchId: ctx.batchId,
      requestedBy: ctx.staffId,
    });
    return { proposalId: p._id, status: "pending_trader_review" };
  };
}

export const TOOLS: Record<string, ToolDef> = {
  // ---------- READ ----------
  search_farmers: {
    description: "Find farmers by partial name or phone. Always call before proposing anything for a farmer.",
    args: z.object({ query: z.string().min(1).max(120) }),
    run: async (a) => (await listFarmers({ search: a.query, page: 1, limit: 10 })).farmers,
  },
  get_farmer_advances: {
    description: "List a farmer's cash advances with expectedBags, bagsRepaid and repaymentStatus. Needed to pick the advanceId for a repayment.",
    args: z.object({ farmerId: objectIdSchema, status: z.enum(REPAYMENT_STATUSES).optional() }),
    run: async (a) => (await listAdvances({ farmerId: a.farmerId, repaymentStatus: a.status, page: 1, limit: 20 })).advances,
  },
  search_customers: {
    description: "Find customers (buyers) by partial name or phone.",
    args: z.object({ query: z.string().min(1).max(120) }),
    run: async (a) => (await listCustomers({ search: a.query, page: 1, limit: 10 })).customers,
  },
  get_customer_credit_sales: {
    description: "List a customer's credit sales with balanceRemaining. Needed to pick the creditSaleId for a payment.",
    args: z.object({ customerId: objectIdSchema, status: z.enum(PAYMENT_STATUSES).optional() }),
    run: async (a) => (await listCreditSales({ customerId: a.customerId, paymentStatus: a.status, page: 1, limit: 20 })).sales,
  },
  get_inventory: {
    description: "Current bags in stock per crop.",
    args: z.object({}),
    run: () => getInventory(),
  },
  get_dashboard: {
    description: "Totals: outstanding advances and customer debt (pesewas), today's activity, stock.",
    args: z.object({}),
    run: () => getDashboardReport(),
  },
  get_farmer_balances: {
    description: "Farmers ranked by what they still owe on advances (pesewas).",
    args: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    run: (a) => getFarmerBalancesReport(a.limit),
  },
  get_debtors: {
    description: "Customers ranked by unpaid credit-sale balance (pesewas).",
    args: z.object({ limit: z.number().int().min(1).max(50).default(10) }),
    run: (a) => getDebtorsReport(a.limit),
  },
  list_repayment_claims: {
    description:
      "Repayments farmers reported themselves through the farmer portal. Unverified until the trader confirms " +
      "them in the claims queue; you cannot confirm or reject them, only report what is waiting.",
    args: z.object({
      status: z.enum(REPAYMENT_CLAIM_STATUSES).default("pending"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async (a) => {
      const { claims, total } = await listClaims({ status: a.status, page: 1, limit: a.limit });
      return { total, claims };
    },
  },
  get_transactions: {
    description:
      "Ledger history, newest first: advances given, bags repaid, credit sales, payments received (amount in pesewas). " +
      "Filter by farmerId or customerId (resolve them with search_* first), type, and a date range.",
    args: z.object({
      farmerId: objectIdSchema.optional(),
      customerId: objectIdSchema.optional(),
      type: z.enum(TRANSACTION_TYPES).optional(),
      from: day.optional().describe("First day, YYYY-MM-DD"),
      to: day.optional().describe("Last day, YYYY-MM-DD"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: async (a) => {
      const { transactions, total } = await listTransactions({
        farmerId: a.farmerId, customerId: a.customerId, type: a.type,
        from: a.from ? startOf(a.from) : undefined, to: a.to ? endOf(a.to) : undefined,
        page: 1, limit: a.limit,
      });
      return { total, transactions };
    },
  },
  get_activity_summary: {
    description:
      "Totals per ledger type between two days: how many, cash (pesewas) and bags. Use for 'this week', 'last month' questions.",
    args: z.object({ from: day.describe("First day, YYYY-MM-DD"), to: day.describe("Last day, YYYY-MM-DD") }),
    run: (a) => getActivitySummary(startOf(a.from), endOf(a.to)),
  },
  get_stock_adjustments: {
    description: "Recent manual stock corrections (spoiled, lost, recounted bags), newest first.",
    args: z.object({
      cropType: z.enum(CROP_TYPES).optional(),
      from: day.optional().describe("First day, YYYY-MM-DD"),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    run: (a) => listStockAdjustments({ cropType: a.cropType, since: a.from ? startOf(a.from) : undefined, limit: a.limit }),
  },

  // ---------- PROPOSE (inert until a trader confirms) ----------
  propose_farmer: {
    description: "Propose a NEW farmer record. Only if search_farmers found no match. Phone must be 0XXXXXXXXX.",
    args: z.object({ fullName: z.string(), phone: z.string(), village: z.string().optional(), ...evidence }),
    run: propose("create_farmer", (a) => ({ fullName: a.fullName, phone: a.phone, village: a.village })),
  },
  propose_customer: {
    description: "Propose a NEW customer (buyer) record. Only if search_customers found no match. Phone must be 0XXXXXXXXX.",
    args: z.object({ fullName: z.string(), phone: z.string(), location: z.string().optional(), ...evidence }),
    run: propose("create_customer", (a) => ({ fullName: a.fullName, phone: a.phone, location: a.location })),
  },
  propose_stock_adjustment: {
    description:
      "Propose correcting stock outside a sale or repayment: negative changeBags for spoiled, lost or miscounted-high bags, " +
      "positive for bags found on a recount. Never use it to record a sale or a delivery.",
    args: z.object({
      cropType: z.enum(CROP_TYPES),
      changeBags: z.number().int().describe("Signed whole bags: -3 removes three, 2 adds two. Never 0."),
      reason: z.string().describe("Why, in the trader's words, e.g. '3 bags spoiled by rain'"),
      ...evidence,
    }),
    run: propose("adjust_stock", (a) => ({ cropType: a.cropType, changeBags: a.changeBags, reason: a.reason })),
  },
  propose_advance: {
    description: "Propose a cash advance given to a farmer against future bags of a crop.",
    args: z.object({
      farmerId: objectIdSchema, amountGhs: cedis, cropType: z.enum(CROP_TYPES),
      expectedBags: z.number().int().min(1), ...evidence,
    }),
    run: propose("create_advance", (a) => ({
      farmerId: a.farmerId, amountGiven: ghsToPesewas(a.amountGhs), cropType: a.cropType, expectedBags: a.expectedBags,
    })),
  },
  propose_repayment: {
    description: "Propose BAGS a farmer delivered against an advance. Repayments are bags of crop, not cash.",
    args: z.object({ advanceId: objectIdSchema, bagsSupplied: z.number().int().min(1), ...evidence }),
    run: propose("create_repayment", (a) => ({ advanceId: a.advanceId, bagsSupplied: a.bagsSupplied })),
  },
  propose_credit_sale: {
    description: "Propose bags sold to a customer on credit.",
    args: z.object({
      customerId: objectIdSchema, cropType: z.enum(CROP_TYPES), bagsTaken: z.number().int().min(1),
      pricePerBagGhs: cedis, ...evidence,
    }),
    run: propose("create_credit_sale", (a) => ({
      customerId: a.customerId, cropType: a.cropType, bagsTaken: a.bagsTaken, pricePerBag: ghsToPesewas(a.pricePerBagGhs),
    })),
  },
  propose_payment: {
    description: "Propose cash a customer paid toward a credit sale.",
    args: z.object({
      creditSaleId: objectIdSchema, amountGhs: cedis, paymentMethod: z.enum(PAYMENT_METHODS), ...evidence,
    }),
    run: propose("create_payment", (a) => ({
      creditSaleId: a.creditSaleId, amountPaid: ghsToPesewas(a.amountGhs), paymentMethod: a.paymentMethod,
    })),
  },
};

/**
 * OpenAI-compatible `tools` array for Meta Model API chat completions.
 * io: "input" so defaulted args (e.g. `limit`) are optional to the model, not
 * required; `$schema` dropped because the Model API docs don't list it as
 * accepted in `parameters`.
 */
export const TOOL_SPECS = Object.entries(TOOLS).map(([name, t]) => {
  const { $schema: _drop, ...parameters } = z.toJSONSchema(t.args, { io: "input" });
  return { type: "function" as const, function: { name, description: t.description, parameters } };
});

const MAX_TOOL_OUTPUT = 12_000;

/** Validates args, runs the tool, and ALWAYS returns a string (errors included) for the model. */
export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<string> {
  const tool = TOOLS[name];
  if (!tool) return JSON.stringify({ error: `Unknown tool ${name}` });
  try {
    const args = tool.args.parse(JSON.parse(rawArgs || "{}"));
    const out = JSON.stringify(await tool.run(args, ctx)) ?? "null";
    // Slicing JSON mid-token would hand the model (and agent.ts) invalid JSON;
    // wrap the cut text instead so the output always parses.
    return out.length <= MAX_TOOL_OUTPUT
      ? out
      : JSON.stringify({ truncated: true, note: "Result too long; narrow the query", partial: out.slice(0, MAX_TOOL_OUTPUT) });
  } catch (err) {
    const msg = err instanceof z.ZodError ? z.prettifyError(err) : err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: msg });
  }
}
