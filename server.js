require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const fs = require('fs'); // Import the file system module
const stringSimilarity = require('string-similarity');
const app = express();
const port = 3003;

const OMDb_API_KEY = process.env.OMDB_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TMDB_API_KEY = process.env.TMDB_API_KEY;

app.use(express.static('.'));
app.use(express.json());

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

app.get('/omdb/rating/:imdbID', async (req, res) => {
    const { imdbID } = req.params;
    const url = `http://www.omdbapi.com/?i=${imdbID}&apikey=${OMDb_API_KEY}`;

    let retries = 5;
    let delay = 500; // start with 0.5 seconds

    while (retries > 0) {
        try {
            const response = await fetch(url);

            if (!response.ok && (response.status >= 500 && response.status <= 599)) {
                throw new Error(`OMDb returned a server error: ${response.status}`);
            }

            const data = await response.json();

            if (data.Response === 'True' && data.imdbRating && data.imdbRating !== 'N/A' && data.BoxOffice && data.BoxOffice !== 'N/A') {
                return res.json({ imdbRating: data.imdbRating, BoxOffice: data.BoxOffice });
            } else {
                let errorMessage = 'OMDb response missing required fields.';
                if (data.Error) {
                    errorMessage = `OMDb API Error: ${data.Error}`;
                    // Don't retry on "Movie not found!"
                    if (data.Error === 'Movie not found!') {
                        console.error(errorMessage);
                        return res.status(404).json({ error: errorMessage });
                    }
                }
                throw new Error(errorMessage);
            }
        } catch (error) {
            console.error(`OMDb fetch error (attempt ${6 - retries}/5): ${error.message}`);
            retries--;
            if (retries === 0) {
                return res.status(500).json({ error: 'Failed to fetch data from OMDb after multiple retries.' });
            }
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }
});

function parseCsvRow(row) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"' && (i === 0 || row[i-1] !== '\\')) {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result.map(val => val.replace(/^"|"$/g, '')); // remove leading/trailing quotes
}

async function rewriteCsvWithQuotes(filePath) {
    try {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length === 0) return; // Nothing to rewrite

        const header = parseCsvRow(lines[0]);
        const newLines = [header.map(field => `"${field.replace(/"/g, '""')}"`).join(',')]; // Quote header too

        for (let i = 1; i < lines.length; i++) {
            const parsedValues = parseCsvRow(lines[i]);
            // Ensure all values are trimmed, escaped, and quoted when writing back
            const quotedValues = parsedValues.map(value => `"${value.trim().replace(/"/g, '""')}"`); // Trim, escape existing quotes and add new ones
            newLines.push(quotedValues.join(','));
        }

        fs.writeFileSync(filePath, newLines.join('\n'), 'utf-8');
        console.log(`Successfully rewrote ${filePath} with consistent quoting.`);
    } catch (error) {
        console.error(`Error rewriting ${filePath}:`, error);
    }
}

app.get('/search', async (req, res) => {
    const { title, y: year } = req.query;
    let url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${title}`;
    if (year) {
        url += `&year=${year}`;
    }

    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching from TMDb:', error);
        res.status(500).json({ error: 'Failed to fetch data from TMDb' });
    }
});

app.get('/tmdb/genres', async (req, res) => {
    const url = `https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error fetching genres from TMDb:', error);
        res.status(500).json({ error: 'Failed to fetch genres from TMDb' });
    }
});



app.get('/tmdb/movie/:tmdbID', async (req, res) => {
    const { tmdbID } = req.params;

    try {
        // 1. Get movie details from TMDb
        const movieUrl = `https://api.themoviedb.org/3/movie/${tmdbID}?api_key=${TMDB_API_KEY}`;
        const movieResponse = await fetch(movieUrl);
        const movieData = await movieResponse.json();

        // 2. Get external IDs from TMDb
        const externalIdsUrl = `https://api.themoviedb.org/3/movie/${tmdbID}/external_ids?api_key=${TMDB_API_KEY}`;
        const externalIdsResponse = await fetch(externalIdsUrl);
        const externalIdsData = await externalIdsResponse.json();
        const imdbID = externalIdsData.imdb_id;

        // 3. Get credits from TMDb
        const creditsUrl = `https://api.themoviedb.org/3/movie/${tmdbID}/credits?api_key=${TMDB_API_KEY}`;
        const creditsResponse = await fetch(creditsUrl);
        const creditsData = await creditsResponse.json();

        // 4. Get release dates for content rating
        const releaseDatesUrl = `https://api.themoviedb.org/3/movie/${tmdbID}/release_dates?api_key=${TMDB_API_KEY}`;
        const releaseDatesResponse = await fetch(releaseDatesUrl);
        const releaseDatesData = await releaseDatesResponse.json();
        const usRelease = releaseDatesData.results.find(r => r.iso_3166_1 === 'US');
        const rating = usRelease ? usRelease.release_dates[0].certification : 'N/A';

        // 5. Construct the response
        const response = {
            title: movieData.title,
            release_date: movieData.release_date,
            vote_average: movieData.vote_average,
            revenue: movieData.revenue,
            imdb_id: imdbID,
            poster_path: movieData.poster_path,
            overview: movieData.overview,
            genres: movieData.genres,
            runtime: movieData.runtime,
            credits: creditsData,
            rating: rating,
            media_type: 'movie' // Assuming type is movie
        };

        res.json(response);

    } catch (error) {
        console.error('Error fetching from TMDb:', error);
        res.status(500).json({ error: 'Failed to fetch data from TMDb' });
    }
});

app.get('/tmdb-movie-details/:imdbID', async (req, res) => {
    const { imdbID } = req.params;
    try {
        // 1. Find TMDb movie_id from IMDb ID
        const findUrl = `https://api.themoviedb.org/3/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
        const findResponse = await fetch(findUrl);
        const findData = await findResponse.json();

        if (!findData.movie_results || findData.movie_results.length === 0) {
            return res.status(404).json({ error: 'Movie not found on TMDb' });
        }

        const tmdbMovieId = findData.movie_results[0].id;

        // 2. Get credits from TMDb
        const creditsUrl = `https://api.themoviedb.org/3/movie/${tmdbMovieId}/credits?api_key=${TMDB_API_KEY}`;
        const creditsResponse = await fetch(creditsUrl);
        const creditsData = await creditsResponse.json();

        // 3. Get external IDs for each cast member to find their IMDb ID
        const castWithImdbIds = await Promise.all(creditsData.cast.map(async (actor) => {
            const personDetailsUrl = `https://api.themoviedb.org/3/person/${actor.id}/external_ids?api_key=${TMDB_API_KEY}`;
            const personResponse = await fetch(personDetailsUrl);
            const personData = await personResponse.json();
            return {
                ...actor,
                imdb_id: personData.imdb_id,
            };
        }));

        res.json(castWithImdbIds);

    } catch (error) {
        console.error('Error fetching from TMDb:', error);
        res.status(500).json({ error: 'Failed to fetch data from TMDb' });
    }
});


async function google_web_search(query) {
    const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash-lite-001:generateContent?key=${GEMINI_API_KEY}`;
    console.log('GEMINI_API_URL:', GEMINI_API_URL);

    try {
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: query
                    }]
                }]
            }),
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts.length > 0) {
            return data.candidates[0].content.parts[0].text;
        } else {
            // Log the full response for debugging if the expected data is not found
            console.error('Unexpected Gemini API response format:', JSON.stringify(data, null, 2));
            return ''; // Return empty string if no text is found
        }
    } catch (error) {
        console.error('Error calling Gemini API:', error);
        return ''; // Return empty string in case of an error
    }
}

app.get('/list-models', async (req, res) => {
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${GEMINI_API_KEY}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Error listing models:', error);
        res.status(500).json({ error: 'Failed to list models' });
    }
});

app.get('/gemini-movie-dates/:imdbID/:title/:year', async (req, res) => {
    const { imdbID, title, year } = req.params;
    let productionStart = '';
    let productionEnd = '';

    try {
        const searchQuery = `What are the production start and end dates for the movie "${title}" (${year}) with IMDb ID ${imdbID}? Please provide the dates in YYYY-MM-DD format. For example: "Production Start: 1999-01-18; Production End: 2000-05-07". If you can only find the month and year, use the first day of the month. If there are multiple filming periods, provide the start of the first period and the end of the last period.`
        const searchResults = await google_web_search(searchQuery); // Assuming google_web_search is available and returns text

        // Implement parsing logic here to extract dates from searchResults
        const startMatch = searchResults.match(/production start:?\s*(\d{4}-\d{2}-\d{2})/i);
        if (startMatch && startMatch[1]) {
            productionStart = startMatch[1];
        }

        const endMatch = searchResults.match(/production end:?\s*(\d{4}-\d{2}-\d{2})/i);
        if (endMatch && endMatch[1]) {
            productionEnd = endMatch[1];
        }

        // Fallback if specific "production start/end" not found, try general date patterns
        if (!productionStart || !productionEnd) {
            const dateRegex = /(\d{4}-\d{2}-\d{2})/g; // Matches YYYY-MM-DD format
            const allDates = searchResults.match(dateRegex);
            if (allDates) {
                if (allDates.length >= 1) {
                    productionStart = allDates[0];
                }
                if (allDates.length >= 2) {
                    productionEnd = allDates[allDates.length - 1];
                }
            }
        }

        res.json({ productionStart, productionEnd });

    } catch (error) {
        console.error('Error fetching Gemini movie dates:', error);
        res.status(500).json({ error: 'Failed to fetch production dates from Gemini' });
    }
});

app.get('/get-actors', (req, res) => {
    try {
        const actorsCsv = fs.readFileSync('actors.csv', 'utf-8');
        const rows = actorsCsv.split('\n').filter(line => line.trim() !== '');
        const header = rows[0].split(',').map(h => h.trim());
        const actorsData = [];

        for (let i = 1; i < rows.length; i++) {
            const values = parseCsvRow(rows[i]);
            if (values.length === header.length) {
                const actor = header.reduce((obj, key, index) => {
                    obj[key] = values[index] ? values[index].trim() : '';
                    return obj;
                }, {});
                actorsData.push(actor);
            }
        }
        res.json(actorsData);
    } catch (error) {
        console.error('Error getting actors data:', error);
        res.status(500).json({ error: 'Failed to get actors data' });
    }
});

app.post('/check-role', (req, res) => {

    const { production_imdb_id, character_name } = req.body;
    if (!production_imdb_id || !character_name) {
        return res.status(400).json({ error: 'Missing production_imdb_id or character_name' });
    }

    try {
        const rolesCsv = fs.readFileSync('roles.csv', 'utf-8');
        const rows = rolesCsv.split('\n').slice(1); // Skip header

        let roleFound = false;
        for (const row of rows) {
            const columns = parseCsvRow(row);
            if (columns.length > 4) {
                const csvProductionImdbId = columns[2].trim();
                const csvCharacterName = columns[4].trim();

                if (csvProductionImdbId === production_imdb_id) {
                    let cleanedCsvCharacterName = csvCharacterName;
                    // Apply the same cleaning logic as in data-entry.js
                    if (cleanedCsvCharacterName.includes('/')) {
                        cleanedCsvCharacterName = cleanedCsvCharacterName.split('/')[0].trim();
                    }
                    if (cleanedCsvCharacterName.includes('(')) {
                        cleanedCsvCharacterName = cleanedCsvCharacterName.split('(')[0].trim();
                    }
                    const similarity = stringSimilarity.compareTwoStrings(character_name.toLowerCase(), cleanedCsvCharacterName.toLowerCase());
                    if (similarity > 0.8) { // Threshold for fuzzy matching
                        roleFound = true;
                        break;
                    }
                }
            }
        }
        res.json({ roleFound });
    } catch (error) {
        console.error('Error checking role:', error);
        res.status(500).json({ error: 'Failed to check role' });
    }
});

app.post('/check-actors', (req, res) => {

    const { actorNames } = req.body;
    if (!actorNames || !Array.isArray(actorNames)) {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    try {
        const actorsCsv = fs.readFileSync('actors.csv', 'utf-8');
        const existingActors = new Set();
        const rows = actorsCsv.split('\n').slice(1); // slice(1) to skip header
        for (const row of rows) {
            const columns = parseCsvRow(row);
            if (columns.length > 2) {
                const name = columns[2].trim();
                if(name) existingActors.add(name);
            }
        }

        const foundActors = actorNames.filter(name => existingActors.has(name));
        res.json({ foundActors });
    } catch (error) {
        console.error('Error checking actors:', error);
        res.status(500).json({ error: 'Failed to check actors' });
    }
});

app.get('/check-production/:imdbID', (req, res) => {
    const { imdbID } = req.params;

    try {
        const productionsCsv = fs.readFileSync('productions.csv', 'utf-8');
        const rows = productionsCsv.split(/\r?\n/);
        const header = parseCsvRow(rows[0]);

        const productionRow = rows.slice(1).find(row => parseCsvRow(row)[0] === imdbID);

        if (productionRow) {
            const values = parseCsvRow(productionRow);
            const productionData = header.reduce((obj, key, index) => {
                obj[key.trim()] = values[index] ? values[index].trim() : '';
                return obj;
            }, {});
            res.json(productionData);
        } else {
            res.json({}); // Return empty object if not found
        }
    } catch (error) {
        console.error('Error checking production:', error);
        res.status(500).json({ error: 'Failed to check production' });
    }
});

const clientToCsvMap = {
    'imdb_id': 'imdb_id',
    'movie_title': 'title',
    'movie_type': 'type',
    'movie_franchise': 'franchise',
    'production_start': 'production_start',
    'production_end': 'production_end',
    'release_date': 'release_date',
    'imdb_rating': 'imdb_rating',
    'box_office': 'box_office_us',
    'poster_url': 'poster'
};
const csvToClientMap = Object.fromEntries(Object.entries(clientToCsvMap).map(a => a.reverse()));

app.post('/save-production', (req, res) => {
    const productionData = req.body;
    const imdbID = productionData.imdb_id;

    if (!imdbID) {
        return res.status(400).json({ error: 'IMDb ID is required' });
    }

    try {
        const productionsCsv = fs.readFileSync('productions.csv', 'utf-8');
        const rows = productionsCsv.split(/\r?\n/);
        const header = parseCsvRow(rows[0]);
        const rowIndex = rows.findIndex(row => parseCsvRow(row)[0] === imdbID);

        if (rowIndex > -1) {
            // Update existing row
            const values = parseCsvRow(rows[rowIndex]);
            const newValues = header.map((key, index) => {
                const dataKey = csvToClientMap[key.trim()];
                if (dataKey && productionData.hasOwnProperty(dataKey)) {
                    return productionData[dataKey];
                }
                return values[index];
            });
            rows[rowIndex] = newValues.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',');
        } else {
            // Add new row
            const newValues = header.map(key => {
                const dataKey = csvToClientMap[key.trim()];
                if (dataKey && productionData.hasOwnProperty(dataKey)) {
                    return productionData[dataKey];
                }
                return '';
            });
            rows.push(newValues.map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));
        }

        fs.writeFileSync('productions.csv', rows.join('\n'));
        res.status(200).json({ message: 'Production saved successfully' });

    } catch (error) {
        console.error('Error saving production:', error);
        res.status(500).json({ error: 'Failed to save production' });
    }
});

app.post('/check-roles', (req, res) => {
    const { roles } = req.body; // roles will be an array of { actorName, characterName }
    if (!roles || !Array.isArray(roles)) {
        return res.status(400).json({ error: 'Invalid request body' });
    }

    try {
        const rolesCsv = fs.readFileSync('roles.csv', 'utf-8');
        const existingRoles = new Set();
        const rows = rolesCsv.split('\n').slice(1); // slice(1) to skip header

        for (const row of rows) {
            const columns = parseCsvRow(row); // Using the robust parseCsvRow
            if (columns.length > 4) { // Ensure all expected columns are present
                const actorName = columns[1].trim();
                const characterName = columns[4].trim();
                if (actorName && characterName) {
                    existingRoles.add(`${actorName.toLowerCase()}::${characterName.toLowerCase().replace(/[^a-z0-9]/g, '')}`);
                }
            }
        }

        const foundRoles = roles.filter(role => {
            const searchKey = `${role.actorName.toLowerCase()}::${role.characterName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
            return existingRoles.has(searchKey);
        });

        res.json({ foundRoles });
    } catch (error) {
        console.error('Error checking roles:', error);
        res.status(500).json({ error: 'Failed to check roles' });
    }
});

app.get('/get-roles-for-production/:imdbID', (req, res) => {
    const { imdbID } = req.params;

    try {
        const rolesCsv = fs.readFileSync('roles.csv', 'utf-8');
        const rows = rolesCsv.split('\n').slice(1); // Skip header
        const productionRoles = [];

        for (const row of rows) {
            const columns = parseCsvRow(row);
            if (columns.length >= 5) { // Ensure enough columns
                const csvProductionImdbId = columns[2].trim();
                if (csvProductionImdbId === imdbID) {
                    productionRoles.push({
                        actor_imdb_id: columns[0].trim(),
                        actor_name: columns[1].trim(),
                        production_imdb_id: columns[2].trim(),
                        production_title: columns[3].trim(),
                        character: columns[4].trim()
                    });
                }
            }
        }
        res.json({ productionRoles });
    } catch (error) {
        console.error('Error getting roles for production:', error);
        res.status(500).json({ error: 'Failed to get roles for production' });
    }
});

app.get('/get-actor-details-from-tmdb/:imdbID', async (req, res) => {
    const { imdbID } = req.params;
    const TMDB_API_KEY = '3f6115bbefe8f4faf26de86f75fdc9ee';

    try {
        // 1. Find TMDb person_id from IMDb ID
        const findUrl = `https://api.themoviedb.org/3/find/${imdbID}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
        const findResponse = await fetch(findUrl);
        const findData = await findResponse.json();

        if (!findData.person_results || findData.person_results.length === 0) {
            return res.status(404).json({ error: 'Actor not found on TMDb' });
        }

        const tmdbPersonId = findData.person_results[0].id;

        // 2. Get person details using TMDb person_id
        const personDetailsUrl = `https://api.themoviedb.org/3/person/${tmdbPersonId}?api_key=${TMDB_API_KEY}`;
        const personDetailsResponse = await fetch(personDetailsUrl);
        const personDetailsData = await personDetailsResponse.json();

        res.json({
            imdb_id: imdbID,
            name: personDetailsData.name || '',
            birthday: personDetailsData.birthday || ''
        });

    } catch (error) {
        console.error('Error fetching actor details from TMDb:', error);
        res.status(500).json({ error: 'Failed to fetch actor details from TMDb' });
    }
});

app.post('/save-actor', (req, res) => {
    const { imdb_id, name, birthday } = req.body;

    if (!imdb_id || !name || !birthday) {
        return res.status(400).json({ error: 'Missing imdb_id, name, or birthday' });
    }

    try {
        const actorsCsv = fs.readFileSync('actors.csv', 'utf-8');
        const rows = actorsCsv.split('\n');
        const existingActorIds = new Set(rows.map(row => parseCsvRow(row)[0]));

        if (existingActorIds.has(imdb_id)) {
            return res.status(200).json({ message: 'Actor already exists' });
        }

        const newActorRow = `\n"${imdb_id}","${name}","${birthday}"`;
        fs.appendFileSync('actors.csv', newActorRow, 'utf-8');
        res.status(200).json({ message: 'Actor saved successfully' });
    } catch (error) {
        console.error('Error saving actor:', error);
        res.status(500).json({ error: 'Failed to save actor' });
    }
});

app.post('/save-roles', (req, res) => {
    const { rolesToSave } = req.body;

    if (!rolesToSave || !Array.isArray(rolesToSave) || rolesToSave.length === 0) {
        return res.status(400).json({ error: 'No roles provided for saving' });
    }

    try {
        const rolesCsv = fs.readFileSync('roles.csv', 'utf-8');
        const existingRows = rolesCsv.split('\n').filter(line => line.trim() !== '');
        const header = existingRows[0];

        let newRows = [];
        rolesToSave.forEach(role => {
            // Ensure all fields are present and properly quoted for CSV
            const actor_imdb_id = role.actor_imdb_id || '';
            const actor_name = role.actor_name || '';
            const production_imdb_id = role.production_imdb_id || '';
            const production_title = role.production_title || '';
            const character = role.character || '';

            const newRoleRow = `"${actor_imdb_id}","${actor_name}","${production_imdb_id}","${production_title}","${character}"`;
            newRows.push(newRoleRow);
        });

        // Append only new rows, avoiding duplicates if a role already exists in the file
        // This is a simplified check; a more robust solution would parse existing roles and compare
        const currentRolesContent = fs.readFileSync('roles.csv', 'utf-8');
        const rolesToAppend = newRows.filter(newRow => !currentRolesContent.includes(newRow));

        if (rolesToAppend.length > 0) {
            fs.appendFileSync('roles.csv', '\n' + rolesToAppend.join('\n'), 'utf-8');
        }

        res.status(200).json({ message: 'Roles saved successfully' });
    } catch (error) {
        console.error('Error saving roles:', error);
        res.status(500).json({ error: 'Failed to save roles' });
    }
});

function startServer(portToTry) {
    // Rewrite CSVs with consistent quoting on startup
    rewriteCsvWithQuotes('actors.csv');
    rewriteCsvWithQuotes('productions.csv');
    rewriteCsvWithQuotes('roles.csv');

    app.listen(portToTry, () => {
        console.log(`Server running at http://localhost:${portToTry}`);
        console.log(`Data entry GUI: http://localhost:${portToTry}/data-entry.html`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`Port ${portToTry} is in use, trying port ${portToTry + 1}...`);
            startServer(portToTry + 1);
        } else {
            console.error(err);
        }
    });
}

startServer(port);
