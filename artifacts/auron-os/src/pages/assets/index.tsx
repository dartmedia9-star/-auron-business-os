import { useListAssets, getListAssetsQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AssetsList() {
  const { data, isLoading } = useListAssets(undefined, {
    query: { queryKey: getListAssetsQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Asset Management</h2>
          <p className="text-muted-foreground mt-1">Track inventory, condition, and ROI on owned assets.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Asset
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Asset Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-center">Condition</TableHead>
                <TableHead className="text-right">Purchase Cost</TableHead>
                <TableHead className="text-right">Book Value</TableHead>
                <TableHead className="text-right">ROI</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">Loading assets...</TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell>{asset.category}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="capitalize">{asset.condition}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(asset.purchaseCost)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(asset.currentBookValue)}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-500">
                      {asset.roi != null ? formatPercentage(asset.roi) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No assets found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
