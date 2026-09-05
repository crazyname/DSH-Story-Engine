import{describe,expect,it,vi}from'vitest'
import{appendPlayerMessage}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'
import{projectionAfterFailedSubmission}from'../src/client/submission-failure-reconciliation.ts'

function fixture(){const before={...createInitialProjection(),saveId:'save-failed-submit'};const submitted=appendPlayerMessage(before,before.selectedChannelId,'继续');return{before,submitted}}

describe('failed submission projection reconciliation',()=>{
 it('keeps the Host projection when terminal Core failure already cleared the local AI turn',async()=>{
  const{before,submitted}=fixture();const host={load:vi.fn(async()=>submitted)}
  await expect(projectionAfterFailedSubmission(host,submitted.saveId,before,submitted,false)).resolves.toEqual(submitted)
 })
 it('adopts an authoritative Host rollback instead of guessing from local AI state',async()=>{
  const{before,submitted}=fixture();const host={load:vi.fn(async()=>before)}
  await expect(projectionAfterFailedSubmission(host,submitted.saveId,before,submitted,false)).resolves.toEqual(before)
 })
 it('keeps submitted local state when Host availability is uncertain',async()=>{
  const{before,submitted}=fixture();const host={load:vi.fn(async()=>{throw new Error('host unavailable')})}
  await expect(projectionAfterFailedSubmission(host,submitted.saveId,before,submitted,false)).resolves.toEqual(submitted)
 })
 it('only falls back to pre-submit state when Host definitively has no save and no recovery turn exists',async()=>{
  const{before,submitted}=fixture();const host={load:vi.fn(async()=>undefined)}
  await expect(projectionAfterFailedSubmission(host,submitted.saveId,before,submitted,false)).resolves.toEqual(before)
  await expect(projectionAfterFailedSubmission(host,submitted.saveId,before,submitted,true)).resolves.toEqual(submitted)
 })
})
