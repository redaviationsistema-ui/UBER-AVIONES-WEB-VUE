# Render Auth/CORS Checklist

Checklist para publicar el backend con sesion por cookie `HttpOnly`, CORS con credenciales y frontend local en `http://localhost:5173`.

## 1. Variables de entorno en Render

Configura estas variables en el servicio del backend:

```env
<!-- APP_URL=https://uber-aviones.onrender.com -->

SESSION_DRIVER=database
SESSION_DOMAIN=
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=none

AUTH_TOKEN_COOKIE=red_aviation_session
AUTH_TOKEN_TTL_MINUTES=43200
AUTH_TOKEN_SAME_SITE=none

CORS_ALLOWED_ORIGINS=https://uber-aviones-web.vercel.app,http://localhost:5173,http://127.0.0.1:5173
```

Notas:

- Usa `SESSION_DOMAIN=` vacio si frontend y backend viven en dominios distintos.
- Si luego mueves frontend y backend a subdominios del mismo dominio raiz, cambia `SESSION_DOMAIN` a algo como `.redaviation.com`.

## 2. Desplegar el backend actualizado

El servicio en Render debe incluir estos cambios:

- `app/Http/Controladores/AutenticacionControlador.php`
- `app/Http/Intermediarios/TokenApiIntermediario.php`
- `app/Http/Intermediarios/CorsIntermediario.php`

## 3. Limpiar cache de Laravel

Despues del deploy o despues de cambiar variables:

```bash
php artisan config:clear
php artisan cache:clear
```

## 4. Confirmar que la tabla de sesiones existe

El backend usa:

```env
SESSION_DRIVER=database
```

Asi que debe existir la tabla `sessions`.

## 5. Verificar preflight CORS

El backend no debe responder:

```http
Access-Control-Allow-Origin: *
```

Debe responder algo asi:

```http
Access-Control-Allow-Origin: http://localhost:5173
Access-Control-Allow-Credentials: true
```

Prueba con:
http://127.0.0.1:8000/api/v1'
```bash
<!-- curl -i -X OPTIONS "https://uber-aviones.onrender.com/api/v1/auth/login" ^ -->

  -H "Origin: http://localhost:5173" ^
  -H "Access-Control-Request-Method: POST" ^
  -H "Access-Control-Request-Headers: content-type"
```

Debes ver en la respuesta:

- `HTTP/1.1 204`
- `Access-Control-Allow-Origin: http://localhost:5173`
- `Access-Control-Allow-Credentials: true`

## 6. Verificar login con cookie

Prueba login real:

```bash
<!-- curl -i -X POST "https://uber-aviones.onrender.com/api/v1/auth/login" ^ -->
  -H "Origin: http://localhost:5173" ^
  -H "Content-Type: application/json" ^
  --data "{\"email\":\"admin@privateflights.test\",\"password\":\"password\"}"
```

Debes recibir:

- `Set-Cookie: red_aviation_session=...`
- JSON con `success: true`
- JSON con `user`, `access` y `login_context`

## 7. Verificar sesion autenticada

Con la cookie devuelta por login:

```bash
<!-- curl -i "https://uber-aviones.onrender.com/api/v1/auth/me" ^ -->
  -H "Origin: http://localhost:5173" ^
  -H "Cookie: red_aviation_session=PEGA_AQUI_EL_VALOR"
```

Debes recibir:

- `200 OK`
- `Access-Control-Allow-Origin: http://localhost:5173`
- `Access-Control-Allow-Credentials: true`
- datos del usuario autenticado

## 8. Si sigue fallando

Revisa esto en orden:

1. Render si despliego la ultima version del backend.
2. Render si realmente guardo `CORS_ALLOWED_ORIGINS`.
3. Si el servicio fue reiniciado despues de cambiar variables.
4. Si `php artisan config:clear` si corrio en produccion.
5. Si la respuesta OPTIONS sigue regresando `*`.

Si OPTIONS sigue devolviendo `*`, Render todavia esta ejecutando una version vieja del backend.

## 9. Script local incluido

Tambien puedes probarlo con el script del proyecto:

```powershell
.\scripts\check-render-auth-cors.ps1
```

Para probar tambien login y `/auth/me`:

```powershell
.\scripts\check-render-auth-cors.ps1 -Email "admin@privateflights.test" -Password "password"
```
