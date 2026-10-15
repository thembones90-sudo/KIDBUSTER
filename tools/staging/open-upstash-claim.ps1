# Open only when the owner chooses to claim the temporary test database.
# The private Upstash claim URL stays in Git-ignored .v2-local and is never printed.
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$private=Join-Path $root '.v2-local\upstash-guest-redis-instructions.md'
if(!(Test-Path -LiteralPath $private)){throw 'No temporary Upstash database exists.'}
$url=Get-Content -LiteralPath $private |
  Where-Object {$_.Trim() -match '^https://upstash\.com/'} |
  Select-Object -First 1
if(!$url){throw 'The private claim URL was not found.'}
$uri=[Uri]$url.Trim()
if($uri.Scheme -ne 'https' -or $uri.Host -ne 'upstash.com'){
  throw 'Refusing to open an unrecognized claim URL.'
}
Start-Process -FilePath $uri.AbsoluteUri
Write-Output 'Opened the official Upstash claim page in your browser.'
