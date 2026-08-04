"use client";

import { useState } from "react";

interface NewClientCandidate {
  store_name: string;
  terminals: string[];
}

interface ImportResult {
  import_id: number;
  total: number;
  auto_excluded: number;
  review_flagged: number;
  review_cap: number;
  active: number;
  unmapped: string[];
  new_clients: NewClientCandidate[];
}

interface Transaction {
  id: number;
  store_name: string;
  terminal_sn: string;
  purchase_qty: number;
  purchase_amount: number;
  refund_qty: number;
  refund_amount: number;
  merchant_receivable: number;
  test_flag: string | null;
  included_in_active_count: boolean;
  client_name: string | null;
}

export default function ImportPage() {
  const [billingMonth, setBillingMonth] = useState(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return prev.toISOString().split("T")[0];
  });
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [reviewItems, setReviewItems] = useState<Transaction[]>([]);
  const [capReviewItems, setCapReviewItems] = useState<Transaction[]>([]);
  const [newClients, setNewClients] = useState<NewClientCandidate[]>([]);
  const [creatingClient, setCreatingClient] = useState<string | null>(null);

  const handleImport = async () => {
    if (!file || importDone) return;
    setImporting(true);

    try {
      // Parse XLSX client-side
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      // Find header row (contains "Store", "Terminal SN")
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
        setImporting(false);
        return;
      }

      // Normalize headers — handle sparse arrays and null cells
      const rawHeader = rawRows[headerIdx];
      const maxCol = rawHeader.length;
      const headers: string[] = [];
      for (let c = 0; c < maxCol; c++) {
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

      const rows = [];
      for (let i = headerIdx + 1; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || !row[terminalIdx]) continue;
        rows.push({
          store_name: row[storeIdx] || "",
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

      // Send to API
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billing_month: billingMonth,
          imported_by: "operator",
          source_file_name: file.name,
          rows,
        }),
      });

      const importResult = await res.json();
      if (importResult.error) {
        alert("Import failed: " + importResult.error);
        setImporting(false);
        return;
      }

      setResult(importResult);
      setImportDone(true);
      setNewClients(importResult.new_clients || []);

      // Fetch the imported transactions for review
      if (importResult.import_id) {
        const txRes = await fetch(`/api/import?import_id=${importResult.import_id}`);
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
        setReviewItems(
          (txData.transactions || []).filter((t: Transaction) => t.test_flag === "review_full_refund")
        );
        setCapReviewItems(
          (txData.transactions || []).filter((t: Transaction) => t.test_flag === "review_cap_reached")
        );
      }
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    setImporting(false);
  };

  const handleCreateClient = async (candidate: NewClientCandidate) => {
    setCreatingClient(candidate.store_name);
    try {
      // Create the client
      const clientRes = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: candidate.store_name,
          collection_method: "manual",
          notes: `Auto-created from PayPilot import on ${new Date().toLocaleDateString()}`,
        }),
      });
      const clientData = await clientRes.json();

      if (clientData.error) {
        alert("Failed to create client: " + clientData.error);
        setCreatingClient(null);
        return;
      }

      const clientId = clientData.id;

      // Map all their terminals
      for (const terminalSn of candidate.terminals) {
        await fetch("/api/import/map-terminal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            terminal_id: terminalSn,
            client_id: clientId,
            effective_start: billingMonth,
          }),
        });
      }

      // Remove from new_clients list
      setNewClients((prev) => prev.filter((c) => c.store_name !== candidate.store_name));
    } catch (err: any) {
      alert("Error: " + err.message);
    }
    setCreatingClient(null);
  };

  const handleReviewDecision = async (txId: number, include: boolean) => {
    await fetch("/api/import/review", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decisions: [{ id: txId, included_in_active_count: include }] }),
    });
    setReviewItems((prev) => prev.filter((t) => t.id !== txId));
    setCapReviewItems((prev) => prev.filter((t) => t.id !== txId));
    setTransactions((prev) =>
      prev.map((t) => t.id === txId ? { ...t, included_in_active_count: include } : t)
    );
  };

  const handleReset = () => {
    setFile(null);
    setImportDone(false);
    setResult(null);
    setTransactions([]);
    setReviewItems([]);
    setCapReviewItems([]);
    setNewClients([]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Import & Activity Review</h1>
        <p className="text-sm text-slate-500 mt-1">Upload PayPilot export, review flagged transactions, resolve unmapped terminals</p>
      </div>

      {/* Upload Section */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Upload PayPilot Export</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Billing Month</label>
            <input type="date" className="input-field" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} disabled={importDone} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">PayPilot Export File (.xlsx)</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="input-field"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              disabled={importDone}
            />
          </div>
          <div>
            {importDone ? (
              <button className="btn-primary w-full opacity-60 cursor-not-allowed" disabled>
                ✓ Imported Successfully
              </button>
            ) : (
              <button
                className="btn-primary w-full"
                onClick={handleImport}
                disabled={!file || importing}
              >
                {importing ? "Processing..." : "Import & Filter"}
              </button>
            )}
          </div>
        </div>
        {importDone && (
          <div className="mt-3 text-right">
            <button className="text-sm text-blue-600 hover:text-blue-800 underline" onClick={handleReset}>
              Import another file
            </button>
          </div>
        )}
      </div>

      {/* Import Results */}
      {result && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Import Results</h2>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-900">{result.total}</p>
              <p className="text-xs text-slate-500">Total Rows</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{result.active}</p>
              <p className="text-xs text-slate-500">Active</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-400">{result.auto_excluded}</p>
              <p className="text-xs text-slate-500">Auto-Excluded</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500">{result.review_flagged}</p>
              <p className="text-xs text-slate-500">Review (Refund)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-500">{result.review_cap || 0}</p>
              <p className="text-xs text-slate-500">Review (Cap)</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-500">{result.unmapped.length}</p>
              <p className="text-xs text-slate-500">Unmapped</p>
            </div>
          </div>
        </div>
      )}

      {/* New Clients Discovered */}
      {newClients.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">New Clients Discovered</h2>
          <p className="text-sm text-slate-500 mb-4">
            These store names don&apos;t match any existing client. Create them and map their terminals in one click.
          </p>
          <div className="space-y-3">
            {newClients.map((candidate) => (
              <div key={candidate.store_name} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-100">
                <div>
                  <p className="font-medium text-slate-900">{candidate.store_name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {candidate.terminals.length} terminal{candidate.terminals.length > 1 ? "s" : ""}: {candidate.terminals.slice(0, 3).join(", ")}{candidate.terminals.length > 3 ? ` +${candidate.terminals.length - 3} more` : ""}
                  </p>
                </div>
                <button
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  onClick={() => handleCreateClient(candidate)}
                  disabled={creatingClient === candidate.store_name}
                >
                  {creatingClient === candidate.store_name ? "Creating..." : "Create Client & Map"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmapped terminals (existing clients, just missing mapping) */}
      {result && result.unmapped.length > 0 && newClients.length === 0 && (
        <div className="glass-card p-6">
          <div className="p-3 bg-red-50 rounded-lg">
            <p className="text-sm font-medium text-red-700 mb-2">Unmapped Terminals (assign to a client before billing):</p>
            <div className="flex flex-wrap gap-2">
              {Array.from(new Set(result.unmapped)).map((sn) => (
                <span key={sn} className="badge bg-red-100 text-red-700 font-mono text-xs">{sn}</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Review: Cap Reached (multi-terminal locations hitting cap) */}
      {capReviewItems.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Review: Cap Reached</h2>
          <p className="text-sm text-slate-500 mb-4">
            These locations have multiple terminals whose combined billing would hit or exceed the rate cap.
            Verify these are legitimate separate terminals (not duplicates or test devices) before billing at the capped rate.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Store (Location)</th>
                <th>Terminal SN</th>
                <th>Purchases</th>
                <th>Purchase Amt</th>
                <th>Receivable</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {capReviewItems.map((tx) => (
                <tr key={tx.id} className="bg-purple-50/50">
                  <td className="text-sm">{tx.store_name}</td>
                  <td className="text-sm font-mono">{tx.terminal_sn}</td>
                  <td className="text-sm">{tx.purchase_qty}</td>
                  <td className="text-sm">${Number(tx.purchase_amount).toFixed(2)}</td>
                  <td className="text-sm">${Number(tx.merchant_receivable).toFixed(2)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        onClick={() => handleReviewDecision(tx.id, true)}
                      >
                        Confirm
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                        onClick={() => handleReviewDecision(tx.id, false)}
                      >
                        Exclude
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Review Flagged Transactions (Tier 2) */}
      {reviewItems.length > 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Review: Fully Refunded Terminals</h2>
          <p className="text-sm text-slate-500 mb-4">
            These terminals had all purchases refunded (merchant receivable = $0) but at amounts above $1.
            Could be test transactions or genuine returns. Decide whether to include in active count.
          </p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Terminal SN</th>
                <th>Purchases</th>
                <th>Purchase Amt</th>
                <th>Refunds</th>
                <th>Refund Amt</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {reviewItems.map((tx) => (
                <tr key={tx.id}>
                  <td className="text-sm">{tx.store_name}</td>
                  <td className="text-sm font-mono">{tx.terminal_sn}</td>
                  <td className="text-sm">{tx.purchase_qty}</td>
                  <td className="text-sm">${Number(tx.purchase_amount).toFixed(2)}</td>
                  <td className="text-sm">{tx.refund_qty}</td>
                  <td className="text-sm">${Number(tx.refund_amount).toFixed(2)}</td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                        onClick={() => handleReviewDecision(tx.id, true)}
                      >
                        Include
                      </button>
                      <button
                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                        onClick={() => handleReviewDecision(tx.id, false)}
                      >
                        Exclude
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All Transactions Summary */}
      {transactions.length > 0 && reviewItems.length === 0 && capReviewItems.length === 0 && (
        <div className="glass-card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Import Complete — {transactions.filter(t => t.included_in_active_count).length} active terminals ready for billing run
          </h2>
          <p className="text-sm text-slate-500">
            All review items resolved. Proceed to the Billing Run page to finalize charges.
          </p>
        </div>
      )}
    </div>
  );
}
