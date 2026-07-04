import { NextFunction, Request, Response } from "express";
import * as customerService from "../services/customer.service";
import {
  createCustomerSchema,
  listCustomersQuerySchema,
  updateCustomerSchema,
} from "../validators/customer.validator";
import { objectIdSchema } from "../validators/farmer.validator";

export async function createCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createCustomerSchema.parse(req.body);
    const customer = await customerService.createCustomer(input);
    res.status(201).json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
}

export async function listCustomersController(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listCustomersQuerySchema.parse(req.query);
    const result = await customerService.listCustomers(query);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const customer = await customerService.getCustomerById(id);
    res.json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
}

export async function updateCustomerController(req: Request, res: Response, next: NextFunction) {
  try {
    const id = objectIdSchema.parse(req.params.id);
    const input = updateCustomerSchema.parse(req.body);
    const customer = await customerService.updateCustomer(id, input);
    res.json({ success: true, data: { customer } });
  } catch (err) {
    next(err);
  }
}
