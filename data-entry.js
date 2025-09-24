function formatDate(omdbDate) {
    if (omdbDate === 'N/A' || !omdbDate) return '';
    const date = new Date(omdbDate);
    if (isNaN(date.getTime())) return ''; // Check for 'Invalid Date'
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getHiResPoster(url) {
    if (url && url.includes('_V1_')) {
        return url.replace(/_V1_SX\d+/, '_V1_SX1000');
    }
    return url;
}

async function checkAndHighlightActors(cast) {
    const actorNames = cast.map(actor => actor.name);
    const response = await fetch('http://localhost:3003/check-actors', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ actorNames }),
    });
    const { foundActors } = await response.json();

    const castList = document.getElementById('cast-list');
    const listItems = castList.getElementsByTagName('li');

    for (const item of listItems) {
        const actorName = item.querySelector('.actor-name-field').textContent;
        if (foundActors.includes(actorName)) {
            item.querySelector('.actor-name-field').style.color = 'green';
        }
    }
}

// Global set to track newly added actors in the current session
const newlyAddedActors = new Set();
const actors = new Map();

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('http://localhost:3003/get-actors');
        const actorsData = await response.json();
        actorsData.forEach(actor => {
            actors.set(`${actor.imdb_id}-${actor.name}`, actor);
        });
        console.log('Actors data loaded:', actors);
    } catch (error) {
        console.error('Error loading actors data:', error);
    }
});

async function checkAndHighlightRoles(production_imdb_id, production_title, cast) {
    const castList = document.getElementById('cast-list');
    const listItems = castList.getElementsByTagName('li');

    const response = await fetch(`http://localhost:3003/get-roles-for-production/${production_imdb_id}`);
    const { productionRoles } = await response.json();

    let isFirstCastMember = true; // Flag to log only for the first cast member

    for (const item of listItems) {
        const actorNameSpan = item.querySelector('.actor-name-field');
        const actorImdbIdSpan = item.querySelector('.actor-imdb-id-field');
        const characterSpan = item.querySelector('.character-field');
        const roleCheckbox = item.querySelector('.role-checkbox');

        const actorName = actorNameSpan.textContent.trim();
        const actorImdbId = actorImdbIdSpan.textContent.trim();
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

        if (isFirstCastMember) {
            console.log('--- First Cast Member Debug ---');
            console.log('UI Data:', { actorName, actorImdbId, characterName, production_imdb_id, production_title });
        }

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

            if (isFirstCastMember) {
                console.log('  Comparing with CSV Role:', { csvActorName, csvActorImdbId, csvCharacterName, csvProductionImdbId: csvRole.production_imdb_id, csvProductionTitle: csvRole.production_title });
                console.log('    imdbIdMatch:', imdbIdMatch, '(UI:', actorImdbId, 'CSV:', csvActorImdbId, ')');
                console.log('    nameSimilarity:', nameSimilarity, '(UI:', actorName, 'CSV:', csvActorName, ')');
                console.log('    characterSimilarity:', characterSimilarity, '(UI:', characterName, 'CSV:', csvCharacterName, ')');
            }

            if (imdbIdMatch && nameSimilarity > 0.9 && characterSimilarity > 0.9) {
                perfectMatchFound = true;
                if (isFirstCastMember) console.log('    PERFECT MATCH FOUND!');
                break;
            } else if (imdbIdMatch && nameSimilarity > 0.8) {
                partialMatchFound = true;
                if (isFirstCastMember) console.log('    PARTIAL MATCH FOUND!');
                // Apply granular highlighting for partial matches
                actorNameSpan.style.color = nameSimilarity > 0.9 ? 'green' : 'lightblue';
                actorImdbIdSpan.style.color = 'green';
                characterSpan.style.color = characterSimilarity > 0.9 ? 'green' : 'lightblue';
                item.style.backgroundColor = 'lightyellow'; // Indicate partial match at item level
                break;
            }
        }

        if (perfectMatchFound) {
            item.style.backgroundColor = 'lightgreen';
            actorNameSpan.style.color = 'green';
            actorImdbIdSpan.style.color = 'green';
            characterSpan.style.color = 'green';
            roleCheckbox.checked = false; // Unchecked if role fully exists
            item.dataset.selected = 'false';
            item.style.opacity = '0.5';
            if (isFirstCastMember) console.log('Final: Perfect match, setting green and unchecked.');
        } else if (partialMatchFound) {
            // Already handled granular highlighting in the loop
            roleCheckbox.checked = true; // Checked if no match or only partial match
            item.dataset.selected = 'true';
            item.style.opacity = '1';
            if (isFirstCastMember) console.log('Final: Partial match, setting yellow and checked.');
        } else {
            item.style.backgroundColor = 'lightcoral';
            actorNameSpan.style.color = 'red';
            actorImdbIdSpan.style.color = 'red';
            characterSpan.style.color = 'red';
            roleCheckbox.checked = true; // Checked if no match or only partial match
            item.dataset.selected = 'true';
            item.style.opacity = '1';
            if (isFirstCastMember) console.log('Final: No match, setting red and checked.');

            // Check if actor is in actors.csv (globally accessible 'actors' Map)
            const actorKey = `${actorImdbId}-${actorName}`;
            if (!actors.has(actorKey)) { // If actor is not in our client-side actors data
                if (isFirstCastMember) console.log('Actor not found in client-side actors map. Attempting to add.');
                try {
                    // Fetch actor details (birthday) from TMDb via our server
                    const actorDetailsResponse = await fetch(`http://localhost:3003/get-actor-details-from-tmdb/${actorImdbId}`);
                    const actorDetails = await actorDetailsResponse.json();

                    if (actorDetailsResponse.ok && actorDetails.birthday) {
                        // Save actor to actors.csv via our server
                        const saveActorResponse = await fetch('http://localhost:3003/save-actor', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                imdb_id: actorDetails.imdb_id,
                                name: actorDetails.name,
                                birthday: actorDetails.birthday
                            }),
                        });

                        if (saveActorResponse.ok) {
                            if (isFirstCastMember) console.log('Actor successfully added to actors.csv.');
                            // Update client-side actors map
                            actors.set(actorKey, {
                                imdb_id: actorDetails.imdb_id,
                                name: actorDetails.name,
                                'birthday (YYYY-MM-DD)': actorDetails.birthday
                            });
                            newlyAddedActors.add(actorKey); // Track newly added actors
                            // Visually indicate newly added actor
                            actorNameSpan.style.color = 'lightblue'; // New actor, not yet in roles.csv
                        } else {
                            const errorData = await saveActorResponse.json();
                            if (isFirstCastMember) console.error('Failed to save actor:', errorData.error);
                        }
                    } else {
                        if (isFirstCastMember) console.error('Failed to fetch actor birthday from TMDb:', actorDetails.error);
                    }
                } catch (error) {
                    if (isFirstCastMember) console.error('Error during actor add process:', error);
                }
            }
        }
        isFirstCastMember = false; // Only log for the first one
    }
}

function shouldBeChecked(elementId, newData, csvData) {
    if (newData === '' && csvData !== '') {
        return false;
    }
    if ((elementId === 'production-start' || elementId === 'production-end') && newData !== csvData && csvData !== '') {
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

document.getElementById('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('title').value;
    const year = document.getElementById('year').value;
    const resultsDiv = document.getElementById('results');
    const movieDetailsDiv = document.getElementById('movie-details');

    resultsDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';
    movieDetailsDiv.innerHTML = '';

    try {
        let url = `http://localhost:3003/search?title=${encodeURIComponent(title)}`;
        if (year) {
            url += `&y=${year}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        resultsDiv.innerHTML = '';

        if (data.Response === 'True') {
            const ul = document.createElement('ul');
            ul.classList.add('list-group');

            const moviePromises = data.Search.slice(0, 3).map(async movie => {
                const li = document.createElement('li');
                li.classList.add('list-group-item', 'list-group-item-action');
                li.dataset.imdbid = movie.imdbID;

                // Check if production exists
                const prodResponse = await fetch(`http://localhost:3003/check-production/${movie.imdbID}`);
                const prodData = await prodResponse.json();
                if (Object.keys(prodData).length > 0) {
                    li.style.backgroundColor = 'lightgreen';
                }

                li.innerHTML = `
                    <div class="d-flex">
                        <img src="${movie.Poster !== 'N/A' ? movie.Poster : 'https://via.placeholder.com/100x150'}" alt="Poster" style="width: 100px; margin-right: 20px;">
                        <div>
                            <h5>${movie.Title} (${movie.Year})</h5>
                            <p>IMDb ID: ${movie.imdbID}</p>
                        </div>
                    </div>
                `;
                return li;
            });

            const listItems = await Promise.all(moviePromises);
            listItems.forEach(li => ul.appendChild(li));

            resultsDiv.appendChild(ul);

            // Automatically click the first result
            const firstResult = ul.querySelector('.list-group-item');
            if (firstResult) {
                firstResult.click();
            }

            
        } else {
            resultsDiv.innerHTML = `<div class="alert alert-warning">${data.Error}</div>`;
        }
    } catch (error) {
        resultsDiv.innerHTML = '<div class="alert alert-danger">An error occurred while searching.</div>';
        console.error('Search error:', error);
    }
});

// Event listener for clicking on a movie result
document.getElementById('results').addEventListener('click', async (e) => {
    const listItem = e.target.closest('.list-group-item');
    if (listItem && listItem.dataset.imdbid) {
        const imdbID = listItem.dataset.imdbid;
        const movieDetailsDiv = document.getElementById('movie-details');
        movieDetailsDiv.style.display = 'block';
        movieDetailsDiv.innerHTML = '<div class="spinner-border" role="status"><span class="visually-hidden">Loading...</span></div>';

        try {
            // Fetch OMDb details
            const omdbResponse = await fetch(`http://localhost:3003/movie/${imdbID}`);
            const movie = await omdbResponse.json();

            // Fetch TMDb cast details
            const tmdbCastResponse = await fetch(`http://localhost:3003/tmdb-movie-details/${imdbID}`);
            const tmdbCast = await tmdbCastResponse.json();

            // Fetch production data from CSV
            const prodResponse = await fetch(`http://localhost:3003/check-production/${imdbID}`);
            const prodData = await prodResponse.json();

            movieDetailsDiv.innerHTML = ''; // Clear spinner

            if (movie.Response === 'True') {
                const highResPoster = getHiResPoster(movie.Poster);

                movieDetailsDiv.innerHTML = `
                    <div class="card mb-3">
                        <div class="row g-0">
                            <div class="col-md-4">
                                <img src="${highResPoster !== 'N/A' ? highResPoster : 'https://via.placeholder.com/300x450'}" class="img-fluid rounded-start" alt="Poster" style="max-width: 300px;">
                                <div class="mt-2">
                                    <div class="row d-flex align-items-stretch">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="poster-url-overwrite">
                                                <label class="form-check-label" for="poster-url-overwrite">Poster URL</label>
                                            </div>
                                            <input type="text" class="form-control" id="poster-url" value="${highResPoster !== 'N/A' ? highResPoster : ''}">
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
                                            <input type="text" class="form-control" id="movie-title" value="${movie.Title}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-title-csv" style="display: none;"></div>
                                        </div>
                                    </div>
                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-year-overwrite">
                                                <label class="form-check-label" for="movie-year-overwrite">Year</label>
                                            </div>
                                            <input type="number" class="form-control" id="movie-year" value="${parseInt(movie.Year) || ''}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="movie-year-csv" style="display: none;"></div>
                                        </div>
                                    </div>
                                    <p class="card-text"><strong>IMDb ID:</strong> <span id="movie-imdb-id">${movie.imdbID}</span></p>
                                    
                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="movie-type-overwrite">
                                                <label class="form-check-label" for="movie-type-overwrite">Type</label>
                                            </div>
                                            <select class="form-select" id="movie-type">
                                                <option value="Film" ${movie.Type === 'movie' ? 'selected' : ''}>Film</option>
                                                <option value="Series" ${movie.Type === 'series' ? 'selected' : ''}>Series</option>
                                                <option value="Episode" ${movie.Type === 'episode' ? 'selected' : ''}>Episode</option>
                                                <option value="Game" ${movie.Type === 'game' ? 'selected' : ''}>Game</option>
                                                <option value="Short" ${movie.Type === 'short' ? 'selected' : ''}>Short</option>
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
                                            <input type="date" class="form-control" id="release-date" value="${formatDate(movie.Released)}">
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
                                            <input type="text" class="form-control" id="imdb-rating" value="${movie.imdbRating}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="imdb-rating-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <div class="row d-flex align-items-stretch mb-3">
                                        <div class="col-6">
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" value="" id="box-office-overwrite">
                                                <label class="form-check-label" for="box-office-overwrite">Box Office (US)</label>
                                            </div>
                                            <input type="text" class="form-control" id="box-office" value="${movie.BoxOffice !== 'N/A' ? movie.BoxOffice : ''}">
                                        </div>
                                        <div class="col-6">
                                            <label class="form-label">&nbsp;</label>
                                            <div class="p-2 border rounded bg-light h-100" id="box-office-csv" style="display: none;"></div>
                                        </div>
                                    </div>

                                    <button class="btn btn-success mt-3" id="update-csvs-btn">Update CSVs</button>
                                    <a href="https://www.imdb.com/title/${movie.imdbID}" target="_blank" class="btn btn-info mt-3 ms-2">Open in IMDb</a>
                                    <div id="gemini-status" class="mt-2"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <h4 class="mt-4">Cast Members (from TMDb)</h4>
                    <ul class="list-group" id="cast-list">
                        ${tmdbCast.map(actor => `
                            <li class="list-group-item d-flex justify-content-between align-items-center" 
                                data-tmdb-id="${actor.id}" 
                                data-imdb-id="${actor.imdb_id || ''}"
                                data-actor-name="${actor.name}"
                                data-character-name="${actor.character}"
                                data-selected="true">
                                <div>
                                    <span class="actor-name-field">${actor.name}</span> 
                                    (<span class="actor-imdb-id-field">${actor.imdb_id || 'N/A'}</span>) as 
                                    <span class="character-field">${actor.character}</span>
                                </div>
                                <div class="form-check form-switch">
                                    <input class="form-check-input role-checkbox" type="checkbox" id="role-checkbox-${actor.id}" checked>
                                    <label class="form-check-label" for="role-checkbox-${actor.id}"></label>
                                </div>
                            </li>
                        `).join('')}
                    </ul>
                `;

                // Add event listener for role checkboxes
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

                // Add event listener for Update CSVs button
                document.getElementById('update-csvs-btn').addEventListener('click', async () => {
                    const imdbID = document.getElementById('movie-imdb-id').textContent;
                    const productionData = {};
                    const rolesToSave = [];
                    const actorsToSave = [];

                    // 1. Collect Production Data
                    const fields = [
                        'movie-title', 'movie-year', 'movie-type', 'movie-franchise',
                        'production-start', 'production-end', 'release-date',
                        'imdb-rating', 'box-office', 'poster-url'
                    ];

                    fields.forEach(field => {
                        const checkbox = document.getElementById(`${field}-overwrite`);
                        if (checkbox && checkbox.checked) {
                            let value = document.getElementById(field).value;
                            // Special handling for movie-type to match CSV header
                            if (field === 'movie-type') {
                                value = value.toLowerCase();
                            }
                            productionData[field.replace(/-/g, '_')] = value;
                        }
                    });
                    productionData['imdb_id'] = imdbID;

                    // 2. Collect Roles and Actors Data
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
                                production_title: movie.Title, // Use movie.Title from the fetched data
                                character: characterName
                            });

                            // Check if actor was newly added in this session and needs to be saved
                            const actorKey = `${actorImdbId}-${actorName}`;
                            if (newlyAddedActors.has(actorKey)) {
                                const actorData = actors.get(actorKey); // Get full actor data from client-side map
                                if (actorData) {
                                    actorsToSave.push({
                                        imdb_id: actorData.imdb_id,
                                        name: actorData.name,
                                        birthday: actorData['birthday (YYYY-MM-DD)']
                                    });
                                    newlyAddedActors.delete(actorKey); // Remove from set after processing
                                }
                            }
                        }
                    }

                    // 3. Make API Calls to save data
                    try {
                        // Save Production
                        const prodResponse = await fetch('/save-production', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(productionData),
                        });
                        if (!prodResponse.ok) throw new Error(`Failed to save production: ${(await prodResponse.json()).error}`);

                        // Save Roles
                        const rolesResponse = await fetch('/save-roles', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ rolesToSave }),
                        });
                        if (!rolesResponse.ok) throw new Error(`Failed to save roles: ${(await rolesResponse.json()).error}`);

                        // Save Actors (only newly added ones)
                        for (const actor of actorsToSave) {
                            const actorResponse = await fetch('/save-actor', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(actor),
                            });
                            if (!actorResponse.ok) throw new Error(`Failed to save actor ${actor.name}: ${(await actorResponse.json()).error}`);
                        }

                        alert('All selected data updated successfully!');
                        // Optionally, reload the page or re-fetch data to reflect changes
                        location.reload();

                    } catch (error) {
                        console.error('Error updating CSVs:', error);
                        alert(`Error updating CSVs: ${error.message}`);
                    }
                });

                // Fetch Gemini data automatically
                const geminiStatusDiv = document.getElementById('gemini-status');
                geminiStatusDiv.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"></div> Fetching production dates from Gemini...';

                try {
                    const response = await fetch(`http://localhost:3003/gemini-movie-dates/${imdbID}/${encodeURIComponent(movie.Title)}/${movie.Year}`);
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to fetch data');
                    }

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
                    geminiStatusDiv.textContent = `Error: ${error.message}`;
                    console.error('Error fetching Gemini data:', error);
                } finally {
                    setTimeout(() => geminiStatusDiv.remove(), 5000);
                }

                // Check for existing actors
                checkAndHighlightActors(tmdbCast);
                // Check for existing roles
                checkAndHighlightRoles(imdbID, movie.Title, tmdbCast);
                // Check for existing roles
                checkAndHighlightRoles(imdbID, movie.Title, tmdbCast);

                // Highlight fields
                highlightField('movie-title', movie.Title, prodData.title);
                highlightField('movie-year', movie.Year, prodData.year);
                highlightField('movie-type', movie.Type, prodData.type);
                highlightField('movie-franchise', '', prodData.franchise);
                highlightField('production-start', document.getElementById('production-start').value, prodData.production_start);
                highlightField('production-end', document.getElementById('production-end').value, prodData.production_end);
                highlightField('release-date', formatDate(movie.Released), prodData.release_date);
                highlightField('imdb-rating', movie.imdbRating, prodData.imdb_rating);
                highlightField('box-office', movie.BoxOffice, prodData.box_office_us);
                highlightField('poster-url', highResPoster, prodData.poster);

            } else {
                movieDetailsDiv.innerHTML = `<div class="alert alert-warning">Could not fetch details for this movie.</div>`;
            }
        } catch (error) {
            movieDetailsDiv.innerHTML = '<div class="alert alert-danger">An error occurred while fetching movie details.</div>';
            console.error('Fetch movie details error:', error);
        }
    }
});