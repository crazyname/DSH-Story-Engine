import type{Rpc}from'./rpc-shape.ts'
import{unwrap}from'./rpc-shape.ts'
import{collectToolOperationEvidence,type StoryToolCallEvidence}from'./tool-operation-evidence.ts'

type StoryHistoryPage={events:Array<{event:any}>;hasMore?:boolean}
type ToolEvidenceApi={sessions:{history(payload:Record<string,unknown>):Promise<Rpc<StoryHistoryPage>>}}
export type DurableStoryToolCallEvidence=StoryToolCallEvidence&{sessionId:string}

function eventSeq(event:any):number|undefined{const value=Number(event?.seq);return Number.isSafeInteger(value)&&value>=0?value:undefined}

/** Reads rc.2 append-only session history to recover transaction-owned tool outcomes. */
export class DshToolEvidenceReader{
 constructor(private readonly api:ToolEvidenceApi){}
 async load(sessionIds:readonly string[],transactionId:string,operationIds:readonly string[]):Promise<DurableStoryToolCallEvidence[]>{
  const targets=new Set(operationIds)
  if(targets.size===0)return[]
  const all:DurableStoryToolCallEvidence[]=[]
  for(const sessionId of[...new Set(sessionIds)]){
   let page=unwrap(await this.api.sessions.history({sessionId,maxMessages:50}),'读取 Core tool evidence')
   let events=[...page.events]
   for(let pages=0;page.hasMore===true;pages+=1){
    if(pages>=127)throw new Error(`DSH tool evidence 历史回溯超过安全页数：${sessionId}`)
    const seqs=page.events.map(entry=>eventSeq(entry.event)).filter((value):value is number=>value!==undefined)
    const first=seqs.length===0?undefined:Math.min(...seqs)
    if(first===undefined)throw new Error(`DSH tool evidence 分页缺少有效 seq：${sessionId}`)
    page=unwrap(await this.api.sessions.history({sessionId,beforeSeq:first,maxMessages:50}),'读取 Core tool evidence')
    events=[...page.events,...events]
   }
   all.push(...collectToolOperationEvidence(events,transactionId,targets).map(evidence=>({...evidence,sessionId})))
  }
  return all.sort((left,right)=>left.callSeq-right.callSeq)
 }
}
