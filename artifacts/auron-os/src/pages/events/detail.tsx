import { useState, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { 
  useGetEvent, 
  getGetEventQueryKey,
  useUpdateEvent,
  useDeleteEvent,
  useCreateEventCost,
  useDeleteEventCost,
  useUpsertEventRevenue,
  useListClients,
  useListVendors
} from "@workspace/api-client-react";
import { cn, formatCurrency, formatDate, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Edit, Wallet, TrendingUp, AlertTriangle, Trash2 } from "lucide-react";
import { ProfitabilityBadge, StatusBadge } from "./index";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const EVENT_TYPES = ['Wedding', 'Corporate', 'Birthday', 'Cultural', 'Conference', 'Reception', 'Other'];
const STATUSES = ['upcoming', 'in_progress', 'completed', 'cancelled'];
const COST_CATEGORIES = ['Venue', 'Catering', 'Décor', 'AV', 'Photography', 'Videography', 'DJ-Music', 'Security', 'Staffing', 'Transport', 'Other'];
const PAYMENT_STATUSES = ['pending', 'partially_paid', 'paid'];
const REVENUE_PAYMENT_STATUSES = ['pending', 'partially_paid', 'paid', 'overdue'];

export default function EventDetail() {
  const [, params] = useRoute("/events/:id");
  const [, setLocation] = useLocation();
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: event, isLoading } = useGetEvent(id, {
    query: { 
      enabled: !!id,
      queryKey: getGetEventQueryKey(id)
    }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Dialog states
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [costOpen, setCostOpen] = useState(false);
  const [revenueOpen, setRevenueOpen] = useState(false);
  const [deleteCostId, setDeleteCostId] = useState<number | null>(null);

  // Edit Event State
  const [editName, setEditName] = useState("");
  const [editClientId, setEditClientId] = useState("");
  const [editEventType, setEditEventType] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editEventDate, setEditEventDate] = useState("");
  const [editVenue, setEditVenue] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const { data: clientsData } = useListClients();
  const clients = clientsData?.data || [];
  
  const { data: vendorsData } = useListVendors();
  const vendors = (vendorsData as any[] | undefined) || [];

  const updateEvent = useUpdateEvent();
  const deleteEvent = useDeleteEvent();
  const createCost = useCreateEventCost();
  const deleteCost = useDeleteEventCost();
  const upsertRevenue = useUpsertEventRevenue();

  useEffect(() => {
    if (event) {
      setEditName(event.name);
      setEditClientId(String(event.clientId));
      setEditEventType(event.eventType);
      setEditStatus(event.status);
      setEditEventDate(event.eventDate ? event.eventDate.split('T')[0] : "");
      setEditVenue(event.venue || "");
      setEditLocation(event.location || "");
      setEditNotes(event.notes || "");
    }
  }, [event]);

  // Add Cost State
  const [costCategory, setCostCategory] = useState("");
  const [costAmount, setCostAmount] = useState("");
  const [costDescription, setCostDescription] = useState("");
  const [costVendorId, setCostVendorId] = useState("");
  const [costGst, setCostGst] = useState("0");
  const [costPaymentStatus, setCostPaymentStatus] = useState("pending");
  const [costDate, setCostDate] = useState("");
  const [costRef, setCostRef] = useState("");

  // Revenue State
  const [revContract, setRevContract] = useState("");
  const [revGst, setRevGst] = useState("0");
  const [revDiscount, setRevDiscount] = useState("0");
  const [revAdvance, setRevAdvance] = useState("0");
  const [revSecond, setRevSecond] = useState("0");
  const [revFinal, setRevFinal] = useState("0");
  const [revStatus, setRevStatus] = useState("pending");
  const [revInvoice, setRevInvoice] = useState("");
  const [revDueDate, setRevDueDate] = useState("");

  useEffect(() => {
    if (event?.revenue && revenueOpen) {
      setRevContract(String(event.revenue.contractValue));
      setRevGst(String(event.revenue.gst || 0));
      setRevDiscount(String(event.revenue.discount || 0));
      setRevAdvance(String(event.revenue.advanceReceived || 0));
      setRevSecond(String(event.revenue.secondPayment || 0));
      setRevFinal(String(event.revenue.finalPayment || 0));
      setRevStatus(event.revenue.paymentStatus || 'pending');
      setRevInvoice(event.revenue.invoiceNumber || "");
      setRevDueDate(event.revenue.dueDate ? event.revenue.dueDate.split('T')[0] : "");
    } else if (revenueOpen && !event?.revenue) {
      setRevContract(""); setRevGst("0"); setRevDiscount("0"); setRevAdvance("0");
      setRevSecond("0"); setRevFinal("0"); setRevStatus("pending"); setRevInvoice(""); setRevDueDate("");
    }
  }, [event?.revenue, revenueOpen]);

  const handleUpdateEvent = () => {
    updateEvent.mutate({
      id,
      data: {
        name: editName,
        clientId: Number(editClientId),
        eventType: editEventType,
        status: editStatus as any,
        eventDate: editEventDate,
        venue: editVenue,
        location: editLocation,
        notes: editNotes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
        toast({ title: "Event updated successfully" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Update failed", description: err.message, variant: "destructive" })
    });
  };

  const handleDeleteEvent = () => {
    deleteEvent.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Event deleted" });
        setLocation('/events');
      },
      onError: (err) => toast({ title: "Delete failed", description: err.message, variant: "destructive" })
    });
  };

  const handleAddCost = () => {
    if (!costCategory || !costAmount) {
      toast({ title: "Validation Error", description: "Category and amount are required", variant: "destructive" });
      return;
    }
    createCost.mutate({
      eventId: id,
      data: {
        category: costCategory,
        amount: Number(costAmount),
        description: costDescription,
        vendorId: costVendorId ? Number(costVendorId) : undefined,
        gst: Number(costGst),
        paymentStatus: costPaymentStatus as any,
        date: costDate || undefined,
        referenceNumber: costRef
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
        toast({ title: "Cost added" });
        setCostOpen(false);
        setCostCategory(""); setCostAmount(""); setCostDescription(""); setCostVendorId("");
        setCostGst("0"); setCostPaymentStatus("pending"); setCostDate(""); setCostRef("");
      },
      onError: (err) => toast({ title: "Failed to add cost", description: err.message, variant: "destructive" })
    });
  };

  const handleDeleteCost = () => {
    if (!deleteCostId) return;
    deleteCost.mutate({ eventId: id, id: deleteCostId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
        toast({ title: "Cost removed" });
        setDeleteCostId(null);
      },
      onError: (err) => toast({ title: "Failed to remove cost", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdateRevenue = () => {
    if (!revContract) {
      toast({ title: "Validation Error", description: "Contract value is required", variant: "destructive" });
      return;
    }
    upsertRevenue.mutate({
      eventId: id,
      data: {
        contractValue: Number(revContract),
        gst: Number(revGst),
        discount: Number(revDiscount),
        advanceReceived: Number(revAdvance),
        secondPayment: Number(revSecond),
        finalPayment: Number(revFinal),
        paymentStatus: revStatus as any,
        invoiceNumber: revInvoice,
        dueDate: revDueDate || undefined
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(id) });
        toast({ title: "Revenue updated" });
        setRevenueOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update revenue", description: err.message, variant: "destructive" })
    });
  };

  if (isLoading) return <div className="p-8">Loading event data...</div>;
  if (!event) return <div className="p-8">Event not found.</div>;

  return (
    <div className="space-y-6 max-w-full overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild className="h-8 w-8 shrink-0">
            <Link href="/events"><ArrowLeft className="h-4 w-4" /></Link>
          </Button>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex flex-wrap items-center gap-2 sm:gap-3">
              {event.name}
              <StatusBadge status={event.status} />
              <ProfitabilityBadge indicator={event.profitabilityIndicator} />
            </h2>
            <div className="text-sm sm:text-base text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
              <span>{formatDate(event.eventDate)}</span>
              <span className="hidden sm:inline">•</span>
              <Link href={`/clients/${event.clientId}`} className="hover:text-primary">
                {event.clientName}
              </Link>
              <span className="hidden sm:inline">•</span>
              <span>{event.eventType}</span>
              {event.location && (
                <>
                  <span className="hidden sm:inline">•</span>
                  <span>{event.location}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Edit className="mr-2 h-4 w-4" /> Edit
          </Button>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <Card className="bg-card">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="text-xs sm:text-sm text-muted-foreground truncate">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-3xl font-bold truncate">{formatCurrency(event.totalRevenue)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="text-xs sm:text-sm text-muted-foreground truncate">Total Cost</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-3xl font-bold truncate">{formatCurrency(event.totalCost)}</div>
          </CardContent>
        </Card>
        <Card className="bg-card border-primary/50">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="text-xs sm:text-sm text-primary truncate">Gross Profit</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-3xl font-bold text-primary truncate">{formatCurrency(event.grossProfit)}</div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">Margin: {formatPercentage(event.grossMarginPct)}</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="pb-2 px-4">
            <CardTitle className="text-xs sm:text-sm text-muted-foreground truncate">Total Collected</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-xl sm:text-3xl font-bold truncate">{formatCurrency(event.totalCollected)}</div>
            <p className="text-xs sm:text-sm text-amber-500 mt-1 truncate">Due: {formatCurrency(event.totalOutstanding)}</p>
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
            <Button size="sm" variant="outline" onClick={() => setRevenueOpen(true)}>
              {event.revenue ? "Edit Revenue" : "Add Revenue"}
            </Button>
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
                  <Button variant="outline" onClick={() => setRevenueOpen(true)}>Add Contract Details</Button>
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
            <Button size="sm" variant="outline" onClick={() => setCostOpen(true)}>Add Expense</Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
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
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setDeleteCostId(cost.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No costs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Event Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Event Name *</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={editClientId} onValueChange={setEditClientId}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Type *</Label>
              <Select value={editEventType} onValueChange={setEditEventType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Date *</Label>
              <Input type="date" value={editEventDate} onChange={e => setEditEventDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input value={editVenue} onChange={e => setEditVenue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={editLocation} onChange={e => setEditLocation(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateEvent} disabled={updateEvent.isPending}>
              {updateEvent.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Event Dialog */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this event? This action cannot be undone and will remove all associated revenues and costs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEvent} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteEvent.isPending ? "Deleting..." : "Delete Event"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Cost Dialog */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Event Cost</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select value={costCategory} onValueChange={setCostCategory}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {COST_CATEGORIES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input type="number" inputMode="decimal" value={costAmount} onChange={e => setCostAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input value={costDescription} onChange={e => setCostDescription(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vendor</Label>
              <Select value={costVendorId} onValueChange={setCostVendorId}>
                <SelectTrigger><SelectValue placeholder="Select vendor (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors.map(v => <SelectItem key={v.id} value={String(v.id)}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST Amount</Label>
                <Input type="number" inputMode="decimal" value={costGst} onChange={e => setCostGst(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={costDate} onChange={e => setCostDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Payment Status</Label>
              <Select value={costPaymentStatus} onValueChange={setCostPaymentStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reference/Invoice #</Label>
              <Input value={costRef} onChange={e => setCostRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button>
            <Button onClick={handleAddCost} disabled={createCost.isPending}>
              {createCost.isPending ? "Saving..." : "Add Cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Cost Dialog */}
      <AlertDialog open={!!deleteCostId} onOpenChange={(open) => !open && setDeleteCostId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Cost?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this cost item? This will update the event's profitability.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCost} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteCost.isPending ? "Removing..." : "Remove Cost"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Update Revenue Dialog */}
      <Dialog open={revenueOpen} onOpenChange={setRevenueOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Event Revenue Details</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Contract Value *</Label>
              <Input type="number" inputMode="decimal" value={revContract} onChange={e => setRevContract(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>GST Amount</Label>
                <Input type="number" inputMode="decimal" value={revGst} onChange={e => setRevGst(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Discount</Label>
                <Input type="number" inputMode="decimal" value={revDiscount} onChange={e => setRevDiscount(e.target.value)} />
              </div>
            </div>
            <div className="border-t pt-4 mt-2">
              <h4 className="text-sm font-medium mb-3">Payment Schedule</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Advance Received</Label>
                  <Input type="number" inputMode="decimal" value={revAdvance} onChange={e => setRevAdvance(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Second Payment</Label>
                    <Input type="number" inputMode="decimal" value={revSecond} onChange={e => setRevSecond(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Final Payment</Label>
                    <Input type="number" inputMode="decimal" value={revFinal} onChange={e => setRevFinal(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-4 mt-2 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Payment Status</Label>
                <Select value={revStatus} onValueChange={setRevStatus}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {REVENUE_PAYMENT_STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Due Date</Label>
                <Input type="date" value={revDueDate} onChange={e => setRevDueDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input value={revInvoice} onChange={e => setRevInvoice(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setRevenueOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdateRevenue} disabled={upsertRevenue.isPending}>
              {upsertRevenue.isPending ? "Saving..." : "Save Revenue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
