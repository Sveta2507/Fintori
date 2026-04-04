// calc.js — чистая бизнес-логика без DOM-зависимостей

export const BM = {
  hospitality:  { gross: .25, net: .055, label: 'Hospitality / Food & Drink', stockDays: 14, debtDays: 21 },
  retail:       { gross: .35, net: .04,  label: 'Retail — Physical',          stockDays: 45, debtDays: 30 },
  ecommerce:    { gross: .40, net: .085, label: 'Retail — E-commerce',        stockDays: 30, debtDays: 14 },
  construction: { gross: .20, net: .06,  label: 'Construction',               stockDays: 60, debtDays: 45 },
  professional: { gross: .60, net: .20,  label: 'Professional Services',      stockDays: null, debtDays: 30 },
  it:           { gross: .65, net: .17,  label: 'IT / Technology',            stockDays: null, debtDays: 30 },
  health:       { gross: .50, net: .115, label: 'Health & Beauty',            stockDays: 30, debtDays: 21 },
  manufacturing:{ gross: .325,net: .07,  label: 'Manufacturing',              stockDays: 60, debtDays: 45 },
  transport:    { gross: .20, net: .05,  label: 'Transport & Logistics',      stockDays: null, debtDays: 30 },
  education:    { gross: .525,net: .15,  label: 'Education / Training',       stockDays: null, debtDays: 30 },
  finance:      { gross: .70, net: .275, label: 'Financial Services',         stockDays: null, debtDays: 21 },
  other:        { gross: .375,net: .088, label: 'Other / Mixed',              stockDays: 45, debtDays: 30 },
};

export const FIELD_MONETARY = [
  'r1','r2','r3','cogs','dlab','rent','wages','nic','loan',
  'util','ins','mkt','prof','sw','other',
  'cash','debtors','creditors','debt','stock'
];

export function validateField(id, value) {
  const raw = String(value).trim();
  if (raw === '') return 'This field is required.';
  const n = parseFloat(raw);
  if (isNaN(n)) return 'Please enter a valid number.';
  if (FIELD_MONETARY.includes(id)) {
    if (n < 0)        return 'Value cannot be negative.';
    if (n > 10000000) return 'Maximum value is £10,000,000.';
  }
  if (['r1','r2','r3'].includes(id) && n <= 0)
    return 'Revenue must be greater than zero.';
  if (id === 'emp') {
    if (n < 1 || Math.floor(n) !== n) return 'Enter a whole number of 1 or more.';
    if (n > 9999)                      return 'Maximum is 9,999 employees.';
  }
  return null;
}

export function calcFromInputs(inputs) {
  const {
    r1Raw, r2Raw, r3Raw, vatReg,
    cogs, dlab, rent, wages, nic, loan,
    util = 0, ins = 0, mkt = 0, prof = 0, sw = 0, other = 0,
    cash, debtors, creditors, debt, stock, emp,
    sector = 'other'
  } = inputs;

  const d = vatReg ? 1.2 : 1;
  const r1 = r1Raw / d, r2 = r2Raw / d, r3 = r3Raw / d;
  const totRev = r1 + r2 + r3;
  const avgRev = totRev / 3;

  const cogsM   = cogs + dlab;
  const opexM   = rent + wages + nic + loan + util + ins + mkt + prof + sw + other;
  const totalCostsM = cogsM + opexM;
  const totProfit   = totRev - (totalCostsM * 3);
  const netMgn      = totRev > 0 ? totProfit / totRev : 0;
  const grossProfit = avgRev - cogsM;
  const grossMgn    = avgRev > 0 ? grossProfit / avgRev : 0;

  const ebitdaM = (totProfit / 3) + loan;
  const fixedM  = opexM;
  const breakeven      = grossMgn > 0 ? fixedM / grossMgn : null;
  const breakevenGap   = avgRev > 0 && breakeven !== null ? avgRev - breakeven : null;

  const runway     = avgRev > 0 ? cash / avgRev : 0;
  const debtRatio  = avgRev > 0 ? debt / avgRev : 0;
  const revGrowth  = r1 > 0 ? (r2 - r1) / r1 : 0;

  const debtorDays   = totRev > 0 && debtors > 0   ? (debtors / (totRev / 3 * 12 / 365))   : null;
  const creditorDays = cogsM > 0 && creditors > 0  ? (creditors / (cogsM * 12 / 365))       : null;
  const stockDays    = stock > 0 && cogsM > 0      ? (stock / (cogsM * 12 / 365))           : null;
  const revPerEmp    = emp > 0                      ? (avgRev * 12 / emp)                    : null;
  const wcr          = (creditors + debt) > 0       ? (cash + debtors) / (creditors + debt)  : null;
  const workingCapital = cash + debtors - creditors - debt;

  const bench = BM[sector] || BM.other;

  return {
    r1, r2, r3, totRev, avgRev, totProfit, netMgn, grossMgn, ebitdaM,
    breakeven, breakevenGap, cash, debt, debtors, creditors, stock, emp,
    runway, debtRatio, revGrowth, debtorDays, creditorDays, stockDays,
    revPerEmp, wcr, workingCapital, totalCostsM, fixedM, cogsM, opexM,
    sector, bench,
  };
}

export function getVerdict(d) {
  const redCount = [
    d.netMgn < 0,
    d.grossMgn < 0.15,
    d.runway < 1 && d.avgRev > 0,
    d.wcr !== null && d.wcr < 1,
    d.debtRatio > 6,
  ].filter(Boolean).length;

  const amberCount = [
    d.netMgn >= 0 && d.netMgn < 0.05,
    d.runway >= 1 && d.runway < 3,
    d.debtorDays !== null && d.debtorDays > 60,
  ].filter(Boolean).length;

  if (redCount >= 2)                       return 'bad';
  if (amberCount >= 2 || redCount === 1)   return 'warn';
  return 'good';
}

export function getActions(d, loanVal = 0) {
  const acts = [];
  if (d.netMgn < 0)                          acts.push({ p: 'red',   key: 'net_loss' });
  if (d.netMgn >= 0 && d.netMgn < .05)       acts.push({ p: 'red',   key: 'low_margin' });
  if (d.grossMgn < .15)                       acts.push({ p: 'red',   key: 'low_gross' });
  if (d.breakeven !== null && d.breakevenGap < 0) acts.push({ p: 'red', key: 'below_breakeven' });
  if (d.runway < 1 && d.avgRev > 0)          acts.push({ p: 'red',   key: 'cash_critical' });
  if (d.wcr !== null && d.wcr < 1)           acts.push({ p: 'red',   key: 'wcr_low' });
  if (d.debtorDays !== null && d.debtorDays > 60) acts.push({ p: 'red', key: 'debtor_slow' });
  if (d.runway >= 1 && d.runway < 3)         acts.push({ p: 'amber', key: 'runway_tight' });
  if (d.revGrowth < 0)                       acts.push({ p: 'amber', key: 'revenue_decline' });
  if (d.debtRatio > 6)                       acts.push({ p: 'amber', key: 'high_debt' });
  if (d.debtorDays !== null && d.debtorDays > 30 && d.debtorDays <= 60)
                                              acts.push({ p: 'amber', key: 'debtor_moderate' });
  if (d.stockDays !== null && d.bench.stockDays && d.stockDays > d.bench.stockDays * 2)
                                              acts.push({ p: 'amber', key: 'slow_stock' });
  if (d.totRev >= 67500)                      acts.push({ p: 'amber', key: 'vat_threshold' });
  if (d.netMgn >= .1)                        acts.push({ p: 'green', key: 'healthy_margin' });
  if (d.grossMgn >= d.bench.gross)           acts.push({ p: 'green', key: 'beats_sector' });
  if (d.revPerEmp !== null && d.revPerEmp < 40000)
                                              acts.push({ p: 'amber', key: 'low_rev_per_emp' });
  acts.push({ p: 'green', key: 'ico_reminder' });
  return acts;
}