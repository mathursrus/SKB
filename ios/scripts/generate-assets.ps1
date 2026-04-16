# Generates placeholder brand assets for the SKB Host Stand iOS app.
# Palette matches src/ui/theme.ts: surface #171a21, accent #ffb347.
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-assets.ps1

Add-Type -AssemblyName System.Drawing

$assetsDir = Join-Path (Split-Path -Parent $PSScriptRoot) "assets"
if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir | Out-Null
}

$surface = [System.Drawing.Color]::FromArgb(255, 23, 26, 33)    # #171a21
$accent  = [System.Drawing.Color]::FromArgb(255, 255, 179, 71)  # #ffb347
$ink     = [System.Drawing.Color]::FromArgb(255, 42, 26, 0)     # #2a1a00 (dark amber)

function New-SkbIcon {
    param(
        [int]$Size,
        [string]$Path,
        [bool]$Transparent = $false
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    if ($Transparent) {
        $g.Clear([System.Drawing.Color]::Transparent)
    } else {
        $g.Clear($surface)
    }

    # Amber rounded-square tile (flat, no gradient, Apple-mask-safe)
    $tileInset = [int]($Size * 0.10)
    $tileSize  = $Size - (2 * $tileInset)
    $tileRect  = New-Object System.Drawing.Rectangle $tileInset, $tileInset, $tileSize, $tileSize

    $radius = [int]($tileSize * 0.22)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    [void]$gp.AddArc($tileRect.X, $tileRect.Y, $d, $d, 180, 90)
    [void]$gp.AddArc($tileRect.Right - $d, $tileRect.Y, $d, $d, 270, 90)
    [void]$gp.AddArc($tileRect.Right - $d, $tileRect.Bottom - $d, $d, $d, 0, 90)
    [void]$gp.AddArc($tileRect.X, $tileRect.Bottom - $d, $d, $d, 90, 90)
    [void]$gp.CloseFigure()

    $brush = New-Object System.Drawing.SolidBrush $accent
    $g.FillPath($brush, $gp)
    $brush.Dispose()
    $gp.Dispose()

    # "SKB" glyph in dark ink centered on the tile
    $fontSize = [single]($tileSize * 0.40)
    $font = New-Object System.Drawing.Font "Arial", $fontSize, ([System.Drawing.FontStyle]::Bold)
    $inkBrush = New-Object System.Drawing.SolidBrush $ink
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
    $g.DrawString("SKB", $font, $inkBrush, [single]($Size / 2), [single]($Size / 2), $fmt)
    $font.Dispose()
    $inkBrush.Dispose()

    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()

    $bytes = (Get-Item $Path).Length
    Write-Host ("{0}  ({1} x {1}, {2} bytes)" -f (Split-Path -Leaf $Path), $Size, $bytes)
}

# Apple forbids transparency on the app icon, so keep Transparent=$false for icon.png.
New-SkbIcon -Size 1024 -Path (Join-Path $assetsDir "icon.png")             -Transparent $false
New-SkbIcon -Size 1024 -Path (Join-Path $assetsDir "splash-icon.png")      -Transparent $false
New-SkbIcon -Size 1024 -Path (Join-Path $assetsDir "adaptive-icon.png")    -Transparent $false
# Notification icon: transparent glyph only, per iOS HIG.
New-SkbIcon -Size 96   -Path (Join-Path $assetsDir "notification-icon.png") -Transparent $true

Write-Host ""
Write-Host "Done. Assets written to $assetsDir"
