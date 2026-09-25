# Startup architecture: cheap, automated, scalable, solo-dev-fast

This is a different design brief from the AWS cert lab, and it should produce a different answer — not just the same stack with AWS swapped out. The cert lab optimized for *AWS surface area* (touch as many real services as possible, tolerate manual steps, treat a few dollars a month as fine). A startup optimizes for *time-to-market and founder time*, treats operational toil as the enemy, and needs a cost curve that starts near zero and rises with revenue, not with calendar time.

## Direct answers first

**Would I still recommend a static frontend?** No. Static-export-to-S3 was the right call for the cert lab specifically because it kept the AWS surface area simple while you were learning API Gateway/Lambda from scratch. For a real product you want Next.js running as a full server app — Server Components, Server Actions, and API routes colocated with your UI, SSR for anything that needs to be dynamic or indexable, middleware for auth gating. Splitting frontend and backend into separately-deployed static+API pieces was a deliberate simplification for a study project; for a startup it's just two things to coordinate instead of one, with no offsetting benefit once you're not specifically trying to minimize Lambda/API-Gateway complexity.

**What frontend framework?** Next.js (App Router) + TypeScript + Tailwind, same family as before — it's still the strongest solo-dev choice in 2026: biggest ecosystem, first-class deployment story (see hosting below), and the AI-assisted-coding tooling landscape is deepest here, which matters when you're one person. Add **shadcn/ui** on top — it's not a component library you install as a dependency, it's a CLI that copies accessible, pre-styled Tailwind components directly into your repo for you to own and modify. For a solo founder, this alone probably saves weeks versus building a design system from scratch, and it's become close to a default choice in the current Next.js ecosystem for exactly this reason.

## The stack

| Layer | Recommendation | Why |
|---|---|---|
| Frontend + backend | **Next.js (App Router), TypeScript, Tailwind, shadcn/ui** — one deployable app, not split services | Colocated UI + Server Actions = fastest possible solo iteration loop |
| Hosting/deploy | **Vercel (Pro plan)** | Best Next.js support (they built it), git-push deploys, automatic PR preview environments with zero pipeline code |
| Database | **Neon** (serverless Postgres) | True scale-to-zero compute, instant copy-on-write branching per PR — a better fit for your GitOps ask than anything in the cert-lab repo |
| Auth | **Clerk** | Free tier explicitly permits production/commercial use up to 50,000 monthly users, prebuilt UI, minutes to integrate |
| File storage | **Cloudflare R2** | S3-compatible API, **zero egress fees** — S3's egress pricing is a real, well-known cost trap for anything serving files to users |
| Transactional email | **AWS SES** | This is the one place AWS genuinely wins on price — $0.10 per 1,000 emails, cheaper than every mainstream competitor at any real volume |
| Background jobs/cron | **Inngest** or **Trigger.dev** | Managed event-driven job execution built for exactly this serverless-Next.js niche; avoids hand-rolling SQS+Lambda for what's usually a handful of async tasks (welcome emails, webhooks, scheduled digests) |
| Payments | **Stripe** | Not asked for directly, but every startup needs it eventually — pure usage-based pricing, no fixed cost until you have revenue |
| IaC | **Terraform**, spanning Vercel/Neon/Cloudflare/AWS providers | Same tool you already know; Terraform's multi-provider model is exactly built for "not one cloud, several managed services" |

Notice what's *not* here: no EC2, no ECS/Fargate, no VPC, no Kubernetes, no self-hosted database, no self-hosted queue. Every single piece is either fully managed with consumption pricing, or (Vercel Pro, Clerk beyond free tier) a flat low monthly fee. That's deliberate — a solo founder's scarcest resource is attention, and every one of those AWS-native alternatives is something you'd otherwise be patching, monitoring, or paging yourself about.

## Why not the cert-lab stack (DynamoDB, Cognito, Lambda+API Gateway) for this?

Worth being explicit, since you might reasonably ask "why change the plan now." Three reasons:

1. **You don't know your data's access patterns yet.** DynamoDB rewards you for knowing your query patterns up front and punishes you badly for guessing wrong (re-modeling a live DynamoDB table's key schema is genuinely painful). A pre-product-market-fit startup's schema is going to change under you repeatedly. Postgres lets you `ALTER TABLE` and write an ad hoc query when you need one; that flexibility is worth far more than DynamoDB's superior raw scalability at a stage where you have zero users to scale for.
2. **Vercel + Neon's local dev story is strictly better than the cert lab's.** Local Postgres via Docker is a faithful, zero-drama stand-in for Neon (it's the same database engine) — no LocalStack-style emulation gaps, no "Cognito doesn't emulate well locally" caveat like you ran into before.
3. **Time-to-first-user beats theoretical scale.** Lambda+API Gateway+Cognito is real, valuable AWS knowledge (and you now have it, from the cert lab) — but it's also more moving parts to wire correctly than a solo founder needs before knowing if anyone wants the product at all. Reach for it later, specifically once you understand why (see "graduating" below), not by default.

## What this actually costs

Two honest numbers, since "very cheap" needs a figure to mean anything, and per your instruction I'm not leaning on any free tier that restricts commercial use (Vercel Hobby doesn't count for that reason — Pro is the real starting price):

**At zero/near-zero traffic (pre-launch, building in public, a handful of test users):**
- Vercel Pro: $20/month (flat, one seat)
- Neon: free tier likely covers this (0.5GB storage, 100 compute-hours/month, scale-to-zero) — realistically $0
- Clerk: $0 (well under 50,000 MAU)
- Cloudflare R2: effectively $0 at low storage/request volume
- AWS SES: a few cents (transactional email volume is tiny pre-launch)
- **Total: ~$20/month**, almost entirely the one flat Vercel fee.

**With real early traction (a few thousand active users, meaningful but not venture-scale traffic):**
- Vercel Pro: still $20/month base + modest usage overage, likely well under $50/month total at this scale
- Neon: graduates to Launch plan, $0.14/CU-hour + $0.35/GB-month — realistically $15–40/month depending on how much you're actually querying
- Clerk: still likely $0 (50,000 MAU is a lot of users for "early traction")
- R2/SES: still single-digit dollars
- **Total: roughly $50–120/month** — genuinely cheap for a startup with real users, and every line item is consumption-based, so it tracks usage rather than jumping in step-function increments.

Compare that to provisioning even minimal always-on AWS infrastructure (a small RDS instance, an ECS service, a NAT Gateway) for the same "not much traffic yet" stage, which easily clears $100+/month before a single user shows up, for capacity you don't need yet.

## How this scales, and when to reach for something else

The point of this stack isn't that it scales forever without change — it's that it scales *smoothly through the range where a solo founder actually lives*, and each individual piece has a well-understood "next step" rather than a rewrite:

- **Neon**: Launch → Scale plan, then read replicas, then (if you're truly at a scale where Postgres itself is the bottleneck) sharding or a move to RDS/Aurora with more manual tuning control. Most startups never need to leave this ladder.
- **Vercel**: scales its own infrastructure transparently; the founder-relevant limit is cost, not capability — at meaningful scale you'd evaluate whether self-managing on Fly.io/Railway/AWS Fargate becomes cheaper than Vercel's margin, which is a "good problem," not an urgent one.
- **Clerk**: usage-based pricing beyond 50,000 MAU, no re-architecture needed — it scales by billing, not by you doing anything.
- **The monolith itself**: this is the one that takes founder judgment, not vendor upgrade. When a specific piece of the app genuinely needs independent scaling, a different language, or a separate deploy cadence from the rest (a heavy background-processing pipeline is the classic case), *that* piece graduates into its own service on Fly.io/Railway or AWS Fargate — not the whole app, not preemptively, and not because "microservices are more scalable" in the abstract. This is the same "add complexity when you feel the pain" philosophy the cert-lab roadmap used, applied to product architecture instead of AWS services.
- **Where AWS specifically re-enters**: SES from day one (it's just cheaper); S3+Athena/Glue if you end up with real data/analytics workloads; and the full AWS toolkit becomes relevant again if/when an enterprise customer's procurement process specifically requires "hosted on a major cloud" for compliance reasons — a real, common reason mid-stage startups end up back on AWS/GCP/Azure regardless of what they'd otherwise choose.

## GitOps, local dev, and repeatable scaffolding

The same GitOps shape from the cert lab still applies, it's just implemented differently because most of these vendors *are* the GitOps pipeline rather than something you build in GitHub Actions on top of them:

- **PR → automatic preview deployment.** Vercel's GitHub integration does this natively — every PR gets a live URL with zero workflow YAML. Pair it with a Neon branch per PR (Neon's GitHub integration can create one automatically) so each preview also gets its own isolated, real Postgres branch — this is the actual realization of "PR triggers a test environment" that the cert lab approximated with `terraform-plan.yml` and a manual test environment.
- **Merge to `main` → production deploy.** Also native to Vercel's git integration — no separate `terraform-apply` workflow needed for the app itself.
- **What GitHub Actions is still for**: the things that aren't "deploy this app" — lint/typecheck/unit tests gating the PR before Vercel even builds it, database migrations (run via a workflow step, not implicitly on deploy, so a bad migration doesn't silently run against prod), and whatever Terraform *is* managing (Neon project/org-level settings, the R2 bucket, the SES domain identity) via the same plan-on-PR/apply-on-merge pattern you already know.
- **Local dev**: `next dev` against a local Postgres in Docker Compose (schema-identical to Neon since it's the same engine — no emulation gap), Clerk and Stripe both provide real sandbox/test-mode keys for local use (network calls to a real, free sandbox rather than trying to emulate them), and R2 can be swapped for a local MinIO container if you want fully offline storage dev, or just pointed at a real (free, no-egress-cost) R2 dev bucket.

**Repeatable project scaffolding**: build this once as an actual template repository (a pnpm/Turborepo monorepo — `apps/web` for the Next.js app, `packages/db` for the Drizzle ORM schema+client shared between local and deployed environments, `infra/` for the Terraform pieces that need it, `docker-compose.yml` for local Postgres, `.github/workflows/ci.yml` for the lint/typecheck/test gate) and use it as a **GitHub template repo** — "Use this template" gives you a fresh, fully-structured new project in under a minute for the next idea, which is exactly the "minimize startup time across projects" goal. I'd suggest we build this together as a follow-up once you've had a chance to react to the vendor choices above — a couple of them (Neon vs. Supabase, Clerk vs. rolling your own) are close calls where your preference should drive the default, and locking in a template before that would mean redoing it.

Sources for the pricing figures above:
- [Vercel Pricing](https://vercel.com/pricing)
- [Neon Pricing](https://neon.tech/pricing)
- [Clerk Pricing](https://clerk.com/pricing) and [Clerk pricing analysis confirming free-tier production use](https://supertokens.com/blog/clerk-pricing-the-complete-guide)
- [Cloudflare R2 Pricing](https://egresscost.com/cloudflare/)
- [Amazon SES Pricing](https://aws.amazon.com/ses/pricing/)
