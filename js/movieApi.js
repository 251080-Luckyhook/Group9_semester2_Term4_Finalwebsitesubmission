

const API_BASE = 'https://www.themoviedb.org/'; 
const AUTH_TOKEN_KEY = 'authToken'; 

async function apiFetch(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const headers = options.headers || {};
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const opts = { credentials: 'same-origin', ...options, headers };
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    const res = await fetch(url, opts);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
        const errBody = contentType.includes('application/json') ? await res.json() : await res.text();
        const err = new Error('API request failed');
        err.status = res.status;
        err.body = errBody;
        throw err;
    }
    if (contentType.includes('application/json')) return await res.json();
    return await res.text();
}

// API functions
async function fetchMovies({ query = '', page = 1, limit = 100 } = {}) { 
    // Prefer TMDB endpoints: search when query provided, otherwise fetch popular
    if (query && String(query).trim()) {
        const res = await tmdbSearchMovies(query, { page });
        return { movies: res.movies || [], page: res.page || 1, total: res.total || 0 };
    }
    const res = await tmdbGetPopular({ page, limit });
    return { movies: res.movies || [], page: res.page || 1, total: res.total || 0 };
}

async function getMovie(movieId) {
    return await apiFetch(`/movies/${encodeURIComponent(movieId)}`, { method: 'GET' });
}

async function submitRating(movieId, { score, review = '' }) {
    return await apiFetch(`/movies/${encodeURIComponent(movieId)}/ratings`, {
        method: 'POST',
        body: { score, review }
    });
}

async function createMovie(movieData) {
    return await apiFetch('/movies', { method: 'POST', body: movieData });
}

async function updateMovie(movieId, movieData) {
    return await apiFetch(`/movies/${encodeURIComponent(movieId)}`, { method: 'PUT', body: movieData });
}

async function deleteMovie(movieId) {
    return await apiFetch(`/movies/${encodeURIComponent(movieId)}`, { method: 'DELETE' });
}

async function fetchTopRated({ limit = 10 } = {}) {
    const q = new URLSearchParams({ limit });
    return await apiFetch(`/movies/top?${q.toString()}`, { method: 'GET' });
}


const TMDB = {
    apiKey: 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiYTM3ODg1MTFlYjYzYmY0ZmU4MWE4NmI3NzgwZTlmYSIsIm5iZiI6MTc1ODI5MjA0Mi45OCwic3ViIjoiNjhjZDY4NGFiMjI2ZjYwY2U0MzgyZTk4Iiwic2NvcGVzIjpbImFwaV9yZWFkIl0sInZlcnNpb24iOjF9.ubQd6o1nmbagajh3fZYqx7UZNByUOcVeyI3te35aSJ0',
    base: 'https://api.themoviedb.org/3',
    imageBase: 'https://image.tmdb.org/t/p',
    setApiKey(key) { this.apiKey = String(key || '').trim(); },
    buildUrl(path, params = {}) {
       
        const isBearer = !!(this.apiKey && String(this.apiKey).startsWith('eyJ'));
        const p = Object.assign({}, params);
        if (!isBearer && this.apiKey) p.api_key = this.apiKey;
        const q = new URLSearchParams(p);
        return `${this.base}${path}${q.toString() ? '?' + q.toString() : ''}`;
    }
};

async function tmdbFetch(path, params = {}) {
    const url = TMDB.buildUrl(path, params);
    const headers = {};
   
    if (TMDB.apiKey && String(TMDB.apiKey).startsWith('eyJ')) {
        headers['Authorization'] = `Bearer ${TMDB.apiKey}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) {
        const txt = await res.text();
        const err = new Error(`TMDB request failed: ${res.status}`);
        err.status = res.status;
        err.body = txt;
        throw err;
    }
    return res.json();
}

function tmdbGetImageUrl(path, size = 'w500') {
    if (!path) return null;
    return `${TMDB.imageBase}/${size}${path}`;
}

function mapTmdbToMovie(tmdb) {
    
    return {
        id: `tmdb_${tmdb.id}`,
        title: tmdb.title || tmdb.name || '',
        year: (tmdb.release_date || tmdb.first_air_date || '').slice(0,4),
        poster: tmdb.poster_path ? tmdbGetImageUrl(tmdb.poster_path, 'w342') : (tmdb.backdrop_path ? tmdbGetImageUrl(tmdb.backdrop_path, 'w780') : null),
        avgRating: tmdb.vote_average || null,
        ratingCount: tmdb.vote_count || 0,
        description: tmdb.overview || ''
    };
}

async function tmdbSearchMovies(query, { page = 1 } = {}) {
    if (!query) return { results: [], page: 1, total_results: 0, total_pages: 0 };
    const data = await tmdbFetch('/search/movie', { query, page, include_adult: false });
    return {
        movies: (data.results || []).map(mapTmdbToMovie),
        page: data.page,
        total: data.total_results,
        totalPages: data.total_pages
    };
}

async function tmdbGetMovieDetails(tmdbId) {
    const data = await tmdbFetch(`/movie/${encodeURIComponent(tmdbId)}`, { append_to_response: 'videos,images' });
    return mapTmdbToMovie(data);
}

async function tmdbGetPopular({ page = 1, limit = 20 } = {}) {
    const movies = [];
    let currentPage = page;
    let remaining = limit;
    while (remaining > 0 && currentPage <= 500) { // 
        const data = await tmdbFetch('/movie/popular', { page: currentPage });
        const pageMovies = (data.results || []).map(mapTmdbToMovie);
        const toTake = Math.min(remaining, pageMovies.length);
        movies.push(...pageMovies.slice(0, toTake));
        remaining -= toTake;
        if (pageMovies.length < 20) break; 
        currentPage++;
    }
    return {
        movies,
        page,
        total: movies.length 
    };
}

async function tmdbGetTopRated({ page = 1 } = {}) {
    const data = await tmdbFetch('/movie/top_rated', { page });
    return {
        movies: (data.results || []).map(mapTmdbToMovie),
        page: data.page,
        total: data.total_results
    };
}


function createMovieCard(movie) {
  
    const div = document.createElement('div');
    div.className = 'movie-card';
    div.dataset.movieId = movie.id;
    div.innerHTML = `
        <img class="movie-poster" src="${movie.poster || 'https://via.placeholder.com/400x240?text=No+Image'}" alt="${escapeHtml(movie.title)} poster">
        <div class="movie-info">
            <h3 class="movie-title">${escapeHtml(movie.title)}${movie.year ? ` · ${movie.year}` : ''}</h3>
            <div class="movie-rating">${movie.avgRating ? (Number(movie.avgRating).toFixed(1) + '*') : 'No rating' } ${movie.ratingCount ? `(${movie.ratingCount})` : ''}</div>
            <p class="movie-desc">${escapeHtml(movie.description || '')}</p>
            <div style="margin-top:8px;display:flex;gap:8px">
              <button class="btn-view" data-action="view">View</button>
              <button class="btn-rate" data-action="rate">Rate</button>
            </div>
        </div>
    `;
    return div;
}

function createMovieCardForHome(movie) {
    const div = document.createElement('div');
    div.className = 'movie-card';
   
    div.dataset.category = 'popular';
    div.dataset.movieId = movie.id;

    const rating5 = movie.avgRating ? (Number(movie.avgRating) / 2) : null; 
    const ratingText = rating5 ? `${rating5.toFixed(1)}*` : 'N/A';

    div.innerHTML = `
      <div class="movie-poster-placeholder">
        <img src="${movie.poster || 'https://via.placeholder.com/400x240?text=No+Image'}" alt="${escapeHtml(movie.title)} poster" style="width:100%;height:100%;object-fit:cover;border-radius:6px">
      </div>
      <div class="movie-info">
        <h2>${escapeHtml(movie.title)}</h2>
        <p>Rating: ${ratingText} ${movie.ratingCount ? `(${movie.ratingCount})` : ''}</p>
        <p>Description: ${escapeHtml((movie.description || '').slice(0, 140))}</p>
      </div>
    `;
    return div;
}

function createMovieCardForMoviesPage(movie) {
    const art = document.createElement('article');
    art.className = 'movie-card';
  
    const rating5 = movie.avgRating ? (Number(movie.avgRating) / 2) : 0;
    art.dataset.genre = (movie.genre || '').toLowerCase(); 
    art.dataset.rating = rating5 ? Number(rating5.toFixed(1)) : 0;
    art.dataset.year = movie.year || '';
    art.dataset.title = movie.title || '';
    art.dataset.movieId = movie.id;

    art.innerHTML = `
      <img src="${movie.poster || 'https://via.placeholder.com/600x360?text=No+Image'}" alt="${escapeHtml(movie.title)} poster">
      <div class="movie-info">
        <h3>${escapeHtml(movie.title)}</h3>
        <div class="meta">${escapeHtml(movie.genre || '')} · ${rating5 ? rating5.toFixed(1) + '*' : 'N/A'} · ${escapeHtml(movie.year || '')}</div>
        <p class="meta" style="margin-top:8px;color:var(--muted)">${escapeHtml((movie.description || '').slice(0, 140))}</p>
      </div>
    `;
    return art;
}

function renderMovies(container, movies = []) {
    container.innerHTML = '';
    if (!movies.length) {
        container.innerHTML = '<p>No movies found.</p>';
        return;
    }
    const frag = document.createDocumentFragment();
    movies.forEach(m => {
        let node;
        if (container.id === 'movieList') {
            node = createMovieCardForMoviesPage(m);
        } else if (container.id === 'homeMovieList') {
            node = createMovieCardForHome(m);
        } else {
           
            node = createMovieCard(m);
        }
        frag.appendChild(node);
    });
    container.appendChild(frag);
}

function populateBestCarousel(movies = [], containerId = 'bestCarousel') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    if (!movies.length) {
        container.innerHTML = '<p>No featured movies.</p>';
        return;
    }

    const track = document.createElement('div');
    track.className = 'carousel-track';
    movies.forEach((m, i) => {
        const slide = document.createElement('div');
        slide.className = 'carousel-slide' + (i === 0 ? ' active' : '');
        slide.dataset.index = i;
    
        slide.appendChild(createMovieCardForHome(m));
        track.appendChild(slide);
    });

    const prev = document.createElement('button');
    prev.className = 'carousel-prev';
    prev.type = 'button';
    prev.textContent = '‹';

    const next = document.createElement('button');
    next.className = 'carousel-next';
    next.type = 'button';
    next.textContent = '›';

    container.appendChild(prev);
    container.appendChild(track);
    container.appendChild(next);

    const slides = track.querySelectorAll('.carousel-slide');
    let idx = 0;
    function show(i) {
        slides.forEach(s => s.classList.toggle('active', Number(s.dataset.index) === i));
    }

    prev.addEventListener('click', () => { idx = (idx - 1 + slides.length) % slides.length; show(idx); });
    next.addEventListener('click', () => { idx = (idx + 1) % slides.length; show(idx); });

    // auto-advance every 5s, pause on hover
    let timer = setInterval(() => { idx = (idx + 1) % slides.length; show(idx); }, 5000);
    [container, prev, next].forEach(el => {
        el.addEventListener('mouseenter', () => clearInterval(timer));
        el.addEventListener('mouseleave', () => { timer = setInterval(() => { idx = (idx + 1) % slides.length; show(idx); }, 5000); });
    });
}

async function populateMainGrids({ page = 1, limit = 100, homeLimit = 6 } = {}) { // changed default limit -> 100
    try {
        
        const moviesRes = await fetchMovies({ query: '', page, limit });
        const movies = moviesRes.movies || [];

        
        const grids = Array.from(document.querySelectorAll('.movie-list'));
        grids.forEach(grid => {
            if (grid.id === 'movieList') {
                renderMovies(grid, movies);
            } else if (grid.id === 'homeMovieList') {
                renderMovies(grid, movies.slice(0, homeLimit));
            } else {
                renderMovies(grid, movies.slice(0, Math.min(homeLimit, movies.length)));
            }
        });

       
        const [topRes, popularRes, newlyRes] = await Promise.all([
            tmdbGetTopRated({ page: 1 }).catch(() => ({ movies: [] })),
            tmdbGetPopular({ page: 1 }).catch(() => ({ movies: [] })),
            tmdbGetPopular({ page: 2 }).catch(() => ({ movies: [] }))
        ]);

        try {
            const bestSix = (topRes.movies || []).slice(0, 6);
            populateBestCarousel(bestSix, 'bestCarousel');
        } catch (e) {
            console.warn('populateBestCarousel failed', e);
        }

        const sections = [
            { id: 'top-rated', movies: (topRes.movies || []), count: 6 },
            { id: 'popular', movies: (popularRes.movies || []), count: 6 },
            { id: 'newly-added', movies: (newlyRes.movies || []), count: 6 }
        ];

        sections.forEach(s => {
            const sec = document.getElementById(s.id);
            if (!sec) return;
           
            let list = sec.querySelector('.movie-list');
            if (!list) {
                list = document.createElement('div');
                list.className = 'movie-list';
                sec.appendChild(list);
            }
            renderMovies(list, s.movies.slice(0, s.count));
        });

       
        const moviesCount = document.getElementById('moviesCount');
        if (moviesCount) moviesCount.textContent = `Showing ${movies.length} of ${movies.length}`;
    } catch (err) {
        console.error('populateMainGrids failed', err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
  
    try { setupApiUI(); } catch (e) {}

    populateMainGrids({ page: 1, limit: 60 }).catch(err => console.error(err));
});

function escapeHtml(s = '') {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Debounce helper
function debounce(fn, wait = 300) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn.apply(this, args), wait);
    };
}

function setupApiUI() {
    const searchInput = document.querySelector('#searchInput');
    const searchResults = document.querySelector('#moviesContainer');
    const ratingModal = document.querySelector('#ratingModal'); // optional modal in your HTML
    const ratingForm = document.querySelector('#ratingForm');

    if (searchInput && searchResults) {
        const doSearch = async () => {
            const q = searchInput.value.trim();
            try {
                const res = await fetchMovies({ query: q, page: 1, limit: 30 });
           
                renderMovies(searchResults, res.movies || []);
            } catch (err) {
                console.error('Search error', err);
                searchResults.innerHTML = '<p>Error loading movies.</p>';
            }
        };
        searchInput.addEventListener('input', debounce(doSearch, 350));
     
        doSearch();
    }


    if (searchResults) {
        searchResults.addEventListener('click', async (ev) => {
            const btn = ev.target.closest('button[data-action]');
            if (!btn) return;
            const card = btn.closest('.movie-card');
            const movieId = card && card.dataset.movieId;
            const action = btn.dataset.action;
            if (!movieId) return;
            if (action === 'view') {
                try {
                    const movie = await getMovie(movieId);
                    showMovieDetail(movie); 
                } catch (err) {
                    console.error(err);
                    alert('Failed to load movie detail.');
                }
            } else if (action === 'rate') {
           
                if (ratingForm) {
                    ratingForm.dataset.movieId = movieId;
                    if (ratingModal) ratingModal.classList.add('open');
                }
            }
        });
    }

    if (ratingForm) {
        ratingForm.addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const movieId = ratingForm.dataset.movieId;
            if (!movieId) return;
            const formData = new FormData(ratingForm);
            const score = Number(formData.get('score') || 0);
            const review = formData.get('review') || '';
            try {
                await submitRating(movieId, { score, review });
                if (ratingModal) ratingModal.classList.remove('open');
           
                if (searchResults) {
               
                    const q = searchInput ? searchInput.value.trim() : '';
                    const res = await fetchMovies({ query: q, page: 1, limit: 30 });
                    renderMovies(searchResults, res.movies || []);
                }
                alert('Rating submitted.');
            } catch (err) {
                console.error('Rating submit error', err);
                alert('Failed to submit rating.');
            }
        });
    }
}


function showMovieDetail(movie) {
    const detail = document.querySelector('#movieDetail');
    if (!detail) {
        
        alert(`${movie.title}\n\n${movie.description || ''}`);
        return;
    }
    detail.innerHTML = `
        <h2>${escapeHtml(movie.title)}</h2>
        <img src="${movie.poster || 'placeholder.png'}" alt="${escapeHtml(movie.title)} poster" />
        <p>Rating: ${movie.avgRating ? movie.avgRating.toFixed(1) : 'N/A'}</p>
        <p>${escapeHtml(movie.description || '')}</p>
    `;
}


window.MovieApi = {
    fetchMovies,
    getMovie,
    submitRating,
    createMovie,
    updateMovie,
    deleteMovie,
    fetchTopRated,
    setupApiUI,
    renderMovies,
    setTmdbApiKey: (k) => TMDB.setApiKey(k),
    tmdbSearchMovies,
    tmdbGetMovieDetails,
    tmdbGetPopular,
    tmdbGetTopRated,
    tmdbGetImageUrl,
    populateMainGrids
};