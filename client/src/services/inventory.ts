import { api } from "./api";
import type { CropType } from "@/lib/crops";

export interface InventoryItem {
  cropType: CropType;
  quantityBags: number;
  updatedAt: string | null;
}

export async function getInventory(): Promise<InventoryItem[]> {
  const res = await api.get("/inventory");
  return res.data.data.inventory;
}
