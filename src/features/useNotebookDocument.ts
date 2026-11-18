import { useCallback, useEffect, useRef, useState } from 'react';
import { History } from '../engine/history';
import { repository } from '../services/storage';
import type { Project } from '../types';

type Content = Pick<Project,'pages'|'sections'>;
export function useNotebookDocument(initial: Project) {
  const [project,setProject] = useState(initial);
  const [saveState,setSaveState] = useState('Saved locally');
  const projectRef=useRef(initial), mounted=useRef(true), dirty=useRef(false);
  const timer=useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue=useRef(Promise.resolve());
  // Committed page objects are immutable. Undo frames can share their unchanged ink.
  const history=useRef(new History<Content>(80, content=>content));
  const save=useCallback(()=>{
    clearTimeout(timer.current);
    const snapshot=projectRef.current;
    queue.current=queue.current.then(async()=>{
      try{
        await repository.save(snapshot);
        if(projectRef.current===snapshot){
          dirty.current=false;
          if(mounted.current)setSaveState('Saved locally');
        }
      }catch{
        if(mounted.current && projectRef.current===snapshot)setSaveState('Save failed - export a backup');
      }
    });
  },[]);
  const publish=useCallback((next:Project)=>{
    const document={...next,updatedAt:Date.now()};
    projectRef.current=document;dirty.current=true;
    setProject(document);setSaveState('Saving.');
    clearTimeout(timer.current);timer.current=setTimeout(save,350);
  },[save]);
  const update=useCallback((pages:Project['pages'],record=true,sections=projectRef.current.sections)=>{
    const current=projectRef.current;
    if(record)history.current.push({pages:current.pages,sections:current.sections});
    publish({...current,pages,sections});
  },[publish]);
  useEffect(()=>{
    mounted.current=true;
    const flush=()=>{if(dirty.current)save();};
    const visibility=()=>{if(document.hidden)flush();};
    document.addEventListener('visibilitychange',visibility);
    window.addEventListener('pagehide',flush);
    return ()=>{
      mounted.current=false;clearTimeout(timer.current);flush();
      document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pagehide',flush);
    };
  },[save]);
  return {project,projectRef,update,publish,history,save,saveState};
}
