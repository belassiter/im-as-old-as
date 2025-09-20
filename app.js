document.addEventListener('DOMContentLoaded', async () => {
    const resultsDiv = document.getElementById('results');
    const searchInput = document.getElementById('searchInput');
    const ageLowerInput = document.getElementById('ageLowerInput');
    const ageUpperInput = document.getElementById('ageUpperInput');
    const sortByKey = document.getElementById('sortByKey');
    const sortOrder = document.getElementById('sortOrder');

    showLoading();

    try {
        const [actorsRes, productionsRes, rolesRes] = await Promise.all([
            fetch('actors.csv'),
            fetch('productions.csv'),
            fetch('roles.csv')
        ]);

        const [actorsText, productionsText, rolesText] = await Promise.all([
            actorsRes.text(),
            productionsRes.text(),
            rolesRes.text()
        ]);

        const actors = parseCsv(actorsText);
        const productions = parseCsv(productionsText);
        const roles = parseCsv(rolesText);

        hideLoading();

        // Initial search
        performSearch(actors, productions, roles);

        searchInput.addEventListener('input', () => performSearch(actors, productions, roles));
        ageLowerInput.addEventListener('input', () => performSearch(actors, productions, roles));
        ageUpperInput.addEventListener('input', () => performSearch(actors, productions, roles));
        sortByKey.addEventListener('change', () => performSearch(actors, productions, roles));
        sortOrder.addEventListener('change', () => performSearch(actors, productions, roles));

    } catch (error) {
        showError('Error loading or processing data.');
        console.error(error);
    }
});

function performSearch(actors, productions, roles) {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const ageLowerInput = document.getElementById('ageLowerInput').value;
    const ageUpperInput = document.getElementById('ageUpperInput').value;

    let ageLower = parseInt(ageLowerInput);
    let ageUpper = parseInt(ageUpperInput);

    if (ageLowerInput && !ageUpperInput) {
        ageUpper = ageLower;
    } else if (!ageLowerInput && ageUpperInput) {
        ageLower = ageUpper;
    } else if (ageLowerInput && ageUpperInput) {
        if (ageLower > ageUpper) {
            [ageLower, ageUpper] = [ageUpper, ageLower];
        }
    } else {
        ageLower = 0;
        ageUpper = Infinity;
    }

    const sortByKey = document.getElementById('sortByKey').value;
    const sortOrder = document.getElementById('sortOrder').value;

    let results = [];
    const seenResults = new Set();

    for (const role of roles) {
        const actor = actors.find(a => a.imdb_id === role.actor_imdb_id);
        const production = productions.find(p => p.imdb_id === role.production_imdb_id);

        if (actor && production && actor['birthday (YYYY-MM-DD)'] && production.production_start) {
            // General search filter
            if (searchInput) {
                const searchString = `${actor.name} ${role.character} ${production.franchise} ${production.title}`.toLowerCase();
                if (!searchString.includes(searchInput)) {
                    continue;
                }
            }

            

            const birthday = new Date(actor['birthday (YYYY-MM-DD)']);
            const productionStart = new Date(production.production_start);
            const productionEnd = production.production_end ? new Date(production.production_end) : productionStart;

            const ageAtStart = calculateAge(birthday, productionStart);
            const ageAtEnd = calculateAge(birthday, productionEnd);

            if (ageLower <= ageAtEnd && ageAtStart <= ageUpper) {
                // Create a unique identifier for the result
                const resultIdentifier = `${actor.imdb_id}-${production.imdb_id}-${role.character}`;

                if (!seenResults.has(resultIdentifier)) {
                    seenResults.add(resultIdentifier);
                    results.push({
                        actorName: role.actor_name,
                        productionTitle: role.production_title,
                        character: role.character,
                        ageAtStart: ageAtStart,
                        ageAtEnd: ageAtEnd
                    });
                }
            }
        }
    }

    // Apply sorting
    results.sort((a, b) => {
        let valA, valB;

        if (sortByKey === 'ageAtStart') {
            valA = a.ageAtStart;
            valB = b.ageAtStart;
        } else {
            valA = a[sortByKey].toLowerCase();
            valB = b[sortByKey].toLowerCase();
        }

        if (valA < valB) {
            return sortOrder === 'asc' ? -1 : 1;
        } else if (valA > valB) {
            return sortOrder === 'asc' ? 1 : -1;
        }
        return 0;
    });

    displayResults(results);
}

function displayResults(results) {
    const resultsDiv = document.getElementById('results');
    if (results.length === 0) {
        resultsDiv.innerHTML = '<div class="alert alert-warning">No results found.</div>';
        return;
    }

    let html = '<ul class="list-group">';
    for (const result of results) {
        const ageDisplay = result.ageAtStart === result.ageAtEnd ? result.ageAtStart : `${result.ageAtStart}-${result.ageAtEnd}`;
        html += `<li class="list-group-item"><strong>${result.actorName}</strong> was ${ageDisplay} years old as <em>${result.character}</em> in ${result.productionTitle}</li>`;
    }
    html += '</ul>';
    resultsDiv.innerHTML = html;
}



function calculateAge(birthDate, otherDate) {
    let age = otherDate.getFullYear() - birthDate.getFullYear();
    const m = otherDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && otherDate.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

function parseCsv(text) {
    const lines = text.split('\n').filter(line => line.trim() !== '');
    const header = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map(line => {
        const values = line.split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/);
        const row = {};
        header.forEach((h, i) => {
            row[h] = values[i] ? values[i].trim().replace(/^"|"$/g, '') : '';
        });
        return row;
    });
    return rows;
}

function showLoading() {
    document.getElementById('results').innerHTML = `
        <div class="d-flex justify-content-center">
            <div class="spinner-border" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
        </div>`;
}

function hideLoading() {
    document.getElementById('results').innerHTML = '';
}

function showError(message) {
    document.getElementById('results').innerHTML = `<div class="alert alert-danger">${message}</div>`;
}
