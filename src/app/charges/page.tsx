"use client";

import { useEffect, useState } from "react";

interface Charge {
  id: number;
  client_id: number;
  client_name: string;
  billing_type: string;
  billing_month: string;
  calculated_total: number;
  amount_charged: number | null;
  date_charged: string | null;
  payment_method_used: string | null;
  status: string;
  variance_reason: string | null;
  amount_received: number | null;
  date_received: string | null;
  notes: string | null;
}

export default function ChargesPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchCharges = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (monthFilter) params.set("month", monthFilter + "-01");
    fetch(`/api/charges?${params}`)
      .then((r) => r.json())
      .then((d) => { setCharges(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchCharges(); }, [statusFilter, monthFilter]);

  const handleStatusUpdate = async (charge: Charge, newStatus: string, extra?: any) => {
    const body: any = { id: charge.id, status: newStatus, ...extra };

    // If marking as charged, default amount_charged to calculated_total
    if (newStatus === "charged" && !body.amount_charged) {
      body.amount_charged = charge.calculated_total;
      body.date_charged = new Date().toISOString().split("T")[0];
    }

    const res = await fetch("/api/charges", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      fetchCharges();
      setEditingId(null);
    } else {
      const err = await res.json();
      alert(err.error || "Update failed");
    }
  };

  const totalCalculated = charges.reduce((s, c) => s + Number(c.calculated_total), 0);
  const totalCharged = charges.reduce((s, c) => s + (Number(c.amount_charged) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Charges</h1>
        <p className="text-sm text-slate-500 mt-1">Track and update charge statuses across all clients</p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
          <select className="input-field" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="charged">Charged</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="disputed">Disputed</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Month</label>
          <input type="month" className="input-field" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} />
        </div>
        <div className="ml-auto text-sm text-slate-600">
          <span className="mr-4">Calculated: <strong>${totalCalculated.toFixed(2)}</strong></span>
          <span>Charged: <strong>${totalCharged.toFixed(2)}</strong></span>
        </div>
      </div>

      {/* Charges Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading charges...</div>
        ) : charges.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No charges found. Run a billing cycle first.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Month</th>
                <th>Calculated</th>
                <th>Charged</th>
                <th>Date Charged</th>
                <th>Method</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((ch) => (
                <tr key={ch.id}>
                  <td className="font-medium text-sm">{ch.client_name}</td>
                  <td className="text-sm">{formatMonth(ch.billing_month)}</td>
                  <td className="text-sm">${Number(ch.calculated_total).toFixed(2)}</td>
                  <td className="text-sm">
                    {ch.amount_charged !== null ? `$${Number(ch.amount_charged).toFixed(2)}` : "—"}
                  </td>
                  <td className="text-sm text-slate-500">{ch.date_charged || "—"}</td>
                  <td className="text-sm capitalize">{ch.payment_method_used || "—"}</td>
                  <td><span className={`badge status-${ch.status}`}>{ch.status}</span></td>
                  <td>
                    {editingId === ch.id ? (
                      <ChargeEditForm charge={ch} onSave={handleStatusUpdate} onCancel={() => setEditingId(null)} />
                    ) : (
                      <div className="flex gap-1">
                        {ch.status === "pending" && (
                          <button
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                            onClick={() => handleStatusUpdate(ch, "charged")}
                          >
                            Mark Charged
                          </button>
                        )}
                        {ch.status === "charged" && (
                          <button
                            className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                            onClick={() => handleStatusUpdate(ch, "paid", {
                              amount_received: ch.amount_charged,
                              date_received: new Date().toISOString().split("T")[0],
                            })}
                          >
                            Mark Paid
                          </button>
                        )}
                        <button
                          className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
                          onClick={() => setEditingId(ch.id)}
                        >
                          Edit
                        </button>
                      </div>
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

function ChargeEditForm({ charge, onSave, onCancel }: {
  charge: Charge;
  onSave: (charge: Charge, status: string, extra: any) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    status: charge.status,
    amount_charged: charge.amount_charged?.toString() || charge.calculated_total.toString(),
    date_charged: charge.date_charged || new Date().toISOString().split("T")[0],
    payment_method_used: charge.payment_method_used || "card",
    variance_reason: charge.variance_reason || "",
    notes: charge.notes || "",
  });

  return (
    <div className="flex flex-col gap-2 min-w-[200px]">
      <select className="input-field text-xs" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option value="pending">Pending</option>
        <option value="charged">Charged</option>
        <option value="paid">Paid</option>
        <option value="overdue">Overdue</option>
        <option value="disputed">Disputed</option>
        <option value="waived">Waived</option>
      </select>
      <input type="number" step="0.01" className="input-field text-xs" placeholder="Amount"
        value={form.amount_charged} onChange={(e) => setForm({ ...form, amount_charged: e.target.value })} />
      <input type="date" className="input-field text-xs"
        value={form.date_charged} onChange={(e) => setForm({ ...form, date_charged: e.target.value })} />
      <select className="input-field text-xs" value={form.payment_method_used} onChange={(e) => setForm({ ...form, payment_method_used: e.target.value })}>
        <option value="card">Card</option>
        <option value="ach">ACH</option>
        <option value="check">Check</option>
        <option value="wire">Wire</option>
        <option value="other">Other</option>
      </select>
      {parseFloat(form.amount_charged) !== Number(charge.calculated_total) && (
        <input className="input-field text-xs" placeholder="Variance reason (required)"
          value={form.variance_reason} onChange={(e) => setForm({ ...form, variance_reason: e.target.value })} />
      )}
      <div className="flex gap-1">
        <button className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded" onClick={() => {
          onSave(charge, form.status, {
            amount_charged: parseFloat(form.amount_charged),
            date_charged: form.date_charged,
            payment_method_used: form.payment_method_used,
            variance_reason: form.variance_reason || null,
            notes: form.notes || null,
          });
        }}>Save</button>
        <button className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function formatMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
