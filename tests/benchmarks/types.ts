export interface Task {
    name: string;
    prompt: string;
    verify: (cwd: string, output: string) => boolean | Promise<boolean>;
    setup?: (cwd: string) => void;
}

export interface Benchmark {
    name: string;
    description: string;
    tasks: Task[];
}
