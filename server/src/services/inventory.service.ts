import { InventoryDocument, InventoryModel } from "../models/inventory.model";
import { CROP_TYPES, CropType } from "../types";

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
