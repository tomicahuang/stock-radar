# Build data/us-data.js: US index closes (Dow, S&P 500, Nasdaq, Philadelphia Semiconductor), TSMC ADR and USD/TWD
# from the Yahoo Finance chart API (last ~3 months, daily). Run after the Taiwan close, so the last bar is the prior US session.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File update-us.ps1
param([double]$DelaySec = 1)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$dataDir = Join-Path $root 'data'
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

# symbol, key used by the page
$Symbols = @(
  @('^DJI', 'dji'), @('^GSPC', 'spx'), @('^IXIC', 'ndq'), @('^SOX', 'sox'), @('TSM', 'tsm'), @('TWD=X', 'twd')
)

function Get-Chart([string]$sym) {
  $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + [uri]::EscapeDataString($sym) + '?range=3mo&interval=1d'
  for ($i = 1; $i -le 3; $i++) {
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = $utf8
    $wc.Headers.Add('User-Agent', $UA)
    try { return ($wc.DownloadString($url) | ConvertFrom-Json).chart.result[0] }
    catch { Write-Host "    retry $i : $($_.Exception.Message)"; Start-Sleep -Seconds (3 * $i) }
    finally { $wc.Dispose() }
  }
  throw "Download failed: $sym"
}

Write-Host 'Yahoo Finance: US indices, TSMC ADR, USD/TWD ...'
$parts = New-Object System.Collections.Generic.List[string]
foreach ($s in $Symbols) {
  $r = Get-Chart $s[0]
  $tz = [int]$r.meta.gmtoffset
  $closes = $r.indicators.quote[0].close
  $d = New-Object System.Collections.Generic.List[string]
  $c = New-Object System.Collections.Generic.List[string]
  for ($i = 0; $i -lt $r.timestamp.Count; $i++) {
    $v = $closes[$i]
    if ($null -eq $v) { continue }
    $d.Add('"' + [DateTimeOffset]::FromUnixTimeSeconds([long]$r.timestamp[$i] + $tz).UtcDateTime.ToString('yyyy-MM-dd') + '"')
    $c.Add(([math]::Round([double]$v, 4)).ToString($inv))
  }
  if ($c.Count -lt 5) { throw "too few closes for $($s[0])" }
  $parts.Add('"' + $s[1] + '":{"d":[' + ($d -join ',') + '],"c":[' + ($c -join ',') + ']}')
  Write-Host ("      {0}: {1} days, last {2}" -f $s[0], $c.Count, $c[$c.Count - 1])
  Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
}
$js = 'window.US_DATA = {"generatedAt":"' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + '","source":"Yahoo Finance chart API",' + ($parts -join ',') + '};'
$outFile = Join-Path $dataDir 'us-data.js'
[IO.File]::WriteAllText($outFile, $js, $utf8)
Write-Host ("Done -> {0}" -f $outFile)
