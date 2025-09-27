

// Global set to track newly added actors in the current session
const newlyAddedActors = new Set();
const actors = new Map();
const genres = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/get-actors');
        const responseText = await response.text();
        console.log('Raw response from /get-actors:', responseText);
        const actorsData = JSON.parse(responseText);
        actorsData.forEach(actor => {
            if (actor && actor.imdb_id) {
                const imdb_id = actor.imdb_id.trim();
                actors.set(imdb_id, actor);
            }
        });
        console.log('Actors data loaded:', actors);
    } catch (error) {
        console.error('Error loading actors data:', error);
        console.log('Failed to parse actors data as JSON.');
    }

    try {
        const response = await fetch('/get-genres');
        const genresData = await response.json();
        genresData.forEach(genre => {
            genres.set(genre.id, genre.name);
        });
        console.log('Genres data loaded:', genres);
    } catch (error) {
        console.error('Error loading genres data:', error);
    }

    const addModeBtn = document.getElementById('addModeBtn');
    const bulkUpdateModeBtn = document.getElementById('bulkUpdateModeBtn');
    const addModeContainer = document.getElementById('add-mode-container');
    const bulkUpdateContainer = document.getElementById('bulk-update-container');

    addModeBtn.addEventListener('change', () => {
        addModeContainer.classList.remove('d-none');
        bulkUpdateContainer.classList.add('d-none');
    });

    bulkUpdateModeBtn.addEventListener('change', () => {
        addModeContainer.classList.add('d-none');
        bulkUpdateContainer.classList.remove('d-none');
    });

    document.getElementById('select-all-no-change').addEventListener('click', () => {
        document.querySelectorAll('#bulk-update-form input[type="radio"][value="no-change"]').forEach(radio => radio.checked = true);
    });

    document.getElementById('select-all-update-blanks').addEventListener('click', () => {
        document.querySelectorAll('#bulk-update-form input[type="radio"][value="update-blanks"]').forEach(radio => radio.checked = true);
    });

    document.getElementById('select-all-overwrite').addEventListener('click', () => {
        document.querySelectorAll('#bulk-update-form input[type="radio"][value="overwrite"]').forEach(radio => radio.checked = true);
    });

    document.getElementById('bulk-update-form').addEventListener('submit', (e) => {
        e.preventDefault();
        initiateBulkUpdate(false); // false for not all
    });

    document.getElementById('start-bulk-update-all-btn').addEventListener('click', () => {
        initiateBulkUpdate(true); // true for all
    });

    function initiateBulkUpdate(all = false) {
        const statusDiv = document.getElementById('bulk-update-status');
        statusDiv.innerHTML = ''; // Clear previous logs

        const actions = {};
        const form = document.getElementById('bulk-update-form');
        form.querySelectorAll('.row').forEach(row => {
            const label = row.querySelector('label').textContent;
            const fieldName = label.toLowerCase().replace(/ /g, '-').replace(/\(|\)/g, '');
            const selectedAction = row.querySelector('input[type="radio"]:checked').value;
            if (selectedAction !== 'no-change') {
                actions[fieldName] = selectedAction;
            }
        });

        const params = { actions: JSON.stringify(actions) };
        if (all) {
            params.all = true;
        }
        const queryString = new URLSearchParams(params).toString();
        const evtSource = new EventSource(`/bulk-update?${queryString}`);

        evtSource.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.error) {
                statusDiv.innerHTML += `<div class="alert alert-danger">${data.error}</div>`;
                evtSource.close();
            } else if (data.message === 'done') {
                statusDiv.innerHTML += `<div class="alert alert-success">Bulk update complete!</div>`;
                evtSource.close();
            } else {
                let textColorClass = '';
                if (data.updatedFields.length === 0) {
                    textColorClass = 'text-secondary'; // gray
                } else {
                    const apis = Object.keys(data.apisUsed).filter(api => data.apisUsed[api]);
                    if (apis.length > 1) {
                        textColorClass = 'text-success'; // green
                    } else if (apis[0] === 'tmdb') {
                        textColorClass = 'text-primary'; // blue
                    } else if (apis[0] === 'omdb') {
                        textColorClass = 'text-warning'; // orange
                    } else if (apis[0] === 'gemini') {
                        textColorClass = 'text-danger'; // red
                    }
                }
                statusDiv.innerHTML += `<div class="${textColorClass}">${data.message}</div>`;
            }
        };

        evtSource.onerror = function(err) {
            statusDiv.innerHTML += `<div class="alert alert-danger">An error occurred with the bulk update connection.</div>`;
            console.error("EventSource failed:", err);
            evtSource.close();
        };
    }
});

async function checkAndHighlightRoles(production_imdb_id, production_title, cast) {
    const castList = document.getElementById('cast-list');
    const listItems = castList.getElementsByTagName('li');

    const response = await fetch(`/get-roles-for-production/${production_imdb_id}`);
    const { productionRoles } = await response.json();

    for (const item of listItems) {
        const actorNameSpan = item.querySelector('.actor-name-field');
        const actorImdbIdSpan = item.querySelector('.actor-imdb-id-field');
        const characterSpan = item.querySelector('.character-field');
        const roleCheckbox = item.querySelector('.role-checkbox');

        const actorName = actorNameSpan.textContent.trim();
        const actorImdbId = actorImdbIdSpan.textContent.trim();
        const actorExists = actors.has(actorImdbId);
        let characterName = characterSpan.textContent.trim();

        // Clean up character name for better fuzzy matching
        if (characterName.includes('/')) {
            characterName = characterName.split('/')[0].trim();
        }
        if (characterName.includes('(')) {
            characterName = characterName.split('(')[0].trim();
        }

        let perfectMatchFound = false;
        let partialMatchFound = false;

        for (const csvRole of productionRoles) {
            const csvActorName = csvRole.actor_name.trim();
            const csvActorImdbId = csvRole.actor_imdb_id.trim();
            let csvCharacterName = csvRole.character.trim();

            // Clean up csv character name for better fuzzy matching
            if (csvCharacterName.includes('/')) {
                csvCharacterName = csvCharacterName.split('/')[0].trim();
            }
            if (csvCharacterName.includes('(')) {
                csvCharacterName = csvCharacterName.split('(')[0].trim();
            }

            const nameSimilarity = stringSimilarity.compareTwoStrings(actorName.toLowerCase(), csvActorName.toLowerCase());
            const characterSimilarity = stringSimilarity.compareTwoStrings(characterName.toLowerCase(), csvCharacterName.toLowerCase());

            const imdbIdMatch = (actorImdbId === csvActorImdbId);

            if (imdbIdMatch && nameSimilarity > 0.9 && characterSimilarity > 0.9) {
                perfectMatchFound = true;
                break;
            } else if (imdbIdMatch && nameSimilarity > 0.8) {
                partialMatchFound = true;
                actorNameSpan.style.color = nameSimilarity > 0.9 ? 'green' : 'lightblue';
                actorImdbIdSpan.style.color = 'green';
                characterSpan.style.color = characterSimilarity > 0.9 ? 'green' : 'lightblue';
                item.style.backgroundColor = 'lightyellow';
                break;
            }
        }

        if (perfectMatchFound) {
            item.style.backgroundColor = 'lightgreen';
            actorNameSpan.style.color = 'green';
            actorImdbIdSpan.style.color = 'green';
            characterSpan.style.color = 'green';
            roleCheckbox.checked = false;
            item.dataset.selected = 'false';
            item.style.opacity = '0.5';
        } else {
            if (actorExists) {
                roleCheckbox.checked = true;
                item.dataset.selected = 'true';
                item.style.opacity = '1';
                actorNameSpan.style.color = 'green';
            } else {
                roleCheckbox.checked = false;
                item.dataset.selected = 'false';
                item.style.opacity = '0.5';
            }

            if (partialMatchFound) {
                item.style.backgroundColor = 'lightyellow';
            } else {
                item.style.backgroundColor = 'lightcoral';
                actorNameSpan.style.color = 'red';
                actorImdbIdSpan.style.color = 'red';
                characterSpan.style.color = 'red';
            }

            if (!actorExists && actorImdbId && actorImdbId !== 'N/A') {
                try {
                    const actorDetailsResponse = await fetch(`/get-actor-details-from-tmdb/${actorImdbId}`);
                    const actorDetails = await actorDetailsResponse.json();

                    if (actorDetailsResponse.ok && actorDetails.birthday) {
                        actors.set(actorImdbId, {
                            imdb_id: actorDetails.imdb_id,
                            name: actorDetails.name,
                            'birthday (YYYY-MM-DD)': actorDetails.birthday
                        });
                        newlyAddedActors.add(actorImdbId);
                        actorNameSpan.style.color = 'lightblue';
                    }
                } catch (error) {
                    console.error('Error during actor add process:', error);
                }
            }
        }
    }
}

function shouldBeChecked(elementId, newData, csvData) {
    const hasCsvData = csvData !== undefined && csvData !== null && csvData !== '';

    if (!hasCsvData) {
        return true;
    }

    if (newData === '') {
        return false;
    }

    if ((elementId === 'production-start' || elementId === 'production-end') && newData !== csvData) {
        return false;
    }

    return true;
}

function highlightField(elementId, newData, csvData) {
    const element = document.getElementById(elementId);
    const csvBox = document.getElementById(`${elementId}-csv`);
    const checkbox = document.getElementById(`${elementId}-overwrite`);

    if (csvData === undefined || csvData === null || csvData === '') {
        element.style.backgroundColor = 'lightblue';
        csvBox.style.display = 'none';
    } else if (newData == csvData) {
        element.style.backgroundColor = 'lightgreen';
        csvBox.style.display = 'none';
    } else {
        element.style.backgroundColor = 'lightcoral';
        csvBox.style.display = 'block';
        csvBox.textContent = csvData;
    }

    checkbox.checked = shouldBeChecked(elementId, newData, csvData);
}

function formatCurrency(value) {
    if (!value) {
        return '';
    }
    const numberValue = Number(String(value).replace(/[^0-9.]/g, ''));
    if (isNaN(numberValue)) {
        return value;
    }
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
    }).format(numberValue);
}

document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('title').value;
    const year = document.getElementById('year').value;
    const resultsDiv = document.getElementById('results');
    const movieDetailsDiv = document.getElementById('movie-details');

    resultsDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
    movieDetailsDiv.innerHTML = '';

    try {
        let url = `/search?title=${encodeURIComponent(title)}`;
        if (year) {
            url += `&year=${year}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('An error occurred while searching.');
        }
        const data = await response.json();

        resultsDiv.innerHTML = '';

        if (data.results && data.results.length > 0) {
            const ul = document.createElement('ul');
            ul.classList.add('list-group');

            data.results.slice(0, 5).forEach(movie => {
                const li = document.createElement('li');
                li.classList.add('list-group-item', 'list-group-item-action');
                li.dataset.tmdbid = movie.id;

                li.innerHTML = `
                    <div class="d-flex">
                        <img src="${movie.poster_path ? `https://image.tmdb.org/t/p/w200${movie.poster_path}` : 'https://via.placeholder.com/100x150'}" alt="Poster" style="width: 100px; margin-right: 20px;">
                        <div>
                            <h5>${movie.title} (${movie.release_date ? movie.release_date.substring(0, 4) : 'N/A'})</h5>
                        </div>
                    </div>
                `;
                ul.appendChild(li);
            });

            resultsDiv.appendChild(ul);

            const firstResult = ul.querySelector('.list-group-item');
            if (firstResult) {
                firstResult.click();
            }

        } else {
            resultsDiv.innerHTML = `<div class="alert alert-warning">No results found.</div>`;
        }
    } catch (error) {
        resultsDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
        console.error('Search error:', error);
    }
});

async function fetchGeminiData(imdbID, title, year) {
    const geminiStatusDiv = document.getElementById('gemini-status');
    geminiStatusDiv.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div> Fetching production dates from Gemini...';
    geminiStatusDiv.className = 'alert alert-info';

    try {
        const response = await fetch(`/gemini-movie-dates/${imdbID}/${encodeURIComponent(title)}/${year}`);
        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to fetch data');
        }
        const data = await response.json();

        let updated = false;
        if (data.productionStart) {
            document.getElementById('production-start').value = data.productionStart;
            updated = true;
        }
        if (data.productionEnd) {
            document.getElementById('production-end').value = data.productionEnd;
            updated = true;
        }

        if (updated) {
            geminiStatusDiv.className = 'alert alert-success';
            geminiStatusDiv.textContent = 'Successfully updated production dates from Gemini.';
        } else {
            geminiStatusDiv.className = 'alert alert-warning';
            geminiStatusDiv.textContent = 'Could not find production dates from Gemini.';
        }

    } catch (error) {
        geminiStatusDiv.className = 'alert alert-danger';
        let errorMessage = `Error: ${error.message}`;
        geminiStatusDiv.innerHTML = errorMessage;
        console.error('Error fetching Gemini data:', error);
    } finally {
        setTimeout(() => {
            if (geminiStatusDiv.classList.contains('alert-success') || geminiStatusDiv.classList.contains('alert-warning')) {
                geminiStatusDiv.remove();
            }
        }, 5000);
    }
}

async function fetchOmdbData(imdbID, prodData) {
    try {
        const response = await fetch(`/omdb/rating/${imdbID}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();

        if (data.imdbRating) {
            const imdbRatingEl = document.getElementById('imdb-rating');
            if (imdbRatingEl) {
                imdbRatingEl.value = data.imdbRating;
                highlightField('imdb-rating', data.imdbRating, prodData.imdb_rating);
            }
        }
        if (data.BoxOffice) {
            const boxOfficeEl = document.getElementById('box-office');
            if (boxOfficeEl) {
                boxOfficeEl.value = data.BoxOffice;
                highlightField('box-office', data.BoxOffice, prodData.box_office_us);
            }
        }
    } catch (error) {
        console.error('Error fetching OMDb data:', error);
        const imdbRatingCsv = document.getElementById('imdb-rating-csv');
        const boxOfficeCsv = document.getElementById('box-office-csv');
        if (imdbRatingCsv) {
            imdbRatingCsv.innerHTML = `Failed to fetch.`;
            imdbRatingCsv.style.display = 'block';
        }
        if (boxOfficeCsv) {
            boxOfficeCsv.innerHTML = `Failed to fetch.`;
            boxOfficeCsv.style.display = 'block';
        }
    }
}

// Event listener for clicking on a movie result
document.getElementById('results').addEventListener('click', async (e) => {
    const listItem = e.target.closest('.list-group-item');
    if (listItem && listItem.dataset.tmdbid) { // Use tmdbid
        const tmdbID = listItem.dataset.tmdbid;
        const movieDetailsDiv = document.getElementById('movie-details');
        movieDetailsDiv.style.display = 'block';
        movieDetailsDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';

        try {
            const movieResponse = await fetch(`/tmdb/movie/${tmdbID}`);
            if (!movieResponse.ok) {
                let errorMsg = 'An error occurred while fetching movie details.';
                try {
                    const err = await movieResponse.json();
                    if (err.error.includes('Failed to fetch data from TMDb')) {
                        errorMsg = 'The TMDb API is not responding. Please try again later.';
                    }
                } catch (e) {
                    // Ignore parsing error, use default message
                }
                throw new Error(errorMsg);
            }
            const movie = await movieResponse.json();
            console.log('Movie data received:', movie);

            const prodResponse = await fetch(`/check-production/${movie.imdb_id}`);
            const prodData = await prodResponse.json();



            const tmdbCastResponse = await fetch(`/tmdb-movie-details/${movie.imdb_id}`);
            const tmdbCast = await tmdbCastResponse.json();

            movieDetailsDiv.innerHTML = ''; // Clear spinner

            if (movie.title) {
                const posterUrl = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '';

                movieDetailsDiv.innerHTML = `
                    <div class="card mb-3">
                        <div class="row g-0">
                            <div class="col-md-4">
                                <img src="${posterUrl || 'https://via.placeholder.com/300x450'}" class="img-fluid rounded-start" alt="Poster" style="max-width: 300px;">
                                <div class="mt-2">
                                    <div class="row d-flex align-items-stretch">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="poster-url-overwrite">
                                                <label class="form-check-label" for="poster-url-overwrite">Poster URL</label>
                                            </div>
                                            <input type="text" class="form-control" id="poster-url" value="${posterUrl}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="poster-url-csv" style="display: none;"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-8">
                                <div class="card-body">
                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-title-overwrite">
                                                <label class="form-check-label" for="movie-title-overwrite">Title</label>
                                            </div>
                                            <input type="text" class="form-control" id="movie-title" value="${movie.title}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-title-csv" style="display: none;"></div>
                                        </div>
                                    </div>
                                    <p class="card-text"><strong>IMDb ID:</strong> <span id="movie-imdb-id">${movie.imdb_id}</span></p>
                                    
                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-type-overwrite">
                                                <label class="form-check-label" for="movie-type-overwrite">Type</label>
                                            </div>
                                            <select class="form-select" id="movie-type">
                                                <option value="Film" ${movie.media_type === 'movie' ? 'selected' : ''}>Film</option>
                                                <option value="Series" ${movie.media_type === 'tv' ? 'selected' : ''}>Series</option>
                                                <option value="Episode">Episode</option>
                                                <option value="Game">Game</option>
                                                <option value="Short">Short</option>
                                                <option value="Other">Other</option>
                                            </select>
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-type-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-genres-overwrite">
                                                <label class="form-check-label" for="movie-genres-overwrite">Genres</label>
                                            </div>
                                            <select class="form-select" id="movie-genres" multiple>
                                                ${Array.from(genres.entries()).map(([id, name]) => `<option value="${id}" ${movie.genres.some(g => g.id == id) ? 'selected' : ''}>${name}</option>`).join('')}
                                            </select>
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-genres-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-franchise-overwrite">
                                                <label class="form-check-label" for="movie-franchise-overwrite">Franchise</label>
                                            </div>
                                            <input type="text" class="form-control" id="movie-franchise" value="">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-franchise-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="production-start-overwrite">
                                                <label class="form-check-label" for="production-start-overwrite">Production Start</label>
                                            </div>
                                            <input type="date" class="form-control" id="production-start" value="">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="production-start-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="production-end-overwrite">
                                                <label class="form-check-label" for="production-end-overwrite">Production End</label>
                                            </div>
                                            <input type="date" class="form-control" id="production-end" value="">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="production-end-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="release-date-overwrite">
                                                <label class="form-check-label" for="release-date-overwrite">Release Date</label>
                                            </div>
                                            <input type="date" class="form-control" id="release-date" value="${movie.release_date || ''}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="release-date-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="imdb-rating-overwrite">
                                                <label class="form-check-label" for="imdb-rating-overwrite">IMDb Rating</label>
                                            </div>
                                            <input type="text" class="form-control" id="imdb-rating" value="">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="imdb-rating-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="budget-overwrite">
                                                <label class="form-check-label" for="budget-overwrite">Budget</label>
                                            </div>
                                            <input type="text" class="form-control" id="budget" value="${movie.budget || ''}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="budget-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="box-office-overwrite">
                                                <label class="form-check-label" for="box-office-overwrite">Box Office (US)</label>
                                            </div>
                                            <input type="text" class="form-control" id="box-office" value="">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="box-office-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <button class="btn btn-success mt-3" id="update-csvs-btn">Update CSVs</button>
                                    <a href="https://www.imdb.com/title/${movie.imdb_id}" target="_blank" class="btn btn-info mt-3 ms-2">Open in IMDb</a>
                                    <button class="btn btn-warning mt-3 ms-2" id="retry-gemini-btn">Retry Gemini</button>
                                    <button class="btn btn-warning mt-3 ms-2" id="retry-omdb-btn">Retry OMDb</button>
                                    <div id="gemini-status" class="mt-2"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h4 class="mt-4 d-flex justify-content-between align-items-center">
                        <span>Cast Members (from TMDb)</span>
                        <div class="form-check form-switch">
                            <input class="form-check-input" type="checkbox" id="toggle-all-roles">
                            <label class="form-check-label" for="toggle-all-roles">All</label>
                        </div>
                    </h4>
                    <ul class="list-group" id="cast-list">
                        ${tmdbCast.map(actor => `
                            <li class="list-group-item d-flex justify-content-between align-items-center" 
                                data-tmdb-id="${actor.id}" 
                                data-imdb-id="${actor.imdb_id || ''}"
                                data-actor-name="${actor.name}"
                                data-character-name="${actor.character}"
                                data-selected="false" style="opacity: 0.5;">
                                <div>
                                    <span class="actor-name-field">${actor.name}</span> 
                                    (<span class="actor-imdb-id-field">${actor.imdb_id || 'N/A'}</span>) as 
                                    <span class="character-field">${actor.character}</span>
                                </div>
                                <div class="form-check form-switch">
                                    <input class="form-check-input role-checkbox" type="checkbox" id="role-checkbox-${actor.id}">
                                    <label class="form-check-label" for="role-checkbox-${actor.id}"></label>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                `;

                document.getElementById('cast-list').addEventListener('change', (e) => {
                    const checkbox = e.target;
                    if (checkbox.classList.contains('role-checkbox')) {
                        const listItem = checkbox.closest('.list-group-item');
                        if (checkbox.checked) {
                            listItem.style.opacity = '1';
                            listItem.dataset.selected = 'true';
                        } else {
                            listItem.style.opacity = '0.5';
                            listItem.dataset.selected = 'false';
                        }
                    }
                });

                document.getElementById('toggle-all-roles').addEventListener('change', (e) => {
                    const isChecked = e.target.checked;
                    const roleCheckboxes = document.querySelectorAll('.role-checkbox');
                    roleCheckboxes.forEach(checkbox => {
                        checkbox.checked = isChecked;
                        const listItem = checkbox.closest('.list-group-item');
                        if (isChecked) {
                            listItem.style.opacity = '1';
                            listItem.dataset.selected = 'true';
                        } else {
                            listItem.style.opacity = '0.5';
                            listItem.dataset.selected = 'false';
                        }
                    });
                });

                document.getElementById('update-csvs-btn').addEventListener('click', async () => {
                    const imdbID = document.getElementById('movie-imdb-id').textContent;
                    const productionData = {};
                    const rolesToSave = [];
                    const actorsToSave = [];

                    const fields = [
                        'movie-title', 'movie-type', 'movie-genres', 'movie-franchise',
                        'production-start', 'production-end', 'release-date',
                        'imdb-rating', 'box-office', 'budget', 'poster-url'
                    ];

                    fields.forEach(field => {
                        const checkbox = document.getElementById(`${field}-overwrite`);
                        if (checkbox && checkbox.checked) {
                            let value = document.getElementById(field).value;
                            if (field === 'movie-type') {
                                value = value.toLowerCase();
                            }
                            if (field === 'movie-genres') {
                                value = Array.from(document.getElementById('movie-genres').selectedOptions).map(opt => opt.value).join('|');
                            }
                            if (field === 'box-office' || field === 'budget') {
                                value = formatCurrency(value);
                            }
                            productionData[field.replace(/-/g, '_')] = value;
                        }
                    });
                    productionData['imdb_id'] = imdbID;

                    const castListItems = document.getElementById('cast-list').getElementsByTagName('li');
                    for (const item of castListItems) {
                        const roleCheckbox = item.querySelector('.role-checkbox');
                        if (roleCheckbox && roleCheckbox.checked) {
                            const actorImdbId = item.dataset.imdbId;
                            const actorName = item.dataset.actorName;
                            const characterName = item.dataset.characterName;

                            rolesToSave.push({
                                actor_imdb_id: actorImdbId,
                                actor_name: actorName,
                                production_imdb_id: imdbID,
                                production_title: movie.title, // Use movie.title from the fetched data
                                character: characterName
                            });

                            const actorKey = actorImdbId;
                            if (newlyAddedActors.has(actorKey)) {
                                const actorData = actors.get(actorKey);
                                if (actorData) {
                                    actorsToSave.push({
                                        imdb_id: actorData.imdb_id,
                                        name: actorData.name,
                                        birthday: actorData['birthday (YYYY-MM-DD)']
                                    });
                                    newlyAddedActors.delete(actorKey);
                                }
                            }
                        }
                    }

                    try {
                        if (Object.keys(productionData).length > 1) { 
                            const prodResponse = await fetch('/save-production', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(productionData),
                            });
                            if (!prodResponse.ok) throw new Error(`Failed to save production: ${(await prodResponse.json()).error}`);
                        }

                        if (rolesToSave.length > 0) {
                            const rolesResponse = await fetch('/save-roles', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ rolesToSave }),
                            });
                            if (!rolesResponse.ok) throw new Error(`Failed to save roles: ${(await rolesResponse.json()).error}`);
                        }

                        if (actorsToSave.length > 0) {
                            for (const actor of actorsToSave) {
                                const actorResponse = await fetch('/save-actor', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(actor),
                                });
                                if (!actorResponse.ok) throw new Error(`Failed to save actor ${actor.name}: ${(await actorResponse.json()).error}`);
                            }
                        }

                        alert('All selected data updated successfully!');
                        location.reload();

                    } catch (error) {
                        console.error('Error updating CSVs:', error);
                        alert(`Error updating CSVs: ${error.message}`);
                    }
                });

                document.getElementById('retry-gemini-btn').addEventListener('click', () => {
                    fetchGeminiData(movie.imdb_id, movie.title, new Date(movie.release_date).getFullYear());
                });

                document.getElementById('retry-omdb-btn').addEventListener('click', async () => {
                    const prodResponse = await fetch(`/check-production/${movie.imdb_id}`);
                    const prodData = await prodResponse.json();
                    fetchOmdbData(movie.imdb_id, prodData);
                });

                if (!prodData.production_start && !prodData.production_end) {
                    fetchGeminiData(movie.imdb_id, movie.title, new Date(movie.release_date).getFullYear());
                }

                if (movie.imdb_id) {
                    fetchOmdbData(movie.imdb_id, prodData);
                }

                checkAndHighlightRoles(movie.imdb_id, movie.title, tmdbCast);

                highlightField('movie-title', movie.title, prodData.title);
                highlightField('movie-type', movie.media_type === 'movie' ? 'Film' : 'Series', prodData.type);
                highlightField('movie-genres', movie.genres.map(g => g.id).join('|'), prodData.genre_ids);
                highlightField('movie-franchise', '', prodData.franchise);
                highlightField('production-start', document.getElementById('production-start').value, prodData.production_start);
                highlightField('production-end', document.getElementById('production-end').value, prodData.production_end);
                highlightField('release-date', movie.release_date, prodData.release_date);
                highlightField('imdb-rating', '', prodData.imdb_rating);
                highlightField('budget', movie.budget, prodData.budget);
                highlightField('box-office', movie.revenue, prodData.box_office_us);
                highlightField('poster-url', posterUrl, prodData.poster);

            } else {
                movieDetailsDiv.innerHTML = `<div class="alert alert-warning">Could not fetch details for this movie.</div>`;
            }
        } catch (error) {
            movieDetailsDiv.innerHTML = `<div class="alert alert-danger">${error.message}</div>`;
            console.error('Fetch movie details error:', error);
        }
    }
});
