import { useListEmployees, getListEmployeesQueryKey } from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function TeamList() {
  const { data, isLoading } = useListEmployees({
    query: { queryKey: getListEmployeesQueryKey() }
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Team Management</h2>
          <p className="text-muted-foreground mt-1">Manage personnel, track productivity and associated revenue.</p>
        </div>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Team Member
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Events Assig.</TableHead>
                <TableHead className="text-right">Rev. Supported</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">Loading team...</TableCell>
                </TableRow>
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="font-medium">{employee.name}</TableCell>
                    <TableCell>{employee.role}</TableCell>
                    <TableCell>{employee.department}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={employee.isActive ? "default" : "secondary"}>
                        {employee.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center font-medium">{employee.eventsAssigned || 0}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{formatCurrency(employee.revenueSupported)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">No team members found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
