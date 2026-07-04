import { Response, NextFunction } from "express";
import * as inventoryService from "../services/inventory.service";
import { AuthRequest } from "../types";

export async function getInventoryController(
  _req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const inventory = await inventoryService.getInventory();
    res.json({ success: true, data: { inventory } });
  } catch (err) {
    next(err);
  }
}
