import { HydratedDocument, Schema, Types, model } from "mongoose";

/**
 * One assistant chat, owned by the staff member who had it. Kept server-side
 * so a reload or another device picks it up, and so the server (not the
 * client) decides what history the model sees.
 *
 * Only completed turns are stored: a request that failed never reached the
 * model's history, so it is never saved here either.
 */
export interface IAiConversationMessage {
  role: "user" | "assistant";
  content: string;
  /** User only: a notebook photo turn. The image itself is never stored. */
  isPhoto?: boolean;
  /** Assistant only. */
  trace?: { name: string; ok: boolean; error?: string }[];
  proposalIds?: Types.ObjectId[];
  batchId?: string;
  createdAt: Date;
}

export interface IAiConversation {
  staffId: Types.ObjectId;
  /** The first message, trimmed: what the history list shows. */
  title: string;
  messages: IAiConversationMessage[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type AiConversationDocument = HydratedDocument<IAiConversation>;

/** Oldest messages drop off past this; the model only ever sees the last 20 turns anyway. */
export const MAX_STORED_MESSAGES = 200;

const messageSchema = new Schema<IAiConversationMessage>(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 8000 },
    isPhoto: { type: Boolean },
    trace: [{ _id: false, name: String, ok: Boolean, error: String }],
    proposalIds: [{ type: Schema.Types.ObjectId, ref: "AiProposal" }],
    batchId: { type: String },
    createdAt: { type: Date, required: true },
  },
  { _id: true }
);

const aiConversationSchema = new Schema<IAiConversation>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    messages: { type: [messageSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

aiConversationSchema.index({ staffId: 1, updatedAt: -1 });

export const AiConversationModel = model<IAiConversation>("AiConversation", aiConversationSchema);
