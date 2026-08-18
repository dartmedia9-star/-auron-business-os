import { useListLeads, useGetPipelineSummary, getListLeadsQueryKey, getGetPipelineSummaryQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatCompactCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Target, TrendingUp, ListTodo } from "lucide-react";
import { cn } from "@/lib/utils";

const PIPELINE_STAGES = [
  { id: "new", label: "New", color: "bg-slate-500/10 text-slate-500 border-slate-500/20" },
  { id: "contacted", label: "Contacted", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  { id: "qualified", label: "Qualified", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { id: "requirement_received", label: "Req Received", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  { id: "proposal_sent", label: "Proposal Sent", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  { id: "negotiation", label: "Negotiation", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  { id: "won", label: "Won", color: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" },
];

export default function LeadsPipeline() {
  const { data: summary } = useGetPipelineSummary({
    query: { queryKey: getGetPipelineSummaryQueryKey() }
  });

  const { data: leadsData } = useListLeads(undefined, {
    query: { queryKey: getListLeadsQueryKey() }
  });

  const leads = leadsData?.data || [];

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Sales Pipeline</h2>
          <p className="text-muted-foreground mt-1">Track deals from lead to closed-won.</p>
        </div>
      </div>

      {summary && (
        <div className="grid gap-4 md:grid-cols-4 shrink-0">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Pipeline</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCompactCurrency(summary.pipelineValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.totalLeads} active deals</p>
            </CardContent>
          </Card>
          <Card className="border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-primary">Weighted Pipeline</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{formatCompactCurrency(summary.weightedPipeline)}</div>
              <p className="text-xs text-muted-foreground mt-1">Probability adjusted</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Win Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPercentage(summary.winRate)}</div>
              <p className="text-xs text-muted-foreground mt-1">{summary.wonDeals} won deals</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Avg Deal Size</CardTitle>
              <ListTodo className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCompactCurrency(summary.avgDealSize)}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max h-full">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leads.filter(l => l.status === stage.id);
            const stageValue = stageLeads.reduce((sum, l) => sum + (l.expectedValue || 0), 0);
            
            return (
              <div key={stage.id} className="w-80 flex flex-col bg-muted/30 rounded-lg border">
                <div className="p-3 border-b flex items-center justify-between bg-card rounded-t-lg">
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
                    <Card key={lead.id} className="cursor-pointer hover:border-primary/50 transition-colors shadow-sm">
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
    </div>
  );
}
