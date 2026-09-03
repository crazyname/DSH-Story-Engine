import type{AiTurn,StoryAiBridge}from'./ai-bridge.ts'
import type{HostTransactionJournal}from'./host-transactions.ts'

const TERMINAL_TRANSACTION=new Set(['committed','cancelled','failed'])
const TERMINAL_TURN=new Set<AiTurn['state']>(['completed','failed','cancelled'])

type JournalPort=Pick<HostTransactionJournal,'list'>
type AiPort=Pick<StoryAiBridge,'turn'|'acknowledge'>

/**
 * Clear a local terminal AI artifact only when the durable Host journal proves
 * that the same hidden turn already belongs to a terminal transaction.
 *
 * This closes the crash window between terminal journal persistence and local
 * pending-turn cleanup without treating an unjournaled/legacy terminal turn as
 * settled. Identity disagreement is corruption and therefore fails closed.
 */
export async function reconcileSettledLocalTurn(journal:JournalPort,ai:AiPort,saveId:string):Promise<boolean>{
 const local=ai.turn(saveId)
 if(local===null||!TERMINAL_TURN.has(local.state))return false
 const records=await journal.list(saveId)
 const owners=records.filter(record=>TERMINAL_TRANSACTION.has(record.status)&&record.hiddenTurns.some(turn=>turn.turnId===local.id))
 if(owners.length>1)throw new Error(`terminal hidden turn ${local.id} 同时属于多个 transaction：${owners.map(record=>record.transactionId).join(', ')}`)
 const owner=owners[0]
 if(owner===undefined)return false
 const durable=owner.hiddenTurns.find(turn=>turn.turnId===local.id)!
 if(durable.sessionId!==local.sessionId||durable.state!==local.state)throw new Error(`terminal hidden turn identity 冲突：${local.id}`)
 ai.acknowledge(saveId,local.id)
 return true
}
