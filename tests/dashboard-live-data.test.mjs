import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");

test("dashboard metrics come from live stock and production history", () => {
  assert.match(page, /function Dashboard\(\{ setView, role, currentUser, stock, history \}/);
  assert.match(page, /value=\{formatAmount\(stock\.length, 0\)\}/);
  assert.match(page, /value=\{`\$\{formatAmount\(iceCreamKg\)\} kg`\}/);
  assert.match(page, /value=\{`\$\{formatAmount\(dispatchedThisMonth\)\} kg`\}/);
  assert.match(page, /stock=\{productionRecords\} history=\{productionHistory\}/);
});

test("dashboard has real empty states and no demonstration totals", () => {
  assert.match(page, /Todavía no hay producción registrada/);
  assert.match(page, /Todavía no hay remitos/);
  assert.doesNotMatch(page, /value="286"|value="1\.184 kg"|value="2\.438 kg"|Remito #553|Jueves 27 de agosto/);
  assert.doesNotMatch(page, /const recent =|const demoStockUnits|const stockRows/);
});
