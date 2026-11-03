import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture() {
  class Node {
    constructor(tag='div',text='',attrs={},children=[]){this.tag=tag;this.textContent=text;this.attrs=attrs;this.children=children;this.dataset={productionCode:attrs['data-production-code']};}
    setAttribute(key,value){this.attrs[key]=value;}
    appendChild(node){this.children.push(node);}
    replaceChildren(...nodes){this.children=nodes;this.textContent='';}
    cloneNode(){return new Node(this.tag,this.textContent,{...this.attrs},this.children.map(child=>child.cloneNode()));}
    querySelectorAll(selector){const key=selector.slice(1,-1);return [...(key in this.attrs?[this]:[]),...this.children.flatMap(child=>child.querySelectorAll(selector))];}
    querySelector(selector){return this.querySelectorAll(selector)[0];}
    get outerHTML(){return '<'+this.tag+' '+Object.entries(this.attrs).map(([key,value])=>key+'="'+value+'"').join(' ')+'>'+this.textContent+this.children.map(child=>child.outerHTML).join('')+'</'+this.tag+'>';}
  }
  const context={exports:{},document:{createElementNS:(_ns,tag)=>new Node(tag)}};
  vm.runInNewContext(compile(fs.readFileSync('lib/production-label.ts','utf8')),context);
  return {...context.exports,Node};
}
test('printed label freezes the weight and uses the confirmed barcode instead of the next preview',()=>{
  const {productionLabelHtml,Node}=fixture();
  const label=new Node('div','',{},[new Node('p','3.860 kg'),new Node('p','Pending',{'data-production-code':'hash'}),new Node('p','Pending',{'data-production-code':'plain'}),new Node('div','',{'data-production-barcode':''})]);
  const captured=label.cloneNode(true);
  label.children[0].textContent='3.250 kg';
  const html=productionLabelHtml(captured,'004793');
  assert.match(html,/3.860 kg/);assert.doesNotMatch(html,/3.250/);
  assert.match(html,/#004793/);assert.match(html,/Código de barras 004793/);
  productionLabelHtml(label,'004794');
  assert.match(html,/#004793/);assert.doesNotMatch(html,/004794/);
  assert.throws(()=>productionLabelHtml(label,''),/no confirmó/);
});
test('odd-length barcode encodes the actual final digit without adding a leading zero',()=>{
  const {barcodeGeometry}=fixture();
  assert.equal(barcodeGeometry('1000000').digits,'1000000');
  assert.equal(barcodeGeometry('004793').digits,'004793');
  assert.ok(barcodeGeometry('1000000').width>barcodeGeometry('004793').width);
});

function apiFixture(){
  const stored=[];let counter=4795;
  const profile={id:'user',display_name:'Admin',active:true,role:'administracion'};
  const tables={profiles:[profile],products:[{id:18,code:"18",active:true}],recipes:[],recipe_formula_items:[],purchased_products:[],production_units:stored};
  const supabase={from(table){let single=false,values,filters=[];const q={select(){return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},order(){return q;},limit(){return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},insert(value){values=value;return q;},then(resolve){
    if(values){if(stored.some(row=>row.registration_id===values.registration_id))return Promise.resolve({data:null,error:{code:'23505'}}).then(resolve);stored.push({id:stored.length+1,status:'stock',unique_code:String(counter++).padStart(6,'0'),created_at:'2026-11-03T12:00:00Z',...values});}
    const rows=(tables[table]??[]).filter(row=>filters.every(filter=>filter(row)));
    return Promise.resolve({data:single?(values?stored.at(-1):rows[0])??null:rows,error:null}).then(resolve);
  }};return q;}};
  const context={exports:{},Response,console,require(name){if(name.includes('supabase'))return {createServerSupabaseClient:async()=>supabase};if(name.includes('production-team'))return {PRODUCTION_TEAM:[]};return {getChatGPTUser:async()=>({id:'user'})};}};
  vm.runInNewContext(compile(fs.readFileSync('app/api/operations/route.ts','utf8')),context);
  return {...context.exports,stored};
}
const payload={action:'register-production',labelProtocol:2,record:{registrationId:'10000000-0000-4000-8000-000000000001',uniqueCode:'004794',productCode:'18',responsible:'Admin',weight:3.86,units:null,price:1000}};
const request=body=>new Request('https://example.test/api/operations',{method:'POST',body:JSON.stringify(body)});
test('server returns its assigned code and a network retry returns the same unit',async()=>{
  const api=apiFixture();
  const first=await api.POST(request(payload));assert.equal(first.status,201);assert.equal((await first.json()).unit.unique_code,'004795');
  const retry=await api.POST(request(payload));assert.equal(retry.status,201);assert.equal((await retry.json()).unit.unique_code,'004795');assert.equal(api.stored.length,1);
  const changed=await api.POST(request({...payload,record:{...payload.record,weight:3.25}}));assert.equal(changed.status,409);assert.equal(api.stored.length,1);
  const next=await api.POST(request({...payload,record:{...payload.record,registrationId:'20000000-0000-4000-8000-000000000002',weight:3.25}}));assert.equal(next.status,201);assert.equal((await next.json()).unit.unique_code,'004796');
  api.stored[0].status='despachado';assert.equal((await api.POST(request(payload))).status,409);
});
test('old open screens and missing registration tokens cannot save or print another unit',async()=>{
  const api=apiFixture();
  assert.equal((await api.POST(request({...payload,labelProtocol:undefined}))).status,409);
  assert.equal((await api.POST(request({...payload,record:{...payload.record,registrationId:undefined}}))).status,400);
  assert.equal(api.stored.length,0);
});
