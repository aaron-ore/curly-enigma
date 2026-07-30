/**
 * CodePay Billing Calculation Engine (spec section 4)
 * 
 * Calculates the billing total for a client for a given month
 * based on their active rate plan and active unit count.
 */

export interface RatePlan {
  id: number;
  client_id: number;
  effective_start: string;
  effective_end: string | null;
  pricing_model: "flat_per_unit" | "tiered_per_unit";
  flat_rate: number | null;
  tier_1_rate: number | null;
  tier_1_unit_count: number | null;
  tier_2_rate: number | null;
  cap_amount: number | null;
  cap_scope: "per_client" | "per_location" | null;
  notes: string | null;
}

export interface CalcInput {
  activeUnits: number;
  ratePlan: RatePlan;
}

export interface CalcResult {
  total: number;
  breakdown: {
    tier1Units?: number;
    tier1Amount?: number;
    tier2Units?: number;
    tier2Amount?: number;
    flatUnits?: number;
    flatAmount?: number;
    preCap?: number;
    capApplied?: boolean;
  };
  error?: string;
}

/**
 * Core calculation: given active_units and a rate plan, compute the total.
 * Implements spec section 4 exactly.
 */
export function calculateTotal(input: CalcInput): CalcResult {
  const { activeUnits, ratePlan } = input;

  // Zero-usage months: calculated_total = 0
  if (activeUnits === 0) {
    return { total: 0, breakdown: {} };
  }

  let total = 0;
  const breakdown: CalcResult["breakdown"] = {};

  if (ratePlan.pricing_model === "flat_per_unit") {
    if (ratePlan.flat_rate === null) {
      return { total: 0, breakdown: {}, error: "flat_rate is null for flat_per_unit plan" };
    }
    total = activeUnits * ratePlan.flat_rate;
    breakdown.flatUnits = activeUnits;
    breakdown.flatAmount = total;
  } else if (ratePlan.pricing_model === "tiered_per_unit") {
    if (ratePlan.tier_1_rate === null || ratePlan.tier_1_unit_count === null || ratePlan.tier_2_rate === null) {
      return { total: 0, breakdown: {}, error: "tiered rates not fully configured" };
    }
    const tier1Units = Math.min(activeUnits, ratePlan.tier_1_unit_count);
    const tier2Units = Math.max(activeUnits - ratePlan.tier_1_unit_count, 0);
    const tier1Amount = tier1Units * ratePlan.tier_1_rate;
    const tier2Amount = tier2Units * ratePlan.tier_2_rate;
    total = tier1Amount + tier2Amount;

    breakdown.tier1Units = tier1Units;
    breakdown.tier1Amount = tier1Amount;
    breakdown.tier2Units = tier2Units;
    breakdown.tier2Amount = tier2Amount;
  }

  // Apply cap if set (per spec step 4)
  const preCap = total;
  breakdown.preCap = preCap;

  if (ratePlan.cap_amount !== null) {
    if (ratePlan.cap_scope === "per_client" || ratePlan.cap_scope === null) {
      // per_client cap: simple MIN
      total = Math.min(total, ratePlan.cap_amount);
    }
    // per_location cap requires location-level breakdown — handled at a higher level
    // For now, if cap_scope is per_location but no location data, fall back to per_client
    if (ratePlan.cap_scope === "per_location") {
      // Without location-level data, apply as per_client (spec section 7 item 4 recommendation)
      total = Math.min(total, ratePlan.cap_amount);
    }
    breakdown.capApplied = total < preCap;
  }

  // Round to 2 decimal places (half-up)
  total = Math.round(total * 100) / 100;

  return { total, breakdown };
}

/**
 * Find the active rate plan for a client on a given billing month.
 * Returns null if no active plan exists (should flag as "no rate configured").
 */
export function findActiveRatePlan(ratePlans: RatePlan[], billingMonth: string): RatePlan | null {
  const monthDate = new Date(billingMonth);
  
  const active = ratePlans.filter((rp) => {
    const start = new Date(rp.effective_start);
    if (start > monthDate) return false;
    if (rp.effective_end) {
      const end = new Date(rp.effective_end);
      if (end < monthDate) return false;
    }
    return true;
  });

  if (active.length === 0) return null;
  
  // If multiple overlap, use the most recently started one
  active.sort((a, b) => new Date(b.effective_start).getTime() - new Date(a.effective_start).getTime());
  return active[0];
}
