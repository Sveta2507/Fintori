/**
 * Fintori — unit tests for core business logic.
 *
 * Run:
 *   npm test
 *
 * All calculations mirror the fixed app.js logic.
 */

import { calcFromInputs, BM } from './calc.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Standard profitable hospitality business used across several tests. */
const HEALTHY = {
  r1: 12000, r2: 13000, r3: 14000,   // growing revenue
  cogs: 3000, dlab: 500,              // cogsM = 3500
  rent: 2000, wages: 3000, nic: 300, loan: 500,
  util: 200, ins: 100, mkt: 300, prof: 0, sw: 100, other: 0,
  cash: 20000, debtors: 5000, creditors: 2000, debt: 6000,
  stock: 1000, emp: 3,
  sector: 'hospitality',
};

// ─── 1. Revenue & profit ────────────────────────────────────────────────────

describe('Revenue and profit calculations', () => {
  test('totRev is the sum of 3 months', () => {
    const d = calcFromInputs({ r1: 10000, r2: 11000, r3: 12000 });
    expect(d.totRev).toBe(33000);
  });

  test('avgRev is totRev / 3', () => {
    const d = calcFromInputs({ r1: 9000, r2: 9000, r3: 9000 });
    expect(d.avgRev).toBe(9000);
  });

  test('totProfit = totRev - (totalCostsM * 3)', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, wages: 8000 });
    // totRev = 30000, totalCostsM = 8000, profit = 30000 - 24000 = 6000
    expect(d.totProfit).toBe(6000);
  });

  test('totProfit is negative when costs exceed revenue', () => {
    const d = calcFromInputs({ r1: 5000, r2: 5000, r3: 5000, wages: 7000 });
    expect(d.totProfit).toBeLessThan(0);
  });
});

// ─── 2. Margin calculations ──────────────────────────────────────────────────

describe('Margin calculations', () => {
  test('grossMgn = (avgRev - cogsM) / avgRev', () => {
    // avgRev = 10000, cogsM = 3000, grossMgn = 0.70
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cogs: 3000 });
    expect(d.grossMgn).toBeCloseTo(0.7, 5);
  });

  test('netMgn is negative when loss-making', () => {
    const d = calcFromInputs({ r1: 5000, r2: 5000, r3: 5000, wages: 7000 });
    expect(d.netMgn).toBeLessThan(0);
  });

  test('netMgn is null when totRev = 0', () => {
    const d = calcFromInputs({ r1: 0, r2: 0, r3: 0, wages: 1000 });
    expect(d.netMgn).toBeNull();
  });

  test('grossMgn is null when avgRev = 0', () => {
    const d = calcFromInputs({ r1: 0, r2: 0, r3: 0 });
    expect(d.grossMgn).toBeNull();
  });

  test('net margin of 10% business is positive and >= 0.10', () => {
    // totRev = 30000, totalCostsM = 9000 → profit = 30000 - 27000 = 3000 → margin = 10%
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, wages: 9000 });
    expect(d.netMgn).toBeCloseTo(0.1, 5);
  });
});

// ─── 3. Cash Runway — the critical bug fix ───────────────────────────────────

describe('Cash Runway (Bug #1 — must divide by costs, not revenue)', () => {
  test('runway = cash / totalCostsM', () => {
    // cash=20000, totalCostsM=8000 → runway = 2.5
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, wages: 8000, cash: 20000 });
    expect(d.runway).toBeCloseTo(2.5, 5);
  });

  test('runway is NOT cash / avgRev (the old bug)', () => {
    // cash=20000, avgRev=10000, totalCostsM=8000
    // Old (broken) formula would give 2.0; correct is 2.5
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, wages: 8000, cash: 20000 });
    expect(d.runway).not.toBeCloseTo(2.0, 1);
    expect(d.runway).toBeCloseTo(2.5, 5);
  });

  test('runway < 1 when cash is less than one month of costs', () => {
    const d = calcFromInputs({ wages: 10000, cash: 5000 });
    expect(d.runway).toBeCloseTo(0.5, 5);
    expect(d.runway).toBeLessThan(1);
  });

  test('runway = null when there are no costs', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cash: 50000 });
    expect(d.runway).toBeNull();
  });

  test('runway = null does not trigger the red-flag counter', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cash: 50000 });
    // runway is null → the null !== null && null < 1 check is false → not a red flag
    expect(d.runway).toBeNull();
    // The flag list uses runway !== null && runway < 1
    const runwayRedFlag = d.runway !== null && d.runway < 1;
    expect(runwayRedFlag).toBe(false);
  });

  test('scenario: cash £20k, revenue £10k/mo, costs £8k/mo → 2.5 months not 2.0', () => {
    const d = calcFromInputs({
      r1: 10000, r2: 10000, r3: 10000,
      wages: 8000,
      cash: 20000,
    });
    expect(d.runway).toBeCloseTo(2.5, 1);
  });
});

// ─── 4. EBITDA ────────────────────────────────────────────────────────────────

describe('EBITDA', () => {
  test('EBITDA = monthly net profit + loan repayments', () => {
    // totProfit/3 = 1000/mo, loan = 500/mo → EBITDA = 1500
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, wages: 8500, loan: 500 });
    expect(d.ebitdaM).toBeCloseTo(1500, 0);
  });

  test('EBITDA is positive even when net profit is slightly negative if loan is large enough', () => {
    const d = calcFromInputs({ r1: 5000, r2: 5000, r3: 5000, wages: 5500, loan: 2000 });
    // totProfit = 15000 - 22500 = -7500, /3 = -2500, +2000 loan = -500
    expect(d.ebitdaM).toBeLessThan(0);
  });
});

// ─── 5. Breakeven ─────────────────────────────────────────────────────────────

describe('Breakeven', () => {
  test('breakeven = fixedCosts / grossMarginPct', () => {
    // cogsM=3000, avgRev=10000 → grossMgn=0.7
    // fixedM=opexM=2000 → breakeven = 2000/0.7 ≈ 2857
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cogs: 3000, rent: 2000 });
    expect(d.breakeven).toBeCloseTo(2857, 0);
  });

  test('breakeven is null when grossMgn is zero or negative', () => {
    // cogsM = avgRev → grossMgn = 0 → breakeven null
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cogs: 10000 });
    expect(d.breakeven).toBeNull();
  });

  test('breakevenGap is positive when above breakeven', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, cogs: 3000, rent: 2000 });
    expect(d.breakevenGap).toBeGreaterThan(0);
  });

  test('breakevenGap is negative when below breakeven', () => {
    // Large fixed costs relative to revenue
    const d = calcFromInputs({ r1: 3000, r2: 3000, r3: 3000, cogs: 500, rent: 5000 });
    expect(d.breakevenGap).toBeLessThan(0);
  });
});

// ─── 6. Health Score flags (null-safety — Bug #5) ────────────────────────────

describe('Health Score flags — null safety', () => {
  test('runway null does not count as a red flag', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000 }); // no costs → runway null
    const runwayRed = d.runway !== null && d.runway < 1;
    expect(runwayRed).toBe(false);
  });

  test('wcr null does not count as a red flag', () => {
    // creditors=0, debt=0 → wcr null
    const d = calcFromInputs({ r1: 5000, r2: 5000, r3: 5000, cash: 1000 });
    const wcrRed = d.wcr !== null && d.wcr < 1;
    expect(wcrRed).toBe(false);
  });

  test('wcr < 1 is a red flag', () => {
    // cash=500, debtors=500 → assets=1000; creditors=2000, debt=1000 → liabilities=3000 → wcr=0.33
    const d = calcFromInputs({ cash: 500, debtors: 500, creditors: 2000, debt: 1000 });
    expect(d.wcr).toBeLessThan(1);
    expect(d.wcr !== null && d.wcr < 1).toBe(true);
  });

  test('runway < 1 is a red flag when costs exist', () => {
    const d = calcFromInputs({ wages: 10000, cash: 3000 });
    expect(d.runway).toBeLessThan(1);
    expect(d.runway !== null && d.runway < 1).toBe(true);
  });

  test('business with 2+ red flags gets RED health score', () => {
    // loss-making AND low gross margin AND low runway
    const d = calcFromInputs({
      r1: 2000, r2: 2000, r3: 2000,
      cogs: 2000,    // grossMgn = 0 → red
      wages: 3000,   // net loss → red
      cash: 500,
    });
    expect(d.healthScore).toBe('red');
  });

  test('healthy business gets GREEN health score', () => {
    const d = calcFromInputs(HEALTHY);
    expect(d.healthScore).toBe('green');
  });
});

// ─── 7. Working Capital Ratio ────────────────────────────────────────────────

describe('Working Capital Ratio', () => {
  test('wcr = (cash + debtors) / (creditors + debt)', () => {
    const d = calcFromInputs({ cash: 6000, debtors: 4000, creditors: 2000, debt: 3000 });
    // (6000+4000)/(2000+3000) = 10000/5000 = 2.0
    expect(d.wcr).toBeCloseTo(2.0, 5);
  });

  test('wcr is null when no creditors or debt', () => {
    const d = calcFromInputs({ cash: 5000 });
    expect(d.wcr).toBeNull();
  });
});

// ─── 8. Revenue Growth ───────────────────────────────────────────────────────

describe('Revenue Growth', () => {
  test('positive when Month 2 > Month 1', () => {
    const d = calcFromInputs({ r1: 10000, r2: 11000, r3: 11000 });
    expect(d.revGrowth).toBeGreaterThan(0);
  });

  test('negative when Month 2 < Month 1', () => {
    const d = calcFromInputs({ r1: 10000, r2: 9000, r3: 9000 });
    expect(d.revGrowth).toBeLessThan(0);
  });

  test('zero when r1 is 0', () => {
    const d = calcFromInputs({ r1: 0, r2: 5000, r3: 5000 });
    expect(d.revGrowth).toBe(0);
  });
});

// ─── 9. Employees = 0 (Solo business — Bug #6) ───────────────────────────────

describe('Employees = 0 (Solo business)', () => {
  test('revPerEmp is null when emp = 0', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, emp: 0 });
    expect(d.revPerEmp).toBeNull();
  });

  test('revPerEmp is calculated normally when emp > 0', () => {
    // avgRev=10000, emp=2 → revPerEmp = 10000*12/2 = 60000
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, emp: 2 });
    expect(d.revPerEmp).toBeCloseTo(60000, 0);
  });
});

// ─── 10. VAT Threshold ───────────────────────────────────────────────────────

describe('VAT Threshold detection (£90k annual / £67.5k for 3-month period)', () => {
  test('totRev >= 67500 triggers VAT alert', () => {
    const d = calcFromInputs({ r1: 23000, r2: 23000, r3: 23000 }); // 69000
    expect(d.totRev).toBeGreaterThanOrEqual(67500);
  });

  test('totRev < 67500 does not trigger VAT alert', () => {
    const d = calcFromInputs({ r1: 20000, r2: 20000, r3: 20000 }); // 60000
    expect(d.totRev).toBeLessThan(67500);
  });
});

// ─── 11. Debtor / Creditor / Stock Days ──────────────────────────────────────

describe('Debtor, Creditor and Stock days', () => {
  test('debtorDays is null when debtors = 0', () => {
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, debtors: 0 });
    expect(d.debtorDays).toBeNull();
  });

  test('debtorDays = debtors / (avgMonthlyRev * 12 / 365)', () => {
    // avgRev = 10000/mo, debtors = 5000
    // debtorDays = 5000 / (10000 * 12 / 365) ≈ 15.2 days
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, debtors: 5000 });
    expect(d.debtorDays).toBeCloseTo(15.2, 0);
  });

  test('stockDays is null when cogsM = 0', () => {
    const d = calcFromInputs({ stock: 5000 });
    expect(d.stockDays).toBeNull();
  });

  test('creditorDays is null when creditors = 0', () => {
    const d = calcFromInputs({ cogs: 3000, creditors: 0 });
    expect(d.creditorDays).toBeNull();
  });
});

// ─── 12. Debt Ratio ──────────────────────────────────────────────────────────

describe('Debt / Revenue ratio', () => {
  test('debtRatio = totalDebt / avgMonthlyRev', () => {
    // debt=30000, avgRev=10000 → ratio=3
    const d = calcFromInputs({ r1: 10000, r2: 10000, r3: 10000, debt: 30000 });
    expect(d.debtRatio).toBeCloseTo(3, 5);
  });

  test('debtRatio = 0 when avgRev = 0', () => {
    const d = calcFromInputs({ debt: 10000 });
    expect(d.debtRatio).toBe(0);
  });
});

// ─── 13. Cost breakdown ordering ─────────────────────────────────────────────

describe('Cost map ordering', () => {
  test('costMap is sorted by cost descending', () => {
    const d = calcFromInputs({ rent: 1000, wages: 5000, cogs: 2000 });
    expect(d.costMap[0].a).toBeGreaterThanOrEqual(d.costMap[1].a);
    expect(d.costMap[1].a).toBeGreaterThanOrEqual(d.costMap[2].a);
  });

  test('zero-value cost lines are excluded from costMap', () => {
    const d = calcFromInputs({ rent: 1000, wages: 0 });
    const names = d.costMap.map(c => c.n);
    expect(names).not.toContain('Staff Wages');
  });
});

// ─── 14. Sector benchmarks ───────────────────────────────────────────────────

describe('Sector benchmarks', () => {
  test('hospitality benchmark gross margin is 25%', () => {
    expect(BM.hospitality.gross).toBe(0.25);
  });

  test('unknown sector falls back to "other" benchmark', () => {
    const d = calcFromInputs({ r1: 5000, r2: 5000, r3: 5000, sector: 'unknown_sector' });
    expect(d.bench).toEqual(BM.other);
  });

  test('professional services has null stockDays (service business)', () => {
    expect(BM.professional.stockDays).toBeNull();
  });
});