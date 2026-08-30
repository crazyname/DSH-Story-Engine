import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SerialStateStore } from './serial-state.js'

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
})
