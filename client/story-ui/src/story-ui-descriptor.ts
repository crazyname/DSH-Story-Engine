/**
 * Validation for ui/story-ui.json.
 *
 * The checks deliberately mirror schemas/story-ui.schema.json and add the
 * cross-reference checks that JSON Schema cannot express.  A catalog entry is
 * never "ready" merely because a few top-level arrays happen to exist.
 */
export type JsonObject=Record<string,unknown>

const idPattern=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/u
const roles=new Set(['player','npc','narrator','system'])
const statuses=new Set(['active','missing','injured','dead','retired'])
const channelKinds=new Set(['direct','group','scene','work','system'])
const categories=new Set(['personal','work','story','system'])
const messageKinds=new Set(['dialogue','narration','action','system','choice','work-dispatch','relationship','episode-summary'])
const canonStatuses=new Set(['proposed','committed','retracted'])

function object(value:unknown,path:string):JsonObject{
  if(value===null||typeof value!=='object'||Array.isArray(value))throw new Error(`${path} 必须是对象`)
  return value as JsonObject
}
function string(value:unknown,path:string):string{
  if(typeof value!=='string'||value.length===0)throw new Error(`${path} 必须是非空字符串`)
  return value
}
function id(value:unknown,path:string):string{
  const result=string(value,path)
  if(!idPattern.test(result))throw new Error(`${path} 必须是有效 ID`)
  return result
}
function exactKeys(value:JsonObject,allowed:readonly string[],path:string):void{
  for(const key of Object.keys(value))if(!allowed.includes(key))throw new Error(`${path} 不允许字段：${key}`)
}
function stringMap(value:unknown,path:string,validKeys:Set<string>,messageIds?:Set<string>):void{
  const data=object(value,path)
  for(const [key,item] of Object.entries(data)){
    if(!validKeys.has(key))throw new Error(`${path} 引用了不存在的频道：${key}`)
    if(typeof item!=='string')throw new Error(`${path}.${key} 必须是字符串`)
    if(messageIds!==undefined&&item!==''&&!messageIds.has(item))throw new Error(`${path}.${key} 引用了不存在的消息：${item}`)
  }
}
function timestamp(value:unknown,path:string):void{
  const raw=string(value,path)
  if(Number.isNaN(Date.parse(raw)))throw new Error(`${path} 必须是 ISO 日期时间`)
}

/** Validates the schema shape and all participant/channel/message references. */
export function validateStoryUiDescriptor(value:unknown):JsonObject{
  const data=object(value,'ui/story-ui.json')
  exactKeys(data,['schemaVersion','selectedChannelId','participants','channels','messages','drafts','readCursors','frame'],'ui/story-ui.json')
  if(data.schemaVersion!==1)throw new Error('ui/story-ui.json.schemaVersion 必须为 1')
  const selectedChannelId=id(data.selectedChannelId,'selectedChannelId')
  if(!Array.isArray(data.participants)||data.participants.length===0)throw new Error('participants 必须是非空数组')
  const participantIds=new Set<string>()
  for(const [index,item] of data.participants.entries()){
    const participant=object(item,`participants[${index}]`)
    exactKeys(participant,['id','heroNameZh','realNameZh','aliases','role','status'],`participants[${index}]`)
    const participantId=id(participant.id,`participants[${index}].id`)
    if(participantIds.has(participantId))throw new Error(`人物 ID 重复：${participantId}`)
    participantIds.add(participantId)
    if(participant.heroNameZh!==undefined)string(participant.heroNameZh,`participants[${index}].heroNameZh`)
    string(participant.realNameZh,`participants[${index}].realNameZh`)
    if(!Array.isArray(participant.aliases)||participant.aliases.some(alias=>typeof alias!=='string'))throw new Error(`participants[${index}].aliases 必须是字符串数组`)
    if(new Set(participant.aliases).size!==participant.aliases.length)throw new Error(`participants[${index}].aliases 不得重复`)
    if(!roles.has(participant.role as string))throw new Error(`participants[${index}].role 无效`)
    if(!statuses.has(participant.status as string))throw new Error(`participants[${index}].status 无效`)
  }
  const playerCount=data.participants.filter(item=>object(item,'participant').role==='player').length
  if(playerCount!==1)throw new Error('participants 必须且只能有一名玩家角色')
  if(!Array.isArray(data.channels)||data.channels.length===0)throw new Error('channels 必须是非空数组')
  const channelIds=new Set<string>()
  const channelMembers=new Map<string,Set<string>>()
  for(const [index,item] of data.channels.entries()){
    const channel=object(item,`channels[${index}]`)
    exactKeys(channel,['id','kind','title','participantIds','category','pinned','muted','archived','lastMessageId','lastActivityAt'],`channels[${index}]`)
    const channelId=id(channel.id,`channels[${index}].id`)
    if(channelIds.has(channelId))throw new Error(`频道 ID 重复：${channelId}`)
    channelIds.add(channelId)
    if(!channelKinds.has(channel.kind as string))throw new Error(`channels[${index}].kind 无效`)
    string(channel.title,`channels[${index}].title`)
    if(!Array.isArray(channel.participantIds)||channel.participantIds.length===0)throw new Error(`channels[${index}].participantIds 必须是非空数组`)
    const members=new Set<string>()
    for(const member of channel.participantIds){const memberId=id(member,`channels[${index}].participantIds`);if(!participantIds.has(memberId))throw new Error(`频道成员不存在：${channelId}.${memberId}`);if(members.has(memberId))throw new Error(`频道成员重复：${channelId}.${memberId}`);members.add(memberId)}
    if(!categories.has(channel.category as string))throw new Error(`channels[${index}].category 无效`)
    channelMembers.set(channelId,members)
    for(const key of ['pinned','muted','archived'])if(typeof channel[key]!=='boolean')throw new Error(`channels[${index}].${key} 必须是布尔值`)
    if(channel.lastMessageId!==undefined)id(channel.lastMessageId,`channels[${index}].lastMessageId`)
    if(channel.lastActivityAt!==undefined)timestamp(channel.lastActivityAt,`channels[${index}].lastActivityAt`)
  }
  if(!channelIds.has(selectedChannelId))throw new Error('selectedChannelId 引用了不存在的频道')
  if(!Array.isArray(data.messages))throw new Error('messages 必须是数组')
  const messageIds=new Set<string>();const messageChannels=new Map<string,string>()
  for(const [index,item] of data.messages.entries()){
    const message=object(item,`messages[${index}]`)
    exactKeys(message,['id','channelId','senderId','kind','content','createdAt','seasonId','episodeId','sceneId','turnId','choiceId','canonStatus'],`messages[${index}]`)
    const messageId=id(message.id,`messages[${index}].id`)
    if(messageIds.has(messageId))throw new Error(`消息 ID 重复：${messageId}`)
    messageIds.add(messageId)
    messageChannels.set(messageId,String(message.channelId))
    const channelId=id(message.channelId,`messages[${index}].channelId`)
    const senderId=id(message.senderId,`messages[${index}].senderId`)
    if(!channelIds.has(channelId)||!participantIds.has(senderId))throw new Error(`消息引用无效：${messageId}`)
    const senderRole=(data.participants as unknown[]).map(item=>object(item,'participant')).find(participant=>participant.id===senderId)?.role
    if(!channelMembers.get(channelId)?.has(senderId)&&senderRole!=='narrator'&&senderRole!=='system')throw new Error(`消息发送者不属于频道：${messageId}`)
    if(!messageKinds.has(message.kind as string))throw new Error(`messages[${index}].kind 无效`)
    string(message.content,`messages[${index}].content`);timestamp(message.createdAt,`messages[${index}].createdAt`)
    string(message.seasonId,`messages[${index}].seasonId`);string(message.episodeId,`messages[${index}].episodeId`);id(message.turnId,`messages[${index}].turnId`)
    if(message.sceneId!==undefined)string(message.sceneId,`messages[${index}].sceneId`)
    if(message.choiceId!==undefined)id(message.choiceId,`messages[${index}].choiceId`)
    if(!canonStatuses.has(message.canonStatus as string))throw new Error(`messages[${index}].canonStatus 无效`)
  }
  for(const [index,item] of data.channels.entries()){
    const channel=object(item,`channels[${index}]`)
    if(channel.lastMessageId!==undefined&&(!messageIds.has(channel.lastMessageId as string)||messageChannels.get(channel.lastMessageId as string)!==channel.id))throw new Error(`频道最后消息不存在或不属于该频道：${channel.id}`)
  }
  stringMap(data.drafts,'drafts',channelIds)
  stringMap(data.readCursors,'readCursors',channelIds,messageIds)
  const frame=object(data.frame,'frame')
  exactKeys(frame,['seasonLabel','episodeLabel','sceneLabel'],'frame')
  string(frame.seasonLabel,'frame.seasonLabel');string(frame.episodeLabel,'frame.episodeLabel');string(frame.sceneLabel,'frame.sceneLabel')
  return structuredClone(data)
}
