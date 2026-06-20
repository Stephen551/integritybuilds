#!/usr/bin/env bash
# IntegrityBuilds deploy script.
#
# Stages only the files that should ship into _deploy/, replaces the
# __BUILD__ cache-busting placeholder in HTML files with a timestamp,
# and pushes to Cloudflare Pages.
#
# Run from the project root:
#   ./deploy.sh                       # deploy with auto commit message
#   ./deploy.sh "your message"        # deploy with custom commit message
set -euo pipefail

cd "$(dirname "$0")"

BUILD_VERSION="$(date +%Y%m%d-%H%M%S)"
COMMIT_MSG="${1:-Deploy $BUILD_VERSION}"

echo "==> Build version: $BUILD_VERSION"
echo "==> Staging _deploy/"

rm -rf _deploy
mkdir -p _deploy
cp -r \
  404.html \
  index.html \
  privacy.html \
  styles.css \
  main.js \
  theme-init.js \
  robots.txt \
  sitemap.xml \
  favicon.svg \
  favicon.ico \
  favicon-16.png \
  favicon-32.png \
  favicon-64.png \
  _headers \
  images \
  vendor \
  work \
  functions \
  _deploy/

# Minify the shipped CSS/JS. Source files stay readable (the repo is public so
# clients can read the real code); only the _deploy copies are minified. Each
# file falls back to the already-copied original if esbuild is unavailable, so
# a missing tool never breaks the deploy.
echo "==> Minifying CSS + JS in _deploy/"
minify() {
  local f="$1"
  if npx --yes esbuild "$f" --minify --outfile="_deploy/$f.tmp" >/dev/null 2>&1 && [ -s "_deploy/$f.tmp" ]; then
    mv "_deploy/$f.tmp" "_deploy/$f"
    echo "    minified $f"
  else
    rm -f "_deploy/$f.tmp"
    echo "    kept unminified $f (esbuild unavailable)"
  fi
}
minify styles.css
minify main.js
minify theme-init.js

echo "==> Stamping __BUILD__ -> $BUILD_VERSION in HTML"
find _deploy -name "*.html" -print0 | while IFS= read -r -d '' file; do
  sed -i "s/__BUILD__/$BUILD_VERSION/g" "$file"
done

echo "==> Deploying to Cloudflare Pages"
wrangler pages deploy _deploy \
  --project-name integritybuilds \
  --branch main \
  --commit-message "$COMMIT_MSG"
