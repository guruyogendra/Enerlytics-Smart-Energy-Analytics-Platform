import { describe, it, expect } from 'vitest';
import {
  calculateTelescopicBill,
  calculateUnitsFromBill,
  calculateDomesticUnitsFromBill,
  calculateDomesticBill,
  calculateCommercialBill,
  calculateIndustrialBill,
  calculatePaybackPeriod,
  calculateNPVandBCR,
  calculateBreakEven,
  calculateROI,
  generateSolarRecommendation,
  domesticTariff,
  commercialEnergyTariff,
} from './calculations';

/*
 * Characterisation tests: they pin the EXISTING formulas and built-in rates so
 * later refactoring (e.g. moving tariffs to the database) cannot silently
 * change results. Expected values are worked out by hand from the formulas.
 * The built-in rates themselves are NOT verified against any official tariff
 * order — see docs/TARIFF_DATA_REVIEW.md.
 */

describe('calculateTelescopicBill (domestic slabs)', () => {
  it('returns zero for zero units', () => {
    expect(calculateTelescopicBill(0, domesticTariff)).toEqual({ bill: 0, breakdown: [] });
  });

  it('charges each slab at its own rate', () => {
    // 30×1.90 + 45×3.00 + 25×4.50 = 57 + 135 + 112.5
    const { bill, breakdown } = calculateTelescopicBill(100, domesticTariff);
    expect(bill).toBeCloseTo(304.5, 6);
    expect(breakdown.map((b) => b.slab)).toEqual(['1-30', '31-75', '76-100']);
    expect(breakdown.map((b) => b.units)).toEqual([30, 45, 25]);
  });

  it('applies the top slab above 400 units', () => {
    // 57 + 135 + 225 + 600 + 1531.25 + 100×9.75
    expect(calculateTelescopicBill(500, domesticTariff).bill).toBeCloseTo(3523.25, 6);
  });

  it('handles commercial slabs', () => {
    // 50×5.40 + 50×7.65 + 50×9.05
    expect(calculateTelescopicBill(150, commercialEnergyTariff).bill).toBeCloseTo(1105, 6);
  });
});

describe('calculateUnitsFromBill (reverse calculation)', () => {
  it('returns zero for a non-positive bill', () => {
    expect(calculateUnitsFromBill(0, domesticTariff).units).toBe(0);
    expect(calculateUnitsFromBill(-50, domesticTariff).units).toBe(0);
  });

  it.each([10, 75, 100, 250, 500, 1200])('round-trips %d units (domestic)', (units) => {
    const { bill } = calculateTelescopicBill(units, domesticTariff);
    expect(calculateDomesticUnitsFromBill(bill).units).toBeCloseTo(units, 1);
  });

  it('round-trips very large bills (20,000 units, about ₹1.94 lakh)', () => {
    const { bill } = calculateTelescopicBill(20000, domesticTariff);
    expect(calculateDomesticUnitsFromBill(bill).units).toBeCloseTo(20000, 1);
  });
});

describe('calculateDomesticBill', () => {
  it('sums daily usage ×30 days plus monthly occasional usage', () => {
    // daily: 100 W × 2 × 5 h = 1000 Wh/day → 30 kWh; occasional: 1000 W × 1 × 10 h = 10 kWh
    const result = calculateDomesticBill(
      [{ name: 'Fan', rating: 100, quantity: 2, hours: 5 }],
      [{ name: 'Iron', rating: 1000, quantity: 1, hours: 10 }]
    );
    expect(result.totalUnits).toBeCloseTo(40, 6);
    expect(result.totalBill).toBeCloseTo(30 * 1.9 + 10 * 3.0, 6); // 87
  });

  it('returns zero for no appliances', () => {
    const result = calculateDomesticBill([], []);
    expect(result.totalUnits).toBe(0);
    expect(result.totalBill).toBe(0);
  });
});

describe('calculateCommercialBill', () => {
  const daily = [{ name: 'Lights', rating: 1000, quantity: 1, hours: 1 }]; // 30 kWh/month
  const occasional = [{ name: 'AC', rating: 1000, quantity: 1, hours: 10 }]; // 10 kWh/month

  it('uses telescopic slabs for standard commercial', () => {
    const r = calculateCommercialBill(daily, occasional, 'standard');
    expect(r.totalUnits).toBeCloseTo(40, 6);
    expect(r.totalBill).toBeCloseTo(40 * 5.4, 6);
  });

  it.each([
    ['advertising', 12.25],
    ['function_halls', 12.25],
    ['startup_power', 12.25],
    ['electric_vehicles', 6.7],
    ['green_power', 12.25],
  ])('uses a flat rate for %s', (type, rate) => {
    const r = calculateCommercialBill(daily, occasional, type);
    expect(r.totalBill).toBeCloseTo(40 * rate, 6);
    expect(r.breakdown).toHaveLength(1);
  });

  it('does NOT apply the ₹75/kW fixed charge (current behaviour, flagged for review)', () => {
    const r = calculateCommercialBill(daily, occasional, 'standard');
    expect(r.breakdown.some((b) => /fixed/i.test(b.slab))).toBe(false);
  });
});

describe('calculateIndustrialBill', () => {
  it('LT general: fixed ₹75/kW + energy at 6.70', () => {
    const r = calculateIndustrialBill(1000, 10, 'industry_general', 'LT');
    expect(r.fixedCharge).toBe(750);
    expect(r.energyCharge).toBeCloseTo(6700, 6);
    expect(r.totalBill).toBeCloseTo(7450, 6);
  });

  it('HT 11 kV general uses the selected demand/TOD rate for ALL units', () => {
    const r = calculateIndustrialBill(1000, 0, 'industry_general', '11kV', 'peak', 'high_demand');
    expect(r.energyCharge).toBeCloseTo(7800, 6);
    expect(r.fixedCharge).toBe(0);
    expect(r.todType).toBeDefined();
  });

  it('cottage industries are charged nothing', () => {
    const r = calculateIndustrialBill(1000, 10, 'cottage_industries', 'LT');
    expect(r.totalBill).toBe(0);
  });

  it('industrial colonies 11 kV uses 14.60 (value flagged for verification)', () => {
    expect(calculateIndustrialBill(100, 0, 'industrial_colonies', '11kV').energyCharge).toBeCloseTo(1460, 6);
  });

  it('falls back to a rate of 0 for an unavailable supply type (e.g. colonies on LT)', () => {
    expect(calculateIndustrialBill(100, 0, 'industrial_colonies', 'LT').energyCharge).toBe(0);
  });
});

describe('financial helpers', () => {
  it('payback period in years', () => {
    expect(calculatePaybackPeriod(500000, 8000)).toBeCloseTo(5.2083, 4);
  });

  it('NPV and BCR at 10% over 5 years', () => {
    // annuity factor (1 − 1.1^−5)/0.1 = 3.790787 → PV = 113,723.60
    const { npv, bcr } = calculateNPVandBCR(100000, 30000, 5, 0.1);
    expect(npv).toBeCloseTo(13723.6, 1);
    expect(bcr).toBeCloseTo(1.137236, 5);
  });

  it('NPV with a 0% discount rate equals undiscounted net savings', () => {
    const { npv, bcr } = calculateNPVandBCR(100000, 30000, 5, 0);
    expect(npv).toBeCloseTo(50000, 6);
    expect(bcr).toBeCloseTo(1.5, 6);
  });

  it('break-even units and revenue', () => {
    expect(calculateBreakEven(100000, 15, 25)).toEqual({ breakEvenUnits: 10000, breakEvenRevenue: 250000 });
  });

  it('ROI percentage', () => {
    expect(calculateROI(500000, 150000)).toBeCloseTo(30, 6);
  });
});

describe('known input-validation gaps (current behaviour, to be fixed in Phase 4)', () => {
  it('payback with zero savings returns Infinity', () => {
    expect(calculatePaybackPeriod(500000, 0)).toBe(Infinity);
  });

  it('break-even with price equal to variable cost returns Infinity', () => {
    expect(calculateBreakEven(100000, 25, 25).breakEvenUnits).toBe(Infinity);
  });

  it('break-even with price below variable cost returns a negative number', () => {
    expect(calculateBreakEven(100000, 30, 25).breakEvenUnits).toBeLessThan(0);
  });

  it('ROI with zero investment returns Infinity', () => {
    expect(calculateROI(0, 1000)).toBe(Infinity);
  });
});

describe('generateSolarRecommendation', () => {
  it('does not recommend solar at or below ₹4,000/month', () => {
    const r = generateSolarRecommendation(4000);
    expect(r.recommendSolar).toBe(false);
    expect(r.requiredKW).toBe(0);
  });

  it('sizes, costs and computes payback for a ₹6,000 domestic bill', () => {
    // units: bill(400) = 2548.25; (6000 − 2548.25)/9.75 = 354.03 → ≈ 754.03 units
    // kW = ceil(754.03/120) = 7 → generation 7×4×30 = 840 kWh
    // offset = min(840, 0.9×754.03 = 678.62); remaining 75.40 units → bill ≈ 193.82
    // investment (7 kW table average) = 320,000
    const r = generateSolarRecommendation(6000, 'domestic');
    expect(r.recommendSolar).toBe(true);
    expect(r.monthlyUnits).toBeCloseTo(754.03, 1);
    expect(r.requiredKW).toBe(7);
    expect(r.estimatedGeneration).toBe(840);
    expect(r.investment).toBe(320000);
    expect(r.savings).toBeCloseTo(6000 - 193.82, 0);
    expect(r.paybackPeriod).toBeCloseTo(320000 / (r.savings * 12), 6);
  });

  it('extrapolates cost at ₹46,000/kW above 10 kW', () => {
    const r = generateSolarRecommendation(20000, 'domestic');
    expect(r.requiredKW).toBeGreaterThan(10);
    expect(r.investment).toBe(r.requiredKW * 46000);
  });
});
