export type StoryRole='player'|'npc'|'narrator'|'system'
export interface StoryParticipant{id:string;heroNameZh?:string;realNameZh:string;role:StoryRole;status:'active'|'missing'|'injured'|'dead'|'retired'}
export type ChannelKind='direct'|'group'|'scene'|'work'|'system'
export interface StoryChannel{id:string;kind:ChannelKind;title:string;participantIds:string[];category:'personal'|'work'|'story'|'system';pinned:boolean;lastMessageId?:string;lastActivityAt?:string}
export type MessageKind='dialogue'|'narration'|'action'|'system'|'choice'|'work-dispatch'
export interface StoryMessage{id:string;channelId:string;senderId:string;kind:MessageKind;content:string;createdAt:string}
export const PARTICIPANTS:readonly StoryParticipant[]=[
 {id:'p-player',heroNameZh:'岚',realNameZh:'岚',role:'player',status:'active'},
 {id:'p-hezhou',heroNameZh:'鹤舟',realNameZh:'鹤舟',role:'npc',status:'active'},
 {id:'p-narrator',realNameZh:'旁白',role:'narrator',status:'active'},
 {id:'p-system',realNameZh:'系统',role:'system',status:'active'},
]
export const CHANNELS:readonly StoryChannel[]=[
 {id:'c-direct-hezhou',kind:'direct',title:'鹤舟',participantIds:['p-player','p-hezhou'],category:'personal',pinned:true,lastMessageId:'m-d-2',lastActivityAt:'22:41'},
 {id:'c-group-lighthouse',kind:'group',title:'雾海灯塔站',participantIds:['p-player','p-hezhou','p-system'],category:'work',pinned:true,lastMessageId:'m-g-2',lastActivityAt:'22:37'},
 {id:'c-scene-lantern-room',kind:'scene',title:'现场｜灯室',participantIds:['p-player','p-hezhou','p-narrator'],category:'story',pinned:false,lastMessageId:'m-s-3',lastActivityAt:'21:58'},
 {id:'c-work-dispatch',kind:'work',title:'工作简报',participantIds:['p-player','p-hezhou','p-system'],category:'work',pinned:false,lastMessageId:'m-w-2',lastActivityAt:'20:15'},
 {id:'c-system',kind:'system',title:'系统通知',participantIds:['p-player','p-system'],category:'system',pinned:false,lastMessageId:'m-sys-1',lastActivityAt:'19:00'},
]
export const MESSAGES:readonly StoryMessage[]=[
 {id:'m-d-1',channelId:'c-direct-hezhou',senderId:'p-hezhou',kind:'dialogue',content:'雾潮提前了。上灯室前，先答应我别碰那组裸线。',createdAt:'22:39'},
 {id:'m-d-2',channelId:'c-direct-hezhou',senderId:'p-player',kind:'dialogue',content:'先把风险说清楚，我再决定。',createdAt:'22:41'},
 {id:'m-g-1',channelId:'c-group-lighthouse',senderId:'p-system',kind:'system',content:'雾潮预警：预计三十分钟后覆盖近岸航道。',createdAt:'22:35'},
 {id:'m-g-2',channelId:'c-group-lighthouse',senderId:'p-hezhou',kind:'dialogue',content:'备用灯负载测试还差最后一轮。',createdAt:'22:37'},
 {id:'m-s-1',channelId:'c-scene-lantern-room',senderId:'p-narrator',kind:'narration',content:'旋转灯罩擦过浓雾，主透镜边缘的一道新裂纹在光里一闪。',createdAt:'21:55'},
 {id:'m-s-2',channelId:'c-scene-lantern-room',senderId:'p-hezhou',kind:'dialogue',content:'停一下。这道裂纹昨晚还没有。',createdAt:'21:56'},
 {id:'m-s-3',channelId:'c-scene-lantern-room',senderId:'p-player',kind:'choice',content:'检查主透镜／启动备用灯／追查昨夜访客／自由输入',createdAt:'21:58'},
 {id:'m-w-1',channelId:'c-work-dispatch',senderId:'p-system',kind:'work-dispatch',content:'【工作内简报｜S1E1】校准东侧雾笛——鹤舟——成功，轻度疲劳。',createdAt:'20:14'},
 {id:'m-w-2',channelId:'c-work-dispatch',senderId:'p-system',kind:'work-dispatch',content:'【工作内简报｜S1E1】引导迟归渔船——岚——完美，灯塔声誉提升。',createdAt:'20:15'},
 {id:'m-sys-1',channelId:'c-system',senderId:'p-system',kind:'system',content:'原创示例包已载入：第一季第一集《雾潮提前抵达》。',createdAt:'19:00'},
]
export const STORY_FRAME={packTitle:'雾海灯塔站',seasonLabel:'第 1 季',episodeLabel:'第 1 集',sceneLabel:'灯室里的裂纹'}as const
export function participantById(id:string):StoryParticipant|undefined{return PARTICIPANTS.find(p=>p.id===id)}
export function displayName(p:StoryParticipant,sceneContext:boolean):string{return sceneContext&&p.heroNameZh!==undefined?p.heroNameZh:p.heroNameZh??p.realNameZh}
export function messagesOfChannel(channelId:string):readonly StoryMessage[]{return MESSAGES.filter(m=>m.channelId===channelId)}
