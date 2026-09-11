export type Fields = Record<string, string | number | boolean>;
export function parseFields(json: string): Fields {
  try { const value = JSON.parse(json); return validFields(value) ? value : {}; } catch { return {}; }
}
export function validFields(value: unknown): value is Fields {
  return !!value && typeof value === 'object' && !Array.isArray(value) && Object.entries(value).length <= 100 && Object.entries(value).every(([key, v]) => key.length <= 100 && !['__proto__', 'constructor', 'prototype'].includes(key) && (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.length <= 10000)));
}
export function summarize(stages: Array<{name: string; status: string; progress: number}>) {
  const included = stages.filter(s => s.status !== 'SKIPPED');
  const next = included.find(s => s.status !== 'COMPLETE');
  const progress = included.length ? Math.round(included.reduce((n,s) => n + s.progress, 0) / included.length) : 0;
  return { progress, nextAction: next?.name ?? 'Workflow complete', status: !next && stages.length ? 'COMPLETE' : next?.status === 'WAITING' ? 'WAITING' : included.every(s => s.status === 'NOT_STARTED') ? 'PLANNED' : 'ACTIVE' };
}
export function defaults(name: string): Fields {
  const fields: Record<string, Fields> = {
    Create: {completion: 0, medium: '', dimensions: '', year: '', signed: false},
    'Finish / Varnish': {varnished: false, varnishType: '', coats: '', cureStatus: '', framed: false, hardware: false},
    Photograph: {hero: false, details: false, framedShot: false, scaleShot: false, edited: false},
    'Ingest / Archive': {ingested: false, inventoryId: '', collection: '', description: '', coa: false, masterLocation: ''},
    Price: {price: '', floor: '', costBasis: '', availability: '', prints: false, shippingProfile: ''},
    Publish: {published: false, url: ''}, Market: {instagram: '', tiktok: '', newsletter: ''},
    'Sell / Fulfill': {sold: false, buyer: '', salePrice: '', paid: false, packed: false, shipped: false, delivered: false},
    'Client Approval': {approved: false, feedback: ''}, Deposit: {received: false, reference: ''},
    'Final Payment': {received: false, reference: ''}, Package: {filesChecked: false, instructionsIncluded: false},
    Listing: {title: '', description: '', imagesReady: false}, Deliver: {delivered: false, tracking: ''},
    Schedule: {date: '', channel: ''}, 'Review Performance': {results: '', nextExperiment: ''},
  };
  return {...(fields[name] ?? {done: false}), notes: ''};
}
