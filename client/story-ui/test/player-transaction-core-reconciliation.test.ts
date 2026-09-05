import{describe,expect,it,vi}from'vitest'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{appendAiMessages,appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

function harness(){
 let records:StoryTransactionRecord[]=[]
 const journal={
  listOpen:vi.fn(async(saveId:string)=>records.filter(record=>record.saveId===saveId&&!['committed','cancelled','failed'].includes(record.status))),
  prepare:vi.fn(async(input:any)=>{const record=await createPreparedTransaction({...input,transactionId:'tx-core',now:new Date('2026-09-03T00:00:00.000Z')});records=[record];return record}),
  save:vi.fn(async(next:StoryTransactionRecord)=>{const index=records.findIndex(record=>record.transactionId===next.transactionId);if(index<0){records.push(next);return next}const current=records[index]!;if(next.revision!==current.revision+1)throw new Error(`stale journal revision ${next.revision}; current ${current.revision}`);records[index]=next;return next}),
 }
 return{journal,get record(){return records.at(-1)!},set record(value:StoryTransactionRecord){records=[value]}}
}

function submitted(){const base={...createInitialProjection(),saveId:'save-core'};return appendPlayerMessage(base,base.selectedChannelId,'继续')}
const aiResult={raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'核心状态已同步。'}]}
function operation(operationId:string,state:'applied-or-replayed'|'skipped'|'failed'|'pending'|'inconsistent'){return{ref:{stepKey:`step-${operationId}`,operationId},state,evidence:[]}}
function summary(states:Array<ReturnType<typeof operation>>){const hasCanonicalEffect=states.some(item=>item.state==='applied-or-replayed');const readyForSocialCommit=states.every(item=>item.state==='applied-or-replayed'||item.state==='skipped');const deterministicNoEffectFailure=!hasCanonicalEffect&&states.some(item=>item.state==='failed')&&states.every(item=>item.state==='failed'||item.state==='skipped');const unresolved=states.some(item=>item.state==='pending'||item.state==='inconsistent');const repairablePartial=hasCanonicalEffect&&states.some(item=>item.state==='failed')&&!unresolved&&states.every(item=>item.state==='applied-or-replayed'||item.state==='skipped'||item.state==='failed');return{operations:states,hasCanonicalEffect,readyForSocialCommit,deterministicNoEffectFailure,repairablePartial,unresolved}}

async function recordWithHidden(input:{state:'dispatched'|'completed';operationIds?:string[];canonical?:boolean;status?:'prepared'|'needs-recovery'}){
 const save=submitted()
 const prepared=await createPreparedTransaction({transactionId:'tx-core',saveId:save.saveId,channelId:save.selectedChannelId,text:'继续',baseProjectionRevision:0,now:new Date('2026-09-03T00:00:00.000Z')})
 const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'planned',sessionId:'session-core'}],activeTurnId:'turn-core'})
 const dispatched=reviseTransaction(planned,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'dispatched',sessionId:'session-core'}],activeTurnId:'turn-core'})
 let current=input.operationIds?.length?reviseTransaction(dispatched,{operationRefs:input.operationIds.map(operationId=>({stepKey:`step-${operationId}`,operationId}))}):dispatched
 if(input.state==='completed')current=reviseTransaction(current,{hiddenTurns:[{turnId:'turn-core',kind:'initial',state:'completed',sessionId:'session-core'}],activeTurnId:undefined})
 if(input.canonical)current=reviseTransaction(current,{canonicalResultTurnId:'turn-core'})
 if(input.status==='needs-recovery')current=reviseTransaction(current,{status:'needs-recovery',diagnostic:{code:'test-recovery',message:'test'}})
 return current
}

describe('player transaction core reconciliation',()=>{
 it('refreshes Host preflight operationRefs before completing the hidden turn and before returning social output',async()=>{
  const state=harness();const save=submitted();const core=vi.fn(async(record:StoryTransactionRecord)=>{expect(record.operationRefs.map(item=>item.operationId)).toEqual(['op-a']);expect(record.hiddenTurns[0]?.state).toBe('completed');return summary([operation('op-a','applied-or-replayed')])})
  const ai={
   send:vi.fn(async(_projection:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:0,dshRequestId:'rpc-core'};await hooks.beforeDispatch({...evidence,dshRequestId:undefined});await hooks.afterAccepted(evidence);state.record=await state.journal.save(reviseTransaction(state.record,{operationRefs:[{stepKey:'step-op-a',operationId:'op-a'}]}));return{...aiResult,turnId:evidence.turnId,dshTurn:1}}),
   recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge:vi.fn(),
  }
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,{reconcile:core} as never)
  const result=await coordinator.send(save,save.selectedChannelId,'继续')
  expect(result.messages[0]?.content).toBe('核心状态已同步。')
  expect(state.record.operationRefs.map(item=>item.operationId)).toEqual(['op-a'])
  expect(state.record.hiddenTurns[0]).toMatchObject({state:'completed',dshTurn:1})
  expect(state.record.canonicalResultTurnId).toBe(result.turnId)
  expect(core).toHaveBeenCalledTimes(1)
 })

 it('terminal-fails a completed hidden result when all core attempts explicitly failed with no canonical effect',async()=>{
  const state=harness();const save=submitted();const acknowledge=vi.fn()
  const core={reconcile:vi.fn(async()=>summary([operation('op-fail','failed')]))}
  const ai={send:vi.fn(async(_projection:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:0};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);state.record=await state.journal.save(reviseTransaction(state.record,{operationRefs:[{stepKey:'step-op-fail',operationId:'op-fail'}]}));return{...aiResult,turnId:evidence.turnId}}),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)
  await expect(coordinator.send(save,save.selectedChannelId,'继续')).rejects.toThrow('Core mutation 明确失败')
  expect(state.record.status).toBe('failed')
  expect(state.record.canonicalResultTurnId).toBeUndefined()
  expect(acknowledge).toHaveBeenCalledTimes(1)
 })

 it('stops on partial commit, then uses one recovery-driven continuation and never replays the player input',async()=>{
  const state=harness();const save=submitted();let reconciliations=0
  const partial=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','failed')])
  const ready=summary([operation('op-applied','applied-or-replayed'),operation('op-failed','applied-or-replayed')])
  const core={reconcile:vi.fn(async()=>{reconciliations+=1;return reconciliations<=2?partial:ready})}
  const send=vi.fn(async(_projection:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:0};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);state.record=await state.journal.save(reviseTransaction(state.record,{operationRefs:[{stepKey:'step-op-applied',operationId:'op-applied'},{stepKey:'step-op-failed',operationId:'op-failed'}]}));return{...aiResult,turnId:evidence.turnId}})
  const continuation=vi.fn(async(_projection:any,_channel:string,instruction:string,hooks:any)=>{expect(instruction).toContain('op-applied');expect(instruction).toContain('op-failed');expect(instruction).not.toContain('继续');const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:10};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);return{...aiResult,turnId:evidence.turnId,dshTurn:2}})
  const acknowledge=vi.fn()
  const ai={send,recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:continuation,cancel:vi.fn(),turn:vi.fn(()=>({state:'completed'})),acknowledge}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)
  await expect(coordinator.send(save,save.selectedChannelId,'继续')).rejects.toThrow('尚不能安全提交 social projection')
  expect(state.record).toMatchObject({status:'needs-recovery',diagnostic:{code:'core-partial-commit-repairable'}})
  expect(state.record.canonicalResultTurnId).toBeUndefined()

  const recovered=await coordinator.recover(save)
  expect(recovered?.turnId).toBe(state.record.canonicalResultTurnId)
  expect(continuation).toHaveBeenCalledTimes(1)
  expect(send).toHaveBeenCalledTimes(1)
  expect(state.record.hiddenTurns.map(turn=>turn.kind)).toEqual(['initial','continuation'])
  await coordinator.acknowledge(save.saveId,recovered!.turnId)
  expect(state.record.status).toBe('committed')
  expect(acknowledge).toHaveBeenCalledWith(save.saveId,recovered!.turnId)
 })

 it('keeps pending or inconsistent core evidence in needs-recovery and never starts continuation',async()=>{
  const state=harness();const save=submitted();const pending=summary([operation('op-pending','pending')]);const continuation=vi.fn()
  const core={reconcile:vi.fn(async()=>pending)}
  const ai={send:vi.fn(async(_projection:any,_channel:string,_input:string,hooks:any)=>{const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:0};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);state.record=await state.journal.save(reviseTransaction(state.record,{operationRefs:[{stepKey:'step-op-pending',operationId:'op-pending'}]}));return{...aiResult,turnId:evidence.turnId}}),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:continuation,cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)
  await expect(coordinator.send(save,save.selectedChannelId,'继续')).rejects.toThrow('尚不能安全提交 social projection')
  expect(state.record.status).toBe('needs-recovery')
  expect(state.record.canonicalResultTurnId).toBeUndefined()
  expect(continuation).not.toHaveBeenCalled()
 })

 it('rechecks core evidence before committing a social projection that survived a crash',async()=>{
  const state=harness();const save=submitted();state.record=await recordWithHidden({state:'completed',operationIds:['op-a'],canonical:true})
  const durable=appendAiMessages(save,save.selectedChannelId,aiResult.messages,new Date('2026-09-03T00:01:00.000Z'),'turn-core')
  const core={reconcile:vi.fn(async()=>summary([operation('op-a','applied-or-replayed')]))};const acknowledge=vi.fn();const projectionSave=vi.fn()
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(()=>null),acknowledge}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:projectionSave} as never,ai as never,core as never)
  await expect(coordinator.recover(durable)).resolves.toBeNull()
  expect(core.reconcile).toHaveBeenCalledTimes(1)
  expect(projectionSave).toHaveBeenCalledWith(durable)
  expect(acknowledge).toHaveBeenCalledWith(save.saveId,'turn-core')
  expect(state.record.status).toBe('committed')
 })

 it('allows cancellation before any canonical effect is proven',async()=>{
  const state=harness();state.record=await recordWithHidden({state:'dispatched'});const core={reconcile:vi.fn(async()=>summary([]))};const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:vi.fn(),cancel:vi.fn(),turn:vi.fn(),acknowledge:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)
  await coordinator.cancel('save-core')
  expect(state.record.status).toBe('cancelled')
  expect(state.record.hiddenTurns[0]?.state).toBe('cancelled')
 })

 it('never cancels away an existing core effect and recovers it through a continuation turn',async()=>{
  const state=harness();const save=submitted();state.record=await recordWithHidden({state:'dispatched',operationIds:['op-applied']});const ready=summary([operation('op-applied','applied-or-replayed')]);const core={reconcile:vi.fn(async()=>ready)}
  const continuation=vi.fn(async(_projection:any,_channel:string,instruction:string,hooks:any)=>{expect(instruction).toContain('op-applied');const evidence={turnId:hooks.turnId,sessionId:'session-core',baseline:5};await hooks.beforeDispatch(evidence);await hooks.afterAccepted(evidence);return{...aiResult,turnId:evidence.turnId}})
  const ai={send:vi.fn(),recover:vi.fn(),recoverFromEvidence:vi.fn(),retry:vi.fn(),continueTransaction:continuation,cancel:vi.fn(),turn:vi.fn(()=>({state:'cancelled'})),acknowledge:vi.fn()}
  const coordinator=new PlayerTransactionCoordinator(state.journal as never,{save:vi.fn()} as never,ai as never,core as never)
  await coordinator.cancel(save.saveId)
  expect(state.record).toMatchObject({status:'needs-recovery',hiddenTurns:[{state:'cancelled'}],diagnostic:{code:'cancelled-after-core-effect'}})
  const recovered=await coordinator.recover(save)
  expect(recovered?.turnId).toBe(state.record.canonicalResultTurnId)
  expect(state.record.status).toBe('needs-recovery')
  expect(continuation).toHaveBeenCalledTimes(1)
 })
})
