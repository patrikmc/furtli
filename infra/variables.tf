variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "project_name" {
  type = string
}

variable "ses_domain" {
  description = "Domain to send transactional email from, e.g. \"mail.yourstartup.com\". Using a subdomain (rather than your root domain) is the usual pattern — it isolates your sending reputation from anything else on the root domain."
  type        = string
}
