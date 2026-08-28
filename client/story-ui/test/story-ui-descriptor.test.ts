import{describe,expect,it}from'vitest'
import{validateStoryUiDescriptor}from'../src/story-ui-descriptor.ts'

const descriptor={schemaVersion:1,selectedChannelId:'scene-1',participants:[
  {id:'player',heroNameZh:'英雄名',realNameZh:'本名',aliases:[],role:'player',status:'active'},
  {id:'narrator',realNameZh:'旁白',aliases:[],role:'narrator',status:'active'},
],channels:[{id:'scene-1',kind:'scene',title:'现场',participantIds:['player','narrator'],category:'story',pinned:true,muted:false,archived:false,lastMessageId:'msg-1',lastActivityAt:'2026-08-28T00:00:00.000Z'}],messages:[{id:'msg-1',channelId:'scene-1',senderId:'narrator',kind:'narration',content:'开始',createdAt:'2026-08-28T00:00:00.000Z',seasonId:'S1',episodeId:'E1',sceneId:'opening',turnId:'turn-1',canonStatus:'committed'}],drafts:{'scene-1':''},readCursors:{'scene-1':'msg-1'},frame:{seasonLabel:'S1',episodeLabel:'E1',sceneLabel:'开场'}}

describe('story UI descriptor validation',()=>{
  it('accepts a descriptor that satisfies the published schema contract',()=>{expect(validateStoryUiDescriptor(descriptor)).toEqual(descriptor)})
  it('rejects cross-reference errors that JSON Schema cannot express',()=>{
    const invalid=structuredClone(descriptor);invalid.messages[0]!.senderId='missing'
    expect(()=>validateStoryUiDescriptor(invalid)).toThrow('消息引用无效')
  })
  it('does not permit an NPC to speak in a channel they do not belong to',()=>{
    const invalid=structuredClone(descriptor);invalid.participants.push({id:'npc',realNameZh:'路人',aliases:[],role:'npc',status:'active'});invalid.messages[0]!.senderId='npc'
    expect(()=>validateStoryUiDescriptor(invalid)).toThrow('消息发送者不属于频道')
  })
  it('rejects schema omissions rather than treating them as ready',()=>{
    const invalid=structuredClone(descriptor)as Record<string,unknown>;delete invalid.drafts
    expect(()=>validateStoryUiDescriptor(invalid)).toThrow('drafts')
  })
})
