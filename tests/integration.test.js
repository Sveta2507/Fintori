import { describe, it, expect } from 'vitest';
import { calcFromInputs, getVerdict, getActions } from '../calc.js';

// Сценарий 1: Здоровый растущий IT-стартап
describe('Сценарий: Здоровый IT-бизнес', () => {
  const d = calcFromInputs({
    r1Raw: 30000, r2Raw: 35000, r3Raw: 40000,
    vatReg: false,
    cogs: 2000, dlab: 0,
    rent: 2000, wages: 8000, nic: 800, loan: 500,
    util: 200, ins: 100, mkt: 1000, prof: 500, sw: 300, other: 0,
    cash: 120000, debtors: 10000, creditors: 3000, debt: 5000,
    stock: 0, emp: 5, sector: 'it'
  });

  it('verdict = good', () => {
    expect(getVerdict(d)).toBe('good');
  });
  it('netMgn > 10%', () => {
    expect(d.netMgn).toBeGreaterThan(0.1);
  });
  it('grossMgn высокий (IT)', () => {
    expect(d.grossMgn).toBeGreaterThan(0.5);
  });
  it('runway > 3 месяца', () => {
    expect(d.runway).toBeGreaterThan(3);
  });
  it('revGrowth положительный', () => {
    expect(d.revGrowth).toBeGreaterThan(0);
  });
  it('нет net_loss action', () => {
    expect(getActions(d).some(a => a.key === 'net_loss')).toBe(false);
  });
  it('есть healthy_margin action', () => {
    expect(getActions(d).some(a => a.key === 'healthy_margin')).toBe(true);
  });
});

// Сценарий 2: Убыточный ресторан
describe('Сценарий: Убыточный ресторан', () => {
  const d = calcFromInputs({
    r1Raw: 8000, r2Raw: 7500, r3Raw: 7000,   // падающая выручка
    vatReg: false,
    cogs: 5000, dlab: 2000,                   // высокие прямые затраты
    rent: 3000, wages: 4000, nic: 400, loan: 500,
    cash: 2000, debtors: 0, creditors: 5000, debt: 20000,
    stock: 1000, emp: 8, sector: 'hospitality'
  });

  it('verdict = bad (критическая ситуация)', () => {
    expect(getVerdict(d)).toBe('bad');
  });
  it('netMgn < 0', () => {
    expect(d.netMgn).toBeLessThan(0);
  });
  it('revGrowth < 0 (падение выручки)', () => {
    expect(d.revGrowth).toBeLessThan(0);
  });
  it('wcr < 1 (проблемы с ликвидностью)', () => {
    expect(d.wcr).not.toBeNull();
    expect(d.wcr).toBeLessThan(1);
  });
  it('есть net_loss action', () => {
    expect(getActions(d).some(a => a.key === 'net_loss')).toBe(true);
  });
  it('есть revenue_decline action', () => {
    expect(getActions(d).some(a => a.key === 'revenue_decline')).toBe(true);
  });
});

// Сценарий 3: Retail с VAT
describe('Сценарий: Retail с VAT-регистрацией', () => {
  const withVat = calcFromInputs({
    r1Raw: 24000, r2Raw: 24000, r3Raw: 24000,  // totRev = 60000 брутто
    vatReg: true,                                // нетто = 50000
    cogs: 4000, dlab: 0,
    rent: 2000, wages: 5000, nic: 500, loan: 300,
    cash: 20000, debtors: 3000, creditors: 2000, debt: 10000,
    stock: 5000, emp: 10, sector: 'retail'
  });

  it('totRev =  72000 / 1.2 = 60000', () => {
    expect(withVat.totRev).toBeCloseTo(60000);
  });
  it('нет VAT-алерта (порог 67500 не достигнут нетто)', () => {
    // 50000 < 67500
    expect(getActions(withVat).some(a => a.key === 'vat_threshold')).toBe(false);
  });
});

// Сценарий 4: На грани — approaching VAT threshold
describe('Сценарий: Приближение к VAT-порогу', () => {
  const d = calcFromInputs({
    r1Raw: 23000, r2Raw: 23000, r3Raw: 23000, // totRev = 69000 > 67500
    vatReg: false,
    cogs: 5000, dlab: 0,
    rent: 1000, wages: 3000, nic: 300, loan: 0,
    cash: 15000, debtors: 0, creditors: 0, debt: 0,
    stock: 0, emp: 3, sector: 'retail'
  });

  it('totRev > 67500: VAT-алерт активен', () => {
    expect(d.totRev).toBeGreaterThanOrEqual(67500);
    expect(getActions(d).some(a => a.key === 'vat_threshold')).toBe(true);
  });
});

// Сценарий 5: Construction с медленными должниками
describe('Сценарий: Construction — медленные должники', () => {
  const d = calcFromInputs({
    r1Raw: 40000, r2Raw: 40000, r3Raw: 40000,
    vatReg: false,
    cogs: 15000, dlab: 8000,
    rent: 1000, wages: 5000, nic: 500, loan: 1000,
    cash: 30000, debtors: 80000,  // очень высокие debtors
    creditors: 5000, debt: 10000,
    stock: 20000, emp: 15, sector: 'construction'
  });

  it('debtorDays > 60: debtor_slow action', () => {
    expect(d.debtorDays).toBeGreaterThan(60);
    expect(getActions(d).some(a => a.key === 'debtor_slow')).toBe(true);
  });
});

// Сценарий 6: Professional Services без stock-метрик
describe('Сценарий: Professional Services — нет stockDays', () => {
  const d = calcFromInputs({
    r1Raw: 15000, r2Raw: 16000, r3Raw: 17000,
    vatReg: false,
    cogs: 0, dlab: 0,
    rent: 1500, wages: 5000, nic: 500, loan: 0,
    cash: 25000, debtors: 8000, creditors: 1000, debt: 0,
    stock: 0, emp: 3, sector: 'professional'
  });

  it('bench.stockDays = null для professional', () => {
    expect(d.bench.stockDays).toBeNull();
  });
  it('stockDays = null (нет stock)', () => {
    expect(d.stockDays).toBeNull();
  });
});

// Сценарий 7: Один сотрудник с низким revPerEmp
describe('Сценарий: Низкий revenue per employee', () => {
  const d = calcFromInputs({
    r1Raw: 1500, r2Raw: 1500, r3Raw: 1500,  // avgRev 1500 * 12 = 18000 / yr
    vatReg: false,
    cogs: 300, dlab: 0,
    rent: 500, wages: 500, nic: 50, loan: 0,
    cash: 3000, debtors: 0, creditors: 0, debt: 0,
    stock: 0, emp: 1, sector: 'other'
  });

  it('revPerEmp < 40000: low_rev_per_emp action', () => {
    expect(d.revPerEmp).toBeLessThan(40000);
    expect(getActions(d).some(a => a.key === 'low_rev_per_emp')).toBe(true);
  });
});