import{describe,expect,it}from'vitest'
import{StoryAiBridge,type AiTurn}from'../src/client/ai-bridge.ts'

function bridgeWith(turn:AiTurn){const values=new Map<string,string>([[`dsh-story-ai-pending:save-a`,JSON.stringify(turn)]]);const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)}};const api={sessions:{create:async()=>({ok:true,value:{sessionId:'unused'}}),fork:async()=>({ok:true,value:{sessionId:'unused'}}),history:async()=>({ok:true,value:{events:[]}}),prompt:async()=>({ok:true,value:{accepted:true}}),cancel:async()=>({ok:true,value:{accepted:true}})},workspace:{archiveSession:async()=>({ok:true,value:{}})}};return{bridge:new StoryAiBridge(api as never,storage as never),values}}
function turn(state:AiTurn['state']):AiTurn{return{version:1,id:`turn-${state}`,sessionId:'session-a',baseline:0,channelId:'scene-main',prompt:'prompt',state}}

describe('AI terminal turn acknowledge',()=>{
 it.each(['completed','failed','cancelled'] as const)('clears %s only after coordinator acknowledges the terminal turn',(state)=>{const{bridge,values}=bridgeWith(turn(state));bridge.acknowledge('save-a',`turn-${state}`);expect(bridge.turn('save-a')).toBeNull();expect(values.get('dsh-story-ai-pending:save-a')).toBe('')})
 it.each(['queued','running','waiting-choice','uncertain'] as const)('does not clear nonterminal %s state',(state)=>{const{bridge}=bridgeWith(turn(state));bridge.acknowledge('save-a',`turn-${state}`);expect(bridge.turn('save-a')?.state).toBe(state)})
 it('does not clear a different terminal turn id',()=>{const{bridge}=bridgeWith(turn('failed'));bridge.acknowledge('save-a','turn-other');expect(bridge.turn('save-a')?.state).toBe('failed')})
})
