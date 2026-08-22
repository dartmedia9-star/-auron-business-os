import { useState, useMemo, useEffect } from "react";
import {
  useListOperatingExpenses,
  getListOperatingExpensesQueryKey,
  useCreateOperatingExpense,
  useUpdateOperatingExpense,
  useDeleteOperatingExpense,
  useListEvents,
  getListEventsQueryKey,
  getGetEventQueryKey,
  getGetFinanceSummaryQueryKey,
  useListFundAccounts,
  getListFundAccountsQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Search, RotateCcw, ArrowUpDown, Calendar } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ['Rent', 'Salaries', 'Marketing', 'Admin', 'Utilities', 'Insurance', 'Software', 'Equipment', 'Other'];

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export default function ExpensesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListOperatingExpenses(undefined, {
    query: { queryKey: getListOperatingExpensesQueryKey() }
  });
  const { data: eventsData } = useListEvents({ limit: 100 });
  const events = eventsData?.data ?? [];

  // Payer options come straight from the fund accounts API so newly created
  // accounts appear automatically. Shares the list query key with the Fund
  // Transfers page, so account creation/deletion refreshes this selector.
  const { data: fundAccountsData, isLoading: isLoadingFundAccounts } = useListFundAccounts({
    query: { queryKey: getListFundAccountsQueryKey() },
  });
  const fundAccounts = useMemo(() => fundAccountsData ?? [], [fundAccountsData]);

  const createExpense = useCreateOperatingExpense();
  const updateExpense = useUpdateOperatingExpense();
  const deleteExpense = useDeleteOperatingExpense();

  // Search, Filter & Sort State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterYear, setFilterYear] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterEvent, setFilterEvent] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);

  // Form State
  const [category, setCategory] = useState("Admin");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [gst, setGst] = useState("0");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState((new Date().getMonth() + 1).toString());
  const [date, setDate] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [eventId, setEventId] = useState("");
  const [paidBy, setPaidBy] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<string>("GPay / UPI");
  const [otherPaidByName, setOtherPaidByName] = useState("");
  const [otherPaymentMethodName, setOtherPaymentMethodName] = useState("");

  // Default the payer to the first fund account once the list arrives
  // ("Other" only when no accounts exist yet).
  useEffect(() => {
    if (!paidBy && !isLoadingFundAccounts) {
      setPaidBy(fundAccounts[0]?.name ?? "Other");
    }
  }, [fundAccounts, isLoadingFundAccounts, paidBy]);

  const resetForm = () => {
    setCategory("Admin"); setDescription(""); setAmount(""); setGst("0");
    setYear(new Date().getFullYear().toString()); setMonth((new Date().getMonth() + 1).toString());
    setDate(""); setReferenceNumber(""); setEventId("");
    setOtherPaidByName(""); setOtherPaymentMethodName("");
  };

  // "Other - <name>" values are round-tripped into the dedicated name inputs.
  const loadPayerFields = (paidByValue: string | null | undefined, methodValue: string | null | undefined) => {
    if (paidByValue?.startsWith("Other")) {
      setPaidBy("Other");
      setOtherPaidByName(paidByValue.slice("Other".length).replace(/^[\s\-–—]+/, ""));
    } else {
      setPaidBy(paidByValue ?? "");
      setOtherPaidByName("");
    }
    if (methodValue?.startsWith("Other")) {
      setPaymentMethod("Other");
      setOtherPaymentMethodName(methodValue.slice("Other".length).replace(/^[\s\-–—]+/, ""));
    } else {
      setPaymentMethod(methodValue ?? "");
      setOtherPaymentMethodName("");
    }
  };

  const openEdit = (exp: any) => {
    setSelectedExpense(exp);
    setCategory(exp.category);
    setDescription(exp.description);
    setAmount(String(exp.amount));
    setGst(String(exp.gst || 0));
    setYear(String(exp.year));
    setMonth(String(exp.month));
    setDate(exp.date ? exp.date.split('T')[0] : "");
    setReferenceNumber(exp.referenceNumber || "");
    setEventId(exp.eventId ? String(exp.eventId) : "");
    loadPayerFields(exp.paidBy, exp.paymentMethod);
    setEditOpen(true);
  };

  const invalidateExpenseAndEventQueries = (eventIds: Array<number | null | undefined>) => {
    queryClient.invalidateQueries({ queryKey: getListOperatingExpensesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetFinanceSummaryQueryKey() });
    for (const id of new Set(eventIds.filter((id): id is number => typeof id === "number"))) {
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
    }
  };

  const handleCreate = () => {
    if (!category || !description || !amount || !year || !month || !paidBy) {
      toast({ title: "Validation Error", description: "Required fields missing", variant: "destructive" });
      return;
    }
    const linkedEventId = eventId ? Number(eventId) : null;
    const effectivePaidBy = paidBy === "Other" && otherPaidByName.trim() ? `Other - ${otherPaidByName.trim()}` : paidBy;
    const effectivePaymentMethod = paymentMethod === "Other" && otherPaymentMethodName.trim() ? `Other - ${otherPaymentMethodName.trim()}` : paymentMethod;
    createExpense.mutate({
      data: {
        category, description, amount: Number(amount), gst: Number(gst),
        year: Number(year), month: Number(month), date: date || undefined, referenceNumber,
        eventId: linkedEventId,
        paidBy: paidBy ? effectivePaidBy : null,
        paymentMethod: paymentMethod ? effectivePaymentMethod : null,
      }
    }, {
      onSuccess: () => {
        invalidateExpenseAndEventQueries([linkedEventId]);
        toast({ title: "Expense logged" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to log expense", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedExpense) return;
    if (!category || !description || !amount || !year || !month) {
      toast({ title: "Validation Error", description: "Required fields missing", variant: "destructive" });
      return;
    }
    
    const linkedEventId = eventId ? Number(eventId) : null;
    const effectivePaidBy = paidBy === "Other" && otherPaidByName.trim() ? `Other - ${otherPaidByName.trim()}` : paidBy;
    const effectivePaymentMethod = paymentMethod === "Other" && otherPaymentMethodName.trim() ? `Other - ${otherPaymentMethodName.trim()}` : paymentMethod;
    updateExpense.mutate({
      id: selectedExpense.id,
      data: {
        category, description, amount: Number(amount), gst: Number(gst),
        year: Number(year), month: Number(month), date: date || undefined, referenceNumber,
        eventId: linkedEventId,
        paidBy: paidBy ? effectivePaidBy : null,
        paymentMethod: paymentMethod ? effectivePaymentMethod : null,
      }
    }, {
      onSuccess: () => {
        invalidateExpenseAndEventQueries([selectedExpense.eventId, linkedEventId]);
        toast({ title: "Expense updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update expense", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!selectedExpense) return;
    deleteExpense.mutate({ id: selectedExpense.id }, {
      onSuccess: () => {
        invalidateExpenseAndEventQueries([selectedExpense.eventId]);
        toast({ title: "Expense deleted" });
        setDeleteOpen(false);
      },
      onError: (err) => toast({ title: "Failed to delete expense", description: err.message, variant: "destructive" })
    });
  };

  const FormContent = (
    <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description *</Label>
        <Input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Amount *</Label>
          <Input type="number" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>GST Amount</Label>
          <Input type="number" inputMode="decimal" value={gst} onChange={e => setGst(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Year *</Label>
          <Input type="number" value={year} onChange={e => setYear(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Month (1-12) *</Label>
          <Input type="number" min="1" max="12" value={month} onChange={e => setMonth(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Reference Number</Label>
          <Input value={referenceNumber} onChange={e => setReferenceNumber(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Event <span className="text-muted-foreground">(optional)</span></Label>
        <Select value={eventId || "no-event"} onValueChange={(value) => setEventId(value === "no-event" ? "" : value)}>
          <SelectTrigger><SelectValue placeholder="No event — operating expense" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="no-event">No event — operating expense</SelectItem>
            {events.map((event) => (
              <SelectItem key={event.id} value={String(event.id)}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Paid By *</Label>
        <Select value={paidBy} onValueChange={setPaidBy}>
          <SelectTrigger disabled={isLoadingFundAccounts}><SelectValue placeholder={isLoadingFundAccounts ? "Loading accounts..." : "Select paid by"} /></SelectTrigger>
          <SelectContent>
            {fundAccounts.map((account) => (
              <SelectItem key={account.id} value={account.name}>
                {account.name}
              </SelectItem>
            ))}
            {/* Keeps an expense paid by a since-deleted/renamed account editable. */}
            {paidBy && paidBy !== "Other" && !fundAccounts.some((account) => account.name === paidBy) && (
              <SelectItem value={paidBy}>{paidBy}</SelectItem>
            )}
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {paidBy === "Other" && (
          <div className="mt-2">
            <Label>Paid By Name</Label>
            <Input value={otherPaidByName} onChange={e => setOtherPaidByName(e.target.value)} placeholder="e.g. John Doe" />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <Label>Payment Method *</Label>
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger><SelectValue placeholder="Select payment method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GPay / UPI">GPay / UPI</SelectItem>
            <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
            <SelectItem value="Cheque">Cheque</SelectItem>
            <SelectItem value="Cash">Cash</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {paymentMethod === "Other" && (
          <div className="mt-2">
            <Label>Payment Method Name</Label>
            <Input value={otherPaymentMethodName} onChange={e => setOtherPaymentMethodName(e.target.value)} placeholder="e.g. Cash" />
          </div>
        )}
      </div>
    </div>
  );

  const eventMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of events) {
      if (e.id) map.set(e.id, e.name);
    }
    return map;
  }, [events]);

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    yearSet.add(new Date().getFullYear());
    if (data) {
      for (const exp of data) {
        if (exp.year) yearSet.add(exp.year);
      }
    }
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [data]);

  const isFiltered = searchQuery !== "" || filterYear !== "all" || filterMonth !== "all" || filterCategory !== "all" || filterEvent !== "all" || sortBy !== "newest";

  const resetFilters = () => {
    setSearchQuery("");
    setFilterYear("all");
    setFilterMonth("all");
    setFilterCategory("all");
    setFilterEvent("all");
    setSortBy("newest");
  };

  const filteredExpenses = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();

    const result = data.filter((exp) => {
      if (q) {
        const descMatch = exp.description?.toLowerCase().includes(q);
        const catMatch = exp.category?.toLowerCase().includes(q);
        const refMatch = exp.referenceNumber?.toLowerCase().includes(q);
        const eventName = exp.eventId ? eventMap.get(exp.eventId) : undefined;
        const eventMatch = eventName?.toLowerCase().includes(q);
        if (!descMatch && !catMatch && !refMatch && !eventMatch) return false;
      }

      if (filterYear !== "all" && String(exp.year) !== filterYear) {
        return false;
      }

      if (filterMonth !== "all" && String(exp.month) !== filterMonth) {
        return false;
      }

      if (filterCategory !== "all" && exp.category !== filterCategory) {
        return false;
      }

      if (filterEvent === "operating" && exp.eventId != null) {
        return false;
      }
      if (filterEvent !== "all" && filterEvent !== "operating" && String(exp.eventId) !== filterEvent) {
        return false;
      }

      return true;
    });

    return result.sort((a, b) => {
      switch (sortBy) {
        case "oldest": {
          const dateA = a.date ? new Date(a.date).getTime() : new Date(a.year, a.month - 1).getTime();
          const dateB = b.date ? new Date(b.date).getTime() : new Date(b.year, b.month - 1).getTime();
          return dateA - dateB;
        }
        case "amount_desc":
          return Number(b.amount || 0) - Number(a.amount || 0);
        case "amount_asc":
          return Number(a.amount || 0) - Number(b.amount || 0);
        case "newest":
        default: {
          const dateA = a.date ? new Date(a.date).getTime() : new Date(a.year, a.month - 1).getTime();
          const dateB = b.date ? new Date(b.date).getTime() : new Date(b.year, b.month - 1).getTime();
          return dateB - dateA;
        }
      }
    });
  }, [data, searchQuery, filterYear, filterMonth, filterCategory, filterEvent, sortBy, eventMap]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operating Expenses</h2>
          <p className="text-muted-foreground mt-1">Track SG&A, rent, marketing, and other overheads.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Log Expense
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search expenses, categories, refs, events..." 
                className="pl-9 bg-background" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters & Sorting */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Year Filter */}
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-[110px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {availableYears.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Month Filter */}
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[120px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Category Filter */}
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[125px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Event Filter */}
              <Select value={filterEvent} onValueChange={setFilterEvent}>
                <SelectTrigger className="w-[135px] bg-background h-9 text-xs truncate">
                  <SelectValue placeholder="Event link" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Expenses</SelectItem>
                  <SelectItem value="operating">Operating Only</SelectItem>
                  {events.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[145px] bg-background h-9 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="amount_desc">Amount: High → Low</SelectItem>
                  <SelectItem value="amount_asc">Amount: Low → High</SelectItem>
                </SelectContent>
              </Select>

              {/* Reset Filter Action */}
              {isFiltered && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Reset all filters"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">Loading expenses...</TableCell>
                  </TableRow>
                ) : filteredExpenses.length > 0 ? (
                  filteredExpenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.date ? new Date(exp.date).toLocaleDateString() : `${exp.month}/${exp.year}`}</TableCell>
                      <TableCell className="font-medium">{exp.category}</TableCell>
                      <TableCell>
                        <div>{exp.description}</div>
                        {exp.eventId && (
                          <div className="text-xs text-primary/80 flex items-center gap-1 mt-0.5">
                            <span>Event:</span>
                            <span className="font-medium">{eventMap.get(exp.eventId) || `Event #${exp.eventId}`}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{exp.referenceNumber || "—"}</TableCell>
                      <TableCell className="text-right font-medium text-orange-500">{formatCurrency(exp.amount)}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(exp)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedExpense(exp); setDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      {isFiltered ? "No expenses match your filters." : "No expenses recorded."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Log Expense</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createExpense.isPending}>
              {createExpense.isPending ? "Saving..." : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Expense</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateExpense.isPending}>
              {updateExpense.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this expense? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteExpense.isPending ? "Deleting..." : "Delete Expense"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
