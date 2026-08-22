import { useState, useMemo } from "react";
import { useListClients, getListClientsQueryKey, useCreateClient } from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, formatCompactCurrency, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Star, ArrowUpDown, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const CLIENT_TYPES = ['individual', 'corporate', 'government', 'ngo', 'association', 'school'];

export default function ClientsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedRepeat, setSelectedRepeat] = useState("all");
  const [sortBy, setSortBy] = useState("name_asc");

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

  const isFiltered = searchQuery !== "" || selectedType !== "all" || selectedRepeat !== "all" || sortBy !== "name_asc";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedType("all");
    setSelectedRepeat("all");
    setSortBy("name_asc");
  };

  const filteredClients = useMemo(() => {
    const raw = data?.data || [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = raw.filter((c) => {
      if (q) {
        const nameMatch = c.name?.toLowerCase().includes(q);
        const companyMatch = c.company?.toLowerCase().includes(q);
        const contactMatch = c.contactPerson?.toLowerCase().includes(q);
        const emailMatch = c.email?.toLowerCase().includes(q);
        const phoneMatch = c.phone?.toLowerCase().includes(q);
        const locMatch = c.location?.toLowerCase().includes(q);
        const indMatch = c.industry?.toLowerCase().includes(q);
        const typeMatch = c.clientType?.toLowerCase().includes(q);
        if (!nameMatch && !companyMatch && !contactMatch && !emailMatch && !phoneMatch && !locMatch && !indMatch && !typeMatch) {
          return false;
        }
      }

      if (selectedType !== "all" && c.clientType !== selectedType) {
        return false;
      }

      if (selectedRepeat === "repeat" && !c.repeatClient) {
        return false;
      }
      if (selectedRepeat === "new" && c.repeatClient) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "revenue_desc":
          return Number(b.lifetimeRevenue || 0) - Number(a.lifetimeRevenue || 0);
        case "profit_desc":
          return Number(b.lifetimeGrossProfit || 0) - Number(a.lifetimeGrossProfit || 0);
        case "events_desc":
          return Number(b.totalEvents || 0) - Number(a.totalEvents || 0);
        case "newest":
          return Number(b.id || 0) - Number(a.id || 0);
        case "oldest":
          return Number(a.id || 0) - Number(b.id || 0);
        case "name_asc":
        default:
          return a.name.localeCompare(b.name);
      }
    });
  }, [data?.data, searchQuery, selectedType, selectedRepeat, sortBy]);

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
        <CardHeader className="py-4 border-b space-y-3">
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search clients, companies, contacts, email, phone..." 
                className="pl-9 bg-background" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters & Sorting */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Type Filter */}
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Client Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {CLIENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Repeat Filter */}
              <Select value={selectedRepeat} onValueChange={setSelectedRepeat}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  <SelectItem value="repeat">Repeat Clients</SelectItem>
                  <SelectItem value="new">First-Time Clients</SelectItem>
                </SelectContent>
              </Select>

              {/* Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[155px] bg-background h-9 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name_asc">Name: A → Z</SelectItem>
                  <SelectItem value="name_desc">Name: Z → A</SelectItem>
                  <SelectItem value="revenue_desc">Revenue: High → Low</SelectItem>
                  <SelectItem value="profit_desc">Profit: High → Low</SelectItem>
                  <SelectItem value="events_desc">Most Events</SelectItem>
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
                      {isFiltered ? "No clients match your filters." : "No clients found."}
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
