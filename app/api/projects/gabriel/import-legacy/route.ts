import {NextRequest, NextResponse} from 'next/server';
import {prisma} from '../../../../../lib/prisma';
import {parseFields, validFields, summarize, type Fields} from '../../../../../lib/workflow';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({error:'Invalid artwork record.'},{status:400});
  const mapping: Record<string,string> = {'Finish / Varnish':'finish', Photograph:'photography','Ingest / Archive':'archive',Price:'pricing',Publish:'publishing',Market:'marketing','Sell / Fulfill':'fulfillment'};
  const create: Fields = {};
  for (const key of ['completion','medium','dimensions','year','signed','notes','title','artworkStatus']) if(body[key] !== undefined) create[key] = body[key];
  if (!validFields(create) || Object.values(mapping).some(key=>body[key] !== undefined && !validFields(body[key]))) return NextResponse.json({error:'Invalid saved artwork details.'},{status:400});
  try {
    const imported = await prisma.$transaction(async tx=>{
      const project = await tx.project.findUnique({where:{id:'gabriel'},include:{stages:{orderBy:{position:'asc'}}}});
      if(!project || project.archivedAt) throw new Error('Gabriel’s Horn must be available before importing.');
      let count=0;
      for(const stage of project.stages) {
        const old = parseFields(stage.fieldsJson);
        if(old.legacyImported || stage.updatedAt.getTime() !== stage.createdAt.getTime()) continue;
        const incoming = stage.name === 'Create' ? create : body[mapping[stage.name]];
        if(!incoming || !Object.keys(incoming).length) continue;
        const completion = stage.name === 'Create' && typeof create.completion === 'number' ? Math.max(0,Math.min(100,Math.round(create.completion))) : stage.progress;
        await tx.projectStage.update({where:{id:stage.id}, data:{fieldsJson:JSON.stringify({...old,...incoming,legacyImported:true}),progress:completion,status:completion===100?'COMPLETE':completion>0?'IN_PROGRESS':stage.status,completedAt:completion===100?new Date():stage.completedAt}});
        count++;
      }
      if(count) {
        const stages=await tx.projectStage.findMany({where:{projectId:project.id},orderBy:{position:'asc'}});
        const summary=summarize(stages);
        await tx.project.update({where:{id:project.id},data:{...summary,status:summary.status as 'ACTIVE'|'PLANNED'|'COMPLETE'|'WAITING'}});
      }
      return count;
    },{isolationLevel:'Serializable'});
    return NextResponse.json({imported});
  } catch {return NextResponse.json({error:'Import could not finish. Your browser copy is unchanged; retry after refreshing.'},{status:409});}
}
