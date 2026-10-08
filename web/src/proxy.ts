import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Only stops the dashboard from flashing for signed-out visitors. The API is the real check:
// a stale cookie still gets here, /api/v1/me answers 401 and the topbar sends the user to /login.
export function proxy(request: NextRequest) {
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [{ source: "/app/:path*", missing: [{ type: "cookie", key: "nyx_session" }] }],
};
