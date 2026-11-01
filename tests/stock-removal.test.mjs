import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile = path => ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const validation = { exports: {} };
vm.runInNewContext(compile('lib/stock-removal.ts'), validation);
const { stockRemovalError } = validation.exports;
test('removal reasons and comment validation', () => {
  for (const reason of validation.exports.STOCK_REMOVAL_REASONS) assert.equal(stockRemovalError(reason, reason === 'Otro' ? 'Detalle' : ''), null);
  for (const reason of ['', null, 'Cualquier motivo']) assert.ok(stockRemovalError(reason, 'Detalle'));
  assert.ok(stockRemovalError('Otro', '   '));
  assert.ok(stockRemovalError('Otro', 'x'.repeat(2001)));
});
function fixture({ role = 'maestro_heladero', status = 'stock', error = null } = {}) {
  const unit = { id: 1, unique_code: '000123', status, weight_kg: 7.1, cost_per_kg_snapshot: 1500, products: { name: 'Frutilla a la crema', code: 'F1' } };
  const writes = [];
  const supabase = { from(table) {
    let update, filters = [];
    const q = { select() { return q; }, eq(key, value) { filters.push([key, value]); return q; }, single() { return q; }, maybeSingle() { return q; }, update(value) { update = value; return q; }, then(resolve) {
      if (table === 'profiles') return Promise.resolve({ data: { id: 'user', role, active: true }, error: null }).then(resolve);
      const matches = filters.every(([key,value]) => unit[key] === value);
      if (matches && !error) { writes.push(update); Object.assign(unit, update, { deleted_at: '2026-11-01T12:00:00Z', deleted_by_name: 'Operador' }); }
      return Promise.resolve({ data: matches && !error ? unit : null, error }).then(resolve);
    } }; return q;
  } };
  const context = { exports: {}, Response, console, require(name) {
    if (name.includes('stock-removal')) return validation.exports;
    if (name.includes('supabase')) return { createServerSupabaseClient: async () => supabase };
    return { getChatGPTUser: async () => ({ id: 'user' }) };
  } };
  vm.runInNewContext(compile('app/api/operations/route.ts'), context);
  const remove = (changes = {}) => context.exports.POST(new Request('https://example.test/api/operations', { method: 'POST', body: JSON.stringify({ action: 'remove-stock', uniqueCode: '000123', reason: 'Error en etiquetado', comment: '', ...changes }) }));
  return { remove, writes };
}
test('API removes only an available unit and returns its audit without costs to production', async () => {
  const f = fixture();
  const response = await f.remove();
  assert.equal(response.status, 200);
  const { unit } = await response.json();
  assert.equal(unit.status, 'baja');
  assert.equal(unit.deletionReason, 'Error en etiquetado');
  assert.equal(unit.deletedByName, 'Operador');
  assert.ok(unit.deletedAt);
  assert.equal(unit.costPerKgSnapshot, undefined);
  assert.equal((await f.remove()).status, 409);
  assert.equal(f.writes.length, 1);
});
test('API rejects invalid comments, unavailable stock and database errors', async () => {
  const f = fixture();
  assert.equal((await f.remove({ reason: 'Otro', comment: '  ' })).status, 400);
  assert.equal((await f.remove({ reason: 'Inventado' })).status, 400);
  assert.equal((await f.remove({ uniqueCode: '' })).status, 400);
  assert.equal(f.writes.length, 0);
  for (const status of ['despachado', 'baja']) assert.equal((await fixture({ status }).remove()).status, 409);
  assert.equal((await fixture({ error: { message: 'No disponible' } }).remove()).status, 409);
});
