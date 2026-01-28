/**
 * Sample TypeScript file for testing repoMap.
 */

interface UserProps {
  name: string;
  email: string;
}

export class User {
  private name: string;
  private email: string;

  constructor(props: UserProps) {
    this.name = props.name;
    this.email = props.email;
  }

  getName(): string {
    return this.name;
  }

  getEmail(): string {
    return this.email;
  }
}

export function greet(user: User): string {
  return `Hello, ${user.getName()}!`;
}

export const VERSION = '1.0.0';
