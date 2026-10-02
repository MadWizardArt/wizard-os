"use client";
import { useEffect, useRef, useState } from "react";
type Observation = { observedState:string; assessment:string; discrepancies:Array<{code:string;detail:string}> };
type Ledger = { listings:Array<{id:string;fulfillment:"DIGITAL"|"PHYSICAL";digitalDelivery:string;etsyListingId:string|null;lastVerifiedAt:string|null;verificationCurrent:boolean;observation:Observation|null}>;history:Array<{id:string;kind:string;createdAt:string;body:{note?:string;observedState?:string;assessment?:string;etsyListingId?:string}}> ;nextOffset:number|null };
const button = {padding:"8px 12px",borderRadius:8,border:"1px solid #53616a",background:"#29343b",color:"#ede5d5",cursor:"pointer"};
export default function ProductBookkeeping({productId}:{productId:string}) {
  const [ledger,setLedger]=useState<Ledger|null>(null),[note,setNote]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  const requestRef=useRef<{note:string;requestId:string}|null>(null);
  const alive=useRef(true);
  async function load(signal?:AbortSignal) {
    const response=await fetch(`/api/warlock/products/${productId}/bookkeeping`,{cache:"no-store",signal}),data=await response.json();
    if(!response.ok)throw Error(data.error || "Ledger unavailable");
    if(alive.current)setLedger(data);
  }
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();
    void load(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>{alive.current=false;controller.abort();};
    // ProductStudio keys this panel by productId; each product gets isolated form and request state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[productId]);
  async function write(body:Record<string,unknown>) {
    setBusy(true);setError("");
    try {
      const response=await fetch(`/api/warlock/products/${productId}/bookkeeping`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}),data=await response.json();
      if(!response.ok)throw Error(data.error || "Ledger update failed");
      if(!alive.current)return;
      if(body.action==="NOTE"){setNote("");requestRef.current=null;}
      await load();
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:"Ledger update failed");}
    finally{if(alive.current)setBusy(false);}
  }
  return <section style={{border:"1px solid #33414a",background:"#141d25",padding:18,borderRadius:13}}>
    <h2 style={{fontFamily:"Georgia, serif",marginTop:0}}>Product ledger</h2>
    <p>Verified listing state, discrepancies and production history. Etsy observations include their verification date.</p>
    {error ? <p role="alert">{error}</p> : null}
    {!ledger ? (!error ? <p role="status">Loading ledger…</p> : null) : <>
      {ledger.listings.map(l=><article key={l.id} style={{borderTop:"1px solid #34434c",padding:"12px 0"}}>
        <strong>{l.fulfillment} {l.fulfillment==="DIGITAL"?`· ${l.digitalDelivery.replaceAll("_"," ").toLowerCase()}`:""}</strong>
        <p>{l.etsyListingId?`Etsy #${l.etsyListingId}`:"No Etsy listing saved"} · {l.observation?`${l.observation.observedState} · ${l.observation.assessment}`:"Not verified"}</p>
        {l.observation && !l.verificationCurrent ? <p>Historical observation — verify again after record changes.</p> : null}
        {l.lastVerifiedAt?<small>Verified {new Date(l.lastVerifiedAt).toLocaleString()}</small>:null}
        {l.observation?.discrepancies.length?<ul>{l.observation.discrepancies.map((d,i)=><li key={`${d.code}-${i}`}>{d.code}: {d.detail}</li>)}</ul>:null}
        <p><button type="button" style={button} disabled={busy||!l.etsyListingId} onClick={()=>void write({action:"RECONCILE",fulfillment:l.fulfillment,expectedEtsyListingId:l.etsyListingId,confirmReconciliation:true})}>Verify Etsy and save observation</button></p>
      </article>)}
      <form onSubmit={e=>{e.preventDefault();if(!requestRef.current || requestRef.current.note!==note)requestRef.current={note,requestId:crypto.randomUUID()};void write({action:"NOTE",...requestRef.current,confirmRecord:true});}}>
        <label>Production note<textarea value={note} maxLength={4000} required onChange={e=>setNote(e.target.value)} style={{display:"block",width:"100%",boxSizing:"border-box",minHeight:75,margin:"8px 0",background:"#10171e",color:"#f1ecde",border:"1px solid #53616a",borderRadius:8}} /></label>
        <button type="submit" style={button} disabled={busy||!note.trim()}>Record note</button>
      </form>
      <h3>History</h3>
      {!ledger.history.length?<p>No observations or notes recorded yet.</p>:<ol>{ledger.history.map(h=><li key={h.id}><time>{new Date(h.createdAt).toLocaleString()}</time> · {h.body.note ?? (h.kind==="ETSY_OBSERVATION" ? `${h.body.observedState} · ${h.body.assessment}` : h.kind==="CANONICAL_PRICES" ? "Canonical prices updated" : `Draft execution · Etsy #${h.body.etsyListingId ?? ""}`)}</li>)}</ol>}
      {ledger.nextOffset!==null?<button type="button" style={button} disabled={busy} onClick={async()=>{
        setBusy(true);setError("");try{const r=await fetch(`/api/warlock/products/${productId}/bookkeeping?offset=${ledger.nextOffset}`,{cache:"no-store"}),d=await r.json();if(!r.ok)throw Error(d.error);if(alive.current)setLedger(p=>p?{...p,history:[...p.history,...d.history],nextOffset:d.nextOffset}:d);}catch(e){if(alive.current)setError(e instanceof Error?e.message:"History unavailable");}finally{if(alive.current)setBusy(false);}
      }}>Older history</button>:null}
    </>}
  </section>;
}
