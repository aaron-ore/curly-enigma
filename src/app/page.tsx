"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  totalOutstanding: number;
  totalPaid: number;
  expectedRevenue: number;
  pendingCount: number;
  overdueCount: number;
  missingRateCount: number;
  noUsageCount: number;
  clientSummaries: Array<{
    client_id: number;
    client_name: string;
    total_owed: number;
    total_paid: number;
    outstanding: number;
    months_unpaid: number;
  }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setData(null); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  const stats = data || {
    totalOutstanding: 0,
    totalPaid: 0,
    expectedRevenue: 0,
    pendingCount: 0,
    overdueCount: 0,
    missingRateCount: 0,
    noUsageCount: 0,
    clientSummaries: [],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Billing overview — all time</p>
        </div>
        <Link href="/billing-run" className="btn-primary">
          Start Monthly Billing Run
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Outstanding Balance"
          value={formatCurrency(stats.totalOutstanding)}
          subtitle="Unpaid across all clients"
          color="red"
        />
        <SummaryCard
          title="Total Collected"
          value={formatCurrency(stats.totalPaid)}
          subtitle="All time paid"
          color="green"
        />
        <SummaryCard
          title="Clients with Balance"
          value={stats.pendingCount.toString()}
          subtitle="Have unpaid charges"
          color="yellow"
        />
        <SummaryCard
          title="Missing Rate Config"
          value={stats.missingRateCount.toString()}
          subtitle="Cannot calculate billing"
          color="slate"
        />
      </div>

      {/* Outstanding by Client */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Outstanding by Client</h2>
        {stats.clientSummaries.length === 0 ? (
          <p className="text-sm text-slate-500">No outstanding balances.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Total Billed</th>
                <th>Total Paid</th>
                <th>Outstanding</th>
                <th>Months Unpaid</th>
              </tr>
            </thead>
            <tbody>
              {stats.clientSummaries.map((item) => (
                <tr key={item.client_id}>
                  <td>
                    <Link href={`/clients/${item.client_id}`} className="font-medium text-[#0066FF] hover:underline">
                      {item.client_name}
                    </Link>
                  </td>
                  <td className="text-sm">{formatCurrency(item.total_owed)}</td>
                  <td className="text-sm text-green-600">{formatCurrency(item.total_paid)}</td>
                  <td className="font-semibold text-red-600">{formatCurrency(item.outstanding)}</td>
                  <td>
                    <span className={`badge ${item.months_unpaid > 3 ? "status-overdue" : "status-pending"}`}>
                      {item.months_unpaid} months
                    </span>
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

function SummaryCard({ title, value, subtitle, color }: {
  title: string;
  value: string;
  subtitle: string;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "border-l-[#0066FF]",
    green: "border-l-emerald-500",
    yellow: "border-l-amber-500",
    red: "border-l-red-500",
    slate: "border-l-slate-400",
  };

  return (
    <div className={`glass-card p-5 border-l-4 ${colorMap[color] || colorMap.slate}`}>
      <p className="text-sm text-slate-500 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
      <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
}
