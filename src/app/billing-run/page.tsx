"use client";

import { useEffect, useState, useCallback } from "react";

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
  cap_amount?: number;
  flat_rate?: number;
  tier_1_rate?: number;
  tier_1_unit_count?: number;
  tier_2_rate?: number;
  pricing_model?: string;
  prev_month_units?: number;
}

type FilterStatus = "all" | "ready" | "needs_input" | "no_usage" | "no_rate" | "has_locations";

export default function BillingRunPage() {
  const [billingMonth, setBillingMonth] = useState(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toISOString().split("T")[0];
  });
  const [grid, setGrid] = useState<GridRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");

  const loadGrid = () => {
    setLoading(true);
    setSaved(false);
    fetch(`/api/billing-run?month=${billingMonth}`)
      .then((r) => r.json())
      .then((d) => { setGrid(d.grid || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { loadGrid(); }, [billingMonth]);

  // Client-side recalculation
  const recalcRow = useCallback((row: GridRow): GridRow => {
    if (row.active_units === 0 || !row.has_rate_plan) {
      return { ...row, calculated_total: 0 };
    }

    let total = 0;
    const units = row.active_units;

    if (row.pricing_model === "flat_per_unit" && row.flat_rate) {
      total = units * row.flat_rate;
    } else if (row.pricing_model === "tiered_per_unit" && row.tier_1_rate && row.tier_1_unit_count && row.tier_2_rate) {
      const t1 = Math.min(units, row.tier_1_unit_count);
      const t2 = Math.max(units - row.tier_1_unit_count, 0);
      total = t1 * row.tier_1_rate + t2 * row.tier_2_rate;
    }

    // Apply cap
    if (row.cap_amount) {
      if (row.per_location_cap && row.capped_locations && row.capped_locations > 0) {
        total = row.capped_locations * row.cap_amount;
      } else if (!row.per_location_cap) {
        total = Math.min(total, row.cap_amount);
      }
    }

    return { ...row, calculated_total: Math.round(total * 100) / 100 };
  }, []);

  const updateUnits = (clientId: number, value: number) => {
    setSaved(false);
    setGrid((prev) =>
      prev.map((row) => {
        if (row.client_id !== clientId) return row;
        const updated = { ...row, active_units: value, source: row.source === "imported" ? "imported_overridden" : row.source };
        return recalcRow(updated);
      })
    );
  };

  const updateCappedLocations = (clientId: number, value: number) => {
    setSaved(false);
    setGrid((prev) =>
      prev.map((row) => {
        if (row.client_id !== clientId) return row;
        const updated = { ...row, capped_locations: value };
        return recalcRow(updated);
      })
    );
  };

  const handleSave = async () => {
    setSaving(true);
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

    if (res.ok) setSaved(true);
    setSaving(false);
  };

  const primaryClients = grid.filter((r) => !r.is_consolidated);
  const consolidatedClients = grid.filter((r) => r.is_consolidated);
  const missingRate = grid.filter((r) => !r.has_rate_plan);
  const noUsage = primaryClients.filter((r) => r.active_units === 0);
  const needsInput = primaryClients.filter((r) => r.per_location_cap && !r.capped_locations);
  const hasLocations = primaryClients.filter((r) => !!r.per_location_cap);
  const totalExpected = primaryClients.reduce((sum, r) => sum + r.calculated_total, 0);
  const totalUnits = primaryClients.reduce((sum, r) => sum + r.active_units, 0);
  const totalPrevUnits = primaryClients.reduce((sum, r) => sum + (r.prev_month_units || 0), 0);
  const unitsDelta = totalUnits - totalPrevUnits;

  // Filtering
  const filteredClients = primaryClients.filter((r) => {
    if (searchTerm && !r.client_name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    switch (filter) {
      case "ready": return r.has_rate_plan && r.active_units > 0 && !(r.per_location_cap && !r.capped_locations);
      case "needs_input": return !!r.per_location_cap && !r.capped_locations;
      case "no_usage": return r.active_units === 0;
      case "no_rate": return !r.has_rate_plan;
      case "has_locations": return !!r.per_location_cap;
      default: return true;
    }
  });

  const toggleExpand = (id: number) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const getStatusColor = (row: GridRow) => {
    if (!row.has_rate_plan) return "bg-red-500";
    if (row.per_location_cap && !row.capped_locations) return "bg-amber-500";
    if (row.active_units === 0) return "bg-slate-300";
    return "bg-emerald-500";
  };

  const getStatusLabel = (row: GridRow) => {
    if (!row.has_rate_plan) return "No Rate";
    if (row.per_location_cap && !row.capped_locations) return "Needs Input";
    if (row.active_units === 0) return "No Usage";
    return "Ready";
  };

  const monthLabel = new Date(billingMonth + "T00:00:00").toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const filterCounts: Record<FilterStatus, number> = {
    all: primaryClients.length,
    ready: primaryClients.filter((r) => r.has_rate_plan && r.active_units > 0 && !(r.per_location_cap && !r.capped_locations)).length,
    needs_input: needsInput.length,
    no_usage: noUsage.length,
    no_rate: missingRate.length,
    has_locations: hasLocations.length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Billing Run</h1>
          <p className="text-sm text-slate-500 mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="month"
            className="input-field !w-auto !py-1.5 text-sm"
            value={billingMonth.slice(0, 7)}
            onChange={(e) => setBillingMonth(e.target.value + "-01")}
          />
          <button className="btn-secondary !py-1.5 text-sm" onClick={loadGrid}>Reload</button>
          <button
            className={`btn-primary !py-1.5 text-sm ${saved ? "!bg-emerald-600" : ""}`}
            onClick={handleSave}
            disabled={saving || saved}
          >
            {saved ? "Saved" : saving ? "Saving..." : "Save & Finalize"}
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="glass-card p-3 border-l-4 border-l-[#0066FF]">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expected Revenue</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">${totalExpected.toLocaleString("en-US", { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="glass-card p-3 border-l-4 border-l-emerald-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Units</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{totalUnits.toLocaleString()}</p>
          {totalPrevUnits > 0 && (
            <p className={`text-[11px] mt-0.5 font-medium ${unitsDelta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {unitsDelta >= 0 ? "+" : ""}{unitsDelta} vs last month ({totalPrevUnits})
            </p>
          )}
        </div>
        <div className="glass-card p-3 border-l-4 border-l-amber-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Needs Input</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{needsInput.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">location cap clients</p>
        </div>
        <div className="glass-card p-3 border-l-4 border-l-red-500">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Issues</p>
          <p className="text-xl font-bold text-slate-900 mt-0.5">{missingRate.length + noUsage.length}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{missingRate.length} no rate, {noUsage.length} no usage</p>
        </div>
      </div>

      {/* Saved Banner */}
      {saved && (
        <div className="p-3 bg-emerald-50/80 backdrop-blur border border-emerald-200 rounded-xl flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
          <p className="text-sm font-medium text-emerald-800">Billing run saved and finalized for {monthLabel}.</p>
        </div>
      )}

      {/* Filter Tabs + Search */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {([
            ["all", "All"],
            ["ready", "Ready"],
            ["needs_input", "Needs Input"],
            ["has_locations", "Location Cap"],
            ["no_usage", "No Usage"],
            ["no_rate", "No Rate"],
          ] as [FilterStatus, string][]).map(([key, label]) => (
            <button
              key={key}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                filter === key
                  ? "bg-[#0066FF] text-white shadow-sm"
                  : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300"
              }`}
              onClick={() => setFilter(key)}
            >
              {label}
              <span className={`ml-1 ${filter === key ? "text-blue-200" : "text-slate-400"}`}>
                {filterCounts[key]}
              </span>
            </button>
          ))}
        </div>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            type="text"
            placeholder="Search..."
            className="input-field !pl-8 !py-1.5 !w-48 text-sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Client Cards */}
      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-5 h-5 border-2 border-[#0066FF] border-t-transparent rounded-full animate-spin"></div>
          <span className="ml-3 text-slate-500 text-sm">Loading...</span>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center p-8 text-slate-400 text-sm">No clients match your filter.</div>
      ) : (
        <div className="space-y-1.5">
          {filteredClients.map((row) => (
            <div
              key={row.client_id}
              className={`glass-card overflow-hidden transition-all duration-150 ${
                expandedId === row.client_id ? "ring-2 ring-[#0066FF]/20" : "hover:shadow-md"
              } ${!row.has_rate_plan ? "border-l-3 border-l-red-400" : ""}`}
            >
              {/* Collapsed Header */}
              <div
                className="flex items-center gap-3 px-4 py-3 cursor-pointer select-none"
                onClick={() => toggleExpand(row.client_id)}
              >
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full shrink-0 ${getStatusColor(row)}`}></div>

                {/* Name + rate */}
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm text-slate-900">{row.client_name}</span>
                  <span className="text-xs text-slate-400 ml-2">{row.rate_summary}</span>
                </div>

                {/* Units with delta */}
                <div className="text-right w-20 shrink-0">
                  <span className="text-sm font-semibold text-slate-700">{row.active_units}</span>
                  <span className="text-[10px] text-slate-400 ml-0.5">units</span>
                  {row.prev_month_units !== undefined && row.prev_month_units > 0 && (
                    <p className={`text-[10px] ${row.active_units >= row.prev_month_units ? "text-emerald-600" : "text-red-500"}`}>
                      {row.active_units >= row.prev_month_units ? "+" : ""}{row.active_units - row.prev_month_units} vs {row.prev_month_units}
                    </p>
                  )}
                </div>

                {/* Total */}
                <div className="text-right w-24 shrink-0">
                  {row.active_units === 0 ? (
                    <span className="text-xs text-slate-400">—</span>
                  ) : (
                    <span className="text-sm font-bold text-slate-900">${row.calculated_total.toFixed(2)}</span>
                  )}
                </div>

                {/* Status badge */}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full w-20 text-center shrink-0 ${
                  !row.has_rate_plan ? "bg-red-100 text-red-700" :
                  row.per_location_cap && !row.capped_locations ? "bg-amber-100 text-amber-700" :
                  row.active_units === 0 ? "bg-slate-100 text-slate-500" :
                  "bg-emerald-100 text-emerald-700"
                }`}>
                  {getStatusLabel(row)}
                </span>

                {/* Chevron */}
                <svg
                  className={`w-4 h-4 text-slate-400 transition-transform duration-150 shrink-0 ${expandedId === row.client_id ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>

              {/* Expanded Panel */}
              {expandedId === row.client_id && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 animate-fadeIn">
                  <div className="flex flex-wrap items-end gap-4">
                    {/* Active Units */}
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">Active Units</label>
                      <input
                        type="number"
                        min="0"
                        className="input-field !w-24 !py-1 text-center font-semibold"
                        value={row.active_units}
                        onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                        disabled={saved}
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">src: {row.source}</p>
                    </div>

                    {/* Capped Locations — only for per_location clients */}
                    {row.per_location_cap && (
                      <div>
                        <label className="text-[10px] font-semibold text-amber-600 uppercase block mb-1">
                          Locations over cap
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="input-field !w-20 !py-1 text-center font-semibold border-amber-300 focus:border-amber-500"
                          placeholder="0"
                          value={row.capped_locations || ""}
                          onChange={(e) => updateCappedLocations(row.client_id, parseInt(e.target.value) || 0)}
                          disabled={saved}
                        />
                        <p className="text-[10px] text-amber-500 mt-0.5">${row.cap_amount}/loc cap</p>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="h-10 w-px bg-slate-200 hidden sm:block"></div>

                    {/* Calculated Total */}
                    <div className="bg-white rounded-lg px-4 py-2 border border-slate-200">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">Total</p>
                      <p className="text-lg font-bold text-[#0066FF]">${row.calculated_total.toFixed(2)}</p>
                    </div>

                    {/* Month comparison */}
                    {row.prev_month_units !== undefined && row.prev_month_units > 0 && (
                      <div className="bg-white rounded-lg px-4 py-2 border border-slate-200">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase">vs Last Month</p>
                        <p className={`text-sm font-bold ${row.active_units >= row.prev_month_units ? "text-emerald-600" : "text-red-600"}`}>
                          {row.active_units >= row.prev_month_units ? "+" : ""}{row.active_units - row.prev_month_units} units
                        </p>
                        <p className="text-[10px] text-slate-400">was {row.prev_month_units} terminals</p>
                      </div>
                    )}

                    {/* Auto badge */}
                    {row.billing_type === "auto_charge" && (
                      <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-1 rounded-full self-center">Auto-charge</span>
                    )}
                  </div>

                  {row.calc_error && (
                    <p className="text-xs text-red-600 mt-2 bg-red-50 px-2 py-1 rounded">{row.calc_error}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Consolidated Accounts */}
      {consolidatedClients.length > 0 && (
        <div className="glass-card p-4">
          <h2 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
            Consolidated Accounts
            <span className="text-xs font-normal text-slate-400">(billed through parent)</span>
          </h2>
          <div className="space-y-1.5">
            {consolidatedClients.map((row) => (
              <div key={row.client_id} className="flex items-center justify-between py-2 px-3 bg-white/60 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-slate-700">{row.client_name}</p>
                  <p className="text-[10px] text-slate-400">via {row.parent_name}</p>
                </div>
                <input
                  type="number"
                  min="0"
                  className="input-field !w-20 !py-1 text-center text-sm"
                  value={row.active_units}
                  onChange={(e) => updateUnits(row.client_id, parseInt(e.target.value) || 0)}
                  disabled={saved}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
