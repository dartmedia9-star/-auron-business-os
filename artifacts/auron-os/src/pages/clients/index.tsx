import { useState } from "react";
import { useListClients, getListClientsQueryKey, useCreateClient } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Star } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CLIENT_TYPES = ['individual', 'corporate', 'government', 'ngo', 'association', 'school'];

export default function ClientsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  
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

  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data, isLoading } = useListClients(undefined, {
    query: { queryKey: getListClientsQueryKey() }
  });

  const createClient = useCreateClient();

  const handleCreate = () => {
    if (!name || !clientType) {
      toast({ title: "Validation Error", description: "Name and Client Type are required", variant: "destructive" });
      return;
    }
    
    createClient.mutate({
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
        queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
        toast({ title: "Client created successfully" });
        setCreateOpen(false);
        // Reset form
        setName(""); setClientType("individual"); setCompany(""); setContactPerson("");
        setPhone(""); setEmail(""); setLocationStr(""); setIndustry(""); setLeadSource(""); setNotes("");
      },
      onError: (err) => toast({ title: "Failed to create client", description: err.message, variant: "destructive" })
    });
  };

  const filteredClients = data?.data?.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.company && c.company.toLowerCase().includes(searchQuery.toLowerCase()))
  ) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Client CRM</h2>
          <p className="text-muted-foreground mt-1">Manage client relationships, track LTV and profitability.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Client
        </Button>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Client</DialogTitle>
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
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createClient.isPending}>
              {createClient.isPending ? "Saving..." : "Save Client"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader className="py-4 border-b">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search clients..." 
                className="pl-9 bg-background" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
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
                ) : filteredClients.length > 0 ? (
                  filteredClients.map((client) => (
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
