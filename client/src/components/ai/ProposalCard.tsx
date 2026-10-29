import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  Banknote,
  Camera,
  Check,
  ClipboardList,
  HandCoins,
  MessageSquare,
  Package,
  Pencil,
  ShoppingCart,
  Store,
  TriangleAlert,
  UserPlus,
  Volume2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { KIND_LABELS, PROPOSAL_STATUS_LABELS } from "@/lib/aiProposals";
import { CROP_LABELS, CROP_TYPES } from "@/lib/crops";
import type { CropType } from "@/lib/crops";
import { formatGHS, parseGHSToPesewas } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api";
import { confirmProposal, editProposal, rejectProposal } from "@/services/ai";
import type { AiProposal, PaymentMethod, ProposalKind, ProposalPayload, ProposalStatus } from "@/services/ai";

const STATUS_STYLES: Record<ProposalStatus, string> = {
  pending: "bg-amber-100 text-amber-800",
  applying: "bg-blue-100 text-blue-800",
  confirmed: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money",
  bank: "Bank",
};

/**
 * confirmProposal holds `applying` only for the length of one service call.
 * A row still there after this long means the server died mid-confirm: the
 * ledger write may or may not have landed, so a human must check.
 */
const STUCK_APPLYING_MS = 2 * 60 * 1000;

/** Below this the card says so loudly. A hint only; it never blocks confirm. */
const LOW_CONFIDENCE = 0.6;

/** Lite card: a picture for each kind of entry, so it can be told apart without reading. */
const KIND_ICONS: Record<ProposalKind, LucideIcon> = {
  create_farmer: UserPlus,
  create_advance: HandCoins,
  create_repayment: Package,
  create_credit_sale: ShoppingCart,
  create_payment: Banknote,
  create_customer: Store,
  adjust_stock: ClipboardList,
};

/** Lite "No": one tap picks a reason (the server requires one) instead of typing it. */
const LITE_REJECT_REASONS = ["Wrong person", "Wrong amount or bags", "I don't need this"];

/** signedInt: a stock change, e.g. -3 or 2; never 0. */
type FieldType = "text" | "int" | "signedInt" | "money" | "crop" | "method";
/** Text fields that may be left empty. */
const OPTIONAL_TEXT: FieldKey[] = ["village", "location"];
type FieldKey = keyof ProposalPayload;

/** Mirrors PROPOSAL_EDIT_SCHEMAS on the server: values only, never the target. */
const EDITABLE_FIELDS: Record<ProposalKind, { key: FieldKey; label: string; type: FieldType }[]> = {
  create_farmer: [
    { key: "fullName", label: "Full name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "village", label: "Village", type: "text" },
  ],
  create_advance: [
    { key: "amountGiven", label: "Amount (GHS)", type: "money" },
    { key: "cropType", label: "Crop", type: "crop" },
    { key: "expectedBags", label: "Expected bags", type: "int" },
  ],
  create_repayment: [{ key: "bagsSupplied", label: "Bags supplied", type: "int" }],
  create_credit_sale: [
    { key: "cropType", label: "Crop", type: "crop" },
    { key: "bagsTaken", label: "Bags taken", type: "int" },
    { key: "pricePerBag", label: "Price per bag (GHS)", type: "money" },
  ],
  create_payment: [
    { key: "amountPaid", label: "Amount paid (GHS)", type: "money" },
    { key: "paymentMethod", label: "Payment method", type: "method" },
  ],
  create_customer: [
    { key: "fullName", label: "Full name", type: "text" },
    { key: "phone", label: "Phone", type: "text" },
    { key: "location", label: "Location", type: "text" },
  ],
  adjust_stock: [
    { key: "cropType", label: "Crop", type: "crop" },
    { key: "changeBags", label: "Change in bags (-3 removes three)", type: "signedInt" },
    { key: "reason", label: "Reason", type: "text" },
  ],
};

/** "+2 bags" / "-3 bags": the sign is the whole point of a stock correction. */
function signedBags(n: number | undefined): string {
  if (n === undefined) return "?";
  return `${n > 0 ? "+" : ""}${n} bag(s)`;
}

function toFormValue(type: FieldType, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (type === "money") return (Number(value) / 100).toFixed(2);
  return String(value);
}

/** Form strings -> payload values; returns an error message instead on bad input. */
function toChanges(kind: ProposalKind, form: Record<string, string>): ProposalPayload | string {
  const changes: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS[kind]) {
    const raw = (form[field.key] ?? "").trim();
    if (field.type === "money") {
      const pesewas = parseGHSToPesewas(raw);
      if (pesewas === null) return `${field.label}: enter an amount like 300 or 1,250.50`;
      changes[field.key] = pesewas;
    } else if (field.type === "int") {
      if (!/^\d+$/.test(raw) || Number(raw) < 1) return `${field.label}: enter a whole number of at least 1`;
      changes[field.key] = Number(raw);
    } else if (field.type === "signedInt") {
      if (!/^[-+]?\d+$/.test(raw) || Number(raw) === 0) return `${field.label}: enter a whole number that isn't 0`;
      changes[field.key] = Number(raw);
    } else if (field.type === "text" && !OPTIONAL_TEXT.includes(field.key) && !raw) {
      return `${field.label} is required`;
    } else {
      changes[field.key] = raw;
    }
  }
  return changes as ProposalPayload;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

/** The values that will be written, in trader terms (GHS, bags), not raw ids. */
function ProposalValues({ proposal }: { proposal: AiProposal }) {
  const p = proposal.payload;
  const t = proposal.target;
  switch (proposal.kind) {
    case "create_farmer":
      return (
        <>
          <Row label="Name">{p.fullName}</Row>
          <Row label="Phone">{p.phone}</Row>
          <Row label="Village">{p.village || "—"}</Row>
        </>
      );
    case "create_advance":
      return (
        <>
          <Row label="Cash given">{formatGHS(p.amountGiven ?? 0)}</Row>
          <Row label="Against">
            {p.expectedBags} bag(s) of {p.cropType ? CROP_LABELS[p.cropType] : "?"}
          </Row>
        </>
      );
    case "create_repayment":
      return (
        <>
          <Row label="Bags delivered">{p.bagsSupplied}</Row>
          {t?.advance && (
            <Row label="Advance">
              {CROP_LABELS[t.advance.cropType]} · {t.advance.expectedBags - t.advance.bagsRepaid} of{" "}
              {t.advance.expectedBags} bag(s) left
            </Row>
          )}
        </>
      );
    case "create_credit_sale":
      return (
        <>
          <Row label="Sold">
            {p.bagsTaken} bag(s) of {p.cropType ? CROP_LABELS[p.cropType] : "?"}
          </Row>
          <Row label="Price per bag">{formatGHS(p.pricePerBag ?? 0)}</Row>
          <Row label="Total on credit">{formatGHS((p.bagsTaken ?? 0) * (p.pricePerBag ?? 0))}</Row>
        </>
      );
    case "create_payment":
      return (
        <>
          <Row label="Cash received">{formatGHS(p.amountPaid ?? 0)}</Row>
          <Row label="Method">{p.paymentMethod ? PAYMENT_METHOD_LABELS[p.paymentMethod] : "?"}</Row>
          {t?.creditSale && (
            <Row label="Credit sale">
              {CROP_LABELS[t.creditSale.cropType]} · {formatGHS(t.creditSale.balanceRemaining)} owed
            </Row>
          )}
        </>
      );
    case "create_customer":
      return (
        <>
          <Row label="Name">{p.fullName}</Row>
          <Row label="Phone">{p.phone}</Row>
          <Row label="Location">{p.location || "—"}</Row>
        </>
      );
    case "adjust_stock":
      return (
        <>
          <Row label="Change">
            {signedBags(p.changeBags)} of {p.cropType ? CROP_LABELS[p.cropType] : "?"}
          </Row>
          {t?.stock && p.changeBags !== undefined && (
            <Row label="Stock">
              {t.stock.quantityBags} → {t.stock.quantityBags + p.changeBags} bag(s)
            </Row>
          )}
          <Row label="Reason">{p.reason}</Row>
        </>
      );
  }
}

/** Advisory, like submitClaim's remaining check: the service is the real guard. */
function warnings(proposal: AiProposal): string[] {
  const out: string[] = [];
  const { payload: p, target: t } = proposal;
  if (t?.missing) out.push("The record this points at no longer exists. Reject this proposal.");
  if (t?.advance && p.bagsSupplied !== undefined) {
    const remaining = t.advance.expectedBags - t.advance.bagsRepaid;
    if (p.bagsSupplied > remaining) out.push(`Only ${remaining} bag(s) remain on this advance.`);
  }
  if (t?.creditSale && p.amountPaid !== undefined && p.amountPaid > t.creditSale.balanceRemaining) {
    out.push(`Only ${formatGHS(t.creditSale.balanceRemaining)} is owed on this sale.`);
  }
  if (t?.stock && p.changeBags !== undefined && t.stock.quantityBags + p.changeBags < 0) {
    out.push(`Only ${t.stock.quantityBags} bag(s) are in stock to remove.`);
  }
  if (proposal.evidence.confidence < LOW_CONFIDENCE) {
    out.push("The assistant was unsure about this one. Check every field.");
  }
  return out;
}

function MatchedTo({ proposal }: { proposal: AiProposal }) {
  const t = proposal.target;
  if (proposal.kind === "create_farmer" || !t || t.missing) return null;
  const person = t.farmer
    ? { ...t.farmer, href: `/farmers/${t.farmer._id}`, place: t.farmer.village }
    : t.customer
      ? { ...t.customer, href: `/customers/${t.customer._id}`, place: t.customer.location }
      : null;
  if (!person) return null;
  return (
    <div className="rounded-md bg-muted/60 px-3 py-2 text-sm">
      <span className="text-xs uppercase text-muted-foreground">Matched to </span>
      <Link to={person.href} className="font-semibold text-primary hover:underline">
        {person.fullName}
      </Link>
      <span className="text-muted-foreground">
        {" "}
        · {person.phone}
        {person.place ? ` · ${person.place}` : ""}
      </span>
    </div>
  );
}

/** Lite card: the one figure that matters, big, plus a short line under it. */
function liteFigures(proposal: AiProposal): { person: string | null; headline: string; detail: string } {
  const p = proposal.payload;
  const t = proposal.target;
  const crop = (c?: CropType) => (c ? CROP_LABELS[c] : "?");
  const person = t?.farmer?.fullName ?? t?.customer?.fullName ?? null;
  switch (proposal.kind) {
    case "create_farmer":
      return { person: null, headline: p.fullName ?? "?", detail: [p.phone, p.village].filter(Boolean).join(" · ") };
    case "create_advance":
      return { person, headline: formatGHS(p.amountGiven ?? 0), detail: `for ${p.expectedBags} bag(s) of ${crop(p.cropType)}` };
    case "create_repayment":
      return {
        person,
        headline: `${p.bagsSupplied} bag(s)`,
        detail: t?.advance ? `of ${CROP_LABELS[t.advance.cropType]} brought in` : "brought in",
      };
    case "create_credit_sale":
      return {
        person,
        headline: formatGHS((p.bagsTaken ?? 0) * (p.pricePerBag ?? 0)),
        detail: `${p.bagsTaken} bag(s) of ${crop(p.cropType)} on credit`,
      };
    case "create_payment":
      return {
        person,
        headline: formatGHS(p.amountPaid ?? 0),
        detail: `paid by ${p.paymentMethod ? PAYMENT_METHOD_LABELS[p.paymentMethod].toLowerCase() : "?"}`,
      };
    case "create_customer":
      return { person: null, headline: p.fullName ?? "?", detail: [p.phone, p.location].filter(Boolean).join(" · ") };
    case "adjust_stock":
      return { person: null, headline: signedBags(p.changeBags), detail: `of ${crop(p.cropType)} · ${p.reason ?? ""}` };
  }
}

interface ProposalCardProps {
  proposal: AiProposal;
  /** Called after any successful confirm / reject / edit so the parent reloads. */
  onChanged: () => void | Promise<void>;
  /** True while a dialog is open or a confirm is in flight: callers pause polling. */
  onBusyChange?: (busy: boolean) => void;
  /** "lite": big picture-led card with Yes / Change / No, for the voice-first screen. */
  variant?: "full" | "lite";
  /** Lite only: read the card aloud. Omitted where speech isn't available. */
  onSpeak?: (text: string) => void;
}

export function ProposalCard({ proposal, onChanged, onBusyChange, variant = "full", onSpeak }: ProposalCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectError, setRejectError] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  const busy = confirming || editOpen || rejectOpen;
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  // Release the parent's pause if this card unmounts mid-action.
  useEffect(() => () => onBusyChange?.(false), [onBusyChange]);

  const isPending = proposal.status === "pending";
  const stuck =
    proposal.status === "applying" &&
    Date.now() - new Date(proposal.updatedAt).getTime() > STUCK_APPLYING_MS;
  const notes = isPending ? warnings(proposal) : [];

  async function handleConfirm() {
    setConfirming(true);
    setActionError("");
    try {
      // No optimistic "confirmed": the service can refuse (stale advance,
      // stock ran out) and the proposal goes back to pending with lastError.
      await confirmProposal(proposal._id);
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setConfirming(false);
      // Reload on failure too: lastError is now stored on the proposal.
      await onChanged();
    }
  }

  function openEdit() {
    const initial: Record<string, string> = {};
    for (const field of EDITABLE_FIELDS[proposal.kind]) {
      initial[field.key] = toFormValue(field.type, proposal.payload[field.key]);
    }
    setForm(initial);
    setEditError("");
    setEditOpen(true);
  }

  async function handleEditSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const thenConfirm =
      (e.nativeEvent as SubmitEvent).submitter?.getAttribute("data-action") === "save-confirm";
    const changes = toChanges(proposal.kind, form);
    if (typeof changes === "string") {
      setEditError(changes);
      return;
    }
    setEditSaving(true);
    setEditError("");
    try {
      await editProposal(proposal._id, changes);
    } catch (err) {
      setEditError(getApiErrorMessage(err));
      setEditSaving(false);
      return;
    }
    setEditSaving(false);
    setEditOpen(false);
    if (thenConfirm) await handleConfirm();
    else await onChanged();
  }

  function openReject() {
    setRejectReason("");
    setRejectError("");
    setRejectOpen(true);
  }

  function handleRejectSubmit(e: FormEvent) {
    e.preventDefault();
    if (!rejectReason.trim()) {
      setRejectError("A rejection reason is required");
      return;
    }
    reject(rejectReason.trim());
  }

  async function reject(reason: string) {
    setRejectSaving(true);
    setRejectError("");
    try {
      await rejectProposal(proposal._id, reason);
      setRejectOpen(false);
      await onChanged();
    } catch (err) {
      setRejectError(getApiErrorMessage(err));
    } finally {
      setRejectSaving(false);
    }
  }

  const SourceIcon = proposal.evidence.source === "notebook_image" ? Camera : MessageSquare;

  if (variant === "lite") {
    const KindIcon = KIND_ICONS[proposal.kind];
    const { person, headline, detail } = liteFigures(proposal);
    const spoken = [proposal.summary, ...notes].join(" ");
    return (
      <Card
        className={cn(
          "border-2",
          isPending ? "border-primary/25" : proposal.status === "confirmed" ? "border-green-300" : "border-border"
        )}
      >
        <CardContent className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <KindIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-muted-foreground">{KIND_LABELS[proposal.kind]}</p>
              {person && <p className="truncate text-lg font-semibold">{person}</p>}
            </div>
            {onSpeak && (
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => onSpeak(spoken)} aria-label="Read aloud">
                <Volume2 className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div>
            <p className="text-3xl font-bold tracking-tight">{headline}</p>
            {detail && <p className="mt-1 text-base text-muted-foreground">{detail}</p>}
          </div>

          {notes.map((note) => (
            <p key={note} className="flex items-start gap-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {note}
            </p>
          ))}
          {isPending && (proposal.lastError || actionError) && (
            <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Not saved. {proposal.lastError || actionError}
            </p>
          )}
          {stuck && (
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              This was interrupted while saving. Check the books before you do anything else.
            </p>
          )}

          {isPending ? (
            <div className="space-y-2">
              <Button
                className="h-14 w-full text-lg"
                onClick={handleConfirm}
                disabled={confirming || proposal.target?.missing}
              >
                <Check className="h-6 w-6" /> {confirming ? "Saving..." : "Yes, save it"}
              </Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="h-12 text-base" onClick={openEdit} disabled={confirming}>
                  <Pencil className="h-5 w-5" /> Change
                </Button>
                <Button variant="outline" className="h-12 text-base" onClick={openReject} disabled={confirming}>
                  <X className="h-5 w-5 text-red-600" /> No
                </Button>
              </div>
            </div>
          ) : (
            <p
              className={cn(
                "flex items-center gap-2 rounded-md p-3 text-base font-semibold",
                proposal.status === "confirmed"
                  ? "bg-green-50 text-green-800"
                  : proposal.status === "rejected"
                    ? "bg-muted text-muted-foreground"
                    : "bg-blue-50 text-blue-800"
              )}
            >
              {proposal.status === "confirmed" ? (
                <>
                  <Check className="h-5 w-5" /> Saved
                </>
              ) : proposal.status === "rejected" ? (
                <>
                  <X className="h-5 w-5" /> Not saved
                </>
              ) : (
                "Saving..."
              )}
            </p>
          )}
        </CardContent>
        {editDialog()}
        {rejectDialog()}
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{KIND_LABELS[proposal.kind]}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[proposal.status]}`}
          >
            {PROPOSAL_STATUS_LABELS[proposal.status]}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              proposal.evidence.confidence < LOW_CONFIDENCE
                ? "bg-amber-100 text-amber-800"
                : "bg-muted text-muted-foreground"
            }`}
            title="The assistant's own estimate. A hint, not a check."
          >
            {Math.round(proposal.evidence.confidence * 100)}% sure
          </span>
          {proposal.editedAt && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Edited by trader
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <SourceIcon className="h-3.5 w-3.5" />
            {new Date(proposal.createdAt).toLocaleString("en-GH", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>

        <p className="text-sm">{proposal.summary}</p>

        <MatchedTo proposal={proposal} />

        <div className="space-y-1 rounded-md border px-3 py-2">
          <ProposalValues proposal={proposal} />
        </div>

        <blockquote className="border-l-2 border-primary/30 pl-3 text-xs text-muted-foreground">
          <span className="font-medium">
            {proposal.evidence.source === "notebook_image" ? "Notebook row: " : "You said: "}
          </span>
          “{proposal.evidence.sourceText}”
          {proposal.evidence.rationale && <p className="mt-1">Why: {proposal.evidence.rationale}</p>}
        </blockquote>

        {notes.map((note) => (
          <p key={note} className="flex items-start gap-1.5 text-xs text-amber-800">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {note}
          </p>
        ))}

        {isPending && proposal.lastError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <p className="font-medium">Last confirm failed. Nothing was written.</p>
            <p className="mt-0.5">{proposal.lastError}</p>
          </div>
        )}
        {actionError && !proposal.lastError && (
          <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {actionError}
          </p>
        )}

        {stuck && (
          <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This proposal was interrupted while it was being applied. Check the farmer's or
            customer's ledger to see whether the entry was recorded before you do anything else.
          </p>
        )}

        {proposal.status === "rejected" && proposal.rejectionReason && (
          <p className="text-xs text-muted-foreground">Rejected: {proposal.rejectionReason}</p>
        )}

        {isPending && (
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={openReject} disabled={confirming}>
              Reject
            </Button>
            <Button
              size="sm"
              variant={proposal.lastError ? "default" : "outline"}
              onClick={openEdit}
              disabled={confirming}
            >
              <Pencil className="h-3.5 w-3.5" />
              {proposal.lastError ? "Edit and retry" : "Edit"}
            </Button>
            <Button
              size="sm"
              variant={proposal.lastError ? "outline" : "default"}
              onClick={handleConfirm}
              disabled={confirming || proposal.target?.missing}
            >
              {confirming ? "Confirming..." : proposal.lastError ? "Retry as is" : "Confirm"}
            </Button>
          </div>
        )}
      </CardContent>
      {editDialog()}
      {rejectDialog()}
    </Card>
  );

  function editDialog() {
    return (
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} title={`Edit: ${KIND_LABELS[proposal.kind]}`}>
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {proposal.lastError && (
            <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{proposal.lastError}</p>
          )}
          {EDITABLE_FIELDS[proposal.kind].map((field) => {
            const id = `edit-${proposal._id}-${field.key}`;
            const value = form[field.key] ?? "";
            const set = (v: string) => setForm((f) => ({ ...f, [field.key]: v }));
            return (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={id}>{field.label}</Label>
                {field.type === "crop" ? (
                  <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
                    {CROP_TYPES.map((c: CropType) => (
                      <option key={c} value={c}>
                        {CROP_LABELS[c]}
                      </option>
                    ))}
                  </Select>
                ) : field.type === "method" ? (
                  <Select id={id} value={value} onChange={(e) => set(e.target.value)}>
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                      <option key={m} value={m}>
                        {PAYMENT_METHOD_LABELS[m]}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    id={id}
                    value={value}
                    // signedInt stays "text": phone number pads have no minus key.
                    inputMode={field.type === "int" ? "numeric" : field.type === "money" ? "decimal" : "text"}
                    onChange={(e) => set(e.target.value)}
                  />
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Saving changes the proposal only. Nothing reaches the ledger until it is confirmed. To
            change who this is for, reject it and ask again.
          </p>
          {editError && <p className="text-sm text-red-600">{editError}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={editSaving} data-action="save">
              Save
            </Button>
            <Button type="submit" disabled={editSaving} data-action="save-confirm">
              {editSaving ? "Saving..." : "Save and confirm"}
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }

  function rejectDialog() {
    if (variant === "lite") {
      return (
        <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Why not?">
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Nothing will be saved.</p>
            {LITE_REJECT_REASONS.map((reason) => (
              <Button
                key={reason}
                variant="outline"
                className="h-14 w-full justify-start text-base"
                disabled={rejectSaving}
                onClick={() => reject(reason)}
              >
                <X className="h-5 w-5 text-red-600" /> {reason}
              </Button>
            ))}
            {rejectError && <p className="text-sm text-red-600">{rejectError}</p>}
          </div>
        </Dialog>
      );
    }
    return (
      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} title="Reject proposal">
        <form onSubmit={handleRejectSubmit} className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {proposal.summary} This will not touch the ledger.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`reject-${proposal._id}`}>Reason</Label>
            <Input
              id={`reject-${proposal._id}`}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          {rejectError && <p className="text-sm text-red-600">{rejectError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRejectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={rejectSaving}>
              {rejectSaving ? "Rejecting..." : "Reject proposal"}
            </Button>
          </div>
        </form>
      </Dialog>
    );
  }
}
