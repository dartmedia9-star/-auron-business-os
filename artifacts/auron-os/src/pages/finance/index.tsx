import { useGetFinanceSummary, getGetFinanceSummaryQueryKey } from "@workspace/api-client-react";
import { formatCurrency, formatPercentage } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowDown, ArrowUp, Landmark, Minus, Target, Wallet } from "lucide-react";

// Cycled per fund-account card so every account gets a distinct accent while
// keeping the original emerald/amber look for the first two accounts.
const FUND_CARD_STYLES = [
  { border: "border-l-emerald-500/50", iconBg: "bg-emerald-500/10", icon: "text-emerald-500", value: "text-emerald-500" },
  { border: "border-l-amber-500/50", iconBg: "bg-amber-500/10", icon: "text-amber-500", value: "text-amber-500" },
  { border: "border-l-sky-500/50", iconBg: "bg-sky-500/10", icon: "text-sky-500", value: "text-sky-500" },
  { border: "border-l-violet-500/50", iconBg: "bg-violet-500/10", icon: "text-violet-500", value: "text-violet-500" },
  { border: "border-l-rose-500/50", iconBg: "bg-rose-500/10", icon: "text-rose-500", value: "text-rose-500" },
];

const FUND_CARD_ICONS = [ArrowUp, Target, Landmark, Wallet];
import { useToast } from "@/hooks/use-toast";

export default function FinanceSummary() {
  const { data, isLoading } = useGetFinanceSummary(undefined, {
    query: { queryKey: getGetFinanceSummaryQueryKey() }
  });

  if (isLoading || !data) {
    return <div className="p-8">Loading finance data...</div>;
  }

  const fundAccounts = data.fundAccounts ?? [];
  const totalFunds = fundAccounts.reduce((sum, account) => sum + account.balance, 0);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">P&L Summary</h2>
          <p className="text-muted-foreground mt-1">Waterfall view of current financial performance.</p>
        </div>
      </div>

      <div className="space-y-4 pt-4">
        {/* Revenue */}
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <ArrowUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Total Revenue</h3>
                <p className="text-sm text-muted-foreground">Top line sales across all events</p>
              </div>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(data.revenue)}</div>
          </CardContent>
        </Card>

        {/* Direct Costs */}
        <Card className="border-l-4 border-l-red-500/50 shadow-sm ml-8">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-red-500/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Direct Costs (COGS)</h3>
                <p className="text-sm text-muted-foreground">Vendor expenses, material costs</p>
              </div>
            </div>
            <div className="text-xl font-bold text-red-500">-{formatCurrency(data.directCosts)}</div>
          </CardContent>
        </Card>

        {/* Gross Profit */}
        <Card className="border-l-4 border-l-primary shadow-md">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Minus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-primary">Gross Profit</h3>
                <p className="text-sm text-muted-foreground">Margin: {formatPercentage(data.grossMarginPct)}</p>
              </div>
            </div>
            <div className="text-3xl font-bold text-primary">{formatCurrency(data.grossProfit)}</div>
          </CardContent>
        </Card>

        {/* Operating Expenses */}
        <Card className="border-l-4 border-l-orange-500/50 shadow-sm ml-8">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <ArrowDown className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <h3 className="text-lg font-medium">Operating Expenses</h3>
                <p className="text-sm text-muted-foreground">Rent, payroll, marketing, admin</p>
              </div>
            </div>
            <div className="text-xl font-bold text-orange-500">-{formatCurrency(data.operatingExpenses)}</div>
          </CardContent>
        </Card>

        {/* EBITDA */}
        <Card className="border-l-4 border-l-emerald-500 shadow-md">
          <CardContent className="flex items-center justify-between p-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Minus className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-emerald-500">EBITDA</h3>
                <p className="text-sm text-muted-foreground">Margin: {formatPercentage(data.ebitdaMarginPct)}</p>
              </div>
            </div>
            <div className="text-3xl font-bold text-emerald-500">{formatCurrency(data.ebitda)}</div>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="bg-muted border-none shadow-inner mt-8">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="text-lg font-medium">Net Profit (After Tax/Depreciation)</h3>
              <p className="text-sm text-muted-foreground">Net Margin: {formatPercentage(data.netMarginPct)}</p>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(data.netProfit)}</div>
          </CardContent>
        </Card>

        {/* Capital & Funds — one card per fund account, straight from the API */}
        {fundAccounts.length === 0 ? (
          <Card className="border-l-4 border-l-muted shadow-sm ml-8">
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <h3 className="text-lg font-medium">No fund accounts yet</h3>
                <p className="text-sm text-muted-foreground">Create one under Fund Transfers → Add Fund Account.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          fundAccounts.map((account, index) => {
            const style = FUND_CARD_STYLES[index % FUND_CARD_STYLES.length];
            const Icon = FUND_CARD_ICONS[index % FUND_CARD_ICONS.length];

            return (
              <Card key={account.id} className={`border-l-4 ${style.border} shadow-sm ml-8`}>
                <CardContent className="flex items-center justify-between p-6">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-full ${style.iconBg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${style.icon}`} />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">{account.name}</h3>
                      <p className="text-sm text-muted-foreground">Fund account balance</p>
                    </div>
                  </div>
                  <div className={`text-3xl font-bold ${style.value}`}>{formatCurrency(account.balance)}</div>
                </CardContent>
              </Card>
            );
          })
        )}

        <Card className="bg-muted border-none shadow-inner mt-8">
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <h3 className="text-lg font-medium">Total Available Funds</h3>
              <p className="text-sm text-muted-foreground">Sum of all fund accounts</p>
            </div>
            <div className="text-2xl font-bold">{formatCurrency(totalFunds)}</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}