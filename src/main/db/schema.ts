import Database from 'better-sqlite3'

export function initializeDatabase(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS series (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      coverPath TEXT,
      type TEXT NOT NULL CHECK(type IN ('course', 'podcast', 'audiobook', 'video_series')),
      language TEXT NOT NULL DEFAULT 'en',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      seriesId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL CHECK(mimeType IN ('audio', 'video')),
      localPath TEXT,
      remoteUrl TEXT,
      duration REAL,
      sourceType TEXT,
      sourceOrigin TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready_to_process', 'transcribing', 'transcribed', 'done')),
      publishStatus TEXT NOT NULL DEFAULT 'draft' CHECK(publishStatus IN ('draft', 'preview', 'published')),
      lastErrorMessage TEXT,
      lastErrorOccurredAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (seriesId) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS transcripts (
      id TEXT PRIMARY KEY,
      episodeId TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'transcribing' CHECK(status IN ('transcribing', 'transcribed', 'nlp_processing', 'ready')),
      segments TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (episodeId) REFERENCES episodes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      filename TEXT NOT NULL,
      localPath TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'done', 'error')),
      progress REAL NOT NULL DEFAULT 0,
      title TEXT,
      thumbnailUrl TEXT,
      duration REAL,
      chapters TEXT,
      lastError TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_episodes_seriesId ON episodes(seriesId);
    CREATE INDEX IF NOT EXISTS idx_transcripts_episodeId ON transcripts(episodeId);
  `);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migrate existing episodes table if it has old CHECK constraint
  migrateEpisodeStatuses(db);
}

function migrateEpisodeStatuses(db: Database.Database): void {
  // Check if episodes table exists and has old status values
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='episodes'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return; // fresh DB, nothing to migrate
  if (!tableInfo.sql.includes('nlp_processing')) return; // already migrated

  // Disable FK checks during migration
  db.pragma('foreign_keys = OFF');

  db.exec(`
    -- Map old statuses to new ones inline during table rebuild
    CREATE TABLE episodes_new (
      id TEXT PRIMARY KEY,
      seriesId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      mimeType TEXT NOT NULL CHECK(mimeType IN ('audio', 'video')),
      localPath TEXT,
      remoteUrl TEXT,
      duration REAL,
      sourceType TEXT,
      sourceOrigin TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ready_to_process', 'transcribing', 'transcribed', 'done')),
      publishStatus TEXT NOT NULL DEFAULT 'draft' CHECK(publishStatus IN ('draft', 'preview', 'published')),
      lastErrorMessage TEXT,
      lastErrorOccurredAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (seriesId) REFERENCES series(id) ON DELETE CASCADE
    );

    INSERT INTO episodes_new
    SELECT
      id, seriesId, title, description, "order", mimeType, localPath, remoteUrl,
      duration, sourceType, sourceOrigin,
      CASE status
        WHEN 'nlp_processing' THEN 'transcribing'
        WHEN 'uploading' THEN 'transcribed'
        ELSE status
      END,
      publishStatus, lastErrorMessage, lastErrorOccurredAt, createdAt, updatedAt
    FROM episodes;

    DROP TABLE episodes;
    ALTER TABLE episodes_new RENAME TO episodes;
    CREATE INDEX IF NOT EXISTS idx_episodes_seriesId ON episodes(seriesId);
  `);

  db.pragma('foreign_keys = ON');
}
