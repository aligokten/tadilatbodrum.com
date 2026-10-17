#!/usr/bin/env bash
# GitHub Actions → Firebase Hosting otomatik yayın kurulumu (bir kez çalıştırılır).
# Google Cloud Shell'de çalıştırın (telefondan da olur):
#   curl -sL https://raw.githubusercontent.com/aligokten/tadilatbodrum.com/main/scripts/github-deploy-setup.sh | bash
# Anahtar dosyası oluşturmaz: GitHub, yalnızca bu repodan gelen iş akışları için kısa ömürlü kimlik alır.
set -uo pipefail
PROJECT=saggplus
REPO=aligokten/tadilatbodrum.com
SA_NAME=github-deploy
SA="$SA_NAME@$PROJECT.iam.gserviceaccount.com"
POOL=github
PROVIDER=github

echo "▶ Proje: $PROJECT"
gcloud config set project "$PROJECT" >/dev/null 2>&1
PN=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)') || { echo "✗ Projeye erişilemedi. Firebase projesinin sahibi olan Google hesabıyla Cloud Shell açın."; exit 1; }

echo "▶ Gerekli servisler açılıyor…"
gcloud services enable iamcredentials.googleapis.com sts.googleapis.com firebasehosting.googleapis.com serviceusage.googleapis.com --quiet

echo "▶ Hizmet hesabı: $SA"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SA_NAME" --display-name="GitHub otomatik yayın" --quiet
for ROLE in roles/firebasehosting.admin roles/firebase.viewer roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$SA" --role="$ROLE" --condition=None --quiet >/dev/null && echo "  ✓ $ROLE"
done

echo "▶ GitHub kimlik havuzu"
gcloud iam workload-identity-pools describe "$POOL" --location=global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create "$POOL" --location=global --display-name="GitHub" --quiet
gcloud iam workload-identity-pools providers describe "$PROVIDER" --location=global --workload-identity-pool="$POOL" >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" --location=global --workload-identity-pool="$POOL" \
    --display-name="GitHub Actions" --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='$REPO'" --quiet

echo "▶ Yalnızca $REPO deposuna izin veriliyor"
gcloud iam service-accounts add-iam-policy-binding "$SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PN/locations/global/workloadIdentityPools/$POOL/attribute.repository/$REPO" --quiet >/dev/null && echo "  ✓ bağlandı"

echo
echo "════════════════════════════════════════════════════════════"
echo " Kurulum tamam. Aşağıdaki satırı kopyalayıp Claude'a gönderin:"
echo
echo " projects/$PN/locations/global/workloadIdentityPools/$POOL/providers/$PROVIDER"
echo "════════════════════════════════════════════════════════════"
