import { WARLOCK_TOOL_SECURITY_SCHEMES } from "../warlock-mcp-oauth";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function promoteMessage(message: unknown): unknown {
  if (!isRecord(message) || !isRecord(message.result) || !Array.isArray(message.result.tools)) {
    return message;
  }

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

export async function withWarlockOpenAiToolSecuritySchemes(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  let payload: unknown;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }

  const promoted = promoteWarlockToolSecuritySchemes(payload);
  if (promoted === payload) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("content-type", "application/json; charset=utf-8");

  return new Response(JSON.stringify(promoted), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
