begin;
-- Keep existing links; allow named intermediate bases without a master product.
alter table public.recipes alter column product_id drop not null;

create or replace function public.save_named_recipe(p_recipe_id bigint, p_product_id bigint, p_name text, p_items jsonb)
returns public.recipes
language plpgsql security invoker set search_path = public
as $$
declare
  target_id bigint;
  saved public.recipes;
  item jsonb;
  material_id bigint;
  component_id bigint;
  quantity numeric;
  total numeric := 0;
  seen text[] := '{}';
  ingredient_key text;
begin
  if public.is_admin() is distinct from true then raise exception 'No tenés permiso para guardar fórmulas.'; end if;
  perform pg_advisory_xact_lock(718234901);
  if nullif(trim(p_name), '') is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Elegí el producto y agregá al menos un ingrediente.';
  end if;
  if p_recipe_id is not null then
    select id into target_id from public.recipes where id = p_recipe_id;
    if target_id is null then raise exception 'No se encontró la fórmula que querés editar.'; end if;
  end if;
  if p_product_id is not null and exists(select 1 from public.recipes where product_id = p_product_id and id is distinct from target_id) then
    raise exception 'Ese producto del maestro ya tiene una fórmula. Abrila para editarla.';
  end if;
  for item in select value from jsonb_array_elements(p_items) loop
    material_id := nullif((item->>'materialId')::bigint, 0);
    component_id := nullif((item->>'recipeId')::bigint, 0);
    quantity := (item->>'quantityKg')::numeric;
    if (material_id is null) = (component_id is null) or quantity is null or quantity <= 0 or quantity = 'NaN'::numeric or quantity <> round(quantity, 4) then
      raise exception 'Elegí un ingrediente y una cantidad positiva de hasta cuatro decimales por renglón.';
    end if;
    ingredient_key := case when component_id is not null then 'recipe:' || component_id else 'material:' || material_id end;
    if ingredient_key = any(seen) then raise exception 'No repitas el mismo ingrediente en una fórmula.'; end if;
    seen := array_append(seen, ingredient_key);
    total := total + quantity;
    if material_id is not null then
      if not exists (select 1 from public.purchased_products where id = material_id and active) then
        raise exception 'Una materia prima ya no está disponible.';
      end if;
    else
      if not exists (select 1 from public.recipes where id = component_id and active) then
        raise exception 'Una fórmula base ya no está disponible.';
      end if;
      if component_id = target_id or exists (
        with recursive dependencies(id) as (
          select component_recipe_id from public.recipe_formula_items where recipe_id = component_id
          union
          select link.component_recipe_id from public.recipe_formula_items link join dependencies d on link.recipe_id = d.id
        ) select 1 from dependencies where id = target_id
      ) then raise exception 'Las fórmulas no pueden incluirse a sí mismas ni formar un círculo.'; end if;
    end if;
  end loop;
  if total <> 1 then raise exception 'La fórmula debe sumar exactamente 1,0000 kg.'; end if;
  if target_id is null then
    insert into public.recipes(product_id, name, yield_kg, active)
      values (p_product_id, trim(p_name), 1, true) returning * into saved;
  else
    update public.recipes set product_id = p_product_id, name = trim(p_name), yield_kg = 1, active = true
      where id = target_id returning * into saved;
  end if;
  delete from public.recipe_items where recipe_id = saved.id;
  delete from public.recipe_formula_items where recipe_id = saved.id;
  for item in select value from jsonb_array_elements(p_items) loop
    if coalesce((item->>'recipeId')::bigint, 0) > 0 then
      insert into public.recipe_formula_items(recipe_id, component_recipe_id, quantity_kg)
        values (saved.id, (item->>'recipeId')::bigint, (item->>'quantityKg')::numeric);
    else
      insert into public.recipe_items(recipe_id, purchased_product_id, quantity_kg)
        values (saved.id, (item->>'materialId')::bigint, (item->>'quantityKg')::numeric);
    end if;
  end loop;
  return saved;
end;
$$;
revoke all on function public.save_named_recipe(bigint, bigint, text, jsonb) from public, anon;
grant execute on function public.save_named_recipe(bigint, bigint, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
