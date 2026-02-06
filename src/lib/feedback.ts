import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface FeedbackRequest {
  id: string;
  question: string;
  category: string;
  status: 'pending' | 'resolved';
  response?: string;
  timestamp: number;
}

export interface FeedbackDB {
  requests: FeedbackRequest[];
}

export class FeedbackManager {
  private dbPath: string;
  private db: FeedbackDB = { requests: [] };

  constructor(cwd: string) {
    this.dbPath = join(cwd, '.simple', 'feedback.json');
  }

  private async load() {
    if (existsSync(this.dbPath)) {
      try {
        const content = await readFile(this.dbPath, 'utf-8');
        this.db = JSON.parse(content);
      } catch {
        this.db = { requests: [] };
      }
    }
  }

  private async save() {
    const dir = join(this.dbPath, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.dbPath, JSON.stringify(this.db, null, 2));
  }

  async requestFeedback(question: string, category: string = 'general'): Promise<FeedbackRequest> {
    await this.load();

    const request: FeedbackRequest = {
      id: Math.random().toString(36).substring(2, 11),
      question,
      category,
      status: 'pending',
      timestamp: Date.now()
    };

    this.db.requests.push(request);
    await this.save();
    return request;
  }

  async getPendingRequests(): Promise<FeedbackRequest[]> {
    await this.load();
    return this.db.requests.filter(r => r.status === 'pending');
  }

  async getResolvedRequests(): Promise<FeedbackRequest[]> {
    await this.load();
    return this.db.requests.filter(r => r.status === 'resolved');
  }

  async resolveRequest(id: string, response: string): Promise<boolean> {
    await this.load();
    const req = this.db.requests.find(r => r.id === id);
    if (req) {
      req.status = 'resolved';
      req.response = response;
      await this.save();
      return true;
    }
    return false;
  }
}
