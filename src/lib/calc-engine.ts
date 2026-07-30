/**
 * CodePay Billing Calculation Engine
 * 
 * Calculates the billing total for a client for a given month
 * based on their active rate plan and active unit count.
 * 
 * PER-LOCATION CAP LOGIC:
 * A location cap (e.g. $20/location) means any single location whose
 * normal per-unit billing exceeds the cap is charged exactly the cap amount.
 * Terminals NOT in capped locations are still billed at the normal rate.
 * 
 * Formula: total = (capped_locations × cap_amount) + (remaining_units × rate)
 * Where remaining_units = total_units - units_in_capped_locations
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
  // For per_location cap:
  cappedLocations?: number;       // How many locations hit the cap
  unitsInCappedLocations?: number; // Total terminals across those capped locations
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
    cappedLocationAmount?: number;
    remainingUnits?: number;
    remainingAmount?: number;
    perLocationCapNote?: string;
  };
  error?: string;
}

/**
 * Core calculation: given active_units and a rate plan, compute the total.
 * 
 * Per-location cap:
 *   total = (cappedLocations × cap_amount) + billedNormally(remaining_units)
 *   remaining_units = activeUnits - unitsInCappedLocations
 */
export function calculateTotal(input: CalcInput): CalcResult {
  const { activeUnits, ratePlan } = input;

  if (activeUnits === 0) {
    return { total: 0, breakdown: {} };
  }

  // Per-location cap: split into capped portion + remaining portion
  if (ratePlan.cap_amount !== null && ratePlan.cap_scope === "per_location") {
    const cappedLocs = input.cappedLocations || 0;
    const unitsInCapped = input.unitsInCappedLocations || 0;

    if (cappedLocs === 0 && unitsInCapped === 0) {
      // No location data entered yet — calculate normally (uncapped) and flag
      const normalCalc = calcNormal(activeUnits, ratePlan);
      return {
        total: normalCalc.total,
        breakdown: {
          ...normalCalc.breakdown,
          capApplied: false,
          perLocationCapNote: `Enter capped locations & their terminal count`,
        },
      };
    }

    // Capped portion
    const cappedAmount = cappedLocs * ratePlan.cap_amount;

    // Remaining terminals billed at normal rate
    const remainingUnits = Math.max(activeUnits - unitsInCapped, 0);
    const remainingCalc = calcNormal(remainingUnits, ratePlan);

    // For remaining units with per_client cap, don't apply the client-level cap
    // since per_location already handles capping
    const total = Math.round((cappedAmount + remainingCalc.total) * 100) / 100;

    return {
      total,
      breakdown: {
        capApplied: true,
        cappedLocationAmount: cappedAmount,
        remainingUnits,
        remainingAmount: remainingCalc.total,
        perLocationCapNote: `${cappedLocs} loc × $${ratePlan.cap_amount} = $${cappedAmount.toFixed(2)} + ${remainingUnits} units × rate = $${remainingCalc.total.toFixed(2)}`,
        ...remainingCalc.breakdown,
      },
    };
  }

  // Standard calculation (no per-location cap)
  const result = calcNormal(activeUnits, ratePlan);
  let total = result.total;
  const breakdown = result.breakdown;

  // Apply per-client cap if set
  if (ratePlan.cap_amount !== null && (ratePlan.cap_scope === "per_client" || ratePlan.cap_scope === null)) {
    breakdown.preCap = total;
    if (total > ratePlan.cap_amount) {
      total = ratePlan.cap_amount;
      breakdown.capApplied = true;
    } else {
      breakdown.capApplied = false;
    }
  }

  total = Math.round(total * 100) / 100;
  return { total, breakdown };
}

/**
 * Calculate without any cap logic — pure rate × units.
 */
function calcNormal(units: number, ratePlan: RatePlan): { total: number; breakdown: CalcResult["breakdown"] } {
  if (units === 0) return { total: 0, breakdown: {} };

  const breakdown: CalcResult["breakdown"] = {};

  if (ratePlan.pricing_model === "flat_per_unit") {
    if (ratePlan.flat_rate === null) {
      return { total: 0, breakdown: {} };
    }
    const total = units * ratePlan.flat_rate;
    breakdown.flatUnits = units;
    breakdown.flatAmount = total;
    return { total, breakdown };
  }

  if (ratePlan.pricing_model === "tiered_per_unit") {
    if (ratePlan.tier_1_rate === null || ratePlan.tier_1_unit_count === null || ratePlan.tier_2_rate === null) {
      return { total: 0, breakdown: {} };
    }
    const tier1Units = Math.min(units, ratePlan.tier_1_unit_count);
    const tier2Units = Math.max(units - ratePlan.tier_1_unit_count, 0);
    const tier1Amount = tier1Units * ratePlan.tier_1_rate;
    const tier2Amount = tier2Units * ratePlan.tier_2_rate;

    breakdown.tier1Units = tier1Units;
    breakdown.tier1Amount = tier1Amount;
    breakdown.tier2Units = tier2Units;
    breakdown.tier2Amount = tier2Amount;

    return { total: tier1Amount + tier2Amount, breakdown };
  }

  return { total: 0, breakdown: {} };
}

/**
 * Find the active rate plan for a client on a given billing month.
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
  
  active.sort((a, b) => new Date(b.effective_start).getTime() - new Date(a.effective_start).getTime());
  return active[0];
}
