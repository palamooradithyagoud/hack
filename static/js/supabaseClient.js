/**
 * Supabase Service Layer & Fetch Interceptor
 * 
 * Provides a dynamically initialized database client and intercepts all fetch requests
 * to automatically attach the Supabase JWT access token to backend API calls.
 */

// Intercept all fetch requests to inject Supabase JWT
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // Only attempt to get session if supabaseClient has been created and it's not a request for /config
    if (window.supabaseClient && !url.includes('/config')) {
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            const token = data?.session?.access_token;
            if (token) {
                options.headers = {
                    ...options.headers,
                    'Authorization': `Bearer ${token}`
                };
            }
        } catch (e) {
            console.error("Failed to attach auth headers:", e);
        }
    }
    return originalFetch(url, options);
};

class DatabaseService {
    constructor() {
        this.client = null;
        this.initPromise = null;
    }

    /**
     * Fetch config dynamically and initialize Supabase Client.
     */
    async init() {
        if (this.client) return this.client;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            if (!window.ENV || !window.ENV.SUPABASE_URL) {
                try {
                    const res = await originalFetch('/config');
                    if (res.ok) {
                        window.ENV = await res.json();
                    } else {
                        throw new Error(`Config API returned status ${res.status}`);
                    }
                } catch (e) {
                    console.error("Failed to fetch public configuration:", e);
                }
            }

            const url = window.ENV?.SUPABASE_URL || 'http://127.0.0.1:54321';
            const key = window.ENV?.SUPABASE_ANON_KEY || 'your-anon-key-here';

            if (typeof supabase === 'undefined') {
                console.error("Supabase client library not loaded. Make sure the CDN script is loaded.");
                throw new Error("Supabase library not loaded");
            }

            this.client = supabase.createClient(url, key, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            window.supabaseClient = this.client;
            return this.client;
        })();

        return this.initPromise;
    }

    // --- Profiles ---
    
    async getProfile(userId) {
        await this.init();
        const { data, error } = await this.client
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();
            
        if (error) throw error;
        return data;
    }

    async updateProfile(userId, updates) {
        await this.init();
        const { data, error } = await this.client
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select();
            
        if (error) throw error;
        return data;
    }

    // --- Resume Analysis ---

    async saveResumeAnalysis(userId, fileUrl, atsScore, aiFeedback, improvementSuggestions) {
        await this.init();
        const { data, error } = await this.client
            .from('resume_analysis')
            .insert([{
                user_id: userId,
                resume_file_url: fileUrl,
                ats_score: atsScore,
                ai_feedback: aiFeedback,
                improvement_suggestions: improvementSuggestions
            }])
            .select();
            
        if (error) throw error;
        return data;
    }

    async getLatestResumeAnalysis(userId) {
        await this.init();
        const { data, error } = await this.client
            .from('resume_analysis')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
            
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is "Results contain 0 rows"
        return data;
    }

    // --- Storage ---
    
    async uploadResume(userId, file) {
        await this.init();
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${userId}/${fileName}`;

        const { data, error } = await this.client.storage
            .from('resumes')
            .upload(filePath, file);

        if (error) throw error;
        
        // Get public URL
        const { data: urlData } = this.client.storage
            .from('resumes')
            .getPublicUrl(filePath);
            
        return urlData.publicUrl;
    }

    // --- Recent Searches ---

    async saveSearch(query, level, language) {
        await this.init();
        const { data: { session } } = await this.client.auth.getSession();
        const userId = session?.user?.id;
        
        const searchData = {
            query: query,
            level: level,
            language: language
        };
        
        if (userId) {
            searchData.user_id = userId;
        }

        const { data, error } = await this.client
            .from('recent_searches')
            .insert([searchData]);
            
        if (error) {
            console.error("Failed to save search:", error);
        }
        return data;
    }

    async getRecentSearches(limit = 10) {
        await this.init();
        const { data, error } = await this.client
            .from('recent_searches')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
            
        if (error) {
            console.error("Failed to fetch recent searches:", error);
            return [];
        }
        return data;
    }
}

// Export a singleton instance
const db = new DatabaseService();
window.db = db;

// Trigger auto-initialization immediately
db.init().catch(err => {
    console.warn("Lazy setup scheduled; client library loading deferred.", err);
});
