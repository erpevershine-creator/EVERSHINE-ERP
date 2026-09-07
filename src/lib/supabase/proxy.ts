import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  getPublicSupabaseEnvironment,
  hasPublicSupabaseEnvironment,
} from "./env";

export async function updateSupabaseSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasPublicSupabaseEnvironment()) return { response, userId: null };

  const { url, publishableKey } = getPublicSupabaseEnvironment();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validating claims also refreshes an expiring session cookie when needed.
  const { data } = await supabase.auth.getClaims();
  return { response, userId: data?.claims?.sub ?? null };
}
