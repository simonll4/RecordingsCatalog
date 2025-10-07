-- CreateTable
CREATE TABLE "sessions" (
    "session_id" TEXT NOT NULL,
    "dev_id" TEXT NOT NULL,
    "stream_path" TEXT,
    "edge_start_ts" BIGINT NOT NULL,
    "edge_end_ts" BIGINT,
    "playlist_url" TEXT,
    "start_pdt" TEXT,
    "end_pdt" TEXT,
    "meta_url" TEXT,
    "thumb_url" TEXT,
    "thumb_ts" BIGINT,
    "classes" JSONB,
    "created_at" BIGINT NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "detections" (
    "detection_id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "track_id" TEXT NOT NULL,
    "first_ts" BIGINT NOT NULL,
    "last_ts" BIGINT NOT NULL,
    "class" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "bb" JSONB NOT NULL,
    "frame_url" TEXT,
    "attributes" JSONB,
    "detection_ref" TEXT,

    CONSTRAINT "detections_pkey" PRIMARY KEY ("detection_id")
);

-- CreateIndex
CREATE INDEX "idx_sessions_dev_created" ON "sessions"("dev_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_detections_session_class" ON "detections"("session_id", "class");

-- CreateIndex
CREATE INDEX "idx_detections_session_track" ON "detections"("session_id", "track_id");

-- CreateIndex
CREATE UNIQUE INDEX "unique_session_track" ON "detections"("session_id", "track_id");

-- AddForeignKey
ALTER TABLE "detections" ADD CONSTRAINT "detections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;
