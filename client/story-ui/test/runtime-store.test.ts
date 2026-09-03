import{mkdtemp,mkdir,readFile,writeFile}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,expect,it}from'vitest'
import{StoryRuntimeStore}from'../src/runtime-store.ts'

describe('story runtime clone store',()=>{
  it('clones state and rewrites session-scoped paths',async()=>{
    const root=await mkdtemp(join(tmpdir(),'story-runtime-'))
    const source=join(root,'pack-a','session-a')
    await mkdir(join(source,'script-revisions'),{recursive:true})
    await writeFile(join(source,'state.json'),JSON.stringify({authoredScript:{runtimeScriptRoot:join(source,'script-revisions')}}),'utf8')
    const store=new StoryRuntimeStore(root)
    expect(await store.clone('pack-a','session-a','session-b')).toBe(true)
    const cloned=JSON.parse(await readFile(join(root,'pack-a','session-b','state.json'),'utf8'))
    expect(cloned.authoredScript.runtimeScriptRoot).toBe(join(root,'pack-a','session-b','script-revisions'))
  })
  it('reports an absent source and rejects unsafe ids',async()=>{
    const store=new StoryRuntimeStore(await mkdtemp(join(tmpdir(),'story-runtime-')))
    expect(await store.clone('pack-a','missing','target')).toBe(false)
    await expect(store.clone('../bad','source','target')).rejects.toThrow('内容包 ID 无效')
  })
})

describe('story runtime receipt reader',()=>{
  it('reads one authoritative D1 receipt without mutating state',async()=>{
    const root=await mkdtemp(join(tmpdir(),'story-runtime-receipt-'))
    const directory=join(root,'pack-a','session-a')
    await mkdir(directory,{recursive:true})
    const state={_engine:{schemaVersion:3,stateVersion:7,operationReceipts:{'op-1':{operationId:'op-1',transactionId:'tx-1',operation:'story_commit_state',fingerprint:'a'.repeat(64),stateVersion:7,committedAt:'2026-09-03T00:00:00.000Z',result:{ok:true}}}}}
    await writeFile(join(directory,'state.json'),JSON.stringify(state),'utf8')
    const store=new StoryRuntimeStore(root)
    await expect(store.readReceipt('pack-a','session-a','op-1')).resolves.toEqual(state._engine.operationReceipts['op-1'])
    expect(JSON.parse(await readFile(join(directory,'state.json'),'utf8'))).toEqual(state)
  })
  it('returns absent receipts but fails closed on unsupported or corrupt runtime state',async()=>{
    const root=await mkdtemp(join(tmpdir(),'story-runtime-receipt-invalid-'))
    const directory=join(root,'pack-a','session-a')
    await mkdir(directory,{recursive:true})
    const store=new StoryRuntimeStore(root)
    await writeFile(join(directory,'state.json'),JSON.stringify({_engine:{schemaVersion:3,operationReceipts:{}}}),'utf8')
    await expect(store.readReceipt('pack-a','session-a','op-missing')).resolves.toBeUndefined()
    await writeFile(join(directory,'state.json'),JSON.stringify({_engine:{schemaVersion:4,operationReceipts:{}}}),'utf8')
    await expect(store.readReceipt('pack-a','session-a','op-missing')).rejects.toThrow('schemaVersion 不受支持')
    await writeFile(join(directory,'state.json'),JSON.stringify({_engine:{schemaVersion:3,operationReceipts:{'op-bad':{operationId:'op-bad'}}}}),'utf8')
    await expect(store.readReceipt('pack-a','session-a','op-bad')).rejects.toThrow('receipt 损坏')
  })
})
