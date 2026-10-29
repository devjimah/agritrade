import type { ProposalKind, ProposalStatus } from "@/services/ai";

export const KIND_LABELS: Record<ProposalKind, string> = {
  create_farmer: "New farmer",
  create_advance: "Cash advance",
  create_repayment: "Bags delivered",
  create_credit_sale: "Credit sale",
  create_payment: "Customer payment",
  create_customer: "New customer",
  adjust_stock: "Stock correction",
};

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: "Pending",
  applying: "Applying",
  confirmed: "Confirmed",
  rejected: "Rejected",
};
