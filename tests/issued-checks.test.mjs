import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/issued-checks.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { checkAmount, validCheckDate, checkInputError, summarizeChecks, weeklyChecks, checkCalendarDays, offsetCheckMonth } = context.exports;
const draft = { number: '001', bank: 'Banco', beneficiary: 'Proveedor', amount: '1.234,56', issued_on: '2026-08-01', due_on: '2026-09-01', status: 'pending', debited_on: null, notes: '' };

test('money retains cents and rejects malformed and nonpositive values', () => {
  for (const amount of ['1.234,56', '1234,56', '1234.56', '$ 1.234,56']) assert.equal(checkAmount(amount), 1234.56);
  assert.equal(checkAmount('1.234'), 1234);
  for (const amount of ['', '0', '-1', '1,234', '1.2.3', 'NaN', 'Infinity', '12abc', '1e5']) assert.ok(Number.isNaN(checkAmount(amount)), amount);
});

test('weekly debit includes overdue checks across months and upcoming checks through Sunday only', () => {
  const rows = [
    { ...draft, amount: 100.10, due_on: '2026-09-01' },
    { ...draft, amount: 200.20, due_on: '2026-11-02' },
    { ...draft, amount: 300.30, due_on: '2026-11-03' },
    { ...draft, amount: 400.40, due_on: '2026-11-08' },
    { ...draft, amount: 9999, due_on: '2026-11-09' },
    { ...draft, amount: 9999, due_on: '2026-11-05', status: 'debited' },
    { ...draft, amount: 9999, due_on: '2026-11-01', status: 'cancelled' },
  ];
  const week = weeklyChecks(rows, '2026-11-03');
  assert.equal(week.start, '2026-11-02');
  assert.equal(week.end, '2026-11-08');
  assert.equal(week.checks.length, 4);
  assert.equal(week.total, 1001);
  assert.equal(weeklyChecks(rows, '2026-11-08').total, week.total);
  assert.equal(weeklyChecks(rows, '2026-11-09').checks.length, 5);
  assert.equal(weeklyChecks([], '2026-11-03').total, 0);
});

test('weekly debit crosses month and year boundaries without changing the monthly summary', () => {
  const rows = [
    { ...draft, amount: 10, due_on: '2026-11-30' },
    { ...draft, amount: 20, due_on: '2026-12-06' },
    { ...draft, amount: 40, due_on: '2026-12-07' },
  ];
  assert.equal(weeklyChecks(rows, '2026-11-30').total, 30);
  assert.equal(summarizeChecks(rows, '2026-11').totalPending, 10);
  assert.equal(weeklyChecks([], '2026-12-31').end, '2027-01-03');
  assert.equal(weeklyChecks([], '2027-01-01').start, '2026-12-28');
});
test('real dates and chronological constraints are enforced', () => {
  assert.equal(checkInputError(draft), null);
  assert.equal(validCheckDate('2026-02-30'), false);
  assert.equal(validCheckDate('2028-02-29'), true);
  assert.ok(checkInputError({ ...draft, due_on: '2026-07-31' }));
  assert.ok(checkInputError({ ...draft, status: 'debited' }));
  assert.ok(checkInputError({ ...draft, status: 'debited', debited_on: '2099-01-01' }));
  assert.equal(checkInputError({ ...draft, status: 'debited', debited_on: '2026-10-01' }), null);
});
test('late deposits remain pending across months and cancellation never contributes', () => {
  const rows = [
    { ...draft, amount: 100.10 },
    { ...draft, amount: 200.20, status: 'debited', debited_on: '2026-10-01' },
    { ...draft, amount: 9999, status: 'cancelled' },
    { ...draft, amount: 50.05, due_on: '2026-08-31' },
    { ...draft, amount: 400, due_on: '2026-10-01' },
  ];
  const sept = summarizeChecks(rows, '2026-09');
  assert.equal(sept.due, 300.30);
  assert.equal(sept.paid, 200.20);
  assert.equal(sept.pending, 100.10);
  assert.equal(sept.previous, 50.05);
  assert.equal(sept.totalPending, 150.15);
  const oct = summarizeChecks(rows, '2026-10');
  assert.equal(oct.pending, 400);
  assert.equal(oct.previous, 150.15);
  assert.equal(oct.totalPending, 550.15);
  assert.equal(summarizeChecks(rows, '2026-08').issued, 750.35);
});

test('check calendar uses Monday-first complete weeks and navigates across years', () => {
  const december = checkCalendarDays('2026-12');
  assert.equal(december.length, 42);
  assert.equal(december[0].day, '2026-11-30');
  assert.equal(december[0].inMonth, false);
  assert.equal(december[1].day, '2026-12-01');
  assert.equal(december[1].inMonth, true);
  assert.equal(december[41].day, '2027-01-10');
  assert.equal(december[41].inMonth, false);
  assert.equal(offsetCheckMonth('2026-12', 1), '2027-01');
  assert.equal(offsetCheckMonth('2026-01', -1), '2025-12');
  assert.equal(checkCalendarDays('2026-13').length, 0);
});
