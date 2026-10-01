import type { NextRequest } from "next/server";

function firstHeaderValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() || "";
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  try {
    const supplied = new URL(origin);
    const expectedHost = firstHeaderValue(request.headers.get("x-forwarded-host"))
      || request.headers.get("host")
      || request.nextUrl.host;
    const forwardedProtocol = firstHeaderValue(request.headers.get("x-forwarded-proto"));
    const expectedProtocol = forwardedProtocol ? `${forwardedProtocol}:` : request.nextUrl.protocol;
    return supplied.host === expectedHost && supplied.protocol === expectedProtocol;
  } catch {
    return false;
  }
}
