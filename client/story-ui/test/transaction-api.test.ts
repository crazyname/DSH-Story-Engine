import{mkdtemp}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,expect,it}from'vitest'
import{apply}from'../src/index.ts'
import{createPreparedTransaction}from'../src/transaction-journal.ts'

function request(method:string,url:string,payload?:unknown,origin:string|undefined='http://localhost'):any{const chunks=payload===undefined?[]:[Buffer.from(JSON.stringify(payload),'utf8')];return{method,url,headers:{host:'localhost',...(origin===undefined?{}:{origin})},async *[Symbol.asyncIterator](){for(const chunk of chunks)yield chunk}}}
function responseCapture():{res:any;snapshot:()=>{status:number;headers:Record<string,unknown>;body:unknown}}{let status=0;const headers:Record<string,unknown>={};let raw='';return{res:{writeHead(code:number,values?:Record<string,unknown>){status=code;Object.assign(headers,values)},setHeader(name:string,value:unknown){headers[name.toLowerCase()]=value},end(value?:unknown){if(value!==undefined)raw+=String(value)}},snapshot:()=>({status,headers,body:raw===''?undefined:JSON.parse(raw)})}}

describe('transaction host API',()=>{
 it('supports PUT, GET, list, optimistic conflict, path decode errors, and same-origin writes',async()=>{const root=await mkdtemp(join(tmpdir(),'story-tx-api-'));const registrations:any[]=[];const ctx={webServer:{register:(entry:any)=>{registrations.push(entry);return()=>{}}},effect:(factory:()=>unknown)=>factory()} as any;apply(ctx,{runtimeRoot:root,storyRuntimeRoot:join(root,'runtime'),packsRoot:join(root,'packs')});const route=registrations.find(entry=>entry.path==='/story-engine/api/transactions');expect(route).toBeDefined();const first=await createPreparedTransaction({transactionId:'tx:api',saveId:'save-a',channelId:'scene-main',text:'A',baseProjectionRevision:0});
  let capture=responseCapture();await route.handler(request('PUT','/story-engine/api/transactions/save-a/tx%3Aapi',{expectedRevision:-1,transaction:first}),capture.res);expect(capture.snapshot()).toMatchObject({status:200,body:{transactionId:'tx:api',revision:0}})
  capture=responseCapture();await route.handler(request('GET','/story-engine/api/transactions/save-a/tx%3Aapi',undefined,undefined),capture.res);expect(capture.snapshot()).toMatchObject({status:200,body:{transactionId:'tx:api'}})
  capture=responseCapture();await route.handler(request('GET','/story-engine/api/transactions/save-a',undefined,undefined),capture.res);expect(capture.snapshot()).toMatchObject({status:200,body:{transactions:[{transactionId:'tx:api'}]}})
  const collision=await createPreparedTransaction({transactionId:'tx:api',saveId:'save-a',channelId:'scene-main',text:'B',baseProjectionRevision:0});capture=responseCapture();await route.handler(request('PUT','/story-engine/api/transactions/save-a/tx%3Aapi',{expectedRevision:-1,transaction:collision}),capture.res);expect(capture.snapshot().status).toBe(409)
  capture=responseCapture();await route.handler(request('GET','/story-engine/api/transactions/save-a/%E0%A4%A',undefined,undefined),capture.res);expect(capture.snapshot().status).toBe(400)
  const other=await createPreparedTransaction({transactionId:'tx-cross-origin',saveId:'save-a',channelId:'scene-main',text:'C',baseProjectionRevision:0});capture=responseCapture();await route.handler(request('PUT','/story-engine/api/transactions/save-a/tx-cross-origin',{expectedRevision:-1,transaction:other},'https://evil.example'),capture.res);expect(capture.snapshot().status).toBe(403)
 })
})
