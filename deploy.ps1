<#
.SYNOPSIS
Deploys the Angular SSR project to an existing Azure App Service.

.DESCRIPTION
This script builds the project, prepares the distribution folder, zips it,
and deploys it to the specified Azure App Service using the Azure CLI.
It also mirrors the build steps defined in your azure-pipelines.yml.

.PARAMETER ResourceGroup
The name of the Azure Resource Group containing the App Service.

.PARAMETER AppName
The name of the Azure App Service.
#>

param (
    [Parameter(Mandatory=$false)]
    [string]$ResourceGroup = "aiva",

    [Parameter(Mandatory=$false)]
    [string]$AppName = "aiva-admin"
)

$ErrorActionPreference = "Stop"

$ProjectName = "aiva-admin"
$DistFolder = "dist\$ProjectName"
$ZipFile = "$ProjectName-deploy.zip"

Write-Host "====== Starting Deployment Process ======" -ForegroundColor Cyan

# 1. Check Azure CLI login status
Write-Host "Checking Azure CLI authentication..."
try {
    $null = az account show
} catch {
    Write-Host "You are not logged in to Azure CLI. Please run 'az login' first." -ForegroundColor Red
    exit 1
}

# 2. Install dependencies
Write-Host "Installing npm dependencies..." -ForegroundColor Green
npm ci --prefer-offline --no-audit

# 3. Build the application
Write-Host "Building the application for production..." -ForegroundColor Green
npm run build -- --configuration=production

# 4. Prepare artifacts
Write-Host "Preparing deployment artifacts..." -ForegroundColor Green
if (-not (Test-Path $DistFolder)) {
    Write-Host "Error: Build output folder '$DistFolder' not found!" -ForegroundColor Red
    exit 1
}

Write-Host "Copying package.json and package-lock.json..."
Copy-Item package.json -Destination $DistFolder -Force
Copy-Item package-lock.json -Destination $DistFolder -Force

Write-Host "Creating web.config for IISNode (fallback for Windows hosts)..."
$WebConfigContent = @"
<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="iisnode" path="server/server.mjs" verb="*" modules="iisnode"/>
    </handlers>
    <rewrite>
      <rules>
        <rule name="NodeInspector" patternSyntax="ECMAScript" stopProcessing="true">
          <match url="^server/server.mjs\/debug[\/]?" />
        </rule>
        <rule name="StaticContent">
          <action type="Rewrite" url="public{REQUEST_URI}"/>
        </rule>
        <rule name="DynamicContent">
          <conditions>
            <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="True"/>
          </conditions>
          <action type="Rewrite" url="server/server.mjs"/>
        </rule>
      </rules>
    </rewrite>
    <security>
      <requestFiltering>
        <hiddenSegments>
          <remove segment="bin"/>
        </hiddenSegments>
      </requestFiltering>
    </security>
    <httpErrors existingResponse="PassThrough" />
    <iisnode watchedFiles="*.js;*.mjs"/>
  </system.webServer>
</configuration>
"@
Set-Content -Path "$DistFolder\web.config" -Value $WebConfigContent -Encoding UTF8

# 5. Zip the artifacts
Write-Host "Creating zip archive ($ZipFile)..." -ForegroundColor Green
if (Test-Path $ZipFile) {
    Remove-Item $ZipFile -Force
}
# Compress the contents of the dist folder, not the folder itself
Compress-Archive -Path "$DistFolder\*" -DestinationPath $ZipFile -Force

# 6. Set Startup Command for Linux App Service
Write-Host "Setting startup command for Azure App Service..." -ForegroundColor Green
az webapp config set --resource-group $ResourceGroup --name $AppName --startup-file "npm install --omit=dev && node server/server.mjs" | Out-Null

# 7. Deploy via zip deploy
Write-Host "Deploying to Azure App Service '$AppName'..." -ForegroundColor Green
az webapp deploy --resource-group $ResourceGroup --name $AppName --src-path $ZipFile

Write-Host "====== Deployment Completed Successfully! ======" -ForegroundColor Cyan
Write-Host "Please wait a few minutes for the App Service to restart and apply the changes." -ForegroundColor Yellow
Write-Host "Cleanup: You can delete $ZipFile if you want." -ForegroundColor DarkGray
