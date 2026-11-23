[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string[]]$CompanyFolder,

    [string]$ConfigRoot
)

$ErrorActionPreference = 'Stop'

if (-not $ConfigRoot) {
    if ($env:HERDR_APP_HOME) { $ConfigRoot = $env:HERDR_APP_HOME }
    elseif ($env:XDG_CONFIG_HOME) { $ConfigRoot = Join-Path $env:XDG_CONFIG_HOME 'herdr-app' }
    else { $ConfigRoot = Join-Path (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.config') 'herdr-app' }
}
$ConfigRoot = [IO.Path]::GetFullPath($ConfigRoot)
$roots = @($CompanyFolder | ForEach-Object {
    $folder = $_.Trim().Replace('\', '/')
    if ($folder -notmatch '^[A-Za-z]:/|^//[^/]+/[^/]+') {
        throw "Enter absolute Windows drive or UNC paths for -CompanyFolder. Invalid path: $_"
    }
    $folder
} | Select-Object -Unique)
if ($roots.Count -eq 0) { throw 'Supply at least one company folder.' }

$bundleRoot = $PSScriptRoot
$layoutName = 'personal-company-windows'
$layoutFile = "$layoutName.json"
$sourceLayout = Join-Path (Join-Path $bundleRoot 'layouts') $layoutFile
$targetLayout = Join-Path (Join-Path $ConfigRoot 'layouts') $layoutFile
$keysFile = Join-Path $ConfigRoot 'keys.json'
if (-not (Test-Path -LiteralPath $keysFile -PathType Leaf)) {
    throw "Open Herdr App once to create its default keys, or pass its actual config folder with -ConfigRoot. Expected: $keysFile"
}

function Read-JsonFile([string]$Path) {
    $document = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($document -isnot [PSCustomObject]) { throw "Expected a JSON object in $Path" }
    $document
}

function Put-Property($Document, [string]$Name, $Value) {
    $entry = $Document.PSObject.Properties[$Name]
    if ($entry) { $entry.Value = $Value }
    else { $Document | Add-Member -MemberType NoteProperty -Name $Name -Value $Value }
}

function Find-SpaceBlock($Node) {
    if ($Node.id -eq 'spaces' -and $Node.content.mod -eq 'pc-win-spaces') { return $Node }
    foreach ($child in $Node.children) {
        $found = Find-SpaceBlock $child
        if ($found) { return $found }
    }
}

function Write-JsonFile([string]$Path, $Document) {
    $folder = Split-Path -Parent $Path
    [IO.Directory]::CreateDirectory($folder) | Out-Null
    $stage = Join-Path $folder ('.herdr-config-' + [Guid]::NewGuid())
    try {
        $text = ($Document | ConvertTo-Json -Depth 100) + [Environment]::NewLine
        [IO.File]::WriteAllText($stage, $text, [Text.UTF8Encoding]::new($false))
        if ([IO.File]::Exists($Path)) { [IO.File]::Replace($stage, $Path, [NullString]::Value) }
        else { [IO.File]::Move($stage, $Path) }
    } finally {
        if ([IO.File]::Exists($stage)) { [IO.File]::Delete($stage) }
    }
}

$layout = if (Test-Path -LiteralPath $targetLayout) { Read-JsonFile $targetLayout } else { Read-JsonFile $sourceLayout }
$spaceBlock = Find-SpaceBlock $layout
if (-not $spaceBlock) { throw "Existing $layoutFile is not this bundle's layout. No files were written." }
Put-Property $spaceBlock.content.props 'companyFolders' $roots

$keys = Read-JsonFile $keysFile
$overlay = Read-JsonFile (Join-Path $bundleRoot 'keys.json')
foreach ($shortcut in @('ctrl-w', 'ctrl-n')) {
    if ($keys.terminal -and $keys.terminal.PSObject.Properties[$shortcut]) {
        throw "The terminal section already binds $shortcut above layout shortcuts. Review that binding in $keysFile first. No files were written."
    }
}
foreach ($section in $overlay.PSObject.Properties) {
    $existing = $keys.PSObject.Properties[$section.Name]
    if ($existing -and $existing.Value -isnot [PSCustomObject]) {
        throw "Invalid key section $($section.Name) in $keysFile"
    }
    if (-not $existing) { Put-Property $keys $section.Name ([PSCustomObject]@{}) }
    $bindings = $keys.PSObject.Properties[$section.Name].Value
    foreach ($binding in $section.Value.PSObject.Properties) {
        $prior = $bindings.PSObject.Properties[$binding.Name]
        if ($prior -and ($prior.Value -isnot [string] -or $prior.Value -ne $binding.Value)) {
            throw "Shortcut conflict in $($section.Name): $($binding.Name). No files were written."
        }
        Put-Property $bindings $binding.Name $binding.Value
    }
}

$mods = Join-Path $ConfigRoot 'mods'
$bundled = @(Get-ChildItem -LiteralPath (Join-Path $bundleRoot 'mods') -Directory)
$installMods = @()
foreach ($mod in $bundled) {
    $target = Join-Path $mods $mod.Name
    if (-not (Test-Path -LiteralPath $target)) {
        $installMods += $mod
        continue
    }
    # Do not overwrite a different mod or a manually edited installation.
    foreach ($source in Get-ChildItem -LiteralPath $mod.FullName -Recurse -File) {
        $relative = $source.FullName.Substring($mod.FullName.Length + 1)
        $installed = Join-Path $target $relative
        if (-not (Test-Path -LiteralPath $installed -PathType Leaf) -or
            (Get-FileHash -LiteralPath $source.FullName).Hash -ne (Get-FileHash -LiteralPath $installed).Hash) {
            throw "Existing mod $($mod.Name) differs from this bundle. No files were written."
        }
    }
}

$backups = Join-Path (Join-Path $ConfigRoot 'backups') ('personal-company-windows-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
[IO.Directory]::CreateDirectory($backups) | Out-Null
Copy-Item -LiteralPath $keysFile -Destination (Join-Path $backups 'keys.json')
if (Test-Path -LiteralPath $targetLayout) {
    Copy-Item -LiteralPath $targetLayout -Destination (Join-Path $backups $layoutFile)
}
[IO.Directory]::CreateDirectory($mods) | Out-Null
foreach ($mod in $installMods) {
    $stage = Join-Path $ConfigRoot ('.herdr-mod-' + [Guid]::NewGuid())
    try {
        Copy-Item -LiteralPath $mod.FullName -Destination $stage -Recurse
        [IO.Directory]::Move($stage, (Join-Path $mods $mod.Name))
    } finally {
        if ([IO.Directory]::Exists($stage)) { [IO.Directory]::Delete($stage, $true) }
    }
}

Write-JsonFile $targetLayout $layout
Write-JsonFile $keysFile $keys
Write-Host "Installed $layoutName in $ConfigRoot"
Write-Host "Keys and previous layout backed up to $backups"
Write-Host "Select the new layout in Herdr, or run: herdr-app do layout.switch --name $layoutName"
