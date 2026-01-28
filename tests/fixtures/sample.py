"""Sample Python file for testing repoMap."""

class Person:
    """A simple person class."""
    
    def __init__(self, name: str, age: int):
        self.name = name
        self.age = age
    
    def greet(self) -> str:
        return f"Hello, I'm {self.name}"

def calculate_sum(a: int, b: int) -> int:
    """Calculate the sum of two numbers."""
    return a + b

def main():
    person = Person("Alice", 30)
    print(person.greet())
    print(calculate_sum(1, 2))

if __name__ == "__main__":
    main()
