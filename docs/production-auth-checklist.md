# Production Auth Checklist

## Vercel
- Add NEXT_PUBLIC_SUPABASE_URL
- Add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- Redeploy Preview/Production

## Supabase Auth
- Site URL: Vercel production URL
- Redirect URL: /auth/callback
- Verify email OAuth callbacks

## E2E
- Run: npm run test:e2e
- Validate supplier route permission flow
