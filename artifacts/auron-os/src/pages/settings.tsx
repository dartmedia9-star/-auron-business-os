import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function SettingsPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">System Settings</h2>
        <p className="text-muted-foreground mt-1">Configure Auron Business OS parameters and thresholds.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Details</CardTitle>
          <CardDescription>Primary operating entity information.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input id="companyName" defaultValue="Auron Event Productions" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="currency">Base Currency</Label>
            <Input id="currency" defaultValue="INR (₹)" disabled />
          </div>
          <Button>Save Details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profitability Thresholds</CardTitle>
          <CardDescription>Define margin percentage brackets for the visual indicators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Excellent Margin (&ge;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue="40" />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Healthy Margin (&ge;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue="25" />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Warning Margin (&lt;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" defaultValue="15" />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <Button variant="outline">Update Thresholds</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Strategic Targets</CardTitle>
          <CardDescription>Valuation and efficiency goals.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Exit Valuation Target</Label>
            <Input type="number" defaultValue="900000000" />
            <p className="text-xs text-muted-foreground">Enter raw number (e.g. 900000000 for ₹90 Cr)</p>
          </div>
          <Button>Save Targets</Button>
        </CardContent>
      </Card>
    </div>
  );
}
