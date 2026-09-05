import{assertSaveId,assertTransactionId}from'../transaction-journal.ts'
import{validateCoreReceipt,type StoryCoreReceipt}from'../core-receipt.ts'

export interface HostCoreReceiptEvidence{sessionId:string;receipt:StoryCoreReceipt}

export class HostCoreReceiptReader{
 constructor(private readonly fetcher:typeof fetch=(input,init)=>fetch(input,init)){}
 private endpoint(saveId:string,transactionId:string,operationId:string):string{
  assertSaveId(saveId);assertTransactionId(transactionId);assertTransactionId(operationId,'operationId')
  return`/story-engine/api/core-receipts/${encodeURIComponent(saveId)}/${encodeURIComponent(transactionId)}/${encodeURIComponent(operationId)}`
 }
 async load(saveId:string,transactionId:string,operationId:string):Promise<HostCoreReceiptEvidence|undefined>{
  const response=await this.fetcher(this.endpoint(saveId,transactionId,operationId),{headers:{accept:'application/json'}})
  if(response.status===204)return undefined
  if(!response.ok){const detail=await response.json().catch(()=>({}))as{error?:string};throw new Error(detail.error??`读取 Core receipt 失败：${response.status}`)}
  const body=await response.json()as{sessionId?:unknown;receipt?:unknown}
  if(typeof body.sessionId!=='string'||body.sessionId.trim()==='')throw new Error('Core receipt 响应缺少 sessionId')
  assertTransactionId(body.sessionId,'sessionId')
  const receipt=validateCoreReceipt(body.receipt,operationId)
  if(receipt.transactionId!==transactionId)throw new Error(`Core receipt transaction identity 冲突：${operationId}`)
  return{sessionId:body.sessionId,receipt}
 }
}
