import type{StoryOperationRef,StoryTransactionRecord}from'../transaction-journal.ts'
import type{StoryCoreReceipt}from'../core-receipt.ts'
import type{HostCoreReceiptReader}from'./host-core-receipts.ts'
import type{DshToolEvidenceReader,DurableStoryToolCallEvidence}from'./dsh-tool-evidence.ts'
import{isKnownSkippedStoryResult}from'./tool-operation-evidence.ts'

export type CoreOperationResolutionState='applied-or-replayed'|'skipped'|'failed'|'pending'|'inconsistent'
export interface CoreOperationResolution{
 ref:StoryOperationRef
 state:CoreOperationResolutionState
 receipt?:StoryCoreReceipt
 evidence:DurableStoryToolCallEvidence[]
 detail?:string
}
export interface CoreTransactionReconciliation{
 operations:CoreOperationResolution[]
 hasCanonicalEffect:boolean
 readyForSocialCommit:boolean
 deterministicNoEffectFailure:boolean
 repairablePartial:boolean
 unresolved:boolean
}

type ReceiptPort=Pick<HostCoreReceiptReader,'load'>
type ToolPort=Pick<DshToolEvidenceReader,'load'>

export class CoreTransactionReconciler{
 constructor(private readonly receipts:ReceiptPort,private readonly tools:ToolPort){}
 async reconcile(record:StoryTransactionRecord):Promise<CoreTransactionReconciliation>{
  if(record.operationRefs.length===0)return{operations:[],hasCanonicalEffect:false,readyForSocialCommit:true,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:false}
  const sessionIds=[...new Set(record.hiddenTurns.map(turn=>turn.sessionId).filter((value):value is string=>value!==undefined))]
  if(sessionIds.length===0)throw new Error(`transaction ${record.transactionId} 有 operationRef 但缺少 hidden session evidence`)
  const sessionSet=new Set(sessionIds)

  const receiptEntries=await Promise.all(record.operationRefs.map(async ref=>({ref,evidence:await this.receipts.load(record.saveId,record.transactionId,ref.operationId)})))
  const operationIds=record.operationRefs.map(ref=>ref.operationId)
  const toolEvidence=await this.tools.load(sessionIds,record.transactionId,operationIds)
  const byOperation=new Map<string,DurableStoryToolCallEvidence[]>()
  for(const evidence of toolEvidence){const list=byOperation.get(evidence.operationId)??[];list.push(evidence);byOperation.set(evidence.operationId,list)}

  const operations:CoreOperationResolution[]=receiptEntries.map(({ref,evidence:receiptEvidence})=>{
   const evidence=byOperation.get(ref.operationId)??[]
   const evidenceSessions=new Set(evidence.map(item=>item.sessionId))
   if(receiptEvidence!==undefined)evidenceSessions.add(receiptEvidence.sessionId)
   if(evidenceSessions.size>1)return{ref,state:'inconsistent',evidence,detail:'同一 operationId 在多个 hidden session 出现 receipt/tool evidence'}
   const callIdentities=new Set(evidence.map(item=>`${item.toolName}\u0000${item.argumentsCanonical}`))
   if(callIdentities.size>1)return{ref,state:'inconsistent',evidence,detail:'同一 operationId 被不同 tool 或 arguments 复用'}

   if(receiptEvidence!==undefined){
    if(!sessionSet.has(receiptEvidence.sessionId))return{ref,state:'inconsistent',evidence,detail:'Core receipt 来自 transaction 未登记的 hidden session'}
    if(evidence.some(item=>item.toolName!==receiptEvidence.receipt.operation))return{ref,state:'inconsistent',evidence,detail:'Core receipt operation 与 durable tool identity 冲突'}
    return{ref,state:'applied-or-replayed',receipt:receiptEvidence.receipt,evidence}
   }
   if(evidence.length===0)return{ref,state:'pending',evidence,detail:'尚未在 DSH durable history 找到 matching tool outcome'}
   const successful=evidence.filter(item=>item.resultSeq!==undefined&&item.isError===false)
   const pending=evidence.filter(item=>item.resultSeq===undefined)
   const failed=evidence.filter(item=>item.resultSeq!==undefined&&item.isError===true)
   if(pending.length>0)return{ref,state:'pending',evidence,detail:'tool/call 已持久化但仍有未终态 attempt'}
   if(successful.length>0){
    if(successful.every(isKnownSkippedStoryResult))return{ref,state:'skipped',evidence}
    return{ref,state:'inconsistent',evidence,detail:'成功 mutating tool result 缺少 matching Core receipt，且不是已知 no-op'}
   }
   if(failed.length>0)return{ref,state:'failed',evidence,detail:'matching mutating tool attempt 已明确失败且无 Core receipt'}
   return{ref,state:'pending',evidence,detail:'matching tool evidence 尚未形成可判定 terminal outcome'}
  })

  const hasCanonicalEffect=operations.some(item=>item.state==='applied-or-replayed')
  const readyForSocialCommit=operations.every(item=>item.state==='applied-or-replayed'||item.state==='skipped')
  const deterministicNoEffectFailure=!hasCanonicalEffect&&operations.some(item=>item.state==='failed')&&operations.every(item=>item.state==='failed'||item.state==='skipped')
  const unresolved=operations.some(item=>item.state==='pending'||item.state==='inconsistent')
  const repairablePartial=hasCanonicalEffect&&!unresolved&&operations.some(item=>item.state==='failed')&&operations.every(item=>item.state==='applied-or-replayed'||item.state==='skipped'||item.state==='failed')
  return{operations,hasCanonicalEffect,readyForSocialCommit,deterministicNoEffectFailure,repairablePartial,unresolved}
 }
}
