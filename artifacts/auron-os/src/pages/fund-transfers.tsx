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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong";
}

export default function FundTransfers() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [open, setOpen] = useState(false);

  const { data: accounts, isLoading } = useListFundAccounts({
    query: { queryKey: getListFundAccountsQueryKey() }
  });
  const accountList: FundAccount[] = accounts ?? [];

  // Default the form to the first two accounts once they load.
  useEffect(() => {
    if (accountList.length >= 2 && !fromId && !toId) {
      setFromId(String(accountList[0].id));
      setToId(String(accountList[1].id));
    }
  }, [accountList, fromId, toId]);

  const createTransfer = useCreateFundTransfer();

  const resetForm = () => {
    setAmount("");
    setDate("");
    setDescription("");
  };

  const handleCreate = () => {
    if (!fromId || !toId || !amount || !date) {
      toast({ title: "Validation Error", description: "From, to, amount, and date are required", variant: "destructive" });
      return;
    }
    if (fromId === toId) {
      toast({ title: "Validation Error", description: "From and to accounts must be different", variant: "destructive" });
      return;
    }
    const amountNum = Number(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast({ title: "Validation Error", description: "Amount must be greater than zero", variant: "destructive" });
      return;
    }

    createTransfer.mutate({
      data: {
        from_account_id: Number(fromId),
        to_account_id: Number(toId),
        amount: amountNum,
        date,
        description: description.trim(),
      },
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFundAccountsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetFinanceSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListFundTransactionsQueryKey(Number(fromId)) });
        queryClient.invalidateQueries({ queryKey: getListFundTransactionsQueryKey(Number(toId)) });
        toast({ title: "Transfer created" });
        setOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to create transfer", description: errorMessage(err), variant: "destructive" }),
    });
  };

  const accountName = (id: string) => accountList.find((a) => String(a.id) === id)?.name;

  const AccountSelect = ({
    value,
    onChange,
    label,
  }: {
    value: string;
    onChange: (v: string) => void;
    label: string;
  }) => (
    <div className="space-y-2">
      <Label>{label} *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={isLoading ? "Loading accounts..." : "Select account"} /></SelectTrigger>
        <SelectContent>
          {accountList.map((acct) => (
            <SelectItem key={acct.id} value={String(acct.id)}>{acct.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Transfer Funds</h2>
          <p className="text-muted-foreground mt-1">Move money between fund accounts. Transfers do not affect P&L.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> New Transfer
        </Button>
      </div>

      <Card>
        <CardContent className="p-6">
          {accountList.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No fund accounts found yet. Transfers become available once fund accounts exist.
            </p>
          ) : (
            <ul className="space-y-3">
              {accountList.map((acct) => (
                <li key={acct.id} className="flex items-center justify-between gap-4">
                  <span className="font-medium">{acct.name}</span>
                  <span className="text-xs text-muted-foreground">Opening balance: ₹{Number(acct.opening_balance).toLocaleString("en-IN")}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
            <div className="space-y-4">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <AccountSelect label="From" value={fromId} onChange={setFromId} />
                <ArrowRight className="h-4 w-4 mb-2 text-muted-foreground" />
                <AccountSelect label="To" value={toId} onChange={setToId} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Funds for event expenses" />
              </div>

              {fromId && toId && fromId === toId && (
                <p className="text-sm text-destructive">From and to accounts must be different.</p>
              )}
              {fromId && toId && fromId !== toId && (
                <p className="text-sm text-muted-foreground">
                  {accountName(fromId)} → {accountName(toId)}
                </p>
              )}
            </div>
          </form>
          <DialogFooter className="pt-4 border-t">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createTransfer.isPending}>
              {createTransfer.isPending ? "Transferring..." : "Create Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
