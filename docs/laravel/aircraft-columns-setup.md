## Objetivo

Corregir el error de PostgreSQL:

```text
SQLSTATE[42703]: Undefined column: 7 ERROR: column "manufacturer" of relation "aircraft" does not exist
```

El frontend de este repo ya envia estos campos al backend:

- `manufacturer`
- `coverage`
- `amenities`
- `minimum_hours`
- `operational_cost`
- `year`

En el backend actual el update ya intenta persistir `model_year`, asi que la columna canonica recomendada en BD es `model_year`.

## SQL directo para PostgreSQL

Ejecuta el script:

`docs/postgres/aircraft-columns-patch.sql`

Ese parche:

- crea las columnas faltantes en `aircraft`
- usa `ADD COLUMN IF NOT EXISTS`
- migra datos desde `year` hacia `model_year` si `year` existe

## Archivos listos para copiar a tu backend Laravel

- `docs/laravel/2026_05_08_000000_add_operator_fields_to_aircraft_table.php`
- `docs/laravel/Aircraft.php`
- `docs/laravel/ProviderAircraftController.php`
- `docs/laravel/routes-aircraft-snippet.php`

Destino sugerido en tu backend real:

- `database/migrations/2026_05_08_000000_add_operator_fields_to_aircraft_table.php`
- `app/Models/Aircraft.php`
- `app/Http/Controllers/ProviderAircraftController.php`
- pega las rutas del snippet en `routes/api.php`

## Migracion Laravel sugerida

Crea una migracion similar a esta en tu backend Laravel real:

```php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('aircraft', function (Blueprint $table) {
            if (!Schema::hasColumn('aircraft', 'manufacturer')) {
                $table->string('manufacturer')->nullable();
            }
            if (!Schema::hasColumn('aircraft', 'coverage')) {
                $table->text('coverage')->nullable();
            }
            if (!Schema::hasColumn('aircraft', 'amenities')) {
                $table->jsonb('amenities')->default(DB::raw("'[]'::jsonb"));
            }
            if (!Schema::hasColumn('aircraft', 'minimum_hours')) {
                $table->integer('minimum_hours')->default(0);
            }
            if (!Schema::hasColumn('aircraft', 'operational_cost')) {
                $table->decimal('operational_cost', 12, 2)->default(0);
            }
            if (!Schema::hasColumn('aircraft', 'model_year')) {
                $table->integer('model_year')->nullable();
            }
        });

        if (Schema::hasColumn('aircraft', 'year') && Schema::hasColumn('aircraft', 'model_year')) {
            DB::statement('UPDATE aircraft SET model_year = COALESCE(model_year, year) WHERE year IS NOT NULL');
        }
    }

    public function down(): void
    {
        Schema::table('aircraft', function (Blueprint $table) {
            foreach (['manufacturer', 'coverage', 'amenities', 'minimum_hours', 'operational_cost', 'model_year'] as $column) {
                if (Schema::hasColumn('aircraft', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
```

## Mapeo recomendado en controlador

Si el frontend manda `year`, en tu backend conviene normalizar asi antes de guardar:

```php
$data = $request->validate([
    'model' => ['required', 'string', 'max:255'],
    'manufacturer' => ['nullable', 'string', 'max:255'],
    'registration' => ['required', 'string', 'max:255'],
    'year' => ['nullable', 'integer'],
    'capacity' => ['nullable', 'integer'],
    'range_km' => ['nullable', 'integer'],
    'amenities' => ['nullable', 'array'],
    'amenities.*' => ['string'],
    'base_airport' => ['nullable', 'string', 'max:255'],
    'coverage' => ['nullable', 'string'],
    'hourly_rate' => ['nullable', 'numeric'],
    'minimum_hours' => ['nullable', 'integer'],
    'operational_cost' => ['nullable', 'numeric'],
]);

$data['model_year'] = $data['year'] ?? null;
unset($data['year']);
```

## Por que tambien se corrige `amenities`

En tu error aparece esto:

```text
"amenities" = ,
```

Eso suele pasar cuando el backend recibe un valor vacio o mal serializado para una columna JSON/JSONB.

La solucion que te deje ya lo cubre:

- la migracion crea `amenities` como `jsonb`
- el modelo castea `amenities` como `array`
- el controlador convierte `amenities` en `[]` si viene vacio
- si llega string tipo `"WIFI, BAR, TV"` lo transforma en arreglo

## Pasos finales en tu backend real

1. Copia los 4 archivos a tu proyecto Laravel.
2. Ejecuta `php artisan migrate`.
3. Revisa que tu controlador de aeronaves use `manufacturer`, `coverage`, `amenities`, `minimum_hours`, `operational_cost` y `model_year`.
4. Si ya tenias otro controlador o modelo `Aircraft`, integra estos cambios en ese archivo en vez de duplicarlo.

## Lo que elimina este error

Con esto dejas cubiertos los dos problemas que disparan el fallo actual:

- la columna `manufacturer` ya existe en PostgreSQL
- el backend ya no intenta guardar `amenities` en formato invalido

## Nota importante

Desde este workspace no existe el backend Laravel real ni acceso directo a la base de datos de Render, asi que deje listo el parche para que lo ejecutes o lo copies en tu proyecto backend.
