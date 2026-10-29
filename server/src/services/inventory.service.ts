import mongoose, { Types } from "mongoose";
import { AppError } from "../errors/AppError";
import { InventoryDocument, InventoryModel } from "../models/inventory.model";
import { StockAdjustmentDocument, StockAdjustmentModel } from "../models/stock-adjustment.model";
import { CROP_TYPES, CropType } from "../types";
import { AdjustStockInput } from "../validators/inventory.validator";

/** E11000 specifically on the idempotencyKey index — not just any dup key. */
function isIdempotencyKeyConflict(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e.code === 11000 && e.keyPattern?.idempotencyKey !== undefined;
}

/**
 * Corrects stock outside a repayment or sale, atomically with its audit
 * record. A removal uses a guarded update (quantityBags >= bags removed), the
 * same never-negative rule credit sales follow; an addition upserts so a crop
 * with no stock document yet can still be corrected upward.
 */
export async function adjustStock(
  input: AdjustStockInput,
  createdBy: Types.ObjectId
): Promise<StockAdjustmentDocument> {
  const session = await mongoose.startSession();
  try {
    let adjustment!: StockAdjustmentDocument;
    await session.withTransaction(async () => {
      const removing = input.changeBags < 0;
      const updated = await InventoryModel.findOneAndUpdate(
        removing
          ? { cropType: input.cropType, quantityBags: { $gte: -input.changeBags } }
          : { cropType: input.cropType },
        { $inc: { quantityBags: input.changeBags } },
        { returnDocument: "after", upsert: !removing, session }
      );
      if (!updated) {
        const current = await InventoryModel.findOne({ cropType: input.cropType }, null, { session });
        throw new AppError(
          `Only ${current?.quantityBags ?? 0} bag(s) of ${input.cropType} in stock — cannot remove ${-input.changeBags}`,
          409
        );
      }
      [adjustment] = await StockAdjustmentModel.create(
        [{ ...input, quantityAfter: updated.quantityBags, createdBy }],
        { session }
      );
    });
    return adjustment;
  } catch (err) {
    // A retry of an adjustment that already committed gets the original back.
    if (isIdempotencyKeyConflict(err)) {
      const existing = await StockAdjustmentModel.findOne({ idempotencyKey: input.idempotencyKey });
      if (existing) return existing;
      throw new AppError("This stock adjustment was already recorded", 409);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export async function listStockAdjustments(query: { cropType?: CropType; since?: Date; limit: number }) {
  const filter: Record<string, unknown> = {};
  if (query.cropType) filter.cropType = query.cropType;
  if (query.since) filter.createdAt = { $gte: query.since };
  return StockAdjustmentModel.find(filter).sort({ createdAt: -1 }).limit(query.limit).lean();
}

export interface InventoryItem {
  cropType: CropType;
  quantityBags: number;
  updatedAt: Date | null;
}

/** Returns every crop, including ones with no stock document yet (0 bags). */
export async function getInventory(): Promise<InventoryItem[]> {
  const docs = await InventoryModel.find();
  const byCrop = new Map<CropType, InventoryDocument>(docs.map((d) => [d.cropType, d]));
  return CROP_TYPES.map((cropType) => {
    const doc = byCrop.get(cropType);
    return {
      cropType,
      quantityBags: doc?.quantityBags ?? 0,
      updatedAt: doc?.updatedAt ?? null,
    };
  });
}
