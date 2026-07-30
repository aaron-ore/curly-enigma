"use client";

import { useState } from "react";

export default function ExportPage() {
  const [exportType, setExportType] = useState("spreadsheet");
  const [startMonth, setStartMonth] = useState("");
  const [endMonth, setEndMonth] = useState("");
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);
  const [preview, setPreview] = useState<any[] | null>(null);

  const handleExport = async (format: "csv" | "json") => {
    setExporting(true);
    const params = new URLSearchParams({ type: exportType });
    if (startMonth) params.set("start", startMonth + "-01");
    if (endMonth) params.set("end", endMonth + "-01");
    if (status) params.set("status", status);

    try {
      const res = await fetch(`/api/export?${params}`);
      const data = await res.json();

      if (!data.rows || data.rows.length === 0) {
        alert("No data found for the selected filters.");
        setExporting(false);
        return;
      }

      if (format === "json") {
        setPreview(data.rows.slice(0, 20));
        setExporting(false);
        return;
      }

      // Generate CSV
      const rows = data.rows;
      const headers = Object.keys(rows[0]);
      const csvContent = [
        headers.join(","),
        ...rows.map((row: any) =>
          headers.map((h) => {
            const val = row[h];
            if (val === null || val === undefined) return "";
            const str = String(val);
            return str.includes(",") || str.includes('"') || str.includes("\n")
              ? `"${str.replace(/"/g, '""')}"`
              : str;
          }).join(",")
        ),
      ].join("\n");

      // Download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `codepay-${exportType}-export-${startMonth || "all"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert("Export failed: " + err.message);
    }
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Export</h1>
        <p className="text-sm text-slate-500 mt-1">Generate CSV exports for accounting, reconciliation, or audit</p>
      </div>

      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Export Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Export Type</label>
            <select className="input-field" value={exportType} onChange={(e) => setExportType(e.target.value)}>
              <option value="spreadsheet">Spreadsheet Format (mirrors original sheet)</option>
              <option value="accounting">Accounting Format (one row per charge)</option>
              <option value="raw">Raw Import Data (PayPilot transactions)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Start Month</label>
            <input type="month" className="input-field" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">End Month</label>
            <input type="month" className="input-field" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </div>
          {exportType === "accounting" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Status Filter</label>
              <select className="input-field" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">All</option>
                <option value="paid">Paid</option>
                <option value="charged">Charged</option>
                <option value="pending">Pending</option>
                <option value="overdue">Overdue</option>
              </select>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button className="btn-primary" onClick={() => handleExport("csv")} disabled={exporting}>
            {exporting ? "Generating..." : "Download CSV"}
          </button>
          <button className="btn-secondary" onClick={() => handleExport("json")} disabled={exporting}>
            Preview Data
          </button>
        </div>

        {/* Type descriptions */}
        <div className="mt-4 text-sm text-slate-500 space-y-1">
          {exportType === "spreadsheet" && (
            <p>Mirrors the original billing sheet layout: Client, Rate, Month, Active Units, Total, Note, Cap, Date Charged, Amount Charged.</p>
          )}
          {exportType === "accounting" && (
            <p>One row per charge, flattened for accounting: client, month, calculated total, amount charged, date, payment method, status, variance reason.</p>
          )}
          {exportType === "raw" && (
            <p>Raw PayPilot transaction data with test flags and include/exclude decisions. Useful for auditing how active_units were derived.</p>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview && preview.length > 0 && (
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">
              Preview (first {preview.length} rows)
            </h2>
            <button className="btn-secondary text-sm" onClick={() => setPreview(null)}>Close</button>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table text-xs">
              <thead>
                <tr>
                  {Object.keys(preview[0]).map((key) => (
                    <th key={key}>{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i}>
                    {Object.values(row).map((val: any, j) => (
                      <td key={j}>{val !== null ? String(val) : "—"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
