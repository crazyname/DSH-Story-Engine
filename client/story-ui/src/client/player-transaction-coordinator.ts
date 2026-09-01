import{reviseTransaction,type StoryHiddenTurnKind,type StoryHiddenTurnRef,type StoryTransactionRecord}from'../transaction-journal.ts'
import type{HostTransactionJournal}from'./host-transactions.ts'
import type{HostProjectionStorage}from'./host-persistence.ts'
import type{AiBridgeResult,AiDispatchEvidence,AiDispatchHooks,RecoveredAiBridgeResult,StoryAiBridge}from'./ai-bridge.ts'
import type{StorySaveProjection}from'./story-domain.ts'

type JournalPort=Pick<HostTransactionJournal,'listOpen'|'prepare'|'save'>
type ProjectionPort=Pick<HostProjectionStorage,'save'>
type AiPort=Pick<StoryAiBridge,'send'|'recover'|'retry'|'cancel'|'acknowledge'|'turn'>

type MutableTransaction={record:StoryTransactionRecord}
function detail(error:unknown):string{return error instanceof Error?error.message:String(error)}
function hiddenTerminal(state:StoryHiddenTurnRef['state']):boolean{return state==='completed'||state==='failed'||state==='cancelled'}

/**
 * Browser coordinator for the social-only part of a player transaction.
 * DSH rc.2 persists its carrier rpcId into durable message source metadata,
 * but its public client mints that id internally and only echoes it after the
 * response. Ambiguous dispatch therefore still degrades to recovery instead
 * of pretending the caller had a pre-dispatch exactly-once identity.
 */
export class PlayerTransactionCoordinator{
 constructor(private readonly journal:JournalPort,private readonly projections:ProjectionPort,private readonly ai:AiPort){}

 private async open(saveId:string):Promise<StoryTransactionRecord|undefined>{const records=await this.journal.listOpen(saveId);if(records.length>1)throw new Error(`存档存在多个未完成 transaction，必须先恢复：${records.map(record=>record.transactionId).join(', ')}`);return records[0]}
 private findHidden(record:StoryTransactionRecord,turnId:string):{index:number;turn:StoryHiddenTurnRef}{const index=record.hiddenTurns.findIndex(turn=>turn.turnId===turnId);if(index<0)throw new Error(`transaction 未记录 hidden turn：${turnId}`);return{index,turn:record.hiddenTurns[index]!}}
 private replaceHidden(record:StoryTransactionRecord,index:number,turn:StoryHiddenTurnRef):StoryHiddenTurnRef[]{return record.hiddenTurns.map((entry,current)=>current===index?turn:entry)}
 private async save(state:MutableTransaction,patch:Parameters<typeof reviseTransaction>[1]):Promise<void>{state.record=await this.journal.save(reviseTransaction(state.record,patch))}
 private persistedCanonical(record:StoryTransactionRecord,projection:StorySaveProjection):string|undefined{const turnId=record.canonicalResultTurnId;if(turnId===undefined)return undefined;const{turn}=this.findHidden(record,turnId);if(turn.state!=='completed')throw new Error(`canonical hidden turn 尚未完成：${turnId}`);return projection.messages.some(message=>message.turnId===turnId&&message.canonStatus==='committed')?turnId:undefined}

 private async failBeforeDispatch(state:MutableTransaction,error:unknown):Promise<void>{if(state.record.status!=='prepared'||state.record.hiddenTurns.length!==0)return;try{await this.save(state,{status:'failed',diagnostic:{code:'pre-dispatch-failed',message:detail(error)}})}catch{/* Preserve the original failure; the durable prepared intent remains safe to inspect. */}}

 private async needsRecovery(state:MutableTransaction,turnId:string,error:unknown,code='hidden-dispatch-uncertain'):Promise<void>{if(state.record.status==='committed'||state.record.status==='cancelled'||state.record.status==='failed')return;let hiddenTurns=state.record.hiddenTurns;const found=hiddenTurns.findIndex(turn=>turn.turnId===turnId);if(found>=0){const current=hiddenTurns[found]!;if(current.state==='planned')hiddenTurns=this.replaceHidden(state.record,found,{...current,state:'uncertain'})}try{await this.save(state,{status:'needs-recovery',hiddenTurns,diagnostic:{code,message:detail(error)}})}catch{/* Do not hide the dispatch failure with a secondary journal failure. */}}

 private hooks(state:MutableTransaction,turnId:string,kind:StoryHiddenTurnKind):AiDispatchHooks{return{
  turnId,
  beforeDispatch:async(evidence:AiDispatchEvidence)=>{const hidden:StoryHiddenTurnRef={turnId:evidence.turnId,kind,state:'planned',sessionId:evidence.sessionId};await this.save(state,{hiddenTurns:[...state.record.hiddenTurns,hidden],activeTurnId:evidence.turnId})},
  afterAccepted:async(evidence:AiDispatchEvidence)=>{const{index,turn}=this.findHidden(state.record,evidence.turnId);await this.save(state,{hiddenTurns:this.replaceHidden(state.record,index,{...turn,state:'dispatched',sessionId:evidence.sessionId})})},
  afterUncertain:async(evidence:AiDispatchEvidence,error:unknown)=>{await this.needsRecovery(state,evidence.turnId,error)},
 }}

 private async complete(state:MutableTransaction,turnId:string):Promise<void>{let found=this.findHidden(state.record,turnId);if(found.turn.state==='planned'){await this.save(state,{hiddenTurns:this.replaceHidden(state.record,found.index,{...found.turn,state:'dispatched'})});found=this.findHidden(state.record,turnId)}if(found.turn.state==='completed'){if(state.record.canonicalResultTurnId!==undefined&&state.record.canonicalResultTurnId!==turnId)throw new Error(`transaction canonical result 冲突：${state.record.canonicalResultTurnId}`);return}if(found.turn.state!=='dispatched'&&found.turn.state!=='uncertain')throw new Error(`hidden turn ${turnId} 不能作为 canonical result：${found.turn.state}`);await this.save(state,{hiddenTurns:this.replaceHidden(state.record,found.index,{...found.turn,state:'completed'}),activeTurnId:undefined,canonicalResultTurnId:turnId,diagnostic:undefined})}

 private async dispatch(state:MutableTransaction,projection:StorySaveProjection,channelId:string,input:string,kind:StoryHiddenTurnKind):Promise<AiBridgeResult>{const turnId=`turn-${crypto.randomUUID()}`;try{const result=kind==='retry'?await this.ai.retry(projection,this.hooks(state,turnId,kind)):await this.ai.send(projection,channelId,input,this.hooks(state,turnId,kind));if(result.turnId!==turnId)throw new Error(`AI hidden turn identity 不匹配：expected ${turnId}, got ${result.turnId??'missing'}`);await this.complete(state,turnId);return result}catch(error){if(state.record.hiddenTurns.some(turn=>turn.turnId===turnId)){if(state.record.status!=='needs-recovery')await this.needsRecovery(state,turnId,error)}else await this.failBeforeDispatch(state,error);throw error}}

 async send(projection:StorySaveProjection,channelId:string,input:string):Promise<AiBridgeResult>{if(projection.revision<1)throw new Error('玩家提交后的 projection revision 无效');const existing=await this.open(projection.saveId);if(existing!==undefined)throw new Error(`当前存档存在未完成 transaction：${existing.transactionId}；请先恢复，不会重复发送玩家输入`);const state:MutableTransaction={record:await this.journal.prepare({saveId:projection.saveId,channelId,text:input,baseProjectionRevision:projection.revision-1})};try{await this.projections.save(projection)}catch(error){await this.failBeforeDispatch(state,error);throw error}return this.dispatch(state,projection,channelId,input,'initial')}

 async recover(projection:StorySaveProjection):Promise<RecoveredAiBridgeResult|null>{const record=await this.open(projection.saveId);if(record===undefined)return this.ai.recover(projection);const state:MutableTransaction={record};const persistedCanonical=this.persistedCanonical(record,projection);if(persistedCanonical!==undefined){this.ai.acknowledge(projection.saveId,persistedCanonical);await this.save(state,{status:'committed',activeTurnId:undefined,diagnostic:undefined});return null}if(record.hiddenTurns.length===0){if(record.status!=='prepared')throw new Error(`transaction ${record.transactionId} 缺少 hidden evidence，状态为 ${record.status}`);const result=await this.dispatch(state,projection,record.input.channelId,record.input.text,'initial');return{channelId:record.input.channelId,result,turnId:result.turnId!}}
  let recovered:RecoveredAiBridgeResult|null;try{recovered=await this.ai.recover(projection)}catch(error){const active=state.record.activeTurnId;if(active!==undefined&&!hiddenTerminal(this.findHidden(state.record,active).turn.state))await this.needsRecovery(state,active,error,'hidden-recovery-failed');throw error}if(recovered===null){const local=this.ai.turn(projection.saveId);const active=state.record.activeTurnId;if(active!==undefined&&!hiddenTerminal(this.findHidden(state.record,active).turn.state))await this.needsRecovery(state,active,new Error(local===null?'本地 pending hidden turn 缺失；rc.2 会持久化 carrier rpcId，但公开 IApiClient 在响应前不暴露该 ID，当前事务无法可靠关联，禁止盲目重发':`hidden turn 未产生可提交结果：${local.state}`),'hidden-recovery-required');return null}if(!state.record.hiddenTurns.some(turn=>turn.turnId===recovered.turnId)){await this.needsRecovery(state,state.record.activeTurnId??state.record.hiddenTurns.at(-1)!.turnId,new Error(`恢复得到未知 hidden turn：${recovered.turnId}`),'hidden-identity-mismatch');throw new Error(`恢复得到的 AI turn 不属于当前 transaction：${recovered.turnId}`)}await this.complete(state,recovered.turnId);return recovered}

 async retry(projection:StorySaveProjection):Promise<AiBridgeResult>{const existing=await this.open(projection.saveId);if(existing!==undefined)throw new Error(`transaction ${existing.transactionId} 尚未完成 reconciliation；当前版本不会创建新的 hidden retry 以避免重复 canonical effect`);return this.ai.retry(projection)}

 async cancel(saveId:string):Promise<void>{await this.ai.cancel(saveId);const record=await this.open(saveId);if(record===undefined)return;const state:MutableTransaction={record};const active=record.activeTurnId;if(active===undefined){if(record.hiddenTurns.length===0&&record.status==='prepared')await this.save(state,{status:'cancelled',diagnostic:undefined});return}const{index,turn}=this.findHidden(record,active);if(hiddenTerminal(turn.state))return;await this.save(state,{status:'needs-recovery',hiddenTurns:this.replaceHidden(state.record,index,{...turn,state:'cancelled'}),activeTurnId:undefined,diagnostic:{code:'cancelled-after-hidden-dispatch',message:'隐藏回合已取消，但 D2c 尚未核对可能已经发生的 core canonical effect'}})}

 async acknowledge(saveId:string,turnId:string):Promise<void>{const record=await this.open(saveId);if(record!==undefined){if(record.canonicalResultTurnId!==turnId)throw new Error(`open transaction ${record.transactionId} 尚未记录 canonical hidden turn ${turnId}；保留 pending turn 供恢复`);const state:MutableTransaction={record};const{turn}=this.findHidden(record,turnId);if(turn.state!=='completed')throw new Error(`canonical hidden turn 尚未完成：${turnId}`);this.ai.acknowledge(saveId,turnId);await this.save(state,{status:'committed',activeTurnId:undefined,diagnostic:undefined});return}this.ai.acknowledge(saveId,turnId)}
}
