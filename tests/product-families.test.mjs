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

test("a newly created family is available to products and client discounts", () => {
  const dynamicFamilies = [
    ...PRODUCT_FAMILIES,
    { id: 7, value: "Chocolatería", label: "Chocolatería", discountKey: "chocolateria", requiresPackageWeight: false, unitType: "unidad" },
  ];
  assert.equal(findProductFamily("chocolateria", dynamicFamilies)?.value, "Chocolatería");
  assert.equal(discountKeyForFamily("Chocolatería", dynamicFamilies), "chocolateria");
  assert.equal(normalizeProductFamilyDiscounts({}, dynamicFamilies).chocolateria, 0);
});

test("the product screen manages families and dispatch pricing uses their dynamic discount key", () => {
  const page = fs.readFileSync("app/page.tsx", "utf8");
  const api = fs.readFileSync("app/api/operations/route.ts", "utf8");
  assert.match(page, /<select value=\{editing\.family\}/);
  assert.match(page, /productFamilies\.map\(\(family\) => <option/);
  assert.match(page, /Familias de productos/);
  assert.match(page, /Nueva familia de productos/);
  assert.match(api, /discountKeyForFamily\(family, families\)/);
  assert.match(api, /action === "save-client"/);
  assert.match(api, /action === "save-product-family"/);
  assert.match(api, /action === "archive-product-family"/);
});

test("the product family migration seeds the catalog and protects it with RLS", () => {
  const migration = fs.readFileSync("supabase/migrations/20261030011315_product_families_catalog.sql", "utf8");
  assert.match(migration, /create table public\.product_families/);
  assert.match(migration, /'Mini Tortitas'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /product_families_authenticated_read/);
  assert.match(migration, /product_families_admin_insert/);
  assert.match(migration, /product_families_admin_update/);
  assert.match(migration, /revoke all on table public\.product_families from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update on table public\.product_families to authenticated/);
  assert.doesNotMatch(migration, /grant[^;]*delete[^;]*product_families/i);
});
