import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('app/page.tsx', 'utf8');
const handlers = source.slice(source.indexOf('  const closePurchase ='), source.indexOf('  const tabs: [CostTab'));
function form({ changed = true, saving = false } = {}) {
  const initial = { supplier: 'Proveedor', invoice: '', dueDate: '' };
  const lines = [{ product: 'Crema', quantity: '1', price: '' }];
  const state = { open: true, confirm: false, editing: 12 };
  const context = {
    purchase: { ...initial, invoice: changed ? 'FC A 0001-123' : '' },
    invoiceLines: structuredClone(lines), isCreditNote: false,
    purchaseBaseline: JSON.stringify({ purchase: initial, invoiceLines: lines, isCreditNote: false }),
    savingPurchase: saving,
    setDiscardPurchaseOpen: value => state.confirm = value,
    setPurchaseOpen: value => state.open = value,
    setEditingPurchaseId: value => state.editing = value,
  };
  vm.createContext(context);
  vm.runInContext(handlers + '\nglobalThis.requestClose = requestPurchaseClose; globalThis.discard = closePurchase;', context);
  return { context, state };
}
test('unchanged forms close without confirmation', () => {
  const { context, state } = form({ changed: false }); context.requestClose();
  assert.deepEqual(state, { open: false, confirm: false, editing: null });
});
test('dirty form stays mounted and keeps every draft value when continuing', () => {
  const { context, state } = form(); const before = JSON.stringify([context.purchase, context.invoiceLines]);
  context.requestClose(); assert.equal(state.open, true); assert.equal(state.confirm, true);
  context.setDiscardPurchaseOpen(false);
  assert.equal(JSON.stringify([context.purchase, context.invoiceLines]), before); assert.equal(state.editing, 12);
  context.requestClose(); context.discard(); assert.equal(state.open, false);
});
test('line-only and header-only changes require confirmation', () => {
  for (const change of [c => c.invoiceLines[0].price = '123,45', c => c.purchase.dueDate = '2026-11-01', c => c.isCreditNote = true]) {
    const { context, state } = form({ changed: false }); change(context); context.requestClose();
    assert.equal(state.confirm, true); assert.equal(state.open, true);
  }
});
test('cannot discard while save is pending', () => {
  const { context, state } = form({ saving: true }); context.requestClose();
  assert.deepEqual(state, { open: true, confirm: false, editing: 12 });
});
test('overlay is blocked and X, Escape and Cancel use the same guarded close', () => {
  assert.match(source, /<Dialog open=\{purchaseOpen\} onOpenChange=\{\(open\) => \{ if \(!open\) requestPurchaseClose\(\); \}\}><DialogContent onInteractOutside=\{\(event\) => event.preventDefault\(\)\}/);
  assert.match(source, /disabled=\{savingPurchase\} onClick=\{requestPurchaseClose\}>Cancelar/);
});
