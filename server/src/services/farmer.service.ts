import { AppError } from "../errors/AppError";
import { FarmerDocument, FarmerModel } from "../models/farmer.model";
import {
  CreateFarmerInput,
  ListFarmersQuery,
  UpdateFarmerInput,
} from "../validators/farmer.validator";

export interface FarmerListResult {
  farmers: FarmerDocument[];
  total: number;
  page: number;
  pages: number;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const DUPLICATE_PHONE = () => new AppError("A farmer with this phone number already exists", 409);

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

export async function createFarmer(input: CreateFarmerInput): Promise<FarmerDocument> {
  // No findOne pre-check: it would be racy anyway. The unique phone index is
  // the source of truth; translate its violation into a friendly 409.
  try {
    return await FarmerModel.create(input);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw DUPLICATE_PHONE();
    throw err;
  }
}

export async function listFarmers(query: ListFarmersQuery): Promise<FarmerListResult> {
  const filter = query.search
    ? {
        $or: [
          { fullName: { $regex: escapeRegex(query.search), $options: "i" } },
          { phone: { $regex: escapeRegex(query.search) } },
        ],
      }
    : {};

  const [farmers, total] = await Promise.all([
    FarmerModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    FarmerModel.countDocuments(filter),
  ]);

  return { farmers, total, page: query.page, pages: Math.max(1, Math.ceil(total / query.limit)) };
}

export async function getFarmerById(id: string): Promise<FarmerDocument> {
  const farmer = await FarmerModel.findById(id);
  if (!farmer) throw new AppError("Farmer not found", 404);
  return farmer;
}

export async function updateFarmer(id: string, input: UpdateFarmerInput): Promise<FarmerDocument> {
  let farmer;
  try {
    farmer = await FarmerModel.findByIdAndUpdate(id, input, { new: true, runValidators: true });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw DUPLICATE_PHONE();
    throw err;
  }
  if (!farmer) throw new AppError("Farmer not found", 404);
  return farmer;
}
