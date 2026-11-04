import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(fs.readFileSync('app/api/operations/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({role='administracion',failItems=false}={}) {
  const tables={profiles:[{id:'user',active:true,role}],suppliers:[{id:1,name:'Proveedor',tax_mode:'con_iva',active:true}],purchased_products:[{id:1,master_name:'Crema',active:true,vat_rate:21,content_per_package:1,last_final_cost_per_unit:800}],purchases:[],purchase_items:[],supplier_payments:[],operating_expenses:[]};
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

const request=body=>new Request('https://example.test/api/operations',{method:'POST',body:JSON.stringify(body)});
const expense={category:'Sueldos',area:'F�brica',concept:'Sueldo octubre',employee:'Equipo',payrollPeriod:'2026-10',paymentStatus:'Pendiente',amount:1234.56,notes:'Prueba'};
test('salary without invoice belongs to worked month and payment does not duplicate cost',async()=>{
 const f=fixture();const r=await f.POST(request({action:'register-expense',expense}));assert.equal(r.status,201);const saved=(await r.json()).expense;assert.equal(saved.employee,'Equipo');assert.equal(saved.expenseDate,'2026-10-01');
 assert.equal((await f.POST(request({action:'pay-expense',id:saved.id}))).status,200);
 assert.equal((await f.POST(request({action:'pay-expense',id:saved.id}))).status,409);
 assert.equal(f.tables.operating_expenses.length,1);assert.equal(f.tables.operating_expenses[0].amount,1234.56);
 const view=await (await f.GET()).json();assert.equal(view.operatingExpenses[0].paymentStatus,'Pagado');assert.equal(view.operatingExpenses[0].notes,'Prueba');
});
test('salary validation and permissions reject invalid writes',async()=>{
 for(const patch of [{employee:''},{payrollPeriod:'2026-13'},{amount:-5},{paymentStatus:'x'}]){const f=fixture();assert.equal((await f.POST(request({action:'register-expense',expense:{...expense,...patch}}))).status,400);assert.equal(f.tables.operating_expenses.length,0)}
 const f=fixture({role:'maestro_heladero'});assert.equal((await f.POST(request({action:'register-expense',expense}))).status,403);assert.equal((await f.POST(request({action:'pay-expense',id:1}))).status,403);
});
