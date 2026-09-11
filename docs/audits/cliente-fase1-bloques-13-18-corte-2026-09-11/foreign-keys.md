# FKs vigentes — lectura de pg_constraint

Se incluyen todas las FKs cuyo padre o hija pertenece al conjunto auditado. El JSON conserva todas las FKs públicas para revisar cadenas transitivas. Propuestas pendientes, ninguna aplicada.

| TABLA HIJA / COLUMNA | TABLA PADRE | ON DELETE ACTUAL | RIESGO | PROPUESTA |
| --- | --- | --- | --- | --- |
| `access_payments.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft.base_airport_id` | `airports` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft.provider_id` | `providers` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `aircraft_availability.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_availability_blocks.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_availability_blocks.flight_request_id` | `flight_requests` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_availability_blocks.quote_id` | `quotes` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_availability_blocks.reservation_id` | `reservations` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_availability_blocks.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_billing_payments.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_billing_payments.provider_id` | `providers` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_checklists.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_checklists.created_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_checklists.updated_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_documents.aircraft_id` | `aircraft` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `aircraft_documents.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_images.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_performance_profiles.aircraft_id` | `aircraft` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `aircraft_subscriptions.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `aircraft_subscriptions.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `airport_expense_rules.aircraft_id` | `aircraft` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `anti_broker_flags.flight_request_id` | `flight_requests` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `anti_broker_flags.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `api_tokens.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `attachments.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `audit_logs.admin_user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `audit_logs.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `chat_messages.sender_id` | `users` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `checklist_items.completed_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `checklists.operation_id` | `operations` | RESTRICT | Impide borrado referenciado | Conservar; probar respuesta controlada de endpoints de borrado. |
| `checklists.sobrecargo_user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `commissions.provider_id` | `providers` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `commissions.reservation_id` | `reservations` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `company_documents.provider_id` | `providers` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `crew_operation_incidents.crew_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `crew_operation_incidents.crew_operation_id` | `operations` | RESTRICT | Impide borrado referenciado | Conservar; probar respuesta controlada de endpoints de borrado. |
| `crew_operation_incidents.reported_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `demos.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `favorite_aircraft.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `favorite_aircraft.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `flight_membership_benefit_ledger.flight_id` | `flight_requests` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_membership_benefit_ledger.quote_id` | `quotes` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_membership_benefit_ledger.reservation_id` | `reservations` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_memberships.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `flight_request_legs.flight_request_id` | `flight_requests` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `flight_requests.assigned_aircraft_id` | `aircraft` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_requests.assigned_provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_requests.client_id` | `users` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `flight_requests.destination_airport_id` | `airports` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `flight_requests.origin_airport_id` | `airports` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `idempotency_keys.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `identity_verifications.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `login_attempts.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `notifications.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `notifications.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `operation_timeline.created_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `operation_timeline.operation_id` | `operations` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `operations.aircraft_id` | `aircraft` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `operations.crew_administratively_closed_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `operations.flight_request_id` | `flight_requests` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `operations.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `operations.sobrecargo_user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payment_methods.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `payments.flight_request_id` | `flight_requests` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payments.payment_method_id` | `payment_methods` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payments.reservation_id` | `reservations` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payments.subscription_id` | `subscriptions` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payments.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `payouts.provider_id` | `providers` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `profiles.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `protected_chats.admin_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `protected_chats.client_id` | `users` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `protected_chats.flight_request_id` | `flight_requests` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `protected_chats.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.admin_changes_requested_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.admin_rejected_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.admin_validated_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.changes_requested_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.rejected_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `providers.user_id` | `users` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `providers.validated_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `quote_items.quote_id` | `quotes` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `quotes.aircraft_id` | `aircraft` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `quotes.flight_request_id` | `flight_requests` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `quotes.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `request_matches.aircraft_id` | `aircraft` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `request_matches.flight_request_id` | `flight_requests` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `request_matches.provider_id` | `providers` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `reservation_contracts.reservation_id` | `reservations` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `reservation_contracts.signed_by_user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `reservation_legs.reservation_id` | `reservations` | CASCADE | Pérdida de detalle/evidencia si se elimina el padre | Revisar RESTRICT o retención ligada al padre; no cambiar sin clasificar el historial. |
| `reservations.aircraft_id` | `aircraft` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `reservations.client_id` | `users` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `reservations.flight_request_id` | `flight_requests` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `reservations.provider_id` | `providers` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `reservations.quote_id` | `quotes` | CASCADE | Alto: borra historial o inicia cadena hacia reservas/evidencia | Proponer RESTRICT; conservar registros mediante desactivación. Requiere revisión de migración y borrados activos. |
| `service_reviews.reservation_id` | `reservations` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `service_reviews.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `sobrecargo_assignments.assigned_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `sobrecargo_assignments.operation_id` | `operations` | RESTRICT | Impide borrado referenciado | Conservar; probar respuesta controlada de endpoints de borrado. |
| `sobrecargo_assignments.sobrecargo_user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `sobrecargo_disponibilidades.aprobado_por` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `sobrecargo_disponibilidades.created_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `sobrecargo_disponibilidades.operacion_id` | `operations` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `sobrecargo_disponibilidades.sobrecargo_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `sobrecargo_disponibilidades.updated_by` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `subscriptions.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `support_ticket_messages.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `support_tickets.user_id` | `users` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `user_devices.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `user_roles.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
| `users.provider_id` | `providers` | SET NULL | Conserva fila, pierde vínculo; depende de snapshots | Conservar regla; verificar snapshots y vistas tolerantes a NULL. |
| `verification_codes.user_id` | `users` | CASCADE | Elimina registros dependientes; relevancia comercial por revisar | No cambiar masivamente; separar datos auxiliares de evidencia antes de decidir. |
