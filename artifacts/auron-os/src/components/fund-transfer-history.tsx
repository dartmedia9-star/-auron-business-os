import { useState } from "react";
import {
  useListFundTransfers,
  getListFundTransfersQueryKey,
} from "@workspace/api-client-react";
import type { FundTransferHistoryItem } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowRight, History, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/money";

const formatAmount = (value: number) => formatMoney(value);

const fundName = (name: string | null, id: number) =>
  name ?? `Fund account #${id}`;

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/*
 * Persistent fund transfer history, read from the existing fund_transfers
 * records (newest first). Transfers are internal movements between fund
 * accounts and never affect revenue, expenses or profit.
 */
export function FundTransferHistory() {
  const [selected, setSelected] = useState<FundTransferHistoryItem | null>(
    null,
  );

  const {
    data: transfers,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useListFundTransfers({
    query: { queryKey: getListFundTransfersQueryKey() },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <History className="h-5 w-5" />
          Transfer History
        </CardTitle>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            Loading transfer history...
          </p>
        ) : isError ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-destructive">
              Failed to load transfer history
              {error instanceof Error && error.message
                ? `: ${error.message}`
                : "."}
            </p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : !transfers || transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fund transfers recorded yet. Transfers you create will appear
            here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {transfers.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelected(t)}
                  className="flex w-full flex-col gap-2 p-4 text-left transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      <span>{fundName(t.from_account_name, t.from_account_id)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{fundName(t.to_account_name, t.to_account_id)}</span>
                    </div>

                    <p className="truncate text-sm text-muted-foreground">
                      {t.description?.trim() || "No description"}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {formatDate(t.date)}
                      {t.created_by_name ? ` · by ${t.created_by_name}` : ""}
                      {!t.ledger_posted && (
                        <span className="text-destructive">
                          {" · Ledger entries incomplete"}
                        </span>
                      )}
                    </p>
                  </div>

                  <p className="shrink-0 text-lg font-semibold tabular-nums">
                    {formatAmount(t.amount)}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog
        open={!!selected}
        onOpenChange={(value) => {
          if (!value) setSelected(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer Details</DialogTitle>
          </DialogHeader>

          {selected && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">From</dt>
              <dd className="font-medium">
                {fundName(selected.from_account_name, selected.from_account_id)}
              </dd>

              <dt className="text-muted-foreground">To</dt>
              <dd className="font-medium">
                {fundName(selected.to_account_name, selected.to_account_id)}
              </dd>

              <dt className="text-muted-foreground">Amount</dt>
              <dd className="font-semibold">{formatAmount(selected.amount)}</dd>

              <dt className="text-muted-foreground">Date</dt>
              <dd>{formatDate(selected.date)}</dd>

              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap">
                {selected.description?.trim() || "—"}
              </dd>

              <dt className="text-muted-foreground">Recorded by</dt>
              <dd>{selected.created_by_name ?? "—"}</dd>

              <dt className="text-muted-foreground">Recorded at</dt>
              <dd>{formatDateTime(selected.created_at)}</dd>

              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {selected.ledger_posted ? (
                  "Completed: debited and credited in the fund ledger"
                ) : (
                  <span className="text-destructive">
                    Ledger entries incomplete. Check the fund ledger for this
                    transfer.
                  </span>
                )}
              </dd>

              <dt className="text-muted-foreground">Reference</dt>
              <dd>Transfer #{selected.id}</dd>
            </dl>
          )}

          <p className="border-t pt-3 text-xs text-muted-foreground">
            Internal transfer between fund accounts. It does not affect
            revenue, expenses or profit.
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
