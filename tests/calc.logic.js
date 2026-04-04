/**
 * Pure business-logic extracted from app.js calc().
 * Takes a plain input object instead of reading from the DOM — safe to unit-test.
 */

const BM = {
  hospitality:  { gross: .25,  net: .055, label: 'Hospitality / Food & Drink', stockDays: 14,   debtDays: 21 },
  retail:       { gross: .35,  net: .04,  label: 'Retail — Physical',          stockDays: 45,   debtDays: 30 },
  ecommerce:    { gross: .40,  net: .085, label: 'Retail — E-commerce',        stockDays: 30,   debtDays: 14 },
  construction: { gross: .20,  net: .06,  label: 'Construction',               stockDays: 60,   debtDays: 45 },
  professional: { gross: .60,  net: .20,  label: 'Professional Services',      stockDays: null, debtDays: 30 },
  it:           { gross: .65,  net: .17,  label: 'IT / Technology',            stockDays: null, debtDays: 30 },
  health:       { gross: .50,  net: .115, label: 'Health & Beauty',            stockDays: 30,   debtDays: 21 },
  manufacturing:{ gross: .325, net: .07,  label: 'Manufacturing',              stockDays: 60,   debtDays: 45 },
  transport:    { gross: .20,  net: .05,  label: 'Transport & Logistics',      stockDays: null, debtDays: 30 },
  education:    { gross: .525, net: .15,  label: 'Education / Training',       stockDays: null, debtDays: 30 },
  finance:      { gross: .70,  net: .275, label: 'Financial Services',         stockDays: null, debtDays: 21 },
  other:        { gross: .375, net: .088, label: 'Other / Mixed',              stockDays: 45,   debtDays: 30 },
};

/**
 * @param {object} inputs
 * @param {number}  inputs.r1        - Month 1 revenue (ex-VAT)
 * @param {number}  inputs.r2        - Month 2 revenue (ex-VAT)
 * @param {number}  inputs.r3        - Month 3 revenue (ex-VAT)
 * @param {number}  inputs.cogs      - Materials/Stock per month
 * @param {number}  inputs.dlab      - Direct Labour per month
 * @param {number}  inputs.rent      - Rent per month
 * @param {number}  inputs.wages     - Staff wages per month
 * @param {number}  inputs.nic       - Employer NIC per month
 * @param {number}  inputs.loan      - Loan repayments per month
 * @param {number}  inputs.util      - Utilities per month
 * @param {number}  inputs.ins       - Insurance per month
 * @param {number}  inputs.mkt       - Marketing per month
 * @param {number}  inputs.prof      - Professional fees per month
 * @param {number}  inputs.sw        - Software per month
 * @param {number}  inputs.other     - Other expenses per month
 * @param {number}  inputs.cash      - Current cash balance
 * @param {number}  inputs.debtors   - Accounts receivable
 * @param {number}  inputs.creditors - Accounts payable
 * @param {number}  inputs.debt      - Total business debt
 * @param {number}  inputs.stock     - Stock / inventory value
 * @param {number}  inputs.emp       - Number of employees (0 = solo)
 * @param {string}  inputs.sector    - Sector key (e.g. 'hospitality')
 */
function calcFromInputs(inputs) {
  const {
    r1 = 0, r2 = 0, r3 = 0,
    cogs = 0, dlab = 0,
    rent = 0, wages = 0, nic = 0, loan = 0,
    util = 0, ins = 0, mkt = 0, prof = 0, sw = 0, other = 0,
    cash = 0, debtors = 0, creditors = 0, debt = 0, stock = 0,
    emp = 1,
    sector = 'other',
  } = inputs;

  const totRev = r1 + r2 + r3;
  const avgRev = totRev / 3;

  const cogsM = cogs + dlab;
  const opexM = rent + wages + nic + loan + util + ins + mkt + prof + sw + other;
  const totalCostsM = cogsM + opexM;
  const totProfit = totRev - (totalCostsM * 3);

  const netMgn   = totRev > 0 ? totProfit / totRev : null;
  const grossProfit = avgRev - cogsM;
  const grossMgn = avgRev > 0 ? grossProfit / avgRev : null;

  const ebitdaM = (totProfit / 3) + loan;

  const fixedM = opexM;
  const breakeven = (grossMgn !== null && grossMgn > 0) ? fixedM / grossMgn : null;
  const breakevenGap = (avgRev > 0 && breakeven !== null) ? avgRev - breakeven : null;

  // FIXED: runway = cash / monthly costs, NOT cash / revenue
  const runway = totalCostsM > 0 ? cash / totalCostsM : null;

  const debtRatio = avgRev > 0 ? debt / avgRev : 0;
  const revGrowth = r1 > 0 ? (r2 - r1) / r1 : 0;

  const debtorDays   = (totRev > 0 && debtors > 0)   ? (debtors   / (totRev / 3 * 12 / 365)) : null;
  const creditorDays = (cogsM > 0  && creditors > 0)  ? (creditors / (cogsM * 12 / 365))       : null;
  const stockDays    = (stock > 0  && cogsM > 0)      ? (stock     / (cogsM * 12 / 365))        : null;
  const revPerEmp    = emp > 0                         ? (avgRev * 12 / emp)                    : null;

  const wcr = (creditors + debt) > 0 ? (cash + debtors) / (creditors + debt) : null;
  const workingCapital = cash + debtors - creditors - debt;

  const bench = BM[sector] || BM.other;

  const costMap = [
    { n: 'Rent & Rates',    a: rent    },
    { n: 'Staff Wages',     a: wages   },
    { n: 'Employer NIC',    a: nic     },
    { n: 'Materials/Stock', a: cogs    },
    { n: 'Direct Labour',   a: dlab    },
    { n: 'Utilities',       a: util    },
    { n: 'Insurance',       a: ins     },
    { n: 'Marketing',       a: mkt     },
    { n: 'Professional',    a: prof    },
    { n: 'Software',        a: sw      },
    { n: 'Loan Repayments', a: loan    },
    { n: 'Other',           a: other   },
  ].filter(c => c.a > 0).sort((a, b) => b.a - a.a);

  // Health score flags (mirrors app.js render())
  const redFlags = [
    netMgn !== null && netMgn < 0,
    grossMgn !== null && grossMgn < 0.15,
    runway !== null && runway < 1,
    wcr !== null && wcr < 1,
    debtRatio > 6,
  ].filter(Boolean).length;

  const amberFlags = [
    netMgn !== null && netMgn >= 0 && netMgn < 0.05,
    runway !== null && runway >= 1 && runway < 3,
    debtorDays !== null && debtorDays > 60,
  ].filter(Boolean).length;

  const healthScore =
    redFlags >= 2 ? 'red' :
    amberFlags >= 2 || redFlags === 1 ? 'amber' :
    'green';

  return {
    r1, r2, r3, totRev, avgRev, totProfit,
    netMgn, grossMgn, ebitdaM,
    breakeven, breakevenGap,
    cash, debt, debtors, creditors, stock, emp,
    runway, debtRatio, revGrowth,
    debtorDays, creditorDays, stockDays,
    revPerEmp, wcr, workingCapital,
    totalCostsM, fixedM, cogsM, opexM,
    sector, bench, costMap,
    redFlags, amberFlags, healthScore,
  };
}

module.exports = { calcFromInputs, BM };
