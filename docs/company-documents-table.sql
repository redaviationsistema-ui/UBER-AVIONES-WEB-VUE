CREATE TABLE company_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider_id BIGINT UNSIGNED NOT NULL,
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
  KEY idx_company_documents_provider_id (provider_id),
  KEY idx_company_documents_status (status),
  KEY idx_company_documents_expires_at (expires_at),
  CONSTRAINT fk_company_documents_provider
    FOREIGN KEY (provider_id) REFERENCES providers(id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Opcional si tu backend maneja usuarios que suben archivos:
-- ALTER TABLE company_documents
--   ADD CONSTRAINT fk_company_documents_uploaded_by_user
--   FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
--   ON DELETE SET NULL
--   ON UPDATE CASCADE;

-- Ejemplo de registro esperado por el frontend:
-- {
--   "id": 15,
--   "document_name": "permiso-operador.pdf",
--   "file_name": "permiso-operador.pdf",
--   "status": "approved"
-- }
