# Udhaar Khata

A serverless credit ledger for Indian kirana shops, built for the AWS Builder Center weekend challenge **No Pipeline, No Problem**.

A shopkeeper types or speaks a sentence such as `Ramesh took 2 kg rice for 120 rupees` or `Ramesh paid 50`. The API parses it, stores the khata in DynamoDB, and a daily Step Functions workflow prepares WhatsApp reminder links for overdue dues.

There is no application server and no CI pipeline. The stack is one AWS SAM template. Compute scales to zero when idle.

## What is in this folder

| Path | Purpose |
|---|---|
| `template.yaml` | SAM / CloudFormation stack |
| `samconfig.toml` | Default stack name `udhaar-khata`, region `ap-south-1` |
| `src/` | Python 3.12 Lambda code (`boto3` only) |
| `frontend/` | Static website (upload to S3 after deploy) |
| `deploy.ps1` / `teardown.ps1` | Windows deploy and cleanup |
| `architecture.png` | Service diagram for the submission |
| `SETUP_WINDOWS.md` | Beginner install and deploy steps |
| `SUBMISSION.md` | Ready-to-paste write-up |
| `DEMO_SCRIPT.md` | 2.5-minute video shot list |
| `tests/` | Parser and handler unit tests |

## Deploy on Windows

Follow **SETUP_WINDOWS.md**. The short version, after AWS CLI and SAM CLI are configured for `ap-south-1`:

```powershell
cd path\to\udhaar-khata
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy.ps1
```

Open the website URL the script prints. After judging, run `.\teardown.ps1`.

## Local tests

These were already run when this kit was assembled. To run them again you need Python 3 and `pytest` plus `moto`:

```text
pip install -r requirements-dev.txt
pytest -q
```
