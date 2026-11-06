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
    const query={ilike(k,v){filters.push(r=>String(r[k]).toLowerCase()===String(v).toLowerCase());return query},select(s='*'){selection=s;return query},eq(k,v){filters.push(r=>r[k]===v);return query},neq(k,v){filters.push(r=>r[k]!==v);return query},order(){return query},limit(){return query},single(){single=true;return query},maybeSingle(){single=true;return query},insert(v){action='insert';values=v;return query},upsert(v){action='upsert';values=v;return query},update(v){action='update';values=v;return query},delete(){action='delete';return query},then(resolve,reject){try{
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
test('create and rename keep a stable key and custom catalog categories survive reads',async()=>{
 const f=fixture();
 let r=await f.POST(request({action:'save-expense-category',name:'Publicidad'}));assert.equal(r.status,200);
 r=await f.POST(request({action:'save-expense-category',key:'Publicidad',name:'Marketing'}));assert.equal(r.status,200);
 const view=await(await f.GET()).json();assert.deepEqual(JSON.parse(JSON.stringify(view.expenseCategories)),[{id:1,key:'Publicidad',name:'Marketing'}]);
 const saved=await f.POST(request({action:'register-expense',expense:{category:'Publicidad',area:'FÃ¡brica',concept:'CampaÃ±a',amount:100}}));assert.equal(saved.status,201);assert.equal((await saved.json()).expense.category,'Publicidad');
 const material=await f.POST(request({action:'register-raw-material',material:{name:'Anuncios',kind:'expense',category:'Publicidad',vat:21,contentPerPackage:1,unit:'unidad'}}));assert.equal(material.status,201);
 const updated=await(await f.GET()).json();assert.equal(updated.rawMaterials.find(r=>r.name==='Anuncios').category,'Publicidad');
});
test('category administration requires admin and validates names',async()=>{
 const denied=fixture({role:'maestro_heladero'});assert.equal((await denied.POST(request({action:'save-expense-category',name:'Publicidad'}))).status,403);assert.equal(denied.writes.length,0);
 const f=fixture();for(const name of ['', 'Materia prima','x'.repeat(81)])assert.equal((await f.POST(request({action:'save-expense-category',name}))).status,400);
 assert.equal((await f.POST(request({action:'save-expense-category',key:'missing',name:'Nueva'}))).status,404);
});
