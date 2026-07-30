"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Client {
  id: number;
  name: string;
  status: string;
  billing_type: string;
  payment_method: string;
  parent_client_id: number | null;
  parent_name: string | null;
  pricing_model: string | null;
  flat_rate: number | null;
  tier_1_rate: number | null;
  tier_1_unit_count: number | null;
  tier_2_rate: number | null;
  cap_amount: number | null;
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const fetchClients = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    fetch(`/api/clients?${params}`)
      .then((r) => r.json())
      .then((d) => { setClients(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchClients(); }, [search, statusFilter]);

  const formatRate = (c: Client): string => {
    if (!c.pricing_model) return "No rate";
    if (c.pricing_model === "flat_per_unit") {
      let s = `$${c.flat_rate}/unit`;
      if (c.cap_amount) s += ` (cap $${c.cap_amount})`;
      return s;
    }
    let s = `$${c.tier_1_rate} x${c.tier_1_unit_count}, then $${c.tier_2_rate}`;
    if (c.cap_amount) s += ` (cap $${c.cap_amount})`;
    return s;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">{clients.length} clients</p>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm(true)}>
          Add Client
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search clients..."
          className="input-field max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input-field max-w-[160px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </select>
      </div>

      {/* Add Client Form */}
      {showAddForm && (
        <AddClientForm
          clients={clients}
          onClose={() => setShowAddForm(false)}
          onCreated={() => { setShowAddForm(false); fetchClients(); }}
        />
      )}

      {/* Client Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Status</th>
                <th>Billing</th>
                <th>Payment</th>
                <th>Rate</th>
                <th>Parent</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/clients/${c.id}`} className="font-medium text-[#0066FF] hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td><span className={`badge status-${c.status}`}>{c.status}</span></td>
                  <td className="text-sm">{c.billing_type === "auto_charge" ? "Auto" : "Manual"}</td>
                  <td className="text-sm capitalize">{c.payment_method}</td>
                  <td className="text-sm">{formatRate(c)}</td>
                  <td className="text-sm text-slate-500">{c.parent_name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AddClientForm({ clients, onClose, onCreated }: {
  clients: Client[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    name: "", status: "active", billing_type: "manual",
    payment_method: "other", parent_client_id: "", notes: "",
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        parent_client_id: form.parent_client_id ? parseInt(form.parent_client_id) : null,
      }),
    });
    if (res.ok) onCreated();
    setSaving(false);
  };

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-semibold mb-4">Add New Client</h3>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
          <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Status</label>
          <select className="input-field" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Billing Type</label>
          <select className="input-field" value={form.billing_type} onChange={(e) => setForm({ ...form, billing_type: e.target.value })}>
            <option value="manual">Manual</option>
            <option value="auto_charge">Auto Charge</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
          <select className="input-field" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
            <option value="card">Card</option>
            <option value="ach">ACH</option>
            <option value="check">Check</option>
            <option value="wire">Wire</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Parent Client</label>
          <select className="input-field" value={form.parent_client_id} onChange={(e) => setForm({ ...form, parent_client_id: e.target.value })}>
            <option value="">None (independent)</option>
            {clients.filter(c => !c.parent_client_id).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
          <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <div className="md:col-span-2 flex gap-3">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? "Saving..." : "Create Client"}
          </button>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
