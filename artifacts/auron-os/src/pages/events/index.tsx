import { useListEvents, getListEventsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProfitabilityBadge({ indicator }: { indicator?: string }) {
  if (!indicator) return <Badge variant="outline">Awaiting data</Badge>;
  
  const config: Record<string, { bg: string, text: string, label: string }> = {
    excellent: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Excellent" },
    healthy: { bg: "bg-green-500/10", text: "text-green-500", label: "Healthy" },
    warning: { bg: "bg-amber-500/10", text: "text-amber-500", label: "Warning" },
    loss: { bg: "bg-red-500/10", text: "text-red-500", label: "Loss" },
    awaiting_data: { bg: "bg-slate-500/10", text: "text-slate-500", label: "Awaiting Data" },
  };
  
  const style = config[indicator] || config.awaiting_data;
  
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-transparent", style.bg, style.text)}>
      {style.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string, text: string, label: string }> = {
    upcoming: { bg: "bg-blue-500/10", text: "text-blue-500", label: "Upcoming" },
    in_progress: { bg: "bg-amber-500/10", text: "text-amber-500", label: "In Progress" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Completed" },
    cancelled: { bg: "bg-red-500/10", text: "text-red-500", label: "Cancelled" },
  };
  
  const style = config[status] || { bg: "bg-slate-500/10", text: "text-slate-500", label: status };
  
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border border-transparent", style.bg, style.text)}>
      {style.label}
    </span>
  );
}

export default function EventsList() {
  const { data, isLoading } = useListEvents(undefined, {
    query: { queryKey: getListEventsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Events Ledger</h2>
          <p className="text-muted-foreground mt-1">Manage event productions and track their financial performance.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> New Event
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search events..." className="pl-9 bg-background" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Filter by Status</Button>
              <Button variant="outline" size="sm">Filter by Profitability</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Gross Profit</TableHead>
                <TableHead className="text-center">Profitability</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    Loading events...
                  </TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      <Link href={`/events/${event.id}`} className="hover:text-primary transition-colors">
                        {event.name}
                      </Link>
                      <div className="text-xs text-muted-foreground font-normal">{event.eventType}</div>
                    </TableCell>
                    <TableCell>
                      <Link href={`/clients/${event.clientId}`} className="hover:underline">
                        {event.clientName || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(event.eventDate)}</TableCell>
                    <TableCell><StatusBadge status={event.status} /></TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(event.totalRevenue)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(event.grossProfit)}</TableCell>
                    <TableCell className="text-center">
                      <ProfitabilityBadge indicator={event.profitabilityIndicator} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/events/${event.id}`}>View</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    No events found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
