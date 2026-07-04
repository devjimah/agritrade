import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { MapPin, Pencil, Phone, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/services/api";
import { createCustomer, listCustomers, updateCustomer } from "@/services/customers";
import type { Customer, CustomerInput } from "@/services/customers";

const emptyForm: CustomerInput = { fullName: "", phone: "", location: "", notes: "" };

export function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerInput>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const requestSeq = useRef(0);
  const prevSearch = useRef("");

  const load = useCallback(async (query: string, pageNum: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setListError("");
    try {
      const data = await listCustomers({ search: query || undefined, page: pageNum });
      if (seq !== requestSeq.current) return;
      setCustomers(data.customers);
      setTotal(data.total);
      setPages(data.pages);
      setLoading(false);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      setListError(getApiErrorMessage(err));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const searchChanged = prevSearch.current !== search;
    prevSearch.current = search;
    const t = setTimeout(() => load(search, page), searchChanged ? 300 : 0);
    return () => clearTimeout(t);
  }, [search, page, load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setFormError("");
    setDialogOpen(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setForm({
      fullName: customer.fullName,
      phone: customer.phone,
      location: customer.location,
      notes: customer.notes,
    });
    setFormError("");
    setDialogOpen(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setFormError("");
    try {
      if (editing) {
        await updateCustomer(editing._id, form);
      } else {
        await createCustomer(form);
      }
      setDialogOpen(false);
      await load(search, page);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const setField = (field: keyof CustomerInput) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Users className="h-4 w-4" /> Customer book
          </div>
          <h2 className="mt-3 text-3xl font-semibold">Customers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search ? `${total} matching records` : `${total} registered customers`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add customer
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="bg-white pl-9"
        />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {listError ? (
            <p className="p-6 text-sm text-red-600">{listError}</p>
          ) : loading && customers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : customers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {search
                ? "No customers match your search."
                : "No customers yet. Add your first customer."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer._id}>
                    <TableCell className="font-medium">
                      <Link
                        to={`/customers/${customer._id}`}
                        className="text-primary hover:underline"
                      >
                        {customer.fullName}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {customer.phone}
                      </span>
                    </TableCell>
                    <TableCell>
                      {customer.location ? (
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {customer.location}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {customer.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(customer)}
                        aria-label={`Edit ${customer.fullName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit customer" : "Add customer"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="custFullName">Full name</Label>
            <Input
              id="custFullName"
              required
              value={form.fullName}
              onChange={setField("fullName")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custPhone">Phone</Label>
            <Input
              id="custPhone"
              required
              placeholder="0551234567"
              value={form.phone}
              onChange={setField("phone")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custLocation">Location</Label>
            <Input id="custLocation" value={form.location} onChange={setField("location")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="custNotes">Notes</Label>
            <Input id="custNotes" value={form.notes} onChange={setField("notes")} />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add customer"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
