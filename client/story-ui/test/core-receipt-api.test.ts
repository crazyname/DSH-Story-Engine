import{mkdtemp,mkdir,writeFile}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,expect,it}from'vitest'
import{apply}from'../src/index.ts'
import{coreStepKey}from'../src/core-step-journal.ts'
import{createPreparedTransaction,reviseTransaction}from'../src/transaction-journal.ts'
import{HostCoreReceiptReader}from'../src/client/host-core-receipts.ts'

function request(method:string,url:string,payload?:unknown):any{const chunks=payload===undefined?[]:[Buffer.from(JSON.stringify(payload),'utf8')];return{method,url,headers:{host:'localhost',origin:'http://localhost'},async *[Symbol.asyncIterator](){for(const chunk of chunks)yield chunk}}}
function responseCapture(){let status=0;const headers:Record<string,unknown>={};let raw='';return{res:{writeHead(code:number,values?:Record<string,unknown>){status=code;Object.assign(headers,values)},setHeader(name:string,value:unknown){headers[name.toLowerCase()]=value},end(value?:unknown){if(value!==undefined)raw+=String(value)}},snapshot:()=>({status,body:raw===''?undefined:JSON.parse(raw)})}}
function receipt(operationId='op-a',transactionId='tx-receipt',operation='story_commit_state'){return{operationId,transactionId,operation,fingerprint:'a'.repeat(64),stateVersion:3,committedAt:'2026-09-03T00:00:00.000Z',result:{ok:true}}}
async function writeRuntime(root:string,sessionId:string,value=receipt()){const directory=join(root,'runtime','pack-a',sessionId);await mkdir(directory,{recursive:true});await writeFile(join(directory,'state.json'),JSON.stringify({_engine:{schemaVersion:3,stateVersion:3,operationReceipts:{[value.operationId]:value}}}),'utf8')}
function stepKey(){return coreStepKey('tx-receipt','story_commit_state','op-a')}

describe('core receipt Host API',()=>{
 it('returns only a receipt owned by the requested save transaction and hidden session',async()=>{
  const root=await mkdtemp(join(tmpdir(),'story-core-receipt-api-'));const registrations:any[]=[];const ctx={webServer:{register:(entry:any)=>{registrations.push(entry);return()=>{}}},effect:(factory:()=>unknown)=>factory(),on:()=>()=>{}} as any
  apply(ctx,{runtimeRoot:root,storyRuntimeRoot:join(root,'runtime'),packsRoot:join(root,'packs')})
  const saveRoute=registrations.find(entry=>entry.path==='/story-engine/api/saves');const txRoute=registrations.find(entry=>entry.path==='/story-engine/api/transactions');const receiptRoute=registrations.find(entry=>entry.path==='/story-engine/api/core-receipts');expect(receiptRoute).toBeDefined()
  let capture=responseCapture();await saveRoute.handler(request('PUT','/story-engine/api/saves/save-a',{expectedRevision:-1,projection:{saveId:'save-a',revision:0,packId:'pack-a'}}),capture.res);expect(capture.snapshot().status).toBe(200)
  const prepared=await createPreparedTransaction({transactionId:'tx-receipt',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:-1,transaction:prepared}),capture.res);expect(capture.snapshot().status).toBe(200)
  const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:0,transaction:planned}),capture.res);expect(capture.snapshot().status).toBe(200)
  const linked=reviseTransaction(planned,{operationRefs:[{stepKey:stepKey(),operationId:'op-a'}]});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:1,transaction:linked}),capture.res);expect(capture.snapshot().status).toBe(200)
  await writeRuntime(root,'session-a')

  capture=responseCapture();await receiptRoute.handler(request('GET','/story-engine/api/core-receipts/save-a/tx-receipt/op-a'),capture.res);expect(capture.snapshot()).toMatchObject({status:200,body:{sessionId:'session-a',receipt:{operationId:'op-a',transactionId:'tx-receipt',operation:'story_commit_state'}}})
  capture=responseCapture();await receiptRoute.handler(request('GET','/story-engine/api/core-receipts/save-a/tx-receipt/op-other'),capture.res);expect(capture.snapshot()).toMatchObject({status:409,body:{error:expect.stringContaining('不属于')}})
 })

 it('fails closed on receipt transaction/tool mismatch and duplicate receipts across hidden sessions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'story-core-receipt-conflict-'));const registrations:any[]=[];const ctx={webServer:{register:(entry:any)=>{registrations.push(entry);return()=>{}}},effect:(factory:()=>unknown)=>factory(),on:()=>()=>{}} as any
  apply(ctx,{runtimeRoot:root,storyRuntimeRoot:join(root,'runtime'),packsRoot:join(root,'packs')})
  const saveRoute=registrations.find(entry=>entry.path==='/story-engine/api/saves');const txRoute=registrations.find(entry=>entry.path==='/story-engine/api/transactions');const receiptRoute=registrations.find(entry=>entry.path==='/story-engine/api/core-receipts')
  let capture=responseCapture();await saveRoute.handler(request('PUT','/story-engine/api/saves/save-a',{expectedRevision:-1,projection:{saveId:'save-a',revision:0,packId:'pack-a'}}),capture.res)
  const prepared=await createPreparedTransaction({transactionId:'tx-receipt',saveId:'save-a',channelId:'scene-main',text:'继续',baseProjectionRevision:0});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:-1,transaction:prepared}),capture.res)
  const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-a',kind:'initial',state:'planned',sessionId:'session-a'}],activeTurnId:'turn-a'});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:0,transaction:planned}),capture.res)
  const linked=reviseTransaction(planned,{operationRefs:[{stepKey:stepKey(),operationId:'op-a'}]});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:1,transaction:linked}),capture.res)

  await writeRuntime(root,'session-a',receipt('op-a','tx-other'))
  capture=responseCapture();await receiptRoute.handler(request('GET','/story-engine/api/core-receipts/save-a/tx-receipt/op-a'),capture.res);expect(capture.snapshot()).toMatchObject({status:409,body:{error:expect.stringContaining('transaction identity 冲突')}})

  await writeRuntime(root,'session-a',receipt('op-a','tx-receipt','story_advance_scene'))
  capture=responseCapture();await receiptRoute.handler(request('GET','/story-engine/api/core-receipts/save-a/tx-receipt/op-a'),capture.res);expect(capture.snapshot()).toMatchObject({status:409,body:{error:expect.stringContaining('operation identity 冲突')}})

  await writeRuntime(root,'session-a')
  const twoSessions=reviseTransaction(linked,{hiddenTurns:[...linked.hiddenTurns,{turnId:'turn-b',kind:'retry',state:'planned',sessionId:'session-b'}]});capture=responseCapture();await txRoute.handler(request('PUT','/story-engine/api/transactions/save-a/tx-receipt',{expectedRevision:2,transaction:twoSessions}),capture.res);expect(capture.snapshot().status).toBe(200)
  await writeRuntime(root,'session-b')
  capture=responseCapture();await receiptRoute.handler(request('GET','/story-engine/api/core-receipts/save-a/tx-receipt/op-a'),capture.res);expect(capture.snapshot()).toMatchObject({status:409,body:{error:expect.stringContaining('多个 hidden session')}})
 })
})

describe('browser core receipt reader',()=>{
 it('validates the returned receipt and transaction identity',async()=>{
  const reader=new HostCoreReceiptReader(async()=>new Response(JSON.stringify({sessionId:'session-a',receipt:receipt()}),{status:200,headers:{'content-type':'application/json'}}) as never)
  await expect(reader.load('save-a','tx-receipt','op-a')).resolves.toMatchObject({sessionId:'session-a',receipt:{operationId:'op-a',transactionId:'tx-receipt'}})
  const mismatched=new HostCoreReceiptReader(async()=>new Response(JSON.stringify({sessionId:'session-a',receipt:receipt('op-a','tx-other')}),{status:200,headers:{'content-type':'application/json'}}) as never)
  await expect(mismatched.load('save-a','tx-receipt','op-a')).rejects.toThrow('transaction identity 冲突')
 })

 it('treats only 204 as no receipt and rejects missing endpoints or malformed evidence',async()=>{
  await expect(new HostCoreReceiptReader(async()=>new Response(null,{status:204}) as never).load('save-a','tx-receipt','op-a')).resolves.toBeUndefined()
  await expect(new HostCoreReceiptReader(async()=>new Response(null,{status:404}) as never).load('save-a','tx-receipt','op-a')).rejects.toThrow('读取 Core receipt 失败：404')
  await expect(new HostCoreReceiptReader(async()=>new Response(JSON.stringify({sessionId:'',receipt:receipt()}),{status:200}) as never).load('save-a','tx-receipt','op-a')).rejects.toThrow('缺少 sessionId')
 })
})
