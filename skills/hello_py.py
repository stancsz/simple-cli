import sys
import json
import os

def main():
    # Read from stdin
    input_data = sys.stdin.read()
    if input_data:
        args = json.loads(input_data)
    else:
        # Fallback to env var
        input_env = os.environ.get('TOOL_INPUT')
        args = json.loads(input_env) if input_env else {}

    name = args.get('name', 'Stranger')
    print(f"Python says: Hello {name}!")

if __name__ == "__main__":
    main()
