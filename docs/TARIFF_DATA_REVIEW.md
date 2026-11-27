# Tariff and Assumption Data Review

**Status:** every value below is **unverified**. The code doesn't record which state, distribution company (DISCOM), tariff order or financial year these values come from. Don't treat them as official until each one is checked against a published tariff order. Record that source here, then move the values into the database.

**Location in code:** `src/utils/calculations.ts`. The commercial special-category rates are also listed in `CommercialCalculator.tsx` and in the Admin page.

Columns to fill in during verification: **Source** (tariff order name, number and page) and **Effective from**.

## 1. Domestic energy charges (slab-based)

Units above each slab's lower limit are charged at that slab's rate.

| Slab (kWh/month) | Rate in code (₹/kWh) | Source | Effective from |
|---|---|---|---|
| 0–30 | 1.90 | | |
| 31–75 | 3.00 | | |
| 76–125 | 4.50 | | |
| 126–225 | 6.00 | | |
| 226–400 | 8.75 | | |
| Above 400 | 9.75 | | |

**Missing from the code:**
- Fixed or customer charges
- Minimum charges
- Electricity duty
- Fuel or power purchase cost adjustment charges

Find out whether the tariff that applies includes any of these.

## 2. Commercial

| Item | Value in code | Applied? | Source |
|---|---|---|---|
| 0–50 kWh | ₹5.40 | Yes | |
| 51–100 kWh | ₹7.65 | Yes | |
| 101–300 kWh | ₹9.05 | Yes | |
| 301–500 kWh | ₹9.60 | Yes | |
| Above 500 kWh | ₹10.15 | Yes | |
| Advertising hoardings (flat) | ₹12.25 | Yes | |
| Function halls / auditoriums (flat) | ₹12.25 | Yes | |
| Startup power (flat) | ₹12.25 | Yes | |
| EV charging stations (flat) | ₹6.70 | Yes | |
| Green power (flat) | ₹12.25 | Yes | |
| Fixed charge | ₹75 /kW/month | **No.** It is defined but never used. | |
| Peak time-of-day (6–10 PM) | Listed in the UI with no rate | **No** | |

Open questions:
- Is the standard commercial tariff really charged slab by slab? Some tariff orders charge the whole consumption at the rate of the slab it falls in.
- Is the fixed charge per kW of connected load or of contracted demand?

## 3. Industrial

The fixed charge is ₹75 per kW per month of sanctioned load, except for cottage industries. The calculator always sets sanctioned load to 0 and has no field to enter it, so **no fixed charge is ever applied**.

Industrial energy rates (₹/kWh):

| Category | LT | 11 kV | 33 kV | 132 kV | 220 kV |
|---|---|---|---|---|---|
| Industry (general), LT only | 6.70 | – | – | – | – |
| Seasonal (off-season) | 7.45 | 7.65 | 7.00 | 6.70 | 6.65 |
| Energy-intensive | 3.75 | 5.80 | 5.35 | 4.95 | 4.90 |
| Cottage industries (up to 10 HP) | 0.00 ("free per Govt. Order") | – | – | – | – |
| Industrial colonies | – | **14.60** | 5.35 | 7.00 | 7.00 |

High-tension "Industry (general)" rates by time of day (₹/kWh):

| Voltage | Demand | Peak | Off-peak | Normal |
|---|---|---|---|---|
| 11 kV | High | 7.80 | 5.55 | 6.30 |
| 11 kV | Low | 7.30 | 5.55 | 6.30 |
| 33 kV | High | 7.35 | 5.10 | 5.85 |
| 33 kV | Low | 7.00 | 5.10 | 5.85 |
| 132 kV | High | 6.90 | 4.65 | 5.40 |
| 132 kV | Low | 6.85 | 4.65 | 5.40 |
| 220 kV | High | 6.85 | 4.60 | 5.35 |
| 220 kV | Low | 6.80 | 4.60 | 5.35 |

Time-of-day windows in the UI:
- Peak: 06:00–10:00 and 18:00–22:00
- Off-peak: 10:00–15:00 and 00:00–06:00
- Normal: 15:00–18:00 and 22:00–24:00

**Highest-priority checks:**

1. **Industrial colonies at 11 kV = ₹14.60.** This is about twice the 33 kV, 132 kV and 220 kV values and is very likely a typo.
2. **Energy-intensive LT = ₹3.75.** This is lower than any high-tension value for the same category, which is unusual.
3. **Cottage industries = ₹0.** The note says it's free only for dhobi ghats (laundries) under a Government Order. Check whether every cottage industry should be ₹0.
4. **How time-of-day is modelled.** The calculator charges all consumption at the one period the user picks, instead of splitting usage across peak, off-peak and normal hours.
5. **"High/low demand".** Find out what this means in the source tariff, for example a season or a grid condition.

## 4. Solar assumptions (not tariffs, but shown as results)

| Assumption | Value in code |
|---|---|
| Solar recommended only when the monthly bill is above | ₹4,000 |
| Generation per kW | 4 kWh/day × 30 days = 120 kWh/month |
| System size | ceil(monthly units ÷ 120), minimum 1 kW |
| Share of consumption solar is allowed to offset | 90% |
| Cost per system size, 1–10 kW (₹, midpoint used) | 1: 65–85k · 2: 105–125k · 3: 150–170k · 4: 185–205k · 5: 230–250k · 6: 285–295k · 7: 315–325k · 8: 360–380k · 9: 405–415k · 10: 450–460k |
| Cost above 10 kW | ₹46,000/kW (range shown as ₹45,000–47,000) |

**Not modelled:**
- Subsidies
- Panel degradation over time
- Tariff escalation
- Operation and maintenance costs
- Net-metering or export credit

## 5. Plan

Once verified, tariffs will be stored in the database by state, provider, category and effective date, with a source reference for each, and the calculators will receive the tariff as an input. The values in the code stay only as a clearly labelled fallback. The tests in `src/utils/calculations.test.ts` lock in today's results, so any change to a rate will be deliberate and visible.
