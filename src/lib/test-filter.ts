/**
 * PayPilot Transaction Test-Filter Logic (spec section 3b)
 * 
 * Determines whether a terminal's activity for the period is genuine
 * or a test transaction, based on merchant_receivable patterns.
 */

export interface PayPilotRow {
  store_name: string;
  terminal_sn: string;
  purchase_qty: number;
  purchase_amount: number;
  refund_qty: number;
  refund_amount: number;
  merchant_receivable: number;
}

export type TestFlag = "auto_excluded" | "review_full_refund" | "review_low_value" | "review_cap_reached" | null;

export interface FilterResult {
  test_flag: TestFlag;
  included_in_active_count: boolean;
  reason: string;
}

/**
 * Apply the tiered test-transaction filter per spec section 3b.
 * 
 * Tier 1 — auto-exclude: merchant_receivable = $0.00 AND purchase_amount <= $1.00
 * Tier 2 — flag for review: merchant_receivable = $0.00 AND refund_qty = purchase_qty AND purchase_amount > $1.00
 * Everything else: counts as active
 */
export function applyTestFilter(row: PayPilotRow): FilterResult {
  const receivable = Math.abs(row.merchant_receivable);
  const purchaseAmt = row.purchase_amount;
  
  // Tier 1: auto-exclude (high confidence test transaction)
  if (receivable === 0 && purchaseAmt <= 1.0) {
    return {
      test_flag: "auto_excluded",
      included_in_active_count: false,
      reason: `Auto-excluded: $${purchaseAmt.toFixed(2)} purchase fully refunded, merchant receivable $0.00`,
    };
  }

  // Tier 2: flag for review (full refund at higher amounts)
  if (receivable === 0 && row.refund_qty === row.purchase_qty && purchaseAmt > 1.0) {
    return {
      test_flag: "review_full_refund",
      included_in_active_count: true, // Default to include, operator reviews
      reason: `Review needed: $${purchaseAmt.toFixed(2)} across ${row.purchase_qty} purchases, all refunded. Could be test or genuine return.`,
    };
  }

  // Everything else: active, no flag
  return {
    test_flag: null,
    included_in_active_count: true,
    reason: "Active terminal with positive merchant receivable",
  };
}

/**
 * Parse numeric values from PayPilot export format.
 * Handles formats like "1,092.47", "(0.01)" (negative in parens), "0.00"
 */
export function parsePayPilotAmount(value: string | number | null): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  
  let str = value.toString().trim();
  let negative = false;
  
  // Handle parentheses notation for negatives: (0.01)
  if (str.startsWith("(") && str.endsWith(")")) {
    negative = true;
    str = str.slice(1, -1);
  }
  
  // Remove commas
  str = str.replace(/,/g, "");
  
  // Remove dollar signs
  str = str.replace(/\$/g, "");
  
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  
  return negative ? -num : num;
}
