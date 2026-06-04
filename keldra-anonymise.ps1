# keldra-anonymise.ps1
# Strips NDA-protected detail from Keldra demo files and writes clean copies
# to a sibling "keldra-generic" folder. Originals are NOT touched.
#
# Usage (from PowerShell):
#   cd C:\keldra-web        # or wherever your demo HTML lives
#   .\keldra-anonymise.ps1
#
# Edit two things below: $SourceDir, $Patterns, and the $Map if you want
# different generic names.

# ---- CONFIG --------------------------------------------------------------

# Folder to scan. "." = current folder. Set to the folder holding your mockups.
$SourceDir = "."

# Which files to clean. Add '*.tsx','*.ts' if you also want the app source.
$Patterns  = @('*.html')

# Replacement map. Keys are the real strings, values are the generic ones.
# Order matters: longer / more specific keys first so "DUB-16" is hit before
# any loose "DUB". -replace is case-insensitive, so "microsoft" is caught too.
$Map = [ordered]@{
    # --- Client / hyperscaler ---
    'Microsoft'         = 'Hyperscale Client'
    'MSFT'              = 'Hyperscale Client'

    # --- Project codename ---  (MER is the lead; reassign COLO/EARTH by hand
    #     to other project tabs/sections if your demo shows more than one)
    'DUB-16'            = 'MER'
    'DUB16'             = 'MER'
    'DUB 16'            = 'MER'

    # --- Main contractor ---
    'Ardmac'            = 'Main Contractor'
    '@ardmac.com'       = '@contractor.example'
    'jonathan.mckenna@ardmac.com' = 'commissioning.lead@contractor.example'

    # --- People (as identifying as the company) ---
    'Jonathan McKenna'  = 'Commissioning Lead'
    'Johnny McKenna'    = 'Commissioning Lead'
    'Fergus Nugent'     = 'Operations Director'
    'Dermot McKenna'    = 'BD Director'
    'Aaron Willis'      = 'Project Director'

    # --- OPTIONAL: blur the exact real counts (uncomment to use) ---
    # '4,311'           = '4,200'
    # '4311'            = '4200'
}

# ---- RUN -----------------------------------------------------------------

$OutDir = Join-Path (Resolve-Path $SourceDir) 'keldra-generic'
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$files = Get-ChildItem -Path $SourceDir -Include $Patterns -File -Recurse |
         Where-Object { $_.FullName -notlike "*\keldra-generic\*" }

if (-not $files) { Write-Host "No matching files found in $SourceDir" -ForegroundColor Yellow; return }

# BOM-less UTF-8 writer (Windows PowerShell 5.1 'Set-Content -Encoding UTF8'
# emits a BOM; this does not).
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

foreach ($f in $files) {
    $text = Get-Content -Raw -LiteralPath $f.FullName
    $hits = @()

    foreach ($key in $Map.Keys) {
        # Capture the replacement into a local so the MatchEvaluator closure
        # binds to THIS iteration's value, not the shared loop variable.
        $v = $Map[$key]
        $pattern = [regex]::Escape($key)
        if ([regex]::IsMatch($text, $pattern, 'IgnoreCase')) { $hits += $key }
        $text = [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $v }, 'IgnoreCase')
    }

    $dest = Join-Path $OutDir $f.Name
    [System.IO.File]::WriteAllText($dest, $text, $utf8NoBom)

    if ($hits) {
        Write-Host ("CLEANED  {0}  ->  removed: {1}" -f $f.Name, ($hits -join ', ')) -ForegroundColor Green
    } else {
        Write-Host ("COPIED   {0}  (nothing to strip)" -f $f.Name) -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Done. Clean files are in: $OutDir" -ForegroundColor Cyan
Write-Host "Eyeball them before sending - check headers, chart labels and any" -ForegroundColor Cyan
Write-Host "screenshots/images, which a text sweep cannot reach." -ForegroundColor Cyan
