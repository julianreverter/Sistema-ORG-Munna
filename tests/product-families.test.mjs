import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  PRODUCT_FAMILIES,
  discountKeyForFamily,
  findProductFamily,
  normalizeProductFamilyDiscounts,
} from "../lib/product-families.ts";
import { productCatalog } from "../lib/products.ts";

test("the shared family catalog contains Mini Tortitas and every current product family", () => {
  assert.equal(findProductFamily("Mini Tortitas")?.label, "Mini Tortitas");
  assert.equal(discountKeyForFamily("Mini Tortitas"), "miniTortitas");
  assert.equal(PRODUCT_FAMILIES.length, 6);
  assert.deepEqual(
    [...new Set(productCatalog.map((product) => product.family).filter((family) => !findProductFamily(family)))],
    [],
  );
});

test("client discounts always include every family without changing existing percentages", () => {
  const discounts = normalizeProductFamilyDiscounts({ helado: 50, postres: 35, pasteleria: 30 });
  assert.equal(discounts.helado, 50);
  assert.equal(discounts.postres, 35);
  assert.equal(discounts.pasteleria, 30);
  assert.equal(discounts.miniTortitas, 0);
  assert.deepEqual(Object.keys(discounts), PRODUCT_FAMILIES.map((family) => family.discountKey));
});

test("product creation uses a family dropdown and dispatch pricing uses the shared discount key", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const api = fs.readFileSync("app/api/operations/route.ts", "utf8");
  assert.match(page, /<select value=\{editing\.family\}/);
  assert.match(page, /PRODUCT_FAMILIES\.map\(\(family\) => <option/);
  assert.match(page, /Familias de productos/);
  assert.match(api, /discountKeyForFamily\(family\)/);
  assert.match(api, /action === "save-client"/);
});
