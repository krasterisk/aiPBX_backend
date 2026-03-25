#!/bin/bash
set -euo pipefail

# ============================================
# Restore PostgreSQL database from backup
# Usage: ./restore-db.sh <backup_file.sql.gz>
# ============================================

if [ $# -eq 0 ]; then
  echo "Usage: $0 <backup_file>"
  echo "Example: $0 /app/backups/postgres/aipbx_20260325_120000.sql.gz"
  echo ""
  echo "Supported formats: .sql.gz (custom+gzip), .sql (custom)"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "[$(date)] ERROR: File not found: ${BACKUP_FILE}"
  exit 1
fi

# Load environment
ENV_FILE="/app/.env.production"
if [ ! -f "${ENV_FILE}" ]; then
  echo "[$(date)] ERROR: ${ENV_FILE} not found"
  exit 1
fi
source "${ENV_FILE}"

COMPOSE_FILE="/app/docker-compose.production.yml"
CONTAINER="postgres"

# Check that postgres container is running
if ! docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} ps ${CONTAINER} --format '{{.State}}' 2>/dev/null | grep -q "running"; then
  echo "[$(date)] Starting postgres container..."
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} up -d ${CONTAINER}
  echo "[$(date)] Waiting for postgres to be healthy..."
  sleep 15
fi

# Confirm
echo "============================================"
echo "  Database Restore"
echo "============================================"
echo "  File:     ${BACKUP_FILE}"
echo "  Database: ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo "============================================"
echo ""
read -p "This will OVERWRITE the current database. Continue? (y/N): " CONFIRM
if [[ "${CONFIRM}" != "y" && "${CONFIRM}" != "Y" ]]; then
  echo "Aborted."
  exit 0
fi

echo "[$(date)] Dropping existing schema..."
docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec -T ${CONTAINER} \
  psql -U "${DB_USER}" -d "${DB_NAME}" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" 2>&1

# Restore based on file extension
if [[ "${BACKUP_FILE}" == *.sql.gz ]]; then
  echo "[$(date)] Decompressing and restoring from gzipped custom dump..."
  gunzip -c "${BACKUP_FILE}" | \
    docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec -T ${CONTAINER} \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --no-owner -Fc 2>&1 || true
elif [[ "${BACKUP_FILE}" == *.sql ]]; then
  echo "[$(date)] Restoring from custom dump..."
  docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec -T ${CONTAINER} \
    pg_restore -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists --no-owner -Fc < "${BACKUP_FILE}" 2>&1 || true
else
  echo "[$(date)] ERROR: Unsupported format. Use .sql.gz or .sql"
  exit 1
fi

echo ""
echo "[$(date)] Restore complete. Verifying..."

# Verify: count tables
TABLE_COUNT=$(docker compose -f ${COMPOSE_FILE} --env-file ${ENV_FILE} exec -T ${CONTAINER} \
  psql -U "${DB_USER}" -d "${DB_NAME}" -t -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")

echo "[$(date)] Tables in database: ${TABLE_COUNT}"
echo "[$(date)] Done!"
