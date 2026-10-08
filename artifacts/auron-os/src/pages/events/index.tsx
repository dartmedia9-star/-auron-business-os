import { useState, useMemo } from "react";
import { MobileList, MobileListItem } from "@/components/ds/mobile-list";
import { EmptyState, ListSkeleton, TableSkeleton } from "@/components/ds/states";
import { PageHeader } from "@/components/ds/page-header";
import { 
  useListEvents, 
  getListEventsQueryKey, 
  useCreateEvent,
  useListClients 
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, Plus, ArrowUpDown, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Textarea } from "@/components/ui/textarea";
import { ProfitabilityBadge, StatusBadge } from "@/components/ds/status-badge";

const EVENT_TYPES = ['Wedding', 'Corporate', 'Birthday', 'Cultural', 'Conference', 'Reception', 'Other'];
const STATUSES = ['upcoming', 'in_progress', 'completed', 'cancelled'];

export default function EventsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedClient, setSelectedClient] = useState("all");
  const [sortBy, setSortBy] = useState("date_desc");

  const [createOpen, setCreateOpen] = useState(false);
  
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [eventType, setEventType] = useState("");
  const [status, setStatus] = useState("upcoming");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue] = useState("");
  const [locationStr, setLocationStr] = useState("");
  const [notes, setNotes] = useState("");

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListEvents(undefined, {
    query: { queryKey: getListEventsQueryKey() }
  });
  
  const { data: clientsData } = useListClients();
  const clients = clientsData?.data || [];

  const createEvent = useCreateEvent();

  const isFiltered = searchQuery !== "" || selectedStatus !== "all" || selectedType !== "all" || selectedClient !== "all" || sortBy !== "date_desc";

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedStatus("all");
    setSelectedType("all");
    setSelectedClient("all");
    setSortBy("date_desc");
  };

  const filteredEvents = useMemo(() => {
    const raw = data?.data || [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = raw.filter((e) => {
      if (q) {
        const nameMatch = e.name?.toLowerCase().includes(q);
        const clientMatch = e.clientName?.toLowerCase().includes(q);
        const venueMatch = e.venue?.toLowerCase().includes(q);
        const locMatch = e.location?.toLowerCase().includes(q);
        const typeMatch = e.eventType?.toLowerCase().includes(q);
        if (!nameMatch && !clientMatch && !venueMatch && !locMatch && !typeMatch) {
          return false;
        }
      }

      if (selectedStatus !== "all" && e.status !== selectedStatus) {
        return false;
      }

      if (selectedType !== "all" && e.eventType !== selectedType) {
        return false;
      }

      if (selectedClient !== "all" && String(e.clientId) !== selectedClient) {
        return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case "date_asc":
          return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
        case "revenue_desc":
          return Number(b.totalRevenue || 0) - Number(a.totalRevenue || 0);
        case "revenue_asc":
          return Number(a.totalRevenue || 0) - Number(b.totalRevenue || 0);
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "date_desc":
        default:
          return new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime();
      }
    });
  }, [data?.data, searchQuery, selectedStatus, selectedType, selectedClient, sortBy]);

  const handleSubmit = () => {
    if (!name || !clientId || !eventType || !status || !eventDate) {
      toast({ title: "Validation Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    
    createEvent.mutate({
      data: {
        name,
        clientId: Number(clientId),
        eventType,
        status: status as any,
        eventDate,
        venue,
        location: locationStr,
        notes
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEventsQueryKey() });
        toast({ title: "Event created successfully" });
        setCreateOpen(false);
        // Reset form
        setName(""); setClientId(""); setEventType(""); setStatus("upcoming");
        setEventDate(""); setVenue(""); setLocationStr(""); setNotes("");
      },
      onError: (error) => {
        toast({ title: "Failed to create event", description: error.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events Ledger"
        description="Manage event productions and track their financial performance."
        actions={<Button onClick={() => setCreateOpen(true)}> <Plus className="mr-2 h-4 w-4" /> New Event </Button>}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add New Event</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
            <div className="space-y-2">
              <Label>Event Name *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Smith Wedding" />
            </div>
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Type *</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue placeholder="Select event type" /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status *</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(t => <SelectItem key={t} value={t}>{t.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Event Date *</Label>
              <Input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Venue</Label>
              <Input value={venue} onChange={e => setVenue(e.target.value)} placeholder="Venue name" />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input value={locationStr} onChange={e => setLocationStr(e.target.value)} placeholder="City, State" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional details..." />
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit} loading={createEvent.isPending}>
              Save Event
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
                placeholder="Search events, clients, venues, locations..." 
                className="pl-9 bg-background" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Filters & Sorting */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter */}
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[125px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Event Type Filter */}
              <Select value={selectedType} onValueChange={setSelectedType}>
                <SelectTrigger className="w-[130px] bg-background h-9 text-xs">
                  <SelectValue placeholder="Event Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Client Filter */}
              <Select value={selectedClient} onValueChange={setSelectedClient}>
                <SelectTrigger className="w-[135px] bg-background h-9 text-xs truncate">
                  <SelectValue placeholder="Client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clients</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Sort Control */}
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[155px] bg-background h-9 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date_desc">Newest Event</SelectItem>
                  <SelectItem value="date_asc">Oldest Event</SelectItem>
                  <SelectItem value="revenue_desc">Revenue: High → Low</SelectItem>
                  <SelectItem value="revenue_asc">Revenue: Low → High</SelectItem>
                  <SelectItem value="name_asc">Name: A → Z</SelectItem>
                  <SelectItem value="name_desc">Name: Z → A</SelectItem>
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
          <MobileList>
            {isLoading ? (
              <li><ListSkeleton rows={4} className="p-4" /></li>
            ) : filteredEvents.length === 0 ? (
              <li><EmptyState compact title={isFiltered ? "No events match your filters." : "No events found."} description={isFiltered ? "Try clearing a filter or the search." : undefined} /></li>
            ) : (
              filteredEvents.map((event) => (
                <MobileListItem
                  key={event.id}
                  href={`/events/${event.id}`}
                  title={event.name}
                  subtitle={`${event.clientName || "—"} · ${formatDate(event.eventDate)}`}
                  value={formatCurrency(event.totalRevenue)}
                  badge={<StatusBadge status={event.status} />}
                  meta={
                    <span className="flex items-center justify-between gap-2">
                      <span>Gross profit <span className="font-medium tabular-nums text-foreground">{formatCurrency(event.grossProfit)}</span></span>
                      <ProfitabilityBadge indicator={event.profitabilityIndicator} />
                    </span>
                  }
                />
              ))
            )}
          </MobileList>
          <div className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Gross Profit</TableHead>
                  <TableHead className="text-center">Profitability</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0"><TableSkeleton rows={5} cols={5} /></TableCell>
                  </TableRow>
                ) : filteredEvents.length > 0 ? (
                  filteredEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-medium">
                        <Link href={`/events/${event.id}`} className="hover:text-primary transition-colors">
                          {event.name}
                        </Link>
                        <div className="text-xs text-muted-foreground font-normal">{event.eventType}</div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/clients/${event.clientId}`} className="hover:underline">
                          {event.clientName || "—"}
                        </Link>
                      </TableCell>
                      <TableCell>{formatDate(event.eventDate)}</TableCell>
                      <TableCell><StatusBadge status={event.status} /></TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(event.totalRevenue)}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(event.grossProfit)}</TableCell>
                      <TableCell className="text-center">
                        <ProfitabilityBadge indicator={event.profitabilityIndicator} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/events/${event.id}`}>View</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0 hover:bg-transparent"><EmptyState compact title={isFiltered ? "No events match your filters." : "No events found."} description={isFiltered ? "Try clearing a filter or the search." : undefined} /></TableCell>
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
