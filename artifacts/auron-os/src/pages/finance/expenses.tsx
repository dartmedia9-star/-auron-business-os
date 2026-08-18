import { useListOperatingExpenses, getListOperatingExpensesQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default function ExpensesList() {
  const { data, isLoading } = useListOperatingExpenses(undefined, {
    query: { queryKey: getListOperatingExpensesQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Operating Expenses</h2>
          <p className="text-muted-foreground mt-1">Track SG&A, rent, marketing, and other overheads.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Log Expense
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">Loading expenses...</TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((exp) => (
                  <TableRow key={exp.id}>
                    <TableCell>{exp.date ? new Date(exp.date).toLocaleDateString() : `${exp.month}/${exp.year}`}</TableCell>
                    <TableCell className="font-medium">{exp.category}</TableCell>
                    <TableCell>{exp.description}</TableCell>
                    <TableCell>{exp.referenceNumber || "—"}</TableCell>
                    <TableCell className="text-right font-medium text-orange-500">{formatCurrency(exp.amount)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No expenses recorded.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
