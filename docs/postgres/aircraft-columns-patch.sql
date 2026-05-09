ALTER TABLE aircraft
  ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(255),
  ADD COLUMN IF NOT EXISTS coverage TEXT,
  ADD COLUMN IF NOT EXISTS amenities JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS minimum_hours INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operational_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS model_year INTEGER;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'aircraft'
      AND column_name = 'year'
  ) THEN
    EXECUTE '
      UPDATE aircraft
      SET model_year = COALESCE(model_year, year)
      WHERE year IS NOT NULL
    ';
  END IF;
END $$;

COMMENT ON COLUMN aircraft.manufacturer IS 'Fabricante de la aeronave.';
COMMENT ON COLUMN aircraft.coverage IS 'Cobertura operativa o zona principal.';
COMMENT ON COLUMN aircraft.amenities IS 'Amenidades visibles para operador/cliente.';
COMMENT ON COLUMN aircraft.minimum_hours IS 'Minimo de horas por reserva.';
COMMENT ON COLUMN aircraft.operational_cost IS 'Costo operativo base de referencia.';
COMMENT ON COLUMN aircraft.model_year IS 'Anio del modelo, usado por el backend en lugar de year.';
