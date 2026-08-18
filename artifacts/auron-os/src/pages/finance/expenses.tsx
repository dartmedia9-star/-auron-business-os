import { useState } from "react";
import { 
  useListOperatingExpenses, 
  getListOperatingExpensesQueryKey,
  useCreateOperatingExpense,
  useUpdateOperatingExpense,
  useDeleteOperatingExpense
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ['Rent', 'Salaries', 'Marketing', 'Admin', 'Utilities', 'Insurance', 'Software', 'Equipment', 'Other'];

export default function ExpensesList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListOperatingExpenses(undefined, {
    query: { queryKey: getListOperatingExpensesQueryKey() }
  });

  const createExpense = useCreateOperatingExpense();
  const updateExpense = useUpdateOperatingExpense();
  const deleteExpense = useDeleteOperatingExpense();

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

  const resetForm = () => {
    setCategory("Admin"); setDescription(""); setAmount(""); setGst("0");
    setYear(new Date().getFullYear().toString()); setMonth((new Date().getMonth() + 1).toString());
    setDate(""); setReferenceNumber("");
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
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!category || !description || !amount || !year || !month) {
      toast({ title: "Validation Error", description: "Required fields missing", variant: "destructive" });
      return;
    }
    createExpense.mutate({
      data: {
        category, description, amount: Number(amount), gst: Number(gst),
        year: Number(year), month: Number(month), date: date || undefined, referenceNumber
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOperatingExpensesQueryKey() });
        toast({ title: "Expense logged" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to log expense", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedExpense) return;
    if (!category || !description || !amount || !year || !month) return;
    
    updateExpense.mutate({
      id: selectedExpense.id,
      data: {
        category, description, amount: Number(amount), gst: Number(gst),
        year: Number(year), month: Number(month), date: date || undefined, referenceNumber
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOperatingExpensesQueryKey() });
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
        queryClient.invalidateQueries({ queryKey: getListOperatingExpensesQueryKey() });
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
    </div>
  );

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
                ) : data && data.length > 0 ? (
                  data.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell>{exp.date ? new Date(exp.date).toLocaleDateString() : `${exp.month}/${exp.year}`}</TableCell>
                      <TableCell className="font-medium">{exp.category}</TableCell>
                      <TableCell>{exp.description}</TableCell>
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
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No expenses recorded.</TableCell>
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
