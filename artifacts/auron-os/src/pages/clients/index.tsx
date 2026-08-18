import { useListClients, getListClientsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Star } from "lucide-react";

export default function ClientsList() {
  const { data, isLoading } = useListClients(undefined, {
    query: { queryKey: getListClientsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client CRM</h2>
          <p className="text-muted-foreground mt-1">Manage client relationships, track LTV and profitability.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search clients..." className="pl-9 bg-background" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">Sort by Revenue</Button>
              <Button variant="outline" size="sm">Sort by Profit</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-center">Events</TableHead>
                <TableHead className="text-right">Lifetime Revenue</TableHead>
                <TableHead className="text-right">Lifetime Profit</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    Loading clients...
                  </TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Link href={`/clients/${client.id}`} className="hover:text-primary transition-colors">
                          {client.name}
                        </Link>
                        {client.repeatClient && <Star className="h-3 w-3 text-primary fill-primary" />}
                      </div>
                      <div className="text-xs text-muted-foreground font-normal">{client.company || client.industry || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {client.clientType}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-medium">{client.totalEvents || 0}</TableCell>
                    <TableCell className="text-right font-medium">{formatCompactCurrency(client.lifetimeRevenue)}</TableCell>
                    <TableCell className="text-right text-primary font-medium">{formatCompactCurrency(client.lifetimeGrossProfit)}</TableCell>
                    <TableCell className={cn("text-right font-medium", client.totalOutstanding && client.totalOutstanding > 0 ? "text-amber-500" : "")}>
                      {formatCurrency(client.totalOutstanding)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/clients/${client.id}`}>View Profile</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No clients found.
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
