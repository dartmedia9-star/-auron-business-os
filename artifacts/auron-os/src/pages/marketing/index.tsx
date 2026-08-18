import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMarketingRoi,
  useListMarketingSpend,
  useDeleteMarketingSpend,
  getGetMarketingRoiQueryKey,
  getListMarketingSpendQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Trash2 } from "lucide-react";

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function MarketingList() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const queryClient = useQueryClient();

  const roiParams = { year: selectedYear };
  const spendParams = { year: selectedYear };

  const { data, isLoading } = useGetMarketingRoi(
    roiParams,
    { query: { queryKey: getGetMarketingRoiQueryKey(roiParams) } }
  );

  const { data: spendRecords } = useListMarketingSpend(
    spendParams,
    { query: { queryKey: getListMarketingSpendQueryKey(spendParams) } }
  );

  const { mutate: deleteSpend, isPending: isDeleting } = useDeleteMarketingSpend({
    mutation: {
      onSuccess: () => {
        // Invalidate both summary and spend list so ROI recalculates immediately
        queryClient.invalidateQueries({ queryKey: getGetMarketingRoiQueryKey(roiParams) });
        queryClient.invalidateQueries({ queryKey: getListMarketingSpendQueryKey(spendParams) });
        setDeleteId(null);
      },
    },
  });

  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  // Show "N/A" when there is no spend data (nothing to calculate ROI from)
  const hasData = data && data.totalSpend > 0;
  const roiDisplay = hasData ? formatPercentage(data.overallRoi) : "N/A";
  const cacDisplay = hasData && data.overallCac != null ? formatCurrency(data.overallCac) : "—";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Marketing ROI</h2>
          <p className="text-muted-foreground mt-1">
            Track customer acquisition cost and channel performance.
          </p>
        </div>
        {/* Year selector */}
        <div className="flex gap-1">
          {yearOptions.map((y) => (
            <Button
              key={y}
              variant={selectedYear === y ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-muted-foreground">Loading marketing data…</div>
      ) : data ? (
        <>
          {/* Summary cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {hasData ? formatCurrency(data.totalSpend) : "₹0"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">
                  {hasData ? formatCurrency(data.totalRevenue) : "₹0"}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Blended CAC</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{cacDisplay}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Overall ROI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${hasData ? "text-emerald-500" : "text-muted-foreground"}`}>
                  {roiDisplay}
                </div>
                {!hasData && (
                  <p className="text-xs text-muted-foreground mt-1">No spend data for {selectedYear}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Channel performance */}
          <Card>
            <CardHeader>
              <CardTitle>Channel Performance — {selectedYear}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">CAC</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">ROI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.channels.length > 0 ? (
                    data.channels.map((channel) => (
                      <TableRow key={channel.channelId}>
                        <TableCell className="font-medium">{channel.channelName}</TableCell>
                        <TableCell className="text-right">{formatCurrency(channel.spend)}</TableCell>
                        <TableCell className="text-right">{channel.leadsGenerated}</TableCell>
                        <TableCell className="text-right">{channel.customersAcquired}</TableCell>
                        <TableCell className="text-right font-medium text-amber-500">
                          {channel.cac ? formatCurrency(channel.cac) : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-primary">
                          {formatCurrency(channel.revenue)}
                        </TableCell>
                        <TableCell className="text-right font-medium text-emerald-500">
                          {formatPercentage(channel.roi)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        No channel spend data for {selectedYear}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Individual spend records — allows deletion of demo/incorrect entries */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Spend Records — {selectedYear}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage individual monthly spend entries. Delete incorrect or demo records here.
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead className="text-right">Spend</TableHead>
                    <TableHead className="text-right">Leads</TableHead>
                    <TableHead className="text-right">Customers</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spendRecords && spendRecords.length > 0 ? (
                    spendRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>{MONTH_NAMES[record.month]} {record.year}</TableCell>
                        <TableCell className="font-medium">{record.channelName ?? `Channel ${record.channelId}`}</TableCell>
                        <TableCell className="text-right">{formatCurrency(record.amount)}</TableCell>
                        <TableCell className="text-right">{record.leadsGenerated}</TableCell>
                        <TableCell className="text-right">{record.customersAcquired}</TableCell>
                        <TableCell className="text-right text-primary">{formatCurrency(record.revenueGenerated)}</TableCell>
                        <TableCell className="text-right text-emerald-500">{formatCurrency(record.grossProfitGenerated)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteId(record.id)}
                            disabled={isDeleting}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        No spend records for {selectedYear}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : (
        <div className="p-8 text-muted-foreground">No marketing data available.</div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete spend record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this monthly spend entry and recalculate the ROI.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId !== null && deleteSpend({ id: deleteId })}
              disabled={isDeleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
