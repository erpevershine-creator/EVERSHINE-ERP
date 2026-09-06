import { NextResponse, type NextRequest } from "next/server";
import { isLocalReview } from "./lib/policy";

// M1 deliberately exposes no real authentication or data API. Fail closed if hosted.
export function proxy(request: NextRequest) {
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
  return NextResponse.next();
}
export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
