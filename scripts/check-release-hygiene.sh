#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

failures=0

report_file() {
  local rule="$1"
  local path="$2"
  printf 'release hygiene: %s: %s\n' "$rule" "$path" >&2
  failures=1
}

check_path() {
  local scope="$1"
  local path="$2"

  case "$path" in
    .env|.env.*|*/.env|*/.env.*)
      case "$path" in
        *.example) ;;
        *) report_file "$scope environment file" "$path" ;;
      esac
      ;;
    *.db|*.db-*|*.sqlite|*.sqlite-*|*.sqlite3|*.sqlite3-*)
      report_file "$scope local database" "$path"
      ;;
    settings.json|settings.local.json|*/settings.local.json|*.local.json)
      report_file "$scope local settings" "$path"
      ;;
    node_modules/*|*/node_modules/*|dist/*|*/dist/*|dist-ssr/*|*/dist-ssr/*|target/*|*/target/*)
      report_file "$scope build output" "$path"
      ;;
    coverage/*|*/coverage/*|playwright-report/*|*/playwright-report/*|test-results/*|*/test-results/*)
      report_file "$scope test artifact" "$path"
      ;;
    screenshots/*|*/screenshots/*|ChatGPT\ Image*.png|*.design.png|*.screenshot.png)
      report_file "$scope local screenshot" "$path"
      ;;
    task_plan.md|findings.md|progress.md|daily-summary.md|.workbuddy/*|.loop/*)
      report_file "$scope local agent record" "$path"
      ;;
    *" 2.tsx")
      report_file "$scope conflict copy" "$path"
      ;;
    *.pem|*.key|*.p8|*.p12|*.pfx|*.jks|*.keystore|*.mobileprovision|id_rsa|id_rsa.*|*/id_rsa|*/id_rsa.*|id_ed25519|id_ed25519.*|*/id_ed25519|*/id_ed25519.*|.npmrc|.netrc|.pypirc|.git-credentials|*/.npmrc|*/.netrc|*/.pypirc|*/.git-credentials|.cargo/credentials|.cargo/credentials.toml|.aws/*)
      report_file "$scope credential file" "$path"
      ;;
  esac
}

while IFS= read -r -d '' path; do
  check_path "tracked" "$path"
done < <(git ls-files -z)

openai_prefix='s''k-'
github_prefix='g''h'
google_prefix='AI''za'
aws_prefix='AK''IA'
private_key_marker='-----BEGIN (RSA |EC |OPENSSH )?PRI''VATE KEY-----'
machine_path_re='(/Use''rs/[A-Za-z0-9._-]+/|/ho''me/[A-Za-z0-9._-]+/|[A-Za-z]:\\Use''rs\\[^\\]+\\)'
credential_assignment_re="(api[_-]?key|access[_-]?token|secret|password)[[:space:]]*[:=][[:space:]]*[\"'][^\"'\$\{\}<>[:space:]]{12,}[\"']"

rules=(
  "OpenAI-style token"
  "Anthropic token"
  "GitHub token"
  "Google API key"
  "AWS access key"
  "private key"
  "hard-coded credential assignment"
  "machine-specific absolute path"
)
patterns=(
  "${openai_prefix}[A-Za-z0-9_-]{16,}"
  "${openai_prefix}ant-[A-Za-z0-9_-]{16,}"
  "(${github_prefix}[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})"
  "${google_prefix}[0-9A-Za-z_-]{20,}"
  "${aws_prefix}[0-9A-Z]{16}"
  "$private_key_marker"
  "$credential_assignment_re"
  "$machine_path_re"
)

for index in "${!patterns[@]}"; do
  matches=""
  status=0
  matches="$(git grep -Il -E -e "${patterns[$index]}" -- . ':(exclude)package-lock.json')" || status=$?
  if (( status > 1 )); then
    printf 'release hygiene: scanner failed for rule: %s\n' "${rules[$index]}" >&2
    exit 2
  fi
  while IFS= read -r path; do
    [[ -n "$path" ]] && report_file "${rules[$index]}" "$path"
  done <<< "$matches"
done

if [[ "${1:-}" == "--history" ]]; then
  while IFS= read -r path; do
    check_path "history" "$path"
  done < <(git rev-list --objects --all | sed -n 's/^[^ ]* //p' | LC_ALL=C sort -u)

  while IFS= read -r commit; do
    for index in "${!patterns[@]}"; do
      matches=""
      status=0
      matches="$(git grep -Il -E -e "${patterns[$index]}" "$commit" -- . ':(exclude)package-lock.json')" || status=$?
      if (( status > 1 )); then
        printf 'release hygiene: history scanner failed for rule: %s\n' "${rules[$index]}" >&2
        exit 2
      fi
      while IFS= read -r path; do
        [[ -n "$path" ]] && report_file "history ${rules[$index]}" "$path"
      done <<< "$matches"
    done
  done < <(git rev-list --all)
elif (( $# != 0 )); then
  printf 'usage: %s [--history]\n' "$0" >&2
  exit 2
fi

if (( failures != 0 )); then
  exit 1
fi

printf 'release hygiene: tracked files passed\n'
