import { AppError } from "../errors/AppError";
import { CustomerDocument, CustomerModel } from "../models/customer.model";
import {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from "../validators/customer.validator";

export interface CustomerListResult {
  customers: CustomerDocument[];
  total: number;
  page: number;
  pages: number;
}

const DUPLICATE_PHONE = () =>
  new AppError("A customer with this phone number already exists", 409);

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function createCustomer(input: CreateCustomerInput): Promise<CustomerDocument> {
  // The unique phone index is the source of truth for duplicates.
  try {
    return await CustomerModel.create(input);
  } catch (err) {
    if (isDuplicateKeyError(err)) throw DUPLICATE_PHONE();
    throw err;
  }
}

export async function listCustomers(query: ListCustomersQuery): Promise<CustomerListResult> {
  const filter = query.search
    ? {
        $or: [
          { fullName: { $regex: escapeRegex(query.search), $options: "i" } },
          { phone: { $regex: escapeRegex(query.search) } },
        ],
      }
    : {};

  const [customers, total] = await Promise.all([
    CustomerModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    CustomerModel.countDocuments(filter),
  ]);

  return {
    customers,
    total,
    page: query.page,
    pages: Math.max(1, Math.ceil(total / query.limit)),
  };
}

export async function getCustomerById(id: string): Promise<CustomerDocument> {
  const customer = await CustomerModel.findById(id);
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
}

export async function updateCustomer(
  id: string,
  input: UpdateCustomerInput
): Promise<CustomerDocument> {
  let customer;
  try {
    customer = await CustomerModel.findByIdAndUpdate(id, input, {
      returnDocument: "after",
      runValidators: true,
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw DUPLICATE_PHONE();
    throw err;
  }
  if (!customer) throw new AppError("Customer not found", 404);
  return customer;
}
