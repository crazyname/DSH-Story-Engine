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
