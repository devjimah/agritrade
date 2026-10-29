import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link } from "react-router-dom";
import { MapPin, Pencil, Phone, Plus, Search, Sprout } from "lucide-react";
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
import { createFarmer, listFarmers, updateFarmer } from "@/services/farmers";
import type { Farmer, FarmerInput } from "@/services/farmers";

const emptyForm: FarmerInput = { fullName: "", phone: "", village: "", notes: "" };

export function FarmersPage() {
  const [farmers, setFarmers] = useState<Farmer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Farmer | null>(null);
  const [form, setForm] = useState<FarmerInput>(emptyForm);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const requestSeq = useRef(0);
  const prevSearch = useRef("");

  const load = useCallback(async (query: string, pageNum: number) => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setListError("");
    try {
      const data = await listFarmers({ search: query || undefined, page: pageNum });
      if (seq !== requestSeq.current) return;
      setFarmers(data.farmers);
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

  function openEdit(farmer: Farmer) {
    setEditing(farmer);
    setForm({
      fullName: farmer.fullName,
      phone: farmer.phone,
      village: farmer.village,
      notes: farmer.notes,
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
        await updateFarmer(editing._id, form);
      } else {
        await createFarmer(form);
      }
      setDialogOpen(false);
      await load(search, page);
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const setField = (field: keyof FarmerInput) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
            <Sprout className="h-4 w-4" /> Farmer ledger
          </div>
          <h2 className="mt-3 text-3xl font-semibold">Farmers</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {search ? `${total} matching records` : `${total} registered farmers`}
          </p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-1 h-4 w-4" /> Add farmer
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
          ) : loading && farmers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Loading...</p>
          ) : farmers.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {search ? "No farmers match your search." : "No farmers yet. Add your first farmer."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead className="hidden sm:table-cell">Village</TableHead>
                  <TableHead className="hidden md:table-cell">Notes</TableHead>
                  <TableHead className="w-16" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {farmers.map((farmer) => (
                  <TableRow key={farmer._id}>
                    <TableCell className="font-medium">
                      <Link to={`/farmers/${farmer._id}`} className="text-primary hover:underline">
                        {farmer.fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className="inline-flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {farmer.phone}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {farmer.village ? (
                        <span className="inline-flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          {farmer.village}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                      {farmer.notes || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(farmer)}
                        aria-label={`Edit ${farmer.fullName}`}
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
        title={editing ? "Edit farmer" : "Add farmer"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input id="fullName" required value={form.fullName} onChange={setField("fullName")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              required
              placeholder="0244123456"
              value={form.phone}
              onChange={setField("phone")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="village">Village</Label>
            <Input id="village" value={form.village} onChange={setField("village")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Input id="notes" value={form.notes} onChange={setField("notes")} />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editing ? "Save changes" : "Add farmer"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
