#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

LABEL="com.commshub99.web"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
LOG_DIR="${REPO_ROOT}/logs"
RUN_DIR="${REPO_ROOT}/.run"
RUNNER_PATH="${RUN_DIR}/commshub99-web-launchd.sh"
SERVICE_PATH="${SERVICE_PATH:-${HOME}/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
PORT="${PORT:-3000}"
IMSG_DATA_DIR="${IMSG_DATA_DIR:-${HOME}/imsg-data}"
COMMSHUB99_DB_PATH="${COMMSHUB99_DB_PATH:-${HOME}/.commshub99/hub.db}"

export PATH="${SERVICE_PATH}"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun was not found on PATH."
  echo "Set SERVICE_PATH to include Bun and re-run this script."
  exit 1
fi

mkdir -p "${PLIST_DIR}" "${LOG_DIR}" "${RUN_DIR}" "$(dirname "${COMMSHUB99_DB_PATH}")"

cd "${REPO_ROOT}"
bun install
bun run --filter @commshub99/web build

cat > "${RUNNER_PATH}" <<RUNNER
#!/usr/bin/env zsh
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

cd "${REPO_ROOT}"
exec bun run --filter @commshub99/web start
RUNNER
chmod +x "${RUNNER_PATH}"

if launchctl print "gui/${UID}/${LABEL}" >/dev/null 2>&1; then
  launchctl bootout "gui/${UID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
fi

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>

  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>${RUNNER_PATH}</string>
  </array>

  <key>EnvironmentVariables</key>
  <dict>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PORT</key>
    <string>${PORT}</string>
    <key>IMSG_DATA_DIR</key>
    <string>${IMSG_DATA_DIR}</string>
    <key>COMMSHUB99_DB_PATH</key>
    <string>${COMMSHUB99_DB_PATH}</string>
    <key>PATH</key>
    <string>${SERVICE_PATH}</string>
  </dict>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>

  <key>StandardOutPath</key>
  <string>${LOG_DIR}/commshub99-web.out.log</string>

  <key>StandardErrorPath</key>
  <string>${LOG_DIR}/commshub99-web.err.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/${UID}" "${PLIST_PATH}"
launchctl enable "gui/${UID}/${LABEL}"
launchctl kickstart -k "gui/${UID}/${LABEL}"

echo "Installed ${LABEL}"
echo "URL: http://localhost:${PORT}"
echo "Plist: ${PLIST_PATH}"
echo "Logs: ${LOG_DIR}/commshub99-web.out.log and ${LOG_DIR}/commshub99-web.err.log"
