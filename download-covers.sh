#!/bin/bash
# Download cover images from Pollinations.ai
# Run this script when the service is available again

BASE="/Users/recca0120/Sites/recca0120.github.io/content/post"

declare -A PROMPTS
PROMPTS[redis-connection-refused]="minimalist dark terminal screen showing Redis connection error, tech blog cover, clean design"
PROMPTS[redis-tcp-backlog-somaxconn]="minimalist server network diagram with TCP connections, dark background, tech illustration"
PROMPTS[laravel-eloquent-memory-leak]="abstract visualization of memory leak in software, dark gradient background, tech art"
PROMPTS[laravel-migration-precautions]="database schema migration diagram, dark minimal style, developer illustration"
PROMPTS[laravel-testing-follow-redirects]="HTTP redirect flow arrows diagram, dark background, clean tech illustration"
PROMPTS[laravel-lazy-collection-generator]="abstract lazy loading stream data flow, dark gradient, developer art"
PROMPTS[php-curl-comodo-ssl-error]="SSL certificate lock icon with error warning, dark background, security illustration"
PROMPTS[guzzlehttp-psr7-response-getcontents]="HTTP response data stream visualization, dark minimal, developer illustration"
PROMPTS[laravel-testing-mock-server-variables]="server variables testing mockup diagram, dark background, clean tech style"
PROMPTS[laravel-validation-exception]="form validation error messages UI mockup, dark theme, developer illustration"
PROMPTS[blade-render-markdown]="markdown syntax transforming to HTML, dark gradient, developer art"
PROMPTS[raspberry-pi-bluetooth]="Raspberry Pi board with bluetooth signal waves, dark background, tech illustration"
PROMPTS[fix-adb-version-mismatch]="Android debug bridge terminal commands, dark background, developer illustration"
PROMPTS[windows10-on-aws-ec2]="Windows logo on cloud server infrastructure, dark minimal, AWS illustration"
PROMPTS[windows10-1g-ram-optimization]="Windows performance optimization dashboard, dark theme, system monitor illustration"

success=0
fail=0

for name in "${!PROMPTS[@]}"; do
  prompt="${PROMPTS[$name]}"
  encoded=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$prompt'))")
  url="https://image.pollinations.ai/prompt/${encoded}?width=1200&height=630&nologo=true"
  dest="${BASE}/${name}/featured.jpg"

  echo "Downloading: ${name}..."
  curl -sS -L --max-time 60 -o "$dest" "$url"

  # Check if it's a valid image (JPEG starts with specific bytes)
  if file "$dest" | grep -q "JPEG\|image"; then
    echo "  OK ($(du -h "$dest" | cut -f1))"
    ((success++))
  else
    echo "  FAILED - not a valid image"
    rm -f "$dest"
    ((fail++))
  fi
done

echo ""
echo "Done: ${success} succeeded, ${fail} failed"
