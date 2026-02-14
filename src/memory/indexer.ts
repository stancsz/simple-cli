import { Project, SyntaxKind, Node } from "ts-morph";
import fg from "fast-glob";
import path from "path";
import fs from "fs";
import { db } from "./db.js";
import { initSchema } from "./schema.js";
import { generateEmbedding } from "./embedder.js";
import { Chunk } from "./types.js";
import { log } from "@clack/prompts";

const BATCH_SIZE = 5;

export async function indexProject(projectRoot: string = process.cwd()) {
  log.info("Initializing memory schema...");
  initSchema();

  log.info("Scanning for TypeScript files...");
  const files = await fg(["src/**/*.ts", "src/**/*.tsx"], {
    cwd: projectRoot,
    ignore: ["**/*.test.ts", "**/*.spec.ts", "node_modules/**"],
  });

  log.info(`Found ${files.length} files. Starting indexing...`);

  const project = new Project({
    tsConfigFilePath: path.join(projectRoot, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
  });

  let processedCount = 0;

  for (const file of files) {
    const filePath = path.join(projectRoot, file);
    const sourceFile = project.addSourceFileAtPath(filePath);

    const chunks: Chunk[] = [];

    // Extract classes
    sourceFile.getClasses().forEach((cls) => {
      if (cls.isExported()) {
        chunks.push({
          id: `${file}#${cls.getName()}`,
          filePath: file,
          content: cls.getText(),
          type: "class",
          startLine: cls.getStartLineNumber(),
          endLine: cls.getEndLineNumber(),
        });
      }
    });

    // Extract interfaces
    sourceFile.getInterfaces().forEach((iface) => {
      if (iface.isExported()) {
        chunks.push({
          id: `${file}#${iface.getName()}`,
          filePath: file,
          content: iface.getText(),
          type: "interface",
          startLine: iface.getStartLineNumber(),
          endLine: iface.getEndLineNumber(),
        });
      }
    });

    // Extract functions
    sourceFile.getFunctions().forEach((func) => {
      if (func.isExported()) {
        chunks.push({
          id: `${file}#${func.getName()}`,
          filePath: file,
          content: func.getText(),
          type: "function",
          startLine: func.getStartLineNumber(),
          endLine: func.getEndLineNumber(),
        });
      }
    });

    // Store chunks
    for (const chunk of chunks) {
      // Check if chunk already exists (optional optimization: check hash)
      // For now, upsert.
      // Wait, sqlite-vec uses rowid. We need to manage mapping.
      // We insert into chunks table, get rowid (or use custom ID), then insert into vec_chunks.
      // But vec0 uses rowid. So we need to ensure consistency.

      try {
        const embedding = await generateEmbedding(chunk.content);

        // Transaction
        const insert = db.transaction(() => {
          // Get old rowid if exists so we can clean up the vector table
          const existing = db
            .prepare("SELECT rowid FROM chunks WHERE id = ?")
            .get(chunk.id) as { rowid: number } | undefined;
          if (existing) {
            db.prepare("DELETE FROM vec_chunks WHERE rowid = ?").run(
              existing.rowid,
            );
          }

          const info = db
            .prepare(
              `
                    INSERT OR REPLACE INTO chunks (id, file_path, content, type, start_line, end_line)
                    VALUES (@id, @filePath, @content, @type, @startLine, @endLine)
                `,
            )
            .run(chunk);

          const newRowId = Number(info.lastInsertRowid);

          // insert new vector
          db.prepare(
            `
                    INSERT INTO vec_chunks(rowid, embedding)
                    VALUES (?, ?)
                `,
          ).run(
            BigInt(newRowId),
            Buffer.from(new Float32Array(embedding).buffer),
          );
        });

        insert();
      } catch (e) {
        log.error(`Failed to index chunk ${chunk.id}: ${e}`);
      }
    }

    processedCount++;
    if (processedCount % BATCH_SIZE === 0) {
      log.info(`Indexed ${processedCount}/${files.length} files...`);
    }
  }

  log.success(`Indexing complete. Processed ${processedCount} files.`);
}
