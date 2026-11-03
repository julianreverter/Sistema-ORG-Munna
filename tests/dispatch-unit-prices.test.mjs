import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const page = fs.readFileSync('app/page.tsx','utf8');
const start = page.indexOf('  const lineAmount = (record: ProductionRecord) =>');
const end = page.indexOf('  const total = lines.reduce', start);
function preview(record, discount = 0, billingWeight = 'Neto') {
  const context = { exports: {}, selectedClient: { billingWeight }, productFamilies: [], discountFor: () => discount, tareFor: () => 0.28 };
  const source = page.slice(start,end) + '\nexports.calculate = lineAmount;';
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText, context);
  return context.exports.calculate(record);
}
test('dispatch preview multiplies alfajor and cannoli boxes by their unit count before discounts', () => {
  assert.equal(preview({weight:null,units:20,price:1500}),30000);
  assert.equal(preview({weight:null,units:10,price:6000}),60000);
  assert.equal(preview({weight:null,units:20,price:1500},35),19500);
  assert.equal(preview({weight:null,units:10,price:6000},35),39000);
  assert.equal(preview({weight:null,units:1,price:6000}),6000);
  assert.equal(preview({weight:7.5,units:null,price:1000}),7500);
  assert.equal(preview({weight:7.5,units:null,price:1000},0,'Bruto'),7780);
});

test('saved dispatch line items and header charge the same quantities as the preview', async () => {
  const units = [
    {id:1,unique_code:'001',status:'stock',weight_kg:null,units:20,base_price_snapshot:1500,products:{family:'Postre congelado'}},
    {id:2,unique_code:'002',status:'stock',weight_kg:null,units:10,base_price_snapshot:6000,products:{family:'Postre congelado'}},
  ];
  const tables = { profiles:[{id:'user',active:true,role:'jefe_produccion'}], clients:[{id:1,name:'Sucursal',discounts:{postres:35}}], production_units:units, product_families:[{id:1,name:'Postre congelado',label:'Postres congelados',discount_key:'postres',active:true,unit_type:'unidad'}], dispatches:[], dispatch_items:[] };
  const supabase = { from(table) {
    let action='read',values,single=false,filters=[];
    const q = { select(){return q;}, eq(key,value){filters.push(row=>row[key]===value);return q;}, in(key,values){filters.push(row=>values.includes(row[key]));return q;}, order(){return q;}, limit(){return q;}, single(){single=true;return q;}, maybeSingle(){single=true;return q;}, insert(value){action='insert';values=value;return q;}, update(value){action='update';values=value;return q;}, then(resolve){
      let rows=(tables[table]??[]).filter(row=>filters.every(filter=>filter(row)));
      if(action==='insert'){rows=(Array.isArray(values)?values:[values]).map((row,index)=>({id:index+1,...row}));tables[table].push(...rows);}
      if(action==='update')rows.forEach(row=>Object.assign(row,values));
      return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve);
    } }; return q;
  } };
  const context={exports:{},Response,console,require(name){
    if(name.includes('supabase'))return {createServerSupabaseClient:async()=>supabase};
    if(name.includes('product-families'))return {discountKeyForFamily:()=> 'postres',normalizeProductFamilyDiscounts:value=>value};
    return {getChatGPTUser:async()=>({id:'user'})};
  }};
  const source=ts.transpileModule(fs.readFileSync('app/api/operations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(source,context);
  const response=await context.exports.POST(new Request('https://example.test/api/operations',{method:'POST',body:JSON.stringify({action:'create-dispatch',codes:['001','002'],client:{name:'Sucursal',discounts:{postres:35}}})}));
  assert.equal(response.status,201,JSON.stringify(await response.json()));
  assert.equal(tables.dispatch_items[0].units,20);
  assert.equal(tables.dispatch_items[0].unit_price,1500);
  assert.equal(tables.dispatch_items[0].line_total,19500);
  assert.equal(tables.dispatch_items[1].line_total,39000);
  assert.equal(tables.dispatches[0].subtotal,90000);
  assert.equal(tables.dispatches[0].total,58500);
  assert.equal(tables.dispatches[0].discount_total,31500);
});
