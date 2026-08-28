// Restore the lantern-demo-save baseline that the E2E delete step removed.
// Writes a clean initial projection through the host API (bootstrap: expectedRevision -1).
const BASE = 'http://127.0.0.1:3081'

const participants = [
  { id: 'p-player', heroNameZh: '岚', realNameZh: '岚', role: 'player', status: 'active', aliases: [] },
  { id: 'p-hezhou', heroNameZh: '鹤舟', realNameZh: '鹤舟', role: 'npc', status: 'active', aliases: [] },
  { id: 'p-narrator', realNameZh: '旁白', role: 'narrator', status: 'active', aliases: [] },
  { id: 'p-system', realNameZh: '系统', role: 'system', status: 'active', aliases: [] },
]
const channels = [
  { id: 'c-direct-hezhou', kind: 'direct', title: '鹤舟', participantIds: ['p-player', 'p-hezhou'], category: 'personal', pinned: true, lastMessageId: 'm-d-2', lastActivityAt: '2026-08-28T22:41:00.000+08:00', muted: false, archived: false },
  { id: 'c-group-lighthouse', kind: 'group', title: '雾海灯塔站', participantIds: ['p-player', 'p-hezhou', 'p-system'], category: 'work', pinned: true, lastMessageId: 'm-g-2', lastActivityAt: '2026-08-28T22:37:00.000+08:00', muted: false, archived: false },
  { id: 'c-scene-lantern-room', kind: 'scene', title: '现场｜灯室', participantIds: ['p-player', 'p-hezhou', 'p-narrator'], category: 'story', pinned: false, lastMessageId: 'm-s-3', lastActivityAt: '2026-08-28T21:58:00.000+08:00', muted: false, archived: false },
  { id: 'c-work-dispatch', kind: 'work', title: '工作简报', participantIds: ['p-player', 'p-hezhou', 'p-system'], category: 'work', pinned: false, lastMessageId: 'm-w-2', lastActivityAt: '2026-08-28T20:15:00.000+08:00', muted: false, archived: false },
  { id: 'c-system', kind: 'system', title: '系统通知', participantIds: ['p-player', 'p-system'], category: 'system', pinned: false, lastMessageId: 'm-sys-1', lastActivityAt: '2026-08-28T19:00:00.000+08:00', muted: false, archived: false },
]
const mk = (id, channelId, senderId, kind, content, createdAt, turnId) => ({ id, channelId, senderId, kind, content, createdAt, seasonId: 'S1', episodeId: 'E1', sceneId: '灯室里的裂纹', turnId, canonStatus: 'committed' })
const messages = [
  mk('m-d-1', 'c-direct-hezhou', 'p-hezhou', 'dialogue', '雾潮提前了。上灯室前，先答应我别碰那组裸线。', '2026-08-28T22:39:00.000+08:00', 'fixture-1'),
  mk('m-d-2', 'c-direct-hezhou', 'p-player', 'dialogue', '先把风险说清楚，我再决定。', '2026-08-28T22:41:00.000+08:00', 'fixture-2'),
  mk('m-g-1', 'c-group-lighthouse', 'p-system', 'system', '雾潮预警：预计三十分钟后覆盖近岸航道。', '2026-08-28T22:35:00.000+08:00', 'fixture-3'),
  mk('m-g-2', 'c-group-lighthouse', 'p-hezhou', 'dialogue', '备用灯负载测试还差最后一轮。', '2026-08-28T22:37:00.000+08:00', 'fixture-4'),
  mk('m-s-1', 'c-scene-lantern-room', 'p-narrator', 'narration', '旋转灯罩擦过浓雾，主透镜边缘的一道新裂纹在光里一闪。', '2026-08-28T21:55:00.000+08:00', 'fixture-5'),
  mk('m-s-2', 'c-scene-lantern-room', 'p-hezhou', 'dialogue', '停一下。这道裂纹昨晚还没有。', '2026-08-28T21:56:00.000+08:00', 'fixture-6'),
  mk('m-s-3', 'c-scene-lantern-room', 'p-player', 'choice', '检查主透镜／启动备用灯／追查昨夜访客／自由输入', '2026-08-28T21:58:00.000+08:00', 'fixture-7'),
  mk('m-w-1', 'c-work-dispatch', 'p-system', 'work-dispatch', '【工作内简报｜S1E1】校准东侧雾笛——鹤舟——成功，轻度疲劳。', '2026-08-28T20:14:00.000+08:00', 'fixture-8'),
  mk('m-w-2', 'c-work-dispatch', 'p-system', 'work-dispatch', '【工作内简报｜S1E1】引导迟归渔船——岚——完美，灯塔声誉提升。', '2026-08-28T20:15:00.000+08:00', 'fixture-9'),
  mk('m-sys-1', 'c-system', 'p-system', 'system', '原创示例包已载入：第一季第一集《雾潮提前抵达》。', '2026-08-28T19:00:00.000+08:00', 'fixture-10'),
]
const projection = {
  schemaVersion: 1,
  saveId: 'lantern-demo-save',
  packId: 'lantern-station',
  packTitle: '雾海灯塔站',
  selectedChannelId: 'c-direct-hezhou',
  participants,
  channels,
  messages,
  drafts: { 'c-direct-hezhou': '' },
  readCursors: {},
  frame: { seasonLabel: '第 1 季', episodeLabel: '第 1 集', sceneLabel: '灯室里的裂纹' },
  revision: 0,
  updatedAt: '2026-08-28T19:00:00.000+08:00',
}

const res = await fetch(`${BASE}/story-engine/api/saves/lantern-demo-save`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ expectedRevision: -1, projection }),
})
const body = await res.json()
console.log('restore status:', res.status, '-> saveId:', body.saveId, 'revision:', body.revision)
