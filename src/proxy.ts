import { NextResponse, type NextRequest } from "next/server";
import { isLocalReview } from "./lib/policy";
import { updateSupabaseSession } from "./lib/supabase/proxy";

// Production remains closed until the Owner explicitly accepts and provisions Auth.
export async function proxy(request: NextRequest) {
  if (
    !isLocalReview(
      process.env.NODE_ENV,
      process.env.EVERSHINE_LOCAL_REVIEW,
      request.headers.get("host") ?? "",
    )
  ) {
    return new NextResponse(
      "EVERSHINE foundation review is available only through the local development launcher. Production authentication is not configured.",
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        },
      },
    );
  }
  const { response, userId } = await updateSupabaseSession(request);
  const authRequired = process.env.EVERSHINE_AUTH_REQUIRED === "1";
  const publicPath =
    request.nextUrl.pathname === "/login" ||
    request.nextUrl.pathname === "/recover" ||
    request.nextUrl.pathname === "/setup/owner";

  if (authRequired && !publicPath && !userId) {
    const target = request.nextUrl.clone();
    target.pathname = "/login";
    target.search = "";
    const redirect = NextResponse.redirect(target);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
