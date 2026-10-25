# Original repo-native geometry, matching desktop-control.svg. No external renderer/package.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$previewRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.cache/visual-identity'))
New-Item -ItemType Directory -Path $previewRoot -Force | Out-Null
function New-RoundRect([single]$x,[single]$y,[single]$width,[single]$height,[single]$radius) {
    $p = [Drawing.Drawing2D.GraphicsPath]::new()
    $d = $radius * 2
    $p.AddArc($x,$y,$d,$d,180,90)
    $p.AddArc($x+$width-$d,$y,$d,$d,270,90)
    $p.AddArc($x+$width-$d,$y+$height-$d,$d,$d,0,90)
    $p.AddArc($x,$y+$height-$d,$d,$d,90,90)
    $p.CloseFigure()
    return $p
}
$canvas = [Drawing.Bitmap]::new(512,512,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [Drawing.Graphics]::FromImage($canvas)
$g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.ScaleTransform(4,4)
$surface = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.PointF]::new(2,2),[Drawing.PointF]::new(126,126),[Drawing.ColorTranslator]::FromHtml('#152740'),[Drawing.ColorTranslator]::FromHtml('#091321'))
$window = [Drawing.Drawing2D.LinearGradientBrush]::new([Drawing.PointF]::new(19,26),[Drawing.PointF]::new(109,101),[Drawing.ColorTranslator]::FromHtml('#68D9F4'),[Drawing.ColorTranslator]::FromHtml('#2374DE'))
$bg = New-RoundRect 2 2 124 124 28
$pane = New-RoundRect 19 26 90 75 13
$g.FillPath($surface,$bg); $g.FillPath($window,$pane)
$divider = [Drawing.Pen]::new([Drawing.Color]::FromArgb(140,212,247,255),2)
$g.DrawLine($divider,20,46,108,46)
$dot = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#E8FBFF'))
$dotMuted = [Drawing.SolidBrush]::new([Drawing.Color]::FromArgb(166,232,251,255))
$g.FillEllipse($dot,27.5,33.5,5,5); $g.FillEllipse($dotMuted,36.5,33.5,5,5)
$line = [Drawing.Pen]::new([Drawing.Color]::FromArgb(179,232,251,255),4)
$line.StartCap = $line.EndCap = [Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($line,30,61,41,61); $g.DrawLine($line,30,71,38,71)
$cursor = [Drawing.Drawing2D.GraphicsPath]::new()
$points = [Drawing.PointF[]]@([Drawing.PointF]::new(53,49),[Drawing.PointF]::new(91,78),[Drawing.PointF]::new(73,81),[Drawing.PointF]::new(65,101),[Drawing.PointF]::new(56,97),[Drawing.PointF]::new(64,78),[Drawing.PointF]::new(47,80))
$cursor.AddPolygon($points)
$ink = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#07101B'))
$outline = [Drawing.Pen]::new([Drawing.ColorTranslator]::FromHtml('#F2FCFF'),3)
$outline.LineJoin = [Drawing.Drawing2D.LineJoin]::Round
$g.FillPath($ink,$cursor); $g.DrawPath($outline,$cursor)
$ring = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#0E1C2F'))
$indicator = [Drawing.SolidBrush]::new([Drawing.ColorTranslator]::FromHtml('#43E3C2'))
$g.FillEllipse($ring,92,16,22,22); $g.FillEllipse($indicator,96.5,20.5,13,13)
$g.Dispose()
foreach ($size in @(16,32,64,128)) {
    $bitmap = [Drawing.Bitmap]::new($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $scaled = [Drawing.Graphics]::FromImage($bitmap)
    $scaled.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $scaled.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scaled.DrawImage($canvas,0,0,$size,$size)
    $name = if ($size -eq 64) { 'desktop-control.png' } else { "desktop-control-$size.png" }
    $destination = if ($size -eq 64) { $PSScriptRoot } else { $previewRoot }
    $bitmap.Save((Join-Path $destination $name),[Drawing.Imaging.ImageFormat]::Png)
    $scaled.Dispose(); $bitmap.Dispose()
}
foreach ($resource in @($surface,$window,$bg,$pane,$divider,$dot,$dotMuted,$line,$cursor,$ink,$outline,$ring,$indicator,$canvas)) { $resource.Dispose() }
