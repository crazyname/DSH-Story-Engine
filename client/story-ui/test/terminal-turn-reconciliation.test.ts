import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryHiddenTurnRef,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{reconcileSettledLocalTurn}from'../src/client/terminal-turn-reconciliation.ts'

async function terminalRecord(input:{status:'cancelled'|'failed'|'committed';turnState:'cancelled'|'failed'|'completed';sessionId?:string}):Promise<StoryTransactionRecord>{
 const prepared=await createPreparedTransaction({transactionId:`tx-${input.status}-${input.turnState}`,saveId:'save-terminal-cleanup',channelId:'scene-main',text:'继续',baseProjectionRevision:0})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-terminal',kind:'initial',state:'planned',sessionId:input.sessionId??'session-a'}],activeTurnId:'turn-terminal'})
 const terminalTurn:StoryHiddenTurnRef={turnId:'turn-terminal',kind:'initial',state:input.turnState,sessionId:input.sessionId??'session-a'}
 return reviseTransaction(planned,{status:input.status,hiddenTurns:[terminalTurn],activeTurnId:undefined})
}

function local(state:'completed'|'failed'|'cancelled',sessionId='session-a'){return{version:1 as const,id:'turn-terminal',sessionId,baseline:0,channelId:'scene-main',prompt:'old',state}}

describe('terminal local turn reconciliation',()=>{
 it('clears a matching cancelled local turn after the transaction is durably cancelled',async()=>{
  const record=await terminalRecord({status:'cancelled',turnState:'cancelled'})
  const acknowledge=vi.fn()
  const journal={list:vi.fn(async()=>[record])}
  const ai={turn:vi.fn(()=>local('cancelled')),acknowledge}
  await expect(reconcileSettledLocalTurn(journal as never,ai as never,record.saveId)).resolves.toBe(true)
  expect(acknowledge).toHaveBeenCalledWith(record.saveId,'turn-terminal')
 })

 it('clears a completed local result left behind after a terminal failed journal write',async()=>{
  const record=await terminalRecord({status:'failed',turnState:'completed'})
  const acknowledge=vi.fn()
  const journal={list:vi.fn(async()=>[record])}
  const ai={turn:vi.fn(()=>local('completed')),acknowledge}
  await expect(reconcileSettledLocalTurn(journal as never,ai as never,record.saveId)).resolves.toBe(true)
  expect(acknowledge).toHaveBeenCalledWith(record.saveId,'turn-terminal')
 })

 it('does not clear a terminal local turn while its transaction is still open for recovery',async()=>{
  const terminal=await terminalRecord({status:'failed',turnState:'failed'})
  const open={...terminal,status:'needs-recovery' as const}
  const acknowledge=vi.fn()
  const journal={list:vi.fn(async()=>[open])}
  const ai={turn:vi.fn(()=>local('failed')),acknowledge}
  await expect(reconcileSettledLocalTurn(journal as never,ai as never,open.saveId)).resolves.toBe(false)
  expect(acknowledge).not.toHaveBeenCalled()
 })

 it('fails closed when the durable terminal turn disagrees with the local session or state',async()=>{
  const record=await terminalRecord({status:'cancelled',turnState:'cancelled',sessionId:'session-a'})
  const journal={list:vi.fn(async()=>[record])}
  const ai={turn:vi.fn(()=>local('cancelled','session-other')),acknowledge:vi.fn()}
  await expect(reconcileSettledLocalTurn(journal as never,ai as never,record.saveId)).rejects.toThrow('identity 冲突')
 })

 it('leaves an unjournaled legacy terminal turn untouched',async()=>{
  const acknowledge=vi.fn()
  const journal={list:vi.fn(async()=>[])}
  const ai={turn:vi.fn(()=>local('failed')),acknowledge}
  await expect(reconcileSettledLocalTurn(journal as never,ai as never,'save-terminal-cleanup')).resolves.toBe(false)
  expect(acknowledge).not.toHaveBeenCalled()
 })
})
