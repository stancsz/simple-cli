import subprocess
import threading
import json
import os
import time

RESULTS = []
LOCK = threading.Lock()

# Helper to run a subprocess and record result
def run_process(name, cmd, artifact_on_success=None):
    try:
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        out, err = proc.communicate()
        rc = proc.returncode
        out_str = out.strip()
        err_str = err.strip()
        combined = "\n".join([s for s in [out_str, err_str] if s])
        if rc == 0:
            status = 'success'
            file_path = artifact_on_success if artifact_on_success else ''
            message = combined if combined else f"{name.upper()} completed successfully"
        else:
            status = 'failed'
            file_path = ''
            message = combined if combined else f"Process exited with return code {rc}"
    except Exception as e:
        status = 'failed'
        file_path = ''
        message = f"Exception when running subtask {name}: {e}"

    result = {
        "name": name,
        "status": status,
        "file": file_path,
        "message": message
    }

    with LOCK:
        RESULTS.append(result)
    return result


def run_fetch():
    # fetch creates aapl.csv on success
    return run_process('fetch', ['python', 'fetch_data.py'], artifact_on_success='aapl.csv')


def run_dag():
    # dag file is already present; running it prints DAG COMPLETE
    return run_process('dag', ['python', 'airflow_dag.py'], artifact_on_success='airflow_dag.py')


def run_load(wait_timeout=60):
    # Wait for aapl.csv to exist, but timeout after wait_timeout seconds
    start = time.time()
    while True:
        if os.path.exists('aapl.csv'):
            # Proceed to run load
            return run_process('load', ['python', 'load_data.py'], artifact_on_success='finance.db')
        # Check if any fetch result exists and failed and file not present
        with LOCK:
            fetch_results = [r for r in RESULTS if r['name'] == 'fetch']
        if fetch_results:
            fr = fetch_results[0]
            if fr['status'] == 'failed' and not os.path.exists('aapl.csv'):
                # fetch failed and no file; fail load early
                result = {
                    'name': 'load',
                    'status': 'failed',
                    'file': '',
                    'message': 'LOAD ERROR: aapl.csv not found. Ensure fetch_data.py has been run and produced aapl.csv'
                }
                with LOCK:
                    RESULTS.append(result)
                return result
        if time.time() - start > wait_timeout:
            result = {
                'name': 'load',
                'status': 'failed',
                'file': '',
                'message': f'LOAD ERROR: timeout waiting for aapl.csv after {wait_timeout} seconds'
            }
            with LOCK:
                RESULTS.append(result)
            return result
        time.sleep(1)


def main():
    threads = []

    t_fetch = threading.Thread(target=run_fetch)
    t_dag = threading.Thread(target=run_dag)
    t_load = threading.Thread(target=run_load)

    # Start all threads (load will wait for file availability)
    t_fetch.start()
    t_dag.start()
    t_load.start()

    threads.extend([t_fetch, t_dag, t_load])

    for t in threads:
        t.join()

    # Build final summary mapping
    summary = {r['name']: {"status": r['status'], "file": r['file']} for r in RESULTS}

    output = {
        "results": RESULTS,
        "summary": summary
    }

    print(json.dumps(output))


if __name__ == '__main__':
    main()
