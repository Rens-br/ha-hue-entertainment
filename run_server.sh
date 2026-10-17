#!/bin/zsh
cd "$(dirname "$0")"
exec .venv/bin/python -m hue_entertainment_server.server "$@"
