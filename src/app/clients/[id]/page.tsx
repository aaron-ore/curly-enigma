"use client";

import React, { useEffect, useState } from "react";
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

interface ParsedTransaction {
  store_name: string;
  terminal_sn: string;
  purchase_qty: number;
  purchase_amount: string;
  refund_qty: number;
  refund_amount: string;
  merchant_receivable: string;
  test_flag: string | null;
}

interface ImportPreview {
  rows: any[];
  total: number;
  active: number;
  auto_excluded: number;
  review_flagged: number;
  review_cap: number;
  merchants: { name: string; terminals: number }[];
}

export default function ClientDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [showRateForm, setShowRateForm] = useState(false);
  const [deletingRateId, setDeletingRateId] = useState<number | null>(null);
  const [editingRateId, setEditingRateId] = useState<number | null>(null);
  const [showImportModal, setShowImportModal] = useState(false);

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
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setShowImportModal(true)}>
            Import PayPilot
          </button>
          <button className="btn-secondary" onClick={() => setEditing(!editing)}>
            {editing ? "Cancel Edit" : "Edit Client"}
          </button>
        </div>
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
            {" "}&mdash; this client is never billed directly.
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
                <React.Fragment key={rp.id}>
                <tr>
                  <td className="text-sm">
                    {fmtDate(rp.effective_start)} {rp.effective_end ? `to ${fmtDate(rp.effective_end)}` : "(current)"}
                  </td>
                  <td className="text-sm capitalize">{rp.pricing_model.replace("_", " ")}</td>
                  <td className="text-sm">
                    {rp.pricing_model === "flat_per_unit"
                      ? `$${Number(rp.flat_rate).toFixed(2)}/unit`
                      : `$${Number(rp.tier_1_rate).toFixed(2)} x${rp.tier_1_unit_count}, then $${Number(rp.tier_2_rate).toFixed(2)}`}
                  </td>
                  <td className="text-sm">{rp.cap_amount ? `$${Number(rp.cap_amount).toFixed(2)}/${rp.cap_scope || "client"}` : "\u2014"}</td>
                  <td className="text-sm text-slate-500">{rp.notes || "\u2014"}</td>
                  <td>
                    <div className="flex gap-1">
                      <button
                        className="text-[10px] px-2 py-0.5 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                        onClick={() => setEditingRateId(editingRateId === rp.id ? null : rp.id)}
                      >
                        Edit
                      </button>
                      {deletingRateId === rp.id ? (
                        <>
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
                        </>
                      ) : (
                        <button
                          className="text-[10px] px-2 py-0.5 bg-red-50 text-red-600 rounded hover:bg-red-100"
                          onClick={() => setDeletingRateId(rp.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {editingRateId === rp.id && (
                  <tr>
                    <td colSpan={6} className="!p-0">
                      <EditRatePlanForm ratePlan={rp} onSaved={() => { setEditingRateId(null); fetchClient(); }} onCancel={() => setEditingRateId(null)} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
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
                  <td className="text-sm">{h.amount_charged ? `$${Number(h.amount_charged).toFixed(2)}` : "\u2014"}</td>
                  <td className="text-sm text-slate-500">{h.date_charged ? fmtDate(h.date_charged) : "\u2014"}</td>
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

      {/* Import Modal */}
      {showImportModal && (
        <ImportModal
          clientId={client.id}
          clientName={client.name}
          onClose={() => { setShowImportModal(false); fetchClient(); }}
        />
      )}
    </div>
  );
}

/* ======================== IMPORT MODAL ======================== */

function ImportModal({ clientId, clientName, onClose }: { clientId: number; clientName: string; onClose: () => void }) {
  const [billingMonth, setBillingMonth] = useState(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toISOString().split("T")[0];
  });
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "preview" | "done">("upload");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [preview, setPreview] = useState<{ total: number; active: number; auto_excluded: number; review_flagged: number; merchants: { name: string; terminals: number }[]; flaggedItems: any[] } | null>(null);
  const [importResult, setImportResult] = useState<any>(null);
  const [showFlagged, setShowFlagged] = useState(false);

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let headerIdx = -1;
      for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
        const row = rawRows[i];
        if (!row || !Array.isArray(row)) continue;
        const rowStrs = row.map((cell: any) => String(cell ?? ""));
        if (rowStrs.some((s: string) => s.includes("Store")) &&
            rowStrs.some((s: string) => s.includes("Terminal SN"))) {
          headerIdx = i;
          break;
        }
      }

      if (headerIdx === -1) {
        alert("Could not find header row with 'Store' and 'Terminal SN' columns");
        setParsing(false);
        return;
      }

      const rawHeader = rawRows[headerIdx];
      const headers: string[] = [];
      for (let c = 0; c < rawHeader.length; c++) {
        headers.push(String(rawHeader[c] ?? "").trim());
      }

      const storeIdx = headers.findIndex((h) => h === "Store");
      const storeTypeIdx = headers.findIndex((h) => h === "Store Type");
      const terminalIdx = headers.findIndex((h) => h === "Terminal SN");
      const purchaseIdx = headers.findIndex((h) => h === "Purchase");
      const purchaseAmtIdx = headers.findIndex((h) => h === "Purchase Amount");
      const refundIdx = headers.findIndex((h) => h === "Refund");
      const refundAmtIdx = headers.findIndex((h) => h === "Refund Amount");
      const discountIdx = headers.findIndex((h) => h === "Discount");
      const feeIdx = headers.findIndex((h) => h === "Fee");
      const vatIdx = headers.findIndex((h) => h === "VAT");
      const receivableIdx = headers.findIndex((h) => h.includes("Merchant Receivable"));

      const rows: any[] = [];
      const merchantMap: Record<string, number> = {};

      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[terminalIdx]) continue;
        const storeName = row[storeIdx] || "Unknown";
        merchantMap[storeName] = (merchantMap[storeName] || 0) + 1;
        rows.push({
          store_name: storeName,
          store_type: row[storeTypeIdx] || "",
          terminal_sn: String(row[terminalIdx]),
          purchase_qty: row[purchaseIdx] || 0,
          purchase_amount: row[purchaseAmtIdx] || "0",
          refund_qty: row[refundIdx] || 0,
          refund_amount: row[refundAmtIdx] || "0",
          discount: row[discountIdx] || "0",
          fee: row[feeIdx] || "0",
          vat: row[vatIdx] || "0",
          merchant_receivable: row[receivableIdx] || "0",
        });
      }

      // Client-side test-filter preview (simplified)
      let autoExcluded = 0;
      let reviewFlagged = 0;
      const flaggedItems: any[] = [];
      for (const r of rows) {
        const amt = parseFloat(String(r.purchase_amount).replace(/[(),]/g, "")) || 0;
        const recv = parseFloat(String(r.merchant_receivable).replace(/[(),]/g, "")) || 0;
        if (recv === 0 && amt <= 1) autoExcluded++;
        else if (recv === 0 && amt > 1) {
          reviewFlagged++;
          flaggedItems.push(r);
        }
      }

      const merchants = Object.entries(merchantMap)
        .map(([name, terminals]) => ({ name, terminals }))
        .sort((a, b) => b.terminals - a.terminals);

      setParsedRows(rows);
      setPreview({
        total: rows.length,
        active: rows.length - autoExcluded - reviewFlagged,
        auto_excluded: autoExcluded,
        review_flagged: reviewFlagged,
        merchants,
        flaggedItems,
      });
      setStep("preview");
    } catch (err: any) {
      alert("Parse failed: " + err.message);
    }
    setParsing(false);
  };

  const handleConfirmImport = async () => {
    setConfirming(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: clientId,
          billing_month: billingMonth,
          imported_by: "operator",
          source_file_name: file?.name || "upload",
          rows: parsedRows,
        }),
      });
      const result = await res.json();
      if (result.error) {
        alert("Import failed: " + (result.detail || result.error));
      } else {
        setImportResult(result);
        setStep("done");
      }
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }
    setConfirming(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto mx-4">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b px-6 py-4 rounded-t-xl flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Import PayPilot Export</h2>
            <p className="text-sm text-slate-500">Client: {clientName}</p>
          </div>
          <button className="text-slate-400 hover:text-slate-600 text-xl leading-none" onClick={onClose}>&times;</button>
        </div>

        <div className="p-6 space-y-5">
          {/* Step 1: Upload */}
          {step === "upload" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Billing Month</label>
                  <input type="date" className="input-field" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">PayPilot Export (.xlsx)</label>
                  <input type="file" accept=".xlsx,.xls,.csv" className="input-field" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                </div>
              </div>
              <button className="btn-primary w-full" onClick={handleParse} disabled={!file || parsing}>
                {parsing ? "Parsing..." : "Parse & Preview"}
              </button>
            </>
          )}

          {/* Step 2: Preview */}
          {step === "preview" && preview && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xl font-bold text-slate-900">{preview.total}</p>
                  <p className="text-xs text-slate-500">Total Terminals</p>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-xl font-bold text-green-600">{preview.active}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <p className="text-xl font-bold text-slate-400">{preview.auto_excluded}</p>
                  <p className="text-xs text-slate-500">Auto-Excluded</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-xl font-bold text-amber-500">{preview.review_flagged}</p>
                  <p className="text-xs text-slate-500">Needs Review</p>
                </div>
              </div>

              {/* Flagged items review */}
              {preview.review_flagged > 0 && (
                <div>
                  <button
                    className="w-full text-left text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 hover:bg-amber-100 flex items-center justify-between"
                    onClick={() => setShowFlagged(!showFlagged)}
                  >
                    <span>Review {preview.review_flagged} flagged terminal{preview.review_flagged > 1 ? "s" : ""} (fully refunded, amt &gt; $1)</span>
                    <span className="text-lg">{showFlagged ? "\u25B2" : "\u25BC"}</span>
                  </button>
                  {showFlagged && (
                    <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Store</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Terminal SN</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Purchase Amt</th>
                            <th className="px-3 py-1.5 text-left text-xs font-medium text-slate-500">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {preview.flaggedItems.map((item: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-3 py-1.5">{item.store_name}</td>
                              <td className="px-3 py-1.5 font-mono text-xs">{item.terminal_sn}</td>
                              <td className="px-3 py-1.5">${parseFloat(String(item.purchase_amount).replace(/[(),]/g, "")).toFixed(2)}</td>
                              <td className="px-3 py-1.5">
                                <button
                                  className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                  onClick={() => {
                                    setParsedRows((prev) => prev.filter((r) => r.terminal_sn !== item.terminal_sn));
                                    setPreview((prev) => prev ? {
                                      ...prev,
                                      review_flagged: prev.review_flagged - 1,
                                      flaggedItems: prev.flaggedItems.filter((f: any) => f.terminal_sn !== item.terminal_sn),
                                      total: prev.total - 1,
                                    } : prev);
                                  }}
                                >
                                  Exclude
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Merchant breakdown */}
              <div>
                <h3 className="text-sm font-medium text-slate-700 mb-2">Merchants in this export ({preview.merchants.length})</h3>
                <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
                  {preview.merchants.map((m) => (
                    <div key={m.name} className="flex justify-between px-3 py-2 text-sm">
                      <span className="text-slate-700">{m.name}</span>
                      <span className="text-slate-500 font-mono">{m.terminals} terminal{m.terminals > 1 ? "s" : ""}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>{preview.active} active terminals</strong> will be saved for <strong>{clientName}</strong> for billing month <strong>{billingMonth}</strong>.
                </p>
              </div>

              <div className="flex gap-3">
                <button className="btn-secondary flex-1" onClick={() => { setStep("upload"); setPreview(null); setParsedRows([]); }}>
                  Back
                </button>
                <button className="btn-primary flex-1" onClick={handleConfirmImport} disabled={confirming}>
                  {confirming ? "Saving..." : "Confirm & Save Import"}
                </button>
              </div>
            </>
          )}

          {/* Step 3: Done */}
          {step === "done" && importResult && (
            <>
              <div className="text-center py-4">
                <div className="text-4xl mb-2">&#10003;</div>
                <h3 className="text-lg font-semibold text-slate-900">Import Saved Successfully</h3>
                <p className="text-sm text-slate-500 mt-1">
                  {importResult.active} active terminals recorded for {clientName}
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div className="p-2 bg-slate-50 rounded">
                  <p className="font-bold">{importResult.total}</p>
                  <p className="text-xs text-slate-500">Total</p>
                </div>
                <div className="p-2 bg-green-50 rounded">
                  <p className="font-bold text-green-600">{importResult.active}</p>
                  <p className="text-xs text-slate-500">Active</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="font-bold text-slate-400">{importResult.auto_excluded}</p>
                  <p className="text-xs text-slate-500">Excluded</p>
                </div>
                <div className="p-2 bg-amber-50 rounded">
                  <p className="font-bold text-amber-500">{importResult.review_flagged}</p>
                  <p className="text-xs text-slate-500">Flagged</p>
                </div>
              </div>
              <button className="btn-primary w-full" onClick={onClose}>Done</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ======================== EDIT CLIENT FORM ======================== */

function EditClientForm({ client, onSaved }: { client: ClientDetail; onSaved: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: client.name,
    status: client.status,
    billing_type: client.billing_type,
    payment_method: client.payment_method,
    notes: client.notes || "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch(`/api/clients/${client.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    onSaved();
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    if (res.ok) router.push("/clients");
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
      <div className="flex items-end gap-3">
        <button type="submit" className="btn-primary">Save Changes</button>
        {confirmDelete ? (
          <div className="flex gap-2 items-center">
            <span className="text-xs text-red-600">Delete this client?</span>
            <button type="button" className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded font-medium hover:bg-red-200" onClick={handleDelete}>Yes, Delete</button>
            <button type="button" className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded" onClick={() => setConfirmDelete(false)}>Cancel</button>
          </div>
        ) : (
          <button type="button" className="text-xs px-2 py-1 bg-red-50 text-red-600 rounded hover:bg-red-100" onClick={() => setConfirmDelete(true)}>Delete Client</button>
        )}
      </div>
    </form>
  );
}

/* ======================== ADD RATE PLAN FORM ======================== */

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

/* ======================== EDIT RATE PLAN FORM ======================== */

function EditRatePlanForm({ ratePlan, onSaved, onCancel }: { ratePlan: any; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    pricing_model: ratePlan.pricing_model,
    effective_start: ratePlan.effective_start?.split("T")[0] || "",
    effective_end: ratePlan.effective_end?.split("T")[0] || "",
    flat_rate: ratePlan.flat_rate || "",
    tier_1_rate: ratePlan.tier_1_rate || "",
    tier_1_unit_count: ratePlan.tier_1_unit_count || "",
    tier_2_rate: ratePlan.tier_2_rate || "",
    cap_amount: ratePlan.cap_amount || "",
    cap_scope: ratePlan.cap_scope || "",
    notes: ratePlan.notes || "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch("/api/rate-plans", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: ratePlan.id,
        pricing_model: form.pricing_model,
        effective_start: form.effective_start,
        effective_end: form.effective_end || null,
        flat_rate: form.flat_rate ? parseFloat(form.flat_rate) : null,
        tier_1_rate: form.tier_1_rate ? parseFloat(form.tier_1_rate) : null,
        tier_1_unit_count: form.tier_1_unit_count ? parseInt(form.tier_1_unit_count) : null,
        tier_2_rate: form.tier_2_rate ? parseFloat(form.tier_2_rate) : null,
        cap_amount: form.cap_amount ? parseFloat(form.cap_amount) : null,
        cap_scope: form.cap_scope || null,
        notes: form.notes || null,
      }),
    });
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="bg-amber-50/50 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Model</label>
        <select className="input-field text-sm" value={form.pricing_model} onChange={(e) => setForm({ ...form, pricing_model: e.target.value })}>
          <option value="flat_per_unit">Flat Per Unit</option>
          <option value="tiered_per_unit">Tiered Per Unit</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Start</label>
        <input type="date" className="input-field text-sm" value={form.effective_start} onChange={(e) => setForm({ ...form, effective_start: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">End (optional)</label>
        <input type="date" className="input-field text-sm" value={form.effective_end} onChange={(e) => setForm({ ...form, effective_end: e.target.value })} />
      </div>
      {form.pricing_model === "flat_per_unit" ? (
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Flat Rate ($)</label>
          <input type="number" step="0.01" className="input-field text-sm" value={form.flat_rate} onChange={(e) => setForm({ ...form, flat_rate: e.target.value })} />
        </div>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">T1 Rate</label>
            <input type="number" step="0.01" className="input-field text-sm" value={form.tier_1_rate} onChange={(e) => setForm({ ...form, tier_1_rate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">T1 Units</label>
            <input type="number" className="input-field text-sm" value={form.tier_1_unit_count} onChange={(e) => setForm({ ...form, tier_1_unit_count: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">T2 Rate</label>
            <input type="number" step="0.01" className="input-field text-sm" value={form.tier_2_rate} onChange={(e) => setForm({ ...form, tier_2_rate: e.target.value })} />
          </div>
        </>
      )}
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Cap ($)</label>
        <input type="number" step="0.01" className="input-field text-sm" value={form.cap_amount} onChange={(e) => setForm({ ...form, cap_amount: e.target.value })} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Cap Scope</label>
        <select className="input-field text-sm" value={form.cap_scope} onChange={(e) => setForm({ ...form, cap_scope: e.target.value })}>
          <option value="">None</option>
          <option value="per_client">Per Client</option>
          <option value="per_location">Per Location</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">Notes</label>
        <input className="input-field text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" className="btn-primary text-sm">Save</button>
        <button type="button" className="btn-secondary text-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

/* ======================== HELPERS ======================== */

function formatMonth(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** Format date as MM-DD-YYYY, stripping any time/timezone */
function fmtDate(dateStr: string): string {
  if (!dateStr) return "";
  const raw = dateStr.split("T")[0];
  const [y, m, d] = raw.split("-");
  if (!y || !m || !d) return raw;
  return `${m}-${d}-${y}`;
}
