---
name: greeter
description: A tool that greets a user by name and age.
command: node -e "const args = JSON.parse(process.env.TOOL_INPUT); console.log('Hello ' + args.name + ', you are ' + args.age + ' years old');"
parameters:
  name:
    type: string
    description: The name of the person to greet
  age:
    type: number
    description: The age of the person
---
