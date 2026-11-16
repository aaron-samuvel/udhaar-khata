# Deploy Udhaar Khata with AWS SAM, write frontend/config.js, and upload the website to S3.
# Run from this folder in Windows PowerShell after `aws configure` (region ap-south-1).

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Assert-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "The '$Name' command was not found. See SETUP_WINDOWS.md for install steps, then open a new PowerShell window."
    }
}

Write-Host "Checking AWS CLI, SAM CLI, and credentials..." -ForegroundColor Cyan
Assert-Command aws
Assert-Command sam

$identity = aws sts get-caller-identity --output json | ConvertFrom-Json
if (-not $identity.Account) {
    throw "AWS credentials are not working. Run 'aws configure' and try again."
}
Write-Host ("Signed in as {0} (account {1})" -f $identity.Arn, $identity.Account)

Write-Host "`nBuilding the SAM application..." -ForegroundColor Cyan
sam build
if ($LASTEXITCODE -ne 0) { throw "sam build failed." }

Write-Host "`nDeploying the stack (udhaar-khata, region ap-south-1)..." -ForegroundColor Cyan
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset --capabilities CAPABILITY_IAM
if ($LASTEXITCODE -ne 0) { throw "sam deploy failed." }

Write-Host "`nReading stack outputs..." -ForegroundColor Cyan
$outputsJson = aws cloudformation describe-stacks --stack-name udhaar-khata --region ap-south-1 --query "Stacks[0].Outputs" --output json
$outputs = $outputsJson | ConvertFrom-Json
$map = @{}
foreach ($item in $outputs) {
    $map[$item.OutputKey] = $item.OutputValue
}

$apiUrl = $map["ApiUrl"]
$websiteUrl = $map["WebsiteUrl"]
$bucket = $map["WebsiteBucketName"]
$stateMachine = $map["StateMachineArn"]

if (-not $apiUrl -or -not $bucket) {
    throw "Could not find ApiUrl or WebsiteBucketName in the stack outputs."
}

$configPath = Join-Path $PSScriptRoot "frontend\config.js"
$configBody = "window.UDHAAR_API_URL = `"$apiUrl`";" + [Environment]::NewLine
[System.IO.File]::WriteAllText($configPath, $configBody)
Write-Host "Wrote $configPath"

Write-Host "`nUploading the frontend to s3://$bucket ..." -ForegroundColor Cyan
aws s3 sync (Join-Path $PSScriptRoot "frontend") "s3://$bucket" --region ap-south-1 --delete
if ($LASTEXITCODE -ne 0) { throw "aws s3 sync failed." }

Write-Host "`nDeployed." -ForegroundColor Green
Write-Host "Website:       $websiteUrl"
Write-Host "API:           $apiUrl"
Write-Host "Health check:  $apiUrl/health"
Write-Host "State machine: $stateMachine"
Write-Host ""
Write-Host "Open the website, add a couple of lines, then generate reminders (demo mode) or start the state machine in the AWS console with {""overdue_days"": 0}."
Write-Host "When judging is over, run .\teardown.ps1 so the public bucket and stack are removed."
