#!/usr/bin/env bash
# Release pipeline for the employee app — replaces the manual
# bump → build → scp → publish dance.
#
#   mobile/scripts/release-apk.sh [--notes "..."] [--name X.Y.Z] [--optional]
#
# Reads the next version from android/version.properties, builds the release
# APK with gradle, drops it into the nginx-served /apk/ directory as
# wavixa-v<vc>-<name>.apk, publishes it via `crm:apk-publish` (which walls all
# old installs over the realtime channel), then auto-bumps version.properties
# so the following run can never collide on versionCode.
set -euo pipefail

ROOT=/var/www/WavixaCRM
MOBILE="$ROOT/mobile"
ANDROID="$MOBILE/android"
VPROPS="$ANDROID/version.properties"
APK_DIR="$ROOT/apk"
ARTISAN="$ROOT/backend/artisan"
OUT_DIR="$ANDROID/app/build/outputs/apk/release"

export JAVA_HOME=/opt/jdk-17.0.21.1+2
export PATH="$JAVA_HOME/bin:$PATH"

NOTES=""
NAME_OVERRIDE=""
EXTRA_ARGS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --notes)     NOTES="$2"; shift 2 ;;
    --notes=*)   NOTES="${1#*=}"; shift ;;
    --name)      NAME_OVERRIDE="$2"; shift 2 ;;
    --name=*)    NAME_OVERRIDE="${1#*=}"; shift ;;
    --optional)  EXTRA_ARGS+=(--optional); shift ;;
    --force)     EXTRA_ARGS+=(--force); shift ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

VC=$(grep -E '^VERSION_CODE=' "$VPROPS" | cut -d= -f2 | tr -d '[:space:]')
VN=$(grep -E '^VERSION_NAME=' "$VPROPS" | cut -d= -f2 | tr -d '[:space:]')
[[ -n "$NAME_OVERRIDE" ]] && VN="$NAME_OVERRIDE"
[[ "$VC" =~ ^[0-9]+$ ]] || { echo "Bad VERSION_CODE in $VPROPS" >&2; exit 2; }

echo "==> Building v$VN (vc $VC)…"
cd "$ANDROID"
./gradlew --quiet assembleRelease

SRC_APK="$OUT_DIR/app-release.apk"
[[ -f "$SRC_APK" ]] || { echo "Build output missing: $SRC_APK" >&2; exit 1; }

DEST="$APK_DIR/wavixa-v${VC}-${VN}.apk"
cp "$SRC_APK" "$DEST"
echo "==> APK staged at $DEST"

PUBLISH_ARGS=("$DEST")
[[ -n "$NOTES" ]] && PUBLISH_ARGS+=(--notes="$NOTES")
php "$ARTISAN" crm:apk-publish "${PUBLISH_ARGS[@]}" "${EXTRA_ARGS[@]}"

# Only reached when publish succeeded — bump for the next release.
NEXT_VC=$((VC + 1))
if [[ -n "$NAME_OVERRIDE" ]]; then
  NEXT_VN="$VN"
else
  NEXT_VN=$(awk -F. -v OFS=. '{$NF = $NF + 1; print}' <<<"$VN")
fi
sed -i \
  -e "s/^VERSION_CODE=.*/VERSION_CODE=$NEXT_VC/" \
  -e "s/^VERSION_NAME=.*/VERSION_NAME=$NEXT_VN/" \
  "$VPROPS"

echo "==> Done. Next build will be vc $NEXT_VC / $NEXT_VN"
echo "==> URL: https://crm.wavixa.net/apk/wavixa-v${VC}-${VN}.apk"
