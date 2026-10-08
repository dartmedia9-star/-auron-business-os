import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateClientPayment,
  useCreateFundTransfer,
  useGetClientReceivables,
  getGetClientReceivablesQueryKey,
  useGetFinanceSummary,
  getGetFinanceSummaryQueryKey,
  useListClients,
  getListClientsQueryKey,
  useListFundAccounts,
  getListFundAccountsQueryKey,
} from "@workspace/api-client-react";
import type { ClientPayment } from "@workspace/api-client-react";
import { ArrowDownLeft, ArrowLeftRight, Check, CheckCircle2, ChevronsUpDown, Loader2, Receipt } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Money, formatINR } from "@/components/ds/money";
import { errorMessage } from "@/components/ds/states";
import { useToast } from "@/hooks/use-toast";
import { cn, formatDate } from "@/lib/utils";
import { PAYMENT_METHODS, invalidateFinance, localToday, newSubmissionKey } from "@/lib/finance-queries";

// ---------------------------------------------------------------------------
// New Transaction: the single entry point for money movements.
//
//   Money Received → POST /clients/:id/payments (client payment + fund ledger)
//   Fund Transfer  → POST /fund-transfers        (existing transfer API)
//   Expense        → the existing Log Expense form (/finance/expenses)
//
// Revenue is never entered here; it stays on the event (billing only).
// ---------------------------------------------------------------------------

export type TransactionKind = "money_received" | "fund_transfer" | "expense";

type OpenOptions = { kind?: TransactionKind; clientId?: number; eventId?: number };

const NewTransactionContext = createContext<{ open: (options?: OpenOptions) => void } | null>(null);

export function useNewTransaction() {
  const ctx = useContext(NewTransactionContext);
  if (!ctx) throw new Error("useNewTransaction must be used inside NewTransactionProvider");
  return ctx;
}

export function NewTransactionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; options: OpenOptions; session: number }>({ open: false, options: {}, session: 0 });
  const open = useCallback((options: OpenOptions = {}) => setState((s) => ({ open: true, options, session: s.session + 1 })), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <NewTransactionContext.Provider value={value}>
      {children}
      <Sheet open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
          {/* Remount per open so every session starts clean with a fresh submission key. */}
          <NewTransactionPanel key={state.session} options={state.options} onClose={() => setState((s) => ({ ...s, open: false }))} />
        </SheetContent>
      </Sheet>
    </NewTransactionContext.Provider>
  );
}

const KINDS: Array<{ value: TransactionKind; label: string; icon: typeof ArrowDownLeft; hint: string }> = [
  { value: "money_received", label: "Money Received", icon: ArrowDownLeft, hint: "Client cash into a fund" },
  { value: "fund_transfer", label: "Fund Transfer", icon: ArrowLeftRight, hint: "Between your funds" },
  { value: "expense", label: "Expense", icon: Receipt, hint: "Cash out of a fund" },
];

function NewTransactionPanel({ options, onClose }: { options: OpenOptions; onClose: () => void }) {
  const [kind, setKind] = useState<TransactionKind>(options.kind ?? "money_received");

  return (
    <>
      <SheetHeader className="space-y-1 border-b px-5 pb-4 pt-5 text-left sm:px-6">
        <SheetTitle className="text-xl">New Transaction</SheetTitle>
        <SheetDescription>Record actual money movement. Revenue is billed on the event and never changes a fund.</SheetDescription>
        <div role="radiogroup" aria-label="Transaction type" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {KINDS.map((k) => {
            const active = kind === k.value;
            return (
              <button
                key={k.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setKind(k.value)}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md px-2 py-2 text-xs font-medium transition-all duration-150 sm:flex-row sm:justify-center sm:gap-1.5 sm:text-sm",
                  active ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <k.icon className="h-4 w-4" aria-hidden />
                {k.label}
              </button>
            );
          })}
        </div>
      </SheetHeader>
      <div className="flex min-h-0 flex-1 flex-col">
        {kind === "money_received" && <MoneyReceivedForm initialClientId={options.clientId} initialEventId={options.eventId} onClose={onClose} />}
        {kind === "fund_transfer" && <FundTransferForm onClose={onClose} />}
        {kind === "expense" && <ExpenseHandoff onClose={onClose} />}
      </div>
    </>
  );
}

function Field({ label, required, hint, children, htmlFor }: { label: string; required?: boolean; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
        {required ? <span className="text-destructive"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AmountInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">₹</span>
      <Input
        id={id}
        inputMode="decimal"
        type="number"
        min="0"
        step="0.01"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 pl-8 text-xl font-semibold tabular-nums"
      />
    </div>
  );
}

function SheetFooterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col-reverse gap-2 border-t bg-background px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{children}</div>;
}

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Money Received
// ---------------------------------------------------------------------------

function MoneyReceivedForm({ initialClientId, initialEventId, onClose }: { initialClientId?: number; initialEventId?: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const clients = useListClients({ limit: 1000 }, { query: { queryKey: getListClientsQueryKey({ limit: 1000 }) } });
  const funds = useListFundAccounts({ query: { queryKey: getListFundAccountsQueryKey() } });
  const createPayment = useCreateClientPayment();

  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [clientId, setClientId] = useState<number | null>(initialClientId ?? null);
  const [eventId, setEventId] = useState<string>(initialEventId ? String(initialEventId) : "none");
  const [fundId, setFundId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday());
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submissionKey, setSubmissionKey] = useState(newSubmissionKey);
  const [result, setResult] = useState<ClientPayment | null>(null);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  const receivables = useGetClientReceivables(clientId ?? 0, {
    query: { enabled: clientId !== null, queryKey: getGetClientReceivablesQueryKey(clientId ?? 0) },
  });

  const fundList = funds.data ?? [];
  useEffect(() => {
    if (!fundId && fundList.length > 0) setFundId(String(fundList[fundList.length - 1].id)); // oldest account first created
  }, [fundId, fundList]);

  const clientList = clients.data?.data ?? [];
  const client = clientList.find((c) => c.id === clientId);
  const r = receivables.data;
  const events = r?.events ?? [];
  const selectedEvent = eventId === "none" ? null : events.find((e) => String(e.eventId) === eventId) ?? null;
  const fund = fundList.find((f) => String(f.id) === fundId);
  const amountNum = Math.round(Number(amount) * 100) / 100;

  // Preview of what the server will do (it re-checks under a lock and is authoritative).
  const toEvent = selectedEvent ? Math.min(amountNum || 0, selectedEvent.outstanding) : 0;
  const clientLevel = Math.max(0, (amountNum || 0) - toEvent);
  const outstandingAfter = r ? Math.max(0, r.outstanding - (amountNum || 0)) : 0;
  const creditAfter = r ? r.credit + Math.max(0, (amountNum || 0) - r.outstanding) : 0;

  const problems: string[] = [];
  if (clientId === null) problems.push("Choose the client who paid.");
  if (!fund) problems.push("Choose the fund that received the money.");
  if (!(amountNum > 0)) problems.push("Enter an amount greater than zero.");
  if (!date) problems.push("Enter the payment date.");

  const changeClient = (id: number) => {
    setClientId(id);
    setEventId("none");
    setClientPickerOpen(false);
  };

  const submit = () => {
    if (problems.length > 0 || clientId === null || !fund || createPayment.isPending) return;
    createPayment.mutate(
      {
        id: clientId,
        data: {
          amount: amountNum,
          payment_date: date,
          fund_account_id: fund.id,
          event_id: selectedEvent ? selectedEvent.eventId : null,
          payment_method: method || undefined,
          reference: reference.trim() || undefined,
          notes: notes.trim() || undefined,
          idempotency_key: submissionKey,
        },
      },
      {
        onSuccess: async (payment) => {
          setResult(payment);
          setStep("done");
          await invalidateFinance(queryClient);
          toast({
            variant: "success",
            title: "Money received recorded",
            description: `${formatINR(payment.amount, { exact: true })} from ${client?.name ?? "the client"} into ${payment.fundAccountName ?? fund.name}.`,
          });
        },
        onError: (err) => {
          setStep("form");
          toast({ title: "Payment was not recorded", description: errorMessage(err), variant: "destructive" });
        },
      },
    );
  };

  const recordAnother = () => {
    setStep("form");
    setResult(null);
    setAmount("");
    setReference("");
    setNotes("");
    setEventId("none");
    setSubmissionKey(newSubmissionKey());
  };

  if (step === "done" && result) {
    const allocated = result.allocated ?? 0;
    const unallocated = result.unallocated ?? 0;
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-6">
          <div className="flex flex-col items-center text-center animate-fade-up">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <p className="mt-4 text-sm text-muted-foreground">Recorded</p>
            <p className="text-3xl font-semibold tabular-nums text-money-in">+{formatINR(result.amount, { exact: true })}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              from {client?.name} into {result.fundAccountName}, dated {formatDate(result.paymentDate)}
            </p>
          </div>
          <div className="mt-6 divide-y rounded-xl border bg-card px-4">
            {(result.allocations ?? []).map((a) => (
              <ReviewRow key={a.eventId} label={`Applied to ${a.eventName ?? "event"}`}><Money value={a.amount} /></ReviewRow>
            ))}
            {unallocated > 0 && (
              <ReviewRow label={allocated > 0 ? "Excess kept client-level (credit)" : "Client-level, unallocated"}>
                <Money value={unallocated} tone="neutral" />
              </ReviewRow>
            )}
          </div>
        </div>
        <SheetFooterBar>
          <Button variant="outline" onClick={() => { onClose(); navigate("/fund-transfers"); }}>View in transaction history</Button>
          <Button variant="outline" onClick={recordAnother}>Record another</Button>
          <Button onClick={onClose}>Done</Button>
        </SheetFooterBar>
      </>
    );
  }

  if (step === "review" && client && fund) {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-sm font-medium">Review before recording</p>
          <p className="text-sm text-muted-foreground">This adds cash to {fund.name} and settles {client.name}'s balance. It does not change revenue.</p>
          <div className="mt-4 divide-y rounded-xl border bg-card px-4">
            <ReviewRow label="Amount"><Money value={amountNum} signed /></ReviewRow>
            <ReviewRow label="Client">{client.name}</ReviewRow>
            <ReviewRow label="Event">{selectedEvent ? selectedEvent.eventName : "None (client-level)"}</ReviewRow>
            <ReviewRow label="Receiving fund">{fund.name}</ReviewRow>
            <ReviewRow label="Payment date">{formatDate(date)}</ReviewRow>
            <ReviewRow label="Method">{method || "—"}</ReviewRow>
            {reference.trim() && <ReviewRow label="Reference">{reference.trim()}</ReviewRow>}
            {selectedEvent ? (
              <>
                <ReviewRow label={`Applied to ${selectedEvent.eventName}`}><Money value={toEvent} tone="neutral" /></ReviewRow>
                {clientLevel > 0 && <ReviewRow label="Excess kept client-level"><Money value={clientLevel} tone="neutral" /></ReviewRow>}
              </>
            ) : (
              <ReviewRow label="Allocation">Client-level, available to allocate later</ReviewRow>
            )}
          </div>
        </div>
        <SheetFooterBar>
          <Button variant="outline" onClick={() => setStep("form")} disabled={createPayment.isPending}>Back</Button>
          <Button onClick={submit} disabled={createPayment.isPending}>
            {createPayment.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Confirm and record
          </Button>
        </SheetFooterBar>
      </>
    );
  }

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        <Field label="Amount" required htmlFor="nt-amount">
          <AmountInput id="nt-amount" value={amount} onChange={setAmount} />
        </Field>

        <Field label="Client" required>
          <Popover open={clientPickerOpen} onOpenChange={setClientPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" aria-expanded={clientPickerOpen} className="h-10 w-full justify-between font-normal">
                <span className={cn("truncate", !client && "text-muted-foreground")}>
                  {client ? client.name : clients.isLoading ? "Loading clients…" : "Search clients"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command>
                <CommandInput placeholder="Search clients…" />
                <CommandList>
                  <CommandEmpty>{clients.isError ? "Couldn't load clients." : "No client found."}</CommandEmpty>
                  <CommandGroup>
                    {clientList.map((c) => (
                      <CommandItem key={c.id} value={`${c.name} ${c.company ?? ""} ${c.id}`} onSelect={() => changeClient(c.id)}>
                        <Check className={cn("mr-2 h-4 w-4", c.id === clientId ? "opacity-100" : "opacity-0")} />
                        <span className="truncate">{c.name}</span>
                        {c.company && <span className="ml-auto truncate pl-2 text-xs text-muted-foreground">{c.company}</span>}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {clientId !== null && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {receivables.isLoading ? (
                <span>Loading balance…</span>
              ) : receivables.isError ? (
                <span className="text-destructive">Couldn't load this client's balance: {errorMessage(receivables.error)}</span>
              ) : r ? (
                <>
                  <span>Billed <span className="font-medium text-foreground tabular-nums">{formatINR(r.totalBilled)}</span></span>
                  <span>Received <span className="font-medium text-foreground tabular-nums">{formatINR(r.totalReceived)}</span></span>
                  <span>Outstanding <span className="font-medium text-foreground tabular-nums">{formatINR(r.outstanding)}</span></span>
                  {r.credit > 0 && <span>Credit <span className="font-medium text-money-in tabular-nums">{formatINR(r.credit)}</span></span>}
                </>
              ) : null}
            </div>
          )}
        </Field>

        <Field label="Event" hint="Pick the event this money is for, or leave it client-level to allocate later.">
          <Select value={eventId} onValueChange={setEventId} disabled={clientId === null || receivables.isLoading}>
            <SelectTrigger className="h-10"><SelectValue placeholder="No event" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No event (client-level)</SelectItem>
              {events.map((e) => (
                <SelectItem key={e.eventId} value={String(e.eventId)}>
                  <span className="flex w-full items-center justify-between gap-3">
                    <span className="truncate">{e.eventName}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{e.outstanding > 0 ? `${formatINR(e.outstanding)} due` : "settled"}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Receiving fund" required>
          {funds.isError ? (
            <p className="text-sm text-destructive">Couldn't load funds: {errorMessage(funds.error)}</p>
          ) : (
            <Select value={fundId} onValueChange={setFundId} disabled={funds.isLoading}>
              <SelectTrigger className="h-10"><SelectValue placeholder={funds.isLoading ? "Loading funds…" : "Choose a fund"} /></SelectTrigger>
              <SelectContent>
                {fundList.map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Payment date" required htmlFor="nt-date">
            <Input id="nt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" />
          </Field>
          <Field label="Payment method">
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Reference" htmlFor="nt-ref">
          <Input id="nt-ref" placeholder="UTR, cheque no., UPI ref" value={reference} onChange={(e) => setReference(e.target.value)} className="h-10" />
        </Field>
        <Field label="Notes" htmlFor="nt-notes">
          <Textarea id="nt-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>

        {clientId !== null && amountNum > 0 && r && (
          <div className="rounded-xl border bg-muted/40 p-4 text-sm animate-fade-in" aria-live="polite">
            <p className="font-medium">What this will do</p>
            <ul className="mt-2 space-y-1.5 text-muted-foreground">
              <li className="flex justify-between gap-3"><span>{fund ? fund.name : "Fund"} balance</span><Money value={amountNum} signed /></li>
              {selectedEvent ? (
                <>
                  <li className="flex justify-between gap-3"><span>Applied to {selectedEvent.eventName}</span><Money value={toEvent} tone="neutral" /></li>
                  {clientLevel > 0 && (
                    <li className="flex justify-between gap-3">
                      <span>Exceeds the event's {formatINR(selectedEvent.outstanding)} due, kept client-level</span>
                      <Money value={clientLevel} tone="neutral" />
                    </li>
                  )}
                </>
              ) : (
                <li className="flex justify-between gap-3"><span>Recorded client-level (unallocated)</span><Money value={amountNum} tone="neutral" /></li>
              )}
              <li className="flex justify-between gap-3"><span>{client?.name} outstanding after</span><Money value={outstandingAfter} tone="neutral" /></li>
              {creditAfter > 0 && <li className="flex justify-between gap-3"><span>Client credit after</span><Money value={creditAfter} tone="in" /></li>}
            </ul>
          </div>
        )}
      </div>
      <SheetFooterBar>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => setStep("review")} disabled={problems.length > 0} title={problems[0]}>Review</Button>
      </SheetFooterBar>
    </>
  );
}

// ---------------------------------------------------------------------------
// Fund Transfer (existing transfer API)
// ---------------------------------------------------------------------------

function FundTransferForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const funds = useListFundAccounts({ query: { queryKey: getListFundAccountsQueryKey() } });
  const summary = useGetFinanceSummary(undefined, { query: { queryKey: getGetFinanceSummaryQueryKey() } });
  const createTransfer = useCreateFundTransfer();

  const [step, setStep] = useState<"form" | "review">("form");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday());
  const [description, setDescription] = useState("");

  const fundList = funds.data ?? [];
  const balanceOf = (id: string) => summary.data?.fundAccounts?.find((a) => String(a.id) === id)?.balance;
  const from = fundList.find((f) => String(f.id) === fromId);
  const to = fundList.find((f) => String(f.id) === toId);
  const amountNum = Math.round(Number(amount) * 100) / 100;

  const problems: string[] = [];
  if (!from || !to) problems.push("Choose both funds.");
  if (from && to && from.id === to.id) problems.push("From and to must be different funds.");
  if (!(amountNum > 0)) problems.push("Enter an amount greater than zero.");
  if (!date) problems.push("Enter the transfer date.");
  // Same guard the Funds page always applied: a fund cannot send more than it holds.
  const fromBalance = from ? balanceOf(String(from.id)) : undefined;
  if (from && fromBalance !== undefined && amountNum > fromBalance) problems.push(`${from.name} has only ${formatINR(fromBalance, { exact: true })} available.`);

  const submit = () => {
    if (problems.length > 0 || !from || !to || createTransfer.isPending) return;
    createTransfer.mutate(
      { data: { from_account_id: from.id, to_account_id: to.id, amount: amountNum, date, description: description.trim() || "Fund transfer" } },
      {
        onSuccess: async () => {
          await invalidateFinance(queryClient);
          toast({ variant: "success", title: "Transfer recorded", description: `${formatINR(amountNum, { exact: true })} moved from ${from.name} to ${to.name}. Internal movement, no P&L effect.` });
          onClose();
        },
        onError: (err) => {
          setStep("form");
          toast({ title: "Transfer was not recorded", description: errorMessage(err), variant: "destructive" });
        },
      },
    );
  };

  if (fundList.length > 0 && fundList.length < 2) {
    return <div className="p-6 text-sm text-muted-foreground">A transfer needs at least two fund accounts. Add one on the Funds page.</div>;
  }

  if (step === "review" && from && to) {
    return (
      <>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          <p className="text-sm font-medium">Review before recording</p>
          <p className="text-sm text-muted-foreground">Moves money between your own funds. It is not revenue, an expense, or cash in/out.</p>
          <div className="mt-4 divide-y rounded-xl border bg-card px-4">
            <ReviewRow label="Amount"><Money value={amountNum} tone="neutral" /></ReviewRow>
            <ReviewRow label="From">{from.name}</ReviewRow>
            <ReviewRow label="To">{to.name}</ReviewRow>
            <ReviewRow label="Date">{formatDate(date)}</ReviewRow>
            {description.trim() && <ReviewRow label="Description">{description.trim()}</ReviewRow>}
          </div>
        </div>
        <SheetFooterBar>
          <Button variant="outline" onClick={() => setStep("form")} disabled={createTransfer.isPending}>Back</Button>
          <Button onClick={submit} disabled={createTransfer.isPending}>
            {createTransfer.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Confirm transfer
          </Button>
        </SheetFooterBar>
      </>
    );
  }

  const fundSelect = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value} onValueChange={onChange} disabled={funds.isLoading}>
      <SelectTrigger className="h-10"><SelectValue placeholder={funds.isLoading ? "Loading funds…" : placeholder} /></SelectTrigger>
      <SelectContent>
        {fundList.map((f) => (
          <SelectItem key={f.id} value={String(f.id)}>
            <span className="flex w-full items-center justify-between gap-3">
              <span>{f.name}</span>
              {balanceOf(String(f.id)) !== undefined && <span className="text-xs text-muted-foreground tabular-nums">{formatINR(balanceOf(String(f.id)))}</span>}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {funds.isError && <p className="text-sm text-destructive">Couldn't load funds: {errorMessage(funds.error)}</p>}
        <Field label="Amount" required htmlFor="nt-tr-amount"><AmountInput id="nt-tr-amount" value={amount} onChange={setAmount} /></Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="From fund" required>{fundSelect(fromId, setFromId, "Choose source")}</Field>
          <Field label="To fund" required>{fundSelect(toId, setToId, "Choose destination")}</Field>
        </div>
        <Field label="Date" required htmlFor="nt-tr-date"><Input id="nt-tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-10" /></Field>
        <Field label="Description" htmlFor="nt-tr-desc"><Input id="nt-tr-desc" placeholder="Why the money moved" value={description} onChange={(e) => setDescription(e.target.value)} className="h-10" /></Field>
        {from && to && from.id === to.id && <p className="text-sm text-destructive">From and to must be different funds.</p>}
        {from && fromBalance !== undefined && amountNum > fromBalance && (
          <p className="text-sm text-destructive">{from.name} has only {formatINR(fromBalance, { exact: true })} available.</p>
        )}
      </div>
      <SheetFooterBar>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => setStep("review")} disabled={problems.length > 0} title={problems[0]}>Review</Button>
      </SheetFooterBar>
    </>
  );
}

// ---------------------------------------------------------------------------
// Expense: hands off to the existing Log Expense form
// ---------------------------------------------------------------------------

function ExpenseHandoff({ onClose }: { onClose: () => void }) {
  const [, navigate] = useLocation();
  return (
    <>
      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
        <div className="rounded-xl border bg-card p-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Receipt className="h-5 w-5" /></span>
          <p className="mt-3 font-medium">Expenses use the Log Expense form</p>
          <p className="mt-1 text-sm text-muted-foreground">
            It captures category, GST, the event it belongs to and which fund paid. The paying fund is reduced by amount + GST; an expense paid by "Other" does not touch any fund.
          </p>
        </div>
      </div>
      <SheetFooterBar>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={() => { onClose(); navigate("/finance/expenses?new=1"); }}>Open Log Expense</Button>
      </SheetFooterBar>
    </>
  );
}
