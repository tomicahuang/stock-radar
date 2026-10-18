# Build data/etf-data.js: TWSE-listed ETFs (category, size, holders) + dividend schedule + daily quotes from data\cache
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File update-etf.ps1 [-TradingDays 100]
# Daily quotes come from the MI_INDEX cache written by update-data.ps1 (no extra quote downloads).
param(
  [int]$TradingDays = 100,
  [double]$DelaySec = 1.5
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$dataDir = Join-Path $root 'data'
$cacheDir = Join-Path $dataDir 'cache'
New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
$metaCache = Join-Path $cacheDir 'etf_meta.tsv'
$divCache = Join-Path $cacheDir 'etf_div.tsv'

# Chinese text kept as escapes so this file stays ASCII (PowerShell 5.1 safe)
$S_ISSUER_TAIL = [regex]::Unescape('(\u8b49\u5238)?\u6295\u8cc7\u4fe1\u8a17.*$')
$S_CO_LTD = [regex]::Unescape('\u80a1\u4efd\u6709\u9650\u516c\u53f8')
$S_DIV = [regex]::Unescape('\u606f')
$UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

function New-Wc {
  $wc = New-Object System.Net.WebClient
  $wc.Encoding = $utf8
  $wc.Headers.Add('User-Agent', $UA)
  return $wc
}

function Get-Text([string]$url) {
  for ($i = 1; $i -le 3; $i++) {
    $wc = New-Wc
    try { return $wc.DownloadString($url) }
    catch { Write-Host "    retry $i : $($_.Exception.Message)"; Start-Sleep -Seconds (5 * $i) }
    finally { $wc.Dispose() }
  }
  throw "Download failed: $url"
}

function Post-Form([string]$url, [string]$body) {
  for ($i = 1; $i -le 3; $i++) {
    $wc = New-Wc
    $wc.Headers.Add('Content-Type', 'application/x-www-form-urlencoded')
    $wc.Headers.Add('X-Requested-With', 'XMLHttpRequest')
    try { return $wc.UploadString($url, 'POST', $body) }
    catch { Write-Host "    retry $i : $($_.Exception.Message)"; Start-Sleep -Seconds (5 * $i) }
    finally { $wc.Dispose() }
  }
  throw "Download failed: $url ($body)"
}

function To-Num($s) {
  if ($null -eq $s) { return $null }
  $t = (([string]$s) -replace ',', '').Trim()
  $d = 0.0
  if ([double]::TryParse($t, [Globalization.NumberStyles]::Float, $inv, [ref]$d)) { return $d }
  return $null
}

function Num-Str($s) {
  $n = To-Num $s
  if ($null -eq $n) { return '' }
  return $n.ToString($inv)
}

# ROC date such as 115/11/04 or 115(year)11(month)04(day) -> 2026-11-04
function Roc-Date([string]$s) {
  $m = [regex]::Match([string]$s, '(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})')
  if (-not $m.Success) { return '' }
  return ('{0:D4}-{1:D2}-{2:D2}' -f ([int]$m.Groups[1].Value + 1911), [int]$m.Groups[2].Value, [int]$m.Groups[3].Value)
}

function Esc([string]$s) { return ($s -replace '\\', '\\' -replace '"', '\"' -replace "[`r`n`t]", ' ') }
function JStr([string]$s) { return '"' + (Esc $s) + '"' }
function JNum([string]$s) { if ([string]::IsNullOrEmpty($s)) { return 'null' } return $s }

# ---------------------------------------------------------------- 1. ETF list, size, holders, categories (TWSE ETF e-Fortune)
Write-Host '[1/3] TWSE ETF list and categories ...'
$PRODUCTS = 'https://www.twse.com.tw/zh/ETFortune/ajaxProductsResult'
$meta = [ordered]@{}
try {
  $all = (Post-Form $PRODUCTS '') | ConvertFrom-Json
  if ($all.status -ne 'success' -or @($all.data).Count -lt 50) { throw 'unexpected ETF list response' }
  foreach ($e in $all.data) {
    $iss = (([string]$e.issuer) -replace $S_ISSUER_TAIL, '' -replace $S_CO_LTD, '').Trim()
    $meta[[string]$e.stockNo] = [ordered]@{
      n = ([string]$e.stockName).Trim(); list = (([string]$e.listingDate) -replace '\.', '-'); idx = [string]$e.indexName
      aum = (Num-Str $e.totalAv); holders = (Num-Str $e.holders); iss = $iss
      cat = ''; rw = 'V'; act = '0'; tags = New-Object System.Collections.Generic.List[string]
    }
  }
  $page = Get-Text 'https://www.twse.com.tw/zh/ETFortune/products'
  $filters = New-Object System.Collections.Generic.List[object]
  foreach ($v in @('Stock', 'Bond', 'MultiAsset', 'RawMaterial', 'FX', 'REITs')) { $filters.Add(@('cat', "assetType=$v", $v.ToLower())) }
  $filters.Add(@('rw', 'rewardType=L', 'L')); $filters.Add(@('rw', 'rewardType=I', 'I'))
  $filters.Add(@('act', 'managerType=Active', '1'))
  foreach ($m in [regex]::Matches($page, '(?is)<input[^>]*name="hashtag"[^>]*>')) {
    $id = [regex]::Match($m.Value, 'value="([^"]+)"').Groups[1].Value
    $word = [regex]::Match($m.Value, 'data-tagword="([^"]+)"').Groups[1].Value
    if ($id -and $word) { $filters.Add(@('tag', "hashtag=$id", (($word -split '[:\uFF1A]')[-1]).Trim())) }
  }
  foreach ($f in $filters) {
    Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
    $r = (Post-Form $PRODUCTS $f[1]) | ConvertFrom-Json
    foreach ($e in @($r.data)) {
      $x = $meta[[string]$e.stockNo]
      if ($null -eq $x) { continue }
      if ($f[0] -eq 'tag') { $x.tags.Add($f[2]) } else { $x[$f[0]] = $f[2] }
    }
  }
  $lines = foreach ($k in $meta.Keys) {
    $x = $meta[$k]
    (@($k, $x.n, $x.list, $x.idx, $x.aum, $x.holders, $x.iss, $x.cat, $x.rw, $x.act, ($x.tags -join ';')) | ForEach-Object { ([string]$_) -replace "[`t`r`n]", ' ' }) -join "`t"
  }
  [IO.File]::WriteAllLines($metaCache, [string[]]$lines, $utf8)
  Write-Host ("      ETFs: {0}, category filters: {1}" -f $meta.Count, $filters.Count)
} catch {
  if (-not (Test-Path $metaCache)) { throw "ETF list unavailable ($($_.Exception.Message)) and no cached copy." }
  Write-Host "      ETF list failed ($($_.Exception.Message)); using cached copy"
  $meta = [ordered]@{}
  foreach ($ln in [IO.File]::ReadAllLines($metaCache, $utf8)) {
    $p = $ln.Split("`t")
    if ($p.Count -lt 11) { continue }
    $tags = New-Object System.Collections.Generic.List[string]
    foreach ($t in $p[10].Split(';')) { if ($t) { $tags.Add($t) } }
    $meta[$p[0]] = [ordered]@{ n = $p[1]; list = $p[2]; idx = $p[3]; aum = $p[4]; holders = $p[5]; iss = $p[6]; cat = $p[7]; rw = $p[8]; act = $p[9]; tags = $tags }
  }
}

# ---------------------------------------------------------------- 2. dividend schedule (ex-date, record date, pay date, amount)
Write-Host '[2/3] TWSE ETF dividend list (last year + this year) and ex-dividend notices ...'
$divs = [ordered]@{}
try {
  $y = (Get-Date).Year
  $html = Get-Text ("https://www.twse.com.tw/zh/ETFortune/dividendList?stkNo=&startDate={0}&endDate={1}" -f ($y - 1), $y)
  $rx = '(?s)<tr onclick[^>]*>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>\s*<td>([^<]*)</td>'
  foreach ($m in [regex]::Matches($html, $rx)) {
    $code = $m.Groups[1].Value.Trim()
    $ex = Roc-Date $m.Groups[3].Value
    if (-not $code -or -not $ex) { continue }
    $divs["$code|$ex"] = @($code, $ex, (Roc-Date $m.Groups[4].Value), (Roc-Date $m.Groups[5].Value), (Num-Str $m.Groups[6].Value))
  }
  if ($divs.Count -lt 50) { throw "only $($divs.Count) dividend rows parsed" }
  Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
  try {
    $n = (Get-Text 'https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json') | ConvertFrom-Json
    $added = 0
    foreach ($r in @($n.data)) {
      $code = ([string]$r[1]).Trim()
      if (-not $meta.Contains($code) -or ([string]$r[3]) -notmatch $S_DIV) { continue }
      $ex = Roc-Date $r[0]
      $amt = Num-Str $r[7]
      $key = "$code|$ex"
      if ($divs.Contains($key)) { if (-not $divs[$key][4] -and $amt -and [double]$amt -gt 0) { $divs[$key][4] = $amt } }
      else { $divs[$key] = @($code, $ex, '', '', $(if ($amt -and [double]$amt -gt 0) { $amt } else { '' })); $added++ }
    }
    Write-Host ("      ex-dividend notices merged (+{0} not yet in the dividend list)" -f $added)
  } catch { Write-Host "      TWT48U skipped ($($_.Exception.Message))" }
  $lines = foreach ($k in $divs.Keys) { $divs[$k] -join "`t" }
  [IO.File]::WriteAllLines($divCache, [string[]]$lines, $utf8)
  Write-Host ("      dividend rows: {0}" -f $divs.Count)
} catch {
  if (-not (Test-Path $divCache)) { throw "Dividend list unavailable ($($_.Exception.Message)) and no cached copy." }
  Write-Host "      dividend list failed ($($_.Exception.Message)); using cached copy"
  $divs = [ordered]@{}
  foreach ($ln in [IO.File]::ReadAllLines($divCache, $utf8)) {
    $p = $ln.Split("`t")
    if ($p.Count -ge 5) { $divs["$($p[0])|$($p[1])"] = $p }
  }
}

# ---------------------------------------------------------------- 3. daily quotes from the MI_INDEX cache
Write-Host '[3/3] ETF daily quotes from data\cache ...'
$dayFiles = @(Get-ChildItem $cacheDir -Filter '*.csv' | Where-Object { $_.Name -match '^\d{8}\.csv$' } | Sort-Object Name -Descending)
$tradeDays = New-Object System.Collections.Generic.List[string]
$dayLines = @{}
foreach ($f in $dayFiles) {
  if ($tradeDays.Count -ge $TradingDays) { break }
  $lines = [IO.File]::ReadAllLines($f.FullName, $utf8)
  if ($lines.Count -le 1) { continue }
  $ds = $f.BaseName
  $tradeDays.Add($ds)
  $dayLines[$ds] = $lines
}
$tradeDays.Reverse()
$T = $tradeDays.Count
if ($T -lt 25) { throw 'Not enough cached trading days; run update-data.ps1 first.' }

$series = @{}
foreach ($code in $meta.Keys) {
  $series[$code] = @{
    o = New-Object 'string[]' $T; h = New-Object 'string[]' $T; l = New-Object 'string[]' $T
    c = New-Object 'string[]' $T; v = New-Object 'string[]' $T; d = New-Object 'string[]' $T; seen = $false
  }
}
for ($di = 0; $di -lt $T; $di++) {
  foreach ($ln in $dayLines[$tradeDays[$di]]) {
    if (-not $ln.StartsWith('S,0')) { continue }
    $p = $ln.Split(',')
    if ($p.Count -lt 9) { continue }
    $s = $series[$p[1]]
    if ($null -eq $s) { continue }
    $s.seen = $true
    $s.v[$di] = $p[3]; $s.o[$di] = $p[4]; $s.h[$di] = $p[5]; $s.l[$di] = $p[6]; $s.c[$di] = $p[7]; $s.d[$di] = $p[8]
  }
}

function J-Arr($a) {
  $parts = New-Object 'string[]' $a.Count
  for ($x = 0; $x -lt $a.Count; $x++) {
    $v = $a[$x]
    if ([string]::IsNullOrEmpty($v) -or $v -eq 'X') { $parts[$x] = 'null' } else { $parts[$x] = $v }
  }
  return ($parts -join ',')
}

$sb = New-Object System.Text.StringBuilder
$dates = ($tradeDays | ForEach-Object { '"' + $_.Substring(0, 4) + '-' + $_.Substring(4, 2) + '-' + $_.Substring(6, 2) + '"' }) -join ','
[void]$sb.Append('window.ETF_DATA = {')
[void]$sb.Append('"generatedAt":"' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + '",')
[void]$sb.Append('"source":"TWSE ETF e-Fortune (products, dividendList) + TWT48U + MI_INDEX",')
[void]$sb.Append('"dates":[' + $dates + '],')
[void]$sb.Append('"etfs":[')
$first = $true
$count = 0
foreach ($code in ($meta.Keys | Sort-Object)) {
  $x = $meta[$code]; $s = $series[$code]
  if (-not $first) { [void]$sb.Append(',') }
  $first = $false
  $count++
  $tags = ($x.tags | ForEach-Object { JStr $_ }) -join ','
  [void]$sb.Append('{"c":' + (JStr $code) + ',"n":' + (JStr $x.n) + ',"list":' + (JStr $x.list) + ',"idx":' + (JStr $x.idx))
  [void]$sb.Append(',"aum":' + (JNum $x.aum) + ',"holders":' + (JNum $x.holders) + ',"iss":' + (JStr $x.iss))
  [void]$sb.Append(',"cat":' + (JStr $x.cat) + ',"rw":' + (JStr $x.rw) + ',"act":' + $x.act + ',"tags":[' + $tags + ']')
  if ($s.seen) {
    [void]$sb.Append(',"o":[' + (J-Arr $s.o) + '],"h":[' + (J-Arr $s.h) + '],"l":[' + (J-Arr $s.l) + ']')
    [void]$sb.Append(',"cl":[' + (J-Arr $s.c) + '],"v":[' + (J-Arr $s.v) + '],"d":[' + (J-Arr $s.d) + ']')
  }
  [void]$sb.Append('}')
}
[void]$sb.Append('],"divs":[')
$dl = foreach ($k in $divs.Keys) {
  $p = $divs[$k]
  if (-not $meta.Contains($p[0])) { continue }
  '[' + (JStr $p[0]) + ',' + (JStr $p[1]) + ',' + (JStr $p[2]) + ',' + (JStr $p[3]) + ',' + (JNum $p[4]) + ']'
}
[void]$sb.Append(($dl -join ','))
[void]$sb.Append(']};')
$outFile = Join-Path $dataDir 'etf-data.js'
[IO.File]::WriteAllText($outFile, $sb.ToString(), $utf8)
Write-Host ("Done. {0} ETFs x {1} days, {2} dividend rows -> {3}" -f $count, $T, @($dl).Count, $outFile)
