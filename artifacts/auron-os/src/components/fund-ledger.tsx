import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetFundLedgerEntry,
  getGetFundLedgerEntryQueryKey,
  useListFundAccounts,
  getListFundAccountsQueryKey,
  useListFundLedger,
  getListFundLedgerQueryKey,
} from "@workspace/api-client-react";
import type { FundLedgerAuditEntry, FundLedgerEntry, ListFundLedgerParams } from "@workspace/api-client-react";
import { ChevronLeft, ChevronRight, ExternalLink, Search, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DirectionIcon, LedgerStatus, LedgerTypeBadge, ledgerTypeLabel } from "@/components/ds/ledger-badges";
import { Money, formatINR } from "@/components/ds/money";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ds/states";
import { cn, formatDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Unified fund transaction history: one table over the fund ledger for every
// fund (client payments, expenses, transfers, reversals), with a detail
// drawer per row. Read-only.
// ---------------------------------------------------------------------------

const PAGE_SIZE = 25;

const CATEGORY_OPTIONS = [
  { value: "all", label: "All types" },
  { value: "client_payment", label: "Money received" },
  { value: "expense", label: "Expenses" },
  { value: "transfer", label: "Transfers" },
  { value: "adjustment", label: "Adjustments" },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** The secondary line under a ledger row's description: who / what it relates to. */
function relatedLine(e: FundLedgerEntry): string | null {
  const parts: string[] = [];
  if (e.clientName) parts.push(e.clientName);
  if (e.events.length > 0) parts.push(e.events.map((ev) => ev.eventName ?? `Event #${ev.eventId}`).join(", "));
  if (e.category === "transfer" && e.counterpartyFundName) parts.push(e.direction === "out" ? `to ${e.counterpartyFundName}` : `from ${e.counterpartyFundName}`);
  if (e.expenseCategory) parts.push(e.expenseCategory);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function FundLedger({ clientId, fundAccountId, title = "Transaction history" }: { clientId?: number; fundAccountId?: number; title?: string }) {
  const funds = useListFundAccounts({ query: { queryKey: getListFundAccountsQueryKey() } });
  const [fund, setFund] = useState<string>(fundAccountId ? String(fundAccountId) : "all");
  const [category, setCategory] = useState("all");
  const [direction, setDirection] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Debounce the free-text search so typing doesn't fire a request per key.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => setPage(1), [fund, category, direction, fromDate, toDate, search]);

  const params: ListFundLedgerParams = {
    page,
    limit: PAGE_SIZE,
    ...(clientId ? { clientId } : {}),
    ...(fund !== "all" ? { fundAccountId: Number(fund) } : {}),
    ...(category !== "all" ? { category: category as ListFundLedgerParams["category"] } : {}),
    ...(direction !== "all" ? { direction: direction as ListFundLedgerParams["direction"] } : {}),
    ...(fromDate ? { fromDate } : {}),
    ...(toDate ? { toDate } : {}),
    ...(search ? { search } : {}),
  };
  const ledger = useListFundLedger(params, { query: { queryKey: getListFundLedgerQueryKey(params), placeholderData: (prev) => prev } });

  const rows = ledger.data?.data ?? [];
  const total = ledger.data?.total ?? 0;
  const totals = ledger.data?.totals;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = fund !== "all" || category !== "all" || direction !== "all" || !!fromDate || !!toDate || !!search;

  const clearFilters = () => {
    setFund(fundAccountId ? String(fundAccountId) : "all");
    setCategory("all");
    setDirection("all");
    setFromDate("");
    setToDate("");
    setSearchInput("");
  };

  return (
    <section className="rounded-xl border bg-card shadow-card">
      <div className="space-y-3 border-b p-4 sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground">Every cash movement across funds, by payment / transaction date</p>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search descriptions" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} className="pl-8" aria-label="Search transactions" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {!fundAccountId && (
              <Select value={fund} onValueChange={setFund}>
                <SelectTrigger className="sm:w-44" aria-label="Fund"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All funds</SelectItem>
                  {(funds.data ?? []).map((f) => <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="sm:w-40" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="sm:w-32" aria-label="Direction"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">In and out</SelectItem>
                <SelectItem value="in">Money in</SelectItem>
                <SelectItem value="out">Money out</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="sm:w-40" aria-label="From date" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="sm:w-40" aria-label="To date" />
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9">
                <X className="mr-1 h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
        {totals && (
          <div className="grid grid-cols-2 gap-2 pt-1 text-sm sm:grid-cols-4">
            <TotalChip label="Cash in" value={<Money value={totals.cashIn} tone="in" />} />
            <TotalChip label="Cash out" value={<Money value={totals.cashOut} tone="out" />} />
            <TotalChip label="Net cash" value={<Money value={totals.netCash} signed />} />
            <TotalChip label="Internal transfers" value={<Money value={totals.internalTransfersIn} tone="neutral" />} hint="Not cash in/out" />
          </div>
        )}
      </div>

      {ledger.isLoading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : ledger.isError ? (
        <div className="p-4"><ErrorState title="Couldn't load transactions" error={ledger.error} onRetry={() => void ledger.refetch()} /></div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title={filtered ? "No transactions match these filters" : "No transactions yet"}
            description={filtered ? "Try widening the dates or clearing filters." : "Money received, expenses and transfers will appear here as they are recorded."}
            action={filtered ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        </div>
      ) : (
        <div className={cn("transition-opacity", ledger.isFetching && "opacity-70")}>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-28">Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Fund</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((e) => (
                  <TableRow
                    key={e.id}
                    tabIndex={0}
                    onClick={() => setSelectedId(e.id)}
                    onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); setSelectedId(e.id); } }}
                    className={cn("cursor-pointer focus-visible:bg-muted focus-visible:outline-none", e.status === "reversed" && "opacity-60")}
                  >
                    <TableCell className="whitespace-nowrap text-sm tabular-nums">{formatDate(e.transactionDate)}</TableCell>
                    <TableCell><LedgerTypeBadge type={e.transactionType} /></TableCell>
                    <TableCell className="max-w-[280px]">
                      <p className="truncate text-sm font-medium">{e.description || ledgerTypeLabel(e.transactionType)}</p>
                      {relatedLine(e) && <p className="truncate text-xs text-muted-foreground">{relatedLine(e)}</p>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{e.fundAccountName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{e.paymentMethod ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">
                      <Money value={e.signedAmount} signed tone={e.isInternalTransfer ? "neutral" : "auto"} />
                    </TableCell>
                    <TableCell><LedgerStatus status={e.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {/* Mobile list */}
          <ul className="divide-y md:hidden">
            {rows.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setSelectedId(e.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-muted", e.status === "reversed" && "opacity-60")}>
                  <DirectionIcon direction={e.direction} internal={e.isInternalTransfer} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{e.description || ledgerTypeLabel(e.transactionType)}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatDate(e.transactionDate)} · {e.fundAccountName}
                      {relatedLine(e) ? ` · ${relatedLine(e)}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={e.signedAmount} signed tone={e.isInternalTransfer ? "neutral" : "auto"} className="text-sm font-semibold" />
                    <div><LedgerStatus status={e.status} /></div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
            <span>
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}

      <LedgerEntrySheet entryId={selectedId} onClose={() => setSelectedId(null)} />
    </section>
  );
}

function TotalChip({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2" title={hint}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail drawer
// ---------------------------------------------------------------------------

const ALLOCATION_LABEL: Record<string, string> = {
  fully_allocated: "Fully allocated to events",
  partially_allocated: "Partly allocated, remainder client-level",
  client_level: "Client-level (unallocated)",
};

const AUDIT_FIELD_LABEL: Record<string, string> = {
  amount: "Amount",
  paymentDate: "Payment date",
  fundAccountId: "Fund",
  paymentMethod: "Method",
  reference: "Reference",
  notes: "Notes",
  allocations: "Allocations",
  paidBy: "Paid by",
  gst: "GST",
  date: "Date",
  description: "Description",
  category: "Category",
  eventId: "Event",
};

function auditSummary(a: FundLedgerAuditEntry): string[] {
  const oldV = (a.oldValues ?? {}) as Record<string, unknown>;
  const newV = (a.newValues ?? {}) as Record<string, unknown>;
  if (a.action !== "update") return [];
  const show = (v: unknown) => (Array.isArray(v) ? `${v.length} event${v.length === 1 ? "" : "s"}` : v == null || v === "" ? "—" : String(v));
  return Object.keys(AUDIT_FIELD_LABEL)
    .filter((k) => k in newV && JSON.stringify(oldV[k] ?? null) !== JSON.stringify(newV[k] ?? null) && !(String(oldV[k]) === String(newV[k])))
    .map((k) => `${AUDIT_FIELD_LABEL[k]}: ${show(oldV[k])} → ${show(newV[k])}`);
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      <div className="rounded-xl border bg-card px-4">{children}</div>
    </section>
  );
}

export function LedgerEntrySheet({ entryId, onClose }: { entryId: number | null; onClose: () => void }) {
  return (
    <Sheet open={entryId !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        {entryId !== null && <LedgerEntryDetail entryId={entryId} onNavigate={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function LedgerEntryDetail({ entryId, onNavigate }: { entryId: number; onNavigate: () => void }) {
  const detail = useGetFundLedgerEntry(entryId, { query: { queryKey: getGetFundLedgerEntryQueryKey(entryId) } });
  const d = detail.data;
  const payment = d?.related.payment as
    | { id: number; deleted?: boolean; amount?: number; allocated?: number; unallocated?: number; allocations?: Array<{ eventId: number; eventName?: string | null; amount: number }> }
    | null
    | undefined;
  const transfer = d?.related.transfer as { id: number; fromAccountName?: string | null; toAccountName?: string | null; date?: string; description?: string | null } | null | undefined;
  const expense = d?.related.expense as { id: number; category?: string; description?: string; amount?: number; gst?: number; paidBy?: string | null; year?: number; month?: number } | null | undefined;
  const auditRows = useMemo(() => d?.audit ?? [], [d]);

  return (
    <>
      <SheetHeader className="border-b px-5 pb-4 pt-5 text-left sm:px-6">
        <SheetDescription>Transaction #{entryId}</SheetDescription>
        {d ? (
          <>
            <SheetTitle className="flex flex-wrap items-center gap-2 text-base font-medium">
              <LedgerTypeBadge type={d.transactionType} />
              <LedgerStatus status={d.status} />
            </SheetTitle>
            <p className="pt-1 text-3xl font-semibold tracking-tight">
              <Money value={d.signedAmount} signed tone={d.isInternalTransfer ? "neutral" : "auto"} />
            </p>
            <p className="text-sm text-muted-foreground">
              {d.fundAccountName} · {formatDate(d.transactionDate)}
              {d.isInternalTransfer ? " · internal transfer, not cash in/out" : ""}
            </p>
          </>
        ) : (
          <SheetTitle className="sr-only">Transaction details</SheetTitle>
        )}
      </SheetHeader>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
        {detail.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-9 w-40 bg-muted" />
            <Skeleton className="h-40 w-full bg-muted" />
            <Skeleton className="h-24 w-full bg-muted" />
          </div>
        ) : detail.isError || !d ? (
          <ErrorState title="Couldn't load this transaction" error={detail.error} onRetry={() => void detail.refetch()} />
        ) : (
          <>
            <Section title="Details">
              <dl className="divide-y">
                <DetailRow label="Transaction ID">#{d.id}</DetailRow>
                <DetailRow label="Date">{formatDate(d.transactionDate)}</DetailRow>
                <DetailRow label="Type">{ledgerTypeLabel(d.transactionType)}</DetailRow>
                <DetailRow label="Amount"><Money value={d.amount} tone="neutral" /></DetailRow>
                <DetailRow label="Fund">{d.fundAccountName ?? "—"}</DetailRow>
                {d.counterpartyFundName && <DetailRow label={d.direction === "out" ? "Sent to" : "Received from"}>{d.counterpartyFundName}</DetailRow>}
                <DetailRow label="Client">
                  {d.clientId ? (
                    <Link href={`/clients/${d.clientId}`} onClick={onNavigate} className="inline-flex items-center gap-1 text-primary hover:underline">
                      {d.clientName ?? `Client #${d.clientId}`} <ExternalLink className="h-3 w-3" />
                    </Link>
                  ) : "—"}
                </DetailRow>
                <DetailRow label="Event">
                  {d.events.length > 0 ? (
                    <span className="flex flex-col gap-0.5">
                      {d.events.map((ev) => (
                        <Link key={ev.eventId} href={`/events/${ev.eventId}`} onClick={onNavigate} className="inline-flex items-center gap-1 text-primary hover:underline">
                          {ev.eventName ?? `Event #${ev.eventId}`}
                          {ev.amount != null && <span className="text-muted-foreground">({formatINR(ev.amount, { exact: true })})</span>}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ))}
                    </span>
                  ) : "—"}
                </DetailRow>
                <DetailRow label="Payment method">{d.paymentMethod ?? "—"}</DetailRow>
                <DetailRow label="Reference">{d.reference ?? "—"}</DetailRow>
                <DetailRow label="Notes">{d.notes ?? d.description ?? "—"}</DetailRow>
                <DetailRow label="Created by">{d.createdByName ?? d.createdBy ?? "—"}</DetailRow>
                <DetailRow label="Created at">{formatDateTime(d.createdAt)}</DetailRow>
              </dl>
            </Section>

            {payment && (
              <Section title="Client payment">
                <dl className="divide-y">
                  <DetailRow label="Payment">#{payment.id}{payment.deleted ? " (reversed and removed)" : ""}</DetailRow>
                  {!payment.deleted && (
                    <>
                      <DetailRow label="Allocation">{d.allocationStatus ? ALLOCATION_LABEL[d.allocationStatus] : "—"}</DetailRow>
                      {(payment.allocations ?? []).map((a) => (
                        <DetailRow key={a.eventId} label="To event">
                          <span className="flex justify-between gap-2"><span className="truncate">{a.eventName ?? `Event #${a.eventId}`}</span><Money value={a.amount} tone="neutral" /></span>
                        </DetailRow>
                      ))}
                      {(payment.unallocated ?? 0) > 0 && (
                        <DetailRow label="Client-level"><Money value={payment.unallocated ?? 0} tone="neutral" /></DetailRow>
                      )}
                    </>
                  )}
                </dl>
              </Section>
            )}

            {transfer && (
              <Section title="Fund transfer">
                <dl className="divide-y">
                  <DetailRow label="Transfer">#{transfer.id}</DetailRow>
                  <DetailRow label="From → To">{transfer.fromAccountName ?? "—"} → {transfer.toAccountName ?? "—"}</DetailRow>
                  <DetailRow label="Description">{transfer.description ?? "—"}</DetailRow>
                </dl>
              </Section>
            )}

            {expense && (
              <Section title="Expense">
                <dl className="divide-y">
                  <DetailRow label="Expense">#{expense.id} · {expense.category}</DetailRow>
                  <DetailRow label="Description">{expense.description ?? "—"}</DetailRow>
                  <DetailRow label="Amount + GST"><Money value={(expense.amount ?? 0) + (expense.gst ?? 0)} tone="neutral" /> <span className="text-muted-foreground">({formatINR(expense.amount ?? 0)} + {formatINR(expense.gst ?? 0)} GST)</span></DetailRow>
                  <DetailRow label="Paid by">{expense.paidBy ?? "—"}</DetailRow>
                </dl>
              </Section>
            )}

            {d.related.ledgerEntries.length > 1 && (
              <Section title="Related ledger entries">
                <ol className="divide-y">
                  {d.related.ledgerEntries.map((l) => (
                    <li key={l.id} className={cn("flex items-center justify-between gap-3 py-2.5 text-sm", l.id === d.id && "font-medium")}>
                      <div className="min-w-0">
                        <p className="truncate">{ledgerTypeLabel(l.transactionType)} · {l.fundAccountName}</p>
                        <p className="text-xs text-muted-foreground">#{l.id} · {formatDate(l.transactionDate)} · <LedgerStatus status={l.status} /></p>
                      </div>
                      <Money value={l.signedAmount} signed />
                    </li>
                  ))}
                </ol>
              </Section>
            )}

            <Section title="Audit trail">
              {auditRows.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">No audit entries recorded for this transaction's source.</p>
              ) : (
                <ol className="divide-y">
                  {auditRows.map((a) => (
                    <li key={a.id} className="py-2.5 text-sm">
                      <p className="font-medium capitalize">{a.action} {a.entityType.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">{a.userName ?? a.userEmail ?? a.userId} · {formatDateTime(a.createdAt)}</p>
                      {auditSummary(a).map((line) => <p key={line} className="text-xs text-muted-foreground">{line}</p>)}
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </>
        )}
      </div>
    </>
  );
}
