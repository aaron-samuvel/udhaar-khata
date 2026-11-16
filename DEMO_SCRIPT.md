# Demo video script (about 2 minutes 30 seconds)

Record a public video under **3 minutes**. A good target is **2:20–2:40**. Upload to YouTube as **Unlisted**, play it back once, then change the visibility to **Public** before you paste the link into the Builder Center **demo** field. Vimeo or Facebook is also allowed if the link opens without a login.

Do not add background music that could get the video blocked. Speak clearly, a little slower than usual. You do not need a face on camera; the screen plus your voice is enough.

## What you need before you press record

- The website from `deploy.ps1` open in **Chrome or Edge** (the S3 HTTP URL).
- A second tab with the AWS console already signed in, on **ap-south-1**:
  - Step Functions → state machine `udhaar-khata-reminders`
  - Optionally the architecture diagram `architecture.png` open in Photos, or the picture in this folder.
- Two or three sample lines ready (copy them to Notepad if you want):
  - `Ramesh took 2 kg rice for 120 rupees`
  - `Ramesh paid 50`
  - `Amit ne 200 ka udhaar liya`
- Optional: a demo phone such as `9876543210` (do not use a real customer number).
- Zoom the browser to about 125% so text is readable on a phone-sized playback.

If the ledger already has leftover demo rows from testing, that is fine. You can still add the lines above. If you want a clean first impression, start a reminder run only after the new lines appear.

## How to record on Windows

**Xbox Game Bar (easiest):** press `Win + Alt + R` to start and stop. Or press `Win + G` and use the Capture widget. Save the MP4 it writes under Videos/Captures.

**OBS Studio:** if you already have it, capture a single browser window, 1920×1080, 30 fps.

Then upload to YouTube, title it `Udhaar Khata — Weekend Challenge demo`, and set it public before submission.

## Shot list and narration

Times are a guide, not a stopwatch test. If you run long, cut shot 6 first, not the live add-and-remind path.

### Shot 1 — Title and problem (0:00–0:20)

Show the Udhaar Khata website header, or a close zoom on the title.

**Say:**

> Millions of kirana shops in India still track customer credit — udhaar — in a paper notebook. A typical line is “Ramesh took 2 kg rice for 120 rupees,” and later “Ramesh paid 50.” This project, Udhaar Khata, is that notebook as a serverless app. There is no server to babysit and no pipeline to maintain.

### Shot 2 — Architecture (0:20–0:45)

Show `architecture.png` full screen, and point with the cursor as you name the path.

**Say:**

> The shopkeeper opens a static website on Amazon S3. The page calls an API Gateway HTTP API. A Python Lambda parses the sentence and writes to a single on-demand DynamoDB table. Once a day, EventBridge Scheduler starts a Step Functions workflow. That workflow runs a second Lambda, which writes reminder records and returns WhatsApp click-to-chat links. When nobody is using it, compute scales to zero.

### Shot 3 — Add an udhaar line (0:45–1:15)

Back on the website. Type (do not paste if you can type cleanly)  
`Ramesh took 2 kg rice for 120 rupees`.  
Optionally fill the phone box. Click **Add**.

**Say:**

> I type the line the way a shopkeeper would write it. The API parses the name, the amount, and the type with a small keyword parser — English and Hinglish words like liya, diya, and udhaar. No paid AI service is involved. Ramesh now owes 120 rupees.

If you want to show the microphone, click it, allow the mic, and speak a short line. If it fails, type instead and keep going; do not spend time debugging on camera.

### Shot 4 — Record a payment (1:15–1:30)

Type `Ramesh paid 50`. Click **Add**. Click the Ramesh card so the history is visible.

**Say:**

> Now a payment of 50 rupees. The balance drops to 70, and both lines stay in his khata. DynamoDB holds the running balance and the transaction history in one table.

### Shot 5 — Hinglish line (1:30–1:45)

Type `Amit ne 200 ka udhaar liya`. Click **Add**.

**Say:**

> The same parser accepts Hinglish, so this is also a credit entry, this time for Amit.

### Shot 6 — Step Functions reminder (1:45–2:15)

Two acceptable ways; pick one so you do not go over time.

**Preferred for craft:** switch to the Step Functions console, click **Start execution**, paste `{"overdue_days": 0}`, start it, wait for the green success, open the output so `reminders_written` is visible. Then switch back to the website and refresh or click **Generate reminders** only if the list has not updated (the console run already wrote the records; a refresh of the page, or a second Generate, is enough — if you click Generate again you will write a second set, which is fine).

Simpler path: stay on the website, leave **Include today's dues** checked, click **Generate reminders**, and when the links appear, say that this button starts the same state machine.

**Say:**

> A scheduled Step Functions run would normally remind only dues older than seven days, every morning at 9 India time. For the demo I start that same workflow with overdue days set to zero. It writes reminder records and builds a WhatsApp link — not an SMS, so there is no sandbox setup. I can open the chat template for Ramesh, but I am not sending a real message.

Hover or briefly click the WhatsApp link if you want, then close the tab if WhatsApp opens.

### Shot 7 — Close (2:15–2:30)

Show the website and, if there is time, a glance back at the architecture diagram.

**Say:**

> The entire stack is one AWS SAM template. Deploy is a single PowerShell script; teardown is another. While idle, the app scales to zero. That is Udhaar Khata — a small, working khata for a kirana shop, shipped without a pipeline.

Stop the recording.

## Quick checks before you upload

- The video is under 3:00.
- The website and a successful add are actually on screen, not only described.
- The architecture is shown, not only mentioned.
- A reminder or Step Functions execution is visible.
- You did not show AWS access keys, account numbers more than briefly, or anyone's real phone number.
- The YouTube (or other) link is **public** and plays without a login.

If a live call fails during the recording, pause, fix it, and re-record from the start of that shot. A clean 2-and-a-half-minute take is stronger than a long recovery.
