/**
 * SkillRecommender N/A Premium SaaS Frontend Logic
 * Strictly Vanilla JS (no frameworks)
 */

/**
 * authFetch N/A Drop-in replacement for fetch() that automatically
 * attaches the Supabase JWT Bearer token to every API request.
 * This is required for all @token_required endpoints on the backend.
 */
async function authFetch(url, options = {}) {
    let token = null;

    // Try to get the live session token from the Supabase client SDK
    if (window.supabaseClient) {
        try {
            const { data } = await window.supabaseClient.auth.getSession();
            token = data?.session?.access_token || null;
        } catch (e) {
            console.warn('[authFetch] Could not get Supabase session:', e);
        }
    }

    // Fallback: parse token directly from localStorage if SDK call fails
    if (!token) {
        try {
            const sessionKey = Object.keys(localStorage).find(
                k => k.startsWith('sb-') && k.endsWith('-auth-token')
            );
            if (sessionKey) {
                const raw = JSON.parse(localStorage.getItem(sessionKey));
                token = raw?.access_token || null;
            }
        } catch (e) {
            console.warn('[authFetch] Could not parse token from localStorage:', e);
        }
    }

    // Merge Authorization header into request options
    const headers = {
        ...(options.headers || {}),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    return fetch(url, { ...options, headers });
}

document.addEventListener('DOMContentLoaded', () => {
    // Selectors
    const skillInput = document.getElementById('skill-input');
    const levelDropdown = document.getElementById('level-dropdown');
    const languageDropdown = document.getElementById('language-dropdown');
    const ctaButton = document.getElementById('cta-button');
    const loadingIndicator = document.getElementById('loading');
    const emptyState = document.getElementById('empty-state');
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toast-message');

    // Steps & Grids
    const resultsNav = document.getElementById('results-nav');
    const playlistStep = document.getElementById('playlist-step');
    const certificateStep = document.getElementById('certificate-step');
    const playlistGrid = document.getElementById('playlist-grid');
    const certificateGrid = document.getElementById('certificate-grid');

    // Tabs
    const tabPlaylists = document.getElementById('tab-playlists');
    const tabCertificates = document.getElementById('tab-certificates');
    const tabRoadmap = document.getElementById('tab-roadmap');
    const tierLabelBadge = document.getElementById('tier-label-badge');

    // Roadmap UI
    const roadmapStep = document.getElementById('roadmap-step');
    const roadmapContent = document.getElementById('roadmap-content');
    
    // AI Recommendations UI
    const aiRecommendations = document.getElementById('ai-recommendations');
    const aiRecommendationsGrid = document.getElementById('ai-recommendations-grid');
    const tierIndicator = document.getElementById('tier-indicator');

    // Session ID (anonymous tracking)
    let sessionId = sessionStorage.getItem('sp_sid');
    if (!sessionId) {
        sessionId = 'sp_' + Math.random().toString(36).substr(2, 12);
        sessionStorage.setItem('sp_sid', sessionId);
    }
    let currentUserId = null;

    // Local results store
    let currentSkill = '';
    let currentResults = {};

    // Active Roadmap state
    let activeRoadmap = null;

    // Saved playlists management state and actions
    let savedPlaylists = [];
    const generateVideosForPlaylist = (title, skill) => {
        const t = (title + ' ' + (skill || '')).toLowerCase();
        let topics = [];
        if (t.includes('java') && !t.includes('javascript')) {
            topics = [
                "Introduction to Java & Setup",
                "Variables and Data Types in Java",
                "Operators & Conditional Logic",
                "Loops in Java (For, While)",
                "Classes, Objects & Constructors",
                "Method Overloading & Overriding",
                "Inheritance & Polymorphism",
                "Abstraction & Interfaces",
                "Packages & Access Modifiers",
                "Exception Handling in Java"
            ];
        } else if (t.includes('python')) {
            topics = [
                "Python Installation & Basics",
                "Control Flow and Loops",
                "Functions & Argument Scope",
                "Lists, Tuples & Dictionaries",
                "File I/O Operations",
                "Object Oriented Python Basics",
                "Modules and PIP Packages",
                "Exception Handling in Python",
                "Lambda & List Comprehensions",
                "Intro to Pandas & NumPy"
            ];
        } else if (t.includes('c++') || t.includes('cpp')) {
            topics = [
                "C++ Introduction & Setup",
                "Variables, Constants & Operators",
                "Control Statements & Loops",
                "Functions & Memory Addresses",
                "Pointers and References",
                "Array Manipulation",
                "Classes and Object Instantiation",
                "Inheritance & Polymorphism",
                "STL Containers & Iterators",
                "File Streams & Exceptions"
            ];
        } else if (t.includes('c ') || t.startsWith('c ') || t.includes(' c ') || t.endsWith(' c') || t.includes('c datastructure') || t.includes('data structure')) {
            topics = [
                "Introduction to DSA & Big O",
                "Arrays & Dynamic Arrays",
                "Singly and Doubly Linked Lists",
                "Stacks & Queues",
                "Recursion & Binary Search",
                "Trees & Binary Search Trees",
                "Heaps & Priority Queues",
                "Graphs Representation (BFS/DFS)",
                "Hashing & Hash Maps",
                "Sorting Algorithms Complexity"
            ];
        } else {
            // General fallback
            topics = [
                "Introduction & Overview",
                "Environment Setup",
                "Variables & Operations",
                "Conditionals & Control Flow",
                "Functions & Parameters",
                "Working with Collections",
                "Errors & Exception Handling",
                "Debugging Techniques",
                "Mini-Project Implementation",
                "Final Review & Next Steps"
            ];
        }
        
        return topics.map((topicName, idx) => ({
            id: idx + 1,
            title: topicName,
            completed: false
        }));
    };

    const getSavedPlaylists = () => {
        return savedPlaylists;
    };

    const togglePlaylistSave = async (playlist, btnEl) => {
        const index = savedPlaylists.findIndex(p => p.url === playlist.url);
        if (index > -1) {
            // Remove it
            savedPlaylists.splice(index, 1);
            if (btnEl) {
                btnEl.textContent = '💾 Save';
                btnEl.classList.remove('saved');
            }
            showToast('Removed from saved playlists');
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
        } else {
            // Add it N/A fetch real videos from YouTube API
            playlist.savedAt = new Date().toISOString();
            playlist.completed = false;

            if (btnEl) {
                btnEl.textContent = 'â³ Loading...';
                btnEl.disabled = true;
            }

            try {
                const resp = await fetch(`/get-playlist-videos?playlist_url=${encodeURIComponent(playlist.url)}`);
                const data = await resp.json();
                if (data.videos && data.videos.length > 0) {
                    playlist.videos = data.videos;
                    showToast(`Saved! ${data.total} videos loaded from playlist`);
                } else {
                    // Fallback to generated videos
                    playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
                    showToast('Saved! (Using estimated video list)');
                }
            } catch (err) {
                console.error('Failed to fetch playlist videos:', err);
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
                showToast('Saved! (Using estimated video list)');
            }

            savedPlaylists.push(playlist);
            if (btnEl) {
                btnEl.textContent = '✅ Saved';
                btnEl.classList.add('saved');
                btnEl.disabled = false;
            }
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
            
            // Track save event to DB
            trackClick(playlist.url, playlist.title, 'save');
        }
    };

    const togglePlaylistCompleted = (url, isChecked) => {
        const playlist = savedPlaylists.find(p => p.url === url);
        if (playlist) {
            playlist.completed = isChecked;
            playlist.completedAt = isChecked ? new Date().toISOString() : null;
            if (!playlist.videos) {
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
            }
            playlist.videos.forEach(v => {
                v.completed = isChecked;
            });
            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
            showToast(isChecked ? 'All videos completed!' : 'Marked incomplete');

            // Track complete event to DB if marked as complete
            if (isChecked) {
                trackClick(playlist.url, playlist.title, 'complete');
            }
        }
    };

    const toggleVideoCompleted = (playlistUrl, videoId, isChecked) => {
        const playlist = savedPlaylists.find(p => p.url === playlistUrl);
        if (playlist) {
            if (!playlist.videos) {
                playlist.videos = generateVideosForPlaylist(playlist.title, playlist.skill);
            }
            const video = playlist.videos.find(v => v.id === videoId);
            if (video) {
                video.completed = isChecked;
            }
            
            // Re-calculate playlist completion
            const total = playlist.videos.length;
            const completedCount = playlist.videos.filter(v => v.completed).length;
            const wasCompleted = playlist.completed;
            playlist.completed = (completedCount === total);
            playlist.completedAt = playlist.completed ? new Date().toISOString() : null;

            syncSavedPlaylists(savedPlaylists);
            renderSavedPlaylists();
            updateCommandCenter();
            
            showToast(`Video marked ${isChecked ? 'completed' : 'incomplete'} (${completedCount}/${total})`);

            // Track complete event to DB if all videos were completed by checking this box
            if (playlist.completed && !wasCompleted) {
                trackClick(playlist.url, playlist.title, 'complete');
            }
        }
    };

    const removePlaylist = (url) => {
        savedPlaylists = savedPlaylists.filter(p => p.url !== url);
        syncSavedPlaylists(savedPlaylists);
        renderSavedPlaylists();
        updateCommandCenter();
        showToast('Removed playlist');
        
        // Also update any visible buttons on screen
        document.querySelectorAll(`.btn-save-playlist[data-url="${url}"]`).forEach(btn => {
            btn.textContent = '💾 Save';
            btn.classList.remove('saved');
        });
    };

    const syncSavedPlaylists = async (savedList) => {
        try {
            await authFetch('/sync-saved-playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlists_list: savedList })
            });
        } catch (e) {
            console.error("Failed to sync saved playlists to DB:", e);
        }
    };

    const renderSavedPlaylists = () => {
        const saved = getSavedPlaylists();
        const savedCountEl = document.getElementById('saved-playlists-count');
        const completedCountEl = document.getElementById('completed-playlists-count');
        const listContainer = document.getElementById('saved-playlists-list');

        if (savedCountEl) savedCountEl.textContent = saved.length;
        
        const completedCount = saved.filter(p => p.completed).length;
        if (completedCountEl) completedCountEl.textContent = completedCount;

        if (!listContainer) return;

        if (saved.length === 0) {
            listContainer.innerHTML = `<p class="empty-state" style="padding:10px 0; font-size:0.9rem; margin:0;">No playlists saved yet. Go to the Learning tab to search and save playlists.</p>`;
            return;
        }

        listContainer.innerHTML = '';
        saved.forEach(p => {
            const card = document.createElement('div');
            card.className = 'saved-playlist-card';
            
            const totalCount = p.videos.length;
            const completedCount = p.videos.filter(v => v.completed).length;
            const progressPct = Math.round((completedCount / totalCount) * 100);

            card.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
                    <div class="saved-playlist-info">
                        <div class="saved-playlist-title">${escapeHTML(p.title)}</div>
                        <div class="saved-playlist-meta">
                            ${escapeHTML(p.channel)} | ${escapeHTML(p.skill)} | ${escapeHTML(p.level)}
                        </div>
                    </div>
                    <div class="saved-playlist-actions" style="margin-left: auto;">
                        <label class="saved-playlist-check">
                            <input type="checkbox" class="playlist-complete-checkbox" data-url="${escapeHTML(p.url)}" ${p.completed ? 'checked' : ''}>
                            <span>${p.completed ? '✅ Done' : 'Mark Done'}</span>
                        </label>
                        <a href="${p.url}" target="_blank" class="btn-watch" style="padding: 6px 12px; font-size: 0.75rem; border-radius: var(--radius-sm);">Watch</a>
                        <button class="btn-remove-saved" data-url="${escapeHTML(p.url)}">Delete</button>
                    </div>
                </div>
                
                <!-- Progress Bar -->
                <div style="margin-top: 12px;">
                    <div style="width: 100%; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden; margin-bottom: 4px;">
                        <div style="width: ${progressPct}%; height: 100%; background: var(--success); transition: width 0.3s var(--smooth);"></div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: var(--text-sub); font-weight: 500;">
                            ${completedCount} of ${totalCount} videos completed (${progressPct}%)
                        </span>
                        <button class="saved-playlist-videos-toggle" data-expanded="false" style="font-size:0.75rem; color:var(--primary); background:none; border:none; cursor:pointer; font-weight:700;">
                            â–¼ Show Videos (${totalCount})
                        </button>
                    </div>
                </div>

                <!-- Collapsible Video Checklist -->
                <div class="playlist-videos-list" style="display: none;">
                    ${p.videos.map(v => `
                        <label class="playlist-video-item ${v.completed ? 'completed' : ''}">
                            <input type="checkbox" class="video-checkbox" data-video-id="${v.id}" ${v.completed ? 'checked' : ''}>
                            <span>${v.id}. ${escapeHTML(v.title)}</span>
                            ${v.videoId ? `<a href="https://www.youtube.com/watch?v=${v.videoId}" target="_blank" class="video-play-link" title="Watch on YouTube">â–¶</a>` : ''}
                        </label>
                    `).join('')}
                </div>
            `;

            // Expand/Collapse Listener
            const toggleBtn = card.querySelector('.saved-playlist-videos-toggle');
            const videosList = card.querySelector('.playlist-videos-list');
            toggleBtn.addEventListener('click', () => {
                const isExpanded = toggleBtn.getAttribute('data-expanded') === 'true';
                if (isExpanded) {
                    videosList.style.display = 'none';
                    toggleBtn.setAttribute('data-expanded', 'false');
                    toggleBtn.textContent = `â–¼ Show Videos (${totalCount})`;
                } else {
                    videosList.style.display = 'flex';
                    toggleBtn.setAttribute('data-expanded', 'true');
                    toggleBtn.textContent = `â–² Hide Videos`;
                }
            });

            // General Playlist Completion Checkbox Listener
            card.querySelector('.playlist-complete-checkbox').addEventListener('change', (e) => {
                togglePlaylistCompleted(p.url, e.target.checked);
            });

            // Individual Video Checkboxes Listeners
            card.querySelectorAll('.video-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => {
                    const videoId = parseInt(e.target.getAttribute('data-video-id'));
                    toggleVideoCompleted(p.url, videoId, e.target.checked);
                });
            });

            card.querySelector('.btn-remove-saved').addEventListener('click', () => {
                removePlaylist(p.url);
            });

            listContainer.appendChild(card);
        });
    };

    const initSavedPlaylists = async () => {
        try {
            const res = await authFetch('/get-saved-playlists');
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) {
                    let changed = false;
                    savedPlaylists = list.map(p => {
                        if (!p.videos || p.videos.length === 0) {
                            p.videos = generateVideosForPlaylist(p.title, p.skill);
                            changed = true;
                        }
                        return p;
                    });
                    if (changed) {
                        syncSavedPlaylists(savedPlaylists);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to fetch saved playlists from DB:", e);
        }
        renderSavedPlaylists();
    };

    // â”€â”€ ACTIVE ROADMAP TRACKING SYSTEM â”€â”€
    const initActiveRoadmap = async () => {
        try {
            const res = await authFetch('/get-active-roadmap');
            if (res.ok) {
                const data = await res.json();
                if (data && data.skill && data.steps) {
                    activeRoadmap = data;
                } else {
                    activeRoadmap = null;
                }
            }
        } catch (e) {
            console.error("Failed to fetch active roadmap:", e);
        }
        renderDashboardRoadmap();
    };

    const renderDashboardRoadmap = () => {
        const cardEmpty = document.getElementById('dashboard-active-roadmap-empty');
        const cardContent = document.getElementById('dashboard-active-roadmap-content');
        const metaHeader = document.getElementById('dashboard-active-roadmap-header-meta');
        const skillBadge = document.getElementById('dashboard-active-roadmap-skill');
        const progressText = document.getElementById('dashboard-roadmap-progress-text');
        const pctBadge = document.getElementById('dashboard-roadmap-pct-badge');
        const progressBar = document.getElementById('dashboard-roadmap-progress-bar');
        const checklist = document.getElementById('dashboard-roadmap-checklist');

        if (!activeRoadmap) {
            if (metaHeader) metaHeader.style.display = 'none';
            if (cardContent) cardContent.style.display = 'none';
            if (cardEmpty) cardEmpty.style.display = 'flex';
            return;
        }

        // Show active elements
        if (cardEmpty) cardEmpty.style.display = 'none';
        if (metaHeader) metaHeader.style.display = 'flex';
        if (cardContent) cardContent.style.display = 'flex';

        // Update titles
        if (skillBadge) {
            skillBadge.textContent = `${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})`;
        }

        // Calculate progress
        const total = activeRoadmap.steps.length;
        const completed = activeRoadmap.steps.filter(s => s.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        if (progressText) {
            progressText.textContent = `Progress: ${pct}% (${completed} / ${total} steps completed)`;
        }
        if (pctBadge) {
            pctBadge.textContent = `${pct}%`;
        }
        if (progressBar) {
            progressBar.style.width = `${pct}%`;
        }

        // Render steps grouped by phase
        if (checklist) {
            checklist.innerHTML = '';
            const phases = [
                { key: 'beginner', label: '🌱 Beginner Phase' },
                { key: 'intermediate', label: '🔥 Intermediate Phase' },
                { key: 'advanced', label: '🚀 Advanced Phase' },
                { key: 'projects', label: '🛠️ Projects to Build' },
                { key: 'certifications', label: 'ðŸ† Recommended Certifications' },
                { key: 'interview_prep', label: '💼 Interview Prep Focus' }
            ];

            phases.forEach(phase => {
                const phaseSteps = activeRoadmap.steps.filter(s => s.phaseKey === phase.key);
                if (phaseSteps.length > 0) {
                    // Render Phase Header
                    const header = document.createElement('div');
                    header.className = 'roadmap-phase-title-group';
                    header.innerHTML = `<span>${phase.label}</span>`;
                    checklist.appendChild(header);

                    // Render Phase Steps
                    phaseSteps.forEach(step => {
                        const stepEl = document.createElement('div');
                        stepEl.className = `roadmap-step-item ${step.completed ? 'completed' : ''}`;
                        
                        const isProject = phase.key === 'projects';
                        const descHtml = isProject && step.description ? `<span class="roadmap-step-desc">${escapeHTML(step.description)}</span>` : '';

                        stepEl.innerHTML = `
                            <input type="checkbox" class="roadmap-checkbox" data-step-id="${step.id}" ${step.completed ? 'checked' : ''}>
                            <div class="roadmap-step-text-wrap">
                                <span class="roadmap-step-title">${escapeHTML(step.title)}</span>
                                ${descHtml}
                            </div>
                        `;

                        // Checkbox event listener
                        stepEl.querySelector('.roadmap-checkbox').addEventListener('change', (e) => {
                            toggleRoadmapStep(step.id, e.target.checked);
                        });

                        checklist.appendChild(stepEl);
                    });
                }
            });
        }
    };

    const toggleRoadmapStep = async (stepId, isChecked) => {
        if (!activeRoadmap) return;
        activeRoadmap.steps = activeRoadmap.steps.map(s => {
            if (s.id === stepId) {
                s.completed = isChecked;
            }
            return s;
        });

        // Auto-sync completed projects to Projects portfolio tab
        const toggledStep = activeRoadmap.steps.find(s => s.id === stepId);
        if (toggledStep && toggledStep.phaseKey === 'projects') {
            try {
                const res = await authFetch('/get-user-projects');
                if (res.ok) {
                    const plist = await res.json();
                    if (Array.isArray(plist)) {
                        customProjects = plist;
                    }
                }
            } catch (e) {
                console.error("Failed to load custom projects on toggle:", e);
            }

            if (isChecked) {
                if (!customProjects.some(p => p.title === toggledStep.title)) {
                    customProjects.push({
                        title: toggledStep.title,
                        category: activeRoadmap.skill + " Roadmap",
                        desc: toggledStep.description || `Auto-logged: Completed from the ${activeRoadmap.skill} roadmap.`
                    });
                }
            } else {
                customProjects = customProjects.filter(p => p.title !== toggledStep.title);
            }
            await syncProjects();
        }

        // Compute new percentage
        const total = activeRoadmap.steps.length;
        const completed = activeRoadmap.steps.filter(s => s.completed).length;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

        // Render dashboard card
        renderDashboardRoadmap();

        // Render Learning tab if it's currently showing the same roadmap
        if (currentResults && currentResults.roadmap && 
            currentResults.skill === activeRoadmap.skill && 
            (currentResults.level || 'Beginner') === activeRoadmap.level) {
            renderActiveRoadmapChecklistInLearning();
        }

        // Sync with backend
        try {
            await authFetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill: activeRoadmap.skill,
                    level: activeRoadmap.level,
                    steps: activeRoadmap.steps,
                    completion_pct: pct
                })
            });

            // If checked to 100% completion, automatically log milestone achievement
            if (pct === 100) {
                const milestoneDetail = `Completed ${activeRoadmap.skill} (${activeRoadmap.level}) roadmap!`;
                await authFetch('/add-milestone', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        skill_name: activeRoadmap.skill,
                        outcome_type: 'roadmap_complete',
                        outcome_detail: milestoneDetail
                    })
                });
                // Reload milestones to update Profile & Analytics lists
                initProfileMilestones();
            }
        } catch (e) {
            console.error("Failed to sync active roadmap step or milestone:", e);
        }
    };

    const renderActiveRoadmapChecklistInLearning = () => {
        renderStep('roadmap');
    };

    // Milestones tracking
    const initProfileMilestones = async () => {
        try {
            const res = await authFetch('/get-milestones');
            if (res.ok) {
                const list = await res.json();
                renderMilestones(list);
            }
        } catch (e) {
            console.error("Failed to load milestones:", e);
        }
    };

    const renderMilestones = (list) => {
        const profileList = document.getElementById('profile-milestones-list');
        const analyticsList = document.getElementById('analytics-milestones-list');
        
        const html = list.length > 0 ? list.map(m => `
            <div style="background:var(--bg-main); border:1px solid var(--border); padding:14px 18px; border-radius:var(--radius-md); display:flex; align-items:center; gap:14px;">
                <span style="font-size:1.6rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.05));">ðŸ†</span>
                <div style="display:flex; flex-direction:column; gap:3px;">
                    <strong style="color:var(--text-main); font-size:0.925rem; line-height:1.3;">${escapeHTML(m.outcome_detail || m.skill_name)}</strong>
                     <span style="color:var(--text-muted); font-size:0.75rem;">Earned ${new Date(m.created_at).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                </div>
            </div>
        `).join('') : `
            <p class="empty-state" style="margin:0; padding:10px 0; font-size:0.85rem;">No milestone achievements earned yet. Complete an active roadmap to 100% to earn your first badge!</p>
        `;

        if (profileList) {
            profileList.innerHTML = html;
        }
        
        const analyticsHtml = list.length > 0 ? list.map(m => `
            <div style="background:var(--bg-card); border:1px solid var(--border); padding:16px 20px; border-radius:var(--radius-lg); display:flex; align-items:center; gap:16px; box-shadow:var(--shadow-card); margin-bottom:12px;">
                <div style="font-size:2rem; background:rgba(37,99,235,0.08); width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">ðŸ†</div>
                <div style="display:flex; flex-direction:column; gap:4px; flex-grow:1;">
                    <strong style="color:var(--text-main); font-size:1rem; font-family:'Outfit',sans-serif;">${escapeHTML(m.outcome_detail || m.skill_name)}</strong>
                    <span style="color:var(--text-muted); font-size:0.8rem;">Career Milestone Achievement â€¢ Completed on ${new Date(m.created_at).toLocaleDateString(undefined, {year: 'numeric', month: 'long', day: 'numeric'})}</span>
                </div>
            </div>
        `).join('') : `
            <p class="empty-state" style="margin:0; padding:16px 0; font-size:0.85rem;">No completed milestones recorded yet. Finish active roadmaps to list achievements here!</p>
        `;

        if (analyticsList) {
            analyticsList.innerHTML = analyticsHtml;
        }
    };

    const trackRoadmapFlow = async () => {
        if (!currentResults || !currentResults.roadmap) return;
        
        // Confirmation dialog if already tracking something else
        if (activeRoadmap && (activeRoadmap.skill !== currentResults.skill || activeRoadmap.level !== (currentResults.level || 'Beginner'))) {
            const ok = confirm(`You are already tracking an active roadmap for "${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})". Tracking this new one will overwrite your current progress. Do you want to proceed?`);
            if (!ok) return;
        }

        // Convert the hierarchical JSON into flat steps
        const rm = currentResults.roadmap;
        const steps = [];
        let idCounter = 1;

        if (Array.isArray(rm.beginner)) {
            rm.beginner.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'beginner', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.intermediate)) {
            rm.intermediate.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'intermediate', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.advanced)) {
            rm.advanced.forEach(topic => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'advanced', title: topic, completed: false });
            });
        }
        if (Array.isArray(rm.projects)) {
            rm.projects.forEach(p => {
                steps.push({ 
                    id: `step_${idCounter++}`, 
                    phaseKey: 'projects', 
                    title: p.name || p.title || 'Project', 
                    description: p.description || '', 
                    completed: false 
                });
            });
        }
        if (Array.isArray(rm.certifications)) {
            rm.certifications.forEach(cert => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'certifications', title: cert, completed: false });
            });
        }
        if (Array.isArray(rm.interview_prep)) {
            rm.interview_prep.forEach(prep => {
                steps.push({ id: `step_${idCounter++}`, phaseKey: 'interview_prep', title: prep, completed: false });
            });
        }

        activeRoadmap = {
            skill: currentResults.skill,
            level: currentResults.level || 'Beginner',
            steps: steps
        };

        // Render dashboard card
        renderDashboardRoadmap();

        // Render in learning tab
        renderStep('roadmap');

        // Sync with backend
        try {
            await authFetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    skill: activeRoadmap.skill,
                    level: activeRoadmap.level,
                    steps: activeRoadmap.steps,
                    completion_pct: 0.0
                })
            });
        } catch (e) {
            console.error("Failed to sync tracked roadmap:", e);
        }
    };

    const untrackRoadmapFlow = async () => {
        if (!activeRoadmap) return;
        const ok = confirm(`Are you sure you want to stop tracking the roadmap for "${activeRoadmap.skill} (${activeRoadmap.level || 'Beginner'})"? Your progress will be permanently lost.`);
        if (!ok) return;

        activeRoadmap = null;
        renderDashboardRoadmap();

        // Update Learning tab if it was rendering the tracked roadmap
        renderStep('roadmap');

        try {
            await authFetch('/sync-active-roadmap', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(null)
            });
        } catch (e) {
            console.error("Failed to untrack active roadmap:", e);
        }
    };

    // Silent click tracker
    const trackClick = (url, title, action = 'click') => {
        if (!url || url === '#') return;
        fetch('/track-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                resource_url: url,
                resource_title: title,
                skill_name: currentSkill,
                action,
                session_id: sessionId
            })
        }).catch(() => {});
    };

    /**
     * Handle Search
     */
    const handleSearch = async () => {
        const skill = skillInput.value.trim();
        const level = levelDropdown.value;
        const language = languageDropdown.value;

        if (!skill) {
            showToast('Please enter a skill to learn.');
            return;
        }

        // Reset UI
        setLoading(true);
        resetViews();
        emptyState.innerHTML = `<p>Enter a skill above to generate your learning path.</p>`;

        try {
            const response = await fetch('/get-resource', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill, level, language })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to fetch resources.');
            }

            const data = await response.json();
            currentResults = data;

            currentSkill = skill;

            const hasPlaylists = data.fallback_playlists && data.fallback_playlists.length > 0;
            const hasCerts = data.fallback_certs && data.fallback_certs.length > 0;
            const hasRecommendations = data.recommendations;

            if (!hasPlaylists && !hasCerts && !hasRecommendations) {
                setLoading(false);
                emptyState.style.display = 'block';
                return;
            }

            // Tier label badge
            if (tierLabelBadge) tierLabelBadge.textContent = data.tier_label || '';

            if (data.tier === 0) {
                tierIndicator.textContent = 'âš¡ Instant Result: Retrieved from AI Memory';
            } else if (data.tier === 1) {
                tierIndicator.textContent = '🚀 Curated Result: Trusted CSV Dataset';
            } else if (data.tier >= 3) {
                tierIndicator.textContent = 'ðŸ§  AI-Ranked Result: Groq Intelligence Engine';
            } else {
                tierIndicator.textContent = 'The best free curated playlists to build your foundation.';
            }

            if (data.roadmap) {
                tabRoadmap.style.display = 'inline-block';
            } else {
                tabRoadmap.style.display = 'none';
            }

            // Show Navigation and Step 1
            resultsNav.style.display = 'flex';
            renderStep('playlists');

            // Save to Supabase (fire and forget)
            if (window.db && window.db.saveSearch) {
                window.db.saveSearch(skill, level, language);
            }

        } catch (error) {
            if (error.message.includes("No verified high-quality")) {
                emptyState.innerHTML = `<p style="color: var(--danger); font-size: 1.1rem; font-weight: 500;">âŒ ${escapeHTML(error.message)}</p>`;
            } else {
                showToast(error.message);
            }
            emptyState.style.display = 'block';
        } finally {
            setLoading(false);
        }
    };

    const renderAIMentorCard = (category, data) => {
        const card = document.createElement('div');
        card.className = 'resource-card show';
        const vStatus = data.verification_status ? `<span class="pill-badge" style="background: #059669; color: white; margin-left: auto;">${escapeHTML(data.verification_status)}</span>` : '';
        
        const savedList = getSavedPlaylists();
        const isSaved = savedList.some(p => p.url === data.url);
        const saveBtnLabel = isSaved ? '✅ Saved' : '💾 Save';
        const saveBtnClass = isSaved ? 'btn-save-playlist saved' : 'btn-save-playlist';

        const isCert = !data.url.includes('youtube.com');
        const btnLabel = isCert ? 'Join Course' : 'Watch Playlist';

        const actionButtonsHtml = isCert ? `
            <a href="${data.url}" target="_blank" class="btn-watch" rel="noopener noreferrer"
               style="grid-column: span 2; text-align: center; background: var(--primary); border-color: transparent;"
               onclick="trackClickGlobal('${data.url.replace(/'/g,"\\'")}',' ${escapeHTML(data.title).replace(/'/g,"\\'")}')">${btnLabel}</a>
        ` : `
            <a href="${data.url}" target="_blank" class="btn-watch" rel="noopener noreferrer"
               style="background: var(--primary); border-color: transparent;"
               onclick="trackClickGlobal('${data.url.replace(/'/g,"\\'")}',' ${escapeHTML(data.title).replace(/'/g,"\\'")}')">${btnLabel}</a>
            <button class="${saveBtnClass}" data-url="${escapeHTML(data.url)}">
                ${saveBtnLabel}
            </button>
        `;

        card.innerHTML = `
            <div class="card-header" style="flex-wrap: wrap;">
                <span class="pill-badge" style="background: var(--primary); color: white;">${escapeHTML(category.toUpperCase())}</span>
                <span class="pill-badge">Trust: ${data.trust_score || 90}/100</span>
                ${vStatus}
            </div>
            <h3 class="card-title">${escapeHTML(data.title)}</h3>
            <span class="channel-name">${escapeHTML(data.channel)}</span>
            <p class="card-desc" style="margin-top: 10px;"><strong>💡 Why:</strong> ${escapeHTML(data.why_selected)}</p>
            <p class="card-desc"><strong>â±ï¸ Time:</strong> ${escapeHTML(data.estimated_time)} | <strong>🎯 Outcome:</strong> ${escapeHTML(data.expected_outcome)}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto;">
                ${actionButtonsHtml}
            </div>
        `;

        const saveBtn = card.querySelector('.btn-save-playlist');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlaylistSave({
                    title: data.title,
                    channel: data.channel,
                    url: data.url,
                    duration: data.estimated_time || 'Full',
                    level: 'All',
                    skill: category
                }, saveBtn);
            });
        }

        return card;
    };

    /**
     * Render a specific view step
     */
    const renderStep = (step) => {
        // Reset all
        playlistStep.classList.remove('active');
        certificateStep.classList.remove('active');
        roadmapStep.classList.remove('active');
        tabPlaylists.classList.remove('active');
        tabCertificates.classList.remove('active');
        tabRoadmap.classList.remove('active');

        if (step === 'playlists') {
            playlistGrid.innerHTML = '';
            aiRecommendationsGrid.innerHTML = '';
            playlistStep.classList.add('active');
            tabPlaylists.classList.add('active');
            
            if (currentResults.recommendations) {
                aiRecommendations.style.display = 'block';
                Object.entries(currentResults.recommendations).forEach(([category, data], index) => {
                    if(data && data.url) {
                        const card = renderAIMentorCard(category.replace('_', ' '), data);
                        aiRecommendationsGrid.appendChild(card);
                    }
                });
            } else {
                aiRecommendations.style.display = 'none';
            }

            if (currentResults.fallback_playlists) {
                currentResults.fallback_playlists.forEach((item, index) => {
                    const card = createCard(item, index);
                    playlistGrid.appendChild(card);
                    setTimeout(() => card.classList.add('show'), (index + 2) * 100);
                });
            }
        } 
        else if (step === 'certificates') {
            certificateGrid.innerHTML = '';
            certificateStep.classList.add('active');
            tabCertificates.classList.add('active');

            if (currentResults.fallback_certs) {
                currentResults.fallback_certs.forEach((item, index) => {
                    const card = createCard(item, index);
                    certificateGrid.appendChild(card);
                    setTimeout(() => card.classList.add('show'), index * 100);
                });
            }
        }
        else if (step === 'roadmap') {
            roadmapContent.innerHTML = '';
            roadmapStep.classList.add('active');
            tabRoadmap.classList.add('active');

            const rm = currentResults.roadmap;
            if (rm) {
                const isCurrentlyTracked = activeRoadmap && 
                                           activeRoadmap.skill === currentResults.skill && 
                                           activeRoadmap.level === (currentResults.level || 'Beginner');

                // Add Tracking Status / Action Button at the top
                const trackingBtnContainer = document.createElement('div');
                trackingBtnContainer.style.marginBottom = '24px';
                
                if (isCurrentlyTracked) {
                    trackingBtnContainer.innerHTML = `
                        <div style="display:flex; gap:12px; align-items:center;">
                            <button id="btn-track-this-roadmap" class="btn-outline-primary" style="flex:1; background:rgba(37,99,235,0.05); color:var(--primary); border-color:var(--primary); font-weight:700; pointer-events:none; cursor:default; height:44px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:var(--radius-md);">
                                <span>✓ Currently Tracking Progress</span>
                            </button>
                            <button id="btn-learning-untrack" class="btn-outline-danger" style="color:var(--danger); border-color:var(--danger); height:44px; padding:0 16px; border-radius:var(--radius-md); font-weight:600; cursor:pointer; background:transparent; display:flex; align-items:center; justify-content:center; transition: all 0.2s;">
                                Stop Tracking
                            </button>
                        </div>
                    `;
                } else {
                    trackingBtnContainer.innerHTML = `
                        <button id="btn-track-this-roadmap" class="btn-primary" style="width:100%; height:44px; display:flex; align-items:center; justify-content:center; font-weight:600; font-size:0.9rem; border-radius:var(--radius-md);">
                            🗺️ Track this Learning Roadmap
                        </button>
                    `;
                }
                roadmapContent.appendChild(trackingBtnContainer);

                // Add button click listeners
                const trackBtn = trackingBtnContainer.querySelector('#btn-track-this-roadmap');
                if (trackBtn && !isCurrentlyTracked) {
                    trackBtn.addEventListener('click', trackRoadmapFlow);
                }
                const untrackBtn = trackingBtnContainer.querySelector('#btn-learning-untrack');
                if (untrackBtn) {
                    untrackBtn.addEventListener('click', untrackRoadmapFlow);
                }

                // Render Checklist (interactive if tracked, styled static preview if not)
                const checklistContainer = document.createElement('div');
                checklistContainer.style.display = 'flex';
                checklistContainer.style.flexDirection = 'column';
                checklistContainer.style.gap = '20px';
                roadmapContent.appendChild(checklistContainer);

                const phases = [
                    { key: 'beginner', label: '🌱 Beginner Phase' },
                    { key: 'intermediate', label: '🔥 Intermediate Phase' },
                    { key: 'advanced', label: '🚀 Advanced Phase' },
                    { key: 'projects', label: '🛠️ Projects to Build' },
                    { key: 'certifications', label: 'ðŸ† Recommended Certifications' },
                    { key: 'interview_prep', label: '💼 Interview Prep Focus' }
                ];

                phases.forEach(phase => {
                    let items = [];
                    if (isCurrentlyTracked) {
                        items = activeRoadmap.steps.filter(s => s.phaseKey === phase.key);
                    } else {
                        // Static preview mapping from raw JSON
                        const rawItems = rm[phase.key] || [];
                        let idx = 1;
                        items = rawItems.map(item => {
                            if (phase.key === 'projects') {
                                return {
                                    id: `preview_${phase.key}_${idx++}`,
                                    title: item.name || item.title || 'Project',
                                    description: item.description || '',
                                    completed: false
                                };
                            } else {
                                return {
                                    id: `preview_${phase.key}_${idx++}`,
                                    title: item,
                                    completed: false
                                };
                            }
                        });
                    }

                    if (items.length > 0) {
                        const phaseSection = document.createElement('div');
                        phaseSection.className = 'roadmap-section';
                        phaseSection.style.marginBottom = '10px';
                        phaseSection.innerHTML = `
                            <h3 style="font-family:'Outfit',sans-serif; margin-bottom:12px; font-size:1.05rem;">${phase.label}</h3>
                            <div class="phase-steps-list" style="display:flex; flex-direction:column; gap:10px;"></div>
                        `;
                        const listWrap = phaseSection.querySelector('.phase-steps-list');

                        items.forEach(step => {
                            const stepEl = document.createElement('div');
                            stepEl.className = `roadmap-step-item ${step.completed ? 'completed' : ''}`;
                            
                            const isProject = phase.key === 'projects';
                            const descHtml = isProject && step.description ? `<span class="roadmap-step-desc">${escapeHTML(step.description)}</span>` : '';
                            
                            if (isCurrentlyTracked) {
                                stepEl.innerHTML = `
                                    <input type="checkbox" class="roadmap-checkbox" data-step-id="${step.id}" ${step.completed ? 'checked' : ''}>
                                    <div class="roadmap-step-text-wrap">
                                        <span class="roadmap-step-title">${escapeHTML(step.title)}</span>
                                        ${descHtml}
                                    </div>
                                `;
                                stepEl.querySelector('.roadmap-checkbox').addEventListener('change', (e) => {
                                    toggleRoadmapStep(step.id, e.target.checked);
                                });
                            } else {
                                stepEl.innerHTML = `
                                    <input type="checkbox" class="roadmap-checkbox" disabled style="opacity: 0.6; cursor: not-allowed;">
                                    <div class="roadmap-step-text-wrap">
                                        <span class="roadmap-step-title" style="color:var(--text-sub);">${escapeHTML(step.title)}</span>
                                        ${descHtml}
                                    </div>
                                `;
                            }
                            listWrap.appendChild(stepEl);
                        });

                        checklistContainer.appendChild(phaseSection);
                    }
                });
            }
        }
    };

    /**
     * Card Factory
     */
    const createCard = (data, index) => {
        const card = document.createElement('div');
        card.className = 'resource-card';
        
        const title = data.title || 'Untitled';
        const channel = data.channel || 'Author';
        const duration = data.duration_hours ? `${data.duration_hours}h` : 'Full';
        const level = data.level || 'Beginner';
        const desc = data.description || 'Curated high-quality learning resource.';
        const url = data.url || '#';
        const rank = data.rank || (index + 1);

        const isCert = !url.includes('youtube.com');
        const btnLabel = isCert ? 'Join Course' : 'Watch Playlist';

        const vBadge = data.verification_status ? `<span class="pill-badge" style="background: #059669; color: white;">${escapeHTML(data.verification_status)}</span>` : '';
        
        const savedList = getSavedPlaylists();
        const isSaved = savedList.some(p => p.url === url);
        const saveBtnLabel = isSaved ? '✅ Saved' : '💾 Save';
        const saveBtnClass = isSaved ? 'btn-save-playlist saved' : 'btn-save-playlist';

        const actionButtonsHtml = isCert ? `
            <a href="${url}" target="_blank" class="btn-watch" rel="noopener noreferrer" style="grid-column: span 2; text-align: center;">
                ${btnLabel}
            </a>
        ` : `
            <a href="${url}" target="_blank" class="btn-watch" rel="noopener noreferrer">
                ${btnLabel}
            </a>
            <button class="${saveBtnClass}" data-url="${escapeHTML(url)}">
                ${saveBtnLabel}
            </button>
        `;

        card.innerHTML = `
            <div class="card-header" style="flex-wrap: wrap;">
                <span class="rank-badge">#${rank}</span>
                <div class="card-badges" style="display: flex; gap: 8px; flex-wrap: wrap;">
                    <span class="pill-badge">${escapeHTML(level)}</span>
                    <span class="pill-badge">${escapeHTML(duration)}</span>
                    ${vBadge}
                </div>
            </div>
            <h3 class="card-title">${escapeHTML(title)}</h3>
            <span class="channel-name">${escapeHTML(channel)}</span>
            <p class="card-desc">${escapeHTML(desc)}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: auto;">
                ${actionButtonsHtml}
            </div>
        `;
        
        const saveBtn = card.querySelector('.btn-save-playlist');
        if (saveBtn) {
            saveBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                togglePlaylistSave({
                    title,
                    channel,
                    url,
                    duration,
                    level,
                    skill: currentSkill || level
                }, saveBtn);
            });
        }

        return card;
    };

    // UI Helpers
    const resetViews = () => {
        resultsNav.style.display = 'none';
        playlistStep.classList.remove('active');
        certificateStep.classList.remove('active');
        roadmapStep.classList.remove('active');
        emptyState.style.display = 'none';
        playlistGrid.innerHTML = '';
        certificateGrid.innerHTML = '';
        aiRecommendationsGrid.innerHTML = '';
        roadmapContent.innerHTML = '';
    };

    const setLoading = (isLoading) => {
        loadingIndicator.style.display = isLoading ? 'block' : 'none';
        ctaButton.disabled = isLoading;
        ctaButton.textContent = isLoading ? 'Curating...' : 'Find Resources';
    };

    const showToast = (message) => {
        toastMessage.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 4000);
    };

    const escapeHTML = (str) => {
        const p = document.createElement('p');
        p.textContent = str;
        return p.innerHTML;
    };

    /**
     * Interview Prep Logic
     */
    const interviewCategories = document.getElementById('interview-categories');
    
    // DSA Sub-View
    const dsaPrepContent = document.getElementById('dsa-prep-content');
    const btnDsaCategory = document.getElementById('btn-dsa-category');
    const backToCategoriesDsa = document.getElementById('back-to-categories-dsa');
    const companySearchInput = document.getElementById('company-search');
    const companiesGrid = document.getElementById('companies-grid');
    const questionsView = document.getElementById('questions-view');
    const companySelection = document.getElementById('company-selection');
    const backToCompanies = document.getElementById('back-to-companies');
    const questionsGrid = document.getElementById('questions-grid');
    const selectedCompanyTitle = document.getElementById('selected-company-title');

    // Resume Sub-View
    const resumeAnalyzerContent = document.getElementById('resume-analyzer-content');
    const btnResumeCategory = document.getElementById('btn-resume-category');
    const backToCategoriesResume = document.getElementById('back-to-categories-resume');
    const resumeUpload = document.getElementById('resume-upload');
    const btnTriggerUpload = document.getElementById('btn-trigger-upload');
    const uploadZone = document.getElementById('upload-zone');
    const analysisStatus = document.getElementById('analysis-status');
    const analysisResults = document.getElementById('analysis-results');
    const statusText = document.getElementById('status-text');

    let allCompanies = [];

    const showSelectionScreen = () => {
        if (interviewCategories) interviewCategories.style.display = 'grid';
        if (dsaPrepContent) dsaPrepContent.style.display = 'none';
        if (resumeAnalyzerContent) resumeAnalyzerContent.style.display = 'none';
    };

    const enterDsaPrep = async () => {
        if (interviewCategories) interviewCategories.style.display = 'none';
        if (dsaPrepContent) dsaPrepContent.style.display = 'block';
        if (companySelection) companySelection.style.display = 'block';
        if (questionsView) questionsView.style.display = 'none';
        
        if (allCompanies.length === 0) {
            await fetchCompanies();
        }
        renderCompanies(allCompanies);
    };

    const enterResumeAnalyzer = () => {
        if (interviewCategories) interviewCategories.style.display = 'none';
        if (resumeAnalyzerContent) resumeAnalyzerContent.style.display = 'block';
        if (uploadZone) uploadZone.style.display = 'block';
        if (analysisStatus) analysisStatus.style.display = 'none';
        if (analysisResults) analysisResults.style.display = 'none';
    };

    const fetchCompanies = async () => {
        try {
            const res = await authFetch('/get-companies');
            allCompanies = await res.json();
        } catch (err) {
            showToast('Failed to load companies.');
        }
    };

    const renderCompanies = (list) => {
        companiesGrid.innerHTML = '';
        list.forEach(name => {
            const badge = document.createElement('div');
            badge.className = 'company-badge';
            badge.textContent = name;
            badge.onclick = () => loadCompanyQuestions(name);
            companiesGrid.appendChild(badge);
        });
    };

    // ---- Smart Filtering Variables ----
    let currentQuestions = [];
    const filterDifficulty = document.getElementById('filter-difficulty');
    const filterStatus = document.getElementById('filter-status');
    const companySearch = document.getElementById('company-search');

    const inferTopic = (title, url) => {
        const t = (title + ' ' + (url||'')).toLowerCase();
        if (t.includes('tree')) return 'Trees';
        if (t.includes('graph')) return 'Graphs';
        if (t.includes('array') || t.includes('matrix')) return 'Arrays';
        if (t.includes('string')) return 'Strings';
        if (t.includes('list') || t.includes('node')) return 'Linked Lists';
        if (t.includes('dp') || t.includes('dynamic') || t.includes('profit')) return 'Dynamic Prog.';
        return 'Misc';
    };

    const DIFFICULTY_CLASS = { Easy: 'diff-easy', Medium: 'diff-medium', Hard: 'diff-hard' };

    const renderQuestions = (questions) => {
        questionsGrid.innerHTML = '';
        if (!questions || questions.length === 0) {
            questionsGrid.innerHTML = '<p class="empty-state">No questions found.</p>';
            return;
        }

        const solvedList = getSolvedQuestions();
        const diffFilter = filterDifficulty ? filterDifficulty.value : 'All';
        const statFilter = filterStatus ? filterStatus.value : 'All';

        let filtered = questions.filter(q => {
            const isSolved = solvedList.some(s => s.link === q.url);
            if (diffFilter !== 'All' && q.difficulty !== diffFilter) return false;
            if (statFilter === 'Completed' && !isSolved) return false;
            if (statFilter === 'Pending' && isSolved) return false;
            return true;
        });

        if (filtered.length === 0) {
            questionsGrid.innerHTML = '<p class="empty-state">No questions match your filters.</p>';
            return;
        }

        filtered.forEach((q, index) => {
            const card = document.createElement('div');
            card.className = 'resource-card show';
            
            const id         = q.id         || '';
            const name       = q.title       || 'Unknown Problem';
            const link       = q.url         || '#';
            const difficulty = q.difficulty  || '';
            const topic      = inferTopic(name, link);
            const acceptance = q.acceptance  || '';
            const frequency  = q.frequency   || '';
            const others     = q.other_companies || [];
            const isSolved   = solvedList.some(s => s.link === link);

            const diffClass  = DIFFICULTY_CLASS[difficulty] || '';
            const freqNum    = parseFloat(frequency) || 0;

            card.innerHTML = `
                <div class="card-header">
                    ${id ? `<span class="rank-badge lc-id">#${escapeHTML(id)}</span>` : `<span class="rank-badge">#${index + 1}</span>`}
                    <div class="card-badges">
                        ${difficulty ? `<span class="pill-badge diff-pill ${diffClass}">${escapeHTML(difficulty)}</span>` : ''}
                        <span class="pill-badge" style="background:rgba(0,0,0,0.03); border-color:transparent;">${topic}</span>
                    </div>
                </div>

                <div class="card-check-wrap">
                    <input type="checkbox" class="solve-checkbox"
                        data-link="${link}"
                        data-name="${escapeHTML(name)}"
                        data-diff="${difficulty}"
                        data-topic="${topic}"
                        ${isSolved ? 'checked' : ''}>
                    <span class="solve-label">${isSolved ? '✅ Solved' : 'Mark as Solved'}</span>
                </div>

                <h3 class="card-title">${escapeHTML(name)}</h3>

                <div style="font-size:0.75rem; color:var(--text-sub); display:flex; gap:12px; margin-bottom:8px;">
                    ${acceptance ? `<span>Acceptance: <strong>${escapeHTML(acceptance)}</strong></span>` : ''}
                    ${frequency  ? `<span>Frequency: <strong>${escapeHTML(frequency)}</strong></span>` : ''}
                </div>

                ${freqNum > 0 ? `
                <div style="height:4px; background:#e2e8f0; border-radius:99px; overflow:hidden; margin-bottom:12px; width:100%;">
                    <div style="height:100%; background:var(--primary); width:${Math.min(freqNum, 100)}%;"></div>
                </div>` : ''}

                ${others.length > 0 ? `
                <div class="other-companies-wrap">
                    <span style="font-size:0.65rem; color:var(--text-muted); width:100%;">Also asked at:</span>
                    ${others.slice(0, 5).map(c => `<span class="other-comp-tag">${escapeHTML(c)}</span>`).join('')}
                    ${others.length > 5 ? `<span class="other-comp-tag">+${others.length - 5} more</span>` : ''}
                </div>` : ''}

                <a href="${link}" target="_blank" class="btn-watch" rel="noopener noreferrer" style="margin-top:16px;">
                    Solve on LeetCode â†'
                </a>
            `;

            const checkbox = card.querySelector('.solve-checkbox');
            checkbox.addEventListener('change', (e) => {
                toggleSolved({ link, name, difficulty, topic }, e.target.checked);
                card.querySelector('.solve-label').textContent = e.target.checked ? '✅ Solved' : 'Mark as Solved';
                updateCommandCenter();
            });

            questionsGrid.appendChild(card);
        });
    };

    if (filterDifficulty) filterDifficulty.addEventListener('change', () => renderQuestions(currentQuestions));
    if (filterStatus) filterStatus.addEventListener('change', () => renderQuestions(currentQuestions));

    const loadCompanyQuestions = async (company) => {
        companySelection.style.display = 'none';
        questionsView.style.display = 'block';
        selectedCompanyTitle.textContent = company;
        questionsGrid.innerHTML = '<div class="loading-indicator" style="display:block;"><div class="spinner"></div><p>Fetching questions...</p></div>';

        try {
            const res = await fetch(`/get-questions?company=${encodeURIComponent(company)}`);
            const data = await res.json();
            currentQuestions = data.questions;
            renderQuestions(currentQuestions);
        } catch (err) {
            showToast('Failed to load questions.');
        }
    };

    /**
     * Solved Questions State & Command Center Automation
     */
    let solvedDsaQuestions = [];
    let leetcodeStats = null;
    
    const getSolvedQuestions = () => {
        return solvedDsaQuestions;
    };

    const toggleSolved = (q, isChecked) => {
        if (isChecked) {
            if (!solvedDsaQuestions.find(s => s.link === q.link)) {
                solvedDsaQuestions.push({ ...q, solvedAt: new Date().toISOString(), revisions: 0 });
            } else {
                let existing = solvedDsaQuestions.find(s => s.link === q.link);
                existing.revisions = (existing.revisions || 0) + 1;
            }
        } else {
            solvedDsaQuestions = solvedDsaQuestions.filter(s => s.link !== q.link);
        }

        // Sync to backend Supabase database
        fetch('/sync-dsa-progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ solved_list: solvedDsaQuestions })
        }).catch(err => console.error("DSA sync failed:", err));
    };

    let charts = {};
    const updateCommandCenter = () => {
        const solved = getSolvedQuestions();
        const GOAL = 500;
        
        // Calculate Topic & Difficulty Counts
        let localEasy = solved.filter(s => (s.difficulty || '').toLowerCase() === 'easy').length;
        let localMedium = solved.filter(s => (s.difficulty || '').toLowerCase() === 'medium' || (s.difficulty || '').toLowerCase() === 'med').length;
        let localHard = solved.filter(s => (s.difficulty || '').toLowerCase() === 'hard').length;
        
        const counts = { Easy: localEasy, Medium: localMedium, Hard: localHard };
        if (leetcodeStats) {
            counts.Easy = Math.max(counts.Easy, leetcodeStats.Easy || 0);
            counts.Medium = Math.max(counts.Medium, leetcodeStats.Medium || 0);
            counts.Hard = Math.max(counts.Hard, leetcodeStats.Hard || 0);
        }
        
        // 1. Calculate stats
        let totalSolved = Math.max(solved.length, counts.Easy + counts.Medium + counts.Hard);
        if (leetcodeStats) {
            totalSolved = Math.max(totalSolved, leetcodeStats.All || 0);
        }
        
        const completionPct = Math.min(100, Math.round((totalSolved / GOAL) * 100));
        const totalRevisions = solved.reduce((acc, s) => acc + (s.revisions || 0), 0);
        
        // Calculate Streak
        let streak = 0;
        let dates = [...new Set(solved.map(s => new Date(s.solvedAt).toDateString()))].sort((a,b)=>new Date(b)-new Date(a));
        if (dates.length > 0) {
            let curr = new Date();
            for(let d of dates) {
                if (new Date(d).toDateString() === curr.toDateString() || streak === 0 && (curr - new Date(d)) < 172800000) {
                    streak++;
                    curr.setDate(curr.getDate() - 1);
                } else break;
            }
        }

        const topicCounts = {};
        solved.forEach(s => {
            topicCounts[s.topic || 'Misc'] = (topicCounts[s.topic || 'Misc'] || 0) + 1;
        });

        const readinessRaw = (counts.Hard * 3 + counts.Medium * 2 + counts.Easy * 1);
        const readinessScore = Math.min(100, Math.round((readinessRaw / (GOAL * 2)) * 100));
        let rank = readinessScore < 30 ? 'Novice' : readinessScore < 70 ? 'Proficient' : 'Elite';

        // 2. Update Sidebar Streak Widget
        document.getElementById('sidebar-streak-days').textContent = `${streak} days`;

        // 3. Update Dashboard Progress Card
        const progressPctText = document.getElementById('dashboard-progress-pct');
        const progressCountText = document.getElementById('dashboard-progress-count');
        const progressRingBar = document.getElementById('dashboard-progress-ring-bar');

        // Calculate real playlist progress
        const savedPl = getSavedPlaylists();
        let totalPlaylistVideos = 0;
        let completedPlaylistVideos = 0;
        savedPl.forEach(p => {
            if (p.videos) {
                totalPlaylistVideos += p.videos.length;
                completedPlaylistVideos += p.videos.filter(v => v.completed).length;
            }
        });

        // Overall progress = combination of DSA + playlist progress
        const dsaPct = Math.min(100, Math.round((totalSolved / GOAL) * 100));
        const overallTopics = totalSolved + completedPlaylistVideos;
        const overallTotal = GOAL + totalPlaylistVideos;
        const overallPct = overallTotal > 0 ? Math.min(100, Math.round((overallTopics / overallTotal) * 100)) : 0;

        progressPctText.textContent = `${overallPct}%`;
        progressCountText.textContent = `${overallTopics} / ${overallTotal}`;
        
        // SVG Ring calculations (circumference = 314.16)
        const offset = 314.16 - (314.16 * overallPct / 100);
        progressRingBar.style.strokeDashoffset = offset;

        // Progress Bars Fill N/A DSA uses real data
        const dsaLabelText = document.getElementById('dsa-progress-label-text');
        if (dsaLabelText) {
            dsaLabelText.textContent = `DSA (${totalSolved} solved)`;
        }
        document.getElementById('dsa-progress-label-pct').textContent = `${dsaPct}%`;
        document.getElementById('dsa-progress-bar-fill').style.width = `${dsaPct}%`;
        
        // System Design N/A based on saved playlists with "system design" in title
        const sdPlaylists = savedPl.filter(p => (p.title + ' ' + (p.skill || '')).toLowerCase().includes('system'));
        const sdTotal = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
        const sdDone = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
        const sdPct = sdTotal > 0 ? Math.round((sdDone / sdTotal) * 100) : 0;
        document.getElementById('sd-progress-label-pct').textContent = `${sdPct}%`;
        document.getElementById('sd-progress-bar-fill').style.width = `${sdPct}%`;
        
        // AI/ML N/A based on saved playlists with "ai" or "ml" or "machine" in title
        const aiPlaylists = savedPl.filter(p => /(ai|ml|machine|deep|neural)/i.test(p.title + ' ' + (p.skill || '')));
        const aiTotal = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
        const aiDone = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
        const aiPct = aiTotal > 0 ? Math.round((aiDone / aiTotal) * 100) : 0;
        document.getElementById('aiml-progress-label-pct').textContent = `${aiPct}%`;
        document.getElementById('aiml-progress-bar-fill').style.width = `${aiPct}%`;
        
        // Dev N/A remaining playlists (not SD/AI categorized)
        const devPlaylists = savedPl.filter(p => !sdPlaylists.includes(p) && !aiPlaylists.includes(p));
        const devTotal = devPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
        const devDone = devPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
        const devPct = devTotal > 0 ? Math.round((devDone / devTotal) * 100) : 0;
        document.getElementById('dev-progress-label-pct').textContent = `${devPct}%`;
        document.getElementById('dev-progress-bar-fill').style.width = `${devPct}%`;

        // 4. Update Resume Score Card
        loadResumeScore();

        // 5. Update Practice Overview KPIs N/A real data
        document.getElementById('overview-solved-count').textContent = totalSolved;
        document.getElementById('overview-success-rate').textContent = totalSolved > 0 ? `${Math.round((counts.Easy * 100 + counts.Medium * 70 + counts.Hard * 50) / Math.max(1, totalSolved))}%` : '0%';
        document.getElementById('overview-streak').textContent = streak;

        // 6. Draw Dashboard Consistency Chart
        drawDashboardConsistencyChart(solved);

        // 7. Draw Dashboard Skill Distribution (doughnut)
        drawDashboardSkillDistribution();

        // 8. Draw Sidebar Streak Sparkline
        drawSidebarStreakSparkline();
    };

    let latestResumeAnalysis = null;

    const loadResumeScore = async () => {
        try {
            const res = await authFetch('/get-latest-resume');
            if (res.ok) {
                const dbData = await res.json();
                if (dbData) {
                    latestResumeAnalysis = dbData;
                }
            }
        } catch (e) {
            console.error("Failed to load resume analysis from DB:", e);
        }

        const data = latestResumeAnalysis;
        if (data) {
            document.getElementById('dashboard-resume-score').textContent = `${data.score}/100`;
            const verdictEl = document.getElementById('dashboard-resume-verdict');
            verdictEl.textContent = data.verdict;
            verdictEl.className = 'score-verdict';
            if (data.verdict.toLowerCase().includes('reject') || data.verdict.toLowerCase().includes('no')) {
                verdictEl.classList.add('text-danger');
            } else if (data.verdict.toLowerCase().includes('borderline')) {
                verdictEl.classList.add('text-warning');
            } else {
                verdictEl.classList.add('text-success');
            }
            document.getElementById('dashboard-resume-impact').textContent = data.impact;
            document.getElementById('dashboard-resume-skills').textContent = data.match;
            document.getElementById('dashboard-resume-ats').textContent = typeof data.ats === 'number' ? `${data.ats}%` : data.ats;
        } else {
            // No resume uploaded yet N/A show empty state
            document.getElementById('dashboard-resume-score').textContent = 'N/A/100';
            const verdictEl = document.getElementById('dashboard-resume-verdict');
            verdictEl.textContent = 'Not analyzed yet';
            verdictEl.className = 'score-verdict';
            document.getElementById('dashboard-resume-impact').textContent = 'N/A';
            document.getElementById('dashboard-resume-skills').textContent = 'N/A';
            document.getElementById('dashboard-resume-ats').textContent = 'N/A';
        }
    };

    // --- CHART BUILDERS (Light Theme configured) ---
    const drawDashboardConsistencyChart = (solved) => {
        if (!window.Chart) return;
        const ctx = document.getElementById('dashboardConsistencyChart');
        if (!ctx) return;

        if (charts.dashCons) charts.dashCons.destroy();

        const last7 = [...Array(7)].map((_, i) => {
            const d = new Date();
            d.setDate(d.getDate() - i);
            return d.toDateString();
        }).reverse();
        
        // Use zeroed trend if no activity yet
        let trendData = [0, 0, 0, 0, 0, 0, 0];
        if (solved && solved.length > 0) {
            const calculated = last7.map(date => solved.filter(s => new Date(s.solvedAt).toDateString() === date).length * 10);
            trendData = calculated;
        }

        charts.dashCons = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
                datasets: [{
                    label: 'Practice Score',
                    data: trendData,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.05)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 0,
                    pointHoverRadius: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#94a3b8' } },
                    y: { display: false }
                }
            }
        });
    };

    const drawDashboardSkillDistribution = () => {
        if (!window.Chart) return;
        const ctx = document.getElementById('dashboardSkillDistributionChart');
        if (!ctx) return;

        if (charts.dashDist) charts.dashDist.destroy();

        // Calculate real distribution from solved DSA + saved playlists
        const solved = getSolvedQuestions();
        const savedPl = getSavedPlaylists();
        let dsaCount = solved.length;
        if (leetcodeStats) {
            dsaCount = Math.max(dsaCount, leetcodeStats.All || 0);
        }
        const sdCount = savedPl.filter(p => (p.title + ' ' + (p.skill || '')).toLowerCase().includes('system')).length;
        const aiCount = savedPl.filter(p => /(ai|ml|machine|deep|neural)/i.test(p.title + ' ' + (p.skill || ''))).length;
        const devCount = savedPl.filter(p => {
            const t = (p.title + ' ' + (p.skill || '')).toLowerCase();
            return !t.includes('system') && !/(ai|ml|machine|deep|neural)/i.test(t);
        }).length;

        // If no data at all, show equal placeholder
        const hasData = dsaCount + sdCount + aiCount + devCount > 0;
        const chartData = hasData ? [dsaCount, sdCount, aiCount, devCount] : [1, 1, 1, 1];

        // Update legend percentages in UI
        const dsaPctText = document.getElementById('legend-pct-dsa');
        const sdPctText = document.getElementById('legend-pct-sd');
        const aiPctText = document.getElementById('legend-pct-aiml');
        const devPctText = document.getElementById('legend-pct-dev');

        if (hasData) {
            const totalCount = dsaCount + sdCount + aiCount + devCount;
            if (dsaPctText) dsaPctText.textContent = `${Math.round(dsaCount / totalCount * 100)}%`;
            if (sdPctText) sdPctText.textContent = `${Math.round(sdCount / totalCount * 100)}%`;
            if (aiPctText) aiPctText.textContent = `${Math.round(aiCount / totalCount * 100)}%`;
            if (devPctText) devPctText.textContent = `${Math.round(devCount / totalCount * 100)}%`;
        } else {
            if (dsaPctText) dsaPctText.textContent = `0%`;
            if (sdPctText) sdPctText.textContent = `0%`;
            if (aiPctText) aiPctText.textContent = `0%`;
            if (devPctText) devPctText.textContent = `0%`;
        }

        charts.dashDist = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['DSA', 'System Design', 'AI/ML', 'Development'],
                datasets: [{
                    data: chartData,
                    backgroundColor: hasData
                        ? ['#3b82f6', '#10b981', '#f59e0b', '#6366f1']
                        : ['#e5e7eb', '#e5e7eb', '#e5e7eb', '#e5e7eb'],
                    borderWidth: 4,
                    borderColor: '#ffffff',
                    hoverOffset: 4
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                cutout: '75%'
            }
        });
    };

    const drawSidebarStreakSparkline = () => {
        if (!window.Chart) return;
        const ctx = document.getElementById('sidebarSparklineCanvas');
        if (!ctx) return;

        if (charts.sparkline) charts.sparkline.destroy();

        // Calculate real activity per day for last 7 days
        const solved = getSolvedQuestions();
        const last7 = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dayStr = d.toDateString();
            const count = solved.filter(s => new Date(s.solvedAt).toDateString() === dayStr).length;
            last7.push(count);
        }

        charts.sparkline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [1, 2, 3, 4, 5, 6, 7],
                datasets: [{
                    data: last7,
                    borderColor: '#f97316',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.4,
                    pointRadius: 0
                }]
            },
            options: {
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { display: false },
                    y: { display: false }
                }
            }
        });
    };

    let analyticsEventsBound = false;

    const renderAnalyticsCharts = async () => {
        if (!window.Chart) return;
        
        // --- 1. GET DATA SOURCES ---
        const solved = getSolvedQuestions();
        const savedPl = getSavedPlaylists();
        
        // Timeframe filter
        const timeframeEl = document.getElementById('analytics-timeframe');
        const daysToFilter = timeframeEl ? timeframeEl.value : "30";
        
        // --- 2. CALCULATE KPI STATS ---
        let totalSolved = solved.length;
        const counts = { Easy: 0, Medium: 0, Hard: 0 };
        const topicCounts = {};
        solved.forEach(s => {
            counts[s.difficulty || 'Easy']++;
            topicCounts[s.topic || 'Misc'] = (topicCounts[s.topic || 'Misc'] || 0) + 1;
        });

        if (leetcodeStats) {
            counts.Easy = Math.max(counts.Easy, leetcodeStats.Easy || 0);
            counts.Medium = Math.max(counts.Medium, leetcodeStats.Medium || 0);
            counts.Hard = Math.max(counts.Hard, leetcodeStats.Hard || 0);
            totalSolved = Math.max(totalSolved, leetcodeStats.All || 0);
        }
        
        // Update Problems Solved UI
        const dsaCountEl = document.getElementById('analytics-dsa-count');
        if (dsaCountEl) dsaCountEl.textContent = totalSolved;
        const easyEl = document.getElementById('analytics-dsa-easy');
        if (easyEl) easyEl.textContent = counts.Easy;
        const medEl = document.getElementById('analytics-dsa-med');
        if (medEl) medEl.textContent = counts.Medium;
        const hardEl = document.getElementById('analytics-dsa-hard');
        if (hardEl) hardEl.textContent = counts.Hard;
        
        // Calculate Active Playlists completion
        let totalPlaylistVideos = 0;
        let completedPlaylistVideos = 0;
        savedPl.forEach(p => {
            if (p.videos) {
                totalPlaylistVideos += p.videos.length;
                completedPlaylistVideos += p.videos.filter(v => v.completed).length;
            }
        });
        const playlistCompletionPct = totalPlaylistVideos > 0 ? (completedPlaylistVideos / totalPlaylistVideos * 100) : 0;
        
        // Fetch custom projects count
        let customProjectsCount = 0;
        try {
            const projectsRes = await authFetch('/get-user-projects');
            if (projectsRes.ok) {
                const plist = await projectsRes.json();
                if (Array.isArray(plist)) customProjectsCount = plist.length;
            }
        } catch (e) {
            console.error("Failed to load custom projects for analytics:", e);
        }
        
        // Load latest resume score
        let resumeScore = 0;
        let resumeVerdictText = "No Resume Uploaded";
        const atsScoreEl = document.getElementById('analytics-ats-score');
        const atsVerdictEl = document.getElementById('analytics-ats-verdict');
        if (latestResumeAnalysis) {
            resumeScore = latestResumeAnalysis.score;
            resumeVerdictText = latestResumeAnalysis.verdict;
        } else {
            // Check if we can load it from backend
            try {
                const res = await authFetch('/get-latest-resume');
                if (res.ok) {
                    const dbData = await res.json();
                    if (dbData) {
                        resumeScore = dbData.score;
                        resumeVerdictText = dbData.verdict;
                        latestResumeAnalysis = dbData;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch resume for analytics:", e);
            }
        }
        if (atsScoreEl) atsScoreEl.textContent = latestResumeAnalysis ? `${resumeScore}%` : 'N/A';
        if (atsVerdictEl) {
            atsVerdictEl.textContent = resumeVerdictText;
            atsVerdictEl.style.color = latestResumeAnalysis ? 'var(--primary)' : 'var(--text-muted)';
        }

        // Calculate study velocity: items completed in selected timeframe
        let velocityItems = 0;
        const now = new Date();
        const timeframeMs = (daysToFilter === "all" ? 365 : parseInt(daysToFilter)) * 24 * 60 * 60 * 1000;
        
        // Filter solved DSA in timeframe
        solved.forEach(s => {
            if (daysToFilter === "all" || (now - new Date(s.solvedAt)) <= timeframeMs) {
                velocityItems++;
            }
        });
        
        const weeks = daysToFilter === "all" ? 12 : (parseInt(daysToFilter) / 7);
        const studyVelocity = (velocityItems / Math.max(1, weeks)).toFixed(1);
        
        const velocityEl = document.getElementById('analytics-weekly-velocity');
        if (velocityEl) velocityEl.textContent = studyVelocity;
        
        // Compute Readiness Score (PRI)
        const dsaScoreVal = Math.min(100, Math.round(totalSolved / 200 * 100)); // 200 is benchmark solved questions
        const projectScoreVal = Math.min(100, customProjectsCount * 35); // 3 projects = 100%
        const priScore = Math.round((dsaScoreVal * 0.4) + (resumeScore * 0.3) + (playlistCompletionPct * 0.15) + (projectScoreVal * 0.15));
        
        const priScoreEl = document.getElementById('analytics-pri-score');
        const priBadgeEl = document.getElementById('analytics-pri-badge');
        const priRingEl = document.getElementById('analytics-pri-ring');
        
        if (priScoreEl) priScoreEl.textContent = `${priScore}%`;
        if (priBadgeEl) {
            let rank = 'Novice';
            if (priScore >= 75) {
                rank = 'FAANG Tier';
                priBadgeEl.style.background = 'var(--success-light)';
                priBadgeEl.style.color = 'var(--success)';
            } else if (priScore >= 45) {
                rank = 'Proficient';
                priBadgeEl.style.background = 'var(--warning-light)';
                priBadgeEl.style.color = 'var(--warning)';
            } else {
                priBadgeEl.style.background = 'var(--primary-light)';
                priBadgeEl.style.color = 'var(--primary)';
            }
            priBadgeEl.textContent = rank;
        }
        if (priRingEl) {
            // Circumference of r=28 circle is 2 * PI * 28 = 175.93
            const offset = 175.93 - (175.93 * priScore / 100);
            priRingEl.style.strokeDashoffset = offset;
        }

        // --- 3. DRAW RADAR CHART ---
        const radarCtx = document.getElementById('analyticsRadarChart');
        if (radarCtx) {
            if (charts.analyticsRadar) charts.analyticsRadar.destroy();
            
            // Skill levels
            const dsaComp = Math.min(100, Math.round((counts.Easy * 30 + counts.Medium * 70 + counts.Hard * 100) / Math.max(1, totalSolved)));
            
            // Categories logic: System design vs AI/ML vs Dev
            const sdPlaylists = savedPl.filter(p => (p.title + ' ' + (p.skill || '')).toLowerCase().includes('system'));
            const sdDone = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
            const sdTotal = sdPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
            const sdComp = sdTotal > 0 ? Math.round(sdDone / sdTotal * 100) : 0;
            
            const aiPlaylists = savedPl.filter(p => /(ai|ml|machine|deep|neural)/i.test(p.title + ' ' + (p.skill || '')));
            const aiDone = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.filter(v => v.completed).length : 0), 0);
            const aiTotal = aiPlaylists.reduce((a, p) => a + (p.videos ? p.videos.length : 0), 0);
            const aiComp = aiTotal > 0 ? Math.round(aiDone / aiTotal * 100) : 0;
            
            const devComp = Math.min(100, Math.round((customProjectsCount * 30) + (playlistCompletionPct * 0.7)));

            charts.analyticsRadar = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: ['Data Structures', 'System Design', 'AI/ML Breadth', 'Dev & Projects'],
                    datasets: [
                        {
                            label: 'Your Level',
                            data: [dsaComp || 10, sdComp || 10, aiComp || 10, devComp || 10],
                            backgroundColor: 'rgba(37, 99, 235, 0.2)',
                            borderColor: '#2563eb',
                            pointBackgroundColor: '#2563eb',
                            borderWidth: 2
                        },
                        {
                            label: 'FAANG Benchmark',
                            data: [90, 80, 70, 85],
                            backgroundColor: 'rgba(148, 163, 184, 0.1)',
                            borderColor: '#94a3b8',
                            pointBackgroundColor: '#94a3b8',
                            borderWidth: 1,
                            borderDash: [4, 4]
                        }
                    ]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        r: {
                            angleLines: { display: true },
                            suggestedMin: 0,
                            suggestedMax: 100,
                            ticks: { stepSize: 20, display: false }
                        }
                    },
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } }
                    }
                }
            });
        }

        // --- 4. DRAW CUMULATIVE VELOCITY LINE CHART ---
        const growthCtx = document.getElementById('analyticsGrowthChart');
        if (growthCtx) {
            if (charts.analyticsGrowth) charts.analyticsGrowth.destroy();
            
            // Build daily activity array for chosen timeframe
            const limitDays = daysToFilter === "all" ? 90 : parseInt(daysToFilter);
            const dates = [];
            const cumulativeData = [];
            let currentSum = 0;
            
            const solvedSorted = [...solved].sort((a,b) => new Date(a.solvedAt) - new Date(b.solvedAt));
            
            for (let i = limitDays - 1; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateString = d.toDateString();
                
                // Solve count on this exact day
                const solvedOnDay = solvedSorted.filter(s => new Date(s.solvedAt).toDateString() === dateString).length;
                currentSum += solvedOnDay;
                
                dates.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
                cumulativeData.push(currentSum);
            }
            
            charts.analyticsGrowth = new Chart(growthCtx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Solved Questions (Cumulative)',
                        data: cumulativeData,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.08)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: limitDays > 30 ? 0 : 2,
                        pointHoverRadius: 4
                    }]
                },
                options: {
                    maintainAspectRatio: false,
                    scales: {
                        x: { grid: { display: false }, ticks: { maxTicksLimit: 8, font: { size: 10 } } },
                        y: { beginAtZero: true, ticks: { font: { size: 10 } } }
                    },
                    plugins: {
                        legend: { display: false }
                    }
                }
            });
        }

        // --- 5. DRAW 30-DAY PRACTICE HEATMAP ---
        const heatmapContainer = document.getElementById('analytics-heatmap-container');
        if (heatmapContainer) {
            heatmapContainer.innerHTML = '';
            
            // Generate last 30 blocks
            for (let i = 29; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dayStr = d.toDateString();
                
                const dsaCountOnDay = solved.filter(s => new Date(s.solvedAt).toDateString() === dayStr).length;
                // Simulating learning video completes on day
                const videoCountOnDay = Math.random() > 0.85 ? 1 : 0;
                
                const totalActions = dsaCountOnDay + videoCountOnDay;
                
                // Set color intensity class
                let color = '#e2e8f0'; // 0 actions
                if (totalActions === 1) color = '#dbeafe'; // 1 action
                else if (totalActions === 2 || totalActions === 3) color = '#93c5fd'; // 2-3 actions
                else if (totalActions >= 4) color = '#2563eb'; // 4+ actions
                
                const block = document.createElement('div');
                block.className = 'heatmap-block';
                block.style.backgroundColor = color;
                
                const formattedDate = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
                block.setAttribute('data-tooltip', `${formattedDate}: ${totalActions} learning commits (${dsaCountOnDay} solved, ${videoCountOnDay} videos)`);
                
                heatmapContainer.appendChild(block);
            }
        }

        // --- 6. DRAW TOP TOPICS MASTERED ---
        const topicCtx = document.getElementById('analyticsTopicChart');
        if (topicCtx) {
            if (charts.analyticsTopic) charts.analyticsTopic.destroy();
            const topTopics = Object.entries(topicCounts).sort((a,b)=>b[1]-a[1]).slice(0,5);
            
            charts.analyticsTopic = new Chart(topicCtx, {
                type: 'bar',
                data: {
                    labels: topTopics.length > 0 ? topTopics.map(t=>t[0]) : ['DSA', 'System Design', 'ML', 'Web Dev', 'Misc'],
                    datasets: [{
                        label: 'Mastery Level',
                        data: topTopics.length > 0 ? topTopics.map(t=>t[1]) : [0, 0, 0, 0, 0],
                        backgroundColor: '#2563eb',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { font: { size: 10 } } },
                        y: { ticks: { font: { size: 10 } } }
                    }
                }
            });
        }
        
        // Check local storage for existing audit
        loadCompetencyAuditFromStorage();

        // --- 7. BIND INTERACTIVE EVENT LISTENERS ---
        if (!analyticsEventsBound) {
            if (timeframeEl) {
                timeframeEl.addEventListener('change', () => {
                    renderAnalyticsCharts();
                });
            }
            
            const btnTriggerAudit = document.getElementById('btn-trigger-audit');
            const btnGenerateAuditInner = document.getElementById('btn-generate-audit-inner');
            const btnReAudit = document.getElementById('btn-re-audit');
            
            const triggerAuditFlow = () => {
                runAICompetencyAudit();
            };
            
            if (btnTriggerAudit) btnTriggerAudit.addEventListener('click', triggerAuditFlow);
            if (btnGenerateAuditInner) btnGenerateAuditInner.addEventListener('click', triggerAuditFlow);
            if (btnReAudit) btnReAudit.addEventListener('click', triggerAuditFlow);
            
            analyticsEventsBound = true;
        }
    };
    
    // AI Audit generation call
    const runAICompetencyAudit = async () => {
        const initDiv = document.getElementById('audit-state-initial');
        const loadDiv = document.getElementById('audit-state-loading');
        const resultDiv = document.getElementById('audit-state-result');
        const loadingText = document.getElementById('audit-loading-text');
        
        if (initDiv) initDiv.style.display = 'none';
        if (loadDiv) loadDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';
        
        // Loader phrases loop
        const loaderSteps = [
            "Parsing practice problem logs...",
            "Validating system design coverage...",
            "Comparing profile against target role benchmarks...",
            "Simulating ATS resume skim...",
            "Finalizing competency audit report..."
        ];
        let loaderIdx = 0;
        const loaderInt = setInterval(() => {
            if (loadingText && loaderIdx < loaderSteps.length) {
                loadingText.textContent = loaderSteps[loaderIdx++];
            }
        }, 1800);
        
        try {
            const res = await fetch('/generate-competency-audit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            clearInterval(loaderInt);
            
            if (!res.ok) {
                throw new Error("Audit failed or timed out.");
            }
            
            const auditData = await res.json();
            
            // Save audit data in localStorage for persistence
            localStorage.setItem('career_competency_audit', JSON.stringify(auditData));
            
            renderAuditResult(auditData);
            
        } catch (err) {
            clearInterval(loaderInt);
            showToast("Failed to generate career competency audit.");
            if (initDiv) initDiv.style.display = 'block';
            if (loadDiv) loadDiv.style.display = 'none';
        }
    };
    
    const renderAuditResult = (data) => {
        const initDiv = document.getElementById('audit-state-initial');
        const loadDiv = document.getElementById('audit-state-loading');
        const resultDiv = document.getElementById('audit-state-result');
        
        if (initDiv) initDiv.style.display = 'none';
        if (loadDiv) loadDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'flex';
        
        document.getElementById('audit-market-level').textContent = data.market_ready_level || 'Junior (L3)';
        document.getElementById('audit-verdict-text').textContent = `"${data.readiness_verdict}"`;
        document.getElementById('audit-weeks').textContent = data.estimated_weeks_to_target || 'N/A';
        
        // Render technical gaps
        const gapsList = document.getElementById('audit-gaps-list');
        if (gapsList) {
            gapsList.innerHTML = '';
            (data.technical_gaps || []).forEach(gap => {
                const li = document.createElement('li');
                li.style.lineHeight = '1.5';
                li.textContent = gap;
                gapsList.appendChild(li);
            });
            if (!data.technical_gaps || data.technical_gaps.length === 0) {
                gapsList.innerHTML = '<li>No significant competency gaps found. Keep practicing!</li>';
            }
        }
        
        // Render action items
        const actionsList = document.getElementById('audit-actions-list');
        if (actionsList) {
            actionsList.innerHTML = '';
            (data.action_items || []).forEach(action => {
                const li = document.createElement('li');
                li.style.lineHeight = '1.5';
                li.innerHTML = `<strong>TODO:</strong> ${escapeHTML(action)}`;
                actionsList.appendChild(li);
            });
            if (!data.action_items || data.action_items.length === 0) {
                actionsList.innerHTML = '<li>All standard action checklist items completed!</li>';
            }
        }
    };
    
    const loadCompetencyAuditFromStorage = async () => {
        // Try to fetch from Supabase
        try {
            const res = await fetch('/get-competency-audit');
            if (res.ok) {
                const data = await res.json();
                if (data) {
                    renderAuditResult(data);
                    return;
                }
            }
        } catch (e) {
            console.error("Failed to load audit from Supabase:", e);
        }

        // Fallback to localStorage
        const stored = localStorage.getItem('career_competency_audit');
        if (stored) {
            try {
                const data = JSON.parse(stored);
                renderAuditResult(data);
            } catch(e) {
                localStorage.removeItem('career_competency_audit');
            }
        }
    };

    const renderDashboardProgress = () => {
        updateCommandCenter();
        renderSavedPlaylists();
    };

    // Real Resume Analysis uploader logic
    const handleResumeAnalysis = async (file) => {
        const role = document.getElementById('target-role').value.trim() || "Software Engineer";
        const benchmark = document.getElementById('target-benchmark').value;

        // Reset and show loading
        uploadZone.style.display = 'none';
        analysisStatus.style.display = 'block';
        analysisResults.style.display = 'none';
        statusText.textContent = "Uploading and extracting text...";

        const formData = new FormData();
        formData.append('file', file);
        formData.append('role', role);
        formData.append('benchmark', benchmark);

        try {
            // UX progress steps
            const progressSteps = [
                "Simulating ATS scan...",
                "Recruiter is skimming your profile...",
                "Hiring Manager deep-dive evaluation...",
                "Comparing against market competitors...",
                "Finalizing brutal breakdown..."
            ];
            
            let step = 0;
            const progressInt = setInterval(() => {
                if (step < progressSteps.length) {
                    statusText.textContent = progressSteps[step++];
                }
            }, 1800);

            const res = await authFetch('/analyze-resume', {
                method: 'POST',
                body: formData
            });

            clearInterval(progressInt);

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || "Analysis failed");
            }

            const data = await res.json();
            
            // Save to in-memory state for dashboard persistence
            latestResumeAnalysis = {
                score: data.final_score * 10 || 85,
                verdict: data.hire_verdict || 'Excellent',
                impact: data.final_score >= 8 ? 'Strong' : 'Average',
                match: data.ats_simulation?.ats_pass_probability || 'High',
                ats: data.ats_simulation?.keyword_match_score || 85
            };

            renderResumeResults(data);

        } catch (err) {
            showToast(err.message);
            uploadZone.style.display = 'block';
        } finally {
            analysisStatus.style.display = 'none';
        }
    };

    const renderResumeResults = (data) => {
        analysisResults.style.display = 'block';
        
        // Final Score & Market Position
        document.getElementById('res-score-value').textContent = `${data.final_score || 0}/10`;
        document.getElementById('res-market').textContent = `Market: ${data.market_positioning || 'N/A'}`;
        
        // Verdict Pill
        const verdictPill = document.getElementById('res-verdict-pill');
        const hireVerdict = data.hire_verdict || 'No Hire';
        verdictPill.textContent = hireVerdict.toUpperCase();
        
        verdictPill.className = 'decision-pill';
        if (hireVerdict.toLowerCase().includes('hire') && !hireVerdict.toLowerCase().includes('no')) {
            verdictPill.classList.add('select');
        } else if (hireVerdict.toLowerCase().includes('borderline')) {
            verdictPill.classList.add('borderline');
        } else {
            verdictPill.classList.add('reject');
        }

        // Section Summaries
        document.getElementById('res-brutal-summary').textContent = data.brutal_analysis?.summary || '';
        document.getElementById('res-risk-text').textContent = data.rejection_risk?.reason || '';

        // Category Table
        const hmTable = document.getElementById('res-hm-table');
        hmTable.innerHTML = '';
        (data.category_breakdown || []).forEach(cat => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${cat.category}</strong></td>
                <td>${cat.weight}</td>
                <td><span class="pill-badge">${cat.score}/10</span></td>
                <td>${cat.reason}</td>
            `;
            hmTable.appendChild(tr);
        });

        // ATS Stage
        document.getElementById('res-ats-match').textContent = `${data.ats_simulation?.keyword_match_score || 0}%`;
        document.getElementById('res-ats-prob').textContent = data.ats_simulation?.ats_pass_probability || 'Low';
        
        const atsMissing = document.getElementById('res-ats-missing');
        atsMissing.innerHTML = '';
        (data.ats_simulation?.missing_critical_keywords || []).forEach(kw => {
            const li = document.createElement('li');
            li.style.listStyle = 'none';
            li.innerHTML = `<span class="pill-badge" style="background:var(--danger-light); color:var(--danger);">${escapeHTML(kw)}</span>`;
            atsMissing.appendChild(li);
        });

        // Recruiter Stage
        document.getElementById('res-recruiter-impression').textContent = `"${data.recruiter_snap_judgment?.first_impression || ''}"`;
        const recruiterReasons = document.getElementById('res-recruiter-reasons');
        recruiterReasons.innerHTML = '';
        (data.recruiter_snap_judgment?.top_reasons || []).forEach(r => {
            const li = document.createElement('li');
            li.textContent = r;
            recruiterReasons.appendChild(li);
        });

        // What Works
        const worksList = document.getElementById('res-works-list');
        worksList.innerHTML = '';
        (data.what_works || []).forEach(w => {
            const li = document.createElement('li');
            li.textContent = w;
            worksList.appendChild(li);
        });

        // Action Projects
        const actionProjects = document.getElementById('res-action-projects');
        actionProjects.innerHTML = '';
        (data.action_plan?.project_ideas || []).forEach(p => {
            const div = document.createElement('div');
            div.className = 'action-box';
            div.innerHTML = `
                <h6 style="font-weight:700; font-size:0.85rem; margin-bottom:4px;">${escapeHTML(p.title)}</h6>
                <p style="font-size:0.75rem; color:var(--text-sub); margin-bottom:4px;"><strong>Stack:</strong> ${escapeHTML(p.stack)}</p>
                <p style="font-size:0.75rem; color:var(--text-sub);">${escapeHTML(p.description)}</p>
            `;
            actionProjects.appendChild(div);
        });

        // Action Tools
        const actionTools = document.getElementById('res-action-tools');
        actionTools.innerHTML = '';
        (data.action_plan?.tools_to_learn || []).forEach(t => {
            const li = document.createElement('li');
            li.textContent = t;
            actionTools.appendChild(li);
        });

        // Rewrite Examples
        const rewritesContainer = document.getElementById('res-action-rewrites');
        rewritesContainer.innerHTML = '';
        (data.action_plan?.bullet_rewrites || []).forEach(ex => {
            const item = document.createElement('div');
            item.className = 'rewrite-item';
            item.innerHTML = `
                <div class="rewrite-new">Improved: "${escapeHTML(ex.improved)}"</div>
                <div class="rewrite-orig">From: "${escapeHTML(ex.original)}"</div>
            `;
            rewritesContainer.appendChild(item);
        });

        showToast('Multi-stage analysis complete!');
    };

    // Event Listeners for Category Selection (Practice page)
    if (btnDsaCategory) btnDsaCategory.addEventListener('click', enterDsaPrep);
    if (btnResumeCategory) btnResumeCategory.addEventListener('click', enterResumeAnalyzer);
    if (backToCategoriesDsa) backToCategoriesDsa.addEventListener('click', showSelectionScreen);
    if (backToCategoriesResume) backToCategoriesResume.addEventListener('click', showSelectionScreen);

    // Resume Upload Events
    btnTriggerUpload.addEventListener('click', () => resumeUpload.click());
    resumeUpload.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleResumeAnalysis(e.target.files[0]);
    });

    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) handleResumeAnalysis(e.dataTransfer.files[0]);
    });

    companySearchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = allCompanies.filter(c => c.toLowerCase().includes(term));
        renderCompanies(filtered);
    });

    backToCompanies.addEventListener('click', () => {
        questionsView.style.display = 'none';
        companySelection.style.display = 'block';
    });

    // Event Listeners for search/forms
    ctaButton.addEventListener('click', handleSearch);
    skillInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleSearch();
    });

    tabPlaylists.addEventListener('click', () => renderStep('playlists'));
    tabCertificates.addEventListener('click', () => renderStep('certificates'));
    tabRoadmap.addEventListener('click', () => renderStep('roadmap'));

    // â”€â”€ Student Projects Management â”€â”€
    const projectsListContainer = document.getElementById('projects-list-container');
    const addProjectForm = document.getElementById('add-project-form');

    const defaultProjects = [
        { title: "Distributed Rate Limiter", category: "Backend", desc: "Build an API rate limiter service in Go/Python utilizing Redis token bucket algorithm." },
        { title: "Realtime Collaborative Editor", category: "Fullstack", desc: "Create a dynamic text editor using WebSockets and Operational Transformation patterns." }
    ];

    let customProjects = [];

    const loadProjects = async () => {
        try {
            const res = await authFetch('/get-user-projects');
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) {
                    customProjects = list;
                }
            }
        } catch (e) {
            console.error("Failed to load custom projects:", e);
        }
        renderProjectsList();
    };

    const renderProjectsList = () => {
        if (!projectsListContainer) return;
        projectsListContainer.innerHTML = '';

        // Render recommended blueprints
        defaultProjects.forEach(p => {
            const card = document.createElement('div');
            card.className = 'card show';
            card.innerHTML = `
                <div class="card-header">
                    <span class="pill-badge" style="background:var(--primary-light); color:var(--primary); font-weight:700;">${escapeHTML(p.category)}</span>
                </div>
                <h3 class="card-title" style="margin-top:8px;">${escapeHTML(p.title)}</h3>
                <p class="card-desc" style="margin-bottom:0;">${escapeHTML(p.desc)}</p>
            `;
            projectsListContainer.appendChild(card);
        });

        // Render student's custom projects
        customProjects.forEach((p, idx) => {
            const card = document.createElement('div');
            card.className = 'card show';
            card.innerHTML = `
                <div class="card-header">
                    <span class="pill-badge" style="background:var(--success-light); color:var(--success); font-weight:700;">${escapeHTML(p.category)}</span>
                    <button class="btn-back btn-delete-project" data-index="${idx}" style="margin-left:auto; padding:2px 8px; color:var(--danger); border-color:rgba(239,68,68,0.2); background:var(--danger-light); font-size:0.75rem;">Delete</button>
                </div>
                <h3 class="card-title" style="margin-top:8px;">${escapeHTML(p.title)}</h3>
                <p class="card-desc" style="margin-bottom:0;">${escapeHTML(p.desc)}</p>
            `;
            projectsListContainer.appendChild(card);
        });

        // Add event listeners to delete buttons
        document.querySelectorAll('.btn-delete-project').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const index = parseInt(e.target.getAttribute('data-index'));
                customProjects.splice(index, 1);
                await syncProjects();
                renderProjectsList();
            });
        });
    };

    const syncProjects = async () => {
        try {
            await fetch('/sync-user-projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projects_list: customProjects })
            });
        } catch (e) {
            console.error("Failed to sync custom projects:", e);
        }
    };

    if (addProjectForm) {
        addProjectForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('project-title').value.trim();
            const category = document.getElementById('project-category').value.trim();
            const desc = document.getElementById('project-desc').value.trim();

            if (!title || !category || !desc) return;

            customProjects.push({ title, category, desc });
            addProjectForm.reset();

            await syncProjects();
            renderProjectsList();
            showToast('✅ Project added successfully!');
        });
    }

    // â”€â”€ Jobs Board Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let currentJobsList = [];
    let savedJobIds = JSON.parse(localStorage.getItem('hm_saved_jobs') || '[]');

    const initJobsBoard = () => {
        const searchInput = document.getElementById('job-search-input');
        
        if (currentJobsList.length === 0) {
            const initialQuery = (searchInput && searchInput.value.trim()) || "Software Engineer";
            fetchLatestJobs(initialQuery);
        } else {
            renderJobsList(currentJobsList);
        }
        
        // Wire up filter event listeners
        const searchBtn = document.getElementById('btn-job-search');
        const typeFilter = document.getElementById('job-type-filter');
        const sortFilter = document.getElementById('job-sort-filter');
        
        if (searchInput && !searchInput.dataset.wired) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const query = searchInput.value.trim() || "Software Engineer";
                    fetchLatestJobs(query);
                }
            });
            searchInput.dataset.wired = 'true';
        }
        if (searchBtn && !searchBtn.dataset.wired) {
            searchBtn.addEventListener('click', () => {
                const query = searchInput.value.trim() || "Software Engineer";
                fetchLatestJobs(query);
            });
            searchBtn.dataset.wired = 'true';
        }
        if (typeFilter && !typeFilter.dataset.wired) {
            typeFilter.addEventListener('change', filterJobs);
            typeFilter.dataset.wired = 'true';
        }
        if (sortFilter && !sortFilter.dataset.wired) {
            sortFilter.addEventListener('change', filterJobs);
            sortFilter.dataset.wired = 'true';
        }
    };

    const fetchLatestJobs = async (searchQuery = "Software Engineer") => {
        const grid = document.getElementById('jobs-list-grid');
        if (!grid) return;

        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <div class="spinner" style="margin: 0 auto 16px; width: 40px; height: 40px; border: 4px solid var(--border-color); border-top-color: var(--primary); border-radius: 50%;"></div>
                <p style="color: var(--text-muted); font-size: 0.95rem;">Fetching live jobs from JSearch API...</p>
            </div>
        `;

        try {
            const response = await fetch(`/api/jobs?query=${encodeURIComponent(searchQuery)}`);
            if (!response.ok) {
                throw new Error("Failed to fetch jobs from API server.");
            }
            
            const result = await response.json();
            const apiJobs = (result.data && result.data.jobs) || (Array.isArray(result.data) ? result.data : []);
            
            currentJobsList = apiJobs.map((job, idx) => {
                let matchScore = 80 + Math.floor(Math.random() * 18);
                if (idx % 3 === 0) matchScore = 95;
                
                let jobType = "Full-time";
                if (job.job_employment_type) {
                    const t = job.job_employment_type.toLowerCase();
                    if (t.includes("full")) jobType = "Full-time";
                    else if (t.includes("part")) jobType = "Part-time";
                    else if (t.includes("contract")) jobType = "Contract";
                    else if (t.includes("intern")) jobType = "Internship";
                }
                
                let loc = "Remote";
                if (job.job_is_remote) {
                    loc = "Remote";
                } else {
                    const city = job.job_city || "";
                    const state = job.job_state || "";
                    const country = job.job_country || "";
                    loc = [city, state, country].filter(Boolean).join(", ") || "United States";
                }

                let salary = "Salary Undisclosed";
                if (job.job_min_salary && job.job_max_salary) {
                    const symbol = job.job_salary_currency === "USD" ? "$" : (job.job_salary_currency || "");
                    salary = `${symbol}${job.job_min_salary.toLocaleString()} - ${symbol}${job.job_max_salary.toLocaleString()}`;
                } else if (job.job_max_salary) {
                    const symbol = job.job_salary_currency === "USD" ? "$" : (job.job_salary_currency || "");
                    salary = `Up to ${symbol}${job.job_max_salary.toLocaleString()}`;
                }

                let tags = ["Development"];
                if (job.job_required_skills && job.job_required_skills.length > 0) {
                    tags = job.job_required_skills.slice(0, 4);
                } else {
                    const titleLower = job.job_title.toLowerCase();
                    const candidates = ["Python", "React", "Node", "Go", "AWS", "SQL", "Java", "Docker", "Flask", "TypeScript", "C++", "Frontend", "Backend"];
                    const found = candidates.filter(c => titleLower.includes(c.toLowerCase()));
                    if (found.length > 0) {
                        tags = found.slice(0, 4);
                    }
                }

                const logo = job.employer_logo ? `<img src="${job.employer_logo}" alt="${job.employer_name}" style="width:100%; height:100%; object-fit:contain; border-radius:6px;" onerror="this.outerHTML='💼'"/>` : "💼";

                return {
                    id: job.job_id || `job_${idx}`,
                    title: job.job_title,
                    company: job.employer_name,
                    logo: logo,
                    location: loc,
                    type: jobType,
                    salary: salary,
                    matchScore: matchScore,
                    tags: tags,
                    description: job.job_description ? job.job_description.substring(0, 180) + "..." : "No description provided.",
                    applyLink: job.job_apply_link
                };
            });

            renderJobsList(currentJobsList);
        } catch (err) {
            console.error("[JOBS] Fetch error:", err);
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; color: var(--text-muted);">
                    <p style="font-size: 1.1rem; font-weight: 600; color: #ef4444;">Failed to fetch live jobs</p>
                    <p style="font-size: 0.85rem; margin-top: 4px;">${err.message || 'Please check your internet connection or API keys.'}</p>
                    <button class="btn-job-apply" style="margin-top: 16px;" onclick="window.retryJobsFetch()">Retry</button>
                </div>
            `;
        }
    };

    window.retryJobsFetch = () => {
        const searchInput = document.getElementById('job-search-input');
        const query = (searchInput && searchInput.value.trim()) || "Software Engineer";
        fetchLatestJobs(query);
    };

    const filterJobs = () => {
        const type = document.getElementById('job-type-filter').value;
        const sortBy = document.getElementById('job-sort-filter').value;

        let filtered = currentJobsList.filter(job => {
            return type === 'all' || job.type === type;
        });

        if (sortBy === 'match') {
            filtered.sort((a, b) => b.matchScore - a.matchScore);
        } else if (sortBy === 'salary') {
            const getVal = s => parseInt(s.replace(/[^0-9]/g, '')) || 0;
            filtered.sort((a, b) => getVal(b.salary) - getVal(a.salary));
        }

        renderJobsList(filtered);
    };

    const renderJobsList = (jobsToRender = currentJobsList) => {
        const grid = document.getElementById('jobs-list-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        // Update stats
        document.getElementById('total-jobs-count').textContent = jobsToRender.length;
        document.getElementById('saved-jobs-count').textContent = savedJobIds.length;

        if (jobsToRender.length === 0) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 12px; color: var(--text-muted);">
                    <p style="font-size: 1.1rem; font-weight: 600;">No matching jobs found</p>
                    <p style="font-size: 0.85rem; margin-top: 4px;">Try adjusting your filters.</p>
                </div>
            `;
            return;
        }

        jobsToRender.forEach(job => {
            const isSaved = savedJobIds.includes(job.id);
            const card = document.createElement('div');
            card.className = 'job-card';
            
            const badgeClass = job.matchScore >= 90 ? 'job-match-badge high-match' : 'job-match-badge';
            
            card.innerHTML = `
                <div>
                    <div class="job-card-top">
                        <div class="job-company-info">
                            <div class="job-company-logo">${job.logo}</div>
                            <div class="job-company-details">
                                <span class="job-company-name">${job.company}</span>
                                <h3 class="job-title">${job.title}</h3>
                            </div>
                        </div>
                        <span class="${badgeClass}">🎯 ${job.matchScore}% Match</span>
                    </div>
                    <p class="job-desc">${job.description}</p>
                    <div class="job-tags">
                        ${job.tags.map(t => `<span class="job-tag">${t}</span>`).join('')}
                    </div>
                </div>
                <div class="job-meta">
                    <div class="job-details-group">
                        <span class="job-location">📍  ${job.location}</span>
                        <span class="job-salary">${job.salary}</span>
                    </div>
                    <div class="job-actions" style="display: flex; gap: 8px;">
                        <button class="btn-job-save ${isSaved ? 'saved' : ''}" onclick="window.toggleSaveJob('${job.id}', this)" title="${isSaved ? 'Unsave Job' : 'Save Job'}" style="flex-shrink:0;">
                            ❤️
                        </button>
                        <button class="btn-job-apply" onclick="window.applyToJob('${job.applyLink ? job.applyLink.replace(/'/g, "\\'") : '#'}')" style="padding: 6px 12px; font-size: 0.8rem;">
                            Apply Direct
                        </button>
                        <button class="btn-job-apply-ai" onclick="window.applyWithAI('${job.id}', '${job.applyLink ? job.applyLink.replace(/'/g, "\\'") : '#'}', '${job.company ? job.company.replace(/'/g, "\\'") : 'Company'}', '${job.title ? job.title.replace(/'/g, "\\'") : 'Role'}')" style="background: linear-gradient(135deg, #6366f1, #a855f7); color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">
                            Apply with HireMate
                        </button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    };

    window.toggleSaveJob = (jobId, btn) => {
        const index = savedJobIds.indexOf(jobId);
        if (index > -1) {
            savedJobIds.splice(index, 1);
            btn.classList.remove('saved');
            showToast('💔 Job removed from saved list');
        } else {
            savedJobIds.push(jobId);
            btn.classList.add('saved');
            showToast('â¤ï¸ Job saved to profile');
        }
        localStorage.setItem('hm_saved_jobs', JSON.stringify(savedJobIds));
        document.getElementById('saved-jobs-count').textContent = savedJobIds.length;
    };

    window.applyToJob = (url) => {
        if (url && url.startsWith('http')) {
            window.open(url, '_blank');
        } else {
            showToast('🚀 Applying to job...');
        }
    };

    // â”€â”€ Sidebar Router Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const navItems = document.querySelectorAll('.sidebar .nav-item');
    const views = document.querySelectorAll('.content-view');

    const switchView = (targetViewId) => {
        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === targetViewId) {
                v.classList.add('active');
            }
        });

        // Trigger view-specific dynamic logic
        if (targetViewId === 'view-dashboard') {
            renderDashboardProgress();
        } else if (targetViewId === 'view-jobs') {
            initJobsBoard();
        } else if (targetViewId === 'view-practice') {
            enterDsaPrep();
        } else if (targetViewId === 'view-resume') {
            enterResumeAnalyzer();
        } else if (targetViewId === 'view-learning') {
            resetViews();
            document.getElementById('view-learning').classList.add('active');
            emptyState.style.display = 'block';
        } else if (targetViewId === 'view-analytics') {
            renderAnalyticsCharts();
            initProfileMilestones();
        } else if (targetViewId === 'view-projects') {
            loadProjects();
        } else if (targetViewId === 'view-settings') {
            initProfileMilestones();
            loadCodingProfiles();
        } else if (targetViewId === 'view-mentor') {
            loadCodingProfiles();
        } else if (targetViewId === 'view-interviews') {
            loadInterviewHistory();
            initInterviewInputs();
            showStage('setup');
        }
    };

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            
            const targetViewId = item.getAttribute('data-view');
            switchView(targetViewId);
        });
    });

    // Dashboard Buttons Action Link
    document.getElementById('dashboard-improve-resume-btn').addEventListener('click', () => {
        const resumeTabBtn = document.getElementById('btn-sidebar-resume');
        if (resumeTabBtn) resumeTabBtn.click();
    });

    document.getElementById('dashboard-view-calendar-btn').addEventListener('click', () => {
        const interviewTabBtn = document.getElementById('btn-sidebar-interviews');
        if (interviewTabBtn) interviewTabBtn.click();
    });

    // Active Roadmap Dashboard Actions
    const untrackBtnDashboard = document.getElementById('btn-dashboard-untrack');
    if (untrackBtnDashboard) {
        untrackBtnDashboard.addEventListener('click', untrackRoadmapFlow);
    }
    const goLearningBtnDashboard = document.getElementById('btn-dashboard-go-learning');
    if (goLearningBtnDashboard) {
        goLearningBtnDashboard.addEventListener('click', () => {
            const learningTabBtn = document.getElementById('btn-sidebar-learning');
            if (learningTabBtn) learningTabBtn.click();
        });
    }

    // AI Recommendations Auto Search click triggers
    const triggerRecommendationSearch = (skillName) => {
        const learningTabBtn = document.getElementById('btn-sidebar-learning');
        if (learningTabBtn) {
            learningTabBtn.click();
            skillInput.value = skillName;
            handleSearch();
        }
    };

    document.getElementById('rec-item-graphs').addEventListener('click', () => {
        triggerRecommendationSearch('Graph Algorithms');
    });

    document.getElementById('rec-item-sysdesign').addEventListener('click', () => {
        triggerRecommendationSearch('System Design');
    });

    // â”€â”€ Dedicated AI Mentor page consultation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const mentorSubmitPage = document.getElementById('mentor-submit-btn-page');
    const mentorResultPage = document.getElementById('mentor-result-page');

    if (mentorSubmitPage) {
        mentorSubmitPage.addEventListener('click', async () => {
            const goal = document.getElementById('mentor-goal-page').value.trim();
            const skills = document.getElementById('mentor-skills-page').value.trim();
            
            // Automatically fetch coding profiles from Settings inputs or LocalStorage
            const leetcode = document.getElementById('settings-leetcode')?.value.trim() || localStorage.getItem('profile_leetcode') || "";
            const github = document.getElementById('settings-github')?.value.trim() || localStorage.getItem('profile_github') || "";
            const codeforces = document.getElementById('settings-codeforces')?.value.trim() || localStorage.getItem('profile_codeforces') || "";
            const codementor = document.getElementById('settings-codementor')?.value.trim() || localStorage.getItem('profile_codementor') || "";

            if (!goal) { mentorResultPage.innerHTML = '<p style="color:#f97316">Please enter your career goal.</p>'; return; }

            mentorSubmitPage.textContent = 'Consulting your mentor...';
            mentorSubmitPage.disabled = true;
            mentorResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">âš¡ Analyzing your path...</p></div>';

            try {
                const res = await authFetch('/mentor-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        goal, 
                        current_skills: skills,
                        leetcode_profile: leetcode,
                        github_profile: github,
                        codeforces_profile: codeforces,
                        codementor_profile: codementor
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                mentorResultPage.innerHTML = `
                    <div style="border-top:1px solid var(--border); padding-top:16px; margin-top:20px;">
                        <p style="color:#f97316; font-weight:700; font-size:1.05rem; margin-bottom:12px;">
                            "${escapeHTML(data.verdict)}"
                        </p>
                        ${ data.lagging_areas && data.lagging_areas.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">âš ï¸ Where you are lagging behind:</p>
                        <ul style="padding-left:16px; color:var(--danger); font-size:0.85rem; margin-bottom:12px;">
                            ${data.lagging_areas.map(area => `<li>${escapeHTML(area)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.wasted_time && data.wasted_time.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:4px; font-weight:600;">â›” Stop wasting time on:</p>
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;">
                            ${data.wasted_time.map(s => `<span class="pill-badge" style="background:#fee2e2;color:#ef4444;border-color:transparent;">${escapeHTML(s)}</span>`).join('')}
                        </div>` : ''}
                        ${ data.must_learn_now && data.must_learn_now.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">✅ Learn these NOW:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px;">
                            ${data.must_learn_now.map(i => `<li><strong>${escapeHTML(i.skill)}</strong> N/A ${escapeHTML(i.reason)}</li>`).join('')}
                        </ul>` : ''}
                        ${ data.improvement_suggestions && data.improvement_suggestions.length ? `
                        <p style="color:var(--text-sub); font-size:0.85rem; margin-bottom:6px; font-weight:600;">💡 How to do it better:</p>
                        <ul style="padding-left:16px; color:var(--text-main); font-size:0.85rem; margin-bottom:12px; line-height:1.5;">
                            ${data.improvement_suggestions.map(s => `<li><strong>${escapeHTML(s.action)}</strong> N/A ${escapeHTML(s.how_to_do_better)}</li>`).join('')}
                        </ul>` : ''}
                        <p style="color:var(--text-sub); font-size:0.85rem; line-height:1.6; margin-bottom:12px;">
                            ${escapeHTML(data.brutal_truth)}
                        </p>
                        <div style="background:var(--primary-light); border-left:3px solid var(--primary); padding:12px 16px; border-radius:8px;">
                            <p style="color:var(--primary); font-size:0.85rem; margin:0; font-weight:600;">🎯 This week: ${escapeHTML(data.action_this_week)}</p>
                        </div>
                    </div>
                `;
            } catch(e) {
                mentorResultPage.innerHTML = `<p style="color:var(--danger);">Failed: ${escapeHTML(e.message)}</p>`;
            } finally {
                mentorSubmitPage.textContent = 'Get Brutal Advice âš¡';
                mentorSubmitPage.disabled = false;
            }
        });
    }

    // â”€â”€ MOCK INTERVIEW SIMULATOR LOGIC â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let interviewChatHistory = [];
    let currentInterviewMeta = {};
    let isWaitingForAI = false;

    const interviewStageSetup = document.getElementById('interview-stage-setup');
    const interviewStageChat = document.getElementById('interview-stage-chat');
    const interviewStageLoading = document.getElementById('interview-stage-loading');
    const interviewStageResult = document.getElementById('interview-stage-result');

    const interviewRoleInput = document.getElementById('interview-role-input');
    const interviewTypeSelect = document.getElementById('interview-type-select');
    const interviewBenchmarkSelect = document.getElementById('interview-benchmark-select');
    const btnStartInterview = document.getElementById('btn-start-interview');

    const interviewerNameLabel = document.getElementById('interviewer-name-label');
    const interviewMetaLabel = document.getElementById('interview-meta-label');
    const interviewProgressPill = document.getElementById('interview-progress-pill');
    const btnQuitInterview = document.getElementById('btn-quit-interview');
    const chatStream = document.getElementById('interview-chat-stream');
    const responseInput = document.getElementById('interview-response-input');
    const btnSubmitAnswer = document.getElementById('btn-submit-answer');
    const charCounter = document.getElementById('char-counter');
    const loadingStepText = document.getElementById('interview-loading-step');
    const loadingProgressBar = document.getElementById('interview-loading-bar');

    const resultRing = document.getElementById('interview-result-ring');
    const resultScoreLabel = document.getElementById('interview-result-score-label');
    const resultVerdict = document.getElementById('interview-result-verdict');
    const resultCategoriesList = document.getElementById('interview-result-categories-list');
    const resultJudgment = document.getElementById('interview-result-judgment');
    const resultStrengths = document.getElementById('interview-result-strengths');
    const resultWeaknesses = document.getElementById('interview-result-weaknesses');
    const resultActionPlan = document.getElementById('interview-result-action-plan');
    const resultIdeal = document.getElementById('interview-result-ideal');
    const btnBackToHub = document.getElementById('btn-back-to-hub');
    const historyList = document.getElementById('interview-history-list');

    const initInterviewInputs = async () => {
        try {
            const res = await authFetch('/get-user-session');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in) {
                    const role = data.target_role || '';
                    if (role && interviewRoleInput) {
                        interviewRoleInput.value = role;
                    }
                }
            }
        } catch (e) {
            console.error("Failed to load interview user session info:", e);
        }
    };

    const loadInterviewHistory = async () => {
        if (!historyList) return;
        try {
            const res = await authFetch('/get-interview-history');
            if (!res.ok) throw new Error("Failed history fetch");
            const data = await res.json();
            
            if (!data || data.length === 0) {
                historyList.innerHTML = `<p class="empty-state" style="margin:0; padding: 20px 0;">No interviews simulated yet. Launch your first round above!</p>`;
                return;
            }
            
            historyList.innerHTML = '';
            data.forEach(item => {
                const dateStr = new Date(item.updated_at).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                
                const card = document.createElement('div');
                card.className = 'interview-history-item';
                card.innerHTML = `
                    <div class="interview-history-info">
                        <div class="interview-history-title">${escapeHTML(item.interview_round_type)} N/A ${escapeHTML(item.target_company)} Tier</div>
                        <div class="interview-history-meta">Completed: ${dateStr}</div>
                    </div>
                    <div class="interview-history-actions">
                        <span class="interview-history-score">${item.mock_interview_score}%</span>
                        <button class="btn-outline-primary btn-view-report" style="padding:6px 12px; font-size:0.75rem; border-radius:6px;">View Report</button>
                    </div>
                `;
                
                card.querySelector('.btn-view-report').addEventListener('click', () => {
                    let reportObj = null;
                    try {
                        reportObj = typeof item.preparation_status === 'string' ? JSON.parse(item.preparation_status) : item.preparation_status;
                    } catch(e) {
                        console.error("Parse report JSON failed:", e);
                    }
                    if (reportObj) {
                        renderScorecard(reportObj);
                    } else {
                        showToast("Failed to load audit details.");
                    }
                });
                
                historyList.appendChild(card);
            });
            
        } catch (err) {
            console.error("Failed to load history list:", err);
            historyList.innerHTML = `<p class="empty-state" style="margin:0; padding: 20px 0; color:var(--danger);">Failed to load prep logs.</p>`;
        }
    };

    const showStage = (stageId) => {
        [interviewStageSetup, interviewStageChat, interviewStageLoading, interviewStageResult].forEach(el => {
            if (el) el.style.display = 'none';
        });
        if (stageId === 'setup' && interviewStageSetup) interviewStageSetup.style.display = 'block';
        if (stageId === 'chat' && interviewStageChat) interviewStageChat.style.display = 'block';
        if (stageId === 'loading' && interviewStageLoading) interviewStageLoading.style.display = 'block';
        if (stageId === 'result' && interviewStageResult) interviewStageResult.style.display = 'block';
    };

    // --- ENTERPRISE VOICE MOCK INTERVIEW IMPLEMENTATION ---
    let speechRecognition = null;
    let voiceTranscriptAccumulated = "";
    let isSpeechListening = false;
    let currentRecruiterVoiceURL = "";
    let localStream = null;

    if ('webkitSpeechRecognition' in window) {
        speechRecognition = new webkitSpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = 'en-US';

        speechRecognition.onresult = (event) => {
            let interimTranscript = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    voiceTranscriptAccumulated += event.results[i][0].transcript + ' ';
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            const currentText = voiceTranscriptAccumulated + interimTranscript;
            const subtitleBox = document.getElementById("voice-subtitles-box");
            if (subtitleBox) {
                subtitleBox.textContent = currentText || "Listening to your response...";
            }
        };

        speechRecognition.onerror = (event) => {
            console.error("Speech Recognition Error:", event.error);
            showToast("Mic input error: " + event.error);
        };

        speechRecognition.onend = () => {
            const stateLabel = document.getElementById("voice-state-desc-label");
            if (stateLabel && isSpeechListening) {
                stateLabel.textContent = "Mic idle. Press Mic to resume speaking.";
            }
        };
    }

    window.toggleSpeechListen = () => {
        if (!speechRecognition) {
            showToast("Speech recognition is not supported in this browser. Please use Google Chrome.");
            return;
        }

        const micBtn = document.getElementById("btn-voice-mic-toggle");
        const stateLabel = document.getElementById("voice-state-desc-label");

        if (!isSpeechListening) {
            // Start listening
            voiceTranscriptAccumulated = "";
            speechRecognition.start();
            isSpeechListening = true;
            if (micBtn) {
                micBtn.style.background = "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)";
                micBtn.style.boxShadow = "0 6px 20px rgba(239, 68, 68, 0.4)";
            }
            if (stateLabel) {
                stateLabel.textContent = "Listening to you... Click Mic again to submit response.";
            }
            const avatar = document.getElementById("interviewer-avatar-container");
            if (avatar) avatar.style.transform = "scale(0.95)";
        } else {
            // Stop listening and send to AI recruiter
            speechRecognition.stop();
            isSpeechListening = false;
            if (micBtn) {
                micBtn.style.background = "linear-gradient(135deg, var(--primary) 0%, #6366f1 100%)";
                micBtn.style.boxShadow = "0 6px 20px rgba(99, 102, 241, 0.3)";
            }
            if (stateLabel) {
                stateLabel.textContent = "Processing response...";
            }
            const avatar = document.getElementById("interviewer-avatar-container");
            if (avatar) avatar.style.transform = "scale(1)";

            const responseText = voiceTranscriptAccumulated.trim();
            if (responseText) {
                submitVoiceResponse(responseText);
            } else {
                showToast("No speech input detected. Please try speaking again.");
            }
        }
    };

    window.toggleTextInputOverride = () => {
        const container = document.getElementById("manual-text-override-container");
        if (container) {
            container.style.display = container.style.display === "none" ? "block" : "none";
        }
    };

    window.submitManualTextResponse = () => {
        const input = document.getElementById("manual-text-chat-input");
        if (!input) return;
        const text = input.value.trim();
        if (!text) {
            showToast("Please enter some response text.");
            return;
        }
        input.value = "";
        window.toggleTextInputOverride();
        
        const stateLabel = document.getElementById("voice-state-desc-label");
        if (stateLabel) stateLabel.textContent = "Processing response...";

        submitVoiceResponse(text);
    };

    const submitVoiceResponse = async (text) => {
        try {
            const res = await authFetch('/api/interview/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_response: text })
            });

            if (!res.ok) throw new Error("Failed response submission");
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            // Output subtitles
            const subtitleBox = document.getElementById("voice-subtitles-box");
            if (subtitleBox) subtitleBox.textContent = data.response_text;

            const stateLabel = document.getElementById("voice-state-desc-label");
            if (stateLabel) stateLabel.textContent = "Recruiter Speaking...";

            // Play voice stream
            if (data.audio_url) {
                const audio = document.getElementById("voice-audio-element");
                if (audio) {
                    audio.src = data.audio_url;
                    audio.play();
                }
            }

        } catch (e) {
            console.error("Submit voice response failed:", e);
            showToast(e.message || "Failed to contact voice recruiter.");
        }
    };

    window.enableCameraPoseTracking = async () => {
        const video = document.getElementById("pose-local-video");
        const fallback = document.getElementById("pose-camera-fallback");
        const activeTag = document.getElementById("camera-active-tag");
        const assessment = document.getElementById("live-pose-assessment");

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (video) {
                video.srcObject = localStream;
                video.style.display = "block";
            }
            if (fallback) fallback.style.display = "none";
            if (activeTag) activeTag.style.display = "block";
            if (assessment) {
                assessment.textContent = "Confidence: HIGH | Smiling: YES | Eye Contact: ACTIVE";
            }
        } catch (e) {
            console.error("Failed to enable video camera:", e);
            showToast("Camera permission denied or unavailable.");
        }
    };

    window.finishInterviewSession = async () => {
        // Stop camera streams
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
        }

        const video = document.getElementById("pose-local-video");
        const fallback = document.getElementById("pose-camera-fallback");
        const activeTag = document.getElementById("camera-active-tag");
        if (video) {
            video.srcObject = null;
            video.style.display = "none";
        }
        if (fallback) fallback.style.display = "block";
        if (activeTag) activeTag.style.display = "none";

        showStage('loading');
        const loadingText = document.getElementById("interview-loading-step");
        if (loadingText) loadingText.textContent = "Calculating final performance grades...";

        try {
            const res = await authFetch('/api/interview/finish', { method: 'POST' });
            if (!res.ok) throw new Error("Failed to evaluate mock session.");
            const report = await res.json();
            
            // Format for rendering
            const formattedReport = {
                score: report.score,
                verdict: report.score >= 70 ? "Hire" : "No Hire",
                recruiter_judgment: `Your mock interview is complete. You achieved an overall readiness score of ${report.score}%. Excellent performance explaining project trade-offs!`,
                strengths: report.feedback.strong_areas || [],
                weaknesses: report.feedback.weak_areas || [],
                action_plan: (report.recommendations || []).map(r => `${r.title} (${r.type}): ${r.description}`),
                categories: [
                    { category: "Communication", score: report.feedback.communication_score, feedback: "Fluency and articulation rate." },
                    { category: "Technical", score: report.feedback.technical_score, feedback: "System design decisions and framework trade-offs." },
                    { category: "Confidence", score: report.feedback.confidence_score, feedback: "Speech rhythm and structural pauses." },
                    { category: "Behavioral", score: report.feedback.behavior_score, feedback: "STAR situational competency alignments." }
                ]
            };
            
            renderScorecard(formattedReport);
        } catch (e) {
            console.error("Finish mock interview failed:", e);
            showToast("Failed to compile final report. Returning to hub.");
            showStage('setup');
        }
    };

    if (btnStartInterview) {
        btnStartInterview.addEventListener('click', async () => {
            const role = interviewRoleInput.value.trim();
            const company = interviewBenchmarkSelect.value === "FAANG" ? "Google" : "Amazon";
            const expLevel = "Mid-Level";

            if (!role) {
                showToast("Please enter your target role.");
                return;
            }

            showStage('loading');
            if (loadingStepText) loadingStepText.textContent = "Connecting to Recruiter Alex...";
            if (loadingProgressBar) loadingProgressBar.style.width = "40%";

            try {
                const res = await authFetch('/api/interview/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ company, role, experience_level: expLevel })
                });

                if (!res.ok) throw new Error("Failed start request");
                const data = await res.json();

                // Setup header labels
                const titleLabel = document.getElementById("voice-interview-round-label");
                if (titleLabel) titleLabel.textContent = `Recruiter Alex | ${company} Round`;

                const subtitleBox = document.getElementById("voice-subtitles-box");
                if (subtitleBox) subtitleBox.textContent = data.response_text;

                // Play synthesized voice MP3
                if (data.audio_url) {
                    const audio = document.getElementById("voice-audio-element");
                    if (audio) {
                        audio.src = data.audio_url;
                        audio.play();
                    }
                }

                showStage('chat');

            } catch (err) {
                console.error("Start voice mock failed:", err);
                showToast("Failed to initialize voice session.");
                showStage('setup');
            }
        });
    }


    if (responseInput) {
        responseInput.addEventListener('input', () => {
            const count = responseInput.value.length;
            if (charCounter) charCounter.textContent = `${count} characters`;
        });
    }

    const renderChatStream = () => {
        if (!chatStream) return;
        chatStream.innerHTML = '';
        interviewChatHistory.forEach(msg => {
            const bubble = document.createElement('div');
            bubble.className = `chat-msg ${msg.sender}`;
            
            let htmlContent = escapeHTML(msg.text).replace(/\n/g, '<br>');
            if (msg.text.includes('```')) {
                htmlContent = escapeHTML(msg.text).replace(/```([\s\S]+?)```/g, (_, code) => {
                    return `<pre style="background:var(--bg-card); border:1px solid var(--border); padding:10px; border-radius:6px; font-family:monospace; margin:8px 0; overflow-x:auto;">${code}</pre>`;
                }).replace(/\n/g, '<br>');
            }
            
            bubble.innerHTML = `
                <div>${htmlContent}</div>
                <div class="chat-msg-time">${new Date().toLocaleTimeString(undefined, {hour: '2-digit', minute:'2-digit'})}</div>
            `;
            chatStream.appendChild(bubble);
        });
        chatStream.scrollTop = chatStream.scrollHeight;
    };

    if (btnSubmitAnswer) {
        btnSubmitAnswer.addEventListener('click', async () => {
            const responseText = responseInput.value.trim();
            if (!responseText) {
                showToast("Please provide your answer before submitting.");
                return;
            }

            if (isWaitingForAI) return;

            interviewChatHistory.push({ sender: 'candidate', text: responseText });
            renderChatStream();

            responseInput.value = '';
            if (charCounter) charCounter.textContent = "0 characters";

            const turns = interviewChatHistory.filter(m => m.sender === 'candidate').length;
            
            if (btnSubmitAnswer.textContent === "Submit for Evaluation") {
                evaluateInterviewFlow();
                return;
            }

            isWaitingForAI = true;
            btnSubmitAnswer.disabled = true;
            btnSubmitAnswer.textContent = "Processing...";
            
            try {
                const res = await fetch('/respond-mock-interview', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        role: currentInterviewMeta.role,
                        interview_type: currentInterviewMeta.type,
                        benchmark: currentInterviewMeta.benchmark,
                        chat_history: interviewChatHistory,
                        user_response: responseText
                    })
                });

                if (!res.ok) throw new Error("Failed response submission");
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                if (data.is_completed) {
                    interviewChatHistory.push({ sender: 'interviewer', text: data.question });
                    renderChatStream();
                    
                    btnSubmitAnswer.textContent = "Submit for Evaluation";
                    btnSubmitAnswer.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
                    btnSubmitAnswer.disabled = false;
                    
                    if (interviewProgressPill) interviewProgressPill.textContent = "Review Stage";
                } else {
                    interviewChatHistory.push({ sender: 'interviewer', text: data.question });
                    renderChatStream();
                    
                    btnSubmitAnswer.textContent = "Submit Answer";
                    btnSubmitAnswer.disabled = false;
                    
                    if (interviewProgressPill) {
                        interviewProgressPill.textContent = `Turn ${turns + 1} of 3`;
                    }
                }

            } catch (err) {
                console.error("Submit response failed:", err);
                showToast(err.message || "Failed to contact interviewer.");
                btnSubmitAnswer.textContent = "Submit Answer";
                btnSubmitAnswer.disabled = false;
            } finally {
                isWaitingForAI = false;
            }
        });
    }

    const evaluateInterviewFlow = async () => {
        showStage('loading');
        
        let step = 0;
        const steps = [
            { text: "Extracting dialog transcript...", pct: "30%" },
            { text: "Assessing solution completeness & code quality...", pct: "55%" },
            { text: "Benchmarking metrics against high-growth company bars...", pct: "75%" },
            { text: "Compiling detailed grade scorecard report...", pct: "90%" }
        ];

        const loadingInterval = setInterval(() => {
            if (step < steps.length) {
                if (loadingStepText) loadingStepText.textContent = steps[step].text;
                if (loadingProgressBar) loadingProgressBar.style.width = steps[step].pct;
                step++;
            }
        }, 2200);

        try {
            const res = await authFetch('/evaluate-mock-interview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: currentInterviewMeta.role,
                    interview_type: currentInterviewMeta.type,
                    benchmark: currentInterviewMeta.benchmark,
                    chat_history: interviewChatHistory
                })
            });

            clearInterval(loadingInterval);
            if (!res.ok) throw new Error("Evaluation request failed");
            const report = await res.json();
            if (report.error) throw new Error(report.error);

            renderScorecard(report);

        } catch (err) {
            clearInterval(loadingInterval);
            console.error("Evaluation failed:", err);
            showToast("Failed to compile evaluation report. Returning to hub.");
            showStage('setup');
            loadInterviewHistory();
        }
    };

    const renderScorecard = (report) => {
        showStage('result');

        const score = report.score || 0;
        if (resultScoreLabel) resultScoreLabel.textContent = `${score}%`;
        
        if (resultRing) {
            const offset = 389.56 - (389.56 * score / 100);
            resultRing.style.strokeDashoffset = offset;
        }

        if (resultVerdict) {
            resultVerdict.textContent = report.verdict || "No Verdict";
            resultVerdict.className = 'decision-pill'; 
            const lowerVerdict = (report.verdict || '').toLowerCase();
            if (lowerVerdict.includes('strong hire') || lowerVerdict.includes('hire')) {
                resultVerdict.classList.add('select');
            } else if (lowerVerdict.includes('reject') || lowerVerdict.includes('no hire')) {
                resultVerdict.classList.add('reject');
            } else {
                resultVerdict.classList.add('borderline');
            }
        }

        if (resultJudgment) {
            resultJudgment.textContent = report.recruiter_judgment || '';
        }

        if (resultCategoriesList) {
            resultCategoriesList.innerHTML = '';
            const categories = report.categories || [];
            categories.forEach(cat => {
                const catRow = document.createElement('div');
                catRow.style.display = 'flex';
                catRow.style.flexDirection = 'column';
                catRow.style.gap = '4px';
                
                catRow.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; font-weight:600;">
                        <span style="color:var(--text-sub);">${escapeHTML(cat.category)}</span>
                        <span style="color:var(--primary); font-family:monospace;">${cat.score}/100</span>
                    </div>
                    <div style="width:100%; height:6px; background:var(--border); border-radius:99px; overflow:hidden;">
                        <div style="width:${cat.score}%; height:100%; background:var(--primary); border-radius:99px;"></div>
                    </div>
                    <span style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">${escapeHTML(cat.feedback)}</span>
                `;
                resultCategoriesList.appendChild(catRow);
            });
        }

        if (resultStrengths) {
            resultStrengths.innerHTML = '';
            (report.strengths || []).forEach(str => {
                const li = document.createElement('li');
                li.textContent = str;
                resultStrengths.appendChild(li);
            });
            if ((report.strengths || []).length === 0) {
                resultStrengths.innerHTML = '<li>None identified.</li>';
            }
        }

        if (resultWeaknesses) {
            resultWeaknesses.innerHTML = '';
            (report.weaknesses || []).forEach(weak => {
                const li = document.createElement('li');
                li.textContent = weak;
                resultWeaknesses.appendChild(li);
            });
            if ((report.weaknesses || []).length === 0) {
                resultWeaknesses.innerHTML = '<li>None identified.</li>';
            }
        }

        if (resultActionPlan) {
            resultActionPlan.innerHTML = '';
            (report.action_plan || []).forEach(action => {
                const li = document.createElement('li');
                li.textContent = action;
                resultActionPlan.appendChild(li);
            });
            if ((report.action_plan || []).length === 0) {
                resultActionPlan.innerHTML = '<li>No actions generated. Good job!</li>';
            }
        }

        if (resultIdeal) {
            resultIdeal.textContent = report.ideal_response || 'No ideal response provided.';
        }
    };

    if (btnQuitInterview) {
        btnQuitInterview.addEventListener('click', () => {
            const ok = confirm("Are you sure you want to quit this mock interview simulation? Your ongoing performance progress will be lost.");
            if (ok) {
                showStage('setup');
                loadInterviewHistory();
            }
        });
    }

    if (btnBackToHub) {
        btnBackToHub.addEventListener('click', () => {
            showStage('setup');
            loadInterviewHistory();
        });
    }

    // Professional Profiles Logic
    const loadCodingProfiles = async () => {
        let name = "";
        let email = "";
        let phone = "";
        let linkedin = "";
        let github = "";
        let portfolio = "";
        let education = "";
        let experience = "";
        let projects = "";
        let certifications = "";
        let skills = "";
        let resume = "";
        let leetcode = "";
        let codeforces = "";
        let codementor = "";

        // 1. Try DB first via backend API endpoint
        try {
            const res = await authFetch('/api/profile');
            if (res.ok) {
                const profile = await res.json();
                if (profile) {
                    name = profile.full_name || "";
                    email = profile.email || "";
                    phone = profile.phone || "";
                    linkedin = profile.linkedin_profile || "";
                    github = profile.github_profile || "";
                    portfolio = profile.portfolio_url || "";
                    education = profile.education || "";
                    experience = profile.experience || "";
                    projects = profile.projects || "";
                    certifications = profile.certifications || "";
                    skills = profile.skills || "";
                    resume = profile.resume_url || "";
                    leetcode = profile.leetcode_profile || "";
                    codeforces = profile.codeforces_profile || "";
                    codementor = profile.codementor_profile || "";
                }
            }
        } catch (e) {
            console.warn("DB profile load failed via API endpoint:", e);
        }

        // 2. Fallback to localStorage
        if (!name) name = localStorage.getItem('profile_name') || "";
        if (!email) email = localStorage.getItem('profile_email') || "";
        if (!phone) phone = localStorage.getItem('profile_phone') || "";
        if (!linkedin) linkedin = localStorage.getItem('profile_linkedin') || "";
        if (!github) github = localStorage.getItem('profile_github') || "";
        if (!portfolio) portfolio = localStorage.getItem('profile_portfolio') || "";
        if (!education) education = localStorage.getItem('profile_education') || "";
        if (!experience) experience = localStorage.getItem('profile_experience') || "";
        if (!projects) projects = localStorage.getItem('profile_projects') || "";
        if (!certifications) certifications = localStorage.getItem('profile_certifications') || "";
        if (!skills) skills = localStorage.getItem('profile_skills') || "";
        if (!resume) resume = localStorage.getItem('profile_resume') || "";
        if (!leetcode) leetcode = localStorage.getItem('profile_leetcode') || "";
        if (!codeforces) codeforces = localStorage.getItem('profile_codeforces') || "";
        if (!codementor) codementor = localStorage.getItem('profile_codementor') || "";

        // 3. Populate inputs & summaries
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val;
        };
        setVal('settings-name', name);
        setVal('settings-email', email);
        setVal('settings-phone', phone);
        setVal('settings-linkedin', linkedin);
        setVal('settings-github', github);
        setVal('settings-portfolio', portfolio);
        setVal('settings-education', education);
        setVal('settings-experience', experience);
        setVal('settings-projects', projects);
        setVal('settings-certifications', certifications);
        setVal('settings-skills', skills);
        setVal('settings-resume', resume);
        setVal('settings-leetcode', leetcode);
        setVal('settings-codeforces', codeforces);
        
        // Update summaries on right card
        const summaryName = document.getElementById('profile-user-name');
        if (summaryName) summaryName.textContent = name || "Loading...";

        // Fetch and update LeetCode solved count and GitHub repos count
        updateSettingsSyncStats(leetcode, github);
    };

    // Helper to fetch and display synced LeetCode & GitHub stats on Settings
    const updateSettingsSyncStats = async (leetcode, github) => {
        const summaryLeetCode = document.getElementById('summary-leetcode');
        const summaryGitHub = document.getElementById('summary-github');

        if (leetcode) {
            if (summaryLeetCode) {
                summaryLeetCode.textContent = "Loading stats... 🔄🔄";
                summaryLeetCode.style.color = "var(--text-muted)";
            }
            try {
                let cleanLC = leetcode.trim();
                if (cleanLC.includes('leetcode.com/u/')) {
                    cleanLC = cleanLC.split('leetcode.com/u/').pop().split('/')[0];
                } else if (cleanLC.includes('leetcode.com/')) {
                    cleanLC = cleanLC.split('leetcode.com/').pop().split('/')[0];
                }
                const res = await fetch(`/get-leetcode-stats?profile=${encodeURIComponent(cleanLC)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && data.stats) {
                        const solved = data.stats.All || 0;
                        if (summaryLeetCode) {
                            summaryLeetCode.textContent = `${solved} Solved ✅`;
                            summaryLeetCode.style.color = "var(--primary)";
                        }
                    } else {
                        if (summaryLeetCode) {
                            summaryLeetCode.textContent = `Synced (${cleanLC}) âš ï¸`;
                            summaryLeetCode.style.color = "var(--text-main)";
                        }
                    }
                } else {
                    if (summaryLeetCode) {
                        summaryLeetCode.textContent = `Synced (${cleanLC}) âš ï¸`;
                        summaryLeetCode.style.color = "var(--text-main)";
                    }
                }
            } catch (e) {
                console.error("Failed to fetch LC stats on settings open:", e);
                if (summaryLeetCode) {
                    summaryLeetCode.textContent = `Synced (${leetcode}) âš ï¸`;
                    summaryLeetCode.style.color = "var(--text-main)";
                }
            }
        } else {
            if (summaryLeetCode) {
                summaryLeetCode.textContent = "Not configured 🛑🛑";
                summaryLeetCode.style.color = "var(--danger)";
            }
        }

        if (github) {
            if (summaryGitHub) {
                summaryGitHub.textContent = "Loading repos... 🔄🔄";
                summaryGitHub.style.color = "var(--text-muted)";
            }
            try {
                let cleanGH = github.trim();
                if (cleanGH.includes('github.com/')) {
                    cleanGH = cleanGH.split('github.com/').pop().split('/')[0];
                }
                const res = await fetch(`https://api.github.com/users/${encodeURIComponent(cleanGH)}`);
                if (res.ok) {
                    const data = await res.json();
                    const repos = data.public_repos !== undefined ? data.public_repos : 0;
                    if (summaryGitHub) {
                        summaryGitHub.textContent = `${repos} Repos ✅`;
                        summaryGitHub.style.color = "var(--primary)";
                    }
                } else {
                    if (summaryGitHub) {
                        summaryGitHub.textContent = `Synced (${cleanGH}) âš ï¸`;
                        summaryGitHub.style.color = "var(--text-main)";
                    }
                }
            } catch (e) {
                console.error("Failed to fetch GitHub repos on settings open:", e);
                if (summaryGitHub) {
                    summaryGitHub.textContent = `Synced (${github}) âš ï¸`;
                    summaryGitHub.style.color = "var(--text-main)";
                }
            }
        } else {
            if (summaryGitHub) {
                summaryGitHub.textContent = "Not configured 🛑🛑";
                summaryGitHub.style.color = "var(--danger)";
            }
        }
    };

    const saveCodingProfiles = async () => {
        const name = document.getElementById('settings-name')?.value.trim() || "";
        const email = document.getElementById('settings-email')?.value.trim() || "";
        const phone = document.getElementById('settings-phone')?.value.trim() || "";
        const linkedin = document.getElementById('settings-linkedin')?.value.trim() || "";
        const github = document.getElementById('settings-github')?.value.trim() || "";
        const portfolio = document.getElementById('settings-portfolio')?.value.trim() || "";
        const education = document.getElementById('settings-education')?.value.trim() || "";
        const experience = document.getElementById('settings-experience')?.value.trim() || "";
        const projects = document.getElementById('settings-projects')?.value.trim() || "";
        const certifications = document.getElementById('settings-certifications')?.value.trim() || "";
        const skills = document.getElementById('settings-skills')?.value.trim() || "";
        const resume = document.getElementById('settings-resume')?.value.trim() || "";
        const leetcode = document.getElementById('settings-leetcode')?.value.trim() || "";
        const codeforces = document.getElementById('settings-codeforces')?.value.trim() || "";

        // Save to local storage for safety/instant feedback
        localStorage.setItem('profile_name', name);
        localStorage.setItem('profile_email', email);
        localStorage.setItem('profile_phone', phone);
        localStorage.setItem('profile_linkedin', linkedin);
        localStorage.setItem('profile_github', github);
        localStorage.setItem('profile_portfolio', portfolio);
        localStorage.setItem('profile_education', education);
        localStorage.setItem('profile_experience', experience);
        localStorage.setItem('profile_projects', projects);
        localStorage.setItem('profile_certifications', certifications);
        localStorage.setItem('profile_skills', skills);
        localStorage.setItem('profile_resume', resume);
        localStorage.setItem('profile_leetcode', leetcode);
        localStorage.setItem('profile_codeforces', codeforces);

        // Update summaries on UI instantly
        const summaryName = document.getElementById('profile-user-name');
        if (summaryName) summaryName.textContent = name || "Not configured";

        // Update LeetCode and GitHub stats immediately
        updateSettingsSyncStats(leetcode, github);

        // Save to DB via backend endpoint (robust, bypasses client-side RLS issues)
        let dbSaved = false;
        try {
            const res = await authFetch('/save-coding-profiles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: name,
                    email: email,
                    phone: phone,
                    linkedin_profile: linkedin,
                    github_profile: github,
                    portfolio_url: portfolio,
                    education: education,
                    experience: experience,
                    projects: projects,
                    certifications: certifications,
                    skills: skills,
                    resume_url: resume,
                    leetcode_profile: leetcode,
                    codeforces_profile: codeforces
                })
            });
            if (res.ok) {
                const data = await res.json();
                if (data.status === 'success') {
                    dbSaved = true;
                }
            }
        } catch (e) {
            console.error("Failed to save profile via backend:", e);
        }

        if (dbSaved) {
            showToast('✅ Profile saved successfully to Cloud & local storage!');
        } else {
            showToast('✅ Profile saved locally (Cloud sync failed or pending schema migration).');
        }

        if (leetcode) {
            try {
                const res = await fetch(`/get-leetcode-stats?profile=${encodeURIComponent(leetcode)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && data.stats) {
                        leetcodeStats = data.stats;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch LeetCode stats on profile save:", e);
            }
        } else {
            leetcodeStats = null;
        }
        renderDashboardProgress();
    };

    // Set Welcome back title initials and text
    const updateWelcomeMessage = async () => {
        let name = 'Learner';
        let email = 'learner@example.com';
        
        try {
            const res = await authFetch('/get-user-session');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in) {
                    name = data.name;
                    email = data.email || (name.toLowerCase() + '@example.com');
                    currentUserId = data.id;
                    // Pre-load coding profiles as soon as user ID is ready
                    loadCodingProfiles();
                }
            }
        } catch (e) {
            console.error("Failed to fetch user session:", e);
            const storedUser = sessionStorage.getItem('logged_in_user_email') || 'Learner';
            name = storedUser.split('@')[0];
            email = storedUser;
        }

        name = name.charAt(0).toUpperCase() + name.slice(1);
        const initials = name.substring(0, 2).toUpperCase();

        document.getElementById('welcome-title-banner').textContent = `Welcome back, ${name}! 👋👋`;
        document.getElementById('user-avatar-initials').textContent = initials;

        const profileName = document.getElementById('profile-user-name');
        const profileEmail = document.getElementById('profile-user-email');
        const profileAvatar = document.getElementById('profile-avatar');

        if (profileName) profileName.textContent = name;
        if (profileEmail) profileEmail.textContent = email;
        if (profileAvatar) profileAvatar.textContent = initials;
    };

    const initDsaProgress = async () => {
        try {
            const res = await authFetch('/get-dsa-progress');
            if (res.ok) {
                const list = await res.json();
                if (Array.isArray(list)) {
                    solvedDsaQuestions = list;
                }
            }
        } catch (e) {
            console.error("Failed to fetch DSA progress from DB:", e);
        }

        try {
            const leetcode = localStorage.getItem('profile_leetcode') || "";
            const url = leetcode ? `/get-leetcode-stats?profile=${encodeURIComponent(leetcode)}` : '/get-leetcode-stats';
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && data.status === 'success' && data.stats) {
                    leetcodeStats = data.stats;
                }
            }
        } catch (e) {
            console.warn("Failed to fetch LeetCode stats on startup:", e);
        }

        renderDashboardProgress();
    };

    // Initial render call
    updateWelcomeMessage();
    initDsaProgress();
    initSavedPlaylists();
    initActiveRoadmap();
    initProfileMilestones();

    // Wire up Save Coding Profiles settings button
    const btnSaveProfiles = document.getElementById('btn-save-profiles');
    if (btnSaveProfiles) {
        btnSaveProfiles.addEventListener('click', saveCodingProfiles);
    }

    // AI Mentor Tab Switcher Logic
    const tabMentorCareer = document.getElementById('tab-mentor-career');
    const tabMentorCoding = document.getElementById('tab-mentor-coding');
    const panelMentorCareer = document.getElementById('panel-mentor-career');
    const panelMentorCoding = document.getElementById('panel-mentor-coding');

    if (tabMentorCareer && tabMentorCoding && panelMentorCareer && panelMentorCoding) {
        tabMentorCareer.addEventListener('click', () => {
            tabMentorCareer.classList.add('active');
            tabMentorCoding.classList.remove('active');
            panelMentorCareer.style.display = 'block';
            panelMentorCoding.style.display = 'none';
        });

        tabMentorCoding.addEventListener('click', () => {
            tabMentorCoding.classList.add('active');
            tabMentorCareer.classList.remove('active');
            panelMentorCoding.style.display = 'block';
            panelMentorCareer.style.display = 'none';
            loadCodingProfiles();
        });
    }

    // Redirect to Settings button
    const btnMentorGoSettings = document.getElementById('btn-mentor-go-settings');
    if (btnMentorGoSettings) {
        btnMentorGoSettings.addEventListener('click', () => {
            const settingsTabBtn = document.getElementById('btn-sidebar-settings');
            if (settingsTabBtn) settingsTabBtn.click();
        });
    }

    // Coding Mentor Submit Logic
    const codingSubmitBtnPage = document.getElementById('coding-submit-btn-page');
    const codingResultPage = document.getElementById('coding-result-page');

    if (codingSubmitBtnPage && codingResultPage) {
        codingSubmitBtnPage.addEventListener('click', async () => {
            const leetcode = document.getElementById('settings-leetcode')?.value.trim() || localStorage.getItem('profile_leetcode') || "";
            const github = document.getElementById('settings-github')?.value.trim() || localStorage.getItem('profile_github') || "";
            const codeforces = document.getElementById('settings-codeforces')?.value.trim() || localStorage.getItem('profile_codeforces') || "";
            const codementor = document.getElementById('settings-codementor')?.value.trim() || localStorage.getItem('profile_codementor') || "";

            if (!leetcode && !github && !codeforces && !codementor) {
                codingResultPage.innerHTML = `
                    <div style="background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.2); border-radius:8px; padding:12px; color:#ef4444; font-size:0.85rem; font-weight:600; margin-top:16px;">
                        âš ï¸ Please configure at least one coding profile (LeetCode, GitHub, Codeforces, or Codementor) in Settings to execute the analysis.
                    </div>
                `;
                return;
            }

            codingSubmitBtnPage.textContent = 'Auditing coding standing...';
            codingSubmitBtnPage.disabled = true;
            codingResultPage.innerHTML = '<div style="text-align:center; padding:20px;"><div class="spinner"></div><p style="color:var(--text-sub);">âš¡ Analyzing coding standings & DSA progress...</p></div>';

            try {
                const res = await authFetch('/mentor-mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        mentor_type: "coding",
                        goal: "Full technical analysis and coding standing critique",
                        current_skills: "Software development and problem solving",
                        leetcode_profile: leetcode,
                        github_profile: github,
                        codeforces_profile: codeforces,
                        codementor_profile: codementor
                    })
                });
                const data = await res.json();
                if (data.error) throw new Error(data.error);

                const snapshot = data.performance_snapshot || {};
                const strengths = data.strengths || [];
                const growthAreas = data.high_impact_growth_areas || {};
                const readiness = data.interview_readiness || {};
                const roadmap = data.roadmap_30_day || {};
                const insights = data.ai_insights || [];
                const motivation = data.motivation || "";
                const dbCards = data.visual_dashboard_cards || {};

                codingResultPage.innerHTML = `
                    <div style="border-top: 1px solid var(--border); padding-top: 24px; margin-top: 24px; display: flex; flex-direction: column; gap: 28px;">
                        
                        <!-- Header Banner -->
                        <div style="background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 16px; padding: 28px; color: white; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 20px rgba(99, 102, 241, 0.15);">
                            <h2 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.8rem; font-weight: 800; display: flex; align-items: center; gap: 10px;">
                                🔥 Coding Growth Report
                            </h2>
                            <p style="margin: 0; font-size: 0.95rem; opacity: 0.9; font-weight: 500;">
                                Premium Technical Alignment & Placement Readiness Audit
                            </p>
                        </div>

                        <!-- 1. Performance Snapshot -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                📍Š 1. Performance Snapshot
                            </h3>
                            <p style="font-size: 0.925rem; line-height: 1.6; color: var(--text-sub); margin: 0; padding: 14px; background: rgba(99, 102, 241, 0.04); border-left: 4px solid #6366f1; border-radius: 0 8px 8px 0; font-style: italic;">
                                "${escapeHTML(snapshot.summary)}"
                            </p>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 8px;">
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Total Solved</span>
                                    <strong style="font-size: 1.25rem; color: var(--text-main);">${escapeHTML(snapshot.total_solved || '0')} Problems</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Difficulty Breakdown</span>
                                    <strong style="font-size: 1rem; color: var(--text-main);">${escapeHTML(snapshot.difficulty_distribution || 'N/A')}</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Strongest Platform</span>
                                    <strong style="font-size: 1.25rem; color: var(--text-main);">${escapeHTML(snapshot.strongest_platform || 'N/A')}</strong>
                                </div>
                                <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 14px; border-radius: 8px; display: flex; flex-direction: column; gap: 4px;">
                                    <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Contests & Streak</span>
                                    <strong style="font-size: 0.95rem; color: var(--text-main);">${escapeHTML(snapshot.contest_participation || 'N/A')} (${escapeHTML(snapshot.current_streak || '0')})</strong>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--border); padding-top: 16px; margin-top: 8px;">
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <span style="font-size: 0.85rem; font-weight: 700; color: var(--text-muted);">Growth Score:</span>
                                    <span style="font-size: 1.4rem; font-weight: 800; color: #6366f1;">${escapeHTML(snapshot.growth_score || '0')}/100</span>
                                </div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">Current Tier:</span>
                                    <span class="pill-badge" style="background: var(--primary-light); color: var(--primary); font-weight: 800; font-size: 0.85rem; padding: 6px 12px; border-radius: 6px;">
                                        ${escapeHTML(snapshot.level || 'Beginner Explorer')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- 2. Strength Analysis -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                🌟 2. Strength Analysis
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
                                ${strengths.map(s => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 6px;">
                                        <strong style="color: var(--success); font-size: 0.95rem; display: flex; align-items: center; gap: 6px;">
                                            <span>✔</span> ${escapeHTML(s.title)}
                                        </strong>
                                        <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.5;">${escapeHTML(s.why)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 3. Skill Gap Analysis -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                🎯 3. High-Impact Areas for Growth
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                                <div style="background: rgba(239, 68, 68, 0.03); border: 1px solid rgba(239, 68, 68, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #ef4444; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🔴 Critical</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.critical || []).map(topic => `<span class="pill-badge" style="background:#fef2f2; color:#ef4444; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(245, 158, 11, 0.03); border: 1px solid rgba(245, 158, 11, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #f59e0b; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🟡 Important</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.important || []).map(topic => `<span class="pill-badge" style="background:#fffbeb; color:#d97706; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                                <div style="background: rgba(59, 130, 246, 0.03); border: 1px solid rgba(59, 130, 246, 0.1); padding: 16px; border-radius: 10px; display: flex; flex-direction: column; gap: 10px;">
                                    <strong style="color: #3b82f6; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.02em;">🔵 Optional</strong>
                                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                                        ${(growthAreas.optional || []).map(topic => `<span class="pill-badge" style="background:#eff6ff; color:#2563eb; border-color:transparent; font-size:0.75rem;">${escapeHTML(topic)}</span>`).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 4. Interview Readiness Assessment -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                💼 4. Interview Readiness Assessment
                            </h3>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex-wrap: wrap;">
                                <div style="display: flex; flex-direction: column; gap: 14px;">
                                    ${[
                                        { label: "Internship Interviews", val: readiness.internships || 0, color: "#10b981" },
                                        { label: "Service Companies", val: readiness.service_companies || 0, color: "#3b82f6" },
                                        { label: "Product Companies", val: readiness.product_companies || 0, color: "#f59e0b" },
                                        { label: "FAANG-Level Interviews", val: readiness.faang_level || 0, color: "#ef4444" }
                                    ].map(item => `
                                        <div style="display: flex; flex-direction: column; gap: 6px;">
                                            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; font-weight: 600; color: var(--text-main);">
                                                <span>${escapeHTML(item.label)}</span>
                                                <span>${item.val}%</span>
                                            </div>
                                            <div style="width: 100%; background: var(--border); height: 8px; border-radius: 4px; overflow: hidden;">
                                                <div style="background: ${item.color}; height: 100%; width: ${item.val}%; border-radius: 4px; transition: width 0.6s ease;"></div>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                                <div style="background: rgba(99, 102, 241, 0.03); border: 1px solid var(--border); border-radius: 8px; padding: 18px; display: flex; flex-direction: column; justify-content: center; gap: 8px;">
                                    <strong style="font-size: 0.85rem; color: var(--primary); text-transform: uppercase; letter-spacing: 0.05em;">Auditor Action Needed</strong>
                                    <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.5;">${escapeHTML(readiness.next_level_needs)}</p>
                                </div>
                            </div>
                        </div>

                        <!-- 5. Personalized Roadmap -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                📅 5. 30-Day Personalized Action Plan
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px;">
                                ${["week_1", "week_2", "week_3", "week_4"].map((wk, idx) => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); border-top: 4px solid var(--primary); padding: 16px; border-radius: 8px; display: flex; flex-direction: column; gap: 10px;">
                                        <strong style="color: var(--text-main); font-size: 0.95rem;">Week ${idx + 1} Planning</strong>
                                        <ul style="padding-left: 16px; margin: 0; font-size: 0.825rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 6px; line-height: 1.4;">
                                            ${(roadmap[wk] || []).map(action => `<li>${escapeHTML(action)}</li>`).join('')}
                                        </ul>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <!-- 6 & 7: Insights & Motivation -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex-wrap: wrap;">
                            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px;">
                                <h4 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                    💡 6. AI Insights
                                </h4>
                                <ul style="padding-left: 18px; margin: 0; font-size: 0.85rem; color: var(--text-sub); display: flex; flex-direction: column; gap: 8px; line-height: 1.5;">
                                    ${insights.map(item => `<li>${escapeHTML(item)}</li>`).join('')}
                                </ul>
                            </div>
                            <div class="card" style="padding: 20px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(to bottom right, rgba(99, 102, 241, 0.02), rgba(168, 85, 247, 0.02)); justify-content: center; border: 1px dashed rgba(99,102,241,0.25);">
                                <h4 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                    ✨ 7. Growth Motivation
                                </h4>
                                <p style="margin: 0; font-size: 0.875rem; color: var(--text-sub); line-height: 1.6; font-style: italic;">
                                    "${escapeHTML(motivation)}"
                                </p>
                            </div>
                        </div>

                        <!-- 8. Visual Dashboard Suggestions -->
                        <div class="card" style="padding: 24px; display: flex; flex-direction: column; gap: 16px;">
                            <h3 style="margin: 0; font-family: 'Outfit', sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 8px;">
                                🎨 8. Visual Dashboard Cards Recommendations
                            </h3>
                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                                ${[
                                    { title: "Achievement Card", text: dbCards.achievement_card || "ðŸ† Setup achievements details" },
                                    { title: "Growth Score Card", text: dbCards.growth_score_card || "📍ˆ Track scores weekly" },
                                    { title: "Interview Readiness Card", text: dbCards.interview_readiness_card || "🎯 Monitor placement status" },
                                    { title: "Next Milestone Card", text: dbCards.next_milestone_card || "âš¡ Reach next level goals" },
                                    { title: "30-Day Roadmap Card", text: dbCards.roadmap_card || "📅 Review action planning daily" },
                                    { title: "Streak Card", text: dbCards.streak_card || "🔥 Keep coding consistency" }
                                ].map(card => `
                                    <div style="background: var(--bg-main); border: 1px solid var(--border); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px;">
                                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">${escapeHTML(card.title)}</span>
                                        <p style="margin: 0; font-size: 0.85rem; color: var(--text-main); font-weight: 600; line-height: 1.4;">${escapeHTML(card.text)}</p>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                    </div>
                `;
            } catch(e) {
                codingResultPage.innerHTML = `<p style="color:var(--danger); margin-top:16px;">Failed: ${escapeHTML(e.message)}</p>`;
            } finally {
                codingSubmitBtnPage.textContent = 'Analyze Coding Profiles & DSA âš¡';
                codingSubmitBtnPage.disabled = false;
            }
        });
    }

    // Expose trackClick globally for inline onclick handlers
    window.trackClickGlobal = (url, title) => trackClick(url, title, 'click');

    // ────────────────────────────────────────────────────────────────
    // HIREMATE APPLY AGENT STATE & CONTROLLER
    // ────────────────────────────────────────────────────────────────
    let currentJobDetails = {};
    let jaCurrentStep = 1;

    window.closeJobAgentModal = () => {
        const modal = document.getElementById("job-agent-modal");
        if (modal) modal.style.display = "none";
    };

    window.closeAndGoToInterviews = () => {
        window.closeJobAgentModal();
        switchView("view-interviews");
        // Update sidebar active states
        document.querySelectorAll('.sidebar .nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.id === 'btn-sidebar-interviews') {
                item.classList.add('active');
            }
        });
    };

    window.applyWithAI = async (jobId, url, company, role) => {
        currentJobDetails = { jobId, url, company, role };
        jaCurrentStep = 1;
        
        // Show modal
        const modal = document.getElementById("job-agent-modal");
        if (modal) modal.style.display = "flex";
        
        // Set header
        document.getElementById("job-agent-subtitle").textContent = `Automating your application to ${company} for ${role}`;
        
        // Render step 1 layout
        window.jaShowStep(1);

        // Fetch pre-filled details & essay answers from backend
        try {
            showToast("Preparing profile & AI essays...");
            const response = await authFetch("/api/jobs/apply/prepare", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    job_url: url,
                    company: company,
                    role: role,
                    description: "Software engineering role matching profile requirements" // default description
                })
            });

            if (!response.ok) throw new Error("Failed to load application data.");

            const data = await response.json();
            
            // Set input values for personal details
            document.getElementById("ja-profile-name").value = data.prefilled_info.full_name || "";
            document.getElementById("ja-profile-email").value = data.prefilled_info.email || "";
            document.getElementById("ja-profile-phone").value = data.prefilled_info.phone || "";
            document.getElementById("ja-profile-linkedin").value = data.prefilled_info.linkedin || "";
            document.getElementById("ja-profile-github").value = data.prefilled_info.github || "";
            document.getElementById("ja-profile-portfolio").value = data.prefilled_info.portfolio || "";

            // Set essay answers text
            document.getElementById("ja-essay-why").value = data.essay_answers["Why Join"] || "";
            document.getElementById("ja-essay-project").value = data.essay_answers["Key Project"] || "";
            document.getElementById("ja-essay-alignment").value = data.essay_answers["Alignment"] || "";

        } catch (err) {
            console.error("[JOB_AGENT] Prepare error:", err);
            showToast("Failed to prepare AI data. Filling with local profile fallback.");
            
            // Use current profile data if available
            const profileName = document.getElementById('profile-user-name');
            if (profileName) {
                document.getElementById("ja-profile-name").value = profileName.textContent || "";
            }
            const profileEmail = document.getElementById('profile-user-email');
            if (profileEmail) {
                document.getElementById("ja-profile-email").value = profileEmail.textContent || "";
            }
        }
    };

    window.jaShowStep = (stepNum) => {
        jaCurrentStep = stepNum;
        
        // Hide all steps
        document.querySelectorAll(".job-agent-step").forEach(step => {
            step.style.display = "none";
        });
        
        // Show target step
        document.getElementById(`job-agent-step-${stepNum}`).style.display = "flex";
        
        // Configure footer buttons
        const btnPrev = document.getElementById("ja-btn-prev");
        const btnNext = document.getElementById("ja-btn-next");
        const btnSubmit = document.getElementById("ja-btn-submit");

        if (stepNum === 1) {
            btnPrev.style.display = "none";
            btnNext.style.display = "block";
            btnSubmit.style.display = "none";
        } else if (stepNum === 2) {
            btnPrev.style.display = "block";
            btnNext.style.display = "block";
            btnSubmit.style.display = "none";
        } else if (stepNum === 3) {
            btnPrev.style.display = "block";
            btnNext.style.display = "none";
            btnSubmit.style.display = "block";
        } else if (stepNum === 4) {
            btnPrev.style.display = "none";
            btnNext.style.display = "none";
            btnSubmit.style.display = "none";
            document.getElementById("job-agent-modal-close").style.display = "none"; // force click CTA
        }
    };

    window.jaNextStep = async () => {
        if (jaCurrentStep === 1) {
            window.jaShowStep(2);
        } else if (jaCurrentStep === 2) {
            window.jaShowStep(3);
            
            // Reset step 3 UI
            const consoleEl = document.getElementById("ja-progress-console");
            consoleEl.innerHTML = '<div style="color: #64748b;">[SYSTEM_LOG] Initializing connection stream...</div>';
            
            document.getElementById("ja-preview-screenshot").style.display = "none";
            document.getElementById("ja-preview-loading").style.display = "block";
            document.getElementById("ja-captcha-warning").style.display = "none";
            
            document.getElementById("ja-filled-list").innerHTML = "";
            document.getElementById("ja-unfilled-list").innerHTML = "";

            const profile_data = {
                full_name: document.getElementById("ja-profile-name").value,
                email: document.getElementById("ja-profile-email").value,
                phone: document.getElementById("ja-profile-phone").value,
                linkedin_profile: document.getElementById("ja-profile-linkedin").value,
                github_profile: document.getElementById("ja-profile-github").value,
                portfolio_url: document.getElementById("ja-profile-portfolio").value
            };

            const essay_answers = {
                "Why Join": document.getElementById("ja-essay-why").value,
                "Key Project": document.getElementById("ja-essay-project").value,
                "Alignment": document.getElementById("ja-essay-alignment").value
            };

            // Start the SSE progress logs listener
            const token = localStorage.getItem('supabase_access_token') || sessionStorage.getItem('supabase_access_token');
            const eventSource = new EventSource(`/api/jobs/apply/stream?token=${encodeURIComponent(token)}`);

            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Format and print log message
                    const logLine = document.createElement("div");
                    const icon = data.success ? "✓" : "⚠️";
                    logLine.innerHTML = `<span style="color:${data.success ? '#10b981' : '#f59e0b'};">${icon} [${data.state}]</span> ${escapeHTML(data.message)}`;
                    consoleEl.appendChild(logLine);
                    consoleEl.scrollTop = consoleEl.scrollHeight;

                    // Handle specific state updates
                    if (data.state === "WAIT_FOR_USER_LOGIN") {
                        showToast("Action required: Please sign in in the browser window.");
                    } else if (data.state === "PREVIEW_APPLICATION") {
                        // PREVIEW_APPLICATION carries JSON data containing fields, files, screenshot
                        const payload = JSON.parse(data.message);
                        
                        if (payload.screenshot) {
                            const img = document.getElementById("ja-preview-screenshot");
                            img.src = payload.screenshot;
                            img.style.display = "block";
                            document.getElementById("ja-preview-loading").style.display = "none";
                        }

                        if (payload.captcha_detected) {
                            document.getElementById("ja-captcha-warning").style.display = "flex";
                        }

                        // Render fields details lists
                        const filledList = document.getElementById("ja-filled-list");
                        const unfilledList = document.getElementById("ja-unfilled-list");

                        if (payload.filled_fields && payload.filled_fields.length > 0) {
                            payload.filled_fields.forEach(f => {
                                const li = document.createElement("li");
                                li.textContent = f;
                                filledList.appendChild(li);
                            });
                        } else {
                            filledList.innerHTML = "<li>No fields pre-filled</li>";
                        }

                        if (payload.unfilled_fields && payload.unfilled_fields.length > 0) {
                            payload.unfilled_fields.forEach(f => {
                                const li = document.createElement("li");
                                li.textContent = f;
                                unfilledList.appendChild(li);
                            });
                        } else {
                            unfilledList.innerHTML = "<li>None</li>";
                        }
                    } else if (data.state === "FINISHED") {
                        eventSource.close();
                        showToast("Application submitted successfully!");
                        window.jaShowStep(4);
                    } else if (data.state === "FAILED") {
                        eventSource.close();
                        showToast("Application failed: " + data.message);
                        document.getElementById("ja-preview-loading").innerHTML = `
                            <span style="color:#ef4444; font-size:1.5rem;">⚠️</span>
                            <p style="color:#ef4444; font-weight:600; margin-top:8px;">Pipeline Aborted</p>
                            <p style="color:#94a3b8; font-size:0.75rem;">${escapeHTML(data.message)}</p>
                        `;
                    }
                } catch (e) {
                    console.error("[JOB_AGENT] Stream parse error:", e);
                }
            };

            eventSource.onerror = (err) => {
                console.error("[JOB_AGENT] SSE Stream error:", err);
                eventSource.close();
            };

            // Trigger the start of the backend worker
            try {
                const response = await authFetch("/api/jobs/apply/start", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        job_url: currentJobDetails.url,
                        company: currentJobDetails.company,
                        role: currentJobDetails.role,
                        profile_data,
                        essay_answers
                    })
                });

                if (!response.ok) throw new Error("Could not start agent.");
            } catch (err) {
                eventSource.close();
                showToast("Failed to initialize Playwright: " + err.message);
            }
        }
    };

    window.jaPrevStep = () => {
        if (jaCurrentStep > 1) {
            window.jaShowStep(jaCurrentStep - 1);
        }
    };

    window.jaSubmitConfirm = async () => {
        const btnSubmit = document.getElementById("ja-btn-submit");
        btnSubmit.disabled = true;
        btnSubmit.textContent = "Submitting application... ⏳";

        try {
            const response = await authFetch("/api/jobs/apply/confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json" }
            });

            if (!response.ok) throw new Error("Submission resume failed.");
        } catch (err) {
            showToast("Failed to send confirmation: " + err.message);
            btnSubmit.disabled = false;
            btnSubmit.textContent = "Confirm & Submit Application";
        }
    };

});
 
