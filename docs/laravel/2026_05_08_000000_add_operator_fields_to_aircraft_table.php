<?php

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
            DB::statement('
                UPDATE aircraft
                SET model_year = COALESCE(model_year, year)
                WHERE year IS NOT NULL
            ');
        }
    }

    public function down(): void
    {
        Schema::table('aircraft', function (Blueprint $table) {
            $columns = [
                'manufacturer',
                'coverage',
                'amenities',
                'minimum_hours',
                'operational_cost',
                'model_year',
            ];

            $existingColumns = array_values(array_filter(
                $columns,
                fn (string $column): bool => Schema::hasColumn('aircraft', $column)
            ));

            if ($existingColumns !== []) {
                $table->dropColumn($existingColumns);
            }
        });
    }
};
