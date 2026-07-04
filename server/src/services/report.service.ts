import { Types } from "mongoose";
import { CreditSaleModel } from "../models/credit-sale.model";
import { CustomerModel } from "../models/customer.model";
import { FarmerAdvanceModel, PRO_RATA_OUTSTANDING } from "../models/farmer-advance.model";
import { FarmerModel } from "../models/farmer.model";
import { PaymentModel } from "../models/payment.model";
import { FarmerRepaymentModel } from "../models/farmer-repayment.model";
import { getInventory, InventoryItem } from "./inventory.service";

export interface DashboardReport {
  counts: { farmers: number; customers: number };
  inventory: InventoryItem[];
  /** Pesewas, pro-rated by bags repaid (same formula as the advance summary). */
  outstandingAdvances: number;
  /** Pesewas: sum of balanceRemaining across all credit sales. */
  outstandingDebt: number;
  today: {
    salesCount: number;
    salesValue: number;
    paymentsCount: number;
    paymentsValue: number;
    repaymentBags: number;
  };
}

export interface DebtorRow {
  customerId: Types.ObjectId;
  fullName: string;
  phone: string;
  outstandingBalance: number;
  unpaidSales: number;
}

export interface FarmerBalanceRow {
  farmerId: Types.ObjectId;
  fullName: string;
  phone: string;
  outstandingAmount: number;
  openAdvances: number;
  bagsOutstanding: number;
}

/**
 * Start of "today" for the trader. Ghana (Africa/Accra) is UTC year-round,
 * so the UTC day boundary is the trader's local midnight.
 */
function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function getDashboardReport(): Promise<DashboardReport> {
  const since = startOfToday();

  const [
    farmers,
    customers,
    inventory,
    advanceAgg,
    debtAgg,
    salesToday,
    paymentsToday,
    repaymentsToday,
  ] = await Promise.all([
    FarmerModel.countDocuments(),
    CustomerModel.countDocuments(),
    getInventory(),
    FarmerAdvanceModel.aggregate<{ outstanding: number }>([
      { $group: { _id: null, outstanding: { $sum: PRO_RATA_OUTSTANDING } } },
    ]),
    CreditSaleModel.aggregate<{ outstanding: number }>([
      { $group: { _id: null, outstanding: { $sum: "$balanceRemaining" } } },
    ]),
    CreditSaleModel.aggregate<{ count: number; value: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$totalAmount" } } },
    ]),
    PaymentModel.aggregate<{ count: number; value: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, count: { $sum: 1 }, value: { $sum: "$amountPaid" } } },
    ]),
    FarmerRepaymentModel.aggregate<{ bags: number }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, bags: { $sum: "$bagsSupplied" } } },
    ]),
  ]);

  return {
    counts: { farmers, customers },
    inventory,
    outstandingAdvances: advanceAgg[0]?.outstanding ?? 0,
    outstandingDebt: debtAgg[0]?.outstanding ?? 0,
    today: {
      salesCount: salesToday[0]?.count ?? 0,
      salesValue: salesToday[0]?.value ?? 0,
      paymentsCount: paymentsToday[0]?.count ?? 0,
      paymentsValue: paymentsToday[0]?.value ?? 0,
      repaymentBags: repaymentsToday[0]?.bags ?? 0,
    },
  };
}

/** Customers with money outstanding, biggest debt first. */
export async function getDebtorsReport(limit = 50): Promise<DebtorRow[]> {
  return CreditSaleModel.aggregate<DebtorRow>([
    { $match: { balanceRemaining: { $gt: 0 } } },
    {
      $group: {
        _id: "$customerId",
        outstandingBalance: { $sum: "$balanceRemaining" },
        unpaidSales: { $sum: 1 },
      },
    },
    { $sort: { outstandingBalance: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: CustomerModel.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "customer",
      },
    },
    { $unwind: "$customer" },
    {
      $project: {
        _id: 0,
        customerId: "$_id",
        fullName: "$customer.fullName",
        phone: "$customer.phone",
        outstandingBalance: 1,
        unpaidSales: 1,
      },
    },
  ]);
}

/** Farmers with open advances, largest pro-rata balance first. */
export async function getFarmerBalancesReport(limit = 50): Promise<FarmerBalanceRow[]> {
  return FarmerAdvanceModel.aggregate<FarmerBalanceRow>([
    { $match: { repaymentStatus: { $ne: "completed" } } },
    {
      $group: {
        _id: "$farmerId",
        outstandingAmount: { $sum: PRO_RATA_OUTSTANDING },
        openAdvances: { $sum: 1 },
        bagsOutstanding: { $sum: { $subtract: ["$expectedBags", "$bagsRepaid"] } },
      },
    },
    { $sort: { outstandingAmount: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: FarmerModel.collection.name,
        localField: "_id",
        foreignField: "_id",
        as: "farmer",
      },
    },
    { $unwind: "$farmer" },
    {
      $project: {
        _id: 0,
        farmerId: "$_id",
        fullName: "$farmer.fullName",
        phone: "$farmer.phone",
        outstandingAmount: 1,
        openAdvances: 1,
        bagsOutstanding: 1,
      },
    },
  ]);
}

