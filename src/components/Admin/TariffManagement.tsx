import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { Settings, Info, AlertTriangle } from 'lucide-react';
import {
  domesticTariff,
  commercialEnergyTariff,
  commercialFixedRate,
  industrialFixedRate,
  industrialTariffRates,
} from '../../utils/calculations';
import { TariffSlab } from '../../types';

/**
 * Tariff Management (interim, read-only).
 *
 * The rates shown here are read directly from src/utils/calculations.ts, which
 * is what every calculator uses today, so this page can no longer drift from
 * the real calculation values. The previous Edit / Save buttons had no
 * handlers and the "Recent Tariff Changes" list was hard-coded sample text;
 * both have been removed. Editable, database-backed tariffs (per state /
 * provider / effective date) will be added once the existing Supabase schema
 * and RLS policies have been reviewed.
 */

const slabRows = (slabs: TariffSlab[]) => {
  let prev = 0;
  return slabs.map(({ threshold, rate }) => {
    const label = Number.isFinite(threshold) ? `${prev + 1}–${threshold}` : `Above ${prev}`;
    prev = threshold;
    return { label, rate };
  });
};

const formatSupply = (key: string) => (key === 'LT' ? 'LT' : `HT ${key}`);
const formatCategory = (key: string) =>
  key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Flattens the nested industrial rate table into display rows. */
const industrialRows = () => {
  const rows: Array<{ category: string; supply: string; detail: string; rate: number }> = [];
  for (const [category, bySupply] of Object.entries(industrialTariffRates)) {
    for (const [supply, value] of Object.entries(bySupply)) {
      if (typeof value === 'number') {
        rows.push({ category: formatCategory(category), supply: formatSupply(supply), detail: '—', rate: value });
      } else {
        for (const [demand, byTod] of Object.entries(value as Record<string, Record<string, number>>)) {
          for (const [tod, rate] of Object.entries(byTod)) {
            rows.push({
              category: formatCategory(category),
              supply: formatSupply(supply),
              detail: `${formatCategory(demand)} · ${formatCategory(tod)}`,
              rate,
            });
          }
        }
      }
    }
  }
  return rows;
};

const commercialFlatRates = [
  { name: 'Advertising Hoardings', rate: 12.25 },
  { name: 'Function Halls / Auditoriums', rate: 12.25 },
  { name: 'Startup Power', rate: 12.25 },
  { name: 'Electric Vehicles / Charging Stations', rate: 6.7 },
  { name: 'Green Power', rate: 12.25 },
];

const TariffManagement: React.FC = () => {
  const { isAdmin } = useAuth();
  const [dbTariffCount, setDbTariffCount] = useState<number | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('tariff_settings')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) setDbError(error.message);
        else setDbTariffCount(count ?? 0);
      });
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-8 text-center">
        <div className="text-red-500 mb-4">
          <Settings className="h-16 w-16 mx-auto" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Access Denied</h3>
        <p className="text-gray-600">You need admin privileges to access this page.</p>
      </div>
    );
  }

  const thClass = 'px-4 py-3 text-left text-sm font-medium text-gray-700';
  const tdClass = 'px-4 py-2 text-sm';

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-red-500 to-pink-500 text-white rounded-xl p-6">
        <div className="flex items-center space-x-3">
          <Settings className="h-8 w-8" />
          <div>
            <h2 className="text-2xl font-bold mb-2">Tariff Management</h2>
            <p className="text-red-100">Electricity tariff rates currently used by the calculators</p>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div className="space-y-1">
            <p>
              <strong>Read-only.</strong> These are the built-in rates applied by the Domestic, Commercial and
              Industrial calculators. Editing will be enabled once tariffs are stored per state, provider and
              effective date in the database.
            </p>
            <p>
              The source (state, distribution company and tariff order) of these rates has not been confirmed.
              Verify them against the official tariff order before relying on results.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-xl bg-white p-4 text-sm text-gray-700 shadow">
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500" aria-hidden="true" />
          {dbError ? (
            <span className="text-red-600">Could not read the tariff_settings table: {dbError}</span>
          ) : dbTariffCount === null ? (
            <span>Checking database tariff records…</span>
          ) : (
            <span>
              Database <code>tariff_settings</code> records: <strong>{dbTariffCount}</strong> (not currently used by the
              calculators).
            </span>
          )}
        </div>
      </div>

      {/* Domestic */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Domestic Tariff Slabs (telescopic)</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-green-50">
                <th className={thClass}>Units per month</th>
                <th className={thClass}>Rate (₹/kWh)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {slabRows(domesticTariff).map((row) => (
                <tr key={row.label}>
                  <td className={tdClass}>{row.label}</td>
                  <td className={tdClass}>{row.rate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500">No fixed or customer charges are applied for domestic bills.</p>
      </div>

      {/* Commercial */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Commercial Tariff</h3>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="overflow-x-auto">
            <h4 className="font-medium text-gray-700 mb-2">Standard commercial (telescopic)</h4>
            <table className="w-full">
              <thead>
                <tr className="bg-blue-50">
                  <th className={thClass}>Units per month</th>
                  <th className={thClass}>Rate (₹/kWh)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {slabRows(commercialEnergyTariff).map((row) => (
                  <tr key={row.label}>
                    <td className={tdClass}>{row.label}</td>
                    <td className={tdClass}>{row.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <h4 className="font-medium text-gray-700 mb-2">Special categories (flat rate)</h4>
            <table className="w-full">
              <thead>
                <tr className="bg-blue-50">
                  <th className={thClass}>Category</th>
                  <th className={thClass}>Rate (₹/kWh)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {commercialFlatRates.map((row) => (
                  <tr key={row.name}>
                    <td className={tdClass}>{row.name}</td>
                    <td className={tdClass}>{row.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          A fixed charge of ₹{commercialFixedRate}/kW/month is defined in the code but is <strong>not</strong> currently
          applied to commercial bills.
        </p>
      </div>

      {/* Industrial */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Industrial Tariff</h3>
        <p className="mb-3 text-sm text-gray-700">
          Fixed charge: ₹{industrialFixedRate}/kW/month × sanctioned load (sanctioned load is currently fixed at 0 in the
          calculator, so no fixed charge is applied). Cottage industries: no fixed charge.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-orange-50">
                <th className={thClass}>Category</th>
                <th className={thClass}>Supply</th>
                <th className={thClass}>Demand · Time of day</th>
                <th className={thClass}>Rate (₹/kWh)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {industrialRows().map((row) => (
                <tr key={`${row.category}-${row.supply}-${row.detail}`}>
                  <td className={tdClass}>{row.category}</td>
                  <td className={tdClass}>{row.supply}</td>
                  <td className={tdClass}>{row.detail}</td>
                  <td className={tdClass}>{row.rate.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Tariff Change History</h3>
        <p className="text-sm text-gray-600">
          No change history is recorded yet. Tariff changes will be logged once audit logging is implemented.
        </p>
      </div>
    </div>
  );
};

export default TariffManagement;
