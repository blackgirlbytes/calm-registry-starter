# Calm Registry

A mobile-first baby registry that builds itself from a short chat. Parents answer a few
tap-to-answer questions, get a full registry with products from Amazon, Walmart, and Target,
review it one category at a time, edit it in plain language, and share a link with family.

## Run locally

```bash
npm install
npm run dev
```

Every key is optional locally. Without them the app uses a scripted chat, sample products,
and stores data in `.data/registries.json`. See `.env.example` for all settings.

## Production (Vercel)

Supabase is required in deployed environments because Vercel's filesystem is read-only.

1. Apply `supabase/migrations/*.sql` to your Supabase project.
2. Set `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel.
3. Add the Vercel domains to Supabase Auth's redirect URLs so magic links work.
4. Optionally add `OPENAI_API_KEY` and retailer keys to replace the scripted chat and
   sample products.
