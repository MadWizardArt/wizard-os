"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type TaxonomyNode = { id: number; name: string; children?: TaxonomyNode[] };
type TaxonomyOption = { id: number; label: string; name: string; isLeaf: boolean };
type ShippingProfile = { shipping_profile_id: number; title?: string; profile_type?: string };
type ReadinessProfile = { readiness_state_id: number; readiness_state?: string; min_processing_time?: number; max_processing_time?: number };
type PreparedRelease = {
  key: string; label: string; listingType: "download" | "physical"; productVariantId: string;
  title: string; description: string; price: number; tags: string[];
};

const OWL_RELEASES: PreparedRelease[] = [
  {
    key: "digital", label: "Owl · Digital download", listingType: "download", productVariantId: "spellmarkowldigitalv1",
    title: "Printable Barn Owl Wall Art, Celestial Medieval Manuscript Art, 11x14 and 8x12 Digital Download",
    price: 7.5,
    description: "Original Spellmark illustration of a barn owl set within an illuminated-manuscript-inspired folio, with printed parchment texture, celestial motifs and a gold-toned halo. The gold-toned areas are ink colors in the artwork—not metallic foil or gilding. Colors may vary across screens and finished prints.\n\nThis is an INSTANT DIGITAL DOWNLOAD, not a physical item. You receive two JPEG print compositions (11×14 and 8×12 inches) and printing/license instructions in a ZIP. No frame, paper or postage included. Production quality was approved after a physical home inkjet proof on September 25, 2026. For personal use only; no resale or redistribution.",
    tags: ["printable owl art","owl digital print","celestial owl","medieval wall art","digital download","barn owl print","dark academia decor","printable wall art","gothic wall art","illuminated art","mystical owl","nature printable","curiosity cabinet"],
  },
  {
    key: "physical", label: "VOLANS AETHEREUS · Physical lineup", listingType: "physical", productVariantId: "",
    title: "VOLANS AETHEREUS — The Sky Wanderer | Medieval Manuscript Barn Owl Art Print | Cabinet of Curiosities",
    price: 24,
    description: "Production-approved physical lineup with three Etsy variations: 8×10 unframed $24, 11×14 unframed $28, and 11×14 black-framed $69. Warlock creates the single draft and then writes all three price/SKU offerings to Etsy inventory.",
    tags: ["barn owl print","medieval wall art","celestial owl","manuscript art","dark academia decor","owl wall decor","nature illustration","gothic wall art","illuminated art","mystical owl","curiosity cabinet","black framed print","Spellmark"],
  },
];

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function flattenTaxonomy(nodes: TaxonomyNode[], parents: string[] = []): TaxonomyOption[] {
  return nodes.flatMap((node) => {
    const path = [...parents, node.name]; const children = node.children ?? [];
    return [{ id: node.id, label: path.join(" › "), name: node.name, isLeaf: children.length === 0 }, ...flattenTaxonomy(children, path)];
  });
}
function scoreCategory(option: TaxonomyOption, query: string) {
  const q = normalize(query); const words = q.split(/\s+/).filter(Boolean); const label = normalize(option.label); const name = normalize(option.name);
  let score = option.isLeaf ? 10 : 0;
  if (q && name.includes(q)) score += 150; if (q && label.includes(q)) score += 100;
  for (const word of words) { if (name.includes(word)) score += 35; else if (label.includes(word)) score += 18; }
  return score;
}

export default function EtsyConsole() {
  const [creating, setCreating] = useState(false); const [result, setResult] = useState<any>(null);
  const [preparedKey, setPreparedKey] = useState("");
  const [listingType, setListingType] = useState<"download" | "physical">("download");
  const [productVariantId, setProductVariantId] = useState("");
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [price, setPrice] = useState(""); const [tags, setTags] = useState("");
  const [taxonomyId, setTaxonomyId] = useState(""); const [categorySearch, setCategorySearch] = useState("");
  const [taxonomy, setTaxonomy] = useState<TaxonomyNode[]>([]); const [taxonomyError, setTaxonomyError] = useState("");
  const [shippingProfiles, setShippingProfiles] = useState<ShippingProfile[]>([]);
  const [readinessProfiles, setReadinessProfiles] = useState<ReadinessProfile[]>([]);
  const [shippingProfileId, setShippingProfileId] = useState(""); const [readinessStateId, setReadinessStateId] = useState("");
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    fetch("/api/etsy/taxonomy", { cache: "no-store" }).then(async r => { const d=await r.json(); if(!r.ok) throw new Error(d.error||"Unable to load Etsy categories"); return d; })
      .then(d=>setTaxonomy(d.results??[])).catch(e=>setTaxonomyError(e.message));
    fetch("/api/etsy/commerce-profiles", { cache: "no-store" }).then(async r => { const d=await r.json(); if(!r.ok) throw new Error(d.error||"Unable to load Etsy fulfillment profiles"); return d; })
      .then(d=>{ setShippingProfiles(d.shippingProfiles??[]); setReadinessProfiles(d.readinessProfiles??[]); })
      .catch(e=>setProfileError(e.message));
  }, []);

  const taxonomyOptions = useMemo(() => flattenTaxonomy(taxonomy), [taxonomy]);
  const rankedCategories = useMemo(() => {
    if (!categorySearch.trim()) return [];
    return taxonomyOptions.map(o=>({ ...o, score: scoreCategory(o,categorySearch) })).filter(o=>o.score>20).sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label)).slice(0,5);
  }, [categorySearch,taxonomyOptions]);
  const selectedCategory = taxonomyOptions.find(o=>String(o.id)===taxonomyId);

  function applyPrepared(key: string) {
    setPreparedKey(key); setResult(null);
    const p=OWL_RELEASES.find(x=>x.key===key); if(!p) return;
    setListingType(p.listingType); setProductVariantId(p.productVariantId); setTitle(p.title); setDescription(p.description); setPrice(p.price.toFixed(2)); setTags(p.tags.join(", "));
    setTaxonomyId(""); setCategorySearch("wall art print");
    if(p.listingType==="download"){ setShippingProfileId(""); setReadinessStateId(""); }
  }
  function reset() {
    setPreparedKey(""); setListingType("download"); setProductVariantId(""); setTitle(""); setDescription(""); setPrice(""); setTags(""); setTaxonomyId(""); setCategorySearch(""); setShippingProfileId(""); setReadinessStateId("");
  }

  async function createDraft(event: FormEvent) {
    event.preventDefault(); setCreating(true); setResult(null);
    try {
      const isVolansPhysical = preparedKey === "physical";
      const endpoint = isVolansPhysical ? "/api/etsy/releases/volans" : "/api/etsy/drafts";
      const payload = isVolansPhysical
        ? { taxonomyId:Number(taxonomyId), shippingProfileId:Number(shippingProfileId), readinessStateId:Number(readinessStateId) }
        : {
            title,description,price:Number(price),quantity:999,taxonomyId:Number(taxonomyId),tags:tags.split(",").map(t=>t.trim()).filter(Boolean).slice(0,13),
            listingType,shippingProfileId:listingType==="physical"?Number(shippingProfileId):undefined,
            readinessStateId:listingType==="physical"?Number(readinessStateId):undefined,productVariantId:productVariantId||undefined,
          };
      const response=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await response.json(); if(!response.ok) throw new Error(data.details?.error||data.error||"Draft creation failed");
      setResult(data); const listingId=Number(data?.listingId ?? data?.listing?.listing_id); reset();
      if(listingId) window.dispatchEvent(new CustomEvent("warlock:draft-created",{detail:{listingId}}));
    } catch(error){ setResult({error:error instanceof Error?error.message:"Draft creation failed"}); } finally { setCreating(false); }
  }

  const input={width:"100%",padding:11,borderRadius:8,border:"1px solid #34404d",background:"#0d141c",color:"#e9edf1",boxSizing:"border-box" as const};
  const label={display:"block",marginBottom:6,color:"#c6ced7",fontSize:12,fontWeight:700} as const;
  const physicalReady=listingType!=="physical" || (!!shippingProfileId && !!readinessStateId);
  const canCreate=!creating&&!!taxonomyId&&!!title.trim()&&!!description.trim()&&!!price&&physicalReady;

  return <details style={{marginTop:14,border:"1px solid #26313d",borderRadius:13,background:"#101821",overflow:"hidden"}}>
    <summary style={{cursor:"pointer",padding:"16px 18px",fontWeight:800,color:"#e9edf1",userSelect:"none"}}>+ New Etsy Draft</summary>
    <form onSubmit={createDraft} style={{padding:"0 18px 18px",display:"grid",gap:13}}>
      <label><span style={label}>Prepared Spellmark release</span><select style={input} value={preparedKey} onChange={e=>applyPrepared(e.target.value)}>
        <option value="">Manual draft…</option>{OWL_RELEASES.map(p=><option key={p.key} value={p.key}>{p.label}</option>)}
      </select></label>
      {preparedKey && <div style={{padding:10,border:"1px solid #4a4537",borderRadius:8,background:"#171812",color:"#d5bd8f",fontSize:12}}>Production approved · master locked · draft only. Publication remains manual after all required listing assets are present.</div>}
      <label><span style={label}>Title</span><input style={input} value={title} onChange={e=>setTitle(e.target.value)} /></label>
      <label><span style={label}>Description</span><textarea style={{...input,minHeight:130,resize:"vertical"}} value={description} onChange={e=>setDescription(e.target.value)} /></label>
      <div style={{display:"grid",gridTemplateColumns:"minmax(100px,150px) minmax(0,1fr)",gap:10}}>
        <label><span style={label}>Price</span><input style={input} value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00" /></label>
        <label><span style={label}>Tags</span><input style={input} value={tags} onChange={e=>setTags(e.target.value)} placeholder="tag one, tag two…" /></label>
      </div>
      {listingType==="physical" && <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10}}>
        <label><span style={label}>Etsy shipping profile</span><select style={input} value={shippingProfileId} onChange={e=>setShippingProfileId(e.target.value)}><option value="">Choose a real shop profile…</option>{shippingProfiles.map(p=><option key={p.shipping_profile_id} value={p.shipping_profile_id}>{p.title||`Shipping #${p.shipping_profile_id}`}</option>)}</select></label>
        <label><span style={label}>Etsy processing profile</span><select style={input} value={readinessStateId} onChange={e=>setReadinessStateId(e.target.value)}><option value="">Choose processing…</option>{readinessProfiles.map(p=><option key={p.readiness_state_id} value={p.readiness_state_id}>{p.readiness_state||"Processing"} · {p.min_processing_time ?? "?"}–{p.max_processing_time ?? "?"} days</option>)}</select></label>
        {profileError&&<p style={{color:"#e08aa2",fontSize:12,gridColumn:"1 / -1",margin:0}}>Warlock: {profileError}</p>}
      </div>}
      <div>
        <label><span style={label}>Category</span><input style={input} value={categorySearch} onChange={e=>setCategorySearch(e.target.value)} placeholder="Search Etsy categories…" /></label>
        {taxonomyError&&<p style={{color:"#e08aa2",fontSize:12,marginBottom:0}}>{taxonomyError}</p>}
        {categorySearch&&rankedCategories.length>0&&<div style={{display:"grid",gap:6,marginTop:8}}>{rankedCategories.map(o=><button key={o.id} type="button" onClick={()=>setTaxonomyId(String(o.id))} style={{textAlign:"left",padding:"9px 10px",borderRadius:8,border:String(o.id)===taxonomyId?"1px solid #a99164":"1px solid #2b3743",background:String(o.id)===taxonomyId?"#1b2025":"#0d141c",color:"#e9edf1",cursor:"pointer"}}>{o.label}</button>)}</div>}
        {selectedCategory&&<div style={{marginTop:8,color:"#d4b06f",fontSize:12}}>Selected: {selectedCategory.label}</div>}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <button type="button" onClick={()=>{reset();setResult(null);}} style={{border:0,background:"transparent",color:"#8e99a7",cursor:"pointer",padding:0}}>Clear</button>
        <button disabled={!canCreate} type="submit" style={{padding:"10px 14px",border:0,borderRadius:9,background:"#6f263d",color:"white",fontWeight:800,cursor:canCreate?"pointer":"default",opacity:canCreate?1:.5}}>{creating?"Creating…":"Create Etsy Draft"}</button>
      </div>
      {result?.error&&<p style={{color:"#e08aa2",fontSize:12,margin:0}}>{result.error}</p>}
      {result?.listing&&<p style={{color:"#9bc8aa",fontSize:12,margin:0}}>Draft {result.listing.listing_id} created{result.variantLinked?" and linked to its Spellmark edition":""}. Upload every required mockup/customer file in Draft Lifecycle before review.</p>}
    </form>
  </details>;
}
