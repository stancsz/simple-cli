"""
---
name: validate_csv
description: Validates the structure of a CSV file.
parameters:
  file:
    type: string
    description: Path to the CSV file.
---
"""
import sys
import csv
import os

def validate_csv(filepath):
    """
    Validates that a file is a valid CSV.
    """
    if not os.path.exists(filepath):
        print(f"Error: File {filepath} not found.")
        sys.exit(1)

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if header is None:
                print("Error: Empty CSV file.")
                sys.exit(1)

            row_count = 0
            for row in reader:
                row_count += 1
                if len(row) != len(header):
                    print(f"Error: Row {row_count + 1} has {len(row)} columns, expected {len(header)}.")
                    sys.exit(1)

            print(f"Success: Valid CSV. {row_count} rows, {len(header)} columns.")
    except Exception as e:
        print(f"Error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_csv.py <file>")
        sys.exit(1)
    validate_csv(sys.argv[1])
