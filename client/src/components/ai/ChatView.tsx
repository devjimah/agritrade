import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Link } from "react-router-dom";
import {
  Boxes,
  CalendarDays,
  Camera,
  CircleCheck,
  CircleX,
  History,
  Keyboard,
  Mic,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  Sprout,
  Square,
  Trash2,
  Volume2,
  VolumeX,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ProposalCard } from "@/components/ai/ProposalCard";
import type { ChatMessage, useAssistantChat } from "@/hooks/useAssistantChat";
import { useSpeechInput } from "@/hooks/useSpeech";
import type { useSpeechOutput } from "@/hooks/useSpeech";
import { cn } from "@/lib/utils";
import { getApiErrorMessage } from "@/services/api";
import { deleteConversation, listConversations } from "@/services/ai";
import type { AgentProgress, ConversationSummary, ToolTraceEntry } from "@/services/ai";

type Variant = "full" | "lite";

const TOOL_LABELS: Record<string, string> = {
  search_farmers: "Searched farmers",
  get_farmer_advances: "Read advances",
  search_customers: "Searched customers",
  get_customer_credit_sales: "Read credit sales",
  get_inventory: "Read stock",
  get_dashboard: "Read dashboard",
  get_farmer_balances: "Read farmer balances",
  get_debtors: "Read debtors",
  list_repayment_claims: "Read farmer claims",
  get_transactions: "Read history",
  get_activity_summary: "Read period totals",
  get_stock_adjustments: "Read stock corrections",
  propose_farmer: "Drafted new farmer",
  propose_customer: "Drafted new customer",
  propose_stock_adjustment: "Drafted stock correction",
  propose_advance: "Drafted advance",
  propose_repayment: "Drafted repayment",
  propose_credit_sale: "Drafted credit sale",
  propose_payment: "Drafted payment",
};

/** Shown while a tool runs: what the assistant is doing right now, in plain words. */
const TOOL_PROGRESS: Record<string, string> = {
  search_farmers: "Looking up the farmer",
  get_farmer_advances: "Checking their advances",
  search_customers: "Looking up the customer",
  get_customer_credit_sales: "Checking their credit sales",
  get_inventory: "Checking stock",
  get_dashboard: "Reading today's totals",
  get_farmer_balances: "Checking what farmers owe",
  get_debtors: "Checking who owes money",
  list_repayment_claims: "Reading farmers' claims",
  get_transactions: "Reading the history",
  get_activity_summary: "Adding up the period",
  get_stock_adjustments: "Reading stock corrections",
  propose_farmer: "Drafting a new farmer",
  propose_customer: "Drafting a new customer",
  propose_advance: "Drafting the advance",
  propose_repayment: "Drafting the delivery",
  propose_credit_sale: "Drafting the sale",
  propose_payment: "Drafting the payment",
  propose_stock_adjustment: "Drafting the stock correction",
};

function progressLabel(progress: AgentProgress | null): string {
  if (!progress) return "Sending";
  if (progress.stage === "tool") return TOOL_PROGRESS[progress.name] ?? "Working";
  return progress.step === 0 ? "Thinking" : "Putting it together";
}

const SUGGESTIONS: { icon: LucideIcon; label: string; message: string }[] = [
  { icon: Sprout, label: "Record a delivery", message: "Abdul from Savelugu brought 5 bags of maize" },
  { icon: Wallet, label: "Who owes me?", message: "Who owes me the most money?" },
  { icon: Boxes, label: "Check stock", message: "How many bags of maize are in stock?" },
];

/** Lite tiles are questions only: one tap, no typing, a spoken answer back. */
const LITE_TILES: { icon: LucideIcon; label: string; message: string }[] = [
  { icon: Wallet, label: "Who owes me money?", message: "Which customers owe me money? Start with the biggest." },
  { icon: Sprout, label: "Who owes me bags?", message: "Which farmers still owe me bags?" },
  { icon: Boxes, label: "My stock", message: "How many bags of each crop do I have in stock?" },
  { icon: CalendarDays, label: "Today", message: "What happened today?" },
];

function ToolTrace({ trace }: { trace: ToolTraceEntry[] }) {
  if (trace.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {trace.map((t, i) => (
        <span
          key={`${t.name}-${i}`}
          title={t.error ?? t.name}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
            !t.ok
              ? "bg-red-50 text-red-700"
              : t.name.startsWith("propose_")
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground"
          )}
        >
          {t.ok ? <CircleCheck className="h-3 w-3" /> : <CircleX className="h-3 w-3" />}
          {TOOL_LABELS[t.name] ?? t.name}
        </span>
      ))}
    </div>
  );
}

function Avatar({ lite }: { lite: boolean }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-[#263821] text-accent",
        lite ? "h-9 w-9" : "h-8 w-8"
      )}
    >
      <Sparkles className="h-4 w-4" />
    </div>
  );
}

function TypingIndicator({ lite, label }: { lite: boolean; label: string }) {
  return (
    <div className="flex items-end gap-2" aria-live="polite">
      <Avatar lite={lite} />
      <div className="flex items-center gap-3 rounded-2xl rounded-bl-md border bg-card px-4 py-3">
        <span className="flex gap-1" aria-hidden>
          {[0, 150, 300].map((delay) => (
            <span
              key={delay}
              className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span className={cn("text-muted-foreground", lite ? "text-base" : "text-sm")}>{label}...</span>
      </div>
    </div>
  );
}

interface ChatViewProps {
  variant: Variant;
  chat: ReturnType<typeof useAssistantChat>;
  speech: ReturnType<typeof useSpeechOutput>;
}

export function ChatView({ variant, chat, speech }: ChatViewProps) {
  const lite = variant === "lite";
  const { messages, sending, progress, loadingConversation, proposals, loadProposals, handlerFor } = chat;
  const [input, setInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  // Lite starts with the big mic; the keyboard is one tap away.
  const [typing, setTyping] = useState(!lite);

  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const scrollEnd = useRef<HTMLDivElement>(null);

  // Lite sends what was said straight away; full drops it in the box to check first.
  const mic = useSpeechInput((text) => {
    if (lite) chat.send(text);
    else setInput((cur) => (cur ? `${cur} ${text}` : text));
  });

  useEffect(() => {
    scrollEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, mic.transcript]);

  // Grow the box with its text, up to max-h.
  useEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input, typing]);

  function send(text: string) {
    if (chat.send(text)) setInput("");
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    send(input);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends on desktop; on phones Enter is a newline and the button sends.
    if (e.key === "Enter" && !e.shiftKey && !lite && window.matchMedia("(pointer: fine)").matches) {
      e.preventDefault();
      send(input);
    }
  }

  function pickPhoto(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = "";
    chat.sendPhoto(file);
  }

  const speakButton = (m: ChatMessage) =>
    speech.supported && (
      <button
        type="button"
        onClick={() => (speech.speakingId === m.id ? speech.stop() : speech.speak(m.id, m.content))}
        className={cn(
          "inline-flex items-center gap-1 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
          lite ? "px-3 py-1.5 text-sm" : "p-1.5"
        )}
        aria-label={speech.speakingId === m.id ? "Stop reading" : "Read aloud"}
      >
        {speech.speakingId === m.id ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        {lite && (speech.speakingId === m.id ? "Stop" : "Listen")}
      </button>
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {!lite && (
        <div className="flex items-center justify-between gap-3 border-b pb-3">
          <div className="flex items-center gap-3">
            <Avatar lite={false} />
            <div>
              <h2 className="text-lg font-semibold leading-tight">Assistant</h2>
              <p className="text-xs text-muted-foreground">Drafts entries from your words. You confirm each one.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)} disabled={sending}>
              <History className="h-4 w-4" /> History
            </Button>
            {messages.length > 0 && (
              <Button variant="outline" size="sm" onClick={chat.clear} disabled={sending}>
                <Plus className="h-4 w-4" /> New chat
              </Button>
            )}
          </div>
        </div>
      )}
      {!lite && (
        <HistoryDialog
          open={historyOpen}
          currentId={chat.conversationId}
          onClose={() => setHistoryOpen(false)}
          onOpen={(id) => {
            setHistoryOpen(false);
            chat.openConversation(id);
          }}
          onDeletedCurrent={chat.clear}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={cn("mx-auto flex w-full max-w-3xl flex-col gap-4", lite ? "px-4 py-4" : "py-5")}>
          {loadingConversation && messages.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading your chat...</p>
          )}
          {messages.length === 0 && !sending && !loadingConversation &&
            (lite ? <LiteEmpty onPick={send} /> : <FullEmpty onPick={send} />)}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex flex-col items-end gap-1">
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl rounded-br-md bg-primary text-primary-foreground",
                    m.previewUrl ? "overflow-hidden p-1" : "px-4 py-2.5",
                    lite ? "text-base" : "text-sm",
                    m.failed && "opacity-60"
                  )}
                >
                  {m.previewUrl ? (
                    <img src={m.previewUrl} alt="Notebook page" className="max-h-64 rounded-xl object-cover" />
                  ) : m.isPhoto ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Camera className="h-4 w-4" /> Notebook photo
                    </span>
                  ) : (
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  )}
                </div>
                {m.failed && (
                  <span className={cn("flex items-center gap-2 text-red-600", lite ? "text-sm" : "text-xs")}>
                    Not sent
                    {chat.canRetry(m) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn("text-foreground", lite ? "h-10 px-4 text-base" : "h-7 px-2 text-xs")}
                        onClick={() => chat.retry(m.id)}
                        disabled={sending}
                      >
                        <RotateCcw className={lite ? "h-4 w-4" : "h-3.5 w-3.5"} /> Retry
                      </Button>
                    )}
                  </span>
                )}
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-2">
                <Avatar lite={lite} />
                <div className="min-w-0 flex-1 space-y-2">
                  <div
                    className={cn(
                      "w-fit max-w-full rounded-2xl rounded-tl-md px-4 py-2.5",
                      lite ? "text-lg leading-relaxed" : "text-sm leading-6",
                      m.failed ? "border border-red-200 bg-red-50 text-red-700" : "border bg-card shadow-sm"
                    )}
                  >
                    <span className="whitespace-pre-wrap break-words">{m.content}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {speakButton(m)}
                    {!lite && m.trace && <ToolTrace trace={m.trace} />}
                  </div>

                  {m.proposalIds && m.proposalIds.length > 0 && (
                    <div className="space-y-3">
                      {m.proposalIds.map((id) =>
                        proposals[id] ? (
                          <ProposalCard
                            key={id}
                            proposal={proposals[id]}
                            onChanged={loadProposals}
                            onBusyChange={handlerFor(id)}
                            variant={variant}
                            onSpeak={speech.supported ? (text) => speech.speak(id, text) : undefined}
                          />
                        ) : null
                      )}
                      {!lite && m.batchId && (
                        <Link
                          to={`/ai-proposals?batch=${m.batchId}`}
                          className="inline-block text-sm text-primary hover:underline"
                        >
                          Review this notebook page in the queue
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {sending && <TypingIndicator lite={lite} label={progressLabel(progress)} />}
          {mic.listening && lite && (
            <p className="self-end rounded-2xl rounded-br-md border-2 border-dashed border-primary/40 px-4 py-2.5 text-lg text-muted-foreground">
              {mic.transcript || "Listening..."}
            </p>
          )}
          <div ref={scrollEnd} />
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={lite ? "environment" : undefined}
        className="hidden"
        onChange={(e) => pickPhoto(e.target.files?.[0])}
      />

      {mic.error && <p className="mx-auto mb-2 w-full max-w-3xl px-4 text-center text-sm text-red-600">{mic.error}</p>}

      {lite && !typing ? (
        <LiteControls
          listening={mic.listening}
          micSupported={mic.supported}
          disabled={sending}
          onMic={mic.listening ? mic.stop : mic.start}
          onPhoto={() => fileInput.current?.click()}
          onKeyboard={() => setTyping(true)}
        />
      ) : (
        <form
          onSubmit={handleSubmit}
          className={cn(
            "flex items-end gap-1 rounded-2xl border bg-card p-1.5 shadow-sm focus-within:border-primary/40",
            lite ? "mx-3 mb-[max(0.75rem,env(safe-area-inset-bottom))]" : "mx-auto mt-2 w-full max-w-3xl"
          )}
        >
          {lite ? (
            <Button type="button" variant="ghost" size="icon" className="h-11 w-11" onClick={() => setTyping(false)} aria-label="Talk instead">
              <Mic className="h-5 w-5" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground"
              onClick={() => fileInput.current?.click()}
              disabled={sending}
              aria-label="Import a notebook photo"
              title="Import a notebook photo"
            >
              <Camera className="h-5 w-5" />
            </Button>
          )}
          <textarea
            ref={textarea}
            value={mic.listening && !lite ? [input, mic.transcript].filter(Boolean).join(" ") : input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            maxLength={2000}
            placeholder={mic.listening ? "Listening..." : lite ? "Type here" : "Tell me what happened, or ask a question"}
            aria-label="Message the assistant"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base focus-visible:outline-none sm:text-sm"
          />
          {!lite && mic.supported && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("h-10 w-10", mic.listening ? "animate-pulse text-red-600" : "text-muted-foreground")}
              onClick={mic.listening ? mic.stop : mic.start}
              disabled={sending}
              aria-label={mic.listening ? "Stop listening" : "Speak"}
              title={mic.listening ? "Stop listening" : "Speak"}
            >
              {mic.listening ? <Square className="h-4 w-4 fill-current" /> : <Mic className="h-5 w-5" />}
            </Button>
          )}
          <Button
            type="submit"
            size="icon"
            className="h-10 w-10 rounded-xl"
            disabled={sending || !input.trim()}
            aria-label="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      )}
    </div>
  );
}

function HistoryDialog({
  open,
  currentId,
  onClose,
  onOpen,
  onDeletedCurrent,
}: {
  open: boolean;
  currentId: string | null;
  onClose: () => void;
  onOpen: (id: string) => void;
  onDeletedCurrent: () => void;
}) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setItems(null);
    setError("");
    listConversations()
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((err) => {
        if (!cancelled) setError(getApiErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function remove(id: string) {
    try {
      await deleteConversation(id);
      setItems((list) => list?.filter((c) => c._id !== id) ?? null);
      if (id === currentId) onDeletedCurrent();
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Recent chats">
      <div className="space-y-2">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!items && !error && <p className="text-sm text-muted-foreground">Loading...</p>}
        {items?.length === 0 && <p className="text-sm text-muted-foreground">No saved chats yet.</p>}
        {items?.map((c) => (
          <div
            key={c._id}
            className={cn(
              "flex items-center gap-2 rounded-lg border p-2",
              c._id === currentId && "border-primary/40 bg-primary/5"
            )}
          >
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(c._id)}>
              <p className="truncate text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(c.updatedAt).toLocaleString("en-GH", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => remove(c._id)}
              aria-label={`Delete chat: ${c.title}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <p className="pt-1 text-xs text-muted-foreground">
          Deleting a chat keeps any entries it drafted. They stay in the review queue.
        </p>
      </div>
    </Dialog>
  );
}

function FullEmpty({ onPick }: { onPick: (message: string) => void }) {
  return (
    <div className="flex flex-col items-center px-2 py-8 text-center sm:py-14">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#263821] text-accent shadow-lg shadow-primary/20">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-xl font-semibold">What happened today?</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Type or say it in plain words, or photograph a page of your credit notebook. Nothing is saved
        until you confirm it.
      </p>
      <div className="mt-6 grid w-full max-w-2xl gap-2 sm:grid-cols-3">
        {SUGGESTIONS.map(({ icon: Icon, label, message }) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(message)}
            className="rounded-xl border bg-card p-3 text-left shadow-sm transition hover:border-primary/40 hover:bg-primary/5"
          >
            <Icon className="h-4 w-4 text-primary" />
            <p className="mt-2 text-sm font-medium">{label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">“{message}”</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function LiteEmpty({ onPick }: { onPick: (message: string) => void }) {
  return (
    <div className="flex flex-col items-center py-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#263821] text-accent">
        <Sparkles className="h-7 w-7" />
      </div>
      <h3 className="mt-3 text-2xl font-semibold">Hello!</h3>
      <p className="mt-1 text-lg text-muted-foreground">Tap the green button and tell me what happened.</p>
      <div className="mt-6 grid w-full grid-cols-2 gap-3">
        {LITE_TILES.map(({ icon: Icon, label, message }) => (
          <button
            key={label}
            type="button"
            onClick={() => onPick(message)}
            className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 bg-card p-3 shadow-sm active:scale-[0.98] active:bg-primary/5"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </span>
            <span className="text-base font-semibold leading-tight">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function LiteControls({
  listening,
  micSupported,
  disabled,
  onMic,
  onPhoto,
  onKeyboard,
}: {
  listening: boolean;
  micSupported: boolean;
  disabled: boolean;
  onMic: () => void;
  onPhoto: () => void;
  onKeyboard: () => void;
}) {
  const side = "flex h-14 w-14 items-center justify-center rounded-full border-2 bg-card text-foreground shadow-sm active:scale-95 disabled:opacity-50";
  return (
    <div className="border-t bg-background/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
      <div className="mx-auto flex max-w-md items-end justify-between">
        <div className="flex flex-col items-center gap-1">
          <button type="button" className={side} onClick={onPhoto} disabled={disabled || listening} aria-label="Take a photo of your notebook">
            <Camera className="h-6 w-6" />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Photo</span>
        </div>

        <div className="flex flex-col items-center gap-1">
          {micSupported ? (
            <button
              type="button"
              onClick={onMic}
              disabled={disabled}
              aria-label={listening ? "Stop" : "Tap to talk"}
              className={cn(
                "relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 disabled:opacity-50",
                listening ? "bg-red-600 shadow-red-600/30" : "bg-primary shadow-primary/30"
              )}
            >
              {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />}
              {listening ? <Square className="relative h-7 w-7 fill-current" /> : <Mic className="h-9 w-9" />}
            </button>
          ) : (
            <button
              type="button"
              onClick={onKeyboard}
              className="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-white shadow-xl"
              aria-label="Type a message"
            >
              <Keyboard className="h-9 w-9" />
            </button>
          )}
          <span className="text-sm font-semibold">
            {!micSupported ? "Type" : listening ? "Tap to stop" : "Tap to talk"}
          </span>
        </div>

        <div className="flex flex-col items-center gap-1">
          <button type="button" className={side} onClick={onKeyboard} disabled={listening} aria-label="Type instead">
            <Keyboard className="h-6 w-6" />
          </button>
          <span className="text-xs font-medium text-muted-foreground">Type</span>
        </div>
      </div>
    </div>
  );
}
