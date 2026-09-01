import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendAiMessages}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

async function completedRecord(saveId:string,channelId:string):Promise<StoryTransactionRecord>{
 const prepared=await createPreparedTransaction({transactionId:'tx-projection-recovery',saveId,channelId,text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-projection-recovery',kind:'initial',state:'planned',sessionId:'session-projection-recovery'}],activeTurnId:'turn-projection-recovery'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-projection-recovery',kind:'initial',state:'dispatched',sessionId:'session-projection-recovery',dshRequestId:'rpc-projection-recovery'}],activeTurnId:'turn-projection-recovery'})
 return reviseTransaction(dispatched,{hiddenTurns:[{turnId:'turn-projection-recovery',kind:'initial',state:'completed',sessionId:'session-projection-recovery',dshRequestId:'rpc-projection-recovery',dshTurn:7}],activeTurnId:undefined,canonicalResultTurnId:'turn-projection-recovery'})
}

describe('canonical projection recovery ordering',()=>{
 it('re-saves the projection before hidden acknowledge and journal commit',async()=>{
  const base={...createInitialProjection(),saveId:'save-projection-recovery'}
  const projection=appendAiMessages(base,base.selectedChannelId,[{senderId:'p-hezhou',kind:'dialogue',content:'已恢复。'}],new Date('2026-09-01T07:00:00.000Z'),'turn-projection-recovery')
  let record=await completedRecord(base.saveId,base.selectedChannelId)
  const events:string[]=[]
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;events.push(`journal:${next.status}`);return next})}
  const projections={save:vi.fn(async()=>{events.push('projection')})}
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge:vi.fn(()=>{events.push('ack')})}
  const coordinator=new PlayerTransactionCoordinator(journal as never,projections as never,ai as never)
  await expect(coordinator.recover(projection)).resolves.toBeNull()
  expect(events).toEqual(['projection','ack','journal:committed'])
  expect(record.status).toBe('committed')
 })

 it('keeps the transaction open and pending turn intact when the recovery projection save fails',async()=>{
  const base={...createInitialProjection(),saveId:'save-projection-recovery-failure'}
  const projection=appendAiMessages(base,base.selectedChannelId,[{senderId:'p-hezhou',kind:'dialogue',content:'仅在浏览器缓存。'}],new Date('2026-09-01T07:01:00.000Z'),'turn-projection-recovery')
  let record=await completedRecord(base.saveId,base.selectedChannelId)
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
  const projections={save:vi.fn(async()=>{throw new Error('host projection unavailable')})}
  const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge}
  const coordinator=new PlayerTransactionCoordinator(journal as never,projections as never,ai as never)
  await expect(coordinator.recover(projection)).rejects.toThrow('host projection unavailable')
  expect(acknowledge).not.toHaveBeenCalled()
  expect(journal.save).not.toHaveBeenCalled()
  expect(record.status).toBe('prepared')
  expect(record.canonicalResultTurnId).toBe('turn-projection-recovery')
 })
})
