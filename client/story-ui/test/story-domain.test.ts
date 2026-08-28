import{describe,expect,it}from'vitest'
import{appendAiMessages,appendChoiceRecord,appendPlayerMessage,updateDraft,validateProjection}from'../src/client/story-domain.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'
import{createLocalProjectionStorage}from'../src/client/persistence.ts'
describe('persistent story domain',()=>{
 it('validates the original projection',()=>{expect(validateProjection(createInitialProjection()).channels).toHaveLength(5)})
 it('classifies input and appends committed player messages',()=>{const p=createInitialProjection();const next=appendPlayerMessage(p,p.selectedChannelId,'(行动) 推开门',new Date('2026-08-28T12:00:00Z'));expect(next.messages.at(-1)).toMatchObject({kind:'action',content:'推开门',canonStatus:'committed'});expect(next.revision).toBe(1)})
 it('keeps system corrections outside committed canon',()=>{const p=createInitialProjection();const next=appendPlayerMessage(p,p.selectedChannelId,'(系统) 人名写错了');expect(next.messages.at(-1)).toMatchObject({kind:'system',canonStatus:'proposed'})})
 it('keeps the engine question id on an accepted choice record',()=>{const p=createInitialProjection();const next=appendChoiceRecord(p,p.selectedChannelId,'choice-first',['检查裂纹'],undefined);expect(next.messages.at(-1)).toMatchObject({kind:'choice',choiceId:'choice-first',content:'检查裂纹'})})
 it('forbids AI from speaking as the player',()=>{const p=createInitialProjection();expect(()=>appendAiMessages(p,p.selectedChannelId,[{senderId:'p-player',kind:'dialogue',content:'替玩家答应'}])).toThrow('不能替玩家')})
 it('persists drafts and projections',()=>{const data=new Map<string,string>();const storage=createLocalProjectionStorage({getItem:key=>data.get(key)??null,setItem:(key,value)=>{data.set(key,value)}} as Storage);const p=updateDraft(createInitialProjection(),'c-system','别泄露秘密');storage.save(p);expect(storage.load(p.saveId)?.drafts['c-system']).toBe('别泄露秘密')})
 it('rejects messages that reference missing channels',()=>{const p=createInitialProjection();p.messages[0]={...p.messages[0]!,channelId:'missing'};expect(()=>validateProjection(p)).toThrow('消息引用无效')})
})
