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
  display_status: string;
  variance_reason: string | null;
  amount_received: number | null;
  date_received: string | null;
  notes: string | null;
}

export default function ChargesPage() {
  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [notesEditId, setNotesEditId] = useState<number | null>(null);
  const [notesValue, setNotesValue] = useState("");

  const fetchCharges = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (dateFrom) params.set("date_from", dateFrom + "-01");
    if (dateTo) params.set("date_to", dateTo + "-28");
    fetch(`/api/charges?${params}`)
      .then((r) => r.json())
      .then((d) => { setCharges(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchCharges(); }, [statusFilter, dateFrom, dateTo]);

  const handleStatusUpdate = async (charge: Charge, newStatus: string, extra?: any) => {
    const body: any = { id: charge.id, status: newStatus, ...extra };

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

  const saveNotes = async (chargeId: number) => {
    const charge = charges.find((c) => c.id === chargeId);
    if (!charge) return;
    await fetch("/api/charges", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: chargeId, status: charge.status, notes: notesValue }),
    });
    setNotesEditId(null);
    fetchCharges();
  };

  const totalCalculated = charges.reduce((s, c) => s + Number(c.calculated_total), 0);
  const totalCharged = charges.reduce((s, c) => s + (Number(c.amount_charged) || 0), 0);
  const overdueCharges = charges.filter((c) => c.display_status === "overdue");
  const pendingCharges = charges.filter((c) => c.display_status === "pending");

  const getStatusBadge = (displayStatus: string) => {
    const styles: Record<string, string> = {
      pending: "bg-amber-100 text-amber-700",
      overdue: "bg-red-100 text-red-700",
      charged: "bg-blue-100 text-blue-700",
      paid: "bg-emerald-100 text-emerald-700",
      disputed: "bg-purple-100 text-purple-700",
      waived: "bg-slate-100 text-slate-500",
      consolidated: "bg-cyan-100 text-cyan-700",
    };
    return styles[displayStatus] || "bg-slate-100 text-slate-600";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing History</h1>
          <p className="text-sm text-slate-500 mt-0.5">Track charges, payments, and collections</p>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-3 border-l-4 border-l-[#0066FF]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Billed</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">${totalCalculated.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card p-3 border-l-4 border-l-emerald-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Collected</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">${totalCharged.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card p-3 border-l-4 border-l-red-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Overdue (60+ days)</p>
          <p className="text-xl font-bold text-red-600 mt-0.5">{overdueCharges.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            ${overdueCharges.reduce((s, c) => s + Number(c.calculated_total), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="glass-card p-3 border-l-4 border-l-amber-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Pending</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{pendingCharges.length}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">
            ${pendingCharges.reduce((s, c) => s + Number(c.calculated_total), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Status</label>
          <select className="input-field !py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="overdue">Overdue (60+ days)</option>
            <option value="charged">Charged</option>
            <option value="paid">Paid</option>
            <option value="disputed">Disputed</option>
            <option value="waived">Waived</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">From</label>
          <input type="month" className="input-field !py-1.5 text-sm" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">To</label>
          <input type="month" className="input-field !py-1.5 text-sm" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        {(dateFrom || dateTo || statusFilter) && (
          <button
            className="text-xs text-slate-500 hover:text-slate-700 underline pb-1"
            onClick={() => { setDateFrom(""); setDateTo(""); setStatusFilter(""); }}
          >
            Clear filters
          </button>
        )}
        <div className="ml-auto text-xs text-slate-500">
          {charges.length} records
        </div>
      </div>

      {/* Charges Table */}
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-5 h-5 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-slate-500 text-sm">Loading...</span>
          </div>
        ) : charges.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">No charges found for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Month</th>
                  <th>Calculated</th>
                  <th>Charged</th>
                  <th>Date Charged</th>
                  <th>Status</th>
                  <th>Notes / Invoice</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {charges.map((ch) => (
                  <tr key={ch.id} className={ch.display_status === "overdue" ? "bg-red-50/40" : ""}>
                    <td className="font-medium text-sm">{ch.client_name}</td>
                    <td className="text-sm">{formatMonth(ch.billing_month)}</td>
                    <td className="text-sm font-medium">${Number(ch.calculated_total).toFixed(2)}</td>
                    <td className="text-sm">
                      {ch.amount_charged !== null ? `$${Number(ch.amount_charged).toFixed(2)}` : "—"}
                    </td>
                    <td className="text-sm text-slate-500">{ch.date_charged ? formatDate(ch.date_charged) : "—"}</td>
                    <td>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${getStatusBadge(ch.display_status)}`}>
                        {ch.display_status === "overdue" ? "OVERDUE" : ch.display_status}
                      </span>
                      {ch.display_status === "overdue" && (
                        <p className="text-[9px] text-red-500 mt-0.5">{getDaysOverdue(ch.billing_month)} days</p>
                      )}
                    </td>
                    <td className="max-w-[180px]">
                      {notesEditId === ch.id ? (
                        <div className="flex gap-1">
                          <input
                            type="text"
                            className="input-field !py-0.5 !px-2 text-xs flex-1"
                            placeholder="Invoice #, notes..."
                            value={notesValue}
                            onChange={(e) => setNotesValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveNotes(ch.id); }}
                            autoFocus
                          />
                          <button className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded" onClick={() => saveNotes(ch.id)}>
                            Save
                          </button>
                          <button className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded" onClick={() => setNotesEditId(null)}>
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          className="text-xs text-left text-slate-500 hover:text-slate-700 w-full truncate"
                          onClick={() => { setNotesEditId(ch.id); setNotesValue(ch.notes || ""); }}
                          title={ch.notes || "Click to add notes/invoice #"}
                        >
                          {ch.notes || <span className="text-slate-300 italic">+ Add note</span>}
                        </button>
                      )}
                    </td>
                    <td>
                      {editingId === ch.id ? (
                        <ChargeEditForm charge={ch} onSave={handleStatusUpdate} onCancel={() => setEditingId(null)} />
                      ) : (
                        <div className="flex gap-1">
                          {(ch.display_status === "pending" || ch.display_status === "overdue") && (
                            <button
                              className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium"
                              onClick={() => handleStatusUpdate(ch, "charged")}
                            >
                              Charged
                            </button>
                          )}
                          {ch.status === "charged" && (
                            <button
                              className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded hover:bg-emerald-200 font-medium"
                              onClick={() => handleStatusUpdate(ch, "paid", {
                                amount_received: ch.amount_charged,
                                date_received: new Date().toISOString().split("T")[0],
                              })}
                            >
                              Paid
                            </button>
                          )}
                          <button
                            className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded hover:bg-slate-200"
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
          </div>
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
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      <select className="input-field !py-0.5 text-xs" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
        <option value="pending">Pending</option>
        <option value="charged">Charged</option>
        <option value="paid">Paid</option>
        <option value="disputed">Disputed</option>
        <option value="waived">Waived</option>
      </select>
      <input type="number" step="0.01" className="input-field !py-0.5 text-xs" placeholder="Amount"
        value={form.amount_charged} onChange={(e) => setForm({ ...form, amount_charged: e.target.value })} />
      <input type="date" className="input-field !py-0.5 text-xs"
        value={form.date_charged} onChange={(e) => setForm({ ...form, date_charged: e.target.value })} />
      <select className="input-field !py-0.5 text-xs" value={form.payment_method_used} onChange={(e) => setForm({ ...form, payment_method_used: e.target.value })}>
        <option value="card">Card</option>
        <option value="ach">ACH</option>
        <option value="check">Check</option>
        <option value="wire">Wire</option>
        <option value="other">Other</option>
      </select>
      {parseFloat(form.amount_charged) !== Number(charge.calculated_total) && (
        <input className="input-field !py-0.5 text-xs" placeholder="Variance reason"
          value={form.variance_reason} onChange={(e) => setForm({ ...form, variance_reason: e.target.value })} />
      )}
      <input className="input-field !py-0.5 text-xs" placeholder="Notes / Invoice #"
        value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="flex gap-1">
        <button className="text-[10px] px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium" onClick={() => {
          onSave(charge, form.status, {
            amount_charged: parseFloat(form.amount_charged),
            date_charged: form.date_charged,
            payment_method_used: form.payment_method_used,
            variance_reason: form.variance_reason || null,
            notes: form.notes || null,
          });
        }}>Save</button>
        <button className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-600 rounded" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function formatMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getDaysOverdue(billingMonth: string): number {
  const now = new Date();
  const billDate = new Date(billingMonth);
  const diff = Math.floor((now.getTime() - billDate.getTime()) / (1000 * 60 * 60 * 24));
  return diff;
}
