@echo off
cd /d D:\EVENTUALIA
echo Desplegando EVENTUALIA...
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
echo.
echo Listo. La app estara disponible en https://app.eventualia17.es
pause
