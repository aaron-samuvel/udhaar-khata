# Empty the website bucket and delete the Udhaar Khata stack.
# This is irreversible. Ledger data in DynamoDB is deleted with the stack.

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    throw "The 'aws' command was not found. Open a new PowerShell window after installing AWS CLI."
}
if (-not (Get-Command sam -ErrorAction SilentlyContinue)) {
    throw "The 'sam' command was not found. Open a new PowerShell window after installing SAM CLI."
}

Write-Host "This will delete the udhaar-khata stack, its DynamoDB table, and the public website bucket." -ForegroundColor Yellow
$confirm = Read-Host "Type DELETE to continue"
if ($confirm -ne "DELETE") {
    Write-Host "Cancelled."
    exit 0
}

$bucket = aws cloudformation describe-stacks --stack-name udhaar-khata --region ap-south-1 --query "Stacks[0].Outputs[?OutputKey=='WebsiteBucketName'].OutputValue" --output text 2>$null
if ($bucket -and $bucket -ne "None") {
    Write-Host "Emptying s3://$bucket ..."
    aws s3 rm "s3://$bucket" --recursive --region ap-south-1
}

Write-Host "Deleting the SAM / CloudFormation stack..."
sam delete --stack-name udhaar-khata --region ap-south-1 --no-prompts
if ($LASTEXITCODE -ne 0) { throw "sam delete failed. If the bucket was not empty, run this script again." }

Write-Host "Teardown complete." -ForegroundColor Green
