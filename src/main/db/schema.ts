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
      authors TEXT,
      category TEXT,
      tags TEXT,
      level TEXT CHECK(level IN ('beginner', 'intermediate', 'advanced')),
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
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'converting', 'generating', 'transcribing', 'transcribed')),
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
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'converting', 'paused', 'done', 'error')),
      progress REAL NOT NULL DEFAULT 0,
      speed TEXT,
      eta TEXT,
      fileSize TEXT,
      title TEXT,
      thumbnailUrl TEXT,
      duration REAL,
      chapters TEXT,
      lastError TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_imports (
      id TEXT PRIMARY KEY,
      seriesId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      epubPath TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'extracting', 'generating', 'done', 'error', 'cancelled')),
      totalChapters INTEGER NOT NULL DEFAULT 0,
      completedChapters INTEGER NOT NULL DEFAULT 0,
      chapters TEXT,
      lastError TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (seriesId) REFERENCES series(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_episodes_seriesId ON episodes(seriesId);
    CREATE INDEX IF NOT EXISTS idx_transcripts_episodeId ON transcripts(episodeId);
    CREATE INDEX IF NOT EXISTS idx_book_imports_seriesId ON book_imports(seriesId);
  `);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Migrate existing tables if they have old schemas
  migrateEpisodeStatuses(db);
  migrateTranscriptsDropStatus(db);
  migrateSeriesAddFields(db);
  migrateEpisodeAddConverting(db);
  migrateEpisodeAddGenerating(db);
  migrateDownloadsAddPausedAndMeta(db);
}

function migrateEpisodeStatuses(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='episodes'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return; // fresh DB, nothing to migrate

  // Already on new schema: only has ready/transcribing/transcribed
  if (!tableInfo.sql.includes('pending') && !tableInfo.sql.includes('ready_to_process') && !tableInfo.sql.includes('done')) return;

  db.pragma('foreign_keys = OFF');

  db.exec(`
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
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'converting', 'transcribing', 'transcribed')),
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
        WHEN 'pending' THEN 'ready'
        WHEN 'ready_to_process' THEN 'ready'
        WHEN 'done' THEN 'transcribed'
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

function migrateTranscriptsDropStatus(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='transcripts'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return;
  if (!tableInfo.sql.includes('status')) return; // already migrated

  db.pragma('foreign_keys = OFF');

  db.exec(`
    CREATE TABLE transcripts_new (
      id TEXT PRIMARY KEY,
      episodeId TEXT NOT NULL UNIQUE,
      language TEXT NOT NULL,
      segments TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (episodeId) REFERENCES episodes(id) ON DELETE CASCADE
    );

    INSERT INTO transcripts_new
    SELECT id, episodeId, language, segments, createdAt, updatedAt
    FROM transcripts;

    DROP TABLE transcripts;
    ALTER TABLE transcripts_new RENAME TO transcripts;
    CREATE INDEX IF NOT EXISTS idx_transcripts_episodeId ON transcripts(episodeId);
  `);

  db.pragma('foreign_keys = ON');
}

function migrateSeriesAddFields(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='series'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return;
  if (tableInfo.sql.includes('authors')) return; // already has new columns

  db.exec(`
    ALTER TABLE series ADD COLUMN authors TEXT;
    ALTER TABLE series ADD COLUMN category TEXT;
    ALTER TABLE series ADD COLUMN tags TEXT;
    ALTER TABLE series ADD COLUMN level TEXT CHECK(level IN ('beginner', 'intermediate', 'advanced'));
  `);
}

function migrateEpisodeAddConverting(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='episodes'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return;
  if (tableInfo.sql.includes('converting')) return; // already migrated

  db.pragma('foreign_keys = OFF');

  db.exec(`
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
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'converting', 'transcribing', 'transcribed')),
      publishStatus TEXT NOT NULL DEFAULT 'draft' CHECK(publishStatus IN ('draft', 'preview', 'published')),
      lastErrorMessage TEXT,
      lastErrorOccurredAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (seriesId) REFERENCES series(id) ON DELETE CASCADE
    );

    INSERT INTO episodes_new SELECT * FROM episodes;

    DROP TABLE episodes;
    ALTER TABLE episodes_new RENAME TO episodes;
    CREATE INDEX IF NOT EXISTS idx_episodes_seriesId ON episodes(seriesId);
  `);

  db.pragma('foreign_keys = ON');
}

function migrateEpisodeAddGenerating(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='episodes'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return;
  if (tableInfo.sql.includes('generating')) return; // already migrated

  db.pragma('foreign_keys = OFF');

  db.exec(`
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
      status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready', 'converting', 'generating', 'transcribing', 'transcribed')),
      publishStatus TEXT NOT NULL DEFAULT 'draft' CHECK(publishStatus IN ('draft', 'preview', 'published')),
      lastErrorMessage TEXT,
      lastErrorOccurredAt TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (seriesId) REFERENCES series(id) ON DELETE CASCADE
    );

    INSERT INTO episodes_new SELECT * FROM episodes;

    DROP TABLE episodes;
    ALTER TABLE episodes_new RENAME TO episodes;
    CREATE INDEX IF NOT EXISTS idx_episodes_seriesId ON episodes(seriesId);
  `);

  db.pragma('foreign_keys = ON');
}

function migrateDownloadsAddPausedAndMeta(db: Database.Database): void {
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='downloads'"
  ).get() as { sql: string } | undefined;

  if (!tableInfo) return;

  // Add new columns if missing
  if (!tableInfo.sql.includes('speed')) {
    db.exec(`
      ALTER TABLE downloads ADD COLUMN speed TEXT;
      ALTER TABLE downloads ADD COLUMN eta TEXT;
      ALTER TABLE downloads ADD COLUMN fileSize TEXT;
    `);
  }

  // Migrate status CHECK constraint to include 'paused' and 'converting'
  if (!tableInfo.sql.includes('paused') || !tableInfo.sql.includes('converting')) {
    db.exec(`
      CREATE TABLE downloads_new (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        filename TEXT NOT NULL,
        localPath TEXT,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'downloading', 'converting', 'paused', 'done', 'error')),
        progress REAL NOT NULL DEFAULT 0,
        speed TEXT,
        eta TEXT,
        fileSize TEXT,
        title TEXT,
        thumbnailUrl TEXT,
        duration REAL,
        chapters TEXT,
        lastError TEXT,
        createdAt TEXT NOT NULL
      );

      INSERT INTO downloads_new (id, url, filename, localPath, status, progress, speed, eta, fileSize, title, thumbnailUrl, duration, chapters, lastError, createdAt)
      SELECT id, url, filename, localPath, status, progress, speed, eta, fileSize, title, thumbnailUrl, duration, chapters, lastError, createdAt
      FROM downloads;

      DROP TABLE downloads;
      ALTER TABLE downloads_new RENAME TO downloads;
    `);
  }
}
