import { useRoute, Link } from "wouter";
import { useGetClient, useGetClientProfitability, getGetClientQueryKey, getGetClientProfitabilityQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatDate, formatPercentage, formatCompactCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Mail, Phone, MapPin, Building, Briefcase } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfitabilityBadge } from "../events";

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: client, isLoading: isLoadingClient } = useGetClient(id, {
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) }
  });

  const { data: profitability, isLoading: isLoadingProf } = useGetClientProfitability(id, {
    query: { enabled: !!id, queryKey: getGetClientProfitabilityQueryKey(id) }
  });

  if (isLoadingClient || isLoadingProf) return <div className="p-8">Loading client data...</div>;
  if (!client) return <div className="p-8">Client not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8">
            <Link href="/clients"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-3xl font-bold tracking-tight">{client.name}</h2>
            <div className="text-muted-foreground mt-1 flex items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                {client.clientType}
              </span>
              {client.company && <span>• {client.company}</span>}
              {client.industry && <span>• {client.industry}</span>}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline"><Edit className="mr-2 h-4 w-4" /> Edit Client</Button>
          <Button>New Event</Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.contactPerson && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="text-sm font-medium">{client.contactPerson}</div>
                  <div className="text-xs text-muted-foreground">Primary Contact</div>
                </div>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-sm">{client.email}</div>
              </div>
            )}
            {client.phone && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-sm">{client.phone}</div>
              </div>
            )}
            {client.location && (
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="text-sm">{client.location}</div>
              </div>
            )}
            {client.notes && (
              <div className="pt-4 border-t mt-4">
                <h4 className="text-xs font-semibold mb-2 uppercase text-muted-foreground tracking-wider">Notes</h4>
                <p className="text-sm text-muted-foreground">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Lifetime Revenue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(client.lifetimeRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Across {client.totalEvents} events</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-primary/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-primary">Lifetime Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-primary">{formatCurrency(client.lifetimeGrossProfit)}</div>
                {profitability && (
                  <p className="text-xs text-muted-foreground mt-1">Margin: {formatPercentage(profitability.grossMarginPct)}</p>
                )}
              </CardContent>
            </Card>
            <Card className="bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-500">{formatCurrency(client.totalOutstanding)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Event History</CardTitle>
              <CardDescription>All events produced for this client.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Name</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Gross Profit</TableHead>
                    <TableHead className="text-center">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profitability?.events && profitability.events.length > 0 ? (
                    profitability.events.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">
                          <Link href={`/events/${event.id}`} className="hover:text-primary transition-colors">
                            {event.name}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(event.date)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCompactCurrency(event.revenue)}</TableCell>
                        <TableCell className="text-right text-primary font-medium">{formatCompactCurrency(event.grossProfit)}</TableCell>
                        <TableCell className="text-center">{formatPercentage(event.grossMarginPct)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No events found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
