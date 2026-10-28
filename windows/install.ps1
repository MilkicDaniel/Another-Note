$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('another-note-' + [Guid]::NewGuid())
$destination = Join-Path $env:LOCALAPPDATA 'Programs\Another Note'
$form = New-Object Windows.Forms.Form
$form.Text = 'Another Note Setup'
$form.Width = 400; $form.Height = 130; $form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'; $form.MaximizeBox = $false; $form.MinimizeBox = $false
$label = New-Object Windows.Forms.Label
$label.Text = 'Installing Another Note...'; $label.Dock = 'Fill'; $label.TextAlign = 'MiddleCenter'
$form.Controls.Add($label)
try {
    $running = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase) }
    if ($running) { throw 'Close all Another Note windows before installing this update. Your files have been kept.' }
    $form.Show(); [Windows.Forms.Application]::DoEvents()
    [IO.Directory]::CreateDirectory($temporary) | Out-Null
    $archive = Join-Path $temporary 'payload.zip'
    $source = [IO.File]::OpenRead($env:ANOTHER_NOTE_SETUP)
    try {
        $footer = New-Object byte[] 56
        $source.Seek(-56, [IO.SeekOrigin]::End) | Out-Null
        if ($source.Read($footer, 0, 56) -ne 56) { throw 'The installer is incomplete. Download it again.' }
        if ([Text.Encoding]::ASCII.GetString($footer, 0, 14) -ne 'ANOTEPAYLOADv1') { throw 'The installer payload is invalid.' }
        $remaining = [BitConverter]::ToInt64($footer, 16)
        if ($remaining -lt 1 -or $remaining -gt ($source.Length - 56)) { throw 'The installer payload is incomplete.' }
        $source.Seek($source.Length - 56 - $remaining, [IO.SeekOrigin]::Begin) | Out-Null
        $output = [IO.File]::Create($archive)
        try {
            $buffer = New-Object byte[] 65536
            while ($remaining -gt 0) {
                $count = $source.Read($buffer, 0, [int][Math]::Min($remaining, $buffer.Length))
                if ($count -le 0) { throw 'The installer download is incomplete.' }
                $output.Write($buffer, 0, $count); $remaining -= $count
                [Windows.Forms.Application]::DoEvents()
            }
        } finally { $output.Dispose() }
    } finally { $source.Dispose() }
    $expectedHash = [BitConverter]::ToString($footer, 24, 32).Replace('-', '')
    if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $expectedHash) { throw 'The installer download is damaged. Download it again.' }
    $extracted = Join-Path $temporary 'extracted'
    [IO.Compression.ZipFile]::ExtractToDirectory($archive, $extracted)
    $app = Join-Path $extracted 'another-note-windows'
    if (!(Test-Path (Join-Path $app 'Another-Note.exe')) -or !(Test-Path (Join-Path $app 'runtime\pythonw.exe'))) { throw 'The application package is incomplete.' }
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    Copy-Item (Join-Path $app '*') $destination -Recurse -Force
    $shell = New-Object -ComObject WScript.Shell
    $shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Another Note.lnk'
    $shortcut = $shell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = Join-Path $destination 'Another-Note.exe'
    $shortcut.WorkingDirectory = $destination
    $shortcut.IconLocation = Join-Path $destination 'another-note.ico'
    $shortcut.Save()
    $form.Close()
    Start-Process (Join-Path $destination 'Another-Note.exe')
    exit 0
} catch {
    $form.Close()
    [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Another Note Setup', 'OK', 'Error') | Out-Null
    exit 1
} finally {
    if (Test-Path $temporary) { Remove-Item $temporary -Recurse -Force -ErrorAction SilentlyContinue }
}
