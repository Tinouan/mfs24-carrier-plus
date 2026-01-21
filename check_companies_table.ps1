# Script pour vérifier l'emplacement de la table companies dans la base de données

$NAS_IP = "192.168.1.15"
$NAS_USER = "admin"
$CONTAINER_NAME = "msfs_db"

Write-Host "=== Vérification de la table 'companies' ===" -ForegroundColor Green
Write-Host ""

# Commande SQL pour trouver la table companies dans tous les schémas
$SQL_QUERY = "SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'companies';"

Write-Host "Recherche de la table 'companies' dans tous les schémas..." -ForegroundColor Yellow
ssh ${NAS_USER}@${NAS_IP} "cd /volume1/docker/msfs-directus && docker compose exec -T msfs_db psql -U msfs -d msfs -c `"$SQL_QUERY`""

Write-Host ""
Write-Host "=== Vérification des schémas existants ===" -ForegroundColor Green
$SQL_SCHEMAS = "SELECT schema_name FROM information_schema.schemata ORDER BY schema_name;"
ssh ${NAS_USER}@${NAS_IP} "cd /volume1/docker/msfs-directus && docker compose exec -T msfs_db psql -U msfs -d msfs -c `"$SQL_SCHEMAS`""

Write-Host ""
Write-Host "=== Tables dans le schéma 'public' ===" -ForegroundColor Green
$SQL_PUBLIC = "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
ssh ${NAS_USER}@${NAS_IP} "cd /volume1/docker/msfs-directus && docker compose exec -T msfs_db psql -U msfs -d msfs -c `"$SQL_PUBLIC`""

Write-Host ""
Write-Host "=== Tables dans le schéma 'game' ===" -ForegroundColor Green
$SQL_GAME = "SELECT tablename FROM pg_tables WHERE schemaname = 'game' ORDER BY tablename;"
ssh ${NAS_USER}@${NAS_IP} "cd /volume1/docker/msfs-directus && docker compose exec -T msfs_db psql -U msfs -d msfs -c `"$SQL_GAME`""
