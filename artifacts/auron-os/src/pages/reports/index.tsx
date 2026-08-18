import { useGetEventProfitabilityReport, getGetEventProfitabilityReportQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatCompactCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReportsList() {
  const { data, isLoading } = useGetEventProfitabilityReport(undefined, {
    query: { queryKey: getGetEventProfitabilityReportQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Analytics & Reports</h2>
          <p className="text-muted-foreground mt-1">Deep dive into event type profitability and overall performance.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8">Loading reports...</div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Evaluated Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCompactCurrency(data.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary">Total Gross Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCompactCurrency(data.totalGrossProfit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Blended Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{formatPercentage(data.overallMarginPct)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Profitability Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-medium text-emerald-500 capitalize">{data.overallProfitabilityIndicator}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Performance by Event Type</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead className="text-center">Count</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byType.length > 0 ? (
                    data.byType.map((item) => (
                      <TableRow key={item.eventType}>
                        <TableCell className="font-medium">{item.eventType}</TableCell>
                        <TableCell className="text-center">{item.eventCount}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.revenue)}</TableCell>
                        <TableCell className="text-right font-medium text-primary">{formatCurrency(item.grossProfit)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-500">{formatPercentage(item.marginPct)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No data available.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
