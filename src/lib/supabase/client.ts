"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseEnvironment } from "./env";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (client) return client;
  const { url, publishableKey } = getPublicSupabaseEnvironment();
  client = createBrowserClient(url, publishableKey);
  return client;
}
