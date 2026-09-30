import { WARLOCK_TOOL_SECURITY_SCHEMES } from "../warlock-mcp-oauth.ts";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function promoteMessage(message: unknown): unknown {
  if (!isRecord(message) || !isRecord(message.result) || !Array.isArray(message.result.tools)) {
    return message;
  }

  const toolNames = message.result.tools
    .filter(isRecord)
    .map((tool) => typeof tool.name === "string" ? tool.name : "(unnamed)");
  console.info("Warlock MCP tools/list advertised", {
    count: toolNames.length,
    tools: toolNames,
    hasIntakeProduct: toolNames.includes("intake_product"),
  });

  return {
    ...message,
    result: {
      ...message.result,
      tools: message.result.tools.map((tool) => {
        if (!isRecord(tool)) return tool;
        const meta = isRecord(tool._meta) ? tool._meta : {};
        return {
          ...tool,
          // ChatGPT currently consumes this OpenAI extension at the tool root.
          securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES,
          // Keep the documented compatibility mirror for older clients.
          _meta: {
            ...meta,
            securitySchemes: WARLOCK_TOOL_SECURITY_SCHEMES,
          },
        };
      }),
    },
  };
}

export function promoteWarlockToolSecuritySchemes(payload: unknown): unknown {
  if (!Array.isArray(payload)) return promoteMessage(payload);

  const promoted = payload.map(promoteMessage);
  return promoted.some((entry, index) => entry !== payload[index]) ? promoted : payload;
}

function promoteEventStream(body: string) {
  let changed = false;
  const lines = body.split("\n").map((line) => {
    if (!line.startsWith("data: ")) return line;

    try {
      const payload = JSON.parse(line.slice(6)) as unknown;
      const promoted = promoteWarlockToolSecuritySchemes(payload);
      if (promoted === payload) return line;
      changed = true;
      return "data: " + JSON.stringify(promoted);
    } catch {
      return line;
    }
  });

  return changed ? lines.join("\n") : body;
}

function responseWithBody(response: Response, body: string, contentType?: string) {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  if (contentType) headers.set("content-type", contentType);
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function withWarlockOpenAiToolSecuritySchemes(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    let payload: unknown;
    try {
      payload = await response.clone().json();
    } catch {
      return response;
    }

    const promoted = promoteWarlockToolSecuritySchemes(payload);
    if (promoted === payload) return response;
    return responseWithBody(response, JSON.stringify(promoted), "application/json; charset=utf-8");
  }

  if (contentType.includes("text/event-stream")) {
    const body = await response.clone().text();
    const promoted = promoteEventStream(body);
    if (promoted === body) return response;
    return responseWithBody(response, promoted);
  }

  return response;
}
