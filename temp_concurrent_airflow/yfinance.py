"""
A minimal local substitute for the 'yfinance' package to allow fetch_data.py to run
without installing external packages. It implements Ticker.history(period='1mo') by
downloading the Yahoo Finance CSV download endpoint and returning a lightweight
DataFrame-like object with .empty and .to_csv(path, index=True, header=True).

This is only a lightweight compatibility shim for the specific task and does not
implement full yfinance functionality.
"""
import time
import urllib.request
import urllib.error
import io


class SimpleDataFrame:
    def __init__(self, csv_text: str):
        # Store the raw CSV text fetched from Yahoo
        self._csv_text = csv_text
        # Split into lines and count data lines (exclude header/empty lines)
        self._lines = [line for line in csv_text.splitlines() if line.strip() != ""]

    @property
    def empty(self):
        # If there's only a header (or nothing), consider empty
        return len(self._lines) <= 1

    def to_csv(self, path, index=True, header=True):
        # Write the fetched CSV content to the requested path.
        # The downloaded CSV already includes a header row with Date as the first column.
        with open(path, 'w', encoding='utf-8') as f:
            f.write(self._csv_text)


class Ticker:
    def __init__(self, symbol: str):
        self.symbol = symbol

    def history(self, period='1mo'):
        # Support only period='1mo' as required by the spec. Map to ~30 days.
        if period != '1mo':
            raise ValueError("This minimal yfinance shim only supports period='1mo'.")

        # Compute period1 and period2 as Unix timestamps (seconds).
        # period2: now, period1: now - 30 days
        now = int(time.time())
        period1 = now - 30 * 24 * 60 * 60
        period2 = now

        url = (
            f"https://query1.finance.yahoo.com/v7/finance/download/{self.symbol}"
            f"?period1={period1}&period2={period2}&interval=1d&events=history&includeAdjustedClose=true"
        )

        try:
            with urllib.request.urlopen(url, timeout=30) as resp:
                if resp.status != 200:
                    raise RuntimeError(f"Failed to download data: HTTP {resp.status}")
                raw = resp.read()
                text = raw.decode('utf-8')

                # Yahoo sometimes returns responses with disclaimers or HTML on failure.
                # Basic check: ensure CSV header 'Date' present
                if 'Date' not in text.splitlines()[0]:
                    raise RuntimeError('Unexpected response format when fetching CSV data.')

                return SimpleDataFrame(text)

        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP error while fetching data: {e}")
        except urllib.error.URLError as e:
            raise RuntimeError(f"URL error while fetching data: {e}")
        except Exception as e:
            raise
