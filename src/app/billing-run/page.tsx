"use client";

import { useEffect, useState } from "react";

interface GridRow {
  client_id: number;
  client_name: string;
  billing_type: string;
  parent_client_id: number | null;
  parent_name: string | null;
  active_units: number;
  source: string;
  has_rate_plan: boolean;
  rate_summary: string;
  calculated_total: number;
  calc_error?: string;
  is_consolidated: boolean;
}

export default function BillingRunPage() {
  const [billingMonth, setBillingMonth] = useState(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toISOString().split("T")[0];
  });
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalized, setFinalized] = useState(false);

  const loadGrid = () => {
    setLoading(true);
    setFinalized(false);
    fetch(`/api/billing-run?month=${billingMonth}`)
      .then((r) => r.json())
      .then((d) => { setGrid(d.grid || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadGrid(); }, [billingMonth]);

  const updateUnits = (clientId: number, value: number) => {
    setGrid((prev) =>
      prev.map((row) => {
        if (row.client_id !== clientId) return row;
        // Recalculate on the client side (simplified — real calc happens server-side on finalize)
        const newSource = row.source === "imported" ? "imported_overridden" : row.source;
        return { ...row, active_units: value, source: newSource };
      })
    );
  };

  const handleFinalize = async () => {
    setFinalizing(true);
    const entries = grid.map((row) => ({
      client_id: row.client_id,
      active_units: row.active_units,
      source: row.source,
      calculated_total: row.calculated_total,
      is_consolidated: row.is_consolidated,
    }));

    const res = await fetch("/api/billing-run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ billing_month: billingMonth, entries }),
    });

    if (res.ok) {
      setFinalized(true);
    }
    setFinalizing(false);
  };

  const primaryClients = grid.filter((r) => !r.is_consolidated);
  const consolidatedClients = grid.filter((r) => r.is_consolidated);
  const missingRate = grid.filter((r) => !r.has_rate_plan);
  const noUsage = primaryClients.filter((r) => r.active_units === 0);
  const totalExpected = primaryClients.reduce((sum, r) => sum + r.calculated_total, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Monthly Billing Run</h1>
          <p className="text-sm text-slate-500 mt-1">Review and finalize charges for a billing period</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="input-field"
            value={billingMonth.slice(0, 7)}
            onChange={(e) => setBillingMonth(e.target.value + "-01")}
          />
          <button className="btn-secondary" onClick={loadGrid}>Reload</button>
        </div>
      </div>

      {/* Summary Bar */}
      <div className="glass-card p-4 flex items-center justify-between">
        <div className="flex gap-6">
          <div>
            <span className="text-xs text-slate-500">Clients</span>
            <p className="font-semibold">{primaryClients.length}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Expected Total</span>
            <p className="font-semibold text-[#0066FF]">${totalExpected.toFixed(2)}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">No Usage</span>
            <p className="font-semibold text-amber-600">{noUsage.length}</p>
          </div>
          <div>
            <span className="text-xs text-slate-500">Missing Rate</span>
            <p className="font-semibold text-red-600">{missingRate.length}</p>
          </div>
        </div>
        <button
          className="btn-primary"
          onClick={handleFinalize}
          disabled={finalizing || finalized}
        >
          {finalized ? "Finalized" : finalizing ? "Finalizing..." : "Finalize Month"}
        </button>
      </div>

      {/* Missing Rate Warning */}
      {missingRate.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-700">
            {missingRate.length} client(s) have no active rate plan for this month:
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {missingRate.map((r) => (
              <span key={r.client_id} className="badge bg-red-100 text-red-700">{r.client_name}</span>
            ))}
          </div>
        </div>
      )}

      {finalized && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm font-medium text-green-700">
            Billing run finalized. Usage records and charges have been created. View them on the Charges page.
          </p>
        </div>
      )}

      {/* Main Grid */}
      {loading ? (
        <div className="text-center p-8 text-slate-400">Loading billing grid...</div>
      ) : (
        <div className="glass-card overflow-hidden">
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Rate Plan</th>
                <th>Active Units</th>
                <th>Source</th>
                <th>Calculated Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {primaryClients.map((row) => (
                <tr key={row.client_id} className={!row.has_rate_plan ? "bg-red-50/50" : ""}>
                  <td className="font-medium">{row.client_name}</td>
                  <td className="text-sm text-slate-600">{row.rate_summary}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="input-field w-20 text-center"
                      value={row.active_units}
                      onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                      disabled={finalized}
                    />
                  </td>
                  <td>
                    <span className={`badge text-xs ${
                      row.source === "imported" ? "bg-blue-100 text-blue-700" :
                      row.source === "imported_overridden" ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {row.source}
                    </span>
                  </td>
                  <td className="font-medium">
                    {row.active_units === 0 ? (
                      <span className="badge status-waived">No usage</span>
                    ) : (
                      `$${row.calculated_total.toFixed(2)}`
                    )}
                  </td>
                  <td>
                    {row.calc_error && <span className="badge status-overdue text-xs">{row.calc_error}</span>}
                    {!row.has_rate_plan && <span className="badge status-overdue text-xs">No rate</span>}
                    {row.billing_type === "auto_charge" && <span className="badge bg-blue-50 text-blue-600 text-xs">Auto</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Consolidated Children */}
      {consolidatedClients.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Consolidated Accounts <span className="text-sm font-normal text-slate-500">(billed through parent)</span>
          </h2>
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Parent</th>
                <th>Active Units</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {consolidatedClients.map((row) => (
                <tr key={row.client_id}>
                  <td className="text-sm">{row.client_name}</td>
                  <td className="text-sm text-slate-600">{row.parent_name}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="input-field w-20 text-center"
                      value={row.active_units}
                      onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                      disabled={finalized}
                    />
                  </td>
                  <td><span className="badge status-consolidated">Consolidated</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
