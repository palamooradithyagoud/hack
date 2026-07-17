-- ═══════════════════════════════════════════════════════════════
-- SkillPath AI Engine — Self-Improving Recommendation Tables
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. skills_cache — Permanent memory layer (fastest retrieval)
CREATE TABLE IF NOT EXISTS skills_cache (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name    TEXT NOT NULL,
    skill_key     TEXT NOT NULL UNIQUE,   -- normalized lowercase key
    tier          INTEGER NOT NULL,       -- 1=CSV, 3=YouTube+Groq
    source_type   TEXT NOT NULL,          -- 'csv' | 'youtube_api' | 'ai_ranked'
    recommendations JSONB,               -- Groq-ranked resources
    fallback_playlists JSONB,            -- Raw playlist list
    fallback_certs     JSONB,
    roadmap            JSONB,            -- AI career roadmap
    total_searches INTEGER DEFAULT 1,    -- how many times searched
    avg_confidence NUMERIC(5,2) DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skills_cache_key ON skills_cache(skill_key);
CREATE INDEX IF NOT EXISTS idx_skills_cache_searches ON skills_cache(total_searches DESC);

-- 2. trust_score_engine — Per-resource trust score (auto-improves)
CREATE TABLE IF NOT EXISTS trust_score_engine (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_url   TEXT NOT NULL UNIQUE,
    resource_title TEXT,
    channel_name   TEXT,
    skill_name     TEXT,
    trust_score    NUMERIC(5,2) DEFAULT 50.0,
    confidence_score NUMERIC(5,2) DEFAULT 50.0,
    click_count    INTEGER DEFAULT 0,
    save_count     INTEGER DEFAULT 0,
    ignore_count   INTEGER DEFAULT 0,
    completion_rate NUMERIC(5,2) DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trust_score_url ON trust_score_engine(resource_url);
CREATE INDEX IF NOT EXISTS idx_trust_score_skill ON trust_score_engine(skill_name);

-- 3. user_feedback — Individual user interactions (learning data)
CREATE TABLE IF NOT EXISTS user_feedback (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   TEXT,                  -- anonymous session tracking
    skill_name   TEXT NOT NULL,
    resource_url TEXT NOT NULL,
    resource_title TEXT,
    action       TEXT NOT NULL CHECK (action IN ('click', 'save', 'ignore', 'complete', 'roadmap_view')),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_feedback_skill ON user_feedback(skill_name);
CREATE INDEX IF NOT EXISTS idx_user_feedback_url ON user_feedback(resource_url);
CREATE INDEX IF NOT EXISTS idx_user_feedback_action ON user_feedback(action);

-- 4. recommendation_history — Full audit log of every recommendation
CREATE TABLE IF NOT EXISTS recommendation_history (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    skill_name   TEXT NOT NULL,
    tier         INTEGER,
    source_type  TEXT,
    recommendations_json JSONB,
    roadmap_generated BOOLEAN DEFAULT FALSE,
    session_id   TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rec_history_skill ON recommendation_history(skill_name);

-- 5. learning_progress — User roadmap completion tracking
CREATE TABLE IF NOT EXISTS learning_progress (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    skill_name      TEXT NOT NULL,
    completed_steps JSONB DEFAULT '[]',
    completion_pct  NUMERIC(5,2) DEFAULT 0,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(session_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_learning_progress_session ON learning_progress(session_id);

-- 6. success_metrics — Career outcome tracking
CREATE TABLE IF NOT EXISTS success_metrics (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      TEXT NOT NULL,
    skill_name      TEXT NOT NULL,
    outcome_type    TEXT CHECK (outcome_type IN (
                        'roadmap_complete', 'project_complete',
                        'resume_improved', 'interview_call',
                        'placement_success', 'skill_certified'
                    )),
    outcome_detail  TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_success_metrics_skill ON success_metrics(skill_name);
CREATE INDEX IF NOT EXISTS idx_success_metrics_outcome ON success_metrics(outcome_type);

-- ── Auto-update triggers ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ language plpgsql;

CREATE TRIGGER trg_skills_cache_updated
    BEFORE UPDATE ON skills_cache
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TRIGGER trg_trust_score_updated
    BEFORE UPDATE ON trust_score_engine
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

CREATE TRIGGER trg_learning_progress_updated
    BEFORE UPDATE ON learning_progress
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

-- ── RLS: allow service role full access ──────────────────────
ALTER TABLE skills_cache           ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_score_engine     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback          ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress      ENABLE ROW LEVEL SECURITY;
ALTER TABLE success_metrics        ENABLE ROW LEVEL SECURITY;

-- Allow anon/authenticated read on skills_cache (for frontend)
CREATE POLICY "Public read skills_cache"
    ON skills_cache FOR SELECT USING (true);

-- Allow anon insert on user_feedback (click tracking)
CREATE POLICY "Public insert user_feedback"
    ON user_feedback FOR INSERT WITH CHECK (true);

-- Allow anon insert on success_metrics
CREATE POLICY "Public insert success_metrics"
    ON success_metrics FOR INSERT WITH CHECK (true);

-- Allow anon upsert on learning_progress
CREATE POLICY "Public upsert learning_progress"
    ON learning_progress FOR ALL USING (true);

-- Service role handles all writes via backend (bypasses RLS automatically)
 