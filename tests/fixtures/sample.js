/**
 * Sample JavaScript file for testing repoMap.
 */

class Calculator {
  add(a, b) {
    return a + b;
  }

  subtract(a, b) {
    return a - b;
  }

  multiply(a, b) {
    return a * b;
  }

  divide(a, b) {
    if (b === 0) throw new Error("Division by zero");
    return a / b;
  }
}

function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

const PI = 3.14159;

module.exports = { Calculator, factorial, PI };
