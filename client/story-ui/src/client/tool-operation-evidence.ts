export interface StoryToolCallEvidence{
 operationId:string
 transactionId:string
 toolName:string
 argumentsCanonical:string
 callId:string
 callSeq:number
 resultSeq?:number
 isError?:boolean
 result?:unknown
}

type HistoryEntry={event:any}

function seq(event:any):number|undefined{const value=Number(event?.seq);return Number.isSafeInteger(value)&&value>=0?value:undefined}
function args(value:unknown):Record<string,unknown>|undefined{
 if(typeof value!=='string')return undefined
 try{const parsed=JSON.parse(value)as unknown;return parsed!==null&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed as Record<string,unknown>:undefined}catch{return undefined}
}
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical)
 if(value!==null&&typeof value==='object')return Object.fromEntries(Object.keys(value as Record<string,unknown>).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])]))
 return value
}
function canonicalArgs(value:Record<string,unknown>):string{const{expected_version:_expectedVersion,...semantic}=value;return JSON.stringify(canonical(semantic))}
function resultBlock(event:any):any|undefined{
 const blocks=event?.data?.message?.content
 if(!Array.isArray(blocks))return undefined
 return blocks.find((block:any)=>block?.type==='tool-result')
}
function resultCallId(event:any,block:any):string|undefined{
 const source=event?.data?.message?.source
 const sourceId=source?.kind==='tool'&&typeof source.callId==='string'?source.callId:undefined
 const blockId=block?.type==='tool-result'&&typeof block.toolCallId==='string'?block.toolCallId:undefined
 if(sourceId!==undefined&&blockId!==undefined&&sourceId!==blockId)throw new Error(`DSH tool result callId 冲突：${sourceId} != ${blockId}`)
 return sourceId??blockId
}
function parseCanonicalResult(block:any):unknown{
 const content=block?.content
 if(!Array.isArray(content))return undefined
 const text=content.filter((item:any)=>item?.type==='text'&&typeof item.text==='string').map((item:any)=>item.text).join('\n').trim()
 if(text==='')return undefined
 try{return JSON.parse(text)as unknown}catch{return text}
}

/** Pair rc.2 durable tool/call and tool/result events for transaction-owned operation ids. */
export function collectToolOperationEvidence(entries:HistoryEntry[],transactionId:string,operationIds:ReadonlySet<string>):StoryToolCallEvidence[]{
 const calls=new Map<string,StoryToolCallEvidence>()
 const ordered=entries.map(entry=>entry.event).filter(event=>seq(event)!==undefined).sort((left,right)=>Number(left.seq)-Number(right.seq))
 for(const event of ordered){
  if(event?.type!=='tool/call')continue
  const callId=event?.data?.callId,name=event?.data?.name,parsed=args(event?.data?.arguments),callSeq=seq(event)
  if(typeof callId!=='string'||typeof name!=='string'||callSeq===undefined||parsed===undefined)continue
  const operationId=parsed.operation_id,claimedTransaction=parsed.transaction_id
  if(typeof operationId!=='string'||!operationIds.has(operationId)||claimedTransaction!==transactionId)continue
  const existing=calls.get(callId)
  const next:StoryToolCallEvidence={operationId,transactionId,toolName:name,argumentsCanonical:canonicalArgs(parsed),callId,callSeq}
  if(existing!==undefined&&(existing.operationId!==next.operationId||existing.transactionId!==next.transactionId||existing.toolName!==next.toolName||existing.argumentsCanonical!==next.argumentsCanonical||existing.callSeq!==next.callSeq))throw new Error(`DSH tool call identity 冲突：${callId}`)
  calls.set(callId,existing??next)
 }
 for(const event of ordered){
  if(event?.type!=='tool/result')continue
  const block=resultBlock(event),resultSeq=seq(event)
  const callId=resultCallId(event,block)
  if(callId===undefined||resultSeq===undefined)continue
  const call=calls.get(callId)
  if(call===undefined)continue
  if(block===undefined||typeof block.isError!=='boolean')throw new Error(`DSH tool result 结构无效：${callId}`)
  if(call.resultSeq!==undefined){if(call.resultSeq!==resultSeq||call.isError!==block.isError)throw new Error(`DSH tool result identity 冲突：${callId}`);continue}
  call.resultSeq=resultSeq
  call.isError=block.isError
  call.result=parseCanonicalResult(block)
 }
 return[...calls.values()].sort((left,right)=>left.callSeq-right.callSeq)
}

export function isKnownSkippedStoryResult(evidence:StoryToolCallEvidence):boolean{
 if(evidence.isError!==false||evidence.toolName!=='story_record_work_event')return false
 const value=evidence.result
 return value!==null&&typeof value==='object'&&!Array.isArray(value)&&(value as Record<string,unknown>).escalated===true&&(value as Record<string,unknown>).recorded===false
}
