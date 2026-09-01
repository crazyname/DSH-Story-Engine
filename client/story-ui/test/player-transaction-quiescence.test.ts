import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

describe('player transaction quiescence guard',()=>{
 it('blocks fork/delete style operations while a durable transaction is open',async()=>{
  const projection={...createInitialProjection(),saveId:'save-quiescence-open'}
  const record=await createPreparedTransaction({transactionId:'tx-quiescence-open',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>next)}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,{send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn()} as never)
  await expect(coordinator.assertQuiescent(projection.saveId)).rejects.toThrow('未完成 transaction')
 })

 it('allows save lifecycle operations when no durable transaction remains open',async()=>{
  const journal={listOpen:vi.fn(async()=>[]),prepare:vi.fn(),save:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,{send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn()} as never)
  await expect(coordinator.assertQuiescent('save-quiescence-clear')).resolves.toBeUndefined()
 })
})
