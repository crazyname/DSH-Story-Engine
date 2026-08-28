export type ParticipantRole='player'|'npc'|'narrator'|'system'
export type ParticipantStatus='active'|'missing'|'injured'|'dead'|'retired'
export type ChannelKind='direct'|'group'|'scene'|'work'|'system'
export type MessageKind='dialogue'|'narration'|'action'|'system'|'choice'|'work-dispatch'|'relationship'|'episode-summary'
export interface StoryParticipant{id:string;heroNameZh?:string;realNameZh:string;aliases:string[];role:ParticipantRole;status:ParticipantStatus}
export interface StoryChannel{id:string;kind:ChannelKind;title:string;participantIds:string[];category:'personal'|'work'|'story'|'system';pinned:boolean;muted:boolean;archived:boolean;lastMessageId?:string;lastActivityAt?:string}
export interface StoryMessage{id:string;channelId:string;senderId:string;kind:MessageKind;content:string;createdAt:string;seasonId:string;episodeId:string;sceneId?:string;turnId:string;choiceId?:string;canonStatus:'proposed'|'committed'|'retracted'}
export interface StorySaveProjection{schemaVersion:1;saveId:string;packId:string;packTitle:string;agentPreset?:string;selectedChannelId:string;participants:StoryParticipant[];channels:StoryChannel[];messages:StoryMessage[];drafts:Record<string,string>;readCursors:Record<string,string>;frame:{seasonLabel:string;episodeLabel:string;sceneLabel:string};revision:number;updatedAt:string}

export function validateProjection(value:unknown):StorySaveProjection{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('存档必须是对象');const p=value as StorySaveProjection
 if(p.schemaVersion!==1||typeof p.saveId!=='string'||!Array.isArray(p.participants)||!Array.isArray(p.channels)||!Array.isArray(p.messages)||typeof p.revision!=='number')throw new Error('存档结构无效')
 const participants=new Set(p.participants.map(x=>x.id));const channels=new Set(p.channels.map(x=>x.id));const messages=new Set<string>()
 if(participants.size!==p.participants.length||channels.size!==p.channels.length)throw new Error('人物或频道 ID 重复')
 for(const c of p.channels){if(c.participantIds.some(id=>!participants.has(id)))throw new Error(`频道成员不存在：${c.id}`)}
 for(const m of p.messages){if(messages.has(m.id))throw new Error(`消息 ID 重复：${m.id}`);messages.add(m.id);if(!channels.has(m.channelId)||!participants.has(m.senderId))throw new Error(`消息引用无效：${m.id}`)}
 if(!channels.has(p.selectedChannelId))throw new Error('当前频道不存在');return structuredClone(p)
}
export function appendPlayerMessage(projection:StorySaveProjection,channelId:string,text:string,now=new Date()):StorySaveProjection{
 const content=text.trim();if(!content)throw new Error('消息不能为空');const channel=projection.channels.find(c=>c.id===channelId);if(!channel)throw new Error('频道不存在')
 const player=projection.participants.find(p=>p.role==='player');if(!player||!channel.participantIds.includes(player.id))throw new Error('玩家不属于当前频道')
 const kind:MessageKind=content.startsWith('(系统)')?'system':content.startsWith('(行动)')?'action':'dialogue';const createdAt=now.toISOString();const id=`msg-${now.getTime()}-${projection.messages.length+1}`
 const message:StoryMessage={id,channelId,senderId:kind==='system'?(projection.participants.find(p=>p.role==='system')?.id??player.id):player.id,kind,content:content.replace(/^\((系统|行动)\)\s*/u,''),createdAt,seasonId:projection.frame.seasonLabel,episodeId:projection.frame.episodeLabel,sceneId:projection.frame.sceneLabel,turnId:`turn-${projection.revision+1}`,canonStatus:kind==='system'?'proposed':'committed'}
 return{...projection,messages:[...projection.messages,message],channels:projection.channels.map(c=>c.id===channelId?{...c,lastMessageId:id,lastActivityAt:createdAt}:c),drafts:{...projection.drafts,[channelId]:''},revision:projection.revision+1,updatedAt:createdAt}
}
export function updateDraft(projection:StorySaveProjection,channelId:string,text:string):StorySaveProjection{return{...projection,drafts:{...projection.drafts,[channelId]:text},revision:projection.revision+1,updatedAt:new Date().toISOString()}}
export interface AiMessageInput{senderId:string;kind:Exclude<MessageKind,'choice'>;content:string}
export function appendAiMessages(projection:StorySaveProjection,channelId:string,inputs:readonly AiMessageInput[],now=new Date()):StorySaveProjection{
 const channel=projection.channels.find(c=>c.id===channelId);if(!channel)throw new Error('频道不存在');const player=projection.participants.find(p=>p.role==='player');if(inputs.length===0)throw new Error('AI 消息不能为空')
 const allowed=new Set([...channel.participantIds,...projection.participants.filter(p=>p.role==='narrator'||p.role==='system').map(p=>p.id)]);const createdAt=now.toISOString();const messages=inputs.map((input,index)=>{if(input.senderId===player?.id)throw new Error('AI 不能替玩家发送消息');if(!allowed.has(input.senderId))throw new Error(`发送者不属于频道：${input.senderId}`);if(!input.content.trim())throw new Error('AI 消息内容不能为空');return{id:`ai-${now.getTime()}-${projection.messages.length+index+1}`,channelId,senderId:input.senderId,kind:input.kind,content:input.content.trim(),createdAt,seasonId:projection.frame.seasonLabel,episodeId:projection.frame.episodeLabel,sceneId:projection.frame.sceneLabel,turnId:`turn-${projection.revision+1}`,canonStatus:'committed' as const}})
 const last=messages.at(-1)!;return{...projection,messages:[...projection.messages,...messages],channels:projection.channels.map(c=>c.id===channelId?{...c,lastMessageId:last.id,lastActivityAt:createdAt}:c),revision:projection.revision+1,updatedAt:createdAt}
}
/** Record a player's answer to a story choice as a committed choice message. */
export function appendChoiceRecord(projection:StorySaveProjection,channelId:string,questionId:string,selected:string[],custom:string|undefined,now=new Date()):StorySaveProjection{
 const channel=projection.channels.find(c=>c.id===channelId);if(!channel)throw new Error('频道不存在');const player=projection.participants.find(p=>p.role==='player');if(!player||!channel.participantIds.includes(player.id))throw new Error('玩家不属于当前频道')
 const parts=[...(selected.length?selected:[custom?.trim()??''])].filter(Boolean);const content=parts.join('／');if(!content)throw new Error('选择不能为空')
 const createdAt=now.toISOString();const id=`choice-${now.getTime()}-${projection.messages.length+1}`
 const message:StoryMessage={id,channelId,senderId:player.id,kind:'choice',content,createdAt,seasonId:projection.frame.seasonLabel,episodeId:projection.frame.episodeLabel,sceneId:projection.frame.sceneLabel,turnId:`turn-${projection.revision+1}`,choiceId:questionId,canonStatus:'committed'}
 return{...projection,messages:[...projection.messages,message],channels:projection.channels.map(c=>c.id===channelId?{...c,lastMessageId:id,lastActivityAt:createdAt}:c),revision:projection.revision+1,updatedAt:createdAt}
}
