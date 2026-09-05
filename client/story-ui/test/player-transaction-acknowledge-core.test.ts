import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'

describe('player transaction acknowledge core barrier',()=>{
 it('refuses final acknowledge when Core evidence is still unresolved',async()=>{
  const prepared=await createPreparedTransaction({transactionId:'tx-ack-core',saveId:'save-ack-core',channelId:'scene-main',text:'继续',baseProjectionRevision:0,now:new Date('2026-09-03T00:00:00.000Z')})
  const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-core'})
  const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'dispatched',sessionId:'session-core'}],activeTurnId:'turn-core'})
  const linked=reviseTransaction(dispatched,{operationRefs:[{stepKey:'step-op-pending',operationId:'op-pending'}]})
  let record=reviseTransaction(linked,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'completed',sessionId:'session-core'}],activeTurnId:undefined,canonicalResultTurnId:'turn-core'})
  const journal={
   listOpen:vi.fn(async()=>['committed','cancelled','failed'].includes(record.status)?[]:[record]),
   prepare:vi.fn(),
   save:vi.fn(async(next:StoryTransactionRecord)=>{if(next.revision!==record.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${record.revision}`);record=next;return next}),
  }
  const acknowledge=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge}
  const core={reconcile:vi.fn(async()=>({operations:[{ref:record.operationRefs[0]!,state:'pending',evidence:[]}],hasCanonicalEffect:false,readyForSocialCommit:false,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:true}))}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.acknowledge('save-ack-core','turn-core')).rejects.toThrow('尚不能安全提交 social projection')

  expect(acknowledge).not.toHaveBeenCalled()
  expect(record.status).toBe('needs-recovery')
  expect(record.canonicalResultTurnId).toBe('turn-core')
  expect(record.diagnostic?.code).toBe('core-reconciliation-required')
 })
})
