import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { pipeline } from 'stream/promises';
import { createReadStream, createWriteStream } from 'fs';
import { readFile } from 'fs/promises';

const ALGORITHM = 'aes-256-gcm';

export async function encryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
    const iv = randomBytes(12); // Standard for GCM
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const input = createReadStream(inputPath);
    const output = createWriteStream(outputPath);

    // Prepend IV (12 bytes)
    await new Promise<void>((resolve, reject) => {
        output.write(iv, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // To handle backpressure correctly and allow appending the Auth Tag,
    // we pipe the input to the cipher, and pipe the cipher to the output,
    // but tell the output stream NOT to end when the cipher finishes.
    await new Promise<void>((resolve, reject) => {
        input.on('error', reject);
        cipher.on('error', reject);
        output.on('error', reject);

        input.pipe(cipher).pipe(output, { end: false });

        cipher.on('end', () => {
            const authTag = cipher.getAuthTag();
            output.write(authTag, (err) => {
                if (err) reject(err);
                else {
                    output.end(resolve);
                }
            });
        });
    });
}

import { stat, open } from 'fs/promises';

export async function decryptFile(inputPath: string, outputPath: string, key: Buffer): Promise<void> {
    // We need to implement a streaming approach to avoid reading large backups into memory.
    // The file format is: [IV: 12 bytes] [Encrypted Payload] [Auth Tag: 16 bytes]

    const fileStats = await stat(inputPath);
    if (fileStats.size < 28) { // 12 (IV) + 16 (AuthTag)
        throw new Error("File too small to be a valid encrypted backup");
    }

    const payloadSize = fileStats.size - 28;
    const fileHandle = await open(inputPath, 'r');

    let ivBuffer = Buffer.alloc(12);
    let authTagBuffer = Buffer.alloc(16);

    try {
        // Read IV from beginning
        await fileHandle.read(ivBuffer, 0, 12, 0);
        // Read Auth Tag from end
        await fileHandle.read(authTagBuffer, 0, 16, fileStats.size - 16);
    } finally {
        await fileHandle.close();
    }

    const decipher = createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(authTagBuffer);

    const input = createReadStream(inputPath, { start: 12, end: 12 + payloadSize - 1 });
    const output = createWriteStream(outputPath);

    await pipeline(input, decipher, output);
}
