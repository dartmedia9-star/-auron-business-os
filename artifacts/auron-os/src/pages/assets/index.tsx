import { useState } from "react";
import { 
  useListAssets, 
  getListAssetsQueryKey,
  useCreateAsset,
  useUpdateAsset,
  useDeleteAsset
} from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ['Audio', 'Lighting', 'Staging', 'Vehicle', 'Furniture', 'Tent', 'Generator', 'Camera', 'Other'];
const CONDITIONS = ['excellent', 'good', 'fair', 'poor', 'retired'];

export default function AssetsList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListAssets(undefined, {
    query: { queryKey: getListAssetsQueryKey() }
  });

  const createAsset = useCreateAsset();
  const updateAsset = useUpdateAsset();
  const deleteAsset = useDeleteAsset();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any>(null);

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [currentBookValue, setCurrentBookValue] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [condition, setCondition] = useState("good");
  const [maintenanceCost, setMaintenanceCost] = useState("0");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setName(""); setCategory("Other"); setPurchaseDate(""); setPurchaseCost("");
    setCurrentBookValue(""); setStorageLocation(""); setCondition("good"); setMaintenanceCost("0"); setNotes("");
  };

  const openEdit = (asset: any) => {
    setSelectedAsset(asset);
    setName(asset.name);
    setCategory(asset.category);
    setPurchaseDate(asset.purchaseDate ? asset.purchaseDate.split('T')[0] : "");
    setPurchaseCost(String(asset.purchaseCost));
    setCurrentBookValue(asset.currentBookValue ? String(asset.currentBookValue) : "");
    setStorageLocation(asset.storageLocation || "");
    setCondition(asset.condition || "good");
    setMaintenanceCost(asset.maintenanceCost ? String(asset.maintenanceCost) : "0");
    setNotes(asset.notes || "");
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!name || !category || !purchaseDate || !purchaseCost) {
      toast({ title: "Validation Error", description: "Name, category, date, and cost are required", variant: "destructive" });
      return;
    }
    createAsset.mutate({
      data: {
        name, category, purchaseDate, purchaseCost: Number(purchaseCost), 
        currentBookValue: currentBookValue ? Number(currentBookValue) : undefined, 
        storageLocation, condition: condition as any, 
        maintenanceCost: maintenanceCost ? Number(maintenanceCost) : undefined, 
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset added" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to add asset", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedAsset) return;
    if (!name || !category || !purchaseDate || !purchaseCost) return;
    
    updateAsset.mutate({
      id: selectedAsset.id,
      data: {
        name, category, purchaseDate, purchaseCost: Number(purchaseCost), 
        currentBookValue: currentBookValue ? Number(currentBookValue) : undefined, 
        storageLocation, condition: condition as any, 
        maintenanceCost: maintenanceCost ? Number(maintenanceCost) : undefined, 
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update asset", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!selectedAsset) return;
    deleteAsset.mutate({ id: selectedAsset.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAssetsQueryKey() });
        toast({ title: "Asset deleted" });
        setDeleteOpen(false);
      },
      onError: (err) => toast({ title: "Failed to delete asset", description: err.message, variant: "destructive" })
    });
  };

  const FormContent = (
    <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
      <div className="space-y-2">
        <Label>Asset Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Purchase Date *</Label>
          <Input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Purchase Cost *</Label>
          <Input type="number" inputMode="decimal" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Current Book Value</Label>
          <Input type="number" inputMode="decimal" value={currentBookValue} onChange={e => setCurrentBookValue(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Maintenance Cost</Label>
          <Input type="number" inputMode="decimal" value={maintenanceCost} onChange={e => setMaintenanceCost(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Condition</Label>
          <Select value={condition} onValueChange={setCondition}>
            <SelectTrigger><SelectValue placeholder="Select condition" /></SelectTrigger>
            <SelectContent>
              {CONDITIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Storage Location</Label>
          <Input value={storageLocation} onChange={e => setStorageLocation(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Asset Management</h2>
          <p className="text-muted-foreground mt-1">Track inventory, condition, and ROI on owned assets.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Asset
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Condition</TableHead>
                  <TableHead className="text-right">Purchase Cost</TableHead>
                  <TableHead className="text-right">Book Value</TableHead>
                  <TableHead className="text-right">ROI</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">Loading assets...</TableCell>
                  </TableRow>
                ) : data && data.length > 0 ? (
                  data.map((asset) => (
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(asset)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedAsset(asset); setDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No assets found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Asset</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createAsset.isPending}>
              {createAsset.isPending ? "Saving..." : "Save Asset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateAsset.isPending}>
              {updateAsset.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this asset? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteAsset.isPending ? "Deleting..." : "Delete Asset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
