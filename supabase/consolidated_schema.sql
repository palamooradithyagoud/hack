-- ═══════════════════════════════════════════════════════════════
-- SkillPath Database Schema — Unified Setup Script
-- Paste this script into: Supabase Dashboard → SQL Editor → New Query → Run
-- ═══════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────
-- 1. Table Definitions
-- ──────────────────────────────────────────────

-- Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY, -- Linked to user uuid
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    target_role TEXT,
    skill_level TEXT,
    preferred_learning_path TEXT,
    target_companies TEXT[],
    leetcode_profile TEXT,
    github_profile TEXT,
    codeforces_profile TEXT,
    codementor_profile TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- Resume Analysis Table
CREATE TABLE IF NOT EXISTS resume_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    resume_file_url TEXT NOT NULL,
    ats_score INTEGER CHECK (ats_score >= 0 AND ats_score <= 100),
    ai_feedback JSONB,
    improvement_suggestions JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_resume_analysis_user_created ON resume_analysis(user_id, created_at DESC);

-- DSA Progress Table
CREATE TABLE IF NOT EXISTS dsa_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_solved INTEGER DEFAULT 0,
    easy_solved INTEGER DEFAULT 0,
    medium_solved INTEGER DEFAULT 0,
    hard_solved INTEGER DEFAULT 0,
    weak_topics TEXT[],
    daily_streak INTEGER DEFAULT 0,
    last_active_date DATE DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_dsa_progress_user ON dsa_progress(user_id);

-- Interview Progress Table
CREATE TABLE IF NOT EXISTS interview_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    target_company TEXT NOT NULL,
    mock_interview_score INTEGER CHECK (mock_interview_score >= 0 AND mock_interview_score <= 100),
    weak_areas TEXT[],
    interview_round_type TEXT,
    preparation_status TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_interview_progress_user_company ON interview_progress(user_id, target_company);

-- Recent Searches Table
CREATE TABLE IF NOT EXISTS recent_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query TEXT NOT NULL,
    level TEXT,
    language TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recent_searches_created_at ON recent_searches(created_at DESC);

-- Skills Cache (AI Engine Memory Layer)
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

-- Trust Score Engine (Auto-Improving Ratings)
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

-- User Feedback (Interaction History logs)
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

-- Recommendation History
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

-- Learning Progress (User roadmaps and saved playlists tracking)
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

-- Success Metrics (Outcomes)
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


-- ──────────────────────────────────────────────
-- 2. Trigger Functions & Triggers
-- ──────────────────────────────────────────────

-- General Updated At function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language plpgsql;

-- Interview Progress Updated At function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language plpgsql;

-- Set up trigger executions
DROP TRIGGER IF EXISTS trg_skills_cache_updated ON skills_cache;
CREATE TRIGGER trg_skills_cache_updated
    BEFORE UPDATE ON skills_cache
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS trg_trust_score_updated ON trust_score_engine;
CREATE TRIGGER trg_trust_score_updated
    BEFORE UPDATE ON trust_score_engine
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS trg_learning_progress_updated ON learning_progress;
CREATE TRIGGER trg_learning_progress_updated
    BEFORE UPDATE ON learning_progress
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at();

DROP TRIGGER IF EXISTS update_interview_progress_modtime ON interview_progress;
CREATE TRIGGER update_interview_progress_modtime
    BEFORE UPDATE ON interview_progress
    FOR EACH ROW EXECUTE PROCEDURE update_modified_column();


-- ──────────────────────────────────────────────
-- 3. Row Level Security (RLS) & Policies
-- ──────────────────────────────────────────────

-- Enable RLS on all tables
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE resume_analysis    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dsa_progress       ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE recent_searches    ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_cache       ENABLE ROW LEVEL SECURITY;
ALTER TABLE trust_score_engine ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_feedback      ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_progress  ENABLE ROW LEVEL SECURITY;
ALTER TABLE success_metrics    ENABLE ROW LEVEL SECURITY;

-- Setup permissive policies allowing full access (bypassing filters for local dev and backend service accounts)
CREATE POLICY "Public full access profiles" ON profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access resume_analysis" ON resume_analysis FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access dsa_progress" ON dsa_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access interview_progress" ON interview_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access recent_searches" ON recent_searches FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access skills_cache" ON skills_cache FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access trust_score_engine" ON trust_score_engine FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access user_feedback" ON user_feedback FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access recommendation_history" ON recommendation_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access learning_progress" ON learning_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public full access success_metrics" ON success_metrics FOR ALL USING (true) WITH CHECK (true);

-- Note: Storage buckets creation setup
-- To set up storage bucket correctly, go to Supabase Dashboard -> Storage -> Create a new bucket named "resumes" (set public = false).
