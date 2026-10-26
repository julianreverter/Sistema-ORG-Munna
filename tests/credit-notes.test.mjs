import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync('app/api/operations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({role='administracion',failItems=false}={}) {
  const tables={profiles:[{id:'user',active:true,role}],suppliers:[{id:1,name:'Proveedor',tax_mode:'con_iva',active:true}],purchased_products:[{id:1,master_name:'Crema',active:true,vat_rate:21,content_per_package:1,last_final_cost_per_unit:800}],purchases:[],purchase_items:[],supplier_payments:[]};
  const writes=[];
  const supabase={from(table){let action='read',values,filters=[],single=false,selection='';
    const query={select(s='*'){selection=s;return query},eq(k,v){filters.push(r=>r[k]===v);return query},neq(k,v){filters.push(r=>r[k]!==v);return query},order(){return query},limit(){return query},single(){single=true;return query},maybeSingle(){single=true;return query},insert(v){action='insert';values=v;return query},upsert(v){action='upsert';values=v;return query},update(v){action='update';values=v;return query},delete(){action='delete';return query},then(resolve,reject){try{
      let rows=tables[table]??=[];
      if(action!=='read')writes.push({table,action,values});
      if(action==='insert'&&table==='purchase_items'&&failItems)return Promise.resolve({data:null,error:{message:'item failure'}}).then(resolve,reject);
      let result=rows.filter(r=>filters.every(f=>f(r)));
      if(action==='upsert'){const found=rows.find(r=>r.name===values.name);if(found){Object.assign(found,values);result=[found]}else{const row={id:rows.length+1,...values};rows.push(row);result=[row]}}
      if(action==='insert'){result=(Array.isArray(values)?values:[values]).map(v=>({id:rows.length+1,...v}));rows.push(...result)}
      if(action==='update')result.forEach(r=>Object.assign(r,values));
      if(action==='delete')tables[table]=rows.filter(r=>!result.includes(r));
      if(table==='purchases'&&action==='read'&&selection.includes('purchase_items'))result=result.map(r=>({...r,suppliers:{name:'Proveedor'},purchase_items:tables.purchase_items.filter(i=>i.purchase_id===r.id).map(i=>({...i,purchased_products:{master_name:'Crema'}}))}));
      return Promise.resolve({data:single?result[0]??null:result,error:null}).then(resolve,reject);
    }catch(error){return Promise.reject(error).then(resolve,reject)}}};return query}};
  const exports={};vm.runInNewContext(source,{exports,Response,console,require(name){return name.includes('supabase')?{createServerSupabaseClient:async()=>supabase}:{getChatGPTUser:async()=>({id:'user'})}}});
  return {tables,writes,...exports};
}
const payload={action:'register-credit-note',supplierTaxMode:'Con IVA',purchase:{supplier:'Proveedor',invoice:'NC 1',invoiceDate:'2026-10-26',dueDate:'2026-11-20',payment:'Pagado'},lines:[{product:'Crema',kind:'material',center:'Fábrica',quantity:'2',price:'1.000,50',priceMode:'excluded'}]};
const request=body=>new Request('https://example.test/api/operations',{method:'POST',body:JSON.stringify(body)});
test('return subtracts expenses and VAT, leaves supplier credit and preserves formula cost',async()=>{
  const f=fixture();assert.equal((await f.POST(request(payload))).status,201);
  const data=await (await f.GET()).json();const note=data.purchases[0];
  assert.equal(note.total,-2421.21);assert.equal(note.tax,-420.21);assert.equal(note.allocations[0].gross,-2421.21);
  assert.equal(note.documentType,'credit_note');assert.equal(note.dueDate,null);assert.equal(note.lines[0].quantity,2);
  assert.equal(data.suppliers[0].debt,-2421.21);assert.equal(data.rawMaterials[0].cost,800);
  assert.equal(f.writes.some(w=>w.table==='purchased_products'&&w.action==='update'),false);
});
test('credit reduces unpaid invoices and survives editing with the same document type',async()=>{
  const f=fixture();await f.POST(request(payload));
  f.tables.purchases.push({id:100,supplier_id:1,invoice_number:'FC 1',invoice_date:'2026-10-01',payment_status:'cuenta_corriente',gross_total:5000,cost_center:'Fábrica'});
  const edited={...payload,action:'update-purchase',purchaseId:1,lines:[{...payload.lines[0],quantity:'1'}]};
  assert.equal((await f.POST(request(edited))).status,200);
  const data=await (await f.GET()).json();assert.equal(data.purchases[0].documentType,'credit_note');assert.equal(data.suppliers[0].debt,3789.39);
});
test('credit notes cannot be marked paid',async()=>{
  const f=fixture();await f.POST(request(payload));assert.equal((await f.POST(request({action:'mark-purchase-paid',purchaseId:1}))).status,400);
});
test('failure writing returned items removes the new financial header',async()=>{
  const f=fixture({failItems:true});assert.equal((await f.POST(request(payload))).status,500);assert.equal(f.tables.purchases.length,0);
});
test('negative quantities and unauthorized roles are rejected',async()=>{
  const f=fixture();assert.equal((await f.POST(request({...payload,lines:[{...payload.lines[0],quantity:'-1'}]}))).status,400);assert.equal(f.tables.purchases.length,0);
  const restricted=fixture({role:'maestro_heladero'});assert.equal((await restricted.POST(request(payload))).status,403);
});
