# Clears corrupted Google Maven / Android Gradle cache entries and retries a clean build.
# Run from project root:  powershell -ExecutionPolicy Bypass -File .\scripts\fix-android-gradle.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$androidDir = Join-Path $projectRoot "android"
$gradleCache = Join-Path $env:USERPROFILE ".gradle\caches\modules-2\files-2.1\com.android.tools.build"

Write-Host "Stopping Gradle daemons..."
if (Test-Path (Join-Path $androidDir "gradlew.bat")) {
    Push-Location $androidDir
    & .\gradlew.bat --stop 2>$null
    Pop-Location
}

$expoGradleDir = Join-Path $projectRoot "node_modules\expo-modules-autolinking\android\expo-gradle-plugin"
if (Test-Path $expoGradleDir) {
    Remove-Item -Recurse -Force (Join-Path $expoGradleDir ".gradle") -ErrorAction SilentlyContinue
    Get-ChildItem $expoGradleDir -Directory | ForEach-Object {
        Remove-Item -Recurse -Force (Join-Path $_.FullName "build") -ErrorAction SilentlyContinue
    }
}

Write-Host "Applying npm patches (expo AGP 8.11.0)..."
Push-Location $projectRoot
npx patch-package 2>$null
Pop-Location

Write-Host "Removing corrupted Android Gradle cache..."
if (Test-Path $gradleCache) {
    Remove-Item -Recurse -Force $gradleCache
    Write-Host "  Deleted: $gradleCache"
}

$metadata = Get-ChildItem (Join-Path $env:USERPROFILE ".gradle\caches\modules-2") -Filter "metadata-*" -Directory -ErrorAction SilentlyContinue
foreach ($dir in $metadata) {
    $desc = Join-Path $dir.FullName "descriptors\com.android.tools.build"
    if (Test-Path $desc) {
        Remove-Item -Recurse -Force $desc
        Write-Host "  Deleted metadata: $desc"
    }
}

if (Test-Path (Join-Path $androidDir ".gradle")) {
    Remove-Item -Recurse -Force (Join-Path $androidDir ".gradle")
    Write-Host "  Deleted android/.gradle"
}

$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
if (-not $env:ANDROID_HOME -and (Test-Path $sdk)) {
    $env:ANDROID_HOME = $sdk
    Write-Host "Set ANDROID_HOME for this session: $sdk"
    Write-Host "To persist, run:"
    Write-Host '  [System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")'
}

Write-Host ''
Write-Host 'Done. Now run:'
Write-Host "  cd $projectRoot"
Write-Host '  npx expo run:android'
Write-Host ''
Write-Host 'Then rebuild with fresh dependencies:'
Write-Host '  cd android'
Write-Host '  .\gradlew.bat --stop'
Write-Host '  .\gradlew.bat app:assembleDebug --refresh-dependencies'
Write-Host '  cd ..'
Write-Host '  npx expo run:android'
Write-Host ''
Write-Host 'If it still fails, Google Maven may be blocked. Try a VPN or:'
Write-Host '  eas build --profile development --platform android'
