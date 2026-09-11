'use client';
import {useState} from 'react';
import {defaults, parseFields, type Fields} from '../../lib/workflow';
export type EditableStage = {id: string; name: string; status: string; progress: number; fieldsJson: string; updatedAt: string};
export default function StageEditor({stage, projectId, close, saved}: {stage: EditableStage; projectId: string; close: () => void; saved: () => Promise<void>}) {
  const [fields, setFields] = useState<Fields>({...defaults(stage.name), ...parseFields(stage.fieldsJson)});
  const [status, setStatus] = useState(stage.status);
  const [progress, setProgress] = useState(stage.progress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      const r = await fetch(`/api/projects/${projectId}/stages/${stage.id}`, {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({status, progress, fields, updatedAt: stage.updatedAt})});
      if (!r.ok) throw new Error((await r.json()).error || 'Could not save stage.');
      await saved(); close();
    } catch(e) { setError(e instanceof Error ? e.message : 'Could not save stage.'); } finally {setBusy(false);}
  }
  return <div className="modalBackdrop"><section className="editWindow" role="dialog" aria-modal="true" aria-label={stage.name}><div className="modalHead"><h2>{stage.name}</h2><button className="close" disabled={busy} onClick={close} aria-label="Close">×</button></div><div className="formGrid"><label className="field"><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}>{['NOT_STARTED','IN_PROGRESS','WAITING','COMPLETE','SKIPPED'].map(s=><option key={s} value={s}>{s.replaceAll('_',' ')}</option>)}</select></label><label className="field"><span>Stage progress: {progress}%</span><input type="range" min="0" max="99" disabled={status==='COMPLETE'||status==='SKIPPED'} value={progress} onChange={e=>{setProgress(Number(e.target.value));setStatus('IN_PROGRESS');}}/></label>{Object.entries(fields).filter(([key])=>key !== 'legacyImported').map(([key,value])=><label className={typeof value==='boolean'?'toggleRow':'field'} key={key}><span>{key.replace(/([A-Z])/g,' $1')}</span>{typeof value==='boolean'?<input type="checkbox" checked={value} onChange={e=>{setFields({...fields,[key]:e.target.checked}); if(status==='NOT_STARTED') setStatus('IN_PROGRESS');}}/>:typeof value==='number'?<input type="number" value={value} onChange={e=>setFields({...fields,[key]:Number(e.target.value)})}/>:<textarea value={value} onChange={e=>setFields({...fields,[key]:e.target.value})}/>}</label>)}</div><p className="note">Mark Complete when this stage is finished. Optional checklist items do not automatically complete the stage. Payment checks do not create ledger entries.</p>{error&&<p className="formError" role="alert">{error}</p>}<div className="modalFoot"><button disabled={busy} onClick={close}>Cancel</button><button className="primary" disabled={busy} onClick={save}>{busy?'Saving…':'Save stage'}</button></div></section></div>;
}
