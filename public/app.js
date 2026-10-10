 
'use strict';

// ========================================
// COMPASS MOVIE BOX - UPGRADED FRONTEND
// ========================================

const $ = selector => document.querySelector(selector);

const api = async (url, options = {}) => {
    const response = await fetch(url, {
        credentials: 'same-origin',
        ...options
    });

    const contentType = response.headers.get('content-type') || '';

    if (!contentType.includes('application/json')) {
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        throw new Error(
            'The server returned HTML instead of JSON. Check the API route.'
        );
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed.');
    }

    return data;
};

// Safely escape values before inserting text into HTML.
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}

function movieImage(movie) {
    const poster = movie.poster_url || '';
    if (!poster) return '';

    if (poster.startsWith('/uploads/')) return poster;

    try {
        const parsed = new URL(poster, window.location.origin);

        if (
            parsed.protocol === 'http:' ||
            parsed.protocol === 'https:'
        ) {
            return parsed.href;
        }
    } catch {}

    return '';
}

function movieVideo(movie) {
    const video = movie.video_url || '';
    if (!video) return '';

    if (video.startsWith('/uploads/')) return video;

    try {
        const parsed = new URL(video, window.location.origin);

        if (
            parsed.protocol === 'http:' ||
            parsed.protocol === 'https:'
        ) {
            return parsed.href;
        }
    } catch {}

    return '';
}

// ========================================
// MOVIE CARDS
// ========================================

let movieCache = [];

function renderDiscoveryCard(movie) {
    const poster = movie.poster_url
        ? `<img src="${esc(movie.poster_url)}"
                alt="${esc(movie.title)}"
                loading="lazy"
                onerror="this.style.display='none'">`
        : '';

    return `
        <article class="discovery-card">
            <a class="discovery-poster"
               href="/watch.html?id=${encodeURIComponent(movie.id)}">
                ${poster}
                ${poster ? '' : '<span class="discovery-placeholder">🎬</span>'}
            </a>
            <div class="discovery-card-info">
                <h3>${esc(movie.title || 'Untitled Movie')}</h3>
                <p>${esc(movie.genre || 'Movie')}
                   ${movie.year ? ' · ' + esc(movie.year) : ''}</p>
                <a class="discovery-watch"
                   href="/watch.html?id=${encodeURIComponent(movie.id)}">
                    ▶ Watch Movie
                </a>
            </div>
        </article>
    `;
}

function renderDiscoverySections(movies) {
    if (!Array.isArray(movies)) return;

    const newestFirst = [...movies].sort((a, b) => {
        const dateA = Date.parse(a.created_at || '') || 0;
        const dateB = Date.parse(b.created_at || '') || 0;

        return dateB - dateA ||
            (Number(b.id) || 0) - (Number(a.id) || 0);
    });

const trending = [...newestFirst]
    .sort((a, b) =>
        (Number(b.views) || 0) - (Number(a.views) || 0)
    )
    .slice(0, 8);
    const recent = newestFirst.slice(0, 8);

    const trendingContainer = document.querySelector('#trendingMovies');
    const recentContainer = document.querySelector('#recentMovies');

    if (trendingContainer) {
        trendingContainer.innerHTML = trending.length
            ? trending.map(renderDiscoveryCard).join('')
            : '<p>No movies available yet.</p>';
    }

    if (recentContainer) {
        recentContainer.innerHTML = recent.length
            ? recent.map(renderDiscoveryCard).join('')
            : '<p>No movies available yet.</p>';
    }
}


function renderMovies(movies) {
    const grid = $('#movieGrid');

    if (!grid) {
        console.error(
            'Movie grid not found. Check for id="movieGrid" in index.html.'
        );
        return;
    }

    if (!movies.length) {
        grid.innerHTML = `
            <div class="empty-state">
                <h3>No movies found</h3>
                <p>
                    Try another search, or add a movie
                    from your admin dashboard.
                </p>
            </div>
        `;
        return;
    }

    grid.innerHTML = movies.map(movie => {
        const poster = movieImage(movie);
        const video = movieVideo(movie);

        const watchUrl = video
            ? `/watch.html?id=${encodeURIComponent(movie.id)}`
            : '';

        return `
            <article class="movie-card">
                <div class="movie-poster">
                    ${
                        poster
                            ? `
                                <img
                                    src="${esc(poster)}"
                                    alt="${esc(movie.title)} poster"
                                    loading="lazy"
                                    onerror="this.style.display='none'"
                                >
                            `
                            : `
                                <div class="poster-placeholder">
                                    <span>🎬</span>
                                    <strong>${esc(movie.title)}</strong>
                                </div>
                            `
                    }

                    <span class="movie-genre">
                        ${esc(movie.genre || 'Movie')}
                    </span>
                </div>

                <div class="movie-info">
                    <h3>${esc(movie.title)}</h3>

                    <p class="movie-meta">
                        ${
                            movie.year
                                ? esc(movie.year)
                                : 'Year unavailable'
                        }
                        ${movie.genre ? ` · ${esc(movie.genre)}` : ''}
                    </p>

                    <p class="movie-description">
                        ${esc(
                            movie.description ||
                            'Discover this movie on Compass Movie Box.'
                        )}
                    </p>

                    <div class="movie-actions">
                        ${
                            watchUrl
                                ? `
                                    <a
                                        class="watch-button"
                                        href="${esc(watchUrl)}"
                                    >
                                        ▶ Watch
                                    </a>
                                `
                                : `
                                    <button
                                        class="watch-button"
                                        type="button"
                                        disabled
                                    >
                                        Video unavailable
                                    </button>
                                `
                        }

                        ${
                            video
                                ? `
                                    <a
                                        class="download-button"
                                        href="/api/movies/${encodeURIComponent(movie.id)}/download"
                                    >
                                        ↓ Download
                                    </a>
                                `
                                : ''
                        }
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

// ========================================
// FEATURED MOVIE + YOUTUBE TRAILER
// ========================================

function getYouTubeId(videoUrl) {
    if (!videoUrl) return '';

    try {
        const url = new URL(videoUrl);
        let id = '';

        if (url.hostname === 'youtu.be') {
            id = url.pathname.split('/')[1] || '';
        } else if (
            [
                'youtube.com',
                'www.youtube.com',
                'm.youtube.com'
            ].includes(url.hostname)
        ) {
            if (url.pathname === '/watch') {
                id = url.searchParams.get('v') || '';
            } else if (
                url.pathname.startsWith('/embed/') ||
                url.pathname.startsWith('/shorts/')
            ) {
                id = url.pathname.split('/')[2] || '';
            }
        }

        return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : '';
    } catch {
        return '';
    }
}

function renderFeaturedMovie(movie) {
    const container = document.getElementById('featuredMovie');

    if (!container) return;

    if (!movie) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>No featured movie yet</h3>
                <p>Upload a movie through your admin dashboard.</p>
            </div>
        `;
        return;
    }

    const title = esc(movie.title || 'Untitled Movie');
    const description = esc(
        movie.description ||
        'Discover this movie on Compass Movie Box.'
    );
    const genre = esc(movie.genre || 'Movie');
    const year = esc(movie.year || '');
    const poster = movieImage(movie);
    const video = movieVideo(movie);
    const youtubeId = getYouTubeId(movie.video_url || '');

    let media = '';

    if (youtubeId) {
        media = `
            <div class="featured-trailer-video">
                <iframe
                    src="https://www.youtube-nocookie.com/embed/${youtubeId}"
                    title="${title} trailer"
                    loading="lazy"
                    allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    referrerpolicy="strict-origin-when-cross-origin"
                    allowfullscreen>
                </iframe>
            </div>
        `;
    } else {
        media = `
            <div class="featured-trailer-video">
                ${
                    poster
                        ? `
                            <img
                                src="${esc(poster)}"
                                alt="${title} poster"
                                loading="lazy"
                                style="width:100%;height:100%;object-fit:cover;"
                            >
                        `
                        : `
                            <div class="poster-placeholder">
                                <span>🎬</span>
                                <strong>${title}</strong>
                            </div>
                        `
                }
            </div>
        `;
    }

    const watchLink = video
        ? `
            <a
                href="/watch.html?id=${encodeURIComponent(movie.id)}"
                class="featured-primary-btn"
            >
                ▶ Watch Movie
            </a>
        `
        : '';

    const trailerLink = youtubeId
        ? `
            <a
                href="https://www.youtube.com/watch?v=${youtubeId}"
                target="_blank"
                rel="noopener noreferrer"
                class="featured-secondary-btn"
            >
                Open Trailer ↗
            </a>
        `
        : '';

    container.innerHTML = `
        <div class="featured-trailer-card">
            ${media}

            <div class="featured-trailer-info">
                <span class="featured-badge">FEATURED FILM</span>

                <h3>${title}</h3>

                <div class="featured-meta">
                    ${year ? `<span>${year}</span><span>•</span>` : ''}
                    <span>${genre}</span>
                </div>

                <p>${description}</p>

                <div class="featured-trailer-actions">
                    ${watchLink}
                    ${trailerLink}
                </div>
            </div>
        </div>
    `;
}

// ========================================
// LOAD MOVIES AND SEARCH
// ========================================

async function loadMovies() {
    const grid = $('#movieGrid');

    if (grid) {
        grid.innerHTML = `
            <p class="loading-message">Loading movies...</p>
        `;
    }

    try {
        const search = $('#search')?.value.trim() || '';
        const genre = $('#genreFilter')?.value || '';

        const params = new URLSearchParams();

        if (search) {
            params.set('search', search);
        }

        if (genre && genre.toLowerCase() !== 'all') {
            params.set('genre', genre);
        }

        const query = params.toString();

        // Fetch the movies matching the current search and genre.
        const movies = await api(
            '/api/movies' + (query ? `?${query}` : '')
        );

        if (!Array.isArray(movies)) {
            throw new Error(
                'The movies API did not return a movie list.'
            );
        }

        // Keep the complete list available for the featured movie.
        // Search and genre filters continue to control the movie grid.
        if (search || (genre && genre.toLowerCase() !== 'all')) {
            const allMovies = await api('/api/movies');

            if (!Array.isArray(allMovies)) {
                throw new Error(
                    'Could not load the complete movie list.'
                );
            }

            movieCache = allMovies;
        } else {
            movieCache = movies;
        }

        updateGenreOptions();
        renderMovies(movies);

        // Prefer a movie with a video URL.
        // If none has one, use the first uploaded movie.
        const featuredMovie =
            movieCache.find(movie => movie.video_url) ||
            movieCache[0] ||
            null;

        renderFeaturedMovie(featuredMovie);

    } catch (error) {
        console.error('Could not load movies:', error);

        if (grid) {
            grid.innerHTML = `
                <div class="empty-state">
                    <h3>Movies could not be loaded</h3>
                    <p>${esc(error.message)}</p>

                    <button
                        class="retry-button"
                        id="retryMovies"
                        type="button"
                    >
                        Try Again
                    </button>
                </div>
            `;

            $('#retryMovies')?.addEventListener(
                'click',
                loadMovies
            );
        }
    }
}

function updateGenreOptions() {
    const select = $('#genreFilter');

    if (!select) return;

    const previous = select.value;

    const genres = [...new Set(
        movieCache
            .map(movie => movie.genre)
            .filter(Boolean)
    )].sort();

    select.innerHTML = `
        <option value="all">All Genres</option>
        ${genres.map(genre => `
            <option value="${esc(genre)}">${esc(genre)}</option>
        `).join('')}
    `;

    if (genres.includes(previous)) {
        select.value = previous;
    }
}

// ========================================
// LOGIN AND REGISTRATION
// ========================================

async function refresh() {
    try {
        const result = await api('/api/me');
        const user = result.user || null;

        const loginSection = $('#loginSection');
        const adminSection = $('#adminSection');

        if (loginSection) {
            loginSection.hidden = Boolean(user);
        }

        if (adminSection) {
            adminSection.hidden = !user || user.role !== 'admin';
        }

        const account = $('#accountInfo');

        if (account) {
            account.textContent = user
                ? `Signed in as ${user.name || user.email}`
                : '';
        }

        if (user?.role === 'admin') {
            await loadAdmin();
        }
    } catch (error) {
        console.error('Could not refresh session:', error);
    }
}

async function submitAuth(form, endpoint) {
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
        const result = await api(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        alert(result.message || 'Success!');

        form.reset();
        await refresh();
    } catch (error) {
        alert(error.message);
    }
}

// Connect existing login and registration forms if present.
$('#loginForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth(event.currentTarget, '/api/login');
});

$('#registerForm')?.addEventListener('submit', event => {
    event.preventDefault();
    submitAuth(event.currentTarget, '/api/register');
});

// ========================================
// ADMIN DASHBOARD
// ========================================

async function loadAdmin() {
    try {
        const stats = await api('/api/admin/stats');

        const statsContainer = $('#stats');

        if (statsContainer) {
            statsContainer.innerHTML = `
                <div class="stat">
                    <strong>
                        ${esc(stats.movieCount ?? stats.movies ?? 0)}
                    </strong>
                    Movies
                </div>

                <div class="stat">
                    <strong>
                        ${esc(stats.userCount ?? stats.users ?? 0)}
                    </strong>
                    Users
                </div>
            `;
        }

        const users = await api('/api/admin/users');
        const usersContainer = $('#users');

        if (usersContainer && Array.isArray(users)) {
            usersContainer.innerHTML = users.map(user => `
                <div class="user-row">
                    <span>
                        ${esc(user.name)}
                        <br>
                        <small>
                            ${esc(user.email)} · ${esc(user.role)}
                        </small>
                    </span>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Could not load admin dashboard:', error);
    }
}

// ========================================
// ADMIN MOVIE UPLOAD
// ========================================

const movieForm = $('#movieForm');

movieForm?.addEventListener('submit', async event => {
    event.preventDefault();

    try {
        const formData = new FormData(movieForm);

        await api('/api/admin/movies', {
            method: 'POST',
            body: formData
        });

        alert('Movie uploaded successfully!');

        movieForm.reset();

        // Refresh the movie gallery and featured movie.
        await loadMovies();

        // Refresh the admin movie/user statistics.
        await loadAdmin();
    } catch (error) {
        alert('Movie upload failed: ' + error.message);
    }
});

// ========================================
// LOGOUT
// ========================================

$('#logoutButton')?.addEventListener('click', async () => {
    try {
        await api('/api/logout', {
            method: 'POST'
        });

        window.location.reload();
    } catch (error) {
        alert('Logout failed: ' + error.message);
    }
});

// ========================================
// SEARCH EVENTS
// ========================================

let searchTimeout;

$('#search')?.addEventListener('input', () => {
    clearTimeout(searchTimeout);

    searchTimeout = setTimeout(() => {
        loadMovies();
    }, 300);
});

$('#genreFilter')?.addEventListener('change', () => {
    loadMovies();
});

// ========================================
// START APPLICATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    await loadMovies();
    await refresh();
});
