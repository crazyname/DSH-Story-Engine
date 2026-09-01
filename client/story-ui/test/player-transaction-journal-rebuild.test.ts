import{describe,expect,it,vi}from'vitest'
import{StoryAiBridge}from'../src/client/ai-bridge.ts'
import{PlayerTransactionCoordinator}from'../src/client/player-transaction-coordinator.ts'
import{createPreparedTransaction,reviseTransaction,type StoryTransactionRecord}from'../src/transaction-journal.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'

const ok=(value:unknown)=>({result:{ok:true as const,value}})

describe('journal-backed hidden recovery rebuild',()=>{
 it('rebuilds browser pending state from durable rpc correlation evidence',async()=>{
  const projection={...createInitialProjection(),saveId:'save-journal-rebuild'}
  const values=new Map<string,string>()
  const raw='{"messages":[{"senderId":"p-hezhou","kind":"dialogue","content":"从 journal 恢复。"}]}'
  const history=vi.fn(async()=>ok({events:[
   {event:{type:'turn/start',seq:10,data:{turn:8,trigger:{kind:'message',source:{kind:'user',rpcId:'rpc-journal'}}}}},
   {event:{type:'user/message',seq:11,data:{turn:8,source:{kind:'user',rpcId:'rpc-journal'}}}},
   {event:{type:'assistant/message',seq:12,data:{turn:8,content:[{type:'text',text:raw}]}}},
   {event:{type:'turn/end',seq:13,data:{turn:8}}},
  ],hasMore:false}))
  const bridge=new StoryAiBridge({sessions:{history}} as never,{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}},async()=>{})
  const recovered=await bridge.recoverFromEvidence(projection,{turnId:'turn-journal',sessionId:'session-journal',channelId:projection.selectedChannelId,dshRequestId:'rpc-journal'})
  expect(recovered).toMatchObject({turnId:'turn-journal',result:{dshTurn:8,messages:[{content:'从 journal 恢复。'}]}})
  expect(bridge.currentSessionId(projection.saveId)).toBe('session-journal')
  expect(bridge.turn(projection.saveId)).toMatchObject({id:'turn-journal',sessionId:'session-journal',baseline:-1,state:'completed',dshRequestId:'rpc-journal',dshTurn:8})
 })

 it('lets the coordinator use Host journal evidence instead of resending after refresh',async()=>{
  const projection={...createInitialProjection(),saveId:'save-coordinator-rebuild'}
  const prepared=await createPreparedTransaction({transactionId:'tx-journal-rebuild',saveId:projection.saveId,channelId:projection.selectedChannelId,text:'继续',baseProjectionRevision:0})
  const planned=reviseTransaction(prepared,{hiddenTurns:[{turnId:'turn-journal',kind:'initial',state:'planned',sessionId:'session-journal'}],activeTurnId:'turn-journal'})
  let record=reviseTransaction(planned,{status:'needs-recovery',hiddenTurns:[{turnId:'turn-journal',kind:'initial',state:'dispatched',sessionId:'session-journal',dshRequestId:'rpc-journal'}],activeTurnId:'turn-journal',diagnostic:{code:'hidden-recovery-required',message:'browser state lost'}})
  const journal={listOpen:vi.fn(async()=>[record]),prepare:vi.fn(),save:vi.fn(async(next:StoryTransactionRecord)=>{record=next;return next})}
  const send=vi.fn()
  const recover=vi.fn()
  const recoverFromEvidence=vi.fn(async(_projection:any,evidence:any)=>({channelId:evidence.channelId,turnId:evidence.turnId,result:{raw:'{}',messages:[{senderId:'p-hezhou',kind:'dialogue' as const,content:'恢复成功。'}],dshTurn:8}}))
  const ai={send,recover,recoverFromEvidence,retry:vi.fn(),cancel:vi.fn(),acknowledge:vi.fn(),turn:vi.fn(()=>null)}
  const coordinator=new PlayerTransactionCoordinator(journal as never,{save:vi.fn()} as never,ai as never)
  const recovered=await coordinator.recover(projection)
  expect(recover).not.toHaveBeenCalled()
  expect(send).not.toHaveBeenCalled()
  expect(recoverFromEvidence).toHaveBeenCalledWith(projection,{turnId:'turn-journal',sessionId:'session-journal',channelId:projection.selectedChannelId,dshRequestId:'rpc-journal'})
  expect(recovered?.turnId).toBe('turn-journal')
  expect(record).toMatchObject({status:'needs-recovery',canonicalResultTurnId:'turn-journal',activeTurnId:undefined,diagnostic:undefined,hiddenTurns:[{turnId:'turn-journal',state:'completed',dshRequestId:'rpc-journal',dshTurn:8}]})
 })
})
