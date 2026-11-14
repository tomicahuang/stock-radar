# Build data/quotes-data.js: latest TAIEX, TAIEX futures (near month, day + night session) and US quotes.
# Light and fast, so the cloud can run it every ~20 minutes; the page prefers these over the daily data when newer.
# Runs on Windows PowerShell 5.1 and PowerShell 7 (GitHub ubuntu runner).
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File update-quotes.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$utf8 = New-Object System.Text.UTF8Encoding($false)
$inv = [Globalization.CultureInfo]::InvariantCulture
$UA = @{ 'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' }
$tpe = [TimeSpan]::FromHours(8)
$nowUnix = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

function Num($v) { if ($null -eq $v -or "$v" -eq '') { return 'null' } return ([double]$v).ToString('0.####', $inv) }
function TpeTime([long]$unix) { return [DateTimeOffset]::FromUnixTimeSeconds($unix).ToOffset($tpe).ToString('yyyy-MM-dd HH:mm') }

# Yahoo daily chart: latest price, previous close, 20-day average, and whether the regular session is open now.
function Get-Yahoo([string]$sym) {
  $url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + [uri]::EscapeDataString($sym) + '?range=3mo&interval=1d'
  $r = (Invoke-RestMethod -Uri $url -Headers $UA -TimeoutSec 30).chart.result[0]
  $m = $r.meta
  $closes = New-Object System.Collections.Generic.List[double]
  $days = New-Object System.Collections.Generic.List[string]
  $tz = [int]$m.gmtoffset
  for ($i = 0; $i -lt $r.timestamp.Count; $i++) {
    $v = $r.indicators.quote[0].close[$i]
    if ($null -eq $v) { continue }
    $closes.Add([double]$v)
    $days.Add([DateTimeOffset]::FromUnixTimeSeconds([long]$r.timestamp[$i] + $tz).UtcDateTime.ToString('yyyy-MM-dd'))
  }
  $n = $closes.Count
  if ($n -lt 2) { throw "too few closes for $sym" }
  $price = [double]$m.regularMarketPrice
  $marketDay = [DateTimeOffset]::FromUnixTimeSeconds([long]$m.regularMarketTime + $tz).UtcDateTime.ToString('yyyy-MM-dd')
  # previous close = last completed bar before the market day of the latest price
  $prev = $null
  for ($i = $n - 1; $i -ge 0; $i--) { if ($days[$i] -lt $marketDay) { $prev = $closes[$i]; break } }
  if ($null -eq $prev) { $prev = $closes[$n - 2] }
  $tail = @($closes | Select-Object -Last 20)
  $ma = ($tail | Measure-Object -Average).Average
  $reg = $m.currentTradingPeriod.regular
  $live = ($nowUnix -ge [long]$reg.start -and $nowUnix -lt [long]$reg.end)
  return '{"p":' + (Num $price) + ',"prev":' + (Num $prev) + ',"ma20":' + (Num $ma) + ',"day":"' + $marketDay +
    '","t":"' + (TpeTime ([long]$m.regularMarketTime)) + '","live":' + $(if ($live) { 'true' } else { 'false' }) + '}'
}

# TAIFEX quote board: near-month TXF regular session (MarketType 0) and after-hours session (MarketType 1).
function Get-Taifex([string]$marketType) {
  $body = '{"MarketType":"' + $marketType + '","SymbolType":"F","KindID":"1","CID":"TXF","ExpireMonth":"","RowSize":"' + [regex]::Unescape('\u5168\u90e8') + '","PageNo":"","SortColumn":"","AscDesc":"A"}'
  $r = Invoke-RestMethod -Method POST -Uri 'https://mis.taifex.com.tw/futures/api/getQuoteList' -ContentType 'application/json; charset=utf-8' `
    -Body ([Text.Encoding]::UTF8.GetBytes($body)) -Headers $UA -TimeoutSec 30
  $q = @($r.RtData.QuoteList | Where-Object { $_.SymbolID -match '^TXF[A-L]\d-[FM]$' -and "$($_.CLastPrice)" -ne '' }) | Select-Object -First 1
  if ($null -eq $q) { return 'null' }
  $tm = ([string]$q.CTime).PadLeft(6, '0')
  $dt = [DateTime]::ParseExact([string]$q.CDate + $tm, 'yyyyMMddHHmmss', $inv)
  # the after-hours session is dated by the day it opened (15:00), so its early-morning ticks belong to the next day
  if ($marketType -eq '1' -and $dt.Hour -lt 12) { $dt = $dt.AddDays(1) }
  $nowTpe = [DateTimeOffset]::UtcNow.ToOffset($tpe).DateTime
  $live = (($nowTpe - $dt).TotalMinutes -lt 20)
  return '{"sym":"' + ($q.SymbolID -replace '-.*$', '') + '","p":' + (Num $q.CLastPrice) + ',"ref":' + (Num $q.CRefPrice) +
    ',"t":"' + $dt.ToString('yyyy-MM-dd HH:mm') + '","live":' + $(if ($live) { 'true' } else { 'false' }) + '}'
}

$parts = New-Object System.Collections.Generic.List[string]
$parts.Add('"at":"' + [DateTimeOffset]::UtcNow.ToOffset($tpe).ToString('yyyy-MM-dd HH:mm') + '"')
foreach ($s in @(@('^TWII', 'taiex'), @('^IXIC', 'ndq'), @('^SOX', 'sox'), @('^GSPC', 'spx'), @('^DJI', 'dji'), @('TSM', 'tsm'), @('TWD=X', 'twd'))) {
  try { $parts.Add('"' + $s[1] + '":' + (Get-Yahoo $s[0])); Write-Host "  $($s[0]) ok" }
  catch { Write-Host "  $($s[0]) skipped: $($_.Exception.Message)" }
  Start-Sleep -Milliseconds 500
}
try { $parts.Add('"fut":' + (Get-Taifex '0')); $parts.Add('"night":' + (Get-Taifex '1')); Write-Host '  TAIFEX ok' }
catch { Write-Host "  TAIFEX skipped: $($_.Exception.Message)" }

$out = Join-Path (Join-Path $root 'data') 'quotes-data.js'
[IO.File]::WriteAllText($out, 'window.QUOTES = {' + ($parts -join ',') + '};', $utf8)
Write-Host "Done -> $out"
