import { useState, useMemo } from "react";
import { 
  useListVendors, 
  getListVendorsQueryKey,
  useCreateVendor,
  useUpdateVendor,
  useDeleteVendor
} from "@workspace/api-client-react";
import { formatCurrency, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Edit, Trash2, ArrowUpDown, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ['Catering', 'Décor', 'AV-Tech', 'Photography', 'Videography', 'DJ-Music', 'Venue', 'Security', 'Transport', 'Staffing', 'Other'];

export default function VendorsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListVendors(undefined, {
    query: { queryKey: getListVendorsQueryKey() }
  });

  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();
  const deleteVendor = useDeleteVendor();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedVendor, setSelectedVendor] = useState<any>(null);

  // Form State
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Other");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [locationStr, setLocationStr] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [rating, setRating] = useState("3");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setName(""); setCategory("Other"); setContactPerson(""); setPhone("");
    setEmail(""); setLocationStr(""); setPaymentTerms(""); setRating("3"); setNotes("");
  };

  const openEdit = (vendor: any) => {
    setSelectedVendor(vendor);
    setName(vendor.name);
    setCategory(vendor.category);
    setContactPerson(vendor.contactPerson || "");
    setPhone(vendor.phone || "");
    setEmail(vendor.email || "");
    setLocationStr(vendor.location || "");
    setPaymentTerms(vendor.paymentTerms || "");
    setRating(vendor.rating ? String(vendor.rating) : "3");
    setNotes(vendor.notes || "");
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!name || !category) {
      toast({ title: "Validation Error", description: "Name and Category are required", variant: "destructive" });
      return;
    }
    createVendor.mutate({
      data: {
        name, category, contactPerson, phone, email, location: locationStr, paymentTerms, rating: Number(rating), notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        toast({ title: "Vendor added" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to add vendor", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedVendor) return;
    if (!name || !category) return;
    
    updateVendor.mutate({
      id: selectedVendor.id,
      data: {
        name, category, contactPerson, phone, email, location: locationStr, paymentTerms, rating: Number(rating), notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        toast({ title: "Vendor updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update vendor", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!selectedVendor) return;
    deleteVendor.mutate({ id: selectedVendor.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
        toast({ title: "Vendor deleted" });
        setDeleteOpen(false);
      },
      onError: (err) => toast({ title: "Failed to delete vendor", description: err.message, variant: "destructive" })
    });
  };

  const isFiltered = searchQuery !== "" || selectedCategory !== "all" || sortBy !== "name_asc";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSortBy("name_asc");
  };

  const filteredVendors = useMemo(() => {
    const raw = data || [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = raw.filter((v: any) => {
      if (q) {
        const nameMatch = v.name?.toLowerCase().includes(q);
        const catMatch = v.category?.toLowerCase().includes(q);
        const contactMatch = v.contactPerson?.toLowerCase().includes(q);
        const emailMatch = v.email?.toLowerCase().includes(q);
        const phoneMatch = v.phone?.toLowerCase().includes(q);
        const locMatch = v.location?.toLowerCase().includes(q);
        const termsMatch = v.paymentTerms?.toLowerCase().includes(q);
        if (!nameMatch && !catMatch && !contactMatch && !emailMatch && !phoneMatch && !locMatch && !termsMatch) {
          return false;
        }
      }

      if (selectedCategory !== "all" && v.category !== selectedCategory) {
        return false;
      }

      return true;
    });

    return filtered.sort((a: any, b: any) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "spend_desc":
          return Number(b.totalSpend || 0) - Number(a.totalSpend || 0);
        case "outstanding_desc":
          return Number(b.outstandingPayment || 0) - Number(a.outstandingPayment || 0);
        case "rating_desc":
          return Number(b.rating || 0) - Number(a.rating || 0);
        case "newest":
          return Number(b.id || 0) - Number(a.id || 0);
        case "oldest":
          return Number(a.id || 0) - Number(b.id || 0);
        case "name_asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [data, searchQuery, selectedCategory, sortBy]);

  const FormContent = (
    <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
      <div className="space-y-2">
        <Label>Vendor Name *</Label>
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
          <Label>Contact Person</Label>
          <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email</Label>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Location</Label>
        <Input value={locationStr} onChange={e => setLocationStr(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Payment Terms</Label>
          <Input value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Rating (1-5)</Label>
          <Input type="number" min="1" max="5" value={rating} onChange={e => setRating(e.target.value)} />
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
          <h2 className="text-3xl font-bold tracking-tight">Vendor Management</h2>
          <p className="text-muted-foreground mt-1">Manage suppliers, track spending and outstanding payments.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Vendor
        </Button>
      </div>

      <Card>
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search vendors, categories, contacts, email..." 
                className="pl-9 bg-background" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters & Sorting */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Category Filter */}
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[140px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[160px] bg-background h-9 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name: A → Z</SelectItem>
                  <SelectItem value="name_desc">Name: Z → A</SelectItem>
                  <SelectItem value="spend_desc">Total Spend: High → Low</SelectItem>
                  <SelectItem value="outstanding_desc">Outstanding: High → Low</SelectItem>
                  <SelectItem value="rating_desc">Highest Rated</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                </SelectContent>
              </Select>

              {/* Reset Action */}
              {isFiltered && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={resetFilters}
                  className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Reset all filters"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vendor Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-center">Total Events</TableHead>
                  <TableHead className="text-right">Total Spend</TableHead>
                  <TableHead className="text-right">Avg Cost/Event</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">Loading vendors...</TableCell>
                  </TableRow>
                ) : filteredVendors.length > 0 ? (
                  filteredVendors.map((vendor: any) => (
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(vendor)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedVendor(vendor); setDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      {isFiltered ? "No vendors match your filters." : "No vendors found."}
                    </TableCell>
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
            <DialogTitle>Add Vendor</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createVendor.isPending}>
              {createVendor.isPending ? "Saving..." : "Save Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Vendor</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateVendor.isPending}>
              {updateVendor.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this vendor? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteVendor.isPending ? "Deleting..." : "Delete Vendor"}
            </AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
