

What is pnpm, and how does it differ from npm? 
Are the tools used interchangeably? 

NextJS Telemetry opt out
pnpm exec next telemetry disable

How can I develop locally without a Clerk integration? 
That way, the work will go faster. I can have an assumed identity of a test-user that is created locally.

Explain different testing hierarchies, and tooling for each use case

Database UI tool for running locally.


## Testing
Where is the testing db created when I run? 
pnpm --filter db db:test:setup


## Workflow
- Add a new screen, or change navigation
- Design changes across multiple screens
- Managing a Database change, or introducing a new table with migrations, seeding new data, running tests
- Extending the database code with the ORM for new database change? 
- Creating tests around the new database content
- How to build and commit code in a Github workflow, branching strategy and so
- Setting up and using PRs and commit workflow with Github
- Build pipelines to build on PRs, run tests, run integration tests
- Agentic development workflow (how to use agents, where and how to include them)
- Tasks and Tracking (How and where should I track the development, where should I track issues, where should I manage the project and ideation)
- Analytics and user tracking for the project
- FinOps - Cost projects of running the system in Vercel

## Tracking and organizing
- Organisation for tracking all the project specifics, and learning targets
    Projects: QuizApp, Terraform, AWS, NextJs, Agentic Development, AI


## Learning and testing
- Run local toy example
- Register Neon Database

- Explore Next.JS and sample code organization (what is what)
- Explore NEON
- Explore Vitest
- Explore Playwright test
- Explore integration tests
- Explore Vercel and deployment

### AWS
- Play around with the AWS console
- Play around with Terraform 
- Create account and IAM policy
- Deploy code on AWS and setup Terraform


## Deploy ready
- Integrate a tool for troubleshooting like datadog / posthog
- Integrate with Amazon SES for email sending
- Register a testing domain


## Company
- Where and how to leverage AI for building and running the company
- Adding agents that are specializing in particular tasks
- Setup company emails and information
- 