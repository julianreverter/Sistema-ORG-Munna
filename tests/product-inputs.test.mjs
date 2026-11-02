import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const context = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-inputs.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
const { parsePackageWeight, presentationParts, presentationQuantityError } = context.exports;
test('weights accept comma and dot and retain three decimal precision at save', () => {
  for (const input of ['0,750','0.750',' 0,750 ']) assert.equal(parsePackageWeight(input),0.75);
  assert.equal(parsePackageWeight('7,120'),7.12);
  assert.equal(parsePackageWeight('0,001'),0.001);
  assert.equal(parsePackageWeight('1,'),1);
  assert.equal(parsePackageWeight('.5'),0.5);
  for (const input of ['',',','-1','1,2,3','1.2345','Infinity','NaN','texto']) assert.equal(parsePackageWeight(input),null);
});
test('box quantities can change to ten and cannot be zero or empty', () => {
  const parts = presentationParts('Caja x 20');
  assert.equal(parts.quantity,'20');
  assert.equal(parts.label,'Caja');
  assert.equal(presentationParts(parts.label + ' x 10').quantity,'10');
  assert.equal(presentationQuantityError('Caja x 10'),null);
  assert.ok(presentationQuantityError('Caja x 0'));
  assert.ok(presentationQuantityError('Caja x '));
  assert.equal(presentationQuantityError('Balde grande'),null);
});
