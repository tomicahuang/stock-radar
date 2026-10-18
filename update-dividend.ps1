# Build data/dividend-data.js: TWSE market holidays + listed stocks' ex-rights / ex-dividend events
# (last ~13 months of results from TWT49U + announced upcoming events from TWT48U). ETFs are handled by update-etf.ps1.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File update-dividend.ps1
param([double]$DelaySec = 1.5)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$dataDir = Join-Path $root 'data'
$cacheDir = Join-Path $dataDir 'cache'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
$holCache = Join-Path $cacheDir 'holidays.tsv'
$evCache = Join-Path $cacheDir 'stock_div.tsv'

# Chinese text kept as escapes so this file stays ASCII (PowerShell 5.1 safe)
$S_TRADING_DAY = [regex]::Unescape('\u4ea4\u6613\u65e5')
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function Get-Text([string]$url) {
  for ($i = 1; $i -le 3; $i++) {
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = $utf8
    $wc.Headers.Add('User-Agent', $UA)
    try { return $wc.DownloadString($url) }
    catch { Write-Host "    retry $i : $($_.Exception.Message)"; Start-Sleep -Seconds (5 * $i) }
    finally { $wc.Dispose() }
  }
  throw "Download failed: $url"
}

function Num-Str($s) {
  $t = (([string]$s) -replace ',', '').Trim()
  $d = 0.0
  if ([double]::TryParse($t, [Globalization.NumberStyles]::Float, $inv, [ref]$d)) { return $d.ToString($inv) }
  return ''
}
function Pos-Str($s) { $n = Num-Str $s; if ($n -and [double]$n -gt 0) { return $n } return '' }

function Roc-Date([string]$s) {
  $m = [regex]::Match([string]$s, '(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})')
  if (-not $m.Success) { return '' }
  return ('{0:D4}-{1:D2}-{2:D2}' -f ([int]$m.Groups[1].Value + 1911), [int]$m.Groups[2].Value, [int]$m.Groups[3].Value)
}

function JStr([string]$s) { return '"' + ($s -replace '\\', '\\' -replace '"', '\"') + '"' }
function JNum([string]$s) { if ([string]::IsNullOrEmpty($s)) { return 'null' } return $s }

$today = (Get-Date).Date

# ---------------------------------------------------------------- 1. market holidays (this year + next year)
Write-Host '[1/3] TWSE market holidays ...'
$hol = New-Object System.Collections.Generic.SortedSet[string]
try {
  foreach ($y in @($today.Year, ($today.Year + 1))) {
    $j = (Get-Text "https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?date=$($y)0101&response=json") | ConvertFrom-Json
    foreach ($r in @($j.data)) {
      $d = ([string]$r[0]).Trim()
      # rows such as "first / last trading day" are trading days, everything else listed is a non-trading day
      if ($d -match '^\d{4}-\d{2}-\d{2}$' -and ([string]$r[1]) -notmatch $S_TRADING_DAY) { [void]$hol.Add($d) }
    }
    Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
  }
  if ($hol.Count -lt 5) { throw "only $($hol.Count) holidays" }
  [IO.File]::WriteAllLines($holCache, [string[]]@($hol), $utf8)
  Write-Host ("      holidays: {0}" -f $hol.Count)
} catch {
  if (-not (Test-Path $holCache)) { throw "Holiday list unavailable ($($_.Exception.Message)) and no cached copy." }
  Write-Host "      holiday list failed ($($_.Exception.Message)); using cached copy"
  foreach ($d in [IO.File]::ReadAllLines($holCache, $utf8)) { if ($d) { [void]$hol.Add($d) } }
}

# ---------------------------------------------------------------- 2. ex-rights / ex-dividend results + upcoming notices
# event: code, exDate, type, cash, stockRatio, issueRatio, issuePrice, preClose, value, announced
Write-Host '[2/3] TWSE ex-rights/ex-dividend results (TWT49U) and notices (TWT48U) ...'
$ev = [ordered]@{}
try {
  $start = $today.AddDays(-400).ToString('yyyyMMdd'); $end = $today.ToString('yyyyMMdd')
  $h = (Get-Text "https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=$start&endDate=$end&response=json") | ConvertFrom-Json
  if ($h.stat -ne 'OK') { throw "TWT49U: $($h.stat)" }
  foreach ($r in @($h.data)) {
    $code = ([string]$r[1]).Trim()
    if ($code -like '00*') { continue }
    $ex = Roc-Date $r[0]
    if (-not $ex) { continue }
    $ev["$code|$ex"] = @($code, $ex, ([string]$r[6]).Trim(), '', '', '', '', (Num-Str $r[3]), (Num-Str $r[5]), '0')
  }
  Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
  $n = (Get-Text 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json') | ConvertFrom-Json
  foreach ($r in @($n.data)) {
    $code = ([string]$r[1]).Trim()
    if ($code -like '00*') { continue }
    $ex = Roc-Date $r[0]
    if (-not $ex) { continue }
    $key = "$code|$ex"
    if (-not $ev.Contains($key)) { $ev[$key] = @($code, $ex, ([string]$r[3]).Trim(), '', '', '', '', '', '', '1') }
    $e = $ev[$key]
    $e[3] = Pos-Str $r[7]; $e[4] = Pos-Str $r[4]; $e[5] = Pos-Str $r[5]; $e[6] = Pos-Str $r[6]; $e[9] = '1'
  }
  if ($ev.Count -lt 100) { throw "only $($ev.Count) events" }
  $lines = foreach ($k in $ev.Keys) { $ev[$k] -join "`t" }
  [IO.File]::WriteAllLines($evCache, [string[]]$lines, $utf8)
  Write-Host ("      events: {0}" -f $ev.Count)
} catch {
  if (-not (Test-Path $evCache)) { throw "Ex-rights data unavailable ($($_.Exception.Message)) and no cached copy." }
  Write-Host "      ex-rights data failed ($($_.Exception.Message)); using cached copy"
  $ev = [ordered]@{}
  foreach ($ln in [IO.File]::ReadAllLines($evCache, $utf8)) {
    $p = $ln.Split("`t")
    if ($p.Count -ge 10) { $ev["$($p[0])|$($p[1])"] = $p }
  }
}

# ---------------------------------------------------------------- 3. build js
Write-Host '[3/3] building data\dividend-data.js ...'
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append('window.DIV_DATA = {')
[void]$sb.Append('"generatedAt":"' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + '",')
[void]$sb.Append('"source":"TWSE holidaySchedule + TWT49U + TWT48U",')
[void]$sb.Append('"holidays":[' + ((@($hol) | ForEach-Object { JStr $_ }) -join ',') + '],')
$rows = foreach ($k in $ev.Keys) {
  $e = $ev[$k]
  '[' + (JStr $e[0]) + ',' + (JStr $e[1]) + ',' + (JStr $e[2]) + ',' + (JNum $e[3]) + ',' + (JNum $e[4]) + ',' + (JNum $e[5]) + ',' +
    (JNum $e[6]) + ',' + (JNum $e[7]) + ',' + (JNum $e[8]) + ',' + $e[9] + ']'
}
[void]$sb.Append('"events":[' + ($rows -join ',') + ']};')
$outFile = Join-Path $dataDir 'dividend-data.js'
[IO.File]::WriteAllText($outFile, $sb.ToString(), $utf8)
Write-Host ("Done. {0} holidays, {1} stock events -> {2}" -f $hol.Count, @($rows).Count, $outFile)
