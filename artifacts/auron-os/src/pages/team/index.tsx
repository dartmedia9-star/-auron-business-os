import { useState } from "react";
import { 
  useListEmployees, 
  getListEmployeesQueryKey,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee
} from "@workspace/api-client-react";
import { formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

const DEPARTMENTS = ['Operations', 'Sales', 'Creative', 'Finance', 'Admin', 'Tech', 'Other'];

export default function TeamList() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useListEmployees({
    query: { queryKey: getListEmployeesQueryKey() }
  });

  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const deleteEmployee = useDeleteEmployee();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);

  // Form State
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("Operations");
  const [joiningDate, setJoiningDate] = useState("");
  const [salary, setSalary] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [isActive, setIsActive] = useState("true");

  const resetForm = () => {
    setName(""); setRole(""); setDepartment("Operations"); setJoiningDate("");
    setSalary(""); setResponsibilities(""); setIsActive("true");
  };

  const openEdit = (employee: any) => {
    setSelectedEmployee(employee);
    setName(employee.name);
    setRole(employee.role);
    setDepartment(employee.department);
    setJoiningDate(employee.joiningDate ? employee.joiningDate.split('T')[0] : "");
    setSalary(employee.salary ? String(employee.salary) : "");
    setResponsibilities(employee.responsibilities || "");
    setIsActive(employee.isActive ? "true" : "false");
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!name || !role || !department || !joiningDate) {
      toast({ title: "Validation Error", description: "Name, role, department, and joining date are required", variant: "destructive" });
      return;
    }
    createEmployee.mutate({
      data: {
        name, role, department, joiningDate,
        salary: salary ? Number(salary) : undefined,
        responsibilities,
        isActive: isActive === "true"
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: "Team member added" });
        setCreateOpen(false);
        resetForm();
      },
      onError: (err) => toast({ title: "Failed to add team member", description: err.message, variant: "destructive" })
    });
  };

  const handleUpdate = () => {
    if (!selectedEmployee) return;
    if (!name || !role || !department || !joiningDate) return;
    
    updateEmployee.mutate({
      id: selectedEmployee.id,
      data: {
        name, role, department, joiningDate,
        salary: salary ? Number(salary) : undefined,
        responsibilities,
        isActive: isActive === "true"
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: "Team member updated" });
        setEditOpen(false);
      },
      onError: (err) => toast({ title: "Failed to update team member", description: err.message, variant: "destructive" })
    });
  };

  const handleDelete = () => {
    if (!selectedEmployee) return;
    deleteEmployee.mutate({ id: selectedEmployee.id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() });
        toast({ title: "Team member deleted" });
        setDeleteOpen(false);
      },
      onError: (err) => toast({ title: "Failed to delete team member", description: err.message, variant: "destructive" })
    });
  };

  const FormContent = (
    <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-2">
      <div className="space-y-2">
        <Label>Name *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Role *</Label>
          <Input value={role} onChange={e => setRole(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Department *</Label>
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger><SelectValue placeholder="Select dept" /></SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Joining Date *</Label>
          <Input type="date" value={joiningDate} onChange={e => setJoiningDate(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Salary</Label>
          <Input type="number" inputMode="decimal" value={salary} onChange={e => setSalary(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={isActive} onValueChange={setIsActive}>
          <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Responsibilities</Label>
        <Textarea value={responsibilities} onChange={e => setResponsibilities(e.target.value)} />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Team Management</h2>
          <p className="text-muted-foreground mt-1">Manage personnel, track productivity and associated revenue.</p>
        </div>
        <Button onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> Add Team Member
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Events Assig.</TableHead>
                  <TableHead className="text-right">Rev. Supported</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center">Loading team...</TableCell>
                  </TableRow>
                ) : data && data.length > 0 ? (
                  data.map((employee) => (
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
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(employee)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { setSelectedEmployee(employee); setDeleteOpen(true); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No team members found.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={createEmployee.isPending}>
              {createEmployee.isPending ? "Saving..." : "Save Member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90dvh] flex flex-col sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Team Member</DialogTitle>
          </DialogHeader>
          {FormContent}
          <DialogFooter className="shrink-0 pt-4 border-t">
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleUpdate} disabled={updateEmployee.isPending}>
              {updateEmployee.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team Member?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this team member? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteEmployee.isPending ? "Deleting..." : "Delete Member"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
