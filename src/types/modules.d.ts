// Type declarations for optional dependencies
// These may or may not be installed

declare module 'gpt-tokenizer' {
  export function encode(text: string): number[];
  export function decode(tokens: number[]): string;
}

declare module 'turndown' {
  interface TurndownOptions {
    headingStyle?: 'setext' | 'atx';
    hr?: string;
    bulletListMarker?: '-' | '+' | '*';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
    emDelimiter?: '_' | '*';
    strongDelimiter?: '__' | '**';
    linkStyle?: 'inlined' | 'referenced';
    linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut';
  }

  interface Rule {
    filter: string | string[] | ((node: Element) => boolean);
    replacement: (content: string, node: Element) => string;
  }

  class TurndownService {
    constructor(options?: TurndownOptions);
    turndown(html: string): string;
    addRule(key: string, rule: Rule): this;
    remove(filter: string | string[]): this;
  }

  export default TurndownService;
}

declare module 'fast-glob' {
  interface Options {
    cwd?: string;
    ignore?: string[];
    onlyFiles?: boolean;
    onlyDirectories?: boolean;
    dot?: boolean;
    absolute?: boolean;
    suppressErrors?: boolean;
  }

  function glob(patterns: string | string[], options?: Options): Promise<string[]>;
  
  export default glob;
}
