# Suscripcion Por Avion + Trial De 15 Dias

## Tablas base

- `providers`
- `aircraft`
- `aircraft_documents`
- `subscription_plans`
- `aircraft_subscriptions`
- `flight_requests`
- `flight_request_matches`
- `reservations`

## Relacion multi-proveedor aislada

Modelo logico:

- `users -> provider_id`
- `providers -> id`
- `aircraft -> provider_id`

Cada usuario proveedor debe tener su `provider_id`.
Cada aeronave debe tener su `provider_id`.

## Regla de aislamiento

El proveedor solo puede consultar sus propios registros:

```php
Aircraft::where('provider_id', auth()->user()->provider_id)->get();
```

Y para solicitudes:

```php
FlightRequest::where('provider_id', auth()->user()->provider_id)->get();
```

No debe usarse un listado global como:

```php
Aircraft::all();
```

## Estados de aeronave

- `draft`
- `pending_review`
- `trial_active`
- `active`
- `trial_expired`
- `suspended`
- `rejected`
- `archived`

## Regla del trial

Cuando el proveedor registra una aeronave:

- `trial_starts_at = now()`
- `trial_ends_at = now() + 15 dias`
- `status = trial_active`
- `approved_at = null`

La aeronave solo entra a matching cuando:

- `status in ('trial_active', 'active')`
- `approved_at is not null`
- documentos vigentes
- capacidad suficiente
- disponibilidad correcta

## Regla de suspension automatica

Comando sugerido: `CheckAircraftTrials`

Debe localizar aeronaves con:

- `trial_ends_at < now()`
- sin suscripcion activa
- `status in ('trial_active', 'pending_review')`

Y actualizarlas a:

- `status = suspended`

## Endpoints sugeridos

### Admin

- `GET /api/admin/providers`
- `POST /api/admin/providers`
- `GET /api/admin/aircraft`
- `PUT /api/admin/aircraft/{id}/approve`
- `PUT /api/admin/aircraft/{id}/reject`
- `PUT /api/admin/aircraft/{id}/suspend`
- `GET /api/admin/subscriptions`

### Proveedor

- `GET /api/provider/dashboard`
- `GET /api/provider/my-aircraft`
- `GET /api/proveedor/mis-aeronaves`
- `GET /api/provider/my-requests`
- `GET /api/proveedor/mis-solicitudes`
- `POST /api/provider/aircraft`
- `POST /api/provider/aircraft/{id}/documents`
- `GET /api/provider/aircraft/{id}/subscription`
- `POST /api/provider/aircraft/{id}/subscribe`

## Regla importante de documentos

La carga de documentos de aeronave debe permitirse aunque:

- el proveedor siga en revision
- la aeronave siga en `draft`
- la aeronave siga en `pending_review`
- la aeronave siga `blocked`

La aprobacion solo debe bloquear:

- publicacion comercial
- matching
- visibilidad al cliente

### Cliente

- `POST /api/client/flight-requests`
- `GET /api/client/flight-requests`
- `GET /api/client/flight-requests/{id}`
- `POST /api/client/flight-requests/{id}/reserve`

## Payload minimo de aeronave

```json
{
  "provider_id": 101,
  "model": "Learjet 45XR",
  "manufacturer": "Bombardier",
  "registration": "XA-LJR",
  "year": 2016,
  "capacity": 8,
  "range_km": 3700,
  "base_airport": "MMMY",
  "hourly_rate": 5200,
  "status": "trial_active",
  "trial_starts_at": "2026-05-04T12:00:00Z",
  "trial_ends_at": "2026-05-19T12:00:00Z",
  "approved_at": null
}
```

## Columnas requeridas en `aircraft`

Para que el frontend del operador pueda crear y editar aeronaves sin errores SQL, la tabla `aircraft` debe contemplar al menos:

- `manufacturer` `varchar(255)` nullable
- `coverage` `text` nullable
- `amenities` `jsonb` default `[]`
- `minimum_hours` `integer` default `0`
- `operational_cost` `numeric(12,2)` default `0`
- `model_year` `integer` nullable

Nota de integracion:

- el frontend envia `year`
- el backend puede mapearlo a `model_year`
- `amenities` llega como arreglo desde la UI del operador
