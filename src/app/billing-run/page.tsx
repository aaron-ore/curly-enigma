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
  per_location_cap: string | null;
  capped_locations?: number;
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
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

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
        const newSource = row.source === "imported" ? "imported_overridden" : row.source;
        return { ...row, active_units: value, source: newSource };
      })
    );
  };

  const updateCappedLocations = (clientId: number, value: number) => {
    setGrid((prev) =>
      prev.map((row) => {
        if (row.client_id !== clientId) return row;
        return { ...row, capped_locations: value };
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
  const totalUnits = primaryClients.reduce((sum, r) => sum + r.active_units, 0);

  const filteredClients = primaryClients.filter((r) =>
    r.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusColor = (row: GridRow) => {
    if (!row.has_rate_plan) return "bg-red-500";
    if (row.per_location_cap && !row.capped_locations) return "bg-amber-500";
    if (row.active_units === 0) return "bg-slate-300";
    if (row.billing_type === "auto_charge") return "bg-blue-500";
    return "bg-emerald-500";
  };

  const getStatusLabel = (row: GridRow) => {
    if (!row.has_rate_plan) return "No Rate";
    if (row.per_location_cap && !row.capped_locations) return "Needs Input";
    if (row.active_units === 0) return "No Usage";
    if (row.billing_type === "auto_charge") return "Auto";
    return "Ready";
  };

  const monthLabel = new Date(billingMonth + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing Run</h1>
          <p className="text-sm text-slate-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            className="input-field text-sm"
            value={billingMonth.slice(0, 7)}
            onChange={(e) => setBillingMonth(e.target.value + "-01")}
          />
          <button className="btn-secondary text-sm" onClick={loadGrid}>
            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            Reload
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-card p-4 border-l-4 border-l-[#0066FF]">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Expected Revenue</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">${totalExpected.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-emerald-500">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Active Clients</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{primaryClients.length - noUsage.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">{totalUnits} total units</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-amber-500">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">No Usage</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{noUsage.length}</p>
        </div>
        <div className="glass-card p-4 border-l-4 border-l-red-500">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Missing Rate</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{missingRate.length}</p>
        </div>
      </div>

      {/* Missing Rate Alert */}
      {missingRate.length > 0 && (
        <div className="p-4 bg-red-50/80 backdrop-blur border border-red-200 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-500 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
          <div>
            <p className="text-sm font-semibold text-red-800">Missing rate plans</p>
            <p className="text-sm text-red-600 mt-0.5">{missingRate.map(r => r.client_name).join(", ")}</p>
          </div>
        </div>
      )}

      {/* Finalized Banner */}
      {finalized && (
        <div className="p-4 bg-emerald-50/80 backdrop-blur border border-emerald-200 rounded-xl flex items-center gap-3">
          <svg className="w-5 h-5 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <p className="text-sm font-medium text-emerald-800">Billing run finalized. Charges created for {monthLabel}.</p>
        </div>
      )}

      {/* Search + Finalize */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search clients..."
            className="input-field pl-10 text-sm w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button
          className="btn-primary px-6"
          onClick={handleFinalize}
          disabled={finalizing || finalized}
        >
          {finalized ? (
            <><svg className="w-4 h-4 inline mr-1.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>Finalized</>
          ) : finalizing ? "Processing..." : "Finalize Month"}
        </button>
      </div>

      {/* Client Cards */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-6 h-6 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-slate-500 text-sm">Loading billing data...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredClients.map((row) => (
            <div
              key={row.client_id}
              className={`glass-card overflow-hidden transition-all duration-200 ${
                expandedId === row.client_id ? "ring-2 ring-[#0066FF]/30" : "hover:shadow-md"
              } ${!row.has_rate_plan ? "border-l-4 border-l-red-400" : ""}`}
            >
              {/* Collapsed Row — clickable */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer select-none"
                onClick={() => toggleExpand(row.client_id)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${getStatusColor(row)}`}></div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{row.client_name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{row.rate_summary}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {/* Units pill */}
                  <div className="text-center">
                    <p className="text-xs text-slate-400">Units</p>
                    <p className="font-semibold text-slate-700">{row.active_units}</p>
                  </div>

                  {/* Total */}
                  <div className="text-right min-w-[80px]">
                    <p className="text-xs text-slate-400">Total</p>
                    {row.active_units === 0 ? (
                      <p className="text-sm text-slate-400">—</p>
                    ) : (
                      <p className="font-bold text-slate-900">${row.calculated_total.toFixed(2)}</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <span className={`text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                    !row.has_rate_plan ? "bg-red-100 text-red-700" :
                    row.per_location_cap && !row.capped_locations ? "bg-amber-100 text-amber-700" :
                    row.active_units === 0 ? "bg-slate-100 text-slate-500" :
                    row.billing_type === "auto_charge" ? "bg-blue-100 text-blue-700" :
                    "bg-emerald-100 text-emerald-700"
                  }`}>
                    {getStatusLabel(row)}
                  </span>

                  {/* Chevron */}
                  <svg
                    className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expandedId === row.client_id ? "rotate-180" : ""}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded Detail */}
              {expandedId === row.client_id && (
                <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-4 animate-fadeIn">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Active Units Input */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1.5">Active Units</label>
                      <input
                        type="number"
                        min="0"
                        className="input-field w-full text-center text-lg font-semibold"
                        value={row.active_units}
                        onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                        disabled={finalized}
                      />
                      <p className="text-xs text-slate-400 mt-1">
                        Source: <span className={`font-medium ${row.source === "imported" ? "text-blue-600" : "text-slate-600"}`}>{row.source}</span>
                      </p>
                    </div>

                    {/* Capped Locations Input (only for per_location_cap clients) */}
                    {row.per_location_cap && (
                      <div>
                        <label className="text-xs font-medium text-slate-600 block mb-1.5">
                          Capped Locations
                          <span className="text-amber-600 ml-1">(over $20 threshold)</span>
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="input-field w-full text-center text-lg font-semibold"
                          placeholder="0"
                          value={row.capped_locations || ""}
                          onChange={(e) => updateCappedLocations(row.client_id, parseInt(e.target.value) || 0)}
                          disabled={finalized}
                        />
                        <p className="text-xs text-amber-600 mt-1">
                          Each location over threshold = ${row.per_location_cap.match(/\$(\d+)/)?.[1] || "20"}
                        </p>
                      </div>
                    )}

                    {/* Calculated Breakdown */}
                    <div>
                      <label className="text-xs font-medium text-slate-600 block mb-1.5">Billing Summary</label>
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <p className="text-sm text-slate-600">{row.rate_summary}</p>
                        <div className="border-t border-dashed border-slate-200 mt-2 pt-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-slate-500">Calculated Total</span>
                            <span className="text-lg font-bold text-[#0066FF]">
                              ${row.calculated_total.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        {row.billing_type === "auto_charge" && (
                          <p className="text-xs text-blue-600 mt-2 flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                            Auto-charge enabled
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {row.calc_error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700">{row.calc_error}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Consolidated Accounts */}
      {consolidatedClients.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            <h2 className="text-lg font-semibold text-slate-900">Consolidated Accounts</h2>
            <span className="text-xs text-slate-400 ml-1">(billed through parent)</span>
          </div>
          <div className="space-y-2">
            {consolidatedClients.map((row) => (
              <div key={row.client_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-700">{row.client_name}</p>
                  <p className="text-xs text-slate-400">Parent: {row.parent_name}</p>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="number"
                    min="0"
                    className="input-field w-20 text-center text-sm"
                    value={row.active_units}
                    onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                    disabled={finalized}
                  />
                  <span className="badge bg-purple-100 text-purple-700 text-xs">Consolidated</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
