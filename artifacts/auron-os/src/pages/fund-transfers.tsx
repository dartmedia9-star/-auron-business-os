import { useEffect, useState } from "react";
import {
  useListFundAccounts,
  getListFundAccountsQueryKey,
  useCreateFundTransfer,
  getGetFinanceSummaryQueryKey,
  getListFundTransactionsQueryKey,
} from "@workspace/api-client-react";
import type { FundAccount } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, Pencil, RefreshCw } from "lucide-react";
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

type AccountBalance = {
  id: number;
  name: string;
  opening_balance: number;
  current_balance: number;
};

export default function FundTransfers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);

  const [balanceAccount, setBalanceAccount] = useState<FundAccount | null>(
    null,
  );
  const [openingBalance, setOpeningBalance] = useState("");
  const [savingBalance, setSavingBalance] = useState(false);

  const { data: accounts, isLoading } = useListFundAccounts({
    query: {
      queryKey: getListFundAccountsQueryKey(),
    },
  });

  const accountList: FundAccount[] = accounts ?? [];

  const createTransfer = useCreateFundTransfer();

  /*
   * Load the current calculated balance for every fund account.
   *
   * The list endpoint gives us the accounts and opening balances.
   * The individual account endpoint gives us the calculated current balance
   * after transfers and expenses.
   */
  const loadBalances = async () => {
    if (accountList.length === 0) {
      setAccountBalances([]);
      return;
    }

    setLoadingBalances(true);

    try {
      const results = await Promise.all(
        accountList.map(async (account) => {
          const response = await fetch(`/api/fund-accounts/${account.id}`, {
            credentials: "include",
          });

          if (!response.ok) {
            throw new Error(`Failed to load ${account.name}`);
          }

          const data = await response.json();

          return {
            id: account.id,
            name: account.name,
            opening_balance: Number(data.opening_balance ?? 0),
            current_balance: Number(
              data.current_balance ??
                data.balance ??
                data.currentBalance ??
                data.opening_balance ??
                0,
            ),
          };
        }),
      );

      setAccountBalances(results);
    } catch (err) {
      toast({
        title: "Failed to load balances",
        description: errorMessage(err),
        variant: "destructive",
      });
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    void loadBalances();
  }, [accountList.length]);

  /*
   * Default the transfer form to the first two accounts.
   * The user can still change either account using the dropdown.
   */
  useEffect(() => {
    if (accountList.length >= 2) {
      setFromId((current) => current || String(accountList[0].id));
      setToId((current) => current || String(accountList[1].id));
    }
  }, [accountList]);

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setDate("");
  };

  const handleCreate = () => {
    if (!fromId || !toId || !amount || !date) {
      toast({
        title: "Validation Error",
        description: "From, to, amount, and date are required",
        variant: "destructive",
      });
      return;
    }

    if (fromId === toId) {
      toast({
        title: "Validation Error",
        description: "From and to accounts must be different",
        variant: "destructive",
      });
      return;
    }

    const amountNum = Number(amount);

    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({
        title: "Validation Error",
        description: "Amount must be greater than zero",
        variant: "destructive",
      });
      return;
    }

    const fromAccount = accountList.find(
      (account) => String(account.id) === fromId,
    );

    const fromBalance = accountBalances.find(
      (account) => String(account.id) === fromId,
    );

    if (
      fromBalance &&
      Number.isFinite(fromBalance.current_balance) &&
      amountNum > fromBalance.current_balance
    ) {
      toast({
        title: "Insufficient funds",
        description: `${fromAccount?.name ?? "The selected account"} has only ₹${fromBalance.current_balance.toLocaleString(
          "en-IN",
          {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          },
        )} available.`,
        variant: "destructive",
      });
      return;
    }

    createTransfer.mutate(
      {
        data: {
          from_account_id: Number(fromId),
          to_account_id: Number(toId),
          amount: amountNum,
          date,
          description: description.trim(),
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

          await queryClient.invalidateQueries({
            queryKey: getListFundTransactionsQueryKey(Number(fromId)),
          });

          await queryClient.invalidateQueries({
            queryKey: getListFundTransactionsQueryKey(Number(toId)),
          });

          await loadBalances();

          toast({
            title: "Transfer created",
            description: "The fund balances have been updated.",
          });

          setOpen(false);
          resetForm();
        },

        onError: (err) => {
          toast({
            title: "Failed to create transfer",
            description: errorMessage(err),
            variant: "destructive",
          });
        },
      },
    );
  };

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

      await loadBalances();

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

  const accountName = (id: string) =>
    accountList.find((account) => String(account.id) === id)?.name;

  const formatCurrency = (value: number) =>
    `₹${value.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Transfer Funds
          </h2>

          <p className="mt-1 text-muted-foreground">
            Move money between fund accounts. Transfers do not affect P&L.
          </p>
        </div>

        <Button
          onClick={() => {
            if (accountList.length >= 2) {
              if (!fromId) setFromId(String(accountList[0].id));
              if (!toId) setToId(String(accountList[1].id));
            }

            setOpen(true);
          }}
          disabled={accountList.length < 2}
        >
          <Plus className="mr-2 h-4 w-4" />
          New Transfer
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {accountList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading fund accounts..."
                : "No fund accounts found yet. Transfers become available once fund accounts exist."}
            </p>
          ) : (
            <div className="space-y-3">
              {accountList.map((acct) => {
                const balance = accountBalances.find(
                  (item) => item.id === acct.id,
                );

                return (
                  <div
                    key={acct.id}
                    className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{acct.name}</p>

                      <p className="text-xs text-muted-foreground">
                        Opening balance:{" "}
                        {formatCurrency(
                          Number(acct.opening_balance ?? 0),
                        )}
                      </p>

                      <p className="mt-1 text-lg font-semibold">
                        {loadingBalances
                          ? "Loading..."
                          : formatCurrency(
                              balance?.current_balance ??
                                Number(acct.opening_balance ?? 0),
                            )}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Current available balance
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBalanceAccount(acct);
                        setOpeningBalance(
                          String(acct.opening_balance ?? 0),
                        );
                      }}
                    >
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit Balance
                    </Button>
                  </div>
                );
              })}

              <div className="flex justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadBalances()}
                  disabled={loadingBalances}
                >
                  <RefreshCw
                    className={`mr-2 h-4 w-4 ${
                      loadingBalances ? "animate-spin" : ""
                    }`}
                  />
                  Refresh Balances
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Transfer</DialogTitle>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div className="space-y-2">
                  <Label>From *</Label>

                  <select
                    value={fromId}
                    onChange={(e) => setFromId(e.target.value)}
                    disabled={isLoading || accountList.length === 0}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {isLoading
                        ? "Loading accounts..."
                        : "Select account"}
                    </option>

                    {accountList.map((acct) => (
                      <option key={acct.id} value={String(acct.id)}>
                        {acct.name}
                      </option>
                    ))}
                  </select>
                </div>

                <ArrowRight className="mb-2 h-4 w-4 text-muted-foreground" />

                <div className="space-y-2">
                  <Label>To *</Label>

                  <select
                    value={toId}
                    onChange={(e) => setToId(e.target.value)}
                    disabled={isLoading || accountList.length === 0}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">
                      {isLoading
                        ? "Loading accounts..."
                        : "Select account"}
                    </option>

                    {accountList.map((acct) => (
                      <option key={acct.id} value={String(acct.id)}>
                        {acct.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>

                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Date *</Label>

                  <Input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>

                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Funds for event expenses"
                />
              </div>

              {fromId &&
                toId &&
                fromId === toId && (
                  <p className="text-sm text-destructive">
                    From and to accounts must be different.
                  </p>
                )}

              {fromId &&
                toId &&
                fromId !== toId && (
                  <div className="rounded-md bg-muted px-3 py-2 text-sm">
                    <span className="font-medium">
                      {accountName(fromId)}
                    </span>

                    <span className="mx-2 text-muted-foreground">
                      →
                    </span>

                    <span className="font-medium">
                      {accountName(toId)}
                    </span>
                  </div>
                )}
            </div>

            <DialogFooter className="mt-6 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  createTransfer.isPending ||
                  !fromId ||
                  !toId ||
                  fromId === toId
                }
              >
                {createTransfer.isPending
                  ? "Transferring..."
                  : "Create Transfer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}