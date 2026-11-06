# تركي آل الشيخ - Turki Al Alshikh

صفحة ويب عربية RTL قابلة للنشر تعرض الحساب الرسمي لتركي آل الشيخ، مع المنشورات والصور والتفاعلات.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/turki-official-page run dev` — run the public page
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/turki-official-page/src/` — deployable Arabic RTL public page
- `artifacts/turki-official-page/public/images/` — profile and cover images
- `artifacts/api-server/src/` — shared API server
- `lib/api-spec/openapi.yaml` — source of truth for API contracts

## Architecture decisions

- The first publish is a presentation-first static web app; visitor interactions are local UI state.
- The deployable page lives at the root preview path `/`.
- Arabic RTL layout and the supplied profile imagery are preserved from the approved mockup.

## Product

- Responsive official profile page for desktop and mobile
- Posts, photos, videos, about tabs, search, follow, likes, comments, and sharing
- Arabic metadata and social preview information

## User preferences

- Preserve the Arabic RTL identity and existing content.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
