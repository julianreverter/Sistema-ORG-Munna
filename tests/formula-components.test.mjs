import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source = fs.readFileSync('app/api/operations/route.ts','utf8');
const compiled = ts.transpileModule(source + '\nexport { recipeCalculator, recipeLinks };', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({ role='administracion', profile={}, rpcError=null, tables={} }={}) {
  const writes=[];
  const context={exports:{},Response,console,require(name){
    if(name.includes('supabase')) return {createServerSupabaseClient:async()=>supabase};
    if(name.includes('production-team')) return {PRODUCTION_TEAM:['Evelin De Masi','Lucas Barre','Tomas Pierini','Milagros Anahí Méndez'],PRODUCTION_LEAD_EMAIL:'evelindemasi@gmail.com'};
    if(name.includes('product-families')) return {discountKeyForFamily:()=>'',findProductFamily:()=>null,normalizeProductFamilyDiscounts:(discounts)=>discounts??{}};
    return {getChatGPTUser:async()=>({id:'user'})};
  }};
  const supabase={from(table){let single=false,inserted=null;const q={select(){return q},eq(){return q},order(){return q},limit(){return q},neq(){return q},single(){single=true;return q},maybeSingle(){single=true;return q},insert(values){inserted=values;writes.push({table,values});return q},then(resolve){let data=table==='profiles'?(tables.profiles??[{id:'user',email:'admin@test.local',display_name:'Admin',active:true,role,...profile}]):tables[table]??(table==='products'?[{id:20}]:[]);if(inserted)data=[{id:99,...inserted}];return Promise.resolve({data:single?data[0]??null:data,error:null}).then(resolve)}};return q}, async rpc(name,args){writes.push({name,args});return {data:{id:2,name:args.p_name},error:rpcError}}};
  vm.runInNewContext(compiled,context);
  return {...context.exports,writes};
}
const material=(id,cost)=>({id,purchased_product_id:id,quantity_kg:1,purchased_products:{master_name:'Material '+id,last_final_cost_per_unit:cost}});
const recipe=(id,items,yield_kg=1)=>({id,name:'Formula '+id,yield_kg,recipe_items:items});
test('0.9 kg Americana + 0.1 kg chocolate, live prices and base composition',()=>{
  const {recipeCalculator}=fixture();
  const base=recipe(1,[material(1,1000)]);
  const chocolate=material(2,10000);chocolate.quantity_kg=.1;
  const granizado=recipe(2,[chocolate]);
  const link=[{recipe_id:2,component_recipe_id:1,quantity_kg:.9}];
  assert.equal(recipeCalculator([base,granizado],link)(2).perKg,1900);
  base.recipe_items[0].purchased_products.last_final_cost_per_unit=2000;
  assert.equal(recipeCalculator([base,granizado],link)(2).perKg,2800);
  base.recipe_items[0].quantity_kg=.5;
  base.recipe_items.push({...material(3,4000),quantity_kg:.5});
  assert.equal(recipeCalculator([base,granizado],link)(2).perKg,3700);
});
test('nested formulas and legacy batch yields use cost per kilogram',()=>{
  const {recipeCalculator}=fixture();
  const calculate=recipeCalculator([recipe(1,[{...material(1,1000),quantity_kg:10}],10),recipe(2,[]),recipe(3,[])],[{recipe_id:2,component_recipe_id:1,quantity_kg:1},{recipe_id:3,component_recipe_id:2,quantity_kg:1}]);
  assert.equal(calculate(3).perKg,1000);
  assert.equal(calculate(1).items[0].quantityKg,1);
});
test('cycles and missing base formulas fail instead of pricing them as zero',()=>{
  const {recipeCalculator}=fixture();
  assert.throws(()=>recipeCalculator([recipe(1,[]),recipe(2,[])],[{recipe_id:1,component_recipe_id:2,quantity_kg:1},{recipe_id:2,component_recipe_id:1,quantity_kg:1}])(1),/círculo/);
  assert.throws(()=>recipeCalculator([recipe(1,[])],[{recipe_id:1,component_recipe_id:9,quantity_kg:1}])(1),/disponible/);
});
test('canonical current material price feeds every linked formula',()=>{
  const {recipeCalculator}=fixture();
  const prices=new Map([['material 1',{id:10,master_name:'Material 1',last_final_cost_per_unit:5000}]]);
  const result=recipeCalculator([recipe(1,[material(1,1000)]),recipe(2,[])],[{recipe_id:2,component_recipe_id:1,quantity_kg:1}],prices)(2);
  assert.equal(result.perKg,5000);
  assert.equal(result.items[0].recipeId,1);
});
const save=(api,items)=>api.POST(new Request('http://test/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-recipe',recipe:{productCode:'GR',name:'Granizado',items}})}));
test('saving uses one atomic database operation and retains formula IDs',async()=>{
  const api=fixture(); const items=[{recipeId:1,quantityKg:.9},{materialId:2,quantityKg:.1}];
  const response=await save(api,items);assert.equal(response.status,201);
  assert.equal(api.writes.length,1);assert.equal(api.writes[0].name,'save_named_recipe');
  assert.deepEqual(JSON.parse(JSON.stringify(api.writes[0].args.p_items)),items);
});
test('invalid quantities, duplicate ingredients and ambiguous types never write',async()=>{
  for(const items of [[{recipeId:1,quantityKg:.9}],[{recipeId:1,quantityKg:.9},{recipeId:1,quantityKg:.1}],[{recipeId:1,materialId:2,quantityKg:1}],[{materialId:2,quantityKg:-1}],[{materialId:2,quantityKg:'oops'}]]){
    const api=fixture();assert.equal((await save(api,items)).status,400);assert.equal(api.writes.length,0);
  }
});
test('read-only roles cannot save and database cycle errors reach the form',async()=>{
  const api=fixture({role:'jefe_produccion'});assert.equal((await save(api,[{materialId:2,quantityKg:1}])).status,403);assert.equal(api.writes.length,0);
  const rejected=fixture({rpcError:{code:'P0001',message:'Las fórmulas no pueden formar un círculo.'}});
  const response=await save(rejected,[{recipeId:1,quantityKg:1}]);assert.equal(response.status,400);assert.match((await response.json()).error,/círculo/);
});
test('missing migration keeps reads working, other database failures surface',async()=>{
  const {recipeLinks}=fixture();const client=error=>({from(){return {select:async()=>({data:null,error})}}});
  assert.equal((await recipeLinks(client({code:'42P01'}))).available,false);
  await assert.rejects(()=>recipeLinks(client({code:'42501',message:'Denied'})));
});

test('production snapshots use the live composed formula cost',async()=>{
  const base=recipe(1,[material(1,1000)]);base.product_id=10;
  const child=recipe(2,[{...material(2,10000),quantity_kg:.1}]);child.product_id=20;
  const api=fixture({tables:{recipes:[base,child],recipe_formula_items:[{recipe_id:2,component_recipe_id:1,quantity_kg:.9}]}});
  const response=await api.POST(new Request('http://test/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register-production',record:{uniqueCode:'123456',productCode:'GR',weight:5,responsible:'Admin'}})}));
  const body=await response.json();
  assert.equal(response.status,201,JSON.stringify(body));assert.equal(body.costPerKgSnapshot,1900);
  assert.equal(api.writes.find(row=>row.table==='production_units').values.cost_per_kg_snapshot,1900);
});

test('production supervisors never receive production costs',async()=>{
  const base=recipe(1,[material(1,1000)]);base.product_id=10;
  const child=recipe(2,[{...material(2,10000),quantity_kg:.1}]);child.product_id=20;
  const profile={email:'evelindemasi@gmail.com',display_name:'Evelin De Masi'};
  const api=fixture({role:'jefe_produccion',profile,tables:{recipes:[base,child],recipe_formula_items:[{recipe_id:2,component_recipe_id:1,quantity_kg:.9}]}});
  const response=await api.POST(new Request('http://test/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register-production',record:{uniqueCode:'123456',productCode:'GR',weight:5,responsible:'Evelin De Masi'}})}));
  const body=await response.json();
  assert.equal(response.status,201,JSON.stringify(body));
  assert.equal(Object.hasOwn(body,'costPerKgSnapshot'),false);
  assert.equal(Object.hasOwn(body.unit,'cost_per_kg_snapshot'),false);
  assert.equal(api.writes.find(row=>row.table==='production_units').values.cost_per_kg_snapshot,1900);
});

test('production supervisors receive stock and history with every cost field redacted',async()=>{
  const unit={id:1,unique_code:'000001',weight_kg:5,units:null,elaborated_by:'Evelin De Masi',base_price_snapshot:10000,cost_per_kg_snapshot:1900,status:'stock',created_at:'2026-10-29T12:00:00Z',dispatched_at:null,products:{code:'GR',name:'Granizado',family:'Helados',presentation:'Balde',container:'Balde'},dispatch_items:[]};
  const api=fixture({role:'jefe_produccion',profile:{email:'evelindemasi@gmail.com',display_name:'Evelin De Masi'},tables:{production_units:[unit]}});
  const response=await api.GET();
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.stock.length,1);
  assert.equal(body.productionHistory.length,1);
  assert.equal(Object.hasOwn(body.stock[0],'costPerKgSnapshot'),false);
  assert.equal(Object.hasOwn(body.productionHistory[0],'costPerKgSnapshot'),false);
  assert.deepEqual(body.rawMaterials,[]);
  assert.deepEqual(body.formulas,[]);
});

test('formulas can be saved and edited without a master product',async()=>{
  const api=fixture();
  const response=await api.POST(new Request('http://test/api/operations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save-recipe',recipe:{id:12,name:'Base Americana',productCode:'',items:[{materialId:2,quantityKg:1}]}})}));
  assert.equal(response.status,201);
  const call=api.writes.find(row=>row.name==='save_named_recipe');
  assert.equal(call.args.p_recipe_id,12);assert.equal(call.args.p_product_id,null);
  assert.equal(api.writes.some(row=>row.table==='products'),false);
});
