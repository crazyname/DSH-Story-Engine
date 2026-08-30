export const TRANSACTION_JOURNAL_SCHEMA_VERSION=1 as const
export const TRANSACTION_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
export const SAVE_ID_PATTERN=/^[A-Za-z0-9_-]{1,100}$/u
export const STORY_UI_ID_PATTERN=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u
const FINGERPRINT_PATTERN=/^[a-f0-9]{64}$/u

export type StoryTransactionStatus='prepared'|'committed'|'cancelled'|'failed'|'needs-recovery'
export type StoryHiddenTurnKind='initial'|'retry'|'continuation'
export type StoryHiddenTurnState='planned'|'dispatched'|'completed'|'failed'|'cancelled'|'uncertain'

export interface StoryTransactionInput{channelId:string;text:string}
export interface StoryHiddenTurnRef{
 /** Story Engine stable hidden-turn identity; used by social canonical commit. */
 turnId:string
 /** Client-minted DSH prompt requestId/rpcId persisted on the durable user message. */
 dshRequestId:string
 kind:StoryHiddenTurnKind
 state:StoryHiddenTurnState
 sessionId?:string
 /** Native numeric DSH turn from turn/start and turn/end, known after reconciliation. */
 dshTurn?:number
}
export interface StoryOperationRef{stepKey:string;operationId:string}
export interface StoryTransactionDiagnostic{code:string;message:string}
export interface StoryTransactionRecord{
 schemaVersion:typeof TRANSACTION_JOURNAL_SCHEMA_VERSION
 transactionId:string
 saveId:string
 input:StoryTransactionInput
 inputFingerprint:string
 baseProjectionRevision:number
 status:StoryTransactionStatus
 hiddenTurns:StoryHiddenTurnRef[]
 operationRefs:StoryOperationRef[]
 activeTurnId?:string
 canonicalResultTurnId?:string
 diagnostic?:StoryTransactionDiagnostic
 revision:number
 createdAt:string
 updatedAt:string
}

function object(value:unknown,label:string):Record<string,unknown>{if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} 必须是对象`);return value as Record<string,unknown>}
function text(value:unknown,label:string):string{if(typeof value!=='string'||value.length===0)throw new Error(`${label} 必须是非空字符串`);return value}
function timestamp(value:unknown,label:string):string{const raw=text(value,label);if(Number.isNaN(Date.parse(raw)))throw new Error(`${label} 必须是 ISO 日期时间`);return raw}
export function assertTransactionId(value:string,label='transactionId'):void{if(!TRANSACTION_ID_PATTERN.test(value))throw new Error(`${label} 无效`)}
export function assertSaveId(value:string,label='saveId'):void{if(!SAVE_ID_PATTERN.test(value))throw new Error(`${label} 无效`)}
export function assertStoryUiId(value:string,label='Story UI id'):void{if(!STORY_UI_ID_PATTERN.test(value))throw new Error(`${label} 无效`)}
function assertFingerprint(value:string):void{if(!FINGERPRINT_PATTERN.test(value))throw new Error('inputFingerprint 无效')}
function stableString(value:unknown,label:string):string{const raw=text(value,label);assertTransactionId(raw,label);return raw}
function storyUiId(value:unknown,label:string):string{const raw=text(value,label);assertStoryUiId(raw,label);return raw}

export function validateTransactionRecord(value:unknown):StoryTransactionRecord{
 const raw=object(value,'transaction')
 if(raw.schemaVersion!==TRANSACTION_JOURNAL_SCHEMA_VERSION)throw new Error('transaction.schemaVersion 必须为 1')
 const transactionId=stableString(raw.transactionId,'transactionId')
 const saveId=text(raw.saveId,'saveId');assertSaveId(saveId)
 const inputRaw=object(raw.input,'input');const channelId=storyUiId(inputRaw.channelId,'input.channelId');const inputText=text(inputRaw.text,'input.text')
 const inputFingerprint=text(raw.inputFingerprint,'inputFingerprint');assertFingerprint(inputFingerprint)
 if(!Number.isInteger(raw.baseProjectionRevision)||Number(raw.baseProjectionRevision)<0)throw new Error('baseProjectionRevision 必须是非负整数')
 const statuses=new Set<StoryTransactionStatus>(['prepared','committed','cancelled','failed','needs-recovery']);if(!statuses.has(raw.status as StoryTransactionStatus))throw new Error('transaction.status 无效')
 if(!Array.isArray(raw.hiddenTurns))throw new Error('hiddenTurns 必须是数组')
 const turnIds=new Set<string>();const requestIds=new Set<string>();const nativeTurns=new Set<string>();const hiddenTurns=raw.hiddenTurns.map((item,index)=>{const entry=object(item,`hiddenTurns[${index}]`);const turnId=stableString(entry.turnId,`hiddenTurns[${index}].turnId`);const dshRequestId=stableString(entry.dshRequestId,`hiddenTurns[${index}].dshRequestId`);if(turnIds.has(turnId))throw new Error(`hidden turnId 重复：${turnId}`);if(requestIds.has(dshRequestId))throw new Error(`hidden dshRequestId 重复：${dshRequestId}`);turnIds.add(turnId);requestIds.add(dshRequestId);if(!['initial','retry','continuation'].includes(String(entry.kind)))throw new Error(`hiddenTurns[${index}].kind 无效`);if(!['planned','dispatched','completed','failed','cancelled','uncertain'].includes(String(entry.state)))throw new Error(`hiddenTurns[${index}].state 无效`);const state=entry.state as StoryHiddenTurnState;const sessionId=entry.sessionId===undefined?undefined:stableString(entry.sessionId,`hiddenTurns[${index}].sessionId`);let dshTurn:number|undefined;if(entry.dshTurn!==undefined){if(!Number.isSafeInteger(entry.dshTurn)||Number(entry.dshTurn)<0)throw new Error(`hiddenTurns[${index}].dshTurn 必须是非负安全整数`);if(sessionId===undefined)throw new Error(`hiddenTurns[${index}].dshTurn 需要 sessionId`);if(state==='planned')throw new Error(`hiddenTurns[${index}].planned 状态不能预填 dshTurn`);dshTurn=Number(entry.dshTurn);const nativeKey=`${sessionId}:${dshTurn}`;if(nativeTurns.has(nativeKey))throw new Error(`DSH native turn 重复：${nativeKey}`);nativeTurns.add(nativeKey)}return{turnId,dshRequestId,kind:entry.kind as StoryHiddenTurnKind,state,...(sessionId===undefined?{}:{sessionId}),...(dshTurn===undefined?{}:{dshTurn})}})
 if(!Array.isArray(raw.operationRefs))throw new Error('operationRefs 必须是数组')
 const stepKeys=new Set<string>();const operationIds=new Set<string>();const operationRefs=raw.operationRefs.map((item,index)=>{const entry=object(item,`operationRefs[${index}]`);const stepKey=stableString(entry.stepKey,`operationRefs[${index}].stepKey`);const operationId=stableString(entry.operationId,`operationRefs[${index}].operationId`);if(stepKeys.has(stepKey))throw new Error(`operation stepKey 重复：${stepKey}`);if(operationIds.has(operationId))throw new Error(`operationId 重复：${operationId}`);stepKeys.add(stepKey);operationIds.add(operationId);return{stepKey,operationId}})
 const activeTurnId=raw.activeTurnId===undefined?undefined:stableString(raw.activeTurnId,'activeTurnId');if(activeTurnId!==undefined){const active=hiddenTurns.find(turn=>turn.turnId===activeTurnId);if(active===undefined)throw new Error('activeTurnId 未引用已知 hidden turn');if(['completed','failed','cancelled'].includes(active.state))throw new Error('activeTurnId 不能引用终态 hidden turn')}
 const canonicalResultTurnId=raw.canonicalResultTurnId===undefined?undefined:stableString(raw.canonicalResultTurnId,'canonicalResultTurnId');if(canonicalResultTurnId!==undefined){const canonical=hiddenTurns.find(turn=>turn.turnId===canonicalResultTurnId);if(canonical===undefined)throw new Error('canonicalResultTurnId 未引用已知 hidden turn');if(canonical.state!=='completed')throw new Error('canonicalResultTurnId 必须引用 completed hidden turn')}
 let diagnostic:StoryTransactionDiagnostic|undefined;if(raw.diagnostic!==undefined){const entry=object(raw.diagnostic,'diagnostic');diagnostic={code:text(entry.code,'diagnostic.code'),message:text(entry.message,'diagnostic.message')}}
 if(!Number.isInteger(raw.revision)||Number(raw.revision)<0)throw new Error('transaction.revision 必须是非负整数')
 const createdAt=timestamp(raw.createdAt,'createdAt');const updatedAt=timestamp(raw.updatedAt,'updatedAt')
 return{schemaVersion:1,transactionId,saveId,input:{channelId,text:inputText},inputFingerprint,baseProjectionRevision:Number(raw.baseProjectionRevision),status:raw.status as StoryTransactionStatus,hiddenTurns,operationRefs,...(activeTurnId===undefined?{}:{activeTurnId}),...(canonicalResultTurnId===undefined?{}:{canonicalResultTurnId}),...(diagnostic===undefined?{}:{diagnostic}),revision:Number(raw.revision),createdAt,updatedAt}
}

export function assertInitialTransactionRecord(record:StoryTransactionRecord):void{if(record.revision!==0)throw new Error('初始 transaction revision 必须为 0');if(record.status!=='prepared')throw new Error('初始 transaction 必须是 prepared');if(record.hiddenTurns.length!==0)throw new Error('初始 transaction 不能预填 hidden turn evidence');if(record.operationRefs.length!==0)throw new Error('初始 transaction 不能预填 operation identity evidence');if(record.activeTurnId!==undefined||record.canonicalResultTurnId!==undefined)throw new Error('初始 transaction 不能预填 turn result identity')}

const TERMINAL_TRANSACTION=new Set<StoryTransactionStatus>(['committed','cancelled','failed'])
const TRANSACTION_TRANSITIONS:Record<StoryTransactionStatus,ReadonlySet<StoryTransactionStatus>>={prepared:new Set(['prepared','committed','cancelled','failed','needs-recovery']),committed:new Set(),cancelled:new Set(),failed:new Set(),'needs-recovery':new Set(['needs-recovery','committed','failed'])}
const TERMINAL_TURN=new Set<StoryHiddenTurnState>(['completed','failed','cancelled'])
const TURN_TRANSITIONS:Record<StoryHiddenTurnState,ReadonlySet<StoryHiddenTurnState>>={planned:new Set(['planned','dispatched','failed','cancelled','uncertain']),dispatched:new Set(['dispatched','completed','failed','cancelled','uncertain']),completed:new Set(),failed:new Set(),cancelled:new Set(),uncertain:new Set(['uncertain','dispatched','completed','failed','cancelled'])}
function conflict(message:string):never{throw new Error(`transaction 幂等冲突：${message}`)}
export function assertTransactionUpdate(current:StoryTransactionRecord,next:StoryTransactionRecord):void{
 if(next.transactionId!==current.transactionId||next.saveId!==current.saveId)conflict('identity 不可修改')
 if(next.inputFingerprint!==current.inputFingerprint||next.input.channelId!==current.input.channelId||next.input.text!==current.input.text||next.baseProjectionRevision!==current.baseProjectionRevision||next.createdAt!==current.createdAt)conflict('input identity 不可修改')
 if(TERMINAL_TRANSACTION.has(current.status))conflict(`终态 ${current.status} 不可产生新 revision`)
 if(!TRANSACTION_TRANSITIONS[current.status].has(next.status))conflict(`transaction 状态不能从 ${current.status} 迁移到 ${next.status}`)
 if(next.hiddenTurns.length<current.hiddenTurns.length)conflict('hidden turn evidence 不可删除')
 for(let index=0;index<current.hiddenTurns.length;index+=1){const before=current.hiddenTurns[index]!;const after=next.hiddenTurns[index]!;if(after.turnId!==before.turnId||after.dshRequestId!==before.dshRequestId||after.kind!==before.kind)conflict('hidden turn identity 不可修改');if(before.sessionId!==undefined&&after.sessionId!==before.sessionId)conflict('hidden session identity 不可修改');if(before.dshTurn!==undefined&&after.dshTurn!==before.dshTurn)conflict('DSH native turn 不可修改');if(TERMINAL_TURN.has(before.state)){if(after.state!==before.state)conflict(`终态 hidden turn 不可改写：${before.turnId}`)}else if(!TURN_TRANSITIONS[before.state].has(after.state))conflict(`hidden turn ${before.turnId} 不能从 ${before.state} 迁移到 ${after.state}`)}
 for(let index=current.hiddenTurns.length;index<next.hiddenTurns.length;index+=1){const added=next.hiddenTurns[index]!;if(added.state!=='planned')conflict(`新增 hidden turn 必须从 planned 开始：${added.turnId}`);if(added.dshTurn!==undefined)conflict(`新增 hidden turn 不能预填 DSH native turn：${added.turnId}`)}
 if(next.operationRefs.length<current.operationRefs.length)conflict('operation identity evidence 不可删除')
 for(let index=0;index<current.operationRefs.length;index+=1){const before=current.operationRefs[index]!;const after=next.operationRefs[index]!;if(after.stepKey!==before.stepKey||after.operationId!==before.operationId)conflict('operation identity evidence 不可修改')}
 if(current.canonicalResultTurnId!==undefined&&next.canonicalResultTurnId!==current.canonicalResultTurnId)conflict('canonicalResultTurnId 不可修改')
 if(TERMINAL_TRANSACTION.has(next.status)){if(next.activeTurnId!==undefined)conflict(`终态 ${next.status} 不能保留 activeTurnId`);const pending=next.hiddenTurns.find(turn=>!TERMINAL_TURN.has(turn.state));if(pending!==undefined)conflict(`终态 ${next.status} 不能包含非终态 hidden turn：${pending.turnId}`)}
}

export async function fingerprintTransactionInput(saveId:string,channelId:string,inputText:string):Promise<string>{assertSaveId(saveId);assertStoryUiId(channelId,'input.channelId');const canonical=JSON.stringify({saveId,channelId,inputText});const bytes=new TextEncoder().encode(canonical);const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')}

export async function createPreparedTransaction(input:{transactionId?:string;saveId:string;channelId:string;text:string;baseProjectionRevision:number;now?:Date}):Promise<StoryTransactionRecord>{const transactionId=input.transactionId??`tx-${globalThis.crypto.randomUUID()}`;assertTransactionId(transactionId);assertSaveId(input.saveId);const channelId=storyUiId(input.channelId,'input.channelId');const content=input.text.trim();if(content==='')throw new Error('玩家输入不能为空');if(!Number.isInteger(input.baseProjectionRevision)||input.baseProjectionRevision<0)throw new Error('baseProjectionRevision 必须是非负整数');const now=(input.now??new Date()).toISOString();return{schemaVersion:1,transactionId,saveId:input.saveId,input:{channelId,text:content},inputFingerprint:await fingerprintTransactionInput(input.saveId,channelId,content),baseProjectionRevision:input.baseProjectionRevision,status:'prepared',hiddenTurns:[],operationRefs:[],revision:0,createdAt:now,updatedAt:now}}

export function reviseTransaction(record:StoryTransactionRecord,patch:Partial<Omit<StoryTransactionRecord,'schemaVersion'|'transactionId'|'saveId'|'input'|'inputFingerprint'|'baseProjectionRevision'|'revision'|'createdAt'>>,now=new Date()):StoryTransactionRecord{const next=validateTransactionRecord({...record,...patch,revision:record.revision+1,updatedAt:now.toISOString()});assertTransactionUpdate(record,next);return next}
