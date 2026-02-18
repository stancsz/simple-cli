import unittest
from calculator import divide

class TestCalculator(unittest.TestCase):
    def test_divide_zero(self):
        # We expect a friendly error message or None, not a crash
        # The buggy code will panic here
        try:
            result = divide(10, 0)
            self.assertEqual(result, "Error")
        except ZeroDivisionError:
            self.fail("divide(10, 0) raised ZeroDivisionError unexpectedly!")

if __name__ == "__main__":
    unittest.main()
