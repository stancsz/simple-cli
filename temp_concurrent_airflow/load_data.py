import sys
import traceback
import pandas as pd
import sqlite3


def main():
    try:
        try:
            df = pd.read_csv('aapl.csv', parse_dates=True, index_col=0)
        except FileNotFoundError:
            print("LOAD ERROR: aapl.csv not found. Ensure fetch_data.py has been run and produced aapl.csv")
            sys.exit(1)
        except Exception as e:
            msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
            print(f"LOAD ERROR: Failed to read aapl.csv: {msg}")
            sys.exit(1)

        try:
            conn = sqlite3.connect('finance.db')
        except Exception as e:
            msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
            print(f"LOAD ERROR: Failed to connect/create finance.db: {msg}")
            sys.exit(1)

        try:
            df.to_sql('stock_prices', conn, if_exists='replace', index=True)
        except Exception as e:
            msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
            conn.close()
            print(f"LOAD ERROR: Failed to write table 'stock_prices' to finance.db: {msg}")
            sys.exit(1)

        conn.close()
        print("LOAD COMPLETE")
        sys.exit(0)

    except Exception as e:
        msg = ''.join(traceback.format_exception_only(type(e), e)).strip()
        print(f"LOAD ERROR: Unexpected error in load_data.py: {msg}")
        sys.exit(1)


if __name__ == '__main__':
    main()
