import{mkdtemp}from'node:fs/promises'
import{tmpdir}from'node:os'
import{join}from'node:path'
import{describe,expect,it}from'vitest'
import{StoryProjectionStore}from'../src/host-store.ts'
import{createInitialProjection}from'../src/client/initial-projection.ts'
describe('host projection store',()=>{
 it('persists atomically and rejects stale revisions',async()=>{const store=new StoryProjectionStore(await mkdtemp(join(tmpdir(),'story-host-')));const initial=createInitialProjection();await store.write(initial.saveId,-1,initial);expect((await store.read(initial.saveId))?.packId).toBe('lantern-station');const next={...initial,revision:1};await store.write(initial.saveId,0,next);await expect(store.write(initial.saveId,0,{...next,revision:1})).rejects.toThrow('版本冲突')})
 it('lists saves with summaries, newest first, and tolerates an empty directory',async()=>{const root=await mkdtemp(join(tmpdir(),'story-list-'));const store=new StoryProjectionStore(root);expect(await store.list()).toEqual([]);const a=createInitialProjection();const a1={...a,saveId:'save-a',updatedAt:'2026-08-28T08:00:00.000Z'};await store.write('save-a',-1,a1);const b=createInitialProjection();const b1={...b,saveId:'save-b',updatedAt:'2026-08-28T09:00:00.000Z'};await store.write('save-b',-1,b1);const list=await store.list();expect(list.map(s=>s.saveId)).toEqual(['save-b','save-a']);expect(list[0]).toMatchObject({packId:'lantern-station',packTitle:'雾海灯塔站',sceneLabel:'灯室里的裂纹'})})
 it('skips unreadable or non-json files in the list',async()=>{const root=await mkdtemp(join(tmpdir(),'story-skip-'));const {writeFile,mkdir}=await import('node:fs/promises');await mkdir(join(root,'social-saves'),{recursive:true});await writeFile(join(root,'social-saves','broken.json'),'{not json','utf8');const store=new StoryProjectionStore(root);const list=await store.list();expect(list).toEqual([])})
 it('removes a save and reports absence',async()=>{const root=await mkdtemp(join(tmpdir(),'story-del-'));const store=new StoryProjectionStore(root);const a=createInitialProjection();await store.write('save-x',-1,{...a,saveId:'save-x'});expect((await store.read('save-x'))?.saveId).toBe('save-x');expect(await store.remove('save-x')).toBe(true);expect(await store.read('save-x')).toBeUndefined();expect(await store.remove('save-x')).toBe(false)})
})
