import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { withWarlockOpenAiToolSecuritySchemes } from "../lib/warlock-mcp/openai-compat.ts";
import {
  CHATGPT_CLIENT_ID,
  CHATGPT_REDIRECT_URI,
  WARLOCK_OAUTH_SCOPE,
  WARLOCK_TOOL_SECURITY_SCHEMES,
  normalizeOAuthScope,
  pkceChallenge,
  validateAuthorizationInput,
  warlockMcpResource,
  warlockOAuthChallenge,
  warlockOAuthMetadata,
  warlockProtectedResourceMetadata,
} from "../lib/warlock-mcp-oauth.ts";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Warlock OAuth discovery is bound to the canonical MCP resource", () => {
  const resource = warlockProtectedResourceMetadata();
  const auth = warlockOAuthMetadata();

  assert.equal(resource.resource, warlockMcpResource());
  assert.deepEqual(resource.authorization_servers, [auth.issuer]);
  assert.ok(resource.scopes_supported.includes(WARLOCK_OAUTH_SCOPE));
  assert.equal(auth.authorization_response_iss_parameter_supported, true);
  assert.equal(auth.client_id_metadata_document_supported, true);
  assert.deepEqual(auth.token_endpoint_auth_methods_supported, ["none"]);
  assert.ok(auth.code_challenge_methods_supported.includes("S256"));
  assert.ok(auth.grant_types_supported.includes("authorization_code"));
  assert.ok(auth.grant_types_supported.includes("refresh_token"));
});

test("Warlock OAuth only accepts the stable ChatGPT client and callback", () => {
  const base = {
    responseType: "code",
    clientId: CHATGPT_CLIENT_ID,
    redirectUri: CHATGPT_REDIRECT_URI,
    resource: warlockMcpResource(),
    scope: WARLOCK_OAUTH_SCOPE,
    state: "state-123",
    codeChallenge: "A".repeat(43),
    codeChallengeMethod: "S256",
  };

  assert.equal(validateAuthorizationInput(base), true);
  assert.throws(
    () => validateAuthorizationInput({ ...base, clientId: "https://attacker.example/client.json" }),
    /unauthorized_client/,
  );
  assert.throws(
    () => validateAuthorizationInput({ ...base, redirectUri: "https://attacker.example/callback" }),
    /invalid_redirect_uri/,
  );
  assert.throws(
    () => validateAuthorizationInput({ ...base, resource: "https://attacker.example/mcp" }),
    /invalid_target/,
  );
});

test("Warlock OAuth enforces PKCE S256 and narrow scopes", () => {
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(pkceChallenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  assert.equal(normalizeOAuthScope(WARLOCK_OAUTH_SCOPE), WARLOCK_OAUTH_SCOPE);
  assert.equal(
    normalizeOAuthScope(WARLOCK_OAUTH_SCOPE + " offline_access"),
    WARLOCK_OAUTH_SCOPE + " offline_access",
  );
  assert.throws(() => normalizeOAuthScope("offline_access"), /required_scope_missing/);
  assert.throws(() => normalizeOAuthScope(WARLOCK_OAUTH_SCOPE + " admin"), /unsupported_scope/);
});

test("Warlock MCP challenges unauthenticated clients with OAuth resource metadata", () => {
  const challenge = warlockOAuthChallenge();
  assert.match(challenge, /resource_metadata=/);
  assert.match(challenge, new RegExp(WARLOCK_OAUTH_SCOPE.replace(":", "\\:")));
  assert.match(challenge, /error="invalid_token"/);

  const route = source("app/api/warlock/mcp/route.ts");
  assert.match(route, /isValidWarlockOAuthAccessToken/);
  assert.match(route, /warlockOAuthChallenge/);
  assert.match(route, /WARLOCK_MCP_ENABLED/);
  assert.match(route, /isWarlockOperatorRequest/);
});

test("OAuth endpoints are fail-closed and never alter commerce write mode", () => {
  const authorize = source("app/api/warlock/oauth/authorize/route.ts");
  const token = source("app/api/warlock/oauth/token/route.ts");
  const server = source("lib/warlock-mcp/server.ts");

  assert.match(authorize, /verifyWarlockOperatorKey/);
  assert.match(authorize, /CHATGPT_REDIRECT_URI/);
  assert.match(authorize, /codeChallenge/);
  assert.match(token, /exchangeWarlockAuthorizationCode/);
  assert.match(token, /refreshWarlockOAuthGrant/);
  assert.equal((server.match(/server\.registerTool\(/g) ?? []).length, 32);
  assert.equal((server.match(/_meta: \{ securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES/g) ?? []).length, 32);
  assert.doesNotMatch(server, /_registeredTools/);

  assert.doesNotMatch(authorize, /WARLOCK_COMMERCE_WRITE_MODE/);
  assert.doesNotMatch(token, /WARLOCK_COMMERCE_WRITE_MODE/);
});

test("OAuth persistence stores only token hashes and supports one-time codes", () => {
  const schema = source("prisma/schema.prisma");
  const store = source("lib/warlock-mcp-oauth-store.ts");

  assert.match(schema, /model WarlockOAuthCode/);
  assert.match(schema, /consumedAt\s+DateTime\?/);
  assert.match(schema, /model WarlockOAuthGrant/);
  assert.match(schema, /accessTokenHash\s+String\s+@unique/);
  assert.match(schema, /refreshTokenHash\s+String\s+@unique/);
  assert.match(schema, /operatorKeyFingerprint\s+String/);

  assert.match(store, /updateMany/);
  assert.match(store, /refreshTokenHash/);
  assert.match(store, /operatorKeyFingerprint/);
  assert.doesNotMatch(schema, /accessToken\s+String/);
  assert.doesNotMatch(schema, /refreshToken\s+String/);
});


test("Warlock serialized tools/list advertises OpenAI OAuth metadata at the root and compatibility mirror", async () => {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "warlock-auth-probe", version: "0.0.0" });
    server.registerTool(
      "auth_probe",
      { _meta: { securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES } },
      async () => ({ content: [{ type: "text", text: "ok" }] }),
    );
    return server;
  });
  const request = new Request("https://wizard-os.example/api/warlock/mcp", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });

  const raw = await handler.fetch(request);
  assert.equal(raw.status, 200);
  const response = await withWarlockOpenAiToolSecuritySchemes(raw);
  const body = await response.text();
  const dataLine = body.split("\n").find((line) => line.startsWith("data: "));
  const payload = dataLine ? JSON.parse(dataLine.slice(6)) : JSON.parse(body);
  const tools = payload?.result?.tools;

  assert.equal(Array.isArray(tools), true);
  assert.equal(tools.length, 1);
  assert.deepEqual(tools[0].securitySchemes, WARLOCK_TOOL_SECURITY_SCHEMES);
  assert.deepEqual(tools[0]._meta?.securitySchemes, WARLOCK_TOOL_SECURITY_SCHEMES);

  if (typeof handler.close === "function") await handler.close();
});

test("Warlock OpenAI compatibility shim also promotes JSON tools/list responses", async () => {
  const raw = new Response(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    result: { tools: [{ name: "get_product", _meta: {} }] },
  }), { headers: { "content-type": "application/json" } });

  const response = await withWarlockOpenAiToolSecuritySchemes(raw);
  const payload = await response.json();
  assert.deepEqual(payload.result.tools[0].securitySchemes, WARLOCK_TOOL_SECURITY_SCHEMES);
  assert.deepEqual(payload.result.tools[0]._meta.securitySchemes, WARLOCK_TOOL_SECURITY_SCHEMES);
});

test('required single-file descriptor survives serialized MCP transport and accepts resolved objects', async () => {
 const { attachProductFileShape, attachmentIntake } = await import('../lib/warlock-attachment.ts');
 let accepted=0;
 const handler=createMcpHandler(()=>{
  const server=new McpServer({name:'attachment-probe',version:'1'});
  server.registerTool('attach_product_file',{inputSchema:attachProductFileShape,_meta:{'openai/fileParams':['file']}},async input=>{
   const packageInput=attachmentIntake(input,{id:'p1',title:'Test'});accepted++;
   return {content:[{type:'text',text:JSON.stringify({role:packageInput.assets[0].role,fileId:packageInput.files[0].file_id})}]};
  });return server;
 });
 async function rpc(method,params) {
  const response=await withWarlockOpenAiToolSecuritySchemes(await handler.fetch(new Request('https://example.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})})));
  const body=await response.text();const line=body.split('\n').find(l=>l.startsWith('data: '));return JSON.parse(line?line.slice(6):body);
 }
 try {
  const descriptor=(await rpc('tools/list')).result.tools[0];
  assert.deepEqual(descriptor._meta['openai/fileParams'],['file']);
  assert.ok(descriptor.inputSchema.required.includes('file'));
  assert.equal(descriptor.inputSchema.properties.file.type,'object');
  assert.deepEqual(descriptor.inputSchema.properties.file.required,['download_url','file_id']);
  const args={productId:'p1',file:{download_url:'https://files.oaiusercontent.com/a',file_id:'file_a'},role:'master',confirmAttachment:true};
  const result=await rpc('tools/call',{name:'attach_product_file',arguments:args});
  assert.equal(result.result.isError,undefined);assert.equal(accepted,1);
  const broken=await rpc('tools/call',{name:'attach_product_file',arguments:{...args,file:'file_a'}});
  assert.ok(broken.error || broken.result?.isError);assert.equal(accepted,1);
 } finally {if(typeof handler.close==='function')await handler.close();}
});

test('placement calls return field-level validation before the SDK and valid six-size plans reach the handler',async()=>{
 const {placementShape}=await import('../lib/warlock-commerce/printful-placements.ts');
 const {placementValidationResponse}=await import('../lib/warlock-mcp/placement-validation.ts');
 let accepted=0;
 const handler=createMcpHandler(()=>{const server=new McpServer({name:'placement-probe',version:'1'});server.registerTool('preview_printful_placements',{inputSchema:placementShape},async input=>{accepted++;return {content:[{type:'text',text:JSON.stringify(input)}]};});return server;});
 const args={productId:'p',variants:Array.from({length:6},(_,i)=>({variantId:'v'+i,files:[{assetId:'back',type:'back',position:{area_width:3600,area_height:4800,width:3600,height:4800,top:0,left:0}},{assetId:'sleeve',type:'sleeve_right',position:{area_width:900,area_height:3600,width:900,height:3600,top:0,left:0}}]}))};
 const rpc={jsonrpc:'2.0',id:8,method:'tools/call',params:{name:'preview_printful_placements',arguments:args}};
 try {
  assert.equal(placementValidationResponse(rpc),null);
  const response=await handler.fetch(new Request('https://example.test/mcp',{method:'POST',headers:{'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify(rpc)}));
  const body=await response.text(),line=body.split('\n').find(l=>l.startsWith('data: ')),result=JSON.parse(line?line.slice(6):body);
  assert.equal(result.result.isError,undefined);assert.equal(accepted,1);
  assert.equal(JSON.parse(result.result.content[0].text).variants[0].files[0].position.limit_to_print_area,true);
  args.variants[0].files[1].type='right sleeve';args.variants[2].files[0].position.width='12 inches';
  const invalid=placementValidationResponse(rpc);
  assert.equal(invalid.result.isError,true);assert.equal(invalid.id,8);
  assert.deepEqual(invalid.result.structuredContent.fields.map(f=>f.field),['variants.0.files.1.type','variants.2.files.0.position.width']);
  assert.equal(accepted,1);
  assert.equal(placementValidationResponse({...rpc,params:{name:'apply_printful_placements',arguments:{}}}),null);
 }finally{await handler.close();}
});
