@echo off
echo ======================================================
echo 💈 Organizando Projeto Barbearia Ruan para Vercel
echo ======================================================

:: 1. Criar as pastas necessárias
echo [+] Criando pastas public e api...
if not exist public mkdir public
if not exist api mkdir api

:: 2. Mover index.html para public
echo [+] Movendo index.html para /public...
if exist index.html move index.html public\index.html

:: 3. Mover e renomear arquivos da API
echo [+] Organizando arquivos da API em /api...
if exist api_check-pix.js move api_check-pix.js api\check-pix.js
if exist api_create-pix.js move api_create-pix.js api\create-pix.js
if exist api_webhook.js move api_webhook.js api\webhook.js

:: 4. Preparar commit do Git
echo [+] Preparando atualizacao no Git...
git add .
git commit -m "Organiza estrutura de pastas para deploy no Vercel"
git push origin main

echo ======================================================
echo ✅ Projeto organizado e enviado para o GitHub!
echo 🚀 Agora o Vercel deve fazer o deploy automaticamente.
echo ======================================================
pause
