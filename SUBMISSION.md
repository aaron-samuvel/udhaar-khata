# Submission write-up (paste into AWS Builder Center)

Use the title, tagline, and body below. After you upload the demo, add the public video URL in the **demo** field. Do not invent metrics, screenshots, or a video link that is not yours.

**Suggested tags / services:** AWS Lambda, Amazon API Gateway, Amazon DynamoDB, Amazon S3, AWS Step Functions, Amazon EventBridge Scheduler, AWS SAM

---

## Title

Udhaar Khata — a serverless credit ledger for kirana shops

## Tagline

A shopkeeper types or speaks one plain sentence. The khata updates. Overdue dues get a WhatsApp reminder link. No servers, no pipeline, idle cost near zero.

---

## The problem I picked

Millions of kirana stores across India still keep customer credit — *udhaar* — in a paper notebook or in a shopkeeper's head. A typical line is informal: “Ramesh took 2 kg rice for 120 rupees,” later “Ramesh paid 50.” That book is easy to lose, hard to total, and easy to forget when someone has an old balance.

I wanted a weekend-sized tool that feels like that notebook, not like an accounting product, and that a shopkeeper could try from a phone browser without installing an app or leaving a server running.

## What the build does

Udhaar Khata is a serverless ledger:

- The shopkeeper types (or dictates) a sentence in English or Hinglish, for example `Ramesh took 2 kg rice for 120 rupees`, `Ramesh paid 50`, or `Amit ne 200 ka udhaar liya`.
- A Lambda function parses the sentence with a small keyword and regex routine (no paid AI API). It pulls out the customer, the amount, and whether the line is new credit (*udhaar* / *liya* / *took*) or a payment (*paid* / *diya*).
- The running balance and the immutable transaction line are stored in a single on-demand DynamoDB table.
- The phone-friendly website, hosted on S3, shows each customer's balance and khata history.
- Once a day, EventBridge Scheduler starts a Step Functions workflow. A reminders Lambda finds customers whose dues are older than N days (7 by default), writes a reminder record, and returns a WhatsApp click-to-chat link with a pre-filled message. There is no SMS or Amazon SES, so nothing has to leave the sandbox.

Optional voice input uses the browser's Web Speech API. Speech stays in the browser.

## How it works (services and how they connect)

```
Browser  →  Amazon S3 website (static HTML/JS)
Browser  →  Amazon API Gateway HTTP API  →  AWS Lambda (API)  →  Amazon DynamoDB
Amazon EventBridge Scheduler (daily 9:00 AM Asia/Kolkata)
         →  AWS Step Functions  →  AWS Lambda (reminders)  →  Amazon DynamoDB
```

- **Amazon S3** hosts a single-page frontend (website hosting). After deploy, a short PowerShell script writes the live API URL into `config.js` and syncs the files. There is no CloudFront, no application server, and no build pipeline.
- **Amazon API Gateway** (HTTP API, CORS enabled) is the only public backend. Routes cover health, adding a transaction, listing customers, listing a customer's lines, listing reminders, and starting a reminder run.
- **AWS Lambda** (Python 3.12, `boto3` only, no third-party packages) runs the API and the reminder task. Idle concurrency is zero.
- **Amazon DynamoDB** is a single table with on-demand billing. Customer balances live under `SHOP#… / CUST#…`. Transaction lines live under `CUST#… / TXN#…`. Reminder records live under `SHOP#… / REM#…`.
- **AWS Step Functions** is a one-state Standard workflow that invokes the reminders Lambda, with retries on Lambda service errors. For the demo you can start an execution with `{"overdue_days": 0}` so today's dues are included; the scheduled run uses 7 days.
- **Amazon EventBridge Scheduler** (not a long-running clock on a server) fires that state machine every day at 9:00 AM India time.

The whole stack is one AWS SAM template (`template.yaml`) plus `samconfig.toml`. `deploy.ps1` runs `sam build`, `sam deploy`, fills in the frontend config, and uploads the site. `teardown.ps1` empties the bucket and deletes the stack.

See `architecture.png` for the diagram.

## Scale to zero and cost

When nobody is typing into the khata, Lambda is not running, the HTTP API is not processing requests, and the Step Functions workflow is not executing. DynamoDB is on-demand, so you pay for the reads and writes you actually make, not for a provisioned database server. The daily schedule starts a short execution and then stops. That is the point of the weekend challenge: no server to babysit, and close to nothing while idle. Light demo traffic is intended to stay within AWS Free Tier usage.

This is a public demo API with no sign-in, so it is not meant for real customer data.

## SAM reuse pattern

The reusable piece is not the kirana wording; it is the shape:

1. A tight SAM template that wires HTTP API + Lambda + a single-table DynamoDB design + an S3 website bucket.
2. A Step Functions task started by EventBridge Scheduler for “work that should happen once a day,” with the same task also startable from the API for a live demo.
3. A frontend that is only static files, with the API URL injected after deploy instead of baked in at build time.
4. Python 3.12 Lambdas with no dependencies, so `sam build` does not need Docker and a Windows laptop can ship the stack with one script.

Someone else can keep the template and swap the parser and the reminder message for a different notebook-style workflow (clinic dues, tuition instalments, a society maintenance book) without standing up a pipeline.

## What I would do next

- Add authentication (Amazon Cognito or an API key) and one shop login per owner, so the API is not public.
- Put CloudFront with HTTPS in front of the S3 website (S3 website hosting is HTTP only).
- Let the owner edit a typo and record a phone number more carefully, and optionally send reminders on a chosen weekday only.
- If the parser needs to grow, add a second path that uses a model — but the weekend version is deliberately a local parser so the demo has no extra account, key, or bill.

## Built with

AWS SAM, AWS Lambda (Python 3.12), Amazon API Gateway HTTP API, Amazon DynamoDB, Amazon S3, AWS Step Functions, Amazon EventBridge Scheduler. Developed for a Windows deploy using AWS CLI v2 and SAM CLI.
