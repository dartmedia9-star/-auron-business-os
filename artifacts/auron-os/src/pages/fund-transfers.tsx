import { useState } from "react";
import {
  useListFundAccounts,
  getListFundAccountsQueryKey,
  useCreateFundAccount,
  useDeleteFundAccount,
  useGetFinanceSummary,
  getGetFinanceSummaryQueryKey,
} from "@workspace/api-client-react";
import { FundTransferHistory } from "@/components/fund-transfer-history";
import type { FundAccount } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ArrowLeftRight, Landmark, MoreHorizontal, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/ds/page-header";
import { AnimatedNumber } from "@/components/ds/animated-number";
import { formatINR } from "@/components/ds/money";
import { CardsSkeleton, EmptyState } from "@/components/ds/states";
import { FundLedger } from "@/components/fund-ledger";
import { useNewTransaction } from "@/components/new-transaction";
import { invalidateFinance } from "@/lib/finance-queries";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

export default function FundTransfers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const newTransaction = useNewTransaction();

  const [balanceAccount, setBalanceAccount] = useState<FundAccount | null>(
    null,
  );
  const [openingBalance, setOpeningBalance] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountOpeningBalance, setNewAccountOpeningBalance] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<FundAccount | null>(null);

  const { data: accounts, isLoading } = useListFundAccounts({
    query: {
      queryKey: getListFundAccountsQueryKey(),
    },
  });

  const accountList: FundAccount[] = accounts ?? [];

  // Current balances come from the same calculation as Finance Summary
  // (opening balance + fund ledger), refreshed whenever money moves.
  const summary = useGetFinanceSummary(undefined, { query: { queryKey: getGetFinanceSummaryQueryKey() } });
  const balanceOf = (id: number) => summary.data?.fundAccounts?.find((a) => a.id === id)?.balance;
  const totalBalance = (summary.data?.fundAccounts ?? []).reduce((sum, a) => sum + a.balance, 0);
  const createAccount = useCreateFundAccount();
  const deleteAccount = useDeleteFundAccount();

  const handleSaveOpeningBalance = async () => {
    if (!balanceAccount) return;

    const amount = Number(openingBalance);

    if (!Number.isFinite(amount) || amount < 0) {
      toast({
        title: "Validation Error",
        description: "Enter a valid non-negative opening balance",
        variant: "destructive",
      });
      return;
    }

    setSavingBalance(true);

    try {
      const response = await fetch(
        `/api/fund-accounts/${balanceAccount.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            opening_balance: amount,
          }),
        },
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);

        throw new Error(
          body?.error || "Failed to update opening balance",
        );
      }

      await queryClient.invalidateQueries({
        queryKey: getListFundAccountsQueryKey(),
      });

      await queryClient.invalidateQueries({
        queryKey: getGetFinanceSummaryQueryKey(),
      });

      await invalidateFinance(queryClient);

      toast({
        title: "Balance updated",
        description: `${balanceAccount.name} opening balance has been updated.`,
      });

      setBalanceAccount(null);
      setOpeningBalance("");
    } catch (err) {
      toast({
        title: "Failed to update balance",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setSavingBalance(false);
    }
  };

  const handleCreateAccount = () => {
    const trimmedName = newAccountName.trim();

    if (!trimmedName) {
      toast({
        title: "Validation Error",
        description: "Account name is required",
        variant: "destructive",
      });
      return;
    }

    const duplicate = accountList.some(
      (account) =>
        account.name.trim().toLowerCase() === trimmedName.toLowerCase(),
    );

    if (duplicate) {
      toast({
        title: "Validation Error",
        description: `A fund account named "${trimmedName}" already exists`,
        variant: "destructive",
      });
      return;
    }

    if (!newAccountOpeningBalance || !Number.isFinite(Number(newAccountOpeningBalance)) || Number(newAccountOpeningBalance) < 0) {
      toast({
        title: "Validation Error",
        description: "Enter a valid non-negative opening balance",
        variant: "destructive",
      });
      return;
    }

    createAccount.mutate(
      {
        data: {
          name: trimmedName,
          opening_balance: Number(newAccountOpeningBalance),
        },
      },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getListFundAccountsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetFinanceSummaryQueryKey(),
          });

          toast({
            title: "Fund account created",
            description: `${trimmedName} was created with an opening balance of ${formatCurrency(
              Number(newAccountOpeningBalance),
            )}. Opening balances establish starting funds and do not affect P&L.`,
          });

          setCreateOpen(false);
          setNewAccountName("");
          setNewAccountOpeningBalance("");
        },

        onError: (err) => {
          toast({
            title: "Failed to create fund account",
            description: errorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  /*
   * Deletion is a protected financial operation. The backend refuses to
   * delete any account that has financial history (409) — this handler only
   * runs after the user explicitly confirms in the AlertDialog.
   */
  const handleConfirmDelete = () => {
    const target = deleteTarget;
    if (!target || deleteAccount.isPending) return;

    deleteAccount.mutate(
      { id: target.id },
      {
        onSuccess: async () => {
          await queryClient.invalidateQueries({
            queryKey: getListFundAccountsQueryKey(),
          });

          await queryClient.invalidateQueries({
            queryKey: getGetFinanceSummaryQueryKey(),
          });

          await invalidateFinance(queryClient);

          toast({
            title: "Fund account deleted",
            description: `Fund account deleted: ${target.name}. It has been removed from transfers, expenses, and finance summary.`,
          });

          setDeleteTarget(null);
        },

        onError: (err) => {
          toast({
            title: "Failed to delete fund account",
            description: errorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="space-y-6">
      <PageHeader
        sticky
        eyebrow="Finance"
        title="Funds"
        description="Fund balances and every cash movement: money received, expenses and internal transfers."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setNewAccountName("");
                setNewAccountOpeningBalance("");
                setCreateOpen(true);
              }}
            >
              <Landmark className="mr-2 h-4 w-4" />
              Add Fund Account
            </Button>
            <Button variant="outline" onClick={() => newTransaction.open({ kind: "fund_transfer" })} disabled={accountList.length < 2}>
              <ArrowLeftRight className="mr-2 h-4 w-4" />
              Transfer
            </Button>
            <Button onClick={() => newTransaction.open()}>
              <Plus className="mr-2 h-4 w-4" />
              New Transaction
            </Button>
          </>
        }
      />

      {isLoading ? (
        <CardsSkeleton count={3} className="lg:grid-cols-3" />
      ) : accountList.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No fund accounts yet"
          description='Use "Add Fund Account" to create one with its opening balance. Transfers become available once two or more fund accounts exist.'
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/10 via-card to-card p-5 shadow-card">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total available</p>
            <AnimatedNumber value={totalBalance} format={(n) => formatINR(n)} className="mt-2 block text-2xl font-semibold tabular-nums tracking-tight" />
            <p className="mt-1 text-xs text-muted-foreground">Across {accountList.length} fund account{accountList.length === 1 ? "" : "s"}</p>
          </div>
          {accountList.map((acct) => {
            const balance = balanceOf(acct.id);
            return (
              <div key={acct.id} className="group rounded-xl border bg-card p-5 shadow-card transition-shadow duration-200 hover:shadow-lift">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-medium">{acct.name}</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8 text-muted-foreground" aria-label={`${acct.name} actions`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setBalanceAccount(acct);
                          setOpeningBalance(String(acct.opening_balance ?? 0));
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4" /> Edit opening balance
                      </DropdownMenuItem>
                      <DropdownMenuItem disabled={deleteAccount.isPending} onClick={() => setDeleteTarget(acct)} className="text-destructive focus:text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" /> Delete account
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {summary.isLoading ? (
                  <div className="mt-2 h-8 w-32 animate-pulse rounded bg-muted" />
                ) : balance === undefined ? (
                  <p className="mt-2 text-sm text-destructive">Balance unavailable</p>
                ) : (
                  <AnimatedNumber value={balance} format={(n) => formatINR(n, { exact: true })} className={`mt-2 block text-2xl font-semibold tabular-nums tracking-tight ${balance < 0 ? "text-money-out" : ""}`} />
                )}
                <p className="mt-1 text-xs text-muted-foreground">Opening {formatCurrency(Number(acct.opening_balance ?? 0))}</p>
              </div>
            );
          })}
        </div>
      )}
      {summary.isError && (
        <p className="text-sm text-destructive">Couldn't load current balances: {errorMessage(summary.error)}</p>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All transactions</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="all" className="mt-4">
          <FundLedger />
        </TabsContent>
        <TabsContent value="transfers" className="mt-4">
          <FundTransferHistory />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!balanceAccount}
        onOpenChange={(value) => {
          if (!value) {
            setBalanceAccount(null);
            setOpeningBalance("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set Opening Balance</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Fund Account</Label>

              <p className="mt-1 font-medium">
                {balanceAccount?.name}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Opening Balance *</Label>

              <Input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                placeholder="0.00"
              />

              <p className="text-xs text-muted-foreground">
                Enter the amount that should be treated as the
                starting balance for this fund account.
              </p>
            </div>
          </div>

          <DialogFooter className="border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setBalanceAccount(null);
                setOpeningBalance("");
              }}
            >
              Cancel
            </Button>

            <Button
              onClick={handleSaveOpeningBalance}
              disabled={savingBalance}
            >
              {savingBalance ? "Saving..." : "Save Balance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(value) => {
          if (!value) {
            setCreateOpen(false);
            setNewAccountName("");
            setNewAccountOpeningBalance("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Fund Account</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateAccount();
            }}
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Account Name *</Label>

                <Input
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                  placeholder="e.g. Auron Event Productions"
                  maxLength={120}
                />

                {newAccountName.trim() &&
                  accountList.some(
                    (account) =>
                      account.name.trim().toLowerCase() ===
                      newAccountName.trim().toLowerCase(),
                  ) && (
                    <p className="text-sm text-destructive">
                      A fund account with this name already exists.
                    </p>
                  )}
              </div>

              <div className="space-y-2">
                <Label>Opening Balance *</Label>

                <Input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={newAccountOpeningBalance}
                  onChange={(e) =>
                    setNewAccountOpeningBalance(e.target.value)
                  }
                  placeholder="0.00"
                />

                <p className="text-xs text-muted-foreground">
                  Enter the company's starting/current funds for this
                  account. Opening balances are not revenue and do not
                  affect P&amp;L.
                </p>
              </div>
            </div>

            <DialogFooter className="mt-6 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setCreateOpen(false);
                  setNewAccountName("");
                  setNewAccountOpeningBalance("");
                }}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={createAccount.isPending}>
                {createAccount.isPending ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(value) => {
          if (!value && !deleteAccount.isPending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          {deleteTarget?.has_financial_history ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Cannot delete {deleteTarget.name}
                </AlertDialogTitle>

                <AlertDialogDescription>
                  This fund account has financial transactions (expenses or
                  transfers). Accounts with financial history cannot be deleted,
                  so your records stay accurate and reconcilable.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogAction>Close</AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {deleteTarget?.name}?
                </AlertDialogTitle>

                <AlertDialogDescription>
                  This action cannot be undone. Only unused fund accounts can be
                  permanently deleted; accounts with any financial history are
                  protected by the backend and cannot be removed.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteAccount.isPending}>
                  Cancel
                </AlertDialogCancel>

                <AlertDialogAction
                  disabled={deleteAccount.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(e) => {
                    e.preventDefault();
                    handleConfirmDelete();
                  }}
                >
                  {deleteAccount.isPending
                    ? "Deleting..."
                    : "Delete Account"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
