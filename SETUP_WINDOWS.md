# Set up and deploy Udhaar Khata on Windows

Follow these steps in order on your Windows PC. The whole path, including a first-time AWS account, is about **45–70 minutes**. If you already have an AWS account, AWS CLI, and SAM CLI, skip to step 5 and plan on **10–15 minutes**.

Region used by this project: **ap-south-1 (Mumbai)**.

You will be deploying this yourself. Do not share your access keys with anyone, and do not paste them into chat.

---

## 1. Create an AWS account (10–15 minutes, skip if you already have one)

1. Open [https://aws.amazon.com/](https://aws.amazon.com/) and choose **Create an AWS Account**.
2. Use your own email address and a strong password.
3. AWS will ask for a payment method to activate the account. This project is designed to stay inside the [AWS Free Tier](https://aws.amazon.com/free/) for light demo use, but a card is still required to open the account. You may see a small temporary authorisation on the card.
4. Complete the identity checks and wait until the console opens.

**Free-tier note:** Lambda, API Gateway, DynamoDB on-demand, S3, EventBridge Scheduler, and Step Functions all have free-tier or very low demo pricing. This app scales to zero: when nobody is using it, there is no Lambda compute and DynamoDB has no idle server. After judging, run `teardown.ps1` so you do not leave a public website sitting around.

---

## 2. Create an IAM user and access keys (5–8 minutes)

The root user should not be used for everyday deploy work.

1. Sign in to the [IAM console](https://console.aws.amazon.com/iam/).
2. Turn on MFA for the root user if AWS prompts you (recommended).
3. Go to **Users → Create user**.
4. Name the user `udhaar-khata-deploy`.
5. Choose **Provide user access to the AWS Management Console** only if you also want a console password. For deploy you mainly need **access keys**.
6. On the permissions step, attach the managed policy **AdministratorAccess**.

   This is the simplest option for a short student demo. It is a privileged key. After the hackathon, delete the access keys (or the user). Do not use this key for other projects long term.

7. Create the user, then open it and go to **Security credentials → Access keys → Create access key**.
8. Choose **Command Line Interface (CLI)** and confirm the warning.
9. Download or copy the **Access key ID** and **Secret access key** once. The secret is shown only at creation time.

If your account is in an organisation that forbids AdministratorAccess, you need at least permission to manage CloudFormation, IAM roles, Lambda, API Gateway, DynamoDB, S3, Step Functions, and EventBridge Scheduler in `ap-south-1`.

---

## 3. Install the tools (10–15 minutes)

Open **Windows PowerShell as your normal user** (not necessarily Administrator, unless winget asks for it).

### Option A — winget (preferred)

```powershell
winget install -e --id Amazon.AWSCLI
winget install -e --id Amazon.SAMCLI
winget install -e --id Python.Python.3.12
```

If `winget` is not recognised, install [App Installer from Microsoft](https://apps.microsoft.com/detail/9nblggh4nns3) first, or use option B.

### Option B — installers

- AWS CLI v2: [https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) (64-bit MSI)
- AWS SAM CLI: [https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
- Python 3.12: [https://www.python.org/downloads/windows/](https://www.python.org/downloads/windows/). In the installer, tick **Add python.exe to PATH**.

**Close PowerShell completely and open a new window** after the installs, so `aws`, `sam`, and `python` are on your PATH.

Check:

```powershell
aws --version
sam --version
python --version
```

You want AWS CLI 2.x, a recent SAM CLI, and Python 3.12 (3.11 or 3.13 will also package this project, because the Lambdas have no pip dependencies).

This project does **not** need Docker. `sam build` just copies the Python files.

---

## 4. Configure AWS CLI (2–3 minutes)

```powershell
aws configure
```

When prompted, enter:

- **AWS Access Key ID:** the IAM user key from step 2
- **AWS Secret Access Key:** the secret from step 2
- **Default region name:** `ap-south-1`
- **Default output format:** `json`

Then confirm who you are:

```powershell
aws sts get-caller-identity
```

You should see your 12-digit account ID and the IAM user ARN. If this fails, the key or region is wrong — do not continue until it works.

---

## 5. Deploy the app (5–8 minutes)

1. Unzip `udhaar-khata.zip` if you have not already, for example to `C:\Users\AARON\udhaar-khata`.
2. In PowerShell:

```powershell
cd C:\Users\AARON\udhaar-khata
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy.ps1
```

If Windows blocks the script, `Set-ExecutionPolicy -Scope Process` applies only to that window.

The script will:

1. Run `sam build`
2. Run `sam deploy` using `samconfig.toml` (stack name `udhaar-khata`, region `ap-south-1`)
3. Read the stack outputs
4. Write the live API URL into `frontend\config.js`
5. Upload the website with `aws s3 sync`

The first deploy can take a few minutes while CloudFormation creates the table, API, functions, state machine, schedule, and bucket.

At the end you will get:

- **Website** — an `http://...s3-website.ap-south-1.amazonaws.com` URL (S3 website hosting is HTTP, not HTTPS)
- **API** — an `https://...execute-api.ap-south-1.amazonaws.com` URL
- **State machine ARN** — used if you start a reminder run from the console

Open the website URL in Chrome or Edge.

---

## 6. Test the live app (5 minutes)

1. Visit `YOUR_API_URL/health` in the browser. You should see `{"ok": true, "service": "udhaar-khata", ...}`.
2. On the website, add:

   - `Ramesh took 2 kg rice for 120 rupees` (optional phone `9876543210` is fine for a demo)
   - `Ramesh paid 50`

   The customer card should show **₹70.00 due**.
3. Add `Amit ne 200 ka udhaar liya`.
4. Optionally use the microphone button in Chrome or Edge (the browser will ask for mic permission). The Web Speech API runs in the browser; nothing is sent to a paid speech service.

If the page shows “not connected to an API yet”, you opened `frontend\index.html` from disk instead of the S3 website URL, or `deploy.ps1` did not finish. Re-run the script and use the printed URL.

---

## 7. Run the Step Functions reminder workflow for the demo (3–5 minutes)

The EventBridge Scheduler rule starts this workflow every day at **9:00 AM India time**. That will not wait for your recording, so start one run yourself.

### Option A — from the website (fastest on camera)

1. Leave **Include today's dues (demo mode)** checked.
2. Click **Generate reminders**.
3. WhatsApp links should appear. The button starts the same Step Functions state machine, then reads the records it wrote.

### Option B — from the AWS console (good to show the architecture)

1. Open [Step Functions](https://ap-south-1.console.aws.amazon.com/states/home?region=ap-south-1#/statemachines) in **ap-south-1**.
2. Open the state machine named `udhaar-khata-reminders`.
3. Choose **Start execution**.
4. For the input, paste:

```json
{"overdue_days": 0}
```

   (`0` includes today's dues so the demo does not have to wait 7 days. A normal scheduled run uses 7 days, from the `OVERDUE_DAYS` parameter.)

5. Wait until the execution succeeds. You should see `reminders_written` in the output.
6. Refresh the website reminders list, or click **Generate reminders** only if you want a second run.

Do **not** actually message a real person. The WhatsApp links are click-to-chat URLs with a pre-filled reminder. There is no SMS or Amazon SES setup.

---

## 8. Record the demo and submit (15–25 minutes)

Follow `DEMO_SCRIPT.md`, then paste the write-up from `SUBMISSION.md` into the Builder Center form and add your public video link.

Challenge close: **16 November 2026, 1:00 PM Pacific Time**, which is **17 November 2026, 2:30 AM India time (Asia/Calcutta)**.

---

## 9. Tear down after judging (3–5 minutes)

Leave the stack up until judging is finished, then:

```powershell
cd C:\Users\AARON\udhaar-khata
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\teardown.ps1
```

Type `DELETE` when asked. The script empties the S3 bucket and deletes the CloudFormation stack (table, API, functions, state machine, schedule, bucket).

Also delete the IAM access keys you created for this project when you no longer need them.

---

## If something goes wrong

| Symptom | What to try |
|---|---|
| `aws` or `sam` is not recognised | Close PowerShell and open a new window. Confirm the tools are installed. |
| `aws sts get-caller-identity` fails | Re-run `aws configure`. Check the key and that the region is `ap-south-1`. |
| `sam deploy` fails on IAM | Your user needs permission to create roles. The demo uses AdministratorAccess for that reason. |
| Bucket already exists / name conflict | Bucket names are global. This template includes your account id. If a failed stack is stuck, in CloudFormation delete the `udhaar-khata` stack and deploy again. |
| S3 website is forbidden / 403 | Public bucket policies can be blocked by an account-level S3 setting or an organisation SCP. In that case you can still demo the API with `curl` or a local `index.html` after pasting the API URL into `frontend/config.js`, and mention the account restriction in the write-up. |
| Website loads but Add fails (CORS / network) | Confirm you used the URL printed by `deploy.ps1`, and that `frontend/config.js` on S3 contains the real API URL. |
| Mic button does nothing useful | Use Chrome or Edge, allow the microphone, or type the sentence. Firefox support for the Web Speech API is limited. |
| Reminders stay at zero | Add at least one **udhaar** line first. In demo mode, overdue days is 0. A scheduled run only includes dues older than 7 days. |

The Lambda code has no third-party packages, only the AWS runtime and `boto3`. There is nothing to pip-install on Windows for the deploy itself.
