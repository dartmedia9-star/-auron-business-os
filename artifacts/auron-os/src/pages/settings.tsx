import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGetSettings, getGetSettingsQueryKey, useUpdateSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });
  
  const updateSettings = useUpdateSettings();

  const [companyName, setCompanyName] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [gstRate, setGstRate] = useState("");
  
  const [excellentMargin, setExcellentMargin] = useState("");
  const [healthyMargin, setHealthyMargin] = useState("");
  const [warningMargin, setWarningMargin] = useState("");
  
  const [valuationTarget, setValuationTarget] = useState("");

  useEffect(() => {
    if (settings) {
      setCompanyName(settings.companyName || "");
      setGstNumber(settings.gstNumber || "");
      setGstRate(settings.gstRate ? String(settings.gstRate) : "18");
      
      setExcellentMargin(settings.excellentMarginThreshold ? String(settings.excellentMarginThreshold) : "40");
      setHealthyMargin(settings.healthyMarginThreshold ? String(settings.healthyMarginThreshold) : "25");
      setWarningMargin(settings.warningMarginThreshold ? String(settings.warningMarginThreshold) : "15");
      
      setValuationTarget(settings.valuationTarget ? String(settings.valuationTarget) : "900000000");
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      data: {
        companyName,
        gstNumber,
        gstRate: Number(gstRate),
        excellentMarginThreshold: Number(excellentMargin),
        healthyMarginThreshold: Number(healthyMargin),
        warningMarginThreshold: Number(warningMargin),
        valuationTarget: Number(valuationTarget)
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
        toast({ title: "Settings updated successfully" });
      },
      onError: (err) => {
        toast({ title: "Failed to update settings", description: err.message, variant: "destructive" });
      }
    });
  };

  if (isLoading) return <div className="p-8">Loading settings...</div>;

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
            <Input id="companyName" value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gstNumber">GST Number</Label>
            <Input id="gstNumber" value={gstNumber} onChange={e => setGstNumber(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="gstRate">Default GST Rate (%)</Label>
            <Input id="gstRate" type="number" value={gstRate} onChange={e => setGstRate(e.target.value)} />
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>Save Details</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profitability Thresholds</CardTitle>
          <CardDescription>Define margin percentage brackets for the visual indicators.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Excellent Margin (&ge;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={excellentMargin} onChange={e => setExcellentMargin(e.target.value)} />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Healthy Margin (&ge;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={healthyMargin} onChange={e => setHealthyMargin(e.target.value)} />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Warning Margin (&lt;)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" value={warningMargin} onChange={e => setWarningMargin(e.target.value)} />
                <span className="text-muted-foreground">%</span>
              </div>
            </div>
          </div>
          <Button variant="outline" onClick={handleSave} disabled={updateSettings.isPending}>Update Thresholds</Button>
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
            <Input type="number" value={valuationTarget} onChange={e => setValuationTarget(e.target.value)} />
            <p className="text-xs text-muted-foreground">Enter raw number (e.g. 900000000 for ₹90 Cr)</p>
          </div>
          <Button onClick={handleSave} disabled={updateSettings.isPending}>Save Targets</Button>
        </CardContent>
      </Card>
    </div>
  );
}
