import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage,type StorySaveProjection}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const aiResult={raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'恢复后收到。'}]}

describe('pre-dispatch failure recovery',()=>{
 it.each([
  ['AI session bootstrap','session bootstrap failed',false],
  ['beforeDispatch journal write','beforeDispatch journal write failed',true],
 ] as const)('keeps the Host player projection recoverable when %s fails',async(_label,errorMessage,failPlannedWrite)=>{
  const base={...createInitialProjection(),saveId:`save-pre-dispatch-${failPlannedWrite?'journal':'session'}`}
  const submitted=appendPlayerMessage(base,base.selectedChannelId,'继续')
  let record:StoryTransactionRecord|undefined
  let rejectPlanned=failPlannedWrite
  const journal={
   listOpen:vi.fn(async()=>record===undefined||['committed','cancelled','failed'].includes(record.status)?[]:[record]),
   prepare:vi.fn(async(input:any)=>{record=await createPreparedTransaction({...input,transactionId:`tx-${base.saveId}`});return record}),
   save:vi.fn(async(next:StoryTransactionRecord)=>{if(rejectPlanned&&next.hiddenTurns.at(-1)?.state==='planned'){rejectPlanned=false;throw new Error(errorMessage)}record=next;return next}),
  }
  const savedProjections:StorySaveProjection[]=[]
  const projections={save:vi.fn(async(value:StorySaveProjection)=>{savedProjections.push(value)})}
  let attempts=0
  const send=vi.fn(async(projection:StorySaveProjection,_channel:string,_input:string,hooks:any)=>{
   attempts+=1
   if(attempts===1&&!failPlannedWrite)throw new Error(errorMessage)
   const evidence={turnId:hooks.turnId,sessionId:'session-recovered',baseline:0}
   await hooks.beforeDispatch(evidence)
   await hooks.afterAccepted({...evidence,dshRequestId:'rpc-recovered'})
   return{...aiResult,turnId:evidence.turnId,dshTurn:1}
  })
  const ai={send,recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(journal as never,projections as never,ai as never)

  await expect(coordinator.send(submitted,submitted.selectedChannelId,'继续')).rejects.toThrow(errorMessage)
  expect(savedProjections).toHaveLength(1)
  expect(savedProjections[0]).toEqual(submitted)
  expect(record).toMatchObject({status:'needs-recovery',hiddenTurns:[],diagnostic:{code:'pre-hidden-dispatch-failed',message:errorMessage}})

  const recovered=await coordinator.recover(base)
  expect(recovered?.turnId).toBe(record?.canonicalResultTurnId)
  expect(send).toHaveBeenCalledTimes(2)
  expect(journal.prepare).toHaveBeenCalledTimes(1)
  expect(savedProjections).toHaveLength(2)
  expect(savedProjections[1]?.revision).toBe(1)
  expect(savedProjections[1]?.messages.at(-1)).toMatchObject({content:'继续',canonStatus:'committed'})
  expect(savedProjections[1]?.messages.filter(message=>message.content==='继续')).toHaveLength(1)
  expect(record).toMatchObject({status:'needs-recovery',hiddenTurns:[{state:'completed',dshRequestId:'rpc-recovered',dshTurn:1}]})
 })
})
