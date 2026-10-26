#!/usr/bin/env bash
# GitHub Actions → keşif bildirimi ve günlük keşif özeti fonksiyonları (Cloud Functions + Cloud Scheduler)
# yayın yetkileri (bir kez çalıştırılır; özet eklendikten sonra bir kez daha çalıştırın — zararsızdır).
# Önce scripts/github-deploy-setup.sh kurulmuş olmalı (aynı hizmet hesabını kullanır).
# Google Cloud Shell'de çalıştırın (tarayıcıdan / telefondan):
#   curl -sL https://raw.githubusercontent.com/aligokten/tadilatbodrum.com/main/scripts/functions-deploy-setup.sh | bash
set -uo pipefail
PROJECT=saggplus
SA="github-deploy@$PROJECT.iam.gserviceaccount.com"

echo "▶ Proje: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null 2>&1
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)') || { echo "✗ Projeye erişilemedi. Firebase projesinin sahibi olan Google hesabıyla Cloud Shell açın."; exit 1; }
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || { echo "✗ $SA yok. Önce DEPLOY.md → '0) Otomatik yayın' kurulumunu yapın."; exit 1; }

echo "▶ Gerekli servisler açılıyor (Blaze planı gerekir)…"
gcloud services enable cloudfunctions.googleapis.com run.googleapis.com eventarc.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com \
  pubsub.googleapis.com firestore.googleapis.com cloudscheduler.googleapis.com --quiet \
  || { echo "✗ Servisler açılamadı. Firebase Console → ⚙ → Kullanım ve faturalandırma → Blaze planına geçin, sonra tekrar çalıştırın."; exit 1; }

bind() { gcloud projects add-iam-policy-binding "$PROJECT" --member="$1" --role="$2" --condition=None --quiet >/dev/null && echo "  ✓ $2"; }

echo "▶ GitHub hizmet hesabına fonksiyon yayın yetkileri: $SA"
for ROLE in roles/cloudfunctions.admin roles/run.admin roles/eventarc.admin roles/artifactregistry.admin \
            roles/cloudbuild.builds.editor roles/secretmanager.admin roles/iam.serviceAccountUser roles/cloudscheduler.admin; do
  bind "serviceAccount:$SA" "$ROLE"
done

echo "▶ Google'ın kendi hizmet hesapları (Firestore tetikleyicisi ve derleme için)"
COMPUTE_SA="$PN-compute@developer.gserviceaccount.com"
bind "serviceAccount:$COMPUTE_SA" roles/eventarc.eventReceiver
bind "serviceAccount:$COMPUTE_SA" roles/run.invoker
bind "serviceAccount:$COMPUTE_SA" roles/cloudbuild.builds.builder
gcloud beta services identity create --service=pubsub.googleapis.com --quiet >/dev/null 2>&1
bind "serviceAccount:service-$PN@gcp-sa-pubsub.iam.gserviceaccount.com" roles/iam.serviceAccountTokenCreator

echo
echo "════════════════════════════════════════════════════════════"
echo " Kurulum tamam. GitHub → Actions → 'Keşif bildirimi fonksiyonu'"
echo " → Run workflow ile yayınlayabilirsiniz (DEPLOY.md §6)."
echo "════════════════════════════════════════════════════════════"
