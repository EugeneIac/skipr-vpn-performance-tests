# Instant Servers Diagnostic Script
# Purpose: Quick health check of TEST environment Instant servers
# Usage: .\diagnose_instant_servers.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Skipr Instant Servers Diagnostic" -ForegroundColor Cyan
Write-Host "Environment: TEST" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

$S3_TARGETS = "https://skipr-shared-test.s3.us-west-2.amazonaws.com/targets_instant.json"
$S3_AGENTS = "https://skipr-shared-test.s3.us-west-2.amazonaws.com/agents.json"

function Check-Server {
    param (
        [string]$ip,
        [string]$name
    )

    Write-Host "Checking $name ($ip)... " -NoNewline

    try {
        $response = Invoke-WebRequest -Uri "https://${ip}/?device_id=test&protocol=wireguard" `
            -Method GET `
            -SkipCertificateCheck `
            -TimeoutSec 10 `
            -ErrorAction Stop

        $statusCode = $response.StatusCode

        if ($statusCode -eq 200) {
            Write-Host "OK (HTTP $statusCode)" -ForegroundColor Green
            return $true
        } else {
            Write-Host "UNEXPECTED (HTTP $statusCode)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        
        if ($statusCode -eq 502) {
            Write-Host "BAD GATEWAY (HTTP $statusCode) - Backend service down" -ForegroundColor Red
        } elseif ($null -eq $statusCode) {
            Write-Host "CONNECTION FAILED - Server unreachable" -ForegroundColor Red
        } else {
            Write-Host "ERROR (HTTP $statusCode)" -ForegroundColor Red
        }
        return $false
    }
}

Write-Host "Step 1: Fetching S3 configuration..." -ForegroundColor Yellow
Write-Host "--------------------------------------------"

# Fetch targets
try {
    Write-Host "Fetching targets from S3... " -NoNewline
    $targets = Invoke-RestMethod -Uri $S3_TARGETS -Method Get
    Write-Host "Success ($($targets.Count) servers)" -ForegroundColor Green
} catch {
    Write-Host "Failed to fetch targets" -ForegroundColor Red
    exit 1
}

# Fetch agents
try {
    Write-Host "Fetching agents from S3... " -NoNewline
    $agents = Invoke-RestMethod -Uri $S3_AGENTS -Method Get
    Write-Host "Success ($($agents.Count) agents)" -ForegroundColor Green
} catch {
    Write-Host "Failed to fetch agents" -ForegroundColor Red
    exit 1
}

Write-Host "`nStep 2: Analyzing server distribution..." -ForegroundColor Yellow
Write-Host "--------------------------------------------"

# Group by region
$regionGroups = $targets | Group-Object -Property region

Write-Host "Total regions: $($regionGroups.Count)`n"

$multipleServersRegions = @()

foreach ($group in $regionGroups) {
    $region = $group.Name
    $count = $group.Count
    $servers = $group.Group

    if ($count -gt 1) {
        Write-Host "WARNING - Region: $region" -ForegroundColor Yellow
        Write-Host "  Servers: $count (MULTIPLE SERVERS IN ONE REGION!)" -ForegroundColor Red
        foreach ($server in $servers) {
            Write-Host "    - IP: $($server.ip_address) | Status: $($server.status) | Location: $($server.location)" -ForegroundColor Gray
        }
        $multipleServersRegions += $region
    } else {
        $server = $servers[0]
        Write-Host "OK - Region: $region" -ForegroundColor Green
        Write-Host "  IP: $($server.ip_address) | Status: $($server.status) | Location: $($server.location)" -ForegroundColor Gray
    }
    Write-Host ""
}

Write-Host "`nStep 3: Health check of instant servers..." -ForegroundColor Yellow
Write-Host "--------------------------------------------"

$healthyCount = 0
$unhealthyCount = 0

foreach ($server in $targets) {
    $result = Check-Server -ip $server.ip_address -name "$($server.location) ($($server.region))"
    if ($result) {
        $healthyCount++
    } else {
        $unhealthyCount++
    }
}

Write-Host "`n========================================"
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================"
Write-Host "Total servers: $($targets.Count)"
Write-Host "Healthy servers: $healthyCount" -ForegroundColor Green
Write-Host "Unhealthy servers: $unhealthyCount" -ForegroundColor $(if ($unhealthyCount -gt 0) { "Red" } else { "Green" })
Write-Host "Regions with multiple servers: $($multipleServersRegions.Count)" -ForegroundColor $(if ($multipleServersRegions.Count -gt 0) { "Yellow" } else { "Green" })

if ($multipleServersRegions.Count -gt 0) {
    Write-Host "`nWARNING: Multiple servers detected in regions:" -ForegroundColor Yellow
    foreach ($region in $multipleServersRegions) {
        Write-Host "  - $region" -ForegroundColor Yellow
    }
    Write-Host "`nThis may cause provision routing issues!" -ForegroundColor Red
}

Write-Host "`n========================================"
