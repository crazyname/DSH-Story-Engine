import type{StorySaveProjection}from'./story-domain.ts'

type HostProjectionPort={load(saveId:string):Promise<StorySaveProjection|undefined>}

/**
 * Reconcile the projection after sendToAI rejects.
 *
 * The player projection is persisted to Host before hidden dispatch. A later
 * deterministic terminal failure can therefore clear the local AI turn while
 * the Host still durably owns the submitted player message. Never infer
 * rollback from `aiTurn === null`; re-read Host first. If Host availability is
 * itself uncertain, keep the submitted local projection rather than erasing a
 * write that may already be durable.
 */
export async function projectionAfterFailedSubmission(
 host:HostProjectionPort,
 saveId:string,
 beforeSubmit:StorySaveProjection,
 submitted:StorySaveProjection,
 hasPendingOrRecoveryTurn:boolean,
):Promise<StorySaveProjection>{
 try{
  const authoritative=await host.load(saveId)
  if(authoritative!==undefined)return authoritative
 }catch{
  return submitted
 }
 return hasPendingOrRecoveryTurn?submitted:beforeSubmit
}
