import { useState, useEffect } from "react";
import { 
  useListLeads, 
  useGetPipelineSummary, 
  getListLeadsQueryKey, 
  getGetPipelineSummaryQueryKey,
  useCreateLead,
  useUpdateLead,
  useDeleteLead
} from "@workspace/api-client-react";
import { formatCurrency, formatCompactCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, ListTodo, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const PIPELINE_STAGES = [
  { id: "new", label: "New", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  { id: "contacted", label: "Contacted", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { id: "qualified", label: "Qualified", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { id: "requirement_received", label: "Req Received", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  { id: "proposal_sent", label: "Proposal Sent", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  { id: "won", label: "Won", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
];

const SOURCES = ['referral', 'instagram', 'facebook', 'website', 'google', 'walk_in', 'event_expo', 'other'];

export default function LeadsPipeline() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: summary } = useGetPipelineSummary({
    query: { queryKey: getGetPipelineSummaryQueryKey() }
  });

  const { data: leadsData } = useListLeads(undefined, {
    query: { queryKey: getListLeadsQueryKey() }
  });

  const leads = leadsData?.data || [];

  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
  const deleteLead = useDeleteLead();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // Form State
  const [contactName, setContactName] = useState("");
  const [status, setStatus] = useState("new");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [source, setSource] = useState("other");
  const [eventType, setEventType] = useState("");
  const [expectedValue, setExpectedValue] = useState("");
  const [probability, setProbability] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [notes, setNotes] = useState("");

  const resetForm = () => {
    setContactName(""); setStatus("new"); setContactPhone(""); setContactEmail("");
    setSource("other"); setEventType(""); setExpectedValue(""); setProbability("");
    setFollowUpDate(""); setNotes("");
  };

  useEffect(() => {
    if (selectedLead && editOpen) {
      setContactName(selectedLead.contactName || "");
      setStatus(selectedLead.status || "new");
      setContactPhone(selectedLead.contactPhone || "");
      setContactEmail(selectedLead.contactEmail || "");
      setSource(selectedLead.source || "other");
      setEventType(selectedLead.eventType || "");
      setExpectedValue(selectedLead.expectedValue ? String(selectedLead.expectedValue) : "");
      setProbability(selectedLead.probability ? String(selectedLead.probability) : "");
      setFollowUpDate(selectedLead.followUpDate ? selectedLead.followUpDate.split('T')[0] : "");
      setNotes(selectedLead.notes || "");
    }
  }, [selectedLead, editOpen]);

  const handleCreate = () => {
    if (!contactName || !status) {
      toast({ title: "Validation Error", description: "Contact name and status are required", variant: "destructive" });
      return;
    }
    createLead.mutate({
      data: {
        contactName,
        status: status as any,
        contactPhone,
        contactEmail,
        source: source as any,
        eventType,
        expectedValue: Number(expectedValue),
        probability: Number(probability),
        followUpDate: followUpDate || undefined,
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineSummaryQueryKey() });
        toast({ title: "Lead created" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to create lead", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedLead) return;
    if (!contactName || !status) {
      toast({ title: "Validation Error", description: "Contact name and status are required", variant: "destructive" });
      return;
    }
    updateLead.mutate({
      id: selectedLead.id,
      data: {
        contactName,
        status: status as any,
        contactPhone,
        contactEmail,
        source: source as any,
        eventType,
        expectedValue: Number(expectedValue),
        probability: Number(probability),
        followUpDate: followUpDate || undefined,
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineSummaryQueryKey() });
        toast({ title: "Lead updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update lead", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!selectedLead) return;
    deleteLead.mutate({ id: selectedLead.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLeadsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPipelineSummaryQueryKey() });
        toast({ title: "Lead deleted" });
        setDeleteOpen(false);
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to delete lead", description: err.message, variant: "destructive" })
    });
  };

  return (
    <div className="space-y-6 h-full flex flex-col min-h-[100dvh] md:min-h-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between shrink-0 gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Pipeline</h2>
          <p className="text-muted-foreground mt-1">Track deals from lead to closed-won.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Lead
        </Button>
      </div>

      {summary && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4 shrink-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Total Pipeline</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl sm:text-2xl font-bold truncate">{formatCompactCurrency(summary.pipelineValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.totalLeads} active deals</p>
            </CardContent>
          </Card>
          <Card className="border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-primary truncate">Weighted Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary hidden sm:block" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl sm:text-2xl font-bold text-primary truncate">{formatCompactCurrency(summary.weightedPipeline)}</div>
              <p className="text-xs text-muted-foreground mt-1">Prob adjusted</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl sm:text-2xl font-bold">{formatPercentage(summary.winRate)}</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.wonDeals} won deals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 px-4">
              <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">Avg Deal Size</CardTitle>
              <ListTodo className="h-4 w-4 text-muted-foreground hidden sm:block" />
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl sm:text-2xl font-bold truncate">{formatCompactCurrency(summary.avgDealSize)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board - Desktop */}
      <div className="hidden md:flex flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage.id);
            const stageValue = stageLeads.reduce((sum, l) => sum + (l.expectedValue || 0), 0);
            
            return (
              <div key={stage.id} className="w-80 flex flex-col bg-muted/30 rounded-lg border max-h-[calc(100vh-250px)]">
                <div className="p-3 border-b flex items-center justify-between bg-card rounded-t-lg shrink-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", stage.color)}>
                      {stage.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{stageLeads.length}</span>
                  </div>
                  <div className="text-sm font-medium">{formatCompactCurrency(stageValue)}</div>
                </div>
                
                <div className="flex-1 p-3 overflow-y-auto space-y-3">
                  {stageLeads.map(lead => (
                    <Card key={lead.id} className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm" onClick={() => { setSelectedLead(lead); setEditOpen(true); }}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex justify-between items-start">
                          <h4 className="font-medium text-sm leading-none">{lead.clientName || lead.contactName}</h4>
                        </div>
                        
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {lead.eventType || "Event TBD"}
                        </div>
                        
                        <div className="flex justify-between items-end pt-2 border-t border-border/50 mt-2">
                          <div className="text-sm font-bold">{formatCurrency(lead.expectedValue)}</div>
                          {lead.probability && (
                            <div className="text-xs text-muted-foreground">{lead.probability}% prob</div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="h-20 border-2 border-dashed border-border rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                      No deals
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Vertical List - Mobile */}
      <div className="md:hidden flex flex-col gap-6 pb-6">
        {PIPELINE_STAGES.map(stage => {
          const stageLeads = leads.filter(l => l.status === stage.id);
          const stageValue = stageLeads.reduce((sum, l) => sum + (l.expectedValue || 0), 0);
          if (stageLeads.length === 0) return null;

          return (
            <div key={stage.id} className="space-y-3">
              <div className="flex items-center justify-between border-b pb-2">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-semibold border", stage.color)}>
                  {stage.label} ({stageLeads.length})
                </span>
                <span className="text-sm font-medium">{formatCompactCurrency(stageValue)}</span>
              </div>
              <div className="space-y-3">
                {stageLeads.map(lead => (
                  <Card key={lead.id} className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm" onClick={() => { setSelectedLead(lead); setEditOpen(true); }}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <h4 className="font-medium text-sm leading-none">{lead.clientName || lead.contactName}</h4>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-1">
                        {lead.eventType || "Event TBD"}
                      </div>
                      <div className="flex justify-between items-end pt-2 border-t border-border/50 mt-2">
                        <div className="text-sm font-bold">{formatCurrency(lead.expectedValue)}</div>
                        {lead.probability && (
                          <div className="text-xs text-muted-foreground">{lead.probability}% prob</div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create/Edit Form Content */}
      {(() => {
        const FormContent = (
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Contact Name *</Label>
              <Input value={contactName} onChange={e => setContactName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Stage *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                <SelectContent>
                  {PIPELINE_STAGES.map(s => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Type</Label>
              <Input value={eventType} onChange={e => setEventType(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Expected Value</Label>
                <Input type="number" inputMode="decimal" value={expectedValue} onChange={e => setExpectedValue(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Probability (%)</Label>
                <Input type="number" value={probability} onChange={e => setProbability(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Follow Up Date</Label>
              <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
        );

        return (
          <>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Lead</DialogTitle>
                </DialogHeader>
                {FormContent}
                <DialogFooter className="shrink-0 pt-4 border-t">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreate} disabled={createLead.isPending}>
                    {createLead.isPending ? "Saving..." : "Save Lead"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Edit Lead</DialogTitle>
                </DialogHeader>
                {FormContent}
                <DialogFooter className="shrink-0 pt-4 border-t flex flex-col sm:flex-row justify-between gap-2">
                  <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button onClick={handleUpdate} disabled={updateLead.isPending}>
                      {updateLead.isPending ? "Saving..." : "Save Changes"}
                    </Button>
                  </div>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Lead?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this lead? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {deleteLead.isPending ? "Deleting..." : "Delete Lead"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        );
      })()}
    </div>
  );
}
