import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

describe('player transaction active hidden turn guard',()=>{
 it('does not start a continuation when Host journal already has another nonterminal hidden turn',async()=>{
  const save=appendPlayerMessage({...createInitialProjection(),saveId:'save-active-guard'},'scene-main','继续')
  const prepared=await createPreparedTransaction({transactionId:'tx-active-guard',saveId:save.saveId,channelId:save.selectedChannelId,text:'继续',baseProjectionRevision:0,now:new Date('2026-09-03T00:00:00.000Z')})
  const oldPlanned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-old',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-old'})
  const oldCancelled=reviseTransaction(oldPlanned,{hiddenTurns:[{turnId:'turn-old',kind:'initial',state:'cancelled',sessionId:'session-core'}],activeTurnId:undefined,status:'needs-recovery',diagnostic:{code:'cancelled-after-core-effect',message:'effect exists'}})
  let record=reviseTransaction(oldCancelled,{hiddenTurns:[...oldCancelled.hiddenTurns,{turnId:'turn-newer',kind:'continuation',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-newer'})
  const journal={
   listOpen:vi.fn(async()=>[record]),
   prepare:vi.fn(),
   save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next}),
  }
  const continueTransaction=vi.fn(async(_projection:any,_channel:string,_instruction:string,hooks:any)=>{await hooks.beforeDispatch({turnId:hooks.turnId,sessionId:'session-core',baseline:10});return{raw:'{}',messages:[],turnId:hooks.turnId}})
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction,cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>({id:'turn-old',sessionId:'session-core',baseline:0,channelId:save.selectedChannelId,prompt:'',state:'cancelled'}))}
  const core={reconcile:vi.fn(async()=>({operations:[{ref:{stepKey:'step-op-a',operationId:'op-a'},state:'applied-or-replayed',evidence:[]}],hasCanonicalEffect:true,readyForSocialCommit:true,deterministicNoEffectFailure:false,repairablePartial:false,unresolved:false}))}
  record=reviseTransaction(record,{operationRefs:[{stepKey:'step-op-a',operationId:'op-a'}]})
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never,core as never)

  await expect(coordinator.retry(save)).rejects.toThrow('其它非终态 hidden turn')

  expect(continueTransaction).not.toHaveBeenCalled()
  expect(record.activeTurnId).toBe('turn-newer')
  expect(record.hiddenTurns.filter(turn=>!['completed','failed','cancelled'].includes(turn.state)).map(turn=>turn.turnId)).toEqual(['turn-newer'])
 })
})
