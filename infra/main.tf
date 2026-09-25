# This file deliberately only covers AWS SES. Per docs/ALTERNATIVE-SERVICES
# in the aws-cert-lab repo and the startup architecture recommendation this
# template implements: Vercel, Clerk, and Neon/Supabase are dashboard/git-
# integration-first for a solo founder — none of them need Terraform to get
# working, and forcing IaC onto them for its own sake isn't worth the extra
# moving parts at this stage. SES is the one piece that's genuinely AWS and
# genuinely worth managing as code.

resource "aws_ses_domain_identity" "this" {
  domain = var.ses_domain
}

resource "aws_ses_domain_dkim" "this" {
  domain = aws_ses_domain_identity.this.domain
}

# After apply, create the DNS records `ses_verification_record` and
# `dkim_records` (below) print at whatever registrar/DNS provider you use
# for this domain (Route 53, Cloudflare DNS, etc.) — SES domain verification
# is DNS-based and isn't something Terraform can do for you unless your DNS
# is also in Route 53 and managed here, which most solo-founder setups
# won't have yet.

resource "aws_sesv2_account_vdm_attributes" "this" {
  # Enables the newer SESv2 "Virtual Deliverability Manager" dashboard
  # (bounce/complaint tracking) at no extra cost — worth turning on from day
  # one rather than only discovering it exists after a deliverability
  # problem.
  dashboard_attributes {
    engagement_metrics = "ENABLED"
  }
  guardian_attributes {
    optimized_shared_delivery = "ENABLED"
  }
}
