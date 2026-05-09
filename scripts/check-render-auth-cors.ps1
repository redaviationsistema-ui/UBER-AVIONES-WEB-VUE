param(
    [string]$ApiBaseUrl = "https://uber-aviones.onrender.com/api/v1",
    [string]$Origin = "http://localhost:5173",
    [string]$Email = "",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

function Write-Section($title) {
    Write-Host ""
    Write-Host "=== $title ===" -ForegroundColor Cyan
}

function Show-ImportantHeaders($headers) {
    $keys = @(
        "Access-Control-Allow-Origin",
        "Access-Control-Allow-Credentials",
        "Access-Control-Allow-Methods",
        "Access-Control-Allow-Headers",
        "Set-Cookie",
        "Content-Type"
    )

    foreach ($key in $keys) {
        if ($headers[$key]) {
            Write-Host "${key}: $($headers[$key])"
        }
    }
}

function Invoke-OptionsRequest {
    param(
        [string]$Url
    )

    $headers = @{
        Origin                         = $Origin
        "Access-Control-Request-Method"  = "POST"
        "Access-Control-Request-Headers" = "content-type"
    }

    return Invoke-WebRequest -Uri $Url -Method OPTIONS -Headers $headers -SkipHttpErrorCheck
}

function Invoke-JsonRequest {
    param(
        [string]$Url,
        [string]$Method,
        [hashtable]$Body,
        [Microsoft.PowerShell.Commands.WebRequestSession]$Session
    )

    $headers = @{
        Origin = $Origin
    }

    $jsonBody = if ($Body) { $Body | ConvertTo-Json -Depth 10 } else { $null }

    return Invoke-WebRequest `
        -Uri $Url `
        -Method $Method `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $jsonBody `
        -WebSession $Session `
        -SkipHttpErrorCheck
}

$loginUrl = "$ApiBaseUrl/auth/login"
$meUrl = "$ApiBaseUrl/auth/me"

Write-Section "Preflight OPTIONS"
$optionsResponse = Invoke-OptionsRequest -Url $loginUrl
Write-Host "Status: $($optionsResponse.StatusCode)"
Show-ImportantHeaders -headers $optionsResponse.Headers

if ([string]::IsNullOrWhiteSpace($Email) -or [string]::IsNullOrWhiteSpace($Password)) {
    Write-Host ""
    Write-Host "No se envio Email/Password. Solo se valido el preflight CORS." -ForegroundColor Yellow
    Write-Host "Ejemplo:"
    Write-Host ".\scripts\check-render-auth-cors.ps1 -Email 'admin@privateflights.test' -Password 'password'"
    exit 0
}

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

Write-Section "Login"
$loginResponse = Invoke-JsonRequest -Url $loginUrl -Method POST -Body @{
    email = $Email
    password = $Password
} -Session $session

Write-Host "Status: $($loginResponse.StatusCode)"
Show-ImportantHeaders -headers $loginResponse.Headers

if ($loginResponse.Content) {
    Write-Host "Body:"
    Write-Host $loginResponse.Content
}

Write-Section "Cookies Guardadas"
if ($session.Cookies.Count -eq 0) {
    Write-Host "No se guardaron cookies en la sesion." -ForegroundColor Yellow
} else {
    foreach ($cookie in $session.Cookies.GetCookies($ApiBaseUrl)) {
        Write-Host "$($cookie.Name) = $($cookie.Value)"
    }
}

Write-Section "Auth Me"
$meResponse = Invoke-JsonRequest -Url $meUrl -Method GET -Body $null -Session $session
Write-Host "Status: $($meResponse.StatusCode)"
Show-ImportantHeaders -headers $meResponse.Headers

if ($meResponse.Content) {
    Write-Host "Body:"
    Write-Host $meResponse.Content
}
