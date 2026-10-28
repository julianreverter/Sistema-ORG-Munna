type Row = Record<string, any>;
const one = (value: Row | Row[] | null | undefined): Row | undefined => Array.isArray(value) ? value[0] : value ?? undefined;
const nameKey = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("es-AR");
export function currentFormulaCosts(recipes: Row[], links: Row[], materials: Row[]) {
  const byId = new Map(recipes.map((row) => [Number(row.id), row]));
  const byName = new Map<string, Row>();
  for (const material of [...materials].sort((a, b) => String(b.last_purchase_at ?? "").localeCompare(String(a.last_purchase_at ?? "")) || Number(a.id) - Number(b.id))) {
    if (!byName.has(nameKey(material.master_name))) byName.set(nameKey(material.master_name), material);
  }
  const memo = new Map<number, number | null>();
  const visiting = new Set<number>();
  const calculate = (id: number): number | null => {
    if (memo.has(id)) return memo.get(id)!;
    const recipe = byId.get(id);
    if (!recipe || visiting.has(id) || !(Number(recipe.yield_kg) > 0)) return null;
    visiting.add(id);
    let total = 0, valid = true;
    const ingredients: Row[] = recipe.recipe_items ?? [];
    const components = links.filter((link) => Number(link.recipe_id) === id);
    if (!ingredients.length && !components.length) valid = false;
    for (const item of ingredients) {
      const linked = one(item.purchased_products);
      const material = byName.get(nameKey(linked?.master_name)) ?? linked;
      if (material?.last_final_cost_per_unit == null || !Number.isFinite(Number(material.last_final_cost_per_unit))) valid = false;
      else total += Number(item.quantity_kg) * Number(material.last_final_cost_per_unit);
    }
    for (const component of components) {
      const cost = calculate(Number(component.component_recipe_id));
      if (cost == null) valid = false;
      else total += Number(component.quantity_kg) * cost;
    }
    visiting.delete(id);
    const result = valid ? total / Number(recipe.yield_kg) : null;
    memo.set(id, result);
    return result;
  };
  const result = new Map<number, number | null>();
  for (const recipe of recipes) if (recipe.product_id != null) result.set(Number(recipe.product_id), calculate(Number(recipe.id)));
  return result;
}
