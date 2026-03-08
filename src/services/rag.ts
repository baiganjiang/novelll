import { pipeline, env } from '@xenova/transformers';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// Configure transformers.js to use local cache and not download unnecessarily
env.allowLocalModels = false;
env.useBrowserCache = true;

interface NovelDBSchema extends DBSchema {
  chunks: {
    key: string;
    value: {
      id: string;
      novelId: string;
      chapterId: string;
      text: string;
      embedding: number[];
    };
    indexes: {
      'by-novel': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<NovelDBSchema>> | null = null;

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<NovelDBSchema>('novel-rag-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('chunks', { keyPath: 'id' });
        store.createIndex('by-novel', 'novelId');
      },
    });
  }
  return dbPromise;
}

let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    // We use a small, fast model for browser embeddings
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return extractor;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const extract = await getExtractor();
  const output = await extract(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export async function addNovelChunks(novelId: string, chapterId: string, text: string) {
  const db = await getDB();
  
  // Simple chunking strategy: split by paragraphs
  const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 20);
  
  // Group into chunks of roughly 300-500 characters
  const chunks: string[] = [];
  let currentChunk = "";
  for (const p of paragraphs) {
    if (currentChunk.length + p.length > 500) {
      if (currentChunk) chunks.push(currentChunk);
      currentChunk = p;
    } else {
      currentChunk += (currentChunk ? "\n" : "") + p;
    }
  }
  if (currentChunk) chunks.push(currentChunk);

  // Process and store chunks
  for (let i = 0; i < chunks.length; i++) {
    const chunkText = chunks[i];
    const embedding = await generateEmbedding(chunkText);
    await db.put('chunks', {
      id: `${chapterId}-${i}`,
      novelId,
      chapterId,
      text: chunkText,
      embedding
    });
  }
}

export async function searchRelevantContext(novelId: string, query: string, topK: number = 3): Promise<string[]> {
  const db = await getDB();
  const queryEmbedding = await generateEmbedding(query);
  
  const allChunks = await db.getAllFromIndex('chunks', 'by-novel', novelId);
  
  if (allChunks.length === 0) return [];

  const scoredChunks = allChunks.map(chunk => ({
    text: chunk.text,
    score: cosineSimilarity(queryEmbedding, chunk.embedding)
  }));

  scoredChunks.sort((a, b) => b.score - a.score);
  
  return scoredChunks.slice(0, topK).map(c => c.text);
}

export async function clearNovelChunks(novelId: string) {
  const db = await getDB();
  const tx = db.transaction('chunks', 'readwrite');
  const index = tx.store.index('by-novel');
  let cursor = await index.openCursor(IDBKeyRange.only(novelId));
  
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}
