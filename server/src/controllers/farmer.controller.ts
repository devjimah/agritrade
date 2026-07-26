import { NextFunction, Request, Response } from "express";
import * as farmerService from "../services/farmer.service";
import {
  createFarmerSchema,
  listFarmersQuerySchema,
  objectIdSchema,
  setFarmerPinSchema,
  updateFarmerSchema,
} from "../validators/farmer.validator";

export async function createFarmerController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createFarmerSchema.parse(req.body);
    const farmer = await farmerService.createFarmer(input);
    res.status(201).json({ success: true, data: { farmer } });
  } catch (err) {
    next(err);
  }
}

export async function listFarmersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listFarmersQuerySchema.parse(req.query);
    const result = await farmerService.listFarmers(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getFarmerController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const farmer = await farmerService.getFarmerById(id);
    res.json({ success: true, data: { farmer } });
  } catch (err) {
    next(err);
  }
}

export async function updateFarmerController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const input = updateFarmerSchema.parse(req.body);
    const farmer = await farmerService.updateFarmer(id, input);
    res.json({ success: true, data: { farmer } });
  } catch (err) {
    next(err);
  }
}

export async function setFarmerPinController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const { pin } = setFarmerPinSchema.parse(req.body);
    await farmerService.setFarmerPin(id, pin);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
