export interface Appliance {
  name: string;
  rating: number; // in watts
  quantity: number;
  hours: number; // hours per day or per month
}

export interface TariffSlab {
  threshold: number;
  rate: number;
}

export interface DomesticResult {
  totalUnits: number;
  totalBill: number;
  breakdown: Array<{
    slab: string;
    units: number;
    rate: number;
    amount: number;
  }>;
}

export interface CommercialResult {
  totalUnits: number;
  totalBill: number;
  breakdown: Array<{
    slab: string;
    units: number;
    rate: number;
    amount: number;
  }>;
}

export interface IndustrialResult {
  totalUnits: number;
  totalBill: number;
  fixedCharge: number;
  energyCharge: number;
  breakdown: Array<{
    slab: string;
    units: number;
    rate: number;
    amount: number;
  }>;
  category: string;
  supplyType: string;
  todType?: string;
}

export interface CommercialType {
  id: string;
  name: string;
  rate: number;
}

export interface EstimationResult {
  paybackPeriod?: number;
  npv?: number;
  bcr?: number;
  breakEvenUnits?: number;
  breakEvenRevenue?: number;
  roi?: number;
}

export interface SolarRecommendation {
  recommendSolar: boolean;
  requiredKW: number;
  estimatedGeneration: number;
  monthlyUnits: number;
  savings: number;
  investment: number;
  paybackPeriod: number;
  actualBill: number;
  breakdown: Array<{
    slab: string;
    units: number;
    rate: number;
    amount: number;
  }>;
}

/** A JSON-serialisable object as stored in the jsonb inputs/results columns. */
export type JsonObject = { [key: string]: unknown };

/**
 * Fields the History page reads from stored results. All optional because
 * rows are user data written by different calculators over time.
 */
export interface StoredResults extends JsonObject {
  totalUnits?: number;
  totalBill?: number;
  fixedCharge?: number;
  energyCharge?: number;
  paybackPeriod?: number;
  totalSavings25Years?: number;
  requiredKW?: number;
  savings?: number;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  is_admin: boolean;
  created_at: string;
}

export interface CalculationHistory {
  id: string;
  user_id: string;
  calculation_type: 'domestic' | 'commercial' | 'industrial';
  inputs: JsonObject;
  results: StoredResults;
  created_at: string;
}

export interface EstimationHistory {
  id: string;
  user_id: string;
  estimation_type: 'payback' | 'costbenefit' | 'breakeven' | 'roi' | 'unified';
  inputs: JsonObject;
  results: StoredResults;
  created_at: string;
}

// Recommendation history for saving solar or other recommendations
export interface RecommendationHistory {
  id: string;
  user_id: string;
  recommendation_type: 'solar';
  inputs: JsonObject;
  results: StoredResults;
  created_at: string;
}

export type AnyHistoryItem = CalculationHistory | EstimationHistory | RecommendationHistory;

export interface TariffSettings {
  id: string;
  tariff_type: 'domestic' | 'commercial' | 'industrial';
  tariff_data: JsonObject;
  updated_by: string;
  updated_at: string;
}
