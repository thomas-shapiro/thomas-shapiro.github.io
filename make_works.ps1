# make_works.ps1 - rebuilds the Works gallery from the photos in works-src\
#
# 1. Put photos in works-src\ and name each one "DATE Title", for example
#      2023 Snub cube.jpg      2021-06 Rhombic triacontahedron.png      Untitled sphere.jpg
#    The date (year, or year-month) is optional. The order is newest first.
#    To set the order yourself, put a number in front: "1pentakis_dodecahedron.jpg", "2 Snub cube.jpg".
#    The number is not shown (the title still starts with a capital) and numbered works come first.
#    Put each one in works-src\recent or works-src\early; that decides its group on the page.
#    Videos (.mp4 .mov .m4v .webm .avi .mkv) work too: the square shows a still and plays when pointed at.
#    Videos are used as they are; with ffmpeg installed (winget install Gyan.FFmpeg) they are also shrunk.
# 2. Double-click make_works.bat (or run:
#      powershell -ExecutionPolicy Bypass -File make_works.ps1 )
#
# It writes small copies to works\thumb (600 px) and works\full (1600 px), plus works.json.
# works-src\ holds your originals and is not uploaded (.gitignore). Only changed photos are redone.

Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$src = Join-Path $root 'works-src'
$thumbDir = Join-Path $root 'works\thumb'
$fullDir = Join-Path $root 'works\full'
New-Item -ItemType Directory -Force $src, $thumbDir, $fullDir | Out-Null
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }

function Save-Resized($path, $out, $max) {
  $img = [System.Drawing.Image]::FromFile($path)
  try {
    if ($img.PropertyIdList -contains 0x0112) {          # phone photos: apply the EXIF rotation
      switch ($img.GetPropertyItem(0x0112).Value[0]) {
        3 { $img.RotateFlip('Rotate180FlipNone') }
        6 { $img.RotateFlip('Rotate90FlipNone') }
        8 { $img.RotateFlip('Rotate270FlipNone') }
      }
    }
    $k = [Math]::Min(1.0, $max / [Math]::Max($img.Width, $img.Height))
    $w = [int]($img.Width * $k); $h = [int]($img.Height * $k)
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $g.InterpolationMode = 'HighQualityBicubic'; $g.PixelOffsetMode = 'HighQuality'
    $g.DrawImage($img, 0, 0, $w, $h)
    $p = New-Object System.Drawing.Imaging.EncoderParameters 1
    $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 85L
    $bmp.Save($out, $jpeg, $p)
    $g.Dispose(); $bmp.Dispose()
  } finally { $img.Dispose() }
}

$previewDir = Join-Path $root 'works\preview'
New-Item -ItemType Directory -Force $previewDir | Out-Null
$ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
$fit = { param($n) "scale=${n}:${n}:force_original_aspect_ratio=decrease:force_divisible_by=2" }

function Make-Video($path, $thumb, $preview, $full) {
  # still preview (frame at 1 s, or the first frame of a very short clip)
  & ffmpeg -y -loglevel error -ss 1 -i $path -frames:v 1 -vf (& $fit 600) -q:v 3 $thumb
  if (-not (Test-Path $thumb)) { & ffmpeg -y -loglevel error -i $path -frames:v 1 -vf (& $fit 600) -q:v 3 $thumb }
  # silent small clip that plays on hover, and a larger copy with sound that opens on click
  & ffmpeg -y -loglevel error -i $path -an -vf (& $fit 600) -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart $preview
  & ffmpeg -y -loglevel error -i $path -vf (& $fit 1280) -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart $full
}

$items = @(); $keep = @{}
# works-pos.txt: "file name without extension   0-100" moves a work up or down inside its square
$pos = @{}
$posFile = Join-Path $root 'works-pos.txt'
if (Test-Path $posFile) {
  foreach ($line in Get-Content $posFile -Encoding UTF8) {
    if ($line -match '^\s*([^#].*?)\s+(\d{1,3})\s*$') { $pos[$Matches[1]] = [int]$Matches[2] }
  }
}
# works-src\recent and works-src\early become the two groups on the page (a loose file counts as recent)
New-Item -ItemType Directory -Force (Join-Path $src 'recent'), (Join-Path $src 'early') | Out-Null
$files = Get-ChildItem $src -File -Recurse | Where-Object { $_.Extension -match '^\.(jpe?g|png|bmp|gif|tiff?|mp4|mov|m4v|webm|avi|mkv)$' }
foreach ($f in $files) {
  $group = if ($f.DirectoryName -eq $src) { 'recent' } else { $f.Directory.Name.ToLower() }
  $isVideo = $f.Extension -match '^\.(mp4|mov|m4v|webm|avi|mkv)$'
  $date = ''; $title = $f.BaseName; $order = 100000
  # optional order number glued to the front: "1pentakis_dodecahedron" -> order 1, title "Pentakis dodecahedron"
  if ($title -match '^(\d{1,3})(?!\d)[ _.\-]?(.+)$') { $order = [int]$Matches[1]; $title = $Matches[2] }
  $name = $title                                     # file name without the order number
  if ($title -match '^(\d{4}(?:-\d{2}){0,2})\s+(.+)$') { $date = $Matches[1]; $title = $Matches[2] }
  $title = $title -replace '_', ' '
  $title = $title.Substring(0, 1).ToUpper() + $title.Substring(1)
  $slug = (($name.ToLower() -replace '[^a-z0-9]+', '-').Trim('-'))   # renumbering keeps the same file names
  if (-not $slug) { $slug = 'work' }
  while ($keep.ContainsKey("$slug.jpg")) { $slug += '-2' }
  $keep["$slug.jpg"] = $true
  $ext = if ($isVideo) { 'mp4' } else { 'jpg' }
  $keep["$slug.$ext"] = $true
  $t = Join-Path $thumbDir "$slug.jpg"; $u = Join-Path $fullDir "$slug.$ext"; $v = Join-Path $previewDir "$slug.mp4"
  $stale = -not (Test-Path $u) -or (Get-Item $u).LastWriteTime -lt $f.LastWriteTime
  if ($isVideo -and $ff -and -not (Test-Path $t)) { $stale = $true }
  if ($stale) {
    Write-Host "  $($f.Name)"
    if ($isVideo -and $ff) { Make-Video $f.FullName $t $v $u }
    elseif ($isVideo) { Copy-Item $f.FullName $u -Force }    # no ffmpeg: use the video as it is
    else { Save-Resized $f.FullName $t 600; Save-Resized $f.FullName $u 1600 }
  }
  $item = [ordered]@{ title = $title; date = $date; group = $group; thumb = "works/thumb/$slug.jpg"; full = "works/full/$slug.$ext" }
  if ($pos.ContainsKey($f.BaseName)) { $item.pos = "50% $($pos[$f.BaseName])%" }
  elseif ($pos.ContainsKey($name)) { $item.pos = "50% $($pos[$name])%" }
  if ($isVideo) {
    if (Test-Path $v) { $item.video = "works/preview/$slug.mp4" } else { $item.video = $item.full; $item.thumb = '' }
  }
  $sortKey = $order
  $items += [pscustomobject]$item | Add-Member -NotePropertyName _order -NotePropertyValue $sortKey -PassThru
}
# drop copies whose original was removed or renamed
foreach ($d in $thumbDir, $fullDir, $previewDir) {
  Get-ChildItem $d -File | Where-Object { -not $keep.ContainsKey($_.Name) } | Remove-Item
}
# numbered works first, in number order; then the rest, newest first, then by title
$items = @($items | Sort-Object _order, @{ Expression = 'date'; Descending = $true }, title |
           Select-Object -Property * -ExcludeProperty _order)
$json = ConvertTo-Json -InputObject $items
if ($items.Count -eq 0) { $json = '[]' }
[IO.File]::WriteAllText((Join-Path $root 'works.json'), $json, (New-Object Text.UTF8Encoding $false))
Write-Host "$($items.Count) works written to works.json"
