import { validateProjection,type StorySaveProjection } from './story-domain.ts'
export interface ProjectionStorage{load(saveId:string):StorySaveProjection|undefined;save(value:StorySaveProjection):void}
export function createLocalProjectionStorage(storage:Pick<Storage,'getItem'|'setItem'>,prefix='dsh-story-save:'):ProjectionStorage{return{load(saveId){const raw=storage.getItem(`${prefix}${saveId}`);if(raw===null)return undefined;return validateProjection(JSON.parse(raw))},save(value){storage.setItem(`${prefix}${value.saveId}`,JSON.stringify(validateProjection(value)))}}}
