import { useMemo, useState } from "react";
import { MoneyInput } from "@/components/ds/money-input";
import { formatMoney } from "@/lib/money";
import {
  useGetClientReceivables,
  getGetClientReceivablesQueryKey,
  useListClientPayments,
  getListClientPaymentsQueryKey,
  useListFundAccounts,
  getListFundAccountsQueryKey,
  useCreateClientPayment,
  useUpdateClientPayment,
  useDeleteClientPayment,
  useListFundLedger,
  getListFundLedgerQueryKey,
} from "@workspace/api-client-react";
import type { ClientPayment, ClientReceivablesEventsItem } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { useNewTransaction } from "@/components/new-transaction";
import { LedgerEntrySheet } from "@/components/fund-ledger";
import { Money } from "@/components/ds/money";
import { CardsSkeleton, EmptyState, ErrorState, TableSkeleton } from "@/components/ds/states";
import { invalidateFinance } from "@/lib/finance-queries";

const PAYMENT_METHODS = ["Bank Transfer", "UPI", "Cheque", "Cash", "Card", "Other"];

const money = (value: number | null | undefined) => formatMoney(value ?? 0);

const round2 = (n: number) => Math.round(n * 100) / 100;

// API errors read "HTTP 400 Bad Request: <server message>"; show the message.
function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message.replace(/^HTTP \d+[^:]*:\s*/, "");
  return "Something went wrong";
}

const today = () => new Date().toISOString().slice(0, 10);

function allocationLabel(p: ClientPayment): { text: string; detail?: string } {
  const allocations = p.allocations ?? [];
  if (allocations.length === 0) return { text: "Client-level / Unallocated" };
  const names = allocations.map((a) => `${a.eventName ?? `Event #${a.eventId}`}: ${money(a.amount)}`);
  const unallocated = p.unallocated ?? 0;
  return {
    text: allocations.length === 1 ? `Event: ${allocations[0].eventName ?? `#${allocations[0].eventId}`}` : `${allocations.length} events`,
    detail: [...(allocations.length > 1 ? names : []), ...(unallocated > 0 ? [`${money(unallocated)} client-level`] : [])].join(" · ") || undefined,
  };
}

/*
 * Client receivables and payment history. A payment is recorded against the
 * client; allocating it to events is optional and never automatic.
 */
export function ClientPayments({ clientId }: { clientId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const receivables = useGetClientReceivables(clientId, {
    query: { enabled: !!clientId, queryKey: getGetClientReceivablesQueryKey(clientId) },
  });
  const payments = useListClientPayments(clientId, { limit: 500 }, {
    query: { enabled: !!clientId, queryKey: getListClientPaymentsQueryKey(clientId, { limit: 500 }) },
  });
  const deletePayment = useDeleteClientPayment();

  const [dialog, setDialog] = useState<{ mode: "create" } | { mode: "edit"; payment: ClientPayment } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientPayment | null>(null);
  const [ledgerEntryId, setLedgerEntryId] = useState<number | null>(null);
  const newTransaction = useNewTransaction();

  // The fund ledger row currently standing for each payment, so a payment
  // opens the same transaction drawer as the Funds page.
  const ledgerParams = { clientId, category: "client_payment" as const, type: "client_payment", limit: 200 };
  const ledger = useListFundLedger(ledgerParams, { query: { enabled: !!clientId, queryKey: getListFundLedgerQueryKey(ledgerParams) } });
  const ledgerRowByPayment = useMemo(() => {
    const map = new Map<number, number>();
    for (const row of ledger.data?.data ?? []) {
      if (row.relatedClientPaymentId !== null && row.status === "posted") map.set(row.relatedClientPaymentId, row.id);
    }
    return map;
  }, [ledger.data]);

  const refresh = () => invalidateFinance(queryClient);

  const r = receivables.data;

  const handleDelete = () => {
    const target = deleteTarget;
    if (!target || deletePayment.isPending) return;
    deletePayment.mutate({ id: target.id }, {
      onSuccess: async () => {
        await refresh();
        toast({ variant: "success", title: "Payment reversed", description: `${money(target.amount)} was removed from ${target.fundAccountName ?? "the receiving fund"} and the client's outstanding was restored.` });
        setDeleteTarget(null);
      },
      onError: (err) => toast({ title: "Failed to reverse payment", description: errorMessage(err), variant: "destructive" }),
    });
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle>Receivables &amp; Payments</CardTitle>
          <CardDescription>Money received settles the client's balance. It is cash collection, not revenue.</CardDescription>
        </div>
        <Button onClick={() => newTransaction.open({ kind: "money_received", clientId })} disabled={!r}>
          <Plus className="mr-2 h-4 w-4" /> Record Money Received
        </Button>
      </CardHeader>

      <CardContent className="space-y-6">
        {receivables.isLoading ? (
          <CardsSkeleton count={4} />
        ) : receivables.isError || !r ? (
          <ErrorState title="Couldn't load receivables" error={receivables.error} onRetry={() => void receivables.refetch()} />
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Total Invoiced" value={money(r.totalBilled)} hint="Incl. GST" />
            <Stat label="Total Received" value={money(r.totalReceived)} />
            <Stat label="Outstanding" value={money(r.outstanding)} tone={r.outstanding > 0 ? "warning" : undefined} />
            {r.credit > 0 ? (
              <Stat label="Client Credit" value={money(r.credit)} tone="success" hint="Received more than invoiced" />
            ) : (
              <Stat label="Unallocated" value={money(r.unallocated)} hint="Client-level payments" />
            )}
          </div>
        )}

        <div>
          <h4 className="mb-2 text-sm font-semibold">Payment History</h4>
          {payments.isLoading ? (
            <div className="rounded-lg border"><TableSkeleton rows={3} cols={5} /></div>
          ) : payments.isError ? (
            <ErrorState title="Couldn't load payments" error={payments.error} onRetry={() => void payments.refetch()} />
          ) : !payments.data || payments.data.data.length === 0 ? (
            <EmptyState
              title="No money received recorded yet"
              description={r && r.legacyCollected ? `${money(r.legacyCollected)} was collected through event-level payment records and is included in Total Received.` : "Use Record Money Received when this client pays."}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Receiving Fund</TableHead>
                    <TableHead>Method / Ref</TableHead>
                    <TableHead>Allocation</TableHead>
                    <TableHead className="w-[1%]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.data.data.map((p) => {
                    const alloc = allocationLabel(p);
                    return (
                      <TableRow
                        key={p.id}
                        className={ledgerRowByPayment.has(p.id) ? "cursor-pointer" : undefined}
                        onClick={() => { const id = ledgerRowByPayment.get(p.id); if (id) setLedgerEntryId(id); }}
                      >
                        <TableCell className="whitespace-nowrap">{formatDate(p.paymentDate)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold"><Money value={p.amount} signed /></TableCell>
                        <TableCell className="min-w-[7rem]">{p.fundAccountName ?? "—"}</TableCell>
                        <TableCell>
                          <div>{p.paymentMethod || "—"}</div>
                          {p.reference && <div className="max-w-[9rem] truncate text-xs text-muted-foreground" title={p.reference}>{p.reference}</div>}
                        </TableCell>
                        <TableCell>
                          <div className={alloc.text.startsWith("Client-level") ? "text-muted-foreground" : ""}>{alloc.text}</div>
                          {alloc.detail && <div className="text-xs text-muted-foreground">{alloc.detail}</div>}
                          {p.notes && <div className="text-xs text-muted-foreground italic">{p.notes}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Edit payment" onClick={() => setDialog({ mode: "edit", payment: p })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Reverse payment" onClick={() => setDeleteTarget(p)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            {ledgerRowByPayment.has(p.id) && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Transaction details" onClick={() => setLedgerEntryId(ledgerRowByPayment.get(p.id)!)}>
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>

      {dialog && r && (
        <PaymentDialog
          key={dialog.mode === "edit" ? `edit-${dialog.payment.id}` : "create"}
          clientId={clientId}
          clientName={r.client.name}
          events={r.events ?? []}
          payment={dialog.mode === "edit" ? dialog.payment : null}
          onClose={() => setDialog(null)}
          onSaved={refresh}
        />
      )}

      <LedgerEntrySheet entryId={ledgerEntryId} onClose={() => setLedgerEntryId(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open && !deletePayment.isPending) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse this payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && `${money(deleteTarget.amount)} received on ${formatDate(deleteTarget.paymentDate)} will be removed. A reversal entry takes it back out of ${deleteTarget.fundAccountName ?? "the receiving fund"}, and the client's outstanding goes back up. The audit log keeps the record.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePayment.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePayment.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
            >
              {deletePayment.isPending ? "Reversing..." : "Reverse Payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warning" | "success" }) {
  const color = tone === "warning" ? "text-warning" : tone === "success" ? "text-money-in" : "";
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums sm:text-xl ${color}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

type AllocationDraft = { eventId: number; amount: string };

function PaymentDialog({
  clientId,
  clientName,
  events,
  payment,
  onClose,
  onSaved,
}: {
  clientId: number;
  clientName: string;
  events: ClientReceivablesEventsItem[];
  payment: ClientPayment | null;
  onClose: () => void;
  onSaved: () => Promise<unknown>;
}) {
  const { toast } = useToast();
  const funds = useListFundAccounts({ query: { queryKey: getListFundAccountsQueryKey() } });
  const createPayment = useCreateClientPayment();
  const updatePayment = useUpdateClientPayment();
  const saving = createPayment.isPending || updatePayment.isPending;

  const existing = payment?.allocations ?? [];
  const [amount, setAmount] = useState(payment ? String(payment.amount) : "");
  const [date, setDate] = useState(payment?.paymentDate ?? today());
  const [fundId, setFundId] = useState(payment ? String(payment.fundAccountId) : "");
  const [method, setMethod] = useState(payment?.paymentMethod ?? "Bank Transfer");
  const [reference, setReference] = useState(payment?.reference ?? "");
  const [notes, setNotes] = useState(payment?.notes ?? "");
  const [mode, setMode] = useState<"client" | "events">(existing.length > 0 ? "events" : "client");
  const [allocations, setAllocations] = useState<AllocationDraft[]>(
    existing.map((a) => ({ eventId: a.eventId, amount: String(a.amount) })),
  );

  // Remaining allocatable per event; this payment's own allocations are added
  // back when editing because they are being replaced.
  const allocatable = useMemo(() => {
    const own = new Map(existing.map((a) => [a.eventId, a.amount]));
    return new Map(events.map((e) => [e.eventId, round2(e.outstanding + (own.get(e.eventId) ?? 0))]));
  }, [events, payment]);

  const amountNum = Number(amount);
  const selectedRows = mode === "events" ? allocations : [];
  const allocTotal = round2(selectedRows.reduce((s, a) => s + (Number(a.amount) || 0), 0));
  const remaining = Number.isFinite(amountNum) ? round2(amountNum - allocTotal) : 0;

  const toggleEvent = (eventId: number, checked: boolean) => {
    setAllocations((rows) => {
      if (!checked) return rows.filter((a) => a.eventId !== eventId);
      const left = Math.max(0, round2((Number(amount) || 0) - rows.reduce((s, a) => s + (Number(a.amount) || 0), 0)));
      const suggested = Math.min(left, allocatable.get(eventId) ?? 0);
      return [...rows, { eventId, amount: suggested > 0 ? String(suggested) : "" }];
    });
  };

  const validate = (): string | null => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) return "Amount must be greater than zero";
    if (!date) return "Payment date is required";
    if (!fundId) return "Select the receiving fund";
    if (mode === "events") {
      if (selectedRows.length === 0) return "Select at least one event, or choose Client-level / Unallocated";
      for (const a of selectedRows) {
        const n = Number(a.amount);
        const ev = events.find((e) => e.eventId === a.eventId);
        if (!Number.isFinite(n) || n <= 0) return `Enter an amount for ${ev?.eventName ?? "each selected event"}`;
        if (n > (allocatable.get(a.eventId) ?? 0)) return `${ev?.eventName ?? "Event"} has only ${money(allocatable.get(a.eventId))} outstanding. Leave the excess client-level.`;
      }
      if (allocTotal > round2(amountNum)) return "Allocated amounts exceed the payment amount";
    }
    return null;
  };

  const submit = () => {
    const error = validate();
    if (error) { toast({ title: "Validation Error", description: error, variant: "destructive" }); return; }
    const allocationPayload = selectedRows.map((a) => ({ eventId: a.eventId, amount: round2(Number(a.amount)) }));
    const callbacks = {
      onSuccess: async () => {
        await onSaved();
        toast({
          title: payment ? "Payment updated" : "Payment recorded",
          description: `${money(amountNum)} from ${clientName}${allocationPayload.length === 0 ? " recorded as client-level / unallocated." : "."}`,
        });
        onClose();
      },
      onError: (err: unknown) => toast({ title: payment ? "Failed to update payment" : "Failed to record payment", description: errorMessage(err), variant: "destructive" }),
    };
    const fields = {
      amount: round2(amountNum),
      payment_date: date,
      fund_account_id: Number(fundId),
      payment_method: method,
      reference: reference.trim(),
      notes: notes.trim(),
      allocations: allocationPayload,
    };
    if (payment) updatePayment.mutate({ id: payment.id, data: fields }, callbacks);
    else createPayment.mutate({ id: clientId, data: fields }, callbacks);
  };

  const fundList = funds.data ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{payment ? "Edit Client Payment" : "Add Client Payment"}</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
        >
          <div className="flex-1 space-y-4 overflow-y-auto py-2 pr-1">
            <div className="text-sm">
              <span className="text-muted-foreground">Client: </span>
              <span className="font-medium">{clientName}</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Amount *</Label>
                <MoneyInput value={amount} onValueChange={setAmount} autoFocus />
              </div>
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Receiving Fund *</Label>
                <select
                  value={fundId}
                  onChange={(e) => setFundId(e.target.value)}
                  disabled={funds.isLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">{funds.isLoading ? "Loading funds..." : funds.isError ? "Failed to load funds" : "Select fund"}</option>
                  {fundList.map((f) => <option key={f.id} value={String(f.id)}>{f.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Payment Method</Label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                >
                  {[...new Set([...PAYMENT_METHODS, method].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Reference</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. TXN12345" />
            </div>

            <div className="space-y-2">
              <Label>Allocation</Label>
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as "client" | "events")} className="gap-2">
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value="client" className="mt-0.5" />
                  <span>
                    <span className="text-sm font-medium">Client-level / Unallocated</span>
                    <span className="block text-xs text-muted-foreground">Reduces the client's total outstanding without assigning it to an event.</span>
                  </span>
                </label>
                <label className="flex cursor-pointer items-start gap-2 rounded-md border p-3">
                  <RadioGroupItem value="events" className="mt-0.5" disabled={events.length === 0} />
                  <span>
                    <span className="text-sm font-medium">Allocate to Event(s)</span>
                    <span className="block text-xs text-muted-foreground">
                      {events.length === 0 ? "This client has no events yet." : "Any amount left over stays client-level."}
                    </span>
                  </span>
                </label>
              </RadioGroup>

              {mode === "events" && events.length > 0 && (
                <div className="space-y-2 rounded-md border p-3">
                  {events.map((ev) => {
                    const row = allocations.find((a) => a.eventId === ev.eventId);
                    const max = allocatable.get(ev.eventId) ?? 0;
                    return (
                      <div key={ev.eventId} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 shrink-0 accent-primary"
                          checked={!!row}
                          disabled={!row && max <= 0}
                          onChange={(e) => toggleEvent(ev.eventId, e.target.checked)}
                          aria-label={`Allocate to ${ev.eventName}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{ev.eventName}</div>
                          <div className="text-xs text-muted-foreground">
                            {ev.eventDate ? `${formatDate(ev.eventDate)} · ` : ""}{max > 0 ? `${money(max)} outstanding` : "Fully paid"}
                          </div>
                        </div>
                        <div className="w-32 shrink-0">
                          <MoneyInput
                            className="h-8"
                            disabled={!row}
                            value={row?.amount ?? ""}
                            onValueChange={(v) => setAllocations((rows) => rows.map((a) => (a.eventId === ev.eventId ? { ...a, amount: v } : a)))}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex justify-between border-t pt-2 text-xs">
                    <span className="text-muted-foreground">Allocated {money(allocTotal)}</span>
                    <span className={remaining < 0 ? "text-destructive" : "text-muted-foreground"}>
                      {remaining < 0 ? `${money(-remaining)} over the payment amount` : `${money(remaining)} stays client-level`}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Consolidated payment against outstanding balance" rows={2} />
            </div>

            {payment && (
              <p className="text-xs text-muted-foreground">
                Changing the amount or fund posts a reversal of the original entry and a new entry, so fund history stays complete.
              </p>
            )}
          </div>

          <DialogFooter className="shrink-0 border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : payment ? "Save Changes" : "Record Payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
