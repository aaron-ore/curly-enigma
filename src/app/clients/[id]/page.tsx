"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface ClientDetail {
  id: number;
  name: string;
  status: string;
  billing_type: string;
  payment_method: string;
  parent_client_id: number | null;
  parent_name: string | null;
  notes: string | null;
  rate_plans: any[];
  history: any[];
  children: any[];
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [deletingRateId, setDeletingRateId] = useState<number | null>(null);

  const fetchClient = () => {
    fetch(`/api/clients/${params.id}`)
      .then((r) => r.json())
      .then((d) => { setClient(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchClient(); }, [params.id]);

  if (loading) return <div className="text-slate-400 p-8">Loading...</div>;
  if (!client) return <div className="text-red-500 p-8">Client not found</div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/clients" className="text-sm text-slate-500 hover:text-slate-700">&larr; All Clients</Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{client.name}</h1>
          <div className="flex gap-2 mt-2">
            <span className={`badge status-${client.status}`}>{client.status}</span>
            <span className="badge bg-slate-100 text-slate-600">
              {client.billing_type === "auto_charge" ? "Auto Charge" : "Manual"}
            </span>
            <span className="badge bg-slate-100 text-slate-600 capitalize">{client.payment_method}</span>
          </div>
        </div>
        <button className="btn-secondary" onClick={() => setEditing(!editing)}>
          {editing ? "Cancel Edit" : "Edit Client"}
        </button>
      </div>

      {/* Edit Form */}
      {editing && <EditClientForm client={client} onSaved={() => { setEditing(false); fetchClient(); }} />}

      {/* Parent/Child Info */}
      {client.parent_client_id && (
        <div className="glass-card p-4 border-l-4 border-l-cyan-500">
          <p className="text-sm text-slate-600">
            <strong>Consolidated into:</strong>{" "}
            <Link href={`/clients/${client.parent_client_id}`} className="text-[#0066FF] hover:underline">
              {client.parent_name}
            </Link>
            {" "}— this client is never billed directly.
          </p>
        </div>
      )}

      {client.children.length > 0 && (
        <div className="glass-card p-4 border-l-4 border-l-purple-500">
          <p className="text-sm font-medium text-slate-700 mb-2">Child accounts consolidated under this client:</p>
          <div className="flex flex-wrap gap-2">
            {client.children.map((child: any) => (
              <Link key={child.id} href={`/clients/${child.id}`} className="badge bg-purple-50 text-purple-700 hover:bg-purple-100">
                {child.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {client.notes && (
        <div className="glass-card p-4">
          <p className="text-sm font-medium text-slate-700 mb-1">Notes</p>
          <p className="text-sm text-slate-600 whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {/* Rate Plans */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Rate Plans</h2>
          <button className="btn-primary text-sm" onClick={() => setShowRateForm(!showRateForm)}>
            {showRateForm ? "Cancel" : "Add New Rate"}
          </button>
        </div>

        {showRateForm && (
          <AddRatePlanForm clientId={client.id} onCreated={() => { setShowRateForm(false); fetchClient(); }} />
        )}

        {client.rate_plans.length === 0 ? (
          <p className="text-sm text-red-500">No rate plan configured. Add one to enable billing.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Effective</th>
                <th>Model</th>
                <th>Rate</th>
                <th>Cap</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {client.rate_plans.map((rp: any) => (
                <tr key={rp.id}>
                  <td className="text-sm">
                    {rp.effective_start} {rp.effective_end ? `to ${rp.effective_end}` : "(current)"}
                  </td>
                  <td className="text-sm capitalize">{rp.pricing_model.replace("_", " ")}</td>
                  <td className="text-sm">
                    {rp.pricing_model === "flat_per_unit"
                      ? `$${rp.flat_rate}/unit`
                      : `$${rp.tier_1_rate} x${rp.tier_1_unit_count}, then $${rp.tier_2_rate}`}
                  </td>
                  <td className="text-sm">{rp.cap_amount ? `$${rp.cap_amount}/${rp.cap_scope || "client"}` : "—"}</td>
                  <td className="text-sm text-slate-500">{rp.notes || "—"}</td>
                  <td>
                    {deletingRateId === rp.id ? (
                      <div className="flex gap-1">
                        <button
                          className="text-[10px] px-2 py-0.5 bg-red-100 text-red-700 rounded font-medium hover:bg-red-200"
                          onClick={async () => {
                            const res = await fetch(`/api/rate-plans?id=${rp.id}`, { method: "DELETE" });
                            if (res.ok) { setDeletingRateId(null); fetchClient(); }
                          }}
                        >
                          Confirm
                        </button>
                        <button
                          className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                          onClick={() => setDeletingRateId(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                        onClick={() => setDeletingRateId(rp.id)}
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Usage & Charge History */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Billing History</h2>
        {client.history.length === 0 ? (
          <p className="text-sm text-slate-500">No billing history yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Units</th>
                <th>Source</th>
                <th>Calculated</th>
                <th>Charged</th>
                <th>Date Charged</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {client.history.map((h: any, i: number) => (
                <tr key={i}>
                  <td className="text-sm">{formatMonth(h.billing_month)}</td>
                  <td className="text-sm font-medium">{h.active_units}</td>
                  <td><span className="badge bg-slate-100 text-slate-600 text-xs">{h.source}</span></td>
                  <td className="text-sm">${Number(h.calculated_total).toFixed(2)}</td>
                  <td className="text-sm">{h.amount_charged ? `$${Number(h.amount_charged).toFixed(2)}` : "—"}</td>
                  <td className="text-sm text-slate-500">{h.date_charged || "—"}</td>
                  <td>{h.status && <span className={`badge status-${h.status}`}>{h.status}</span>}</td>
                  <td>
                    {h.charge_id && h.status === "pending" && (
                      <button
                        className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                        onClick={async () => {
                          await fetch("/api/charges", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: h.charge_id, status: "charged",
                              amount_charged: h.calculated_total,
                              date_charged: new Date().toISOString().split("T")[0],
                            }),
                          });
                          fetchClient();
                        }}
                      >
                        Mark Charged
                      </button>
                    )}
                    {h.charge_id && h.status === "charged" && (
                      <button
                        className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 font-medium"
                        onClick={async () => {
                          await fetch("/api/charges", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              id: h.charge_id, status: "paid",
                              amount_received: h.amount_charged || h.calculated_total,
                              date_received: new Date().toISOString().split("T")[0],
                            }),
                          });
                          fetchClient();
                        }}
                      >
                        Mark Paid
                      </button>
                    )}
                    {h.charge_id && h.status === "paid" && (
                      <span className="text-[10px] text-emerald-600 font-medium">Paid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function EditClientForm({ client, onSaved }: { client: ClientDetail; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: client.name,
    status: client.status,
    billing_type: client.billing_type,
    payment_method: client.payment_method,
    notes: client.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`/api/clients/${client.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
        <input className="input-field" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
        <textarea className="input-field" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-primary">Save Changes</button>
      </div>
    </form>
  );
}

function AddRatePlanForm({ clientId, onCreated }: { clientId: number; onCreated: () => void }) {
  const [form, setForm] = useState({
    pricing_model: "flat_per_unit",
    effective_start: new Date().toISOString().split("T")[0],
    flat_rate: "",
    tier_1_rate: "",
    tier_1_unit_count: "",
    tier_2_rate: "",
    cap_amount: "",
    cap_scope: "",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/rate-plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        effective_start: form.effective_start,
        pricing_model: form.pricing_model,
        flat_rate: form.flat_rate ? parseFloat(form.flat_rate) : null,
        tier_1_rate: form.tier_1_rate ? parseFloat(form.tier_1_rate) : null,
        tier_1_unit_count: form.tier_1_unit_count ? parseInt(form.tier_1_unit_count) : null,
        tier_2_rate: form.tier_2_rate ? parseFloat(form.tier_2_rate) : null,
        cap_amount: form.cap_amount ? parseFloat(form.cap_amount) : null,
        cap_scope: form.cap_scope || null,
        notes: form.notes || null,
      }),
    });
    onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-blue-50/50 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Pricing Model</label>
        <select className="input-field" value={form.pricing_model} onChange={(e) => setForm({ ...form, pricing_model: e.target.value })}>
          <option value="flat_per_unit">Flat Per Unit</option>
          <option value="tiered_per_unit">Tiered Per Unit</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Effective Start</label>
        <input type="date" className="input-field" value={form.effective_start} onChange={(e) => setForm({ ...form, effective_start: e.target.value })} required />
      </div>
      {form.pricing_model === "flat_per_unit" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Flat Rate ($)</label>
          <input type="number" step="0.01" className="input-field" value={form.flat_rate} onChange={(e) => setForm({ ...form, flat_rate: e.target.value })} />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tier 1 Rate ($)</label>
            <input type="number" step="0.01" className="input-field" value={form.tier_1_rate} onChange={(e) => setForm({ ...form, tier_1_rate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tier 1 Units</label>
            <input type="number" className="input-field" value={form.tier_1_unit_count} onChange={(e) => setForm({ ...form, tier_1_unit_count: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tier 2 Rate ($)</label>
            <input type="number" step="0.01" className="input-field" value={form.tier_2_rate} onChange={(e) => setForm({ ...form, tier_2_rate: e.target.value })} />
          </div>
        </>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Cap Amount ($)</label>
        <input type="number" step="0.01" className="input-field" value={form.cap_amount} onChange={(e) => setForm({ ...form, cap_amount: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Cap Scope</label>
        <select className="input-field" value={form.cap_scope} onChange={(e) => setForm({ ...form, cap_scope: e.target.value })}>
          <option value="">None</option>
          <option value="per_client">Per Client</option>
          <option value="per_location">Per Location</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
        <input className="input-field" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="flex items-end">
        <button type="submit" className="btn-primary text-sm">Add Rate Plan</button>
      </div>
    </form>
  );
}

function formatMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
