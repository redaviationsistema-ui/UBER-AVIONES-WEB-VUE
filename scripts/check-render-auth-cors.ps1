param(
    [string]$ApiBaseUrl = "https://uber-aviones.onrender.com/api/v1",
    [string]$Origin = "http://localhost:5173",
    [string]$Email = "",
    [string]$Password = ""
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Net.Http

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

function Convert-HeadersToHashtable {
    param(
        [System.Collections.IDictionary]$Headers
    )

    $result = @{}

    if (-not $Headers) {
        return $result
    }

    foreach ($key in $Headers.Keys) {
        $result[$key] = [string]::Join(", ", $Headers[$key])
    }

    return $result
}

function New-CompatResponse {
    param(
        [System.Net.Http.HttpResponseMessage]$Response
    )

    $allHeaders = @{}

    foreach ($header in $Response.Headers) {
        $allHeaders[$header.Key] = [string]::Join(", ", $header.Value)
    }

    foreach ($header in $Response.Content.Headers) {
        $allHeaders[$header.Key] = [string]::Join(", ", $header.Value)
    }

    return [pscustomobject]@{
        StatusCode = [int]$Response.StatusCode
        Headers    = $allHeaders
        Content    = $Response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    }
}

function Invoke-HttpRequest {
    param(
        [string]$Url,
        [string]$Method,
        [hashtable]$Headers,
        [string]$Body = $null,
        [System.Net.CookieContainer]$CookieContainer = $null,
        [string]$ContentType = ""
    )

    $handler = New-Object System.Net.Http.HttpClientHandler
    $handler.AllowAutoRedirect = $true

    if ($CookieContainer) {
        $handler.UseCookies = $true
        $handler.CookieContainer = $CookieContainer
    }
    else {
        $handler.UseCookies = $false
    }

    $client = [System.Net.Http.HttpClient]::new($handler)

    try {
        $request = [System.Net.Http.HttpRequestMessage]::new(
            [System.Net.Http.HttpMethod]::new($Method),
            $Url
        )

        $requestHeaders = if ($Headers) { $Headers } else { @{} }

        foreach ($key in $requestHeaders.Keys) {
            [void]$request.Headers.TryAddWithoutValidation($key, [string]$requestHeaders[$key])
        }

        if ($null -ne $Body) {
            $mediaType = if ($ContentType) { $ContentType } else { "application/json" }
            $request.Content = [System.Net.Http.StringContent]::new(
                $Body,
                [System.Text.Encoding]::UTF8,
                $mediaType
            )
        }

        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        return New-CompatResponse -Response $response
    }
    finally {
        $client.Dispose()
        $handler.Dispose()
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

    return Invoke-HttpRequest -Url $Url -Method "OPTIONS" -Headers $headers
}

function Invoke-JsonRequest {
    param(
        [string]$Url,
        [string]$Method,
        [hashtable]$Body,
        [System.Net.CookieContainer]$CookieContainer
    )

    $headers = @{
        Origin = $Origin
    }

    $jsonBody = if ($Body) { $Body | ConvertTo-Json -Depth 10 } else { $null }

    return Invoke-HttpRequest `
        -Url $Url `
        -Method $Method `
        -Headers $headers `
        -ContentType "application/json" `
        -Body $jsonBody `
        -CookieContainer $CookieContainer
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

$cookieContainer = New-Object System.Net.CookieContainer

Write-Section "Login"
$loginResponse = Invoke-JsonRequest -Url $loginUrl -Method POST -Body @{
    email = $Email
    password = $Password
} -CookieContainer $cookieContainer

Write-Host "Status: $($loginResponse.StatusCode)"
Show-ImportantHeaders -headers $loginResponse.Headers

if ($loginResponse.Content) {
    Write-Host "Body:"
    Write-Host $loginResponse.Content
}

Write-Section "Cookies Guardadas"
$savedCookies = $cookieContainer.GetCookies($ApiBaseUrl)

if ($savedCookies.Count -eq 0) {
    Write-Host "No se guardaron cookies en la sesion." -ForegroundColor Yellow
} else {
    foreach ($cookie in $savedCookies) {
        Write-Host "$($cookie.Name) = $($cookie.Value)"
    }
}

Write-Section "Auth Me"
$meResponse = Invoke-JsonRequest -Url $meUrl -Method GET -Body $null -CookieContainer $cookieContainer
Write-Host "Status: $($meResponse.StatusCode)"
Show-ImportantHeaders -headers $meResponse.Headers

if ($meResponse.Content) {
    Write-Host "Body:"
    Write-Host $meResponse.Content
}
