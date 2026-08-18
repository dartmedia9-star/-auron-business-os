import { useGetMarketingRoi, getGetMarketingRoiQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function MarketingList() {
  const { data, isLoading } = useGetMarketingRoi(undefined, {
    query: { queryKey: getGetMarketingRoiQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Marketing ROI</h2>
          <p className="text-muted-foreground mt-1">Track customer acquisition cost and channel performance.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8">Loading marketing data...</div>
      ) : data ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Spend</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.totalSpend)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(data.totalRevenue)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Blended CAC</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.overallCac ? formatCurrency(data.overallCac) : "—"}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Overall ROI</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-500">{formatPercentage(data.overallRoi)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Channel Performance</CardTitle>
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
                        <TableCell className="text-right font-medium text-amber-500">{channel.cac ? formatCurrency(channel.cac) : "—"}</TableCell>
                        <TableCell className="text-right font-medium text-primary">{formatCurrency(channel.revenue)}</TableCell>
                        <TableCell className="text-right font-medium text-emerald-500">{formatPercentage(channel.roi)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No channel data available.</TableCell>
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
