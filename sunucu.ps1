$ErrorActionPreference = "Stop"

$projectDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectDirectory

function Find-PythonCommand {
    $candidates = @("py", "python", "python3")

    foreach ($candidate in $candidates) {
        $command = Get-Command $candidate -ErrorAction SilentlyContinue
        if (-not $command) {
            continue
        }

        try {
            & $candidate --version *> $null
            if ($LASTEXITCODE -eq 0) {
                return $candidate
            }
        }
        catch {
            # Siradaki Python komutunu dene.
        }
    }

    return $null
}

$pythonCommand = Find-PythonCommand
if (-not $pythonCommand) {
    Write-Host ""
    Write-Host "HATA: Bu bilgisayarda Python bulunamadi." -ForegroundColor Red
    Write-Host "Lutfen Python 3 kurun ve kurulum sirasinda 'Add Python to PATH' secenegini etkinlestirin." -ForegroundColor Yellow
    Write-Host "Aranan komutlar: py, python, python3"
    exit 1
}

function Test-PortAvailable {
    param([int]$Port)

    $listener = $null
    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
        $listener.Server.SetSocketOption(
            [System.Net.Sockets.SocketOptionLevel]::Socket,
            [System.Net.Sockets.SocketOptionName]::ReuseAddress,
            $true
        )
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        if ($listener) {
            $listener.Stop()
        }
    }
}

if (-not (Test-PortAvailable -Port 8080)) {
    Write-Host ""
    Write-Host "HATA: 8080 portu baska bir program veya eski sunucu tarafindan kullaniliyor." -ForegroundColor Red
    Write-Host "Eski sunucu penceresini Ctrl+C ile kapatin ve bu dosyayi yeniden calistirin." -ForegroundColor Yellow
    Write-Host "Tarayici acilmadi; boylece eski projenin goruntulenmesi engellendi."
    exit 1
}

$localAddresses = @(
    Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction SilentlyContinue |
        Where-Object {
            $_.IPAddress -ne "127.0.0.1" -and
            -not $_.IPAddress.StartsWith("169.254.") -and
            $_.InterfaceAlias -notmatch "Loopback" -and
            (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq "Up"
        } |
        Select-Object -ExpandProperty IPAddress -Unique
)

Write-Host ""
Write-Host "Tablet yerel ag sunucusu hazirlaniyor..." -ForegroundColor Cyan
Write-Host "Proje klasoru: $projectDirectory"
Write-Host "Python komutu: $pythonCommand"
Write-Host ""
Write-Host "Bu bilgisayarda:" -ForegroundColor Green
Write-Host "  http://localhost:8080/"
Write-Host ""

if ($localAddresses.Count -gt 0) {
    Write-Host "Tablette acilabilecek adresler:" -ForegroundColor Green
    foreach ($address in $localAddresses) {
        Write-Host "  http://${address}:8080/"
    }
}
else {
    Write-Host "Aktif bir yerel IPv4 adresi bulunamadi." -ForegroundColor Yellow
    Write-Host "PC ile tabletin ayni Wi-Fi veya yerel agda oldugunu kontrol edin."
}

Write-Host ""
Write-Host "Sunucuyu kapatmak icin Ctrl+C tuslarina basin." -ForegroundColor Yellow
Write-Host ""

try {
    Start-Process "http://localhost:8080/"
}
catch {
    Write-Host "Varsayilan tarayici otomatik acilamadi; adresi elle acabilirsiniz." -ForegroundColor Yellow
}

try {
    & $pythonCommand -m http.server 8080 --bind 0.0.0.0
    exit $LASTEXITCODE
}
catch {
    Write-Host ""
    Write-Host "HATA: HTTP sunucusu baslatilamadi." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
