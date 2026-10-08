import { useGetPerformanceYears } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

export default function PerformanceIndex() {
  const { data, isLoading } = useGetPerformanceYears();

  const years = data?.years ?? [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Performance</h2>
        <p className="text-muted-foreground mt-1">
          Financial performance history and drill-down analytics.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
      ) : years.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No financial data yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Create events, revenue records, or expenses to see performance data.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Select a year to view financial performance:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {years.map((year) => (
              <Link key={year} href={`/performance/${year}`}>
                <Card className="cursor-pointer hover:bg-muted/50 transition-colors group">
                  <CardContent className="flex items-center justify-between p-6">
                    <div className="flex items-center gap-3">
                      <BarChart3 className="h-6 w-6 text-primary" />
                      <span className="text-2xl font-bold">{year}</span>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
