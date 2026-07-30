"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardData {
  expectedRevenue: number;
  actualCharged: number;
  variance: number;
  pendingCount: number;
  overdueCount: number;
  missingRateCount: number;
  noUsageCount: number;
  recentActivity: Array<{
    id: number;
    client_name: string;
    billing_month: string;
    status: string;
    amount: number;
    updated_at: string;
  }>;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((res) => res.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  const stats = data || {
    expectedRevenue: 0,
    actualCharged: 0,
    variance: 0,
    pendingCount: 0,
    overdueCount: 0,
    missingRateCount: 0,
    noUsageCount: 0,
    recentActivity: [],
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Monthly billing overview</p>
        </div>
        <Link href="/billing-run" className="btn-primary">
          Start Monthly Billing Run
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Expected Revenue"
          value={formatCurrency(stats.expectedRevenue)}
          subtitle="This month's calculated totals"
          color="blue"
        />
        <SummaryCard
          title="Actual Charged"
          value={formatCurrency(stats.actualCharged)}
          subtitle="Charged + Paid"
          color="green"
        />
        <SummaryCard
          title="Variance"
          value={formatCurrency(stats.variance)}
          subtitle="Expected - Actual"
          color={stats.variance > 0 ? "yellow" : "green"}
        />
        <SummaryCard
          title="Pending"
          value={stats.pendingCount.toString()}
          subtitle="Awaiting charge"
          color="slate"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Overdue</span>
            <span className={`badge ${stats.overdueCount > 0 ? "status-overdue" : "status-paid"}`}>
              {stats.overdueCount}
            </span>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">Missing Rate Config</span>
            <span className={`badge ${stats.missingRateCount > 0 ? "status-overdue" : "status-paid"}`}>
              {stats.missingRateCount}
            </span>
          </div>
        </div>
        <div className="glass-card p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">No Usage This Month</span>
            <span className="badge status-waived">{stats.noUsageCount}</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
        {stats.recentActivity.length === 0 ? (
          <p className="text-sm text-slate-500">No recent activity. Start a billing run to generate charges.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Month</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentActivity.map((item) => (
                <tr key={item.id}>
                  <td className="font-medium">{item.client_name}</td>
                  <td>{item.billing_month}</td>
                  <td>{formatCurrency(item.amount)}</td>
                  <td>
                    <span className={`badge status-${item.status}`}>{item.status}</span>
                  </td>
                  <td className="text-slate-500">{formatDate(item.updated_at)}</td>
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

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
