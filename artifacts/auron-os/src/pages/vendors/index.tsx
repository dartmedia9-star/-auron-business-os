import { useListVendors, getListVendorsQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus } from "lucide-react";

export default function VendorsList() {
  const { data, isLoading } = useListVendors(undefined, {
    query: { queryKey: getListVendorsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Vendor Management</h2>
          <p className="text-muted-foreground mt-1">Manage suppliers, track spending and outstanding payments.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Vendor
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex items-center justify-between">
            <div className="relative w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search vendors..." className="pl-9 bg-background" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendor Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Total Events</TableHead>
                <TableHead className="text-right">Total Spend</TableHead>
                <TableHead className="text-right">Avg Cost/Event</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">Loading vendors...</TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((vendor) => (
                  <TableRow key={vendor.id}>
                    <TableCell className="font-medium">
                      {vendor.name}
                      <div className="text-xs text-muted-foreground font-normal">{vendor.contactPerson || "—"}</div>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                        {vendor.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-medium">{vendor.totalEvents || 0}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(vendor.totalSpend)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(vendor.avgCostPerEvent)}</TableCell>
                    <TableCell className={cn("text-right font-medium", vendor.outstandingPayment && vendor.outstandingPayment > 0 ? "text-amber-500" : "")}>
                      {formatCurrency(vendor.outstandingPayment)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No vendors found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
