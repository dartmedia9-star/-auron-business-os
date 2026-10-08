import { useState, useEffect } from "react";
import { PageHeader } from "@/components/ds/page-header";
import { EmptyState, ErrorState, PageSkeleton } from "@/components/ds/states";
import { UserX } from "lucide-react";
import { useRoute, Link } from "wouter";
import { 
  useGetClient, 
  useGetClientProfitability, 
  getGetClientQueryKey, 
  getGetClientProfitabilityQueryKey,
  useUpdateClient
} from "@workspace/api-client-react";
import { formatCurrency, formatDate, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Edit, Mail, Phone, MapPin, Building, Briefcase } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfitabilityBadge } from "@/components/ds/status-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ClientPayments } from "@/components/client-payments";

const CLIENT_TYPES = ['individual', 'corporate', 'government', 'ngo', 'association', 'school'];

export default function ClientDetail() {
  const [, params] = useRoute("/clients/:id");
  const id = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: client, isLoading: isLoadingClient, error: clientError, refetch: refetchClient } = useGetClient(id, {
    query: { enabled: !!id, queryKey: getGetClientQueryKey(id) }
  });

  const { data: profitability, isLoading: isLoadingProf } = useGetClientProfitability(id, {
    query: { enabled: !!id, queryKey: getGetClientProfitabilityQueryKey(id) }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateClient = useUpdateClient();

  const [editOpen, setEditOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [clientType, setClientType] = useState("individual");
  const [company, setCompany] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [locationStr, setLocationStr] = useState("");
  const [industry, setIndustry] = useState("");
  const [leadSource, setLeadSource] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (client) {
      setName(client.name);
      setClientType(client.clientType);
      setCompany(client.company || "");
      setContactPerson(client.contactPerson || "");
      setPhone(client.phone || "");
      setEmail(client.email || "");
      setLocationStr(client.location || "");
      setIndustry(client.industry || "");
      setLeadSource(client.leadSource || "");
      setNotes(client.notes || "");
    }
  }, [client]);

  const handleUpdate = () => {
    if (!name || !clientType) {
      toast({ title: "Validation Error", description: "Name and Client Type are required", variant: "destructive" });
      return;
    }
    
    updateClient.mutate({
      id,
      data: {
        name,
        clientType: clientType as any,
        company,
        contactPerson,
        phone,
        email,
        location: locationStr,
        industry,
        leadSource,
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetClientQueryKey(id) });
        toast({ title: "Client updated successfully" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update client", description: err.message, variant: "destructive" })
    });
  };

  if (isLoadingClient || isLoadingProf) return <PageSkeleton kpis={4} />;
  if (clientError && !client && !/HTTP 404/.test(String((clientError as Error)?.message))) {
    return <ErrorState title="Couldn't load this client" error={clientError} onRetry={() => refetchClient()} />;
  }
  if (!client) {
    return (
      <EmptyState
        icon={UserX}
        title="Client not found"
        description="It may have been deleted, or the link is wrong."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/clients">Back to Clients</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back="/clients"
        backLabel="Back to Clients"
        title={client.name}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">{client.clientType}</span>
            {client.company && <span>· {client.company}</span>}
            {client.industry && <span>· {client.industry}</span>}
          </span>
        }
        actions={
          <>
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setEditOpen(true)}>
              <Edit className="mr-2 h-4 w-4" /> Edit
            </Button>
            <Button className="flex-1 sm:flex-none" asChild>
              <Link href="/events">New Event</Link>
            </Button>
          </>
        }
      />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Client</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Client Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Client Type *</Label>
              <Select value={clientType} onValueChange={setClientType}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} />
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
                <Label>Industry</Label>
                <Input value={industry} onChange={e => setIndustry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Lead Source</Label>
                <Input value={leadSource} onChange={e => setLeadSource(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} loading={updateClient.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                <div className="text-sm break-all">{client.email}</div>
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
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="md:col-span-2 space-y-6">
          <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
            <Card className="bg-card">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-xs sm:text-sm text-muted-foreground truncate">Lifetime Revenue</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold truncate">{formatCurrency(client.lifetimeRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1 truncate">Across {client.totalEvents} events</p>
              </CardContent>
            </Card>
            <Card className="bg-card border-primary/50">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-xs sm:text-sm text-primary truncate">Lifetime Profit</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-primary truncate">{formatCurrency(client.lifetimeGrossProfit)}</div>
                {profitability && (
                  <p className="text-xs text-muted-foreground mt-1 truncate">Margin: {formatPercentage(profitability.grossMarginPct)}</p>
                )}
              </CardContent>
            </Card>
            <Card className="bg-card col-span-2 md:col-span-1">
              <CardHeader className="pb-2 px-4">
                <CardTitle className="text-xs sm:text-sm text-muted-foreground truncate">Outstanding</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl sm:text-2xl font-bold text-warning truncate">{formatCurrency(client.totalOutstanding)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Event History</CardTitle>
              <CardDescription>All events produced for this client.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
                          <TableCell className="text-right font-medium">{formatCurrency(event.revenue)}</TableCell>
                          <TableCell className="text-right text-primary font-medium">{formatCurrency(event.grossProfit)}</TableCell>
                          <TableCell className="text-center">{formatPercentage(event.grossMarginPct)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="p-0 hover:bg-transparent"><EmptyState compact title="No events found." /></TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <ClientPayments clientId={id} />
    </div>
  );
}
