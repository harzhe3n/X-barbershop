#!/bin/sh
# Daily copy of the XBARBER database on the VPS, kept for 30 days.
# Install: see docs/VPS-SETUP.md (needs the sqlite3 command: apt install -y sqlite3).
set -eu
DATA=/var/lib/xbarber
DEST="$DATA/backups"
mkdir -p "$DEST"
sqlite3 "$DATA/xbarber.db" ".backup '$DEST/daily-$(date +%F).db'"
find "$DEST" -name 'daily-*.db' -mtime +30 -delete
