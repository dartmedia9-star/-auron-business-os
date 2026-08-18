import { useRoute, Link } from "wouter";
import { useGetEvent, getGetEventQueryKey } from "@workspace/api-client-react";
import { cn, formatCurrency, formatDate, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Wallet, TrendingUp, AlertTriangle } from "lucide-react";
import { ProfitabilityBadge, StatusBadge } from "./index";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: event, isLoading } = useGetEvent(id, {
    query: { 
      enabled: !!id,
      queryKey: getGetEventQueryKey(id)
    }
  });

  if (isLoading) return <div className="p-8">Loading event data...</div>;
  if (!event) return <div className="p-8">Event not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/events"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              {event.name}
              <StatusBadge status={event.status} />
              <ProfitabilityBadge indicator={event.profitabilityIndicator} />
            </h2>
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              <span>{formatDate(event.eventDate)}</span>
              <span>•</span>
              <Link href={`/clients/${event.clientId}`} className="hover:text-primary">
                {event.clientName}
              </Link>
              <span>•</span>
              <span>{event.eventType}</span>
              {event.location && (
                <>
                  <span>•</span>
                  <span>{event.location}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Edit className="mr-2 h-4 w-4" /> Edit Event</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(event.totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(event.totalCost)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-primary/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-primary">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{formatCurrency(event.grossProfit)}</div>
            <p className="text-sm text-muted-foreground mt-1">Margin: {formatPercentage(event.grossMarginPct)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Collection Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{formatCurrency(event.totalCollected)}</div>
            <p className="text-sm text-amber-500 mt-1">Outstanding: {formatCurrency(event.totalOutstanding)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <CardTitle>Revenue Breakdown</CardTitle>
              <CardDescription>Contract value and payment schedules</CardDescription>
            </div>
            <Button size="sm" variant="outline">Update Revenue</Button>
          </CardHeader>
          <CardContent className="pt-6">
            {event.revenue ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Contract Value</div>
                    <div className="text-lg font-medium">{formatCurrency(event.revenue.contractValue)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Net Revenue</div>
                    <div className="text-lg font-medium">{formatCurrency(event.revenue.netRevenue)}</div>
                  </div>
                </div>
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3">Payment Schedule</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Advance Received</span>
                      <span className="font-medium">{formatCurrency(event.revenue.advanceReceived)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Second Payment</span>
                      <span className="font-medium">{formatCurrency(event.revenue.secondPayment)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Final Payment</span>
                      <span className="font-medium">{formatCurrency(event.revenue.finalPayment)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No revenue details configured yet.
                <div className="mt-4">
                  <Button variant="outline">Add Contract Details</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
            <div className="space-y-1">
              <CardTitle>Cost Breakdown</CardTitle>
              <CardDescription>Vendor and operational expenses</CardDescription>
            </div>
            <Button size="sm" variant="outline">Add Expense</Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {event.costs && event.costs.length > 0 ? (
                  event.costs.map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell className="font-medium">{cost.category}</TableCell>
                      <TableCell>{cost.vendorName || "—"}</TableCell>
                      <TableCell>
                        <span className={cn(
                          "text-xs px-2 py-1 rounded-full",
                          cost.paymentStatus === 'paid' ? "bg-emerald-500/10 text-emerald-500" :
                          cost.paymentStatus === 'pending' ? "bg-amber-500/10 text-amber-500" :
                          "bg-blue-500/10 text-blue-500"
                        )}>
                          {cost.paymentStatus}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(cost.amount)}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                      No costs recorded yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
