-- 5. recent_searches table
CREATE TABLE recent_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    level TEXT,
    language TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index for fetching latest searches quickly
CREATE INDEX idx_recent_searches_created_at ON recent_searches(created_at DESC);

-- Enable RLS
ALTER TABLE recent_searches ENABLE ROW LEVEL SECURITY;

-- Allow public anonymous access since we don't have auth yet
-- IMPORTANT: In a real production app with auth, you should map this to user_id
CREATE POLICY "Allow public insert"
    ON recent_searches FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow public select"
    ON recent_searches FOR SELECT
    USING (true);
 