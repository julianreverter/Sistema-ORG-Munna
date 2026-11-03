import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/issued-checks.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { checkAmount, validCheckDate, checkInputError, summarizeChecks } = context.exports;
const draft = { number: '001', bank: 'Banco', beneficiary: 'Proveedor', amount: '1.234,56', issued_on: '2026-08-01', due_on: '2026-09-01', status: 'pending', debited_on: null, notes: '' };

test('money retains cents and rejects malformed and nonpositive values', () => {
  for (const amount of ['1.234,56', '1234,56', '1234.56', '$ 1.234,56']) assert.equal(checkAmount(amount), 1234.56);
  assert.equal(checkAmount('1.234'), 1234);
  for (const amount of ['', '0', '-1', '1,234', '1.2.3', 'NaN', 'Infinity', '12abc', '1e5']) assert.ok(Number.isNaN(checkAmount(amount)), amount);
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
