#!/usr/bin/env bash
set -euo pipefail

# This script runs the three subtasks concurrently, captures logs and exit codes,
# and emits a JSON summary to stdout.

# Ensure logs dir
LOGDIR="./subtask_logs"
mkdir -p "$LOGDIR"

# Start each task in background and capture PID
python fetch_data.py > "$LOGDIR/fetch_stdout.log" 2> "$LOGDIR/fetch_stderr.log" &
PID_FETCH=$!
python load_data.py > "$LOGDIR/load_stdout.log" 2> "$LOGDIR/load_stderr.log" &
PID_LOAD=$!
python airflow_dag.py > "$LOGDIR/dag_stdout.log" 2> "$LOGDIR/dag_stderr.log" &
PID_DAG=$!

echo "__PIDS__:$PID_FETCH,$PID_LOAD,$PID_DAG"

# Wait for all
wait $PID_FETCH
EXIT_FETCH=$?
wait $PID_LOAD
EXIT_LOAD=$?
wait $PID_DAG
EXIT_DAG=$?

# Read stderr logs (first 2000 chars) for error messaging
read_err() {
  local f="$1"
  if [ -f "$f" ]; then
    head -c 2000 "$f" | sed -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
  else
    echo ""
  fi
}

ERR_FETCH=$(read_err "$LOGDIR/fetch_stderr.log")
ERR_LOAD=$(read_err "$LOGDIR/load_stderr.log")
ERR_DAG=$(read_err "$LOGDIR/dag_stderr.log")

# Determine created files
FILES_FETCH=("aapl.csv")
FILES_LOAD=("finance.db")
FILES_DAG=()

status_or_failed() {
  if [ "$1" -eq 0 ]; then
    echo "success"
  else
    echo "failed"
  fi
}

STATUS_FETCH=$(status_or_failed $EXIT_FETCH)
STATUS_LOAD=$(status_or_failed $EXIT_LOAD)
STATUS_DAG=$(status_or_failed $EXIT_DAG)

# Build JSON summary
cat <<EOF
{
  "subtasks": [
    {
      "name": "Subtask A - fetch_data.py",
      "status": "$STATUS_FETCH",
      "pids": $PID_FETCH,
      "files": ["${FILES_FETCH[@]}"],
      "error": "$(echo "$ERR_FETCH")"
    },
    {
      "name": "Subtask B - load_data.py",
      "status": "$STATUS_LOAD",
      "pids": $PID_LOAD,
      "files": ["${FILES_LOAD[@]}"],
      "error": "$(echo "$ERR_LOAD")"
    },
    {
      "name": "Subtask C - airflow_dag.py",
      "status": "$STATUS_DAG",
      "pids": $PID_DAG,
      "files": [],
      "error": "$(echo "$ERR_DAG")"
    }
  ],
  "summary": {
    "fetch": {"status": "$STATUS_FETCH", "path": "aapl.csv"},
    "load": {"status": "$STATUS_LOAD", "path": "finance.db"},
    "dag": {"status": "$STATUS_DAG", "path": "airflow_dag.py"}
  }
}
EOF

# Exit with non-zero if any failed
if [ $EXIT_FETCH -ne 0 ] || [ $EXIT_LOAD -ne 0 ] || [ $EXIT_DAG -ne 0 ]; then
  exit 2
fi

exit 0
