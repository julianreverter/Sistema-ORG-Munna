import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
function fixture(role='administracion',rpcError=null) {
  const calls=[];
  const supabase={from(){const q={select(){return q;},eq(){return q;},single:async()=>({data:{id:'user',active:true,role},error:null})};return q;},rpc:async(name,args)=>{calls.push({name,args});return {data:{id:1,creditNoteNumber:'NC-D-000001',amount:19500},error:rpcError};}};
  const context={exports:{},Response,console,require(name){return name.includes('supabase')?{createServerSupabaseClient:async()=>supabase}:{getChatGPTUser:async()=>({id:'user'})};}};
  const compiled=ts.transpileModule(fs.readFileSync('app/api/operations/route.ts','utf8')+'\nexport { productionRow };',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(compiled,context);
  return {...context.exports,calls};
}
const request=(changes={})=>new Request('https://example.test/api/operations',{method:'POST',body:JSON.stringify({action:'register-customer-return',dispatchId:1,uniqueCode:'001',reason:'No entró en el freezer',comment:'',receivedComplete:true,...changes})});
test('complete customer return delegates the atomic operation without accepting a price or partial quantity',async()=>{
  const f=fixture();
  const response=await f.POST(request({amount:1,units:5}));
  assert.equal(response.status,201);
  assert.equal((await response.json()).receipt.amount,19500);
  assert.equal(f.calls[0].name,'register_customer_return');
  assert.deepEqual(Object.keys(f.calls[0].args).sort(),['p_code','p_comment','p_dispatch_id','p_reason']);
});
test('return requires administration, a remittance and confirmation of complete receipt',async()=>{
  for(const role of ['maestro_heladero','jefe_produccion']) {const f=fixture(role);assert.equal((await f.POST(request())).status,403);assert.equal(f.calls.length,0);}
  for(const change of [{dispatchId:0},{uniqueCode:''},{receivedComplete:false}]){const f=fixture();assert.equal((await f.POST(request(change))).status,400);assert.equal(f.calls.length,0);}
  assert.equal((await fixture('administracion',{message:'Ya devuelta'}).POST(request())).status,409);
});
test('current production destination ignores returned shipments and follows re-dispatch',()=>{
  const {productionRow}=fixture();
  const unit={id:1,status:'stock',dispatch_items:[{id:1,returned_at:'2026-11-03',dispatches:{remittance_number:'R-1',clients:{name:'Anterior'}}}]};
  assert.equal(productionRow(unit).remittanceNumber,null);
  unit.status='despachado';unit.dispatch_items.push({id:2,returned_at:null,dispatches:{remittance_number:'R-2',clients:{name:'Actual'}}});
  assert.equal(productionRow(unit).remittanceNumber,'R-2');
  assert.equal(productionRow(unit).clientName,'Actual');
});
