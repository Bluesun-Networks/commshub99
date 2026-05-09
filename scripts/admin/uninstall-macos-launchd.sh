#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

LABEL="com.commshub99.web"
PLIST_PATH="${HOME}/Library/LaunchAgents/${LABEL}.plist"

if [[ -f "${PLIST_PATH}" ]]; then
  launchctl bootout "gui/${UID}" "${PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${PLIST_PATH}"
else
  launchctl bootout "gui/${UID}/${LABEL}" >/dev/null 2>&1 || true
fi

echo "Uninstalled ${LABEL}"
