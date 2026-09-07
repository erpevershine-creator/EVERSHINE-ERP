type PublicSupabaseEnvironment = {
  url: string;
  publishableKey: string;
};

function required(name: string, value: string | undefined) {
  if (!value) {
    throw new Error(
      `Missing ${name}. Start local Supabase, then run npm run supabase:env.`,
    );
  }
  return value;
}

export function hasPublicSupabaseEnvironment() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function getPublicSupabaseEnvironment(): PublicSupabaseEnvironment {
  return {
    url: required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    publishableKey: required(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    ),
  };
}

export function getSupabaseSecretKey() {
  return required("SUPABASE_SECRET_KEY", process.env.SUPABASE_SECRET_KEY);
}
