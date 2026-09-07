import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getPublicSupabaseEnvironment,
  getSupabaseSecretKey,
} from "./env";

export function createAdminClient() {
  const { url } = getPublicSupabaseEnvironment();
  return createClient(url, getSupabaseSecretKey(), {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}
