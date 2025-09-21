document.addEventListener('DOMContentLoaded', async () => {
    const resultsDiv = document.getElementById('results');
    const searchInput = document.getElementById('searchInput');
    const ageLowerInput = document.getElementById('ageLowerInput');
    const ageUpperInput = document.getElementById('ageUpperInput');
    const sortByKey = document.getElementById('sortByKey');
    const sortOrder = document.getElementById('sortOrder');
    const searchModeBtn = document.getElementById('searchModeBtn');
    const gameModeBtn = document.getElementById('gameModeBtn');
    const searchModeContainer = document.getElementById('search-mode');
    const gameModeContainer = document.getElementById('game-mode');
    const questionEl = document.getElementById('question');
    const choicesEl = document.getElementById('choices');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const sliderContainer = document.getElementById('slider-container');
    const ageSlider = document.getElementById('ageSlider');
    const sliderValue = document.getElementById('sliderValue');
    const confirmAgeBtn = document.getElementById('confirmAgeBtn');

    let actors, productions, roles;
    let currentQuestion = {};

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

        const parsedActors = parseCsv(actorsText);
        productions = parseCsv(productionsText);
        const allRolesArray = parseCsv(rolesText);

        // Create a Map for all actors with a unique key (imdb_id-name) to handle potential duplicate imdb_ids
        const allActorsMap = new Map();
        parsedActors.forEach(actor => {
            const uniqueActorKey = `${actor.imdb_id}-${actor.name}`;
            allActorsMap.set(uniqueActorKey, actor);
        });

        // These will be used by performSearch
        actors = allActorsMap;
        roles = allRolesArray;

        if (roles.length === 0) {
            showError("No data found. Please check your CSV files.");
            hideLoading();
            return;
        }

        hideLoading();

        // Initial setup
        if (gameModeBtn.checked) {
            showGameMode();
        } else {
            showSearchMode();
        }

        searchInput.addEventListener('input', () => performSearch(actors, productions, roles));
        ageLowerInput.addEventListener('input', () => performSearch(actors, productions, roles));
        ageUpperInput.addEventListener('input', () => performSearch(actors, productions, roles));
        sortByKey.addEventListener('change', () => performSearch(actors, productions, roles));
        sortOrder.addEventListener('change', () => performSearch(actors, productions, roles));
        searchModeBtn.addEventListener('change', () => showSearchMode());
        gameModeBtn.addEventListener('change', () => showGameMode());

        nextQuestionBtn.addEventListener('click', () => {
            generateQuestion();
            displayQuestion();
        });

        choicesEl.addEventListener('click', (e) => {
            const clickedElement = e.target.closest('.list-group-item');
            if (clickedElement) {
                const selectedAnswer = clickedElement.innerHTML;
                if (selectedAnswer === currentQuestion.answer) {
                    clickedElement.classList.add('list-group-item-success');
                } else {
                    clickedElement.classList.add('list-group-item-danger');
                    // Highlight the correct answer
                    const correctChoice = Array.from(choicesEl.children).find(choice => choice.innerHTML === currentQuestion.answer);
                    if (correctChoice) {
                        correctChoice.classList.add('list-group-item-success');
                    }
                }
                // Disable further clicks
                choicesEl.style.pointerEvents = 'none';
                nextQuestionBtn.classList.remove('d-none');
            }
        });

        ageSlider.addEventListener('input', () => {
            sliderValue.textContent = ageSlider.value;
        });

        confirmAgeBtn.addEventListener('click', () => {
            const selectedAge = parseInt(ageSlider.value);
            const correctAge = currentQuestion.answer;
            if (Math.abs(selectedAge - correctAge) <= 1) {
                // Correct answer
                sliderValue.classList.add('text-success');
                sliderValue.textContent = `Correct! The answer was ${correctAge}.`;
            } else {
                // Incorrect answer
                sliderValue.classList.add('text-danger');
                sliderValue.textContent = `Your guess: ${selectedAge}. Correct answer: ${correctAge}.`;
            }
            ageSlider.disabled = true;
            confirmAgeBtn.classList.add('d-none');
            nextQuestionBtn.classList.remove('d-none');
        });

    } catch (error) {
        showError('Error loading or processing data.');
        console.error(error);
    }

    function showSearchMode() {
        searchModeContainer.classList.remove('d-none');
        gameModeContainer.classList.add('d-none');
        performSearch(actors, productions, roles);
    }

    function showGameMode() {
        searchModeContainer.classList.add('d-none');
        gameModeContainer.classList.remove('d-none');

        // Apply filtering for game mode
        const actorRoleCounts = new Map();
        roles.forEach(role => {
            const uniqueActorKey = `${role.actor_imdb_id}-${role.actor_name}`;
            actorRoleCounts.set(uniqueActorKey, (actorRoleCounts.get(uniqueActorKey) || 0) + 1);
        });

        const gameActorsArray = Array.from(actors.values()).filter(actor => {
            const uniqueActorKey = `${actor.imdb_id}-${actor.name}`;
            return actorRoleCounts.get(uniqueActorKey) >= 4;
        });

        const gameActorsMap = new Map();
        gameActorsArray.forEach(actor => {
            const uniqueActorKey = `${actor.imdb_id}-${actor.name}`;
            gameActorsMap.set(uniqueActorKey, actor);
        });

        const validGameActorKeys = new Set(Array.from(gameActorsMap.keys()));
        const gameRoles = roles.filter(role => validGameActorKeys.has(`${role.actor_imdb_id}-${role.actor_name}`));

        if (gameRoles.length === 0) {
            showError("No suitable data found to generate questions for Game Mode. Please check your CSV files or relax the actor role count criteria.");
            return;
        }

        generateQuestion(gameActorsMap, gameRoles);
        displayQuestion();
    }

    function generateQuestion() {
        let questionGenerated = false;
        let attempts = 0;
        while (!questionGenerated && attempts < 100) {
            attempts++;
            const randomRole = roles[Math.floor(Math.random() * roles.length)];
            const actor = actors.get(`${randomRole.actor_imdb_id}-${randomRole.actor_name}`);
            const production = productions.find(p => p.imdb_id === randomRole.production_imdb_id);

            // Ensure actor and production are found for the random role
            if (!actor || !production || !actor['birthday (YYYY-MM-DD)'] || !production.production_start) {
                continue;
            }

            const birthday = new Date(actor['birthday (YYYY-MM-DD)']);
            const productionStart = new Date(production.production_start);
            const age = calculateAge(birthday, productionStart);

            const questionType = Math.floor(Math.random() * 5); // 5 question types now
            let choices = [];
            let distractors = [];
            currentQuestion.type = 'multiple-choice'; // Default type

            switch (questionType) {
                case 0: // Which actor was X years old...?
                    distractors = getActorDistractors(actor, randomRole, production, 3, age, roles, actors);
                    if (distractors.length < 3) continue;
                    currentQuestion.question = `Which actor was ${age} years old at the start of production for <em>${production.title}</em>?`;
                    currentQuestion.answer = `<strong>${actor.name}</strong> as ${randomRole.character}`;
                    choices = distractors.map(r => `<strong>${r.actor_name}</strong> as ${r.character}`);
                    choices.push(currentQuestion.answer);
                    choices.sort();
                    break;
                case 1: // Actor X was Y years old for which movie?
                    distractors = getProductionDistractors(actor.imdb_id, production, 3, roles);
                    if (distractors.length < 3) continue;
                    currentQuestion.question = `Actor <strong>${actor.name}</strong> was ${age} years old during the start of production for which movie?`;
                    currentQuestion.answer = `<em>${production.title}</em> as ${randomRole.character}`;
                    choices = distractors.map(p => `<em>${p.production_title}</em> as ${p.character}`);
                    choices.push(currentQuestion.answer);
                    choices.sort();
                    break;
                case 2: // How old was actor X...?
                    distractors = getAgeDistractors(age, 3);
                    if (distractors.length < 3) continue;
                    currentQuestion.question = `How old was <strong>${actor.name}</strong> as ${randomRole.character} at the start of production for <em>${production.title}</em>?`;
                    currentQuestion.answer = `${age}`;
                    choices = distractors;
                    choices.push(currentQuestion.answer);
                    choices.sort((a, b) => a - b);
                    break;
                case 3: // What role did actor X play in production Y?
                    distractors = getRoleDistractors(actor.imdb_id, production.imdb_id, randomRole.character, 3, roles);
                    if (distractors.length < 3) continue;
                    currentQuestion.question = `What role did <strong>${actor.name}</strong> play in <em>${production.title}</em>?`;
                    currentQuestion.answer = `${randomRole.character}`;
                    choices = distractors;
                    choices.push(currentQuestion.answer);
                    choices.sort();
                    break;
                case 4: // How old was actor X...? (Slider version)
                    const minOffset = Math.floor(Math.random() * 8) + 3; // Random number between 3 and 10
                    const maxOffset = Math.floor(Math.random() * 8) + 3; // Random number between 3 and 10
                    const sliderMin = Math.max(10, age - minOffset);
                    const sliderMax = age + maxOffset;

                    ageSlider.min = sliderMin;
                    ageSlider.max = sliderMax;
                    ageSlider.value = Math.floor((sliderMin + sliderMax) / 2); // Start in the middle

                    currentQuestion.question = `How old was <strong>${actor.name}</strong> as ${randomRole.character} at the start of production for <em>${production.title}</em>?`;
                    currentQuestion.answer = age;
                    currentQuestion.type = 'slider';
                    choices = []; // No choices for slider
                    break;
            }
            currentQuestion.choices = choices;
            questionGenerated = true;
        }
        if (!questionGenerated) {
            showError("Couldn't generate a question with enough choices. Please check your data or criteria.");
        }
    }

    function displayQuestion() {
        questionEl.innerHTML = currentQuestion.question;
        choicesEl.innerHTML = '';
        sliderContainer.classList.add('d-none');
        choicesEl.classList.remove('d-none');
        confirmAgeBtn.classList.remove('d-none');


        if (currentQuestion.type === 'slider') {
            choicesEl.classList.add('d-none');
            sliderContainer.classList.remove('d-none');
            ageSlider.disabled = false;
            confirmAgeBtn.disabled = false;
            sliderValue.classList.remove('text-success', 'text-danger');
            sliderValue.textContent = ageSlider.value;
        } else {
            currentQuestion.choices.forEach(choice => {
                const choiceEl = document.createElement('button');
                choiceEl.type = 'button';
                choiceEl.classList.add('list-group-item', 'list-group-item-action');
                choiceEl.innerHTML = choice;
                choicesEl.appendChild(choiceEl);
            });
        }
        choicesEl.style.pointerEvents = 'auto';
        nextQuestionBtn.classList.add('d-none');
    }

    function getAgeDistractors(correctAge, count) {
        const distractors = new Set([correctAge]);
        let attempts = 0;
        while (distractors.size < count + 1 && attempts < 100) {
            attempts++;
            const min = Math.max(18, correctAge - 6);
            const max = correctAge + 6;
            let distractor = Math.floor(Math.random() * (max - min + 1)) + min;
            let tooClose = false;
            for (const existing of distractors) {
                if (Math.abs(distractor - existing) < 2) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) {
                distractors.add(distractor);
            }
        }
        distractors.delete(correctAge);
        return Array.from(distractors).map(String);
    }

    function getActorDistractors(correctActor, correctRole, production, count, correctAge) {
        const productionRoles = roles.filter(r => r.production_imdb_id === production.imdb_id && r.actor_imdb_id !== correctActor.imdb_id);
        const potentialDistractors = [];
        for (const role of productionRoles) {
            const actor = actors.get(`${role.actor_imdb_id}-${role.actor_name}`);
            if (actor && actor['birthday (YYYY-MM-DD)'] && production.production_start) {
                const age = calculateAge(new Date(actor['birthday (YYYY-MM-DD)']), new Date(production.production_start));
                if (Math.abs(age - correctAge) > 1) {
                    potentialDistractors.push({ role, age, diff: Math.abs(age - correctAge) });
                }
            }
        }
        potentialDistractors.sort((a, b) => a.diff - b.diff);
        return potentialDistractors.slice(0, count).map(d => d.role);
    }

    function getProductionDistractors(actorId, correctProduction, count) {
        const distractors = new Set();
        const actorRoles = roles.filter(r => r.actor_imdb_id === actorId && r.production_imdb_id !== correctProduction.imdb_id);
        while (distractors.size < count && actorRoles.length > 0) {
            const randomRole = actorRoles.splice(Math.floor(Math.random() * actorRoles.length), 1)[0];
            distractors.add(randomRole);
        }
        return Array.from(distractors);
    }

    function getRoleDistractors(actorId, productionId, correctRole, count) {
        const distractors = new Set();
        const productionRoles = roles.filter(r => r.production_imdb_id === productionId && r.character !== correctRole);

        while (distractors.size < count && productionRoles.length > 0) {
            const randomRole = productionRoles.splice(Math.floor(Math.random() * productionRoles.length), 1)[0];
            distractors.add(randomRole.character);
        }
        return Array.from(distractors);
    }

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
});

function performSearch(actors, productions, roles) {
    const searchInput = document.getElementById('searchInput').value.toLowerCase();
    const searchTerms = searchInput.split(/[,;]/).map(term => term.trim()).filter(term => term.length > 0);
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
        const actor = actors.get(`${role.actor_imdb_id}-${role.actor_name}`);
        const production = productions.find(p => p.imdb_id === role.production_imdb_id);

        if (actor && production && actor['birthday (YYYY-MM-DD)'] && production.production_start) {
            // General search filter
            if (searchTerms.length > 0) {
                const searchString = `${actor.name} ${role.character} ${production.title}`.toLowerCase();
                let allTermsMatch = true;
                for (const term of searchTerms) {
                    if (!searchString.includes(term)) {
                        allTermsMatch = false;
                        break;
                    }
                }
                if (!allTermsMatch) {
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
        html += `<li class="list-group-item"><strong>${result.actorName}</strong> was ${ageDisplay} years old as ${result.character} in <em>${result.productionTitle}</em></li>`;
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