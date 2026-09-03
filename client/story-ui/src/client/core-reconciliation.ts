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

  const receiptEntries=await Promise.all(record.operationRefs.map(async ref=>({ref,evidence:await this.receipts.load(record.saveId,record.transactionId,ref.operationId)})))
  const unresolvedIds=receiptEntries.filter(entry=>entry.evidence===undefined).map(entry=>entry.ref.operationId)
  const toolEvidence=await this.tools.load(sessionIds,record.transactionId,unresolvedIds)
  const byOperation=new Map<string,DurableStoryToolCallEvidence[]>()
  for(const evidence of toolEvidence){const list=byOperation.get(evidence.operationId)??[];list.push(evidence);byOperation.set(evidence.operationId,list)}

  const operations:CoreOperationResolution[]=receiptEntries.map(({ref,evidence:receiptEvidence})=>{
   if(receiptEvidence!==undefined)return{ref,state:'applied-or-replayed',receipt:receiptEvidence.receipt,evidence:[]}
   const evidence=byOperation.get(ref.operationId)??[]
   const successful=evidence.filter(item=>item.resultSeq!==undefined&&item.isError===false)
   const pending=evidence.filter(item=>item.resultSeq===undefined)
   const failed=evidence.filter(item=>item.resultSeq!==undefined&&item.isError===true)
   if(successful.length>0){
    const sessions=new Set(successful.map(item=>item.sessionId))
    if(sessions.size>1)return{ref,state:'inconsistent',evidence,detail:'同一 operationId 在多个 hidden session 出现成功 tool result'}
    if(successful.every(isKnownSkippedStoryResult))return{ref,state:'skipped',evidence}
    return{ref,state:'inconsistent',evidence,detail:'成功 mutating tool result 缺少 matching Core receipt，且不是已知 no-op'}
   }
   if(pending.length>0)return{ref,state:'pending',evidence,detail:'tool/call 已持久化但尚无 terminal tool/result'}
   if(failed.length>0)return{ref,state:'failed',evidence,detail:'matching mutating tool attempt 已明确失败且无 Core receipt'}
   return{ref,state:'pending',evidence,detail:'尚未在 DSH durable history 找到 matching tool outcome'}
  })

  const hasCanonicalEffect=operations.some(item=>item.state==='applied-or-replayed')
  const readyForSocialCommit=operations.every(item=>item.state==='applied-or-replayed'||item.state==='skipped')
  const deterministicNoEffectFailure=!hasCanonicalEffect&&operations.some(item=>item.state==='failed')&&operations.every(item=>item.state==='failed'||item.state==='skipped')
  const repairablePartial=hasCanonicalEffect&&operations.some(item=>item.state==='failed')&&operations.every(item=>item.state==='applied-or-replayed'||item.state==='skipped'||item.state==='failed')
  const unresolved=operations.some(item=>item.state==='pending'||item.state==='inconsistent')||repairablePartial
  return{operations,hasCanonicalEffect,readyForSocialCommit,deterministicNoEffectFailure,repairablePartial,unresolved}
 }
}
