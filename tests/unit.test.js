import { describe, it, expect } from 'vitest';
import {
  validateField,
  calcFromInputs,
  getVerdict,
  getActions,
  BM
} from './calc.js';

// ─────────────────────────────────────────────
// БЛОК 1: Валидация полей
// ─────────────────────────────────────────────
describe('validateField — пустые значения', () => {
  it('пустая строка → обязательное поле', () => {
    expect(validateField('r1', '')).toBe('This field is required.');
  });
  it('пробелы → обязательное поле', () => {
    expect(validateField('r1', '   ')).toBe('This field is required.');
  });
});

describe('validateField — невалидные числа', () => {
  it('буквы → невалидное число', () => {
    expect(validateField('r1', 'abc')).toBe('Please enter a valid number.');
  });
  it('специальные символы', () => {
    expect(validateField('cogs', '@#$')).toBe('Please enter a valid number.');
  });
});

describe('validateField — revenue (r1, r2, r3)', () => {
  it('0 → ошибка: revenue must be > 0', () => {
    expect(validateField('r1', '0')).toBe('Revenue must be greater than zero.');
  });
  it('отрицательное → ошибка: negative', () => {
    expect(validateField('r2', '-1')).toBe('Value cannot be negative.');
  });
  it('1 → валидно', () => {
    expect(validateField('r1', '1')).toBeNull();
  });
  it('10000000 → валидно (максимум)', () => {
    expect(validateField('r3', '10000000')).toBeNull();
  });
  it('10000001 → превышает максимум', () => {
    expect(validateField('r1', '10000001')).toBe('Maximum value is £10,000,000.');
  });
  it('дробное revenue → валидно', () => {
    expect(validateField('r1', '1000.50')).toBeNull();
  });
});

describe('validateField — денежные поля (cogs, rent и т.д.)', () => {
  it('0 → валидно (в отличие от revenue)', () => {
    expect(validateField('cogs', '0')).toBeNull();
  });
  it('отрицательное → ошибка', () => {
    expect(validateField('rent', '-100')).toBe('Value cannot be negative.');
  });
  it('максимум £10,000,000 → валидно', () => {
    expect(validateField('wages', '10000000')).toBeNull();
  });
  it('превышение максимума', () => {
    expect(validateField('cash', '10000001')).toBe('Maximum value is £10,000,000.');
  });
  it('дробные значения → валидны', () => {
    expect(validateField('loan', '999.99')).toBeNull();
  });
});

describe('validateField — поле emp (сотрудники)', () => {
  it('0 → валидно (Solo business, минимум 0)', () => {
    expect(validateField('emp', '0')).toBeNull();
  });
  it('1 → валидно', () => {
    expect(validateField('emp', '1')).toBeNull();
  });
  it('дробное → ошибка', () => {
    expect(validateField('emp', '1.5')).toBe('Enter a whole number of 0 or more.');
  });
  it('отрицательное → ошибка', () => {
    expect(validateField('emp', '-1')).toBe('Enter a whole number of 0 or more.');
  });
  it('9999 → валидно (максимум)', () => {
    expect(validateField('emp', '9999')).toBeNull();
  });
  it('10000 → превышает максимум', () => {
    expect(validateField('emp', '10000')).toBe('Maximum is 9,999 employees.');
  });
  it('строка "1" → валидно', () => {
    expect(validateField('emp', '1')).toBeNull();
  });
});

// ─────────────────────────────────────────────
// БЛОК 2: Расчёты — базовые сценарии
// ─────────────────────────────────────────────

const BASE = {
  r1Raw: 10000, r2Raw: 11000, r3Raw: 12000,
  vatReg: false,
  cogs: 3000, dlab: 1000,
  rent: 1000, wages: 2000, nic: 200, loan: 300,
  cash: 15000, debtors: 5000, creditors: 2000, debt: 6000,
  stock: 3000, emp: 5,
  sector: 'retail'
};

describe('calcFromInputs — базовый сценарий', () => {
  const d = calcFromInputs(BASE);

  it('totRev = r1 + r2 + r3', () => {
    expect(d.totRev).toBeCloseTo(33000);
  });
  it('avgRev = totRev / 3', () => {
    expect(d.avgRev).toBeCloseTo(11000);
  });
  it('cogsM = cogs + dlab', () => {
    expect(d.cogsM).toBeCloseTo(4000);
  });
  it('grossMgn = (avgRev - cogsM) / avgRev', () => {
    expect(d.grossMgn).toBeCloseTo((11000 - 4000) / 11000);
  });
  it('netMgn корректен', () => {
    const totalCosts = (4000 + 3500) * 3; // cogsM + opexM
    const profit = 33000 - totalCosts;
    expect(d.totProfit).toBeCloseTo(profit);
    expect(d.netMgn).toBeCloseTo(profit / 33000);
  });
  it('runway = cash / totalCostsM (ИСПРАВЛЕНО: делим на расходы, не выручку)', () => {
    // BASE: cogsM(4000) + opexM(3500) = totalCostsM(7500)
    expect(d.runway).toBeCloseTo(15000 / 7500);
  });
  it('revGrowth = (r2 - r1) / r1', () => {
    expect(d.revGrowth).toBeCloseTo((11000 - 10000) / 10000);
  });
  it('bench соответствует сектору retail', () => {
    expect(d.bench).toEqual(BM.retail);
  });
});

// ─────────────────────────────────────────────
// БЛОК 3: VAT-флаг
// ─────────────────────────────────────────────
describe('calcFromInputs — VAT (НДС)', () => {
  it('без VAT: revenue без изменений', () => {
    const d = calcFromInputs({ ...BASE, vatReg: false });
    expect(d.r1).toBeCloseTo(10000);
    expect(d.r2).toBeCloseTo(11000);
    expect(d.r3).toBeCloseTo(12000);
  });
  it('с VAT: revenue делится на 1.2', () => {
    const d = calcFromInputs({ ...BASE, vatReg: true });
    expect(d.r1).toBeCloseTo(10000 / 1.2);
    expect(d.r2).toBeCloseTo(11000 / 1.2);
    expect(d.r3).toBeCloseTo(12000 / 1.2);
  });
  it('с VAT: totRev меньше чем без VAT', () => {
    const noVat = calcFromInputs({ ...BASE, vatReg: false });
    const withVat = calcFromInputs({ ...BASE, vatReg: true });
    expect(withVat.totRev).toBeLessThan(noVat.totRev);
  });
  it('с VAT: grossMgn меньше из-за более низкого revenue', () => {
    const noVat = calcFromInputs({ ...BASE, vatReg: false });
    const withVat = calcFromInputs({ ...BASE, vatReg: true });
    expect(withVat.grossMgn).toBeLessThan(noVat.grossMgn);
  });
});

// ─────────────────────────────────────────────
// БЛОК 4: Граничные случаи — нули и экстремумы
// ─────────────────────────────────────────────
describe('calcFromInputs — нулевые costs', () => {
  it('все costs = 0: grossMgn = 1.0 (100%)', () => {
    const d = calcFromInputs({ ...BASE, cogs: 0, dlab: 0 });
    expect(d.grossMgn).toBeCloseTo(1.0);
  });
  it('все costs = 0: breakeven = 0 или null (нет fixed costs)', () => {
    const d = calcFromInputs({
      ...BASE,
      cogs: 0, dlab: 0,
      rent: 0, wages: 0, nic: 0, loan: 0
    });
    // breakeven = fixedM / grossMgn, если grossMgn > 0 и fixedM = 0 → breakeven = 0
    expect(d.breakeven).toBeCloseTo(0);
  });
});

describe('calcFromInputs — минимальные значения', () => {
  it('r1=r2=r3=1, все costs=0: не падает и возвращает корректные данные', () => {
    const d = calcFromInputs({
      r1Raw: 1, r2Raw: 1, r3Raw: 1,
      vatReg: false,
      cogs: 0, dlab: 0,
      rent: 0, wages: 0, nic: 0, loan: 0,
      cash: 0, debtors: 0, creditors: 0, debt: 0,
      stock: 0, emp: 1,
      sector: 'other'
    });
    expect(d.totRev).toBeCloseTo(3);
    expect(d.grossMgn).toBeCloseTo(1.0);
    expect(d.netMgn).toBeCloseTo(1.0);
  });
});

describe('calcFromInputs — максимальные значения', () => {
  it('все поля на максимуме: не выбрасывает исключение', () => {
    expect(() => calcFromInputs({
      r1Raw: 10000000, r2Raw: 10000000, r3Raw: 10000000,
      vatReg: false,
      cogs: 10000000, dlab: 10000000,
      rent: 10000000, wages: 10000000, nic: 10000000, loan: 10000000,
      util: 10000000, ins: 10000000, mkt: 10000000, prof: 10000000,
      sw: 10000000, other: 10000000,
      cash: 10000000, debtors: 10000000, creditors: 10000000,
      debt: 10000000, stock: 10000000, emp: 9999,
      sector: 'finance'
    })).not.toThrow();
  });
});

// ─────────────────────────────────────────────
// БЛОК 5: Метрики — деление на ноль
// ─────────────────────────────────────────────
describe('calcFromInputs — защита от деления на ноль', () => {
  it('debtors=0: debtorDays = null', () => {
    const d = calcFromInputs({ ...BASE, debtors: 0 });
    expect(d.debtorDays).toBeNull();
  });
  it('creditors=0: creditorDays = null', () => {
    const d = calcFromInputs({ ...BASE, creditors: 0 });
    expect(d.creditorDays).toBeNull();
  });
  it('stock=0: stockDays = null', () => {
    const d = calcFromInputs({ ...BASE, stock: 0 });
    expect(d.stockDays).toBeNull();
  });
  it('cogs=0 и dlab=0: creditorDays = null (нет COGS-базы)', () => {
    const d = calcFromInputs({ ...BASE, cogs: 0, dlab: 0, creditors: 5000 });
    expect(d.creditorDays).toBeNull();
  });
  it('emp=0: revPerEmp = null', () => {
    const d = calcFromInputs({ ...BASE, emp: 0 });
    expect(d.revPerEmp).toBeNull();
  });
  it('creditors=0 и debt=0: wcr = null', () => {
    const d = calcFromInputs({ ...BASE, creditors: 0, debt: 0 });
    expect(d.wcr).toBeNull();
  });
  it('grossMgn ≤ 0: breakeven = null', () => {
    // costs больше revenue → отрицательный grossMgn
    const d = calcFromInputs({ ...BASE, cogs: 50000, dlab: 50000 });
    expect(d.breakeven).toBeNull();
  });
});

// ─────────────────────────────────────────────
// БЛОК 6: EBITDA
// ─────────────────────────────────────────────
describe('calcFromInputs — EBITDA', () => {
  it('EBITDA = (totProfit/3) + loan', () => {
    const d = calcFromInputs(BASE);
    expect(d.ebitdaM).toBeCloseTo(d.totProfit / 3 + BASE.loan);
  });
  it('если loan=0: EBITDA = netProfit/3', () => {
    const d = calcFromInputs({ ...BASE, loan: 0 });
    expect(d.ebitdaM).toBeCloseTo(d.totProfit / 3);
  });
});

// ─────────────────────────────────────────────
// БЛОК 7: Working Capital
// ─────────────────────────────────────────────
describe('calcFromInputs — workingCapital и wcr', () => {
  it('workingCapital = cash + debtors - creditors - debt', () => {
    const d = calcFromInputs(BASE);
    expect(d.workingCapital).toBeCloseTo(
      BASE.cash + BASE.debtors - BASE.creditors - BASE.debt
    );
  });
  it('wcr = (cash + debtors) / (creditors + debt)', () => {
    const d = calcFromInputs(BASE);
    expect(d.wcr).toBeCloseTo(
      (BASE.cash + BASE.debtors) / (BASE.creditors + BASE.debt)
    );
  });
  it('wcr < 1 при высоком долге', () => {
    const d = calcFromInputs({ ...BASE, cash: 100, debtors: 100, creditors: 5000, debt: 5000 });
    expect(d.wcr).toBeLessThan(1);
  });
  it('wcr >= 1.5 при хорошем балансе', () => {
    const d = calcFromInputs({ ...BASE, cash: 50000, debtors: 10000, creditors: 1000, debt: 1000 });
    expect(d.wcr).toBeGreaterThanOrEqual(1.5);
  });
});

// ─────────────────────────────────────────────
// БЛОК 8: Revenue Growth
// ─────────────────────────────────────────────
describe('calcFromInputs — revGrowth', () => {
  it('r2 > r1: положительный рост', () => {
    const d = calcFromInputs({ ...BASE, r1Raw: 10000, r2Raw: 11000 });
    expect(d.revGrowth).toBeGreaterThan(0);
  });
  it('r2 = r1: нулевой рост', () => {
    const d = calcFromInputs({ ...BASE, r1Raw: 10000, r2Raw: 10000 });
    expect(d.revGrowth).toBeCloseTo(0);
  });
  it('r2 < r1: отрицательный рост', () => {
    const d = calcFromInputs({ ...BASE, r1Raw: 10000, r2Raw: 8000 });
    expect(d.revGrowth).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────
// БЛОК 9: Debtor / Creditor / Stock Days
// ─────────────────────────────────────────────
describe('calcFromInputs — debtorDays', () => {
  it('высокие debtors = много дней', () => {
    const low = calcFromInputs({ ...BASE, debtors: 1000 });
    const high = calcFromInputs({ ...BASE, debtors: 50000 });
    expect(high.debtorDays).toBeGreaterThan(low.debtorDays);
  });
  it('формула: debtors / (avgRev * 12 / 365)', () => {
    const d = calcFromInputs(BASE);
    const expected = BASE.debtors / (d.avgRev * 12 / 365);
    expect(d.debtorDays).toBeCloseTo(expected);
  });
});

describe('calcFromInputs — stockDays', () => {
  it('нет stock=0: stockDays = null', () => {
    const d = calcFromInputs({ ...BASE, stock: 0 });
    expect(d.stockDays).toBeNull();
  });
  it('stock > 0 и cogsM > 0: stockDays рассчитан', () => {
    const d = calcFromInputs(BASE);
    expect(d.stockDays).not.toBeNull();
    expect(d.stockDays).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// БЛОК 10: VAT threshold
// ─────────────────────────────────────────────
describe('calcFromInputs — VAT threshold в actions', () => {
  it('totRev < 67500: нет VAT-алерта', () => {
    const d = calcFromInputs({ ...BASE, r1Raw: 10000, r2Raw: 10000, r3Raw: 10000 });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'vat_threshold')).toBe(false);
  });
  it('totRev >= 67500: есть VAT-алерт', () => {
    const d = calcFromInputs({ ...BASE, r1Raw: 23000, r2Raw: 23000, r3Raw: 23000 });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'vat_threshold')).toBe(true);
  });
  it('граница 67500 точно: алерт активируется', () => {
    // 67500 / 3 = 22500 per month
    const d = calcFromInputs({ ...BASE, r1Raw: 22500, r2Raw: 22500, r3Raw: 22500 });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'vat_threshold')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// БЛОК 11: Verdict (светофор)
// ─────────────────────────────────────────────
describe('getVerdict — good', () => {
  it('здоровый бизнес → good', () => {
    const d = calcFromInputs({
      r1Raw: 20000, r2Raw: 22000, r3Raw: 24000,
      vatReg: false,
      cogs: 3000, dlab: 1000,
      rent: 1000, wages: 2000, nic: 200, loan: 200,
      cash: 60000, debtors: 5000, creditors: 2000, debt: 5000,
      stock: 2000, emp: 5, sector: 'professional'
    });
    expect(getVerdict(d)).toBe('good');
  });
});

describe('getVerdict — warn', () => {
  it('1 red и 0 amber → warn', () => {
    // низкая gross margin: red; но остальное ок
    const d = calcFromInputs({
      r1Raw: 10000, r2Raw: 10000, r3Raw: 10000,
      vatReg: false,
      cogs: 9000, dlab: 0,       // grossMgn = (10000-9000)/10000 = 10% < 15%: RED
      rent: 0, wages: 500, nic: 50, loan: 0,
      cash: 30000, debtors: 0, creditors: 0, debt: 0,
      stock: 0, emp: 2, sector: 'retail'
    });
    expect(getVerdict(d)).toBe('warn');
  });
});

describe('getVerdict — bad', () => {
  it('2+ red → bad', () => {
    const d = calcFromInputs({
      r1Raw: 5000, r2Raw: 5000, r3Raw: 5000,
      vatReg: false,
      cogs: 8000, dlab: 2000,    // grossMgn отрицательный: RED
      rent: 2000, wages: 3000, nic: 300, loan: 300,
      // netMgn < 0: RED
      cash: 500, debtors: 0, creditors: 0, debt: 0,
      // runway < 1 при avgRev > 0: RED → итого ≥ 2
      stock: 0, emp: 5, sector: 'hospitality'
    });
    expect(getVerdict(d)).toBe('bad');
  });
});

// ─────────────────────────────────────────────
// БЛОК 12: Actions (рекомендации)
// ─────────────────────────────────────────────
describe('getActions — всегда есть ico_reminder', () => {
  it('ico_reminder присутствует в любом наборе данных', () => {
    const d = calcFromInputs(BASE);
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'ico_reminder')).toBe(true);
  });
});

describe('getActions — net loss', () => {
  it('убыточный бизнес: net_loss action', () => {
    const d = calcFromInputs({
      ...BASE,
      cogs: 50000, dlab: 0 // costs >> revenue
    });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'net_loss')).toBe(true);
  });
});

describe('getActions — debt high', () => {
  it('debtRatio > 6: high_debt action', () => {
    const d = calcFromInputs({
      ...BASE,
      debt: 100000  // debtRatio = 100000 / 11000 > 6
    });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'high_debt')).toBe(true);
  });
  it('debtRatio <= 6: нет high_debt', () => {
    const d = calcFromInputs({ ...BASE, debt: 1000 });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'high_debt')).toBe(false);
  });
});

describe('getActions — healthy margin', () => {
  it('netMgn >= 10%: healthy_margin action', () => {
    const d = calcFromInputs({
      ...BASE,
      cogs: 0, dlab: 0,
      rent: 100, wages: 100, nic: 10, loan: 0
    });
    const acts = getActions(d);
    expect(acts.some(a => a.key === 'healthy_margin')).toBe(true);
  });
});

// ─────────────────────────────────────────────
// БЛОК 13: Сектора и бенчмарки
// ─────────────────────────────────────────────
describe('BM — все секторы имеют обязательные поля', () => {
  const requiredKeys = ['gross', 'net', 'label', 'debtDays'];
  Object.entries(BM).forEach(([sector, bm]) => {
    it(`сектор ${sector} имеет все обязательные поля`, () => {
      requiredKeys.forEach(key => {
        expect(bm).toHaveProperty(key);
      });
    });
  });
});

describe('calcFromInputs — sector fallback', () => {
  it('неизвестный сектор → использует BM.other', () => {
    const d = calcFromInputs({ ...BASE, sector: 'unknown_sector' });
    expect(d.bench).toEqual(BM.other);
  });
});

describe('calcFromInputs — профессиональные услуги (stockDays: null)', () => {
  it('professional sector: stockDays в bench = null', () => {
    const d = calcFromInputs({ ...BASE, sector: 'professional' });
    expect(d.bench.stockDays).toBeNull();
  });
});

// ─────────────────────────────────────────────
// БЛОК 14: Breakeven
// ─────────────────────────────────────────────
describe('calcFromInputs — breakeven', () => {
  it('breakeven = fixedM / grossMgn', () => {
    const d = calcFromInputs(BASE);
    if (d.breakeven !== null && d.grossMgn > 0) {
      expect(d.breakeven).toBeCloseTo(d.fixedM / d.grossMgn);
    }
  });
  it('выше breakeven: breakevenGap > 0', () => {
    const d = calcFromInputs({
      r1Raw: 50000, r2Raw: 50000, r3Raw: 50000,
      vatReg: false,
      cogs: 5000, dlab: 0,
      rent: 1000, wages: 1000, nic: 100, loan: 100,
      cash: 50000, debtors: 0, creditors: 0, debt: 0,
      stock: 0, emp: 5, sector: 'professional'
    });
    expect(d.breakevenGap).toBeGreaterThan(0);
  });
  it('ниже breakeven: breakevenGap < 0', () => {
    const d = calcFromInputs({
      r1Raw: 1000, r2Raw: 1000, r3Raw: 1000,
      vatReg: false,
      cogs: 200, dlab: 0,
      rent: 2000, wages: 3000, nic: 300, loan: 200,
      cash: 5000, debtors: 0, creditors: 0, debt: 0,
      stock: 0, emp: 5, sector: 'other'
    });
    expect(d.breakevenGap).toBeLessThan(0);
  });
});

// ─────────────────────────────────────────────
// БЛОК 15: Revenue per Employee
// ─────────────────────────────────────────────
describe('calcFromInputs — revPerEmp', () => {
  it('revPerEmp = avgRev * 12 / emp', () => {
    const d = calcFromInputs(BASE);
    expect(d.revPerEmp).toBeCloseTo(d.avgRev * 12 / BASE.emp);
  });
  it('больше сотрудников → меньше revPerEmp при той же выручке', () => {
    const d1 = calcFromInputs({ ...BASE, emp: 5 });
    const d2 = calcFromInputs({ ...BASE, emp: 50 });
    expect(d2.revPerEmp).toBeLessThan(d1.revPerEmp);
  });
});

// ─────────────────────────────────────────────
// БЛОК 16: Проверка типов возвращаемых значений
// ─────────────────────────────────────────────
describe('calcFromInputs — типы данных', () => {
  const d = calcFromInputs(BASE);
  const numericFields = [
    'r1','r2','r3','totRev','avgRev','totProfit','netMgn','grossMgn',
    'ebitdaM','runway','debtRatio','revGrowth','workingCapital',
    'totalCostsM','fixedM','cogsM','opexM'
  ];
  numericFields.forEach(field => {
    it(`${field} — число (number)`, () => {
      expect(typeof d[field]).toBe('number');
    });
  });
  it('bench — объект', () => {
    expect(typeof d.bench).toBe('object');
  });
  it('sector — строка', () => {
    expect(typeof d.sector).toBe('string');
  });
});