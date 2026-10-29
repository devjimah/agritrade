import { z } from "zod";
import { AppError } from "../errors/AppError";
import { ProposalKind, PROPOSAL_STATUSES } from "../models/ai-proposal.model";
import { createAdvanceSchema } from "./advance.validator";
import { createCreditSaleSchema } from "./credit-sale.validator";
import { createCustomerSchema } from "./customer.validator";
import { createFarmerSchema, objectIdSchema } from "./farmer.validator";
import { adjustStockSchema } from "./inventory.validator";
import { createPaymentSchema } from "./payment.validator";
import { createRepaymentSchema } from "./repayment.validator";

/**
 * One source of truth: each proposal payload IS the existing service input,
 * minus idempotencyKey. If a create*Schema rule changes, proposals follow.
 */
export const PROPOSAL_PAYLOAD_SCHEMAS = {
  create_farmer: createFarmerSchema,
  create_advance: createAdvanceSchema,
  create_repayment: createRepaymentSchema.omit({ idempotencyKey: true }),
  create_credit_sale: createCreditSaleSchema.omit({ idempotencyKey: true }),
  create_payment: createPaymentSchema.omit({ idempotencyKey: true }),
  create_customer: createCustomerSchema,
  adjust_stock: adjustStockSchema.omit({ idempotencyKey: true }),
} satisfies Record<ProposalKind, z.ZodType>;

export function parseProposalPayload(kind: ProposalKind, payload: unknown) {
  return PROPOSAL_PAYLOAD_SCHEMAS[kind].parse(payload);
}

/**
 * What a trader may change before retrying a confirm. Values only: the
 * farmer/advance/customer/sale a proposal points at is NOT editable — a wrong
 * match is a reject, not an edit, so the record the AI matched (and the
 * trader saw) is always the one that gets written to.
 */
export const PROPOSAL_EDIT_SCHEMAS = {
  create_farmer: PROPOSAL_PAYLOAD_SCHEMAS.create_farmer.pick({ fullName: true, phone: true, village: true }),
  create_advance: PROPOSAL_PAYLOAD_SCHEMAS.create_advance.pick({ amountGiven: true, cropType: true, expectedBags: true }),
  create_repayment: PROPOSAL_PAYLOAD_SCHEMAS.create_repayment.pick({ bagsSupplied: true }),
  create_credit_sale: PROPOSAL_PAYLOAD_SCHEMAS.create_credit_sale.pick({ cropType: true, bagsTaken: true, pricePerBag: true }),
  create_payment: PROPOSAL_PAYLOAD_SCHEMAS.create_payment.pick({ amountPaid: true, paymentMethod: true }),
  create_customer: PROPOSAL_PAYLOAD_SCHEMAS.create_customer.pick({ fullName: true, phone: true, location: true }),
  adjust_stock: PROPOSAL_PAYLOAD_SCHEMAS.adjust_stock.pick({ cropType: true, changeBags: true, reason: true }),
} satisfies Record<ProposalKind, z.ZodObject>;

/** Strict: an unlisted key (e.g. advanceId) is a 400, not silently dropped. */
export function parseProposalEdit(kind: ProposalKind, changes: unknown): Record<string, unknown> {
  const schema: z.ZodObject = PROPOSAL_EDIT_SCHEMAS[kind];
  return schema
    .partial()
    .strict()
    .refine((c) => Object.keys(c).length > 0, "At least one field is required")
    .parse(changes);
}

export const editProposalSchema = z.object({
  changes: z.record(z.string(), z.unknown()),
});

/**
 * LLMs are unreliable at unit conversion, so tools take cedis as a decimal
 * STRING ("300", "1250.5") and the server converts. Pure string math: a float
 * never exists on the way to the ledger.
 */
export function ghsToPesewas(ghs: string): number {
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(ghs.trim().replace(/,/g, ""));
  if (!m) throw new AppError(`"${ghs}" is not a valid cedi amount (e.g. 300 or 1250.50)`, 400);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export const listProposalsQuerySchema = z.object({
  status: z.enum(PROPOSAL_STATUSES).optional(),
  batchId: z.string().max(100).optional(),
  /** Comma-separated ids: the chat panel fetches the proposals one reply produced. */
  ids: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",") : undefined))
    .pipe(z.array(objectIdSchema).max(50).optional()),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListProposalsQuery = z.infer<typeof listProposalsQuerySchema>;

export const rejectProposalSchema = z.object({
  reason: z.string().trim().min(1, "Reason is required").max(1000),
});

/** Shared by chat and notebook import. */
const agentRequestFields = {
  /** Omitted on a new chat; the reply carries the id to send next time. History is read server-side. */
  conversationId: objectIdSchema.optional(),
  /** true: answer as NDJSON progress lines ending in a done/error line, instead of one JSON body. */
  stream: z.boolean().default(false),
};

export const agentChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  ...agentRequestFields,
});

export const notebookImportSchema = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  ...agentRequestFields,
});

export const usageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});
