CREATE TABLE aircraft_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_id BIGINT UNSIGNED NOT NULL,
  aircraft_id BIGINT UNSIGNED NOT NULL,
  document_type VARCHAR(120) NOT NULL DEFAULT 'documento',
  document_name VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  file_size_bytes BIGINT UNSIGNED DEFAULT NULL,
  status ENUM('pending', 'approved', 'rejected', 'expired') NOT NULL DEFAULT 'pending',
  expires_at DATE DEFAULT NULL,
  uploaded_by_user_id BIGINT UNSIGNED DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_aircraft_documents_provider_id (provider_id),
  KEY idx_aircraft_documents_aircraft_id (aircraft_id),
  KEY idx_aircraft_documents_status (status),
  KEY idx_aircraft_documents_document_type (document_type),
  KEY idx_aircraft_documents_expires_at (expires_at),
  CONSTRAINT fk_aircraft_documents_provider
    FOREIGN KEY (provider_id) REFERENCES providers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_aircraft_documents_aircraft
    FOREIGN KEY (aircraft_id) REFERENCES aircraft(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opcional si tu backend maneja usuarios que suben archivos:
-- ALTER TABLE aircraft_documents
--   ADD CONSTRAINT fk_aircraft_documents_uploaded_by_user
--   FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
--   ON DELETE SET NULL
--   ON UPDATE CASCADE;

-- Regla funcional:
-- esta tabla debe aceptar documentos aunque el proveedor o la aeronave
-- todavia no esten aprobados. La aprobacion aplica a publicacion/matching,
-- no a la carga del expediente tecnico.
