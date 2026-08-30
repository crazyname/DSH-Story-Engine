import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SerialStateStore } from './serial-state.js'
import type { WorkEvent } from './serial-types.js'

describe('Stage D operation checkpoints',()=>{
  it('refreshes a deterministic checkpoint while its operation has no receipt',async()=>{
    const root=await mkdtemp(join(tmpdir(),'dsh-op-checkpoint-refresh-'))
    const store=new SerialStateStore(root,'pack',{})
    const first=await store.checkpoint('s','before_opening','enter-opening-retry')
    await store.commit('s',0,{flags:{intervening:true}},'intervening',{operationId:'intervening-write'})
    const second=await store.checkpoint('s','before_opening','enter-opening-retry')
    expect(second.id).toBe(first.id)
    const snapshot=JSON.parse(await readFile(second.path,'utf8')) as {flags?:Record<string,unknown>;_engine:{stateVersion:number}}
    expect(snapshot._engine.stateVersion).toBe(1)
    expect(snapshot.flags).toEqual({intervening:true})
  })

  it('rejects a checkpoint that contains operation evidence missing from current state',async()=>{
    const root=await mkdtemp(join(tmpdir(),'dsh-op-checkpoint-unknown-receipt-'))
    const store=new SerialStateStore(root,'pack',{})
    await store.commit('s',0,{flags:{committed:true}},'committed',{operationId:'committed-before-checkpoint'})
    const checkpoint=await store.checkpoint('s','with-receipt')
    const statePath=join(root,'pack','s','state.json')
    const current=JSON.parse(await readFile(statePath,'utf8')) as any
    current._engine.operationReceipts={}
    await writeFile(statePath,JSON.stringify(current),'utf8')
    await expect(store.restoreCheckpoint('s',checkpoint.id)).rejects.toThrow('当前状态未知的 operation receipt')
  })
})

describe('Stage D operation receipt persistence',()=>{
  it('returns the same JSON-persisted result shape on first commit and replay after restart',async()=>{
    const root=await mkdtemp(join(tmpdir(),'dsh-op-receipt-json-'))
    const work:WorkEvent={id:undefined,name:'巡检',assignedActors:['A'],result:'success',stateEffects:[]}
    const identity={operationId:'work-json-result'}
    const firstStore=new SerialStateStore(root,'pack',{})
    const first=await firstStore.recordWorkEvent('s',0,work,identity)
    expect(first.receipt.result).toEqual({event:{name:'巡检',assignedActors:['A'],result:'success',stateEffects:[]}})
    const secondStore=new SerialStateStore(root,'pack',{})
    const replay=await secondStore.recordWorkEvent('s',0,work,identity)
    expect(replay.replayed).toBe(true)
    expect(replay.receipt).toEqual(first.receipt)
  })
})
