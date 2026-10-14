# Fetch TWSE listed stocks (all industries except depositary receipts) daily OHLCV + institutional net buy/sell and build data/stocks-data.js
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File update-data.ps1 [-TradingDays 100] [-InstDays 20]
param(
  [int]$TradingDays = 100,
  [int]$InstDays = 20,
  [int]$MaxCalendarDays = 200,
  [double]$DelaySec = 3
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

# Chinese field names kept as escapes so this file stays ASCII (PowerShell 5.1 safe)
$K_CODE  = [regex]::Unescape('\u516c\u53f8\u4ee3\u865f')
$K_ABBR  = [regex]::Unescape('\u516c\u53f8\u7c21\u7a31')
$K_IND   = [regex]::Unescape('\u7522\u696d\u5225')
$F_SEC   = [regex]::Unescape('\u8b49\u5238\u4ee3\u865f')
$F_IDX   = [regex]::Unescape('\u6307\u6578')
$N_TAIEX = [regex]::Unescape('\u767c\u884c\u91cf\u52a0\u6b0a\u80a1\u50f9\u6307\u6578')
$N_ELEC  = [regex]::Unescape('\u96fb\u5b50\u5de5\u696d\u985e\u6307\u6578')
$S_REG   = [regex]::Unescape('\u4e00\u822c')

# 91 = depositary receipts (TDR); everything else is kept, the page groups them into electronics / shipping / finance / traditional
$SkipIndustries = @('91')

function Get-Text([string]$url) {
  for ($i = 1; $i -le 3; $i++) {
    $wc = New-Object System.Net.WebClient
    $wc.Encoding = $utf8
    $wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')
    $wc.Headers.Add('Accept', 'application/json,text/plain,*/*')
    try {
      return $wc.DownloadString($url)
    } catch {
      Write-Host "    retry $i : $($_.Exception.Message)"
      Start-Sleep -Seconds (10 * $i)
    } finally {
      $wc.Dispose()
    }
  }
  throw "Download failed: $url"
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

function Convert-Day([string]$json) {
  $m = $json | ConvertFrom-Json
  if ($m.stat -ne 'OK' -or $null -eq $m.tables) { return , @('NODATA') }
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($tb in $m.tables) {
    if ($null -eq $tb.fields -or @($tb.fields).Count -eq 0) { continue }
    $f0 = [string]$tb.fields[0]
    if ($f0 -eq $F_IDX) {
      foreach ($r in $tb.data) {
        $nm = ([string]$r[0]).Trim()
        if ($nm -eq $N_TAIEX) { $out.Add('IDX,TAIEX,' + (Num-Str $r[1])) }
        elseif ($nm -eq $N_ELEC) { $out.Add('IDX,ELEC,' + (Num-Str $r[1])) }
      }
    } elseif ($f0 -eq $F_SEC) {
      foreach ($r in $tb.data) {
        $code = ([string]$r[0]).Trim()
        $name = (([string]$r[1]).Trim()) -replace ',', ' '
        $vol = To-Num $r[2]
        $lots = ''
        if ($null -ne $vol) { $lots = ([math]::Round($vol / 1000)).ToString($inv) }
        $sign = [string]$r[9]
        $chg = To-Num $r[10]
        $chgStr = ''
        if ($sign -match 'X') { $chgStr = 'X' }
        elseif ($null -ne $chg) {
          if ($sign -match '-') { $chgStr = (-$chg).ToString($inv) } else { $chgStr = $chg.ToString($inv) }
        }
        $out.Add(('S,{0},{1},{2},{3},{4},{5},{6},{7}' -f $code, $name, $lots, (Num-Str $r[5]), (Num-Str $r[6]), (Num-Str $r[7]), (Num-Str $r[8]), $chgStr))
      }
    }
  }
  return , $out.ToArray()
}

# T86 columns: 4 foreign net (excl. foreign dealers), 7 foreign dealers net, 10 investment trust net, 11 dealers net
function Convert-T86([string]$json) {
  $m = $json | ConvertFrom-Json
  if ($m.stat -ne 'OK' -or $null -eq $m.data) { return , @() }
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($r in $m.data) {
    $code = ([string]$r[0]).Trim()
    $fNet = (To-Num $r[4]) + (To-Num $r[7])
    $out.Add(('{0},{1},{2},{3}' -f $code, (To-Lots $fNet), (To-Lots (To-Num $r[10])), (To-Lots (To-Num $r[11]))))
  }
  return , $out.ToArray()
}

function To-Lots($v) {
  if ($null -eq $v) { return '0' }
  return ([math]::Round($v / 1000)).ToString($inv)
}

function Esc([string]$s) { return ($s -replace '\\', '\\' -replace '"', '\"') }

# TAIFEX futDataDown (Big5 CSV, max ~1 month per request). Keeps monthly TX contracts only:
# yyyyMMdd,R|N,expiry,open,high,low,close,change,volume,settle,openInterest  (N = night session, dated next trading day)
function Get-TaifexMonth([datetime]$first) {
  $last = $first.AddMonths(1).AddDays(-1)
  $body = 'down_type=1&commodity_id=TX&commodity_id2=&queryStartDate=' + [uri]::EscapeDataString($first.ToString('yyyy/MM/dd')) +
          '&queryEndDate=' + [uri]::EscapeDataString($last.ToString('yyyy/MM/dd'))
  $wc = New-Object System.Net.WebClient
  $wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36')
  $wc.Headers.Add('Content-Type', 'application/x-www-form-urlencoded')
  try {
    $bytes = $wc.UploadData('https://www.taifex.com.tw/cht/3/futDataDown', 'POST', [Text.Encoding]::ASCII.GetBytes($body))
  } finally { $wc.Dispose() }
  $txt = [Text.Encoding]::GetEncoding(950).GetString($bytes)
  if ($txt -match '<html|<HTML') { throw 'TAIFEX returned an HTML page instead of CSV' }
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($ln in ($txt -split "`r?`n")) {
    $p = $ln.Split(',')
    if ($p.Count -lt 18 -or $p[1].Trim() -ne 'TX') { continue }
    $exp = $p[2].Trim()
    if ($exp -notmatch '^\d{6}$') { continue }
    $ses = 'N'; if ($p[17].Trim() -eq $S_REG) { $ses = 'R' }
    $out.Add((@(($p[0].Trim() -replace '/', ''), $ses, $exp, (Num-Str $p[3]), (Num-Str $p[4]), (Num-Str $p[5]), (Num-Str $p[6]),
      (Num-Str $p[7]), (Num-Str $p[9]), (Num-Str $p[10]), (Num-Str $p[11])) -join ','))
  }
  return , $out.ToArray()
}

# ---------------------------------------------------------------- 1. company list
Write-Host '[1/5] TWSE OpenAPI: listed company list ...'
$companies = (Get-Text 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L') | ConvertFrom-Json
$elec = @{}
foreach ($co in $companies) {
  $ind = ([string]$co.$K_IND).Trim()
  if ($ind -and -not ($SkipIndustries -contains $ind)) {
    $elec[([string]$co.$K_CODE).Trim()] = @{ ind = $ind; abbr = ([string]$co.$K_ABBR).Trim() }
  }
}
Write-Host ("      listed companies: {0}" -f $elec.Count)

# ---------------------------------------------------------------- 2. daily quotes
Write-Host "[2/5] TWSE MI_INDEX daily quotes (target $TradingDays trading days, cached in data\cache) ..."
$today = (Get-Date).Date
$tradeDays = New-Object System.Collections.Generic.List[string]
$dayLines = @{}
$fetched = 0
for ($k = 0; $k -le $MaxCalendarDays -and $tradeDays.Count -lt $TradingDays; $k++) {
  $d = $today.AddDays(-$k)
  if ($d.DayOfWeek -eq [DayOfWeek]::Saturday -or $d.DayOfWeek -eq [DayOfWeek]::Sunday) { continue }
  $ds = $d.ToString('yyyyMMdd')
  $cf = Join-Path $cacheDir "$ds.csv"
  $lines = $null
  if (Test-Path $cf) {
    $lines = [IO.File]::ReadAllLines($cf, $utf8)
  } else {
    if ($k -eq 0 -and (Get-Date).Hour -lt 15) { continue }
    Write-Host "      fetch $ds"
    $lines = $null
    for ($try = 1; $try -le 2 -and $null -eq $lines; $try++) {
      try {
        $json = Get-Text "https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=$ds&type=ALLBUT0999&response=json"
        $lines = Convert-Day $json
      } catch {
        Write-Host "      parse failed ($($_.Exception.Message)), waiting 30s ..."
        Start-Sleep -Seconds 30
      }
    }
    if ($null -eq $lines) { throw "Could not get data for $ds (TWSE may be rate limiting). Run again later; cached days are kept." }
    $fetched++
    if ($lines.Count -gt 1 -or $d -lt $today) { [IO.File]::WriteAllLines($cf, [string[]]$lines, $utf8) }
    Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
  }
  if ($lines.Count -le 1) { continue }
  $tradeDays.Add($ds)
  $dayLines[$ds] = $lines
}
$tradeDays.Reverse()
$T = $tradeDays.Count
Write-Host ("      trading days: {0} ({1} ~ {2}), newly fetched: {3}" -f $T, $tradeDays[0], $tradeDays[$T - 1], $fetched)
if ($T -lt 25) { throw 'Not enough trading days to compute MA20.' }

# ---------------------------------------------------------------- 3. TAIEX futures (TX near month)
Write-Host '[3/5] TAIFEX TX futures daily (near month, cached per month) ...'
$futRows = New-Object System.Collections.Generic.List[string]
$futOk = $true
$m0 = [datetime]::ParseExact($tradeDays[0].Substring(0, 6) + '01', 'yyyyMMdd', $inv)
$thisMonth = New-Object DateTime($today.Year, $today.Month, 1)
for ($mm = $m0; $mm -le $thisMonth; $mm = $mm.AddMonths(1)) {
  $cf = Join-Path $cacheDir ('TX_' + $mm.ToString('yyyyMM') + '.csv')
  if ((Test-Path $cf) -and (Get-Item $cf).LastWriteTime.Date -ge $mm.AddMonths(1).AddDays(3)) {
    $futRows.AddRange([IO.File]::ReadAllLines($cf, $utf8))
    continue
  }
  Write-Host ('      fetch TX ' + $mm.ToString('yyyy-MM'))
  try {
    $rows = Get-TaifexMonth $mm
    if ($rows.Count -gt 0) { [IO.File]::WriteAllLines($cf, [string[]]$rows, $utf8) }
    $futRows.AddRange([string[]]$rows)
  } catch {
    Write-Host ("      TAIFEX failed ({0}); futures card will be skipped" -f $_.Exception.Message)
    if (Test-Path $cf) { $futRows.AddRange([IO.File]::ReadAllLines($cf, $utf8)) } else { $futOk = $false }
  }
  Start-Sleep -Milliseconds 1500
}
$futReg = @{}
$futNight = @{}
foreach ($ln in $futRows) {
  $p = $ln.Split(',')
  if ($p.Count -lt 11 -or [string]::IsNullOrEmpty($p[6])) { continue }
  $tbl = $futReg; if ($p[1] -eq 'N') { $tbl = $futNight }
  if (-not $tbl.ContainsKey($p[0]) -or $p[2] -lt $tbl[$p[0]][2]) { $tbl[$p[0]] = $p }
}
Write-Host ("      futures days: {0}" -f $futReg.Count)

# ---------------------------------------------------------------- 3. institutional net buy/sell
Write-Host "[4/5] TWSE T86 institutional net buy/sell (last $InstDays trading days) ..."
$instDates = @($tradeDays | Select-Object -Last $InstDays)
$instN = $instDates.Count
$inst = @{}
$instFetched = 0
for ($ii = 0; $ii -lt $instN; $ii++) {
  $ds = $instDates[$ii]
  $cf = Join-Path $cacheDir "T86_$ds.csv"
  $lines = $null
  if (Test-Path $cf) {
    $lines = [IO.File]::ReadAllLines($cf, $utf8)
  } else {
    Write-Host "      fetch T86 $ds"
    for ($try = 1; $try -le 2 -and $null -eq $lines; $try++) {
      try {
        $lines = Convert-T86 (Get-Text "https://www.twse.com.tw/rwd/zh/fund/T86?date=$ds&selectType=ALLBUT0999&response=json")
      } catch {
        Write-Host "      parse failed ($($_.Exception.Message)), waiting 30s ..."
        Start-Sleep -Seconds 30
      }
    }
    if ($null -eq $lines) { $lines = @(); Write-Host "      T86 $ds unavailable, skipped" }
    elseif ($lines.Count -gt 0) { [IO.File]::WriteAllLines($cf, [string[]]$lines, $utf8) }
    $instFetched++
    Start-Sleep -Milliseconds ([int]($DelaySec * 1000))
  }
  foreach ($ln in $lines) {
    $p = $ln.Split(',')
    if ($p.Count -lt 4 -or -not $elec.ContainsKey($p[0])) { continue }
    if (-not $inst.ContainsKey($p[0])) {
      $inst[$p[0]] = @{ f = New-Object 'string[]' $instN; t = New-Object 'string[]' $instN; d = New-Object 'string[]' $instN }
    }
    $inst[$p[0]].f[$ii] = $p[1]; $inst[$p[0]].t[$ii] = $p[2]; $inst[$p[0]].d[$ii] = $p[3]
  }
}
Write-Host ("      institutional days: {0}, newly fetched: {1}" -f $instN, $instFetched)

# ---------------------------------------------------------------- 4. build js
Write-Host '[5/5] building data\stocks-data.js ...'
$series = @{}
foreach ($code in $elec.Keys) {
  $series[$code] = @{
    n = $elec[$code].abbr; i = $elec[$code].ind
    o = New-Object 'string[]' $T; h = New-Object 'string[]' $T; l = New-Object 'string[]' $T
    c = New-Object 'string[]' $T; v = New-Object 'string[]' $T; d = New-Object 'string[]' $T
  }
}
$taiex = New-Object 'string[]' $T
$elecIdx = New-Object 'string[]' $T
for ($di = 0; $di -lt $T; $di++) {
  foreach ($ln in $dayLines[$tradeDays[$di]]) {
    $p = $ln.Split(',')
    if ($p[0] -eq 'IDX') {
      if ($p[1] -eq 'TAIEX') { $taiex[$di] = $p[2] } elseif ($p[1] -eq 'ELEC') { $elecIdx[$di] = $p[2] }
      continue
    }
    if ($p.Count -lt 9) { continue }
    $s = $series[$p[1]]
    if ($null -eq $s) { continue }
    $s.n = $p[2]
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
[void]$sb.Append('window.STOCK_DATA = {')
[void]$sb.Append('"generatedAt":"' + (Get-Date).ToString('yyyy-MM-dd HH:mm') + '",')
[void]$sb.Append('"source":"TWSE MI_INDEX + T86 + OpenAPI t187ap03_L + TAIFEX futDataDown",')
[void]$sb.Append('"dates":[' + $dates + '],')
[void]$sb.Append('"index":{"taiex":[' + (J-Arr $taiex) + '],"elec":[' + (J-Arr $elecIdx) + ']},')
if ($futOk -and $futReg.Count -gt 0) {
  $fc = New-Object 'string[]' $T; $fch = New-Object 'string[]' $T; $fv = New-Object 'string[]' $T
  $foi = New-Object 'string[]' $T; $fexp = New-Object 'string[]' $T
  for ($di = 0; $di -lt $T; $di++) {
    $r = $futReg[$tradeDays[$di]]
    if ($null -eq $r) { $fexp[$di] = 'null'; continue }
    $fc[$di] = $r[6]; $fch[$di] = $r[7]; $fv[$di] = $r[8]; $foi[$di] = $r[10]; $fexp[$di] = '"' + $r[2] + '"'
  }
  [void]$sb.Append('"fut":{"name":"TX","c":[' + (J-Arr $fc) + '],"ch":[' + (J-Arr $fch) + '],"v":[' + (J-Arr $fv) + '],"oi":[' + (J-Arr $foi) + '],"exp":[' + ($fexp -join ',') + ']')
  $nk = @($futNight.Keys | Where-Object { $_ -gt $tradeDays[$T - 1] } | Sort-Object)
  if ($nk.Count -gt 0) {
    $n = $futNight[$nk[$nk.Count - 1]]
    [void]$sb.Append(',"night":{"date":"' + $n[0] + '","exp":"' + $n[2] + '","c":' + $n[6] + ',"ch":' + $(if ($n[7]) { $n[7] } else { 'null' }) + '}')
  }
  [void]$sb.Append('},')
}
$instDatesJs = ($instDates | ForEach-Object { '"' + $_.Substring(0, 4) + '-' + $_.Substring(4, 2) + '-' + $_.Substring(6, 2) + '"' }) -join ','
[void]$sb.Append('"instDates":[' + $instDatesJs + '],')
[void]$sb.Append('"stocks":[')
$first = $true
$count = 0
foreach ($code in ($series.Keys | Sort-Object)) {
  $s = $series[$code]
  if (-not ($s.c | Where-Object { -not [string]::IsNullOrEmpty($_) })) { continue }
  if (-not $first) { [void]$sb.Append(',') }
  $first = $false
  $count++
  [void]$sb.Append('{"c":"' + $code + '","n":"' + (Esc $s.n) + '","i":"' + $s.i + '"')
  [void]$sb.Append(',"o":[' + (J-Arr $s.o) + '],"h":[' + (J-Arr $s.h) + '],"l":[' + (J-Arr $s.l) + ']')
  [void]$sb.Append(',"cl":[' + (J-Arr $s.c) + '],"v":[' + (J-Arr $s.v) + '],"d":[' + (J-Arr $s.d) + ']')
  if ($inst.ContainsKey($code)) {
    $q = $inst[$code]
    [void]$sb.Append(',"fi":[' + (J-Arr $q.f) + '],"it":[' + (J-Arr $q.t) + '],"dl":[' + (J-Arr $q.d) + ']')
  }
  [void]$sb.Append('}')
}
[void]$sb.Append(']};')
$outFile = Join-Path $dataDir 'stocks-data.js'
[IO.File]::WriteAllText($outFile, $sb.ToString(), $utf8)
Write-Host ("Done. {0} stocks x {1} days -> {2}" -f $count, $T, $outFile)
