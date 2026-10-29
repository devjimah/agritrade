import { HydratedDocument, Schema, Types, model } from "mongoose";
import { PROPOSAL_SOURCES, ProposalSource } from "./ai-proposal.model";

/**
 * One row per assistant request (chat message or notebook photo), written
 * whether it succeeded or not: a failed request can still have spent tokens.
 *
 * Token counts come from the Model API's `usage` field when the response has
 * one. `usageReported: false` means it didn't, so the token totals for that
 * row are unknown, not zero.
 */
export interface IAiUsage {
  staffId: Types.ObjectId;
  source: ProposalSource;
  model: string;
  /** Model API calls this request made (1 + one per tool round-trip). */
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usageReported: boolean;
  durationMs: number;
  ok: boolean;
  error?: string;
  createdAt?: Date;
}

export type AiUsageDocument = HydratedDocument<IAiUsage>;

const aiUsageSchema = new Schema<IAiUsage>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    source: { type: String, enum: PROPOSAL_SOURCES, required: true },
    model: { type: String, required: true },
    calls: { type: Number, required: true, min: 0 },
    promptTokens: { type: Number, required: true, min: 0, default: 0 },
    completionTokens: { type: Number, required: true, min: 0, default: 0 },
    totalTokens: { type: Number, required: true, min: 0, default: 0 },
    usageReported: { type: Boolean, required: true },
    durationMs: { type: Number, required: true, min: 0 },
    ok: { type: Boolean, required: true },
    error: { type: String, maxlength: 500 },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

aiUsageSchema.index({ createdAt: -1 });

export const AiUsageModel = model<IAiUsage>("AiUsage", aiUsageSchema);
