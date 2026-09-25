# infra/ — what's Terraform here, and what deliberately isn't

Only AWS SES (domain identity + DKIM) is managed as Terraform in this template. That's a deliberate scope decision, not a gap to fill in later:

- **Vercel** — connect the GitHub repo via the Vercel dashboard once. Its own git integration handles preview/production deploys from then on; there's no ongoing infrastructure to declare.
- **Clerk** — create the application in the Clerk dashboard, copy the API keys into your env vars. A Terraform provider for Clerk exists but isn't worth reaching for at this stage — one-time dashboard setup, done.
- **Neon or Supabase** — same story: create the project in their dashboard, copy the connection string. Both have Terraform providers if you later want project creation itself to be code (useful once you're spinning up many projects/environments programmatically), but for a single founder's single project it's one click, not worth automating.

**A caveat on the one Terraform resource here that's less battle-tested**: `aws_sesv2_account_vdm_attributes` in `main.tf` (Virtual Deliverability Manager) is a newer resource in the AWS provider. I wrote it from what I know of the SESv2 API shape, but — same as everything AWS-registry-related in this template — I didn't have the ability to check it against the live Terraform Registry schema before handing this to you. `aws_ses_domain_identity` and `aws_ses_domain_dkim` are long-established and I'm confident in those; run `terraform plan` on the VDM resource first and check the [provider docs](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/sesv2_account_vdm_attributes) if it errors, or just delete that resource block if you'd rather skip it — it's a nice-to-have (bounce/complaint dashboard), not load-bearing.

## Using this

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars   # edit
terraform init -backend-config="bucket=..." -backend-config="region=..." -backend-config="dynamodb_table=..."
terraform apply
```

If this project lives in the same AWS account as your `aws-cert-lab` study repo, reuse that account's state bucket/lock table from `bootstrap/` rather than creating a new one — one state backend per AWS account is plenty.

After apply, create the DNS records from `terraform output ses_verification_record` and `terraform output dkim_records` at whatever DNS provider hosts your domain. SES domain verification can't be done by Terraform alone unless your DNS is also in Route 53.
