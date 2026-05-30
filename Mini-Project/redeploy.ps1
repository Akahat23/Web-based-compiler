$ACR        = "syntaxiaregistryv1.azurecr.io"
$IMAGE      = "syntaxia"
$TAG        = "latest"
$WEBAPP     = "syntaxia-web-app-12345"
$RG         = "SyntaxiaResourceGroup"
$FULL_IMAGE = "${ACR}/${IMAGE}:${TAG}"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Syntaxia - Azure Redeploy" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

Write-Host "`n[1/4] Logging in to ACR..." -ForegroundColor Yellow
az acr login --name syntaxiaregistryv1
if ($LASTEXITCODE -ne 0) { Write-Host "ACR login failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[2/4] Building Docker image..." -ForegroundColor Yellow
docker build -t $FULL_IMAGE -f Dockerfile .
if ($LASTEXITCODE -ne 0) { Write-Host "Docker build failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[3/4] Pushing image to ACR..." -ForegroundColor Yellow
docker push $FULL_IMAGE
if ($LASTEXITCODE -ne 0) { Write-Host "Docker push failed!" -ForegroundColor Red; exit 1 }

Write-Host "`n[4/4] Restarting Azure Web App..." -ForegroundColor Yellow
az webapp restart --name $WEBAPP --resource-group $RG
if ($LASTEXITCODE -ne 0) { Write-Host "Web App restart failed!" -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Deployment Complete!" -ForegroundColor Green
Write-Host "  URL: https://${WEBAPP}.azurewebsites.net" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
