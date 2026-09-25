output "ses_verification_record" {
  description = "Create a TXT record: name = _amazonses.<ses_domain>, value = this."
  value       = aws_ses_domain_identity.this.verification_token
}

output "dkim_records" {
  description = "Create three CNAME records: name = <token>._domainkey.<ses_domain>, value = <token>.dkim.amazonses.com, one per token below."
  value       = aws_ses_domain_dkim.this.dkim_tokens
}
