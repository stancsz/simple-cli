import { Project, Node, SyntaxKind, SourceFile } from 'ts-morph';
import { join } from 'path';

export interface FileMetrics {
    filePath: string;
    cyclomaticComplexity: number;
    linesOfCode: number;
    importCount: number;
    dependencyCount: number;
}

export interface ArchitectureReport {
    totalFiles: number;
    totalLinesOfCode: number;
    averageComplexity: number;
    topRefactoringCandidates: FileMetrics[];
    metrics: FileMetrics[];
}

function calculateCyclomaticComplexity(sourceFile: SourceFile): number {
    let complexity = 1; // Base complexity

    sourceFile.forEachDescendant(node => {
        switch (node.getKind()) {
            case SyntaxKind.IfStatement:
            case SyntaxKind.ForStatement:
            case SyntaxKind.ForInStatement:
            case SyntaxKind.ForOfStatement:
            case SyntaxKind.WhileStatement:
            case SyntaxKind.DoStatement:
            case SyntaxKind.CaseClause:
            case SyntaxKind.ConditionalExpression: // Ternary
            case SyntaxKind.CatchClause:
            case SyntaxKind.AmpersandAmpersandToken: // Logical AND
            case SyntaxKind.BarBarToken: // Logical OR
            case SyntaxKind.QuestionQuestionToken: // Nullish coalescing
                complexity++;
                break;
        }
    });

    return complexity;
}

export async function analyzeArchitecture(sourceDir: string = 'src'): Promise<ArchitectureReport> {
    const project = new Project();

    // Add all typescript files in the specified directory
    const globPattern = join(process.cwd(), sourceDir, '**/*.ts');
    project.addSourceFilesAtPaths(globPattern);

    const sourceFiles = project.getSourceFiles();
    const metrics: FileMetrics[] = [];

    let totalLinesOfCode = 0;
    let totalComplexity = 0;

    for (const sourceFile of sourceFiles) {
        const filePath = sourceFile.getFilePath().replace(process.cwd(), '');

        // Skip declaration files or tests if they sneaked in, though we specified 'src'
        if (filePath.includes('.d.ts') || filePath.includes('.test.ts')) {
            continue;
        }

        const text = sourceFile.getFullText();
        const linesOfCode = text.split('\n').length;

        const cyclomaticComplexity = calculateCyclomaticComplexity(sourceFile);

        const imports = sourceFile.getImportDeclarations();
        const importCount = imports.length;

        // Estimate dependency count by looking at unique module specifiers
        const dependencies = new Set<string>();
        for (const imp of imports) {
            dependencies.add(imp.getModuleSpecifierValue());
        }
        const dependencyCount = dependencies.size;

        totalLinesOfCode += linesOfCode;
        totalComplexity += cyclomaticComplexity;

        metrics.push({
            filePath,
            cyclomaticComplexity,
            linesOfCode,
            importCount,
            dependencyCount
        });
    }

    // Sort by a heuristic for refactoring priority (complexity * linesOfCode)
    const sortedMetrics = [...metrics].sort((a, b) => {
        const scoreA = a.cyclomaticComplexity * a.linesOfCode;
        const scoreB = b.cyclomaticComplexity * b.linesOfCode;
        return scoreB - scoreA;
    });

    // Take top 10 as candidates
    const topRefactoringCandidates = sortedMetrics.slice(0, 10);
    const averageComplexity = metrics.length > 0 ? totalComplexity / metrics.length : 0;

    return {
        totalFiles: metrics.length,
        totalLinesOfCode,
        averageComplexity,
        topRefactoringCandidates,
        metrics: sortedMetrics
    };
}
