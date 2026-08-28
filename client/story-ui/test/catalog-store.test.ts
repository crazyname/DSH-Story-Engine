import{mkdtemp,mkdir,writeFile}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,expect,it}from'vitest'
import{StoryCatalogStore}from'../src/catalog-store.ts'

describe('content pack catalog',()=>{
  it('discovers packs and only marks those with a valid UI descriptor ready',async()=>{
    const root=await mkdtemp(join(tmpdir(),'story-catalog-'))
    for(const id of ['ready-pack','raw-pack']){const dir=join(root,id);await mkdir(dir,{recursive:true});await writeFile(join(dir,'pack.json'),JSON.stringify({id,name:id,version:'1.0.0',license:'MIT'}),'utf8')}
    const ui=join(root,'ready-pack','ui');await mkdir(ui,{recursive:true});await writeFile(join(ui,'story-ui.json'),JSON.stringify({schemaVersion:1,selectedChannelId:'scene',participants:[{id:'player',realNameZh:'玩家',aliases:[],role:'player',status:'active'}],channels:[{id:'scene',kind:'scene',title:'开场',participantIds:['player'],category:'story',pinned:true,muted:false,archived:false}],messages:[],drafts:{},readCursors:{},frame:{seasonLabel:'S1',episodeLabel:'E1',sceneLabel:'开场'}}),'utf8')
    const packs=await new StoryCatalogStore(root).list()
    expect(packs.find(pack=>pack.packId==='ready-pack')?.status).toBe('ready')
    expect(packs.find(pack=>pack.packId==='raw-pack')).toMatchObject({status:'diagnostic',agentPreset:'story-raw-pack'})
  })
  it('keeps an invalid descriptor diagnostic and reports its actual problem',async()=>{
    const root=await mkdtemp(join(tmpdir(),'story-catalog-invalid-'));const dir=join(root,'invalid-pack');await mkdir(join(dir,'ui'),{recursive:true});await writeFile(join(dir,'pack.json'),JSON.stringify({id:'invalid-pack',name:'invalid',version:'1.0.0',license:'MIT'}),'utf8')
    await writeFile(join(dir,'ui','story-ui.json'),JSON.stringify({schemaVersion:1,selectedChannelId:'missing',participants:[{id:'player'}],channels:[],messages:[],frame:{}}),'utf8')
    const pack=(await new StoryCatalogStore(root).list()).at(0)
    expect(pack).toMatchObject({status:'diagnostic'})
    expect(pack?.diagnostic).toContain('participants[0].realNameZh')
  })
})
