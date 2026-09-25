terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }

  backend "s3" {
    key     = "startup-template/terraform.tfstate"
    encrypt = true
    # bucket / region / dynamodb_table supplied via -backend-config, same
    # pattern as the aws-cert-lab repo's bootstrap — reuse that account's
    # state bucket + lock table rather than creating a new one per project,
    # if this project lives in the same AWS account.
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project_name
      ManagedBy = "terraform"
    }
  }
}
