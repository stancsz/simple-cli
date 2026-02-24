
import { runBenchmarkSuite } from '../benchmarks/suite.js';

runBenchmarkSuite().catch((error) => {
    console.error("Benchmark suite failed:", error);
    process.exit(1);
});
