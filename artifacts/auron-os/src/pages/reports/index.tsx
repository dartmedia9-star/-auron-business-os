import { useGetEventProfitabilityReport, getGetEventProfitabilityReportQueryKey } from "@workspace/api-client-react";
import { CardsSkeleton, ErrorState, TableSkeleton } from "@/components/ds/states";
import { PageHeader } from "@/components/ds/page-header";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ReportsList() {
  const { data, isLoading, error, refetch } = useGetEventProfitabilityReport(undefined, {
    query: { queryKey: getGetEventProfitabilityReportQueryKey() }
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Analytics & Reports" description="Deep dive into event type profitability and overall performance." />

      {isLoading ? (
        <div className="space-y-6"><CardsSkeleton count={4} /><div className="rounded-xl border bg-card shadow-card"><TableSkeleton /></div></div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.summary.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary">Total Gross Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(data.summary.totalGrossProfit)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Avg Gross Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-money-in">{formatPercentage(data.summary.avgGrossMarginPct)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Events Analysed</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.summary.eventCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Performance by Event Type</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                    {data.byEventType.length > 0 ? (
                      data.byEventType.map((item) => (
                        <TableRow key={item.eventType}>
                          <TableCell className="font-medium">{item.eventType}</TableCell>
                          <TableCell className="text-center">{item.eventCount}</TableCell>
                          <TableCell className="text-right">{formatCurrency(item.totalRevenue)}</TableCell>
                          <TableCell className="text-right font-medium text-primary">{formatCurrency(item.grossProfit)}</TableCell>
                          <TableCell className="text-right font-medium text-money-in">{formatPercentage(item.grossMarginPct)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">No data available.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>All Events</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Name</TableHead>
                      <TableHead className="hidden sm:table-cell">Client</TableHead>
                      <TableHead className="hidden sm:table-cell">Type</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Gross Profit</TableHead>
                      <TableHead className="text-right hidden md:table-cell">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.length > 0 ? (
                      data.events.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">{event.name}</TableCell>
                          <TableCell className="hidden sm:table-cell text-muted-foreground">{event.clientName}</TableCell>
                          <TableCell className="hidden sm:table-cell">{event.eventType}</TableCell>
                          <TableCell className="text-right">{formatCurrency(event.revenue)}</TableCell>
                          <TableCell className="text-right font-medium text-primary">{formatCurrency(event.grossProfit)}</TableCell>
                          <TableCell className="text-right hidden md:table-cell text-money-in">{formatPercentage(event.grossMarginPct)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No events found.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : error ? (
        <ErrorState title="Couldn't load reports" error={error} onRetry={() => refetch()} />
      ) : null}
    </div>
  );
}
