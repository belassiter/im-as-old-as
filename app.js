let actors, productions, roles;
let absoluteMinYear, absoluteMaxYear;
let currentQuestion = {};
let players = [];
let currentPlayerIndex = 0;
let currentRound = 1;
let questionsPerRound = 3;
let questionsAnsweredInRound = 0;
let usedQuestions = new Set();
let usedFranchises = new Set();
let usedActorsForImdbQuestions = new Set();
let _lastRoundBaselineRange = null; // saved user-chosen year range at start of a round; restored after the round
const colors = ['#fd7e14', '#198754', '#0d6efd', '#6f42c1'];
const roundTitles = [
    "Actors and Roles",
    "How old were they?",
    "Filmography / Production age",
    "Ordering Box Office & IMDb ratings",
    "Production age: hard mode"
];
const roundPoints = [1, 3, 5, 10, 10];

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
    const playerSetup = document.getElementById('player-setup');
    const playerCountSlider = document.getElementById('player-count-slider');
    const playerCountValue = document.getElementById('player-count-value');
    const playerNamesContainer = document.getElementById('player-names-container');
    const questionsPerRoundSlider = document.getElementById('questions-per-round-slider');
    const questionsPerRoundValue = document.getElementById('questions-per-round-value');
    const readyBtn = document.getElementById('ready-btn');
    const gameContainer = document.getElementById('game-container');
    const playerScoresContainer = document.getElementById('player-scores');
    const currentPlayerNameEl = document.getElementById('current-player-name');
    const roundNumberEl = document.getElementById('round-number');
    const feedbackEl = document.getElementById('feedback');
    const roundStart = document.getElementById('round-start');
    const roundStartTitle = document.getElementById('round-start-title');
    const roundStartDescription = document.getElementById('round-start-description');
    const startRoundBtn = document.getElementById('start-round-btn');
    const questionCard = gameContainer.querySelector('.card');
    const gameOver = document.getElementById('game-over');
    const finalScores = document.getElementById('final-scores');
    const newGameBtn = document.getElementById('new-game-btn');
    const globalNewGameBtn = document.getElementById('global-new-game-btn');
    let gameHasStarted = false;
    const questionPoster = document.getElementById('question-poster');

    function getPointsString(points) {
        return points === 1 ? '1 point' : `${points} points`;
    }

    showLoading();

    try {
        const [actorsRes, productionsRes, rolesRes, genresRes] = await Promise.all([
            fetch('actors.csv'),
            fetch('productions.csv'),
            fetch('roles.csv'),
            fetch('genres.csv')
        ]);

        // Fail early with a clear error if any of the CSVs couldn't be fetched (404/500)
        const failed = [];
        if (!actorsRes.ok) failed.push(`actors.csv (${actorsRes.status})`);
        if (!productionsRes.ok) failed.push(`productions.csv (${productionsRes.status})`);
        if (!rolesRes.ok) failed.push(`roles.csv (${rolesRes.status})`);
        if (!genresRes.ok) failed.push(`genres.csv (${genresRes.status})`);
        if (failed.length > 0) {
            throw new Error(`Failed to fetch required data files: ${failed.join(', ')}`);
        }

        const [actorsText, productionsText, rolesText, genresText] = await Promise.all([
            actorsRes.text(),
            productionsRes.text(),
            rolesRes.text(),
            genresRes.text()
        ]);

        const parsedActors = parseCsv(actorsText);
        productions = parseCsv(productionsText);
        const allRolesArray = parseCsv(rolesText);
        const genres = parseCsv(genresText);

        populateGenreModal(genres, productions);
        populateFranchiseModal(productions);

        // Helper to safely parse a release year from a release_date string like "YYYY-MM-DD"
        function parseReleaseYear(releaseDate) {
            if (!releaseDate) return NaN;
            const s = String(releaseDate).trim();
            if (s.length === 0) return NaN;
            console.log('Parsing release date:', s); // for debugging
            const parts = s.split('-');
            if (parts.length !== 3) {
                console.warn('Invalid date format:', s);
                return NaN;
            }
            const y = parseInt(parts[0]);
            if (String(y).length !== 4) {
                console.warn('Invalid year format:', y);
                return NaN;
            }
            return isNaN(y) ? NaN : y;
        }

        // Robustly extract release years; guard against missing/empty release_date values
        const releaseYears = productions.map(p => parseReleaseYear(p && p.release_date)).filter(y => !isNaN(y));

        if (releaseYears.length === 0) {
            console.warn('No valid release years found in productions data. Check productions.csv on the server.');
            // Fallback to a reasonable default range if nothing valid found
            absoluteMinYear = 1900;
            absoluteMaxYear = new Date().getFullYear();
        } else {
            absoluteMinYear = Math.min(...releaseYears);
            absoluteMaxYear = Math.max(...releaseYears);
        }

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

        searchInput.addEventListener('input', () => performSearch());
        ageLowerInput.addEventListener('input', () => performSearch());
        ageUpperInput.addEventListener('input', () => performSearch());
        sortByKey.addEventListener('change', () => performSearch());
        sortOrder.addEventListener('change', () => performSearch());
        searchModeBtn.addEventListener('change', () => showSearchMode());
        gameModeBtn.addEventListener('change', () => showGameMode());

        nextQuestionBtn.addEventListener('click', () => {
            questionsAnsweredInRound++;
            if (questionsAnsweredInRound >= questionsPerRound * players.length) {
                currentRound++;
                questionsAnsweredInRound = 0;
                if (currentRound > roundTitles.length) {
                    displayFinalScores();
                    return;
                }
                showRoundStartScreen();
                return;
            }
            
            currentPlayerIndex = (currentPlayerIndex + 1) % players.length;

            generateQuestion(currentRound);
            displayQuestion();
        });

        // Helper to process a clicked choice element
        function handleChoiceSelection(clickedElement) {
            try {
                if (!clickedElement) return;

                if (currentQuestion.choiceItems && currentQuestion.answerIndex != null) {
                    const idx = clickedElement.dataset.index ? parseInt(clickedElement.dataset.index, 10) : -1;
                    Array.from(choicesEl.children).forEach((child, i) => {
                        const ci = currentQuestion.choiceItems[i] || {};
                        if (ci.actorName) {
                            child.innerHTML = `${ci.label} — <strong>${ci.actorName}</strong>`;
                        } else if (typeof ci.age !== 'undefined' && ci.age !== null) {
                            child.innerHTML = `${ci.label} — ${ci.age} years old`;
                        } else {
                            child.innerHTML = ci.label || '';
                        }
                        child.classList.remove('list-group-item-success', 'list-group-item-danger');
                        if (i === Number(currentQuestion.answerIndex)) child.classList.add('list-group-item-success');
                        else child.classList.add('list-group-item-danger');
                    });

                    if (idx === Number(currentQuestion.answerIndex)) {
                        players[currentPlayerIndex].score += currentQuestion.score || 0;
                        feedbackEl.innerHTML = `<div class="alert alert-success">Correct! You scored ${getPointsString(currentQuestion.score || 0)}.</div>`;
                    } else {
                        feedbackEl.innerHTML = `<div class="alert alert-danger">Incorrect!</div>`;
                    }
                } else {
                    const selectedAnswer = clickedElement.innerHTML;
                    if (selectedAnswer === currentQuestion.answer) {
                        clickedElement.classList.add('list-group-item-success');
                        players[currentPlayerIndex].score += currentQuestion.score || 0;
                        feedbackEl.innerHTML = `<div class="alert alert-success">Correct! You scored ${getPointsString(currentQuestion.score || 0)}.</div>`;
                    } else {
                        clickedElement.classList.add('list-group-item-danger');
                        const correctChoice = Array.from(choicesEl.children).find(choice => choice.innerHTML === currentQuestion.answer);
                        if (correctChoice) correctChoice.classList.add('list-group-item-success');
                        feedbackEl.innerHTML = `<div class="alert alert-danger">Incorrect!</div>`;
                    }
                }
            } catch (err) {
                console.error('Error in handleChoiceSelection', err, { currentQuestion });
                feedbackEl.innerHTML = `<div class="alert alert-warning">An error occurred while evaluating the answer. Continuing.</div>`;
            } finally {
                try { displayPlayerScores(); } catch (err) { console.error('displayPlayerScores failed', err); }
                choicesEl.style.pointerEvents = 'none';
                try { nextQuestionBtn.classList.remove('d-none'); } catch (err) { console.error('failed to show nextQuestionBtn', err); }
            }
        }

        choicesEl.addEventListener('click', (e) => {
            console.debug('choicesEl received click', e.target);
            try {
                const clickedElement = e.target.closest('.list-group-item');
                if (!clickedElement) return;
                handleChoiceSelection(clickedElement);
            } catch (err) {
                console.error('Error handling delegated choice click', err);
            }
        });

        ageSlider.addEventListener('input', () => {
            sliderValue.textContent = ageSlider.value;
        });

        confirmAgeBtn.addEventListener('click', () => {
            const selectedAge = parseInt(ageSlider.value);
            const correctAge = currentQuestion.answer;
            const diff = Math.abs(selectedAge - correctAge);
            let score = 0;
            if (diff === 0) {
                score = 10;
            } else if (diff === 1) {
                score = 7;
            } else if (diff === 2) {
                score = 3;
            }

            if (score > 0) {
                // Correct answer
                players[currentPlayerIndex].score += score;
                if (diff === 0) {
                    feedbackEl.innerHTML = `<div class="alert alert-success">Correct! You scored ${getPointsString(score)}.</div>`;
                } else {
                    feedbackEl.innerHTML = `<div class="alert alert-success">Close! The correct answer was ${correctAge}. You scored ${getPointsString(score)}.</div>`;
                }
            } else {
                // Incorrect answer
                feedbackEl.innerHTML = `<div class="alert alert-danger">Incorrect! The correct answer was ${correctAge}.</div>`;
            }
            displayPlayerScores();
            ageSlider.disabled = true;
            confirmAgeBtn.classList.add('d-none');
            nextQuestionBtn.classList.remove('d-none');
        });

        const confirmMatchBtn = document.getElementById('confirmMatchBtn');
        confirmMatchBtn.addEventListener('click', () => {
            const dragList = document.getElementById('drag-list');
            const userOrder = Array.from(dragList.children).map(li => li.dataset.id);
            const correctOrder = currentQuestion.correctOrder;

            let correct_answers = 0;
            for (let i = 0; i < userOrder.length; i++) {
                if (userOrder[i] === correctOrder[i]) {
                    correct_answers++;
                }
            }

            const permutation = userOrder.map(id => correctOrder.indexOf(id));
            const swaps = countBubbleSortSwaps(permutation);

            let score = correct_answers * 2 - swaps + 2;
            if (score < 0) {
                score = 0;
            }

            if (score > 0) {
                players[currentPlayerIndex].score += score;
                feedbackEl.innerHTML = `<div class="alert alert-success">You scored ${getPointsString(score)}.</div>`;
            } else {
                feedbackEl.innerHTML = `<div class="alert alert-danger">Incorrect!</div>`;
            }

            // Show correct order and feedback
            const dragListItems = dragList.querySelectorAll('li');
            const matchList = document.getElementById('match-list');
            const matchListItems = matchList.querySelectorAll('li');

            for (let i = 0; i < userOrder.length; i++) {
                const userMovieId = userOrder[i];
                const correctMovieId = correctOrder[i];
                const dragItem = Array.from(dragListItems).find(item => item.dataset.id === userMovieId);

                if (userMovieId === correctMovieId) {
                    dragItem.classList.add('list-group-item-success');
                    matchListItems[i].classList.add('list-group-item-success');
                } else {
                    dragItem.classList.add('list-group-item-danger');
                }
                
                const correctMovieInfo = currentQuestion.movies.find(m => m.id === correctMovieId);
                let titleToShow = correctMovieInfo.title;
                if (currentQuestion.subType === 'box-office') {
                    titleToShow = `<em>${titleToShow}</em> (as ${correctMovieInfo.character})`;
                }
                
                matchListItems[i].innerHTML = `${currentQuestion.revenues[i]} - ${titleToShow}`;
            }

            synchronizeHeights(dragList, matchList);

            displayPlayerScores();
            confirmMatchBtn.classList.add('d-none');
            nextQuestionBtn.classList.remove('d-none');
        });

        playerCountSlider.addEventListener('input', () => {
            const count = playerCountSlider.value;
            playerCountValue.textContent = count;
            generatePlayerNameInputs(count);
        });

        questionsPerRoundSlider.addEventListener('input', () => {
            questionsPerRoundValue.textContent = questionsPerRoundSlider.value;
        });

        readyBtn.addEventListener('click', () => {
            const inputs = playerNamesContainer.querySelectorAll('input');
            const names = Array.from(inputs).map(input => input.value.trim());
            const uniqueNames = new Set(names);

            if (uniqueNames.size !== names.length) {
                showError("Player names must be unique.");
                return;
            }
            
            players = [];
            names.forEach((name, index) => {
                players.push({ name: name, score: 0, color: colors[index % colors.length] });
            });
            questionsPerRound = parseInt(questionsPerRoundSlider.value);

            usedQuestions.clear();
            usedFranchises.clear();
            usedActorsForImdbQuestions.clear();
            // Reset alternation for rounds 3/4 when a new game starts
            if (typeof generateQuestion !== 'undefined') {
                generateQuestion._nextType = Math.random() < 0.5 ? 1 : 2;
            }
            playerSetup.classList.add('d-none');
            gameContainer.classList.remove('d-none');
            // Mark that a game has been started and show the global New Game button
            gameHasStarted = true;
            if (globalNewGameBtn) globalNewGameBtn.classList.remove('d-none');
            currentPlayerIndex = 0;
            currentRound = 1;
            questionsAnsweredInRound = 0;

            showRoundStartScreen();
        });

        startRoundBtn.addEventListener('click', () => {
            roundStart.classList.add('d-none');
            questionCard.classList.remove('d-none');
            playerScoresContainer.classList.remove('d-none');
            // Save the baseline year range for this round so any expansion is local to the round
            const yearRangeSlider = document.getElementById('year-range-slider');
            try {
                _lastRoundBaselineRange = yearRangeSlider.noUiSlider.get().map(v => Number(v));
            } catch (err) {
                _lastRoundBaselineRange = null;
            }
            generateQuestion(currentRound);
            displayQuestion();
        });

        newGameBtn.addEventListener('click', () => {
            gameOver.classList.add('d-none');
            gameHasStarted = false;
            if (globalNewGameBtn) globalNewGameBtn.classList.add('d-none');
            showGameMode();
        });

        // Global New Game button (to the right of the Search/Game toggle)
        if (globalNewGameBtn) {
            globalNewGameBtn.addEventListener('click', () => {
                // Reset UI to player setup like clicking New Game
                gameHasStarted = false;
                globalNewGameBtn.classList.add('d-none');
                // Hide any game containers and show player setup
                gameContainer.classList.add('d-none');
                playerSetup.classList.remove('d-none');
                gameOver.classList.add('d-none');
                // Reset players and scores
                players = [];
                usedQuestions.clear();
                usedFranchises.clear();
                usedActorsForImdbQuestions.clear();
            });
        }

    } catch (error) {
        // Ensure the loading spinner is removed when an error occurs
        hideLoading();
        showError('Error loading or processing data.');
        console.error(error);
    }

    function showSearchMode() {
        searchModeContainer.classList.remove('d-none');
        gameModeContainer.classList.add('d-none');
        performSearch();
    }

    function showGameMode() {
        searchModeContainer.classList.add('d-none');
        gameModeContainer.classList.remove('d-none');
        playerSetup.classList.remove('d-none');
        gameContainer.classList.add('d-none');
        gameOver.classList.add('d-none');
        // Show global new game button if a game has started
        if (globalNewGameBtn) {
            if (gameHasStarted) globalNewGameBtn.classList.remove('d-none');
            else globalNewGameBtn.classList.add('d-none');
        }
        const count = playerCountSlider.value;
        playerCountValue.textContent = count;
        generatePlayerNameInputs(count);

        const yearRangeValueSpan = document.getElementById('year-range-value');
        const yearRangeSlider = document.getElementById('year-range-slider');

        if (!yearRangeSlider.noUiSlider) {
            noUiSlider.create(yearRangeSlider, {
                start: [absoluteMinYear, absoluteMaxYear],
                connect: true,
                range: {
                    'min': absoluteMinYear,
                    'max': absoluteMaxYear
                },
                step: 1,
                tooltips: false,
                format: {
                    to: value => Math.round(value),
                    from: value => Math.round(value)
                }
            });

            yearRangeSlider.noUiSlider.on('update', (values, handle) => {
                yearRangeValueSpan.textContent = `${values[0]} - ${values[1]}`;
                updateAvailableCounts();
            });
        }
        updateAvailableCounts();
    }

    function showRoundStartScreen() {
        if (currentRound === 5) {
            usedFranchises.clear();
            usedActorsForImdbQuestions.clear();
        }
        // Restore baseline year range saved at the start of prior round (so expansions do not persist)
        if (_lastRoundBaselineRange) {
            const yearRangeSlider = document.getElementById('year-range-slider');
            try {
                yearRangeSlider.noUiSlider.set([_lastRoundBaselineRange[0], _lastRoundBaselineRange[1]]);
            } catch (err) {
                // ignore if slider not initialized
            }
            _lastRoundBaselineRange = null;
        }
        roundStartTitle.textContent = `Round ${currentRound}: ${roundTitles[currentRound - 1]}`;
        const points = roundPoints[currentRound - 1];
        roundStartDescription.textContent = `Questions worth ${getPointsString(points)}.`;
        roundStart.classList.remove('d-none');
        questionCard.classList.add('d-none');
        playerScoresContainer.classList.add('d-none');
    }

    function displayFinalScores() {
        questionCard.classList.add('d-none');
        playerScoresContainer.classList.add('d-none');
        gameOver.classList.remove('d-none');
        
        const sortedPlayers = [...players].sort((a, b) => b.score - a.score);

        finalScores.innerHTML = '';
        sortedPlayers.forEach((player, index) => {
            const li = document.createElement('li');
            li.classList.add('list-group-item');
            li.innerHTML = `
                <h5>${index + 1}. <span style="color: ${player.color}">${player.name}</span> - ${player.score} points</h5>
            `;
            finalScores.appendChild(li);
        });

        const maxScore = questionsPerRound * roundPoints.reduce((a, b) => a + b, 0);
        const maxScoreEl = document.createElement('p');
        maxScoreEl.classList.add('mt-3');
        maxScoreEl.textContent = `Maximum score: ${maxScore} points`;
        finalScores.appendChild(maxScoreEl);
    }

    function generatePlayerNameInputs(count) {
        const existingNames = [];
        const inputs = playerNamesContainer.querySelectorAll('input');
        inputs.forEach(input => existingNames.push(input.value));
        const usedRoles = new Set(existingNames);

        playerNamesContainer.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const formGroup = document.createElement('div');
            formGroup.classList.add('input-group', 'mt-2');

            const label = document.createElement('span');
            label.classList.add('input-group-text');
            label.textContent = 'Name';
            formGroup.appendChild(label);

            const input = document.createElement('input');
            input.type = 'text';
            input.classList.add('form-control');
            input.style.color = colors[i % colors.length];
            if (existingNames[i]) {
                input.value = existingNames[i];
            } else {
                let randomRole;
                do {
                    randomRole = roles[Math.floor(Math.random() * roles.length)];
                } while (randomRole.character.length > 15 || usedRoles.has(randomRole.character));
                input.value = randomRole.character;
                usedRoles.add(randomRole.character);
            }
            formGroup.appendChild(input);
            playerNamesContainer.appendChild(formGroup);
        }
    }

    function displayPlayerScores() {
        playerScoresContainer.innerHTML = '';
        players.forEach((player, index) => {
            const playerEl = document.createElement('div');
            playerEl.classList.add('col', 'text-center');
            playerEl.innerHTML = `
                <h5 style="color: ${player.color}; font-size: 1rem;">${player.name}</h5>
                <p class="h5">${player.score}</p>
            `;
            if (index === currentPlayerIndex) {
                playerEl.classList.add('border', 'border-primary', 'rounded');
            }
            playerScoresContainer.appendChild(playerEl);
        });
    }

    function getSelectedGenres() {
        const allCheckbox = document.getElementById('genre-all');
        if (allCheckbox && allCheckbox.checked) {
            return []; // All genres
        }
        const selected = [];
        document.querySelectorAll('#genre-modal-body .genre-checkbox:checked').forEach(cb => {
            selected.push(...cb.value.split('|'));
        });
        return selected;
    }

    function getSelectedFranchises() {
        const allCheckbox = document.getElementById('franchise-all');
        if (allCheckbox && allCheckbox.checked) {
            return []; // All franchises
        }
        const selected = [];
        document.querySelectorAll('#franchise-modal-body .franchise-checkbox:checked').forEach(cb => {
            selected.push(...cb.value.split('|'));
        });
        return selected;
    }

    function updateAvailableCounts() {
        const yearRangeSlider = document.getElementById('year-range-slider');
        const [minYear, maxYear] = yearRangeSlider.noUiSlider.get();

        const selectedGenres = getSelectedGenres();
        const selectedFranchises = getSelectedFranchises();

        const filteredProductions = productions.filter(p => {
            const releaseYear = p.release_date ? parseInt(p.release_date.split('-')[0]) : 0;
            const yearMatch = releaseYear >= minYear && releaseYear <= maxYear;
            if (!yearMatch) return false;

            if (selectedGenres.length > 0) {
                const genreIds = p.genre_ids ? p.genre_ids.split('|') : [];
                const genreMatch = selectedGenres.some(sg => genreIds.includes(sg));
                if (!genreMatch) return false;
            }

            if (selectedFranchises.length > 0) {
                const franchise = p.franchise || '';
                if (!selectedFranchises.includes(franchise)) return false;
            }

            return true;
        });

        const filteredProductionIds = new Set(filteredProductions.map(p => p.imdb_id));

        const filteredRoles = roles.filter(r => filteredProductionIds.has(r.production_imdb_id));
        const filteredRoleCount = filteredRoles.length;

        const filteredActorIds = new Set(filteredRoles.map(r => r.actor_imdb_id));
        const filteredActorCount = filteredActorIds.size;

        const availableCountsEl = document.getElementById('available-counts');
        availableCountsEl.textContent = `Available: ${filteredProductions.length} Movies, ${filteredRoleCount} Roles, ${filteredActorCount} Actors.`;
    }

    function generateQuestion(difficulty) {
        try {
            const yearRangeSlider = document.getElementById('year-range-slider');
        let [currentMinYear, currentMaxYear] = yearRangeSlider.noUiSlider.get();
        const selectedFranchises = getSelectedFranchises();
        const selectedGenres = getSelectedGenres();

        // Prepare a per-round filtered productions list that honors the selected filters
        const filteredProductions = productions.filter(p => {
            const releaseYear = p.release_date ? parseReleaseYear(p.release_date) : NaN;
            if (isNaN(releaseYear) || releaseYear < currentMinYear || releaseYear > currentMaxYear) return false;

            if (selectedGenres.length > 0) {
                const genreIds = p.genre_ids ? p.genre_ids.split('|') : [];
                const genreMatch = selectedGenres.some(sg => genreIds.includes(sg));
                if (!genreMatch) return false;
            }

            if (selectedFranchises.length > 0) {
                const franchise = p.franchise || '';
                if (!selectedFranchises.includes(franchise)) return false;
            }

            return true;
        });

        let questionGenerated = false;
        // For alternation between question types 1 and 2 across the session
        if (typeof generateQuestion._nextType === 'undefined') {
            // randomly choose which type goes first
            generateQuestion._nextType = Math.random() < 0.5 ? 1 : 2;
        }

        if (difficulty === 4) {
            // Randomly choose franchise-based or actor-based IMDb rating question
            if (Math.random() < 0.5) {
                // Franchise box office question
                let franchiseFound = false;
                let localMinYear = currentMinYear;
                let localMaxYear = currentMaxYear;
                // Use franchises present in the currently filtered productions to respect user filters
                const allFranchises = [...new Set(filteredProductions.map(p => p.franchise).filter(f => f))];
                shuffleArray(allFranchises);

                let franchiseAttempts = 0;
                const maxFranchiseAttempts = Math.max(12, allFranchises.length * 2);

                while (!franchiseFound && franchiseAttempts < maxFranchiseAttempts) {
                    franchiseAttempts++;
                    for (const franchise of allFranchises) {
                        if (usedFranchises.has(franchise)) continue;

                        // Start from the filtered productions so franchise selection stays within the user's filters
                        let franchiseMovies = filteredProductions.filter(p =>
                            p.franchise === franchise &&
                            p.box_office_us && p.box_office_us !== 'N/A' &&
                            (function() { const ry = parseReleaseYear(p && p.release_date); return !isNaN(ry) && ry >= localMinYear && ry <= localMaxYear; })()
                        );

                        // If the franchise has fewer than 4 movies, try to supplement with similar-genre, near-year movies
                        let selectedMovies = franchiseMovies.slice();
                        if (selectedMovies.length < 4) {
                            const needed = 4 - selectedMovies.length;

                            // Build genre frequency from existing franchiseMovies
                            const genreCounts = {};
                            franchiseMovies.forEach(p => {
                                const gids = p.genre_ids ? p.genre_ids.split('|') : [];
                                gids.forEach(g => { genreCounts[g] = (genreCounts[g] || 0) + 1; });
                            });
                            const topGenres = Object.keys(genreCounts).sort((a,b) => (genreCounts[b]||0) - (genreCounts[a]||0));

                            const years = franchiseMovies.map(p => parseReleaseYear(p.release_date)).filter(y => !isNaN(y));
                            const avgYear = years.length ? Math.round(years.reduce((a,b) => a + b, 0) / years.length) : null;

                            const existingIds = new Set(selectedMovies.map(m => m.imdb_id));
                            // Allow supplement candidates from the full productions set (respecting local year bounds and box office availability)
                            let candidates = productions.filter(p => {
                                if (existingIds.has(p.imdb_id)) return false;
                                if (!p.box_office_us || p.box_office_us === 'N/A') return false;
                                const ry = parseReleaseYear(p.release_date);
                                if (isNaN(ry) || ry < localMinYear || ry > localMaxYear) return false;
                                return true;
                            });

                            const scored = candidates.map(p => {
                                const gids = p.genre_ids ? p.genre_ids.split('|') : [];
                                const genreMatches = topGenres.length ? gids.filter(g => topGenres.includes(g)).length : 0;
                                const year = parseReleaseYear(p.release_date);
                                const yearDiff = (avgYear !== null && !isNaN(year)) ? Math.abs(year - avgYear) : Infinity;
                                return { p, genreMatches, yearDiff };
                            });

                            let preferred = scored.filter(c => c.genreMatches > 0).sort((a,b) => b.genreMatches - a.genreMatches || a.yearDiff - b.yearDiff);
                            if (preferred.length < needed) {
                                const others = scored.filter(c => c.genreMatches === 0).sort((a,b) => a.yearDiff - b.yearDiff);
                                preferred = preferred.concat(others);
                            }

                            for (let i = 0; i < needed && i < preferred.length; i++) selectedMovies.push(preferred[i].p);
                        }

                        if (selectedMovies.length >= 4) {
                            shuffleArray(selectedMovies);
                            const chosen = selectedMovies.slice(0, 4);
                            currentQuestion.poster = chosen[Math.floor(Math.random() * chosen.length)].poster;
                            const parseRevenue = (revenue) => parseInt(revenue.replace(/[^\d]/g, ''));
                            chosen.sort((a, b) => parseRevenue(a.box_office_us) - parseRevenue(b.box_office_us));

                            currentQuestion.question = `Match the US Box Office revenue for these movies in the <strong>${franchise}</strong> franchise.`;
                            currentQuestion.type = 'drag-and-match';
                            currentQuestion.subType = 'box-office';
                            currentQuestion.movies = chosen.map(p => {
                                const role = roles.find(r => r.production_imdb_id === p.imdb_id);
                                return { id: p.imdb_id, title: p.title, character: role ? role.character : '' };
                            });
                            currentQuestion.revenues = chosen.map(p => p.box_office_us);
                            currentQuestion.correctOrder = chosen.map(p => p.imdb_id);
                            currentQuestion.score = 10;
                            shuffleArray(currentQuestion.movies);
                            usedFranchises.add(franchise);
                            franchiseFound = true;
                            questionGenerated = true;
                            break;
                        }
                    }

                    if (!franchiseFound) {
                        localMinYear = Math.max(absoluteMinYear, localMinYear - 2);
                        localMaxYear = Math.min(absoluteMaxYear, localMaxYear + 2);

                        if (localMinYear === absoluteMinYear && localMaxYear === absoluteMaxYear) {
                            const availableFranchises = allFranchises.filter(f => {
                                const movies = productions.filter(p => p.franchise === f && p.box_office_us && p.box_office_us !== 'N/A');
                                return movies.length >= 4;
                            });
                            if (availableFranchises.every(f => usedFranchises.has(f))) {
                                usedFranchises.clear();
                                shuffleArray(allFranchises);
                            } else if (allFranchises.filter(f => !usedFranchises.has(f)).length === 0) {
                                usedFranchises.clear();
                                shuffleArray(allFranchises);
                            }
                        }
                    }
                }

                // Franchise fallback: pick 4 random box-office movies (respect per-round filters first, then global)
                if (!franchiseFound) {
                    let fallbackPool = filteredProductions.filter(p => p.box_office_us && p.box_office_us !== 'N/A');
                    if (fallbackPool.length < 4) fallbackPool = productions.filter(p => p.box_office_us && p.box_office_us !== 'N/A');

                    if (fallbackPool.length >= 4) {
                        shuffleArray(fallbackPool);
                        const chosen = fallbackPool.slice(0, 4);
                        currentQuestion.poster = chosen[Math.floor(Math.random() * chosen.length)].poster;
                        const parseRevenue = (revenue) => parseInt(revenue.replace(/[^\d]/g, ''));
                        chosen.sort((a, b) => parseRevenue(a.box_office_us) - parseRevenue(b.box_office_us));

                        currentQuestion.question = `Match the US Box Office revenue for these movies:`;
                        currentQuestion.type = 'drag-and-match';
                        currentQuestion.subType = 'box-office';
                        currentQuestion.movies = chosen.map(p => {
                            const role = roles.find(r => r.production_imdb_id === p.imdb_id);
                            return { id: p.imdb_id, title: p.title, character: role ? role.character : '' };
                        });
                        currentQuestion.revenues = chosen.map(p => p.box_office_us);
                        currentQuestion.correctOrder = chosen.map(p => p.imdb_id);
                        currentQuestion.score = 10;
                        shuffleArray(currentQuestion.movies);
                        questionGenerated = true;
                    }
                }
            } else {
                // Actor IMDb rating question
                let actorFound = false;
                let localMinYear = currentMinYear;
                let localMaxYear = currentMaxYear;

                // Limit actors to those with roles in the filtered productions
                const allActorIds = [...new Set(roles.filter(r => filteredProductions.some(fp => fp.imdb_id === r.production_imdb_id)).map(r => r.actor_imdb_id))];
                shuffleArray(allActorIds);

                let actorAttempts = 0;
                const maxActorAttempts = Math.max(12, allActorIds.length * 2);

                while (!actorFound && actorAttempts < maxActorAttempts) {
                    actorAttempts++;
                    for (const actorId of allActorIds) {
                        if (usedActorsForImdbQuestions.has(actorId)) continue;

                        // Only consider roles that belong to the per-round filtered productions
                        const actorRoles = roles.filter(r => r.actor_imdb_id === actorId && filteredProductions.some(fp => fp.imdb_id === r.production_imdb_id));
                        const validRoles = actorRoles.filter(r => {
                            const p = productions.find(prod => prod.imdb_id === r.production_imdb_id);
                            if (!p || !p.release_date || !p.imdb_rating || p.imdb_rating === 'N/A') return false;
                            const releaseYear = parseReleaseYear(p.release_date);
                            return !isNaN(releaseYear) && releaseYear >= localMinYear && releaseYear <= localMaxYear;
                        });

                        if (validRoles.length >= 4) {
                            shuffleArray(validRoles);
                            const selectedRoles = validRoles.slice(0, 4);
                            const actor = actors.get(`${selectedRoles[0].actor_imdb_id}-${selectedRoles[0].actor_name}`);

                            const selectedItems = selectedRoles.map(r => {
                                const p = productions.find(prod => prod.imdb_id === r.production_imdb_id);
                                return { id: p.imdb_id, title: p.title, character: r.character, imdb_rating: p.imdb_rating, poster: p.poster };
                            });

                            selectedItems.sort((a, b) => parseFloat(a.imdb_rating) - parseFloat(b.imdb_rating));

                            currentQuestion.poster = selectedItems[Math.floor(Math.random() * selectedItems.length)].poster;
                            currentQuestion.question = `Order these films from <strong>${actor.name}</strong>, based on IMDb rating (1-10 scale)`;
                            currentQuestion.type = 'drag-and-match';
                            currentQuestion.subType = 'imdb-rating';
                            currentQuestion.score = 10;
                            currentQuestion.correctOrder = selectedItems.map(item => item.id);
                            currentQuestion.revenues = selectedItems.map(item => `${item.imdb_rating} ⭐`);

                            let draggableItems = selectedItems.map(item => ({ id: item.id, title: `${item.character} in <em>${item.title}</em>` }));
                            draggableItems.sort((a, b) => a.title.replace(/<\/?em>/g, '').localeCompare(b.title.replace(/<\/?em>/g, '')));
                            currentQuestion.movies = draggableItems;

                            usedActorsForImdbQuestions.add(actorId);
                            actorFound = true;
                            questionGenerated = true;
                            break;
                        }
                    }

                    if (!actorFound) {
                        localMinYear = Math.max(absoluteMinYear, localMinYear - 2);
                        localMaxYear = Math.min(absoluteMaxYear, localMaxYear + 2);

                        if (localMinYear === absoluteMinYear && localMaxYear === absoluteMaxYear) {
                            const availableActors = allActorIds.filter(id => {
                                const actorRoles = roles.filter(r => r.actor_imdb_id === id);
                                const validRoles = actorRoles.filter(r => {
                                    const p = productions.find(prod => prod.imdb_id === r.production_imdb_id);
                                    return p && p.release_date && p.imdb_rating && p.imdb_rating !== 'N/A';
                                });
                                return validRoles.length >= 4;
                            });
                            if (availableActors.every(id => usedActorsForImdbQuestions.has(id))) {
                                usedActorsForImdbQuestions.clear();
                                shuffleArray(allActorIds);
                            } else if (allActorIds.filter(id => !usedActorsForImdbQuestions.has(id)).length === 0) {
                                usedActorsForImdbQuestions.clear();
                                shuffleArray(allActorIds);
                            }
                        }
                    }
                }

                // If we couldn't find a qualifying actor after bounded attempts, fallback to random box-office pool
                if (!actorFound) {
                    let fallbackPool = filteredProductions.filter(p => p.box_office_us && p.box_office_us !== 'N/A');
                    if (fallbackPool.length < 4) fallbackPool = productions.filter(p => p.box_office_us && p.box_office_us !== 'N/A');

                    if (fallbackPool.length >= 4) {
                        shuffleArray(fallbackPool);
                        const selectedItems = fallbackPool.slice(0, 4).map(p => ({ id: p.imdb_id, title: p.title, character: (roles.find(r => r.production_imdb_id === p.imdb_id) || {}).character || '', imdb_rating: p.imdb_rating || 'N/A', poster: p.poster }));

                        selectedItems.sort((a, b) => parseFloat(a.imdb_rating || 0) - parseFloat(b.imdb_rating || 0));
                        currentQuestion.poster = selectedItems[Math.floor(Math.random() * selectedItems.length)].poster;
                        currentQuestion.question = `Order these films based on IMDb rating (fallback set)`;
                        currentQuestion.type = 'drag-and-match';
                        currentQuestion.subType = 'imdb-rating';
                        currentQuestion.score = 10;
                        currentQuestion.correctOrder = selectedItems.map(item => item.id);
                        currentQuestion.revenues = selectedItems.map(item => `${item.imdb_rating} ⭐`);
                        currentQuestion.movies = selectedItems.map(item => ({ id: item.id, title: `${item.character} in <em>${item.title}</em>` }));
                        usedActorsForImdbQuestions.add(null);
                        questionGenerated = true;
                    }
                }
            }
        } else {
            // Other difficulty branches (multiple-choice/slider/role questions)
            let attempts = 0;
            const maxAttempts = roles.length * 2;
            // selectedType is fixed for retries: when difficulty 3/4 we'll pick an alternated type and retry that type on failure
            let selectedType = null;
            while (!questionGenerated && attempts < maxAttempts) {
                attempts++;
                const randomRole = roles[Math.floor(Math.random() * roles.length)];
                const actor = actors.get(`${randomRole.actor_imdb_id}-${randomRole.actor_name}`);
                const production = productions.find(p => p.imdb_id === randomRole.production_imdb_id);

                if (!actor || !production || !actor['birthday (YYYY-MM-DD)'] || !production.production_start || !production.release_date) {
                    continue;
                }

                if (selectedFranchises.length > 0) {
                    const franchise = production.franchise || '';
                    if (!selectedFranchises.includes(franchise)) continue;
                }

                const questionId = `${randomRole.actor_imdb_id}-${randomRole.production_imdb_id}-${randomRole.character}`;
                const releaseYear = parseReleaseYear(production.release_date);

                if (releaseYear < currentMinYear || releaseYear > currentMaxYear || usedQuestions.has(questionId)) {
                    if (attempts >= maxAttempts) {
                        currentMinYear = Math.max(absoluteMinYear, currentMinYear - 2);
                        currentMaxYear = Math.min(absoluteMaxYear, currentMaxYear + 2);
                        yearRangeSlider.noUiSlider.set([currentMinYear, currentMaxYear]);
                        attempts = 0;
                    }
                    continue;
                }

                const birthday = new Date(actor['birthday (YYYY-MM-DD)']);
                const productionStart = new Date(production.production_start);
                const age = calculateAge(birthday, productionStart);

                let questionType;
                if (difficulty === 1) questionType = 3;
                else if (difficulty === 2) questionType = 0;
                else if (difficulty === 3 || difficulty === 4) {
                    // Determine selectedType once per generateQuestion call (persist across retries)
                    if (selectedType === null) {
                        // Use alternation: pick the next type and flip it for the following time
                        selectedType = generateQuestion._nextType;
                        generateQuestion._nextType = selectedType === 1 ? 2 : 1;
                    }
                    questionType = selectedType;
                } else if (difficulty === 5) questionType = 4;

                let choices = [];
                currentQuestion.type = 'multiple-choice';
                currentQuestion.poster = null;
                // Ensure any structured choice state from previous questions is cleared
                delete currentQuestion.choiceItems;
                delete currentQuestion.answerIndex;

                switch (questionType) {
                    case 0: { // "Which actor was..."
                        // Build structured choice items containing actor label and the age for the given production
                        const distractors0 = getActorDistractors(actor, randomRole, production, 3, age, roles, actors);
                        if (distractors0.length < 3) break;
                        currentQuestion.question = `Which actor was ${age} years old at the start of production for <em>${production.title}</em>?`;
                        currentQuestion.difficulty = 2;
                        currentQuestion.score = 3;
                        currentQuestion.poster = production.poster;

                        // Assemble roles + actor objects (correct actor first)
                        const allActorEntries = [{ role: randomRole, actorObj: actor }].concat(distractors0.map(r => ({ role: r, actorObj: actors.get(`${r.actor_imdb_id}-${r.actor_name}`) })));
                        const prodStart = production.production_start ? new Date(production.production_start) : null;

                        // Create choice items with computed ages (if available)
                        let actorChoiceItems = allActorEntries.map(entry => {
                            const actorObj = entry.actorObj;
                            let itemAge = null;
                            if (actorObj && actorObj['birthday (YYYY-MM-DD)'] && prodStart) {
                                const bday = new Date(actorObj['birthday (YYYY-MM-DD)']);
                                itemAge = calculateAge(bday, prodStart);
                            }
                            const label = `<strong>${entry.role.actor_name}</strong> as ${entry.role.character}`;
                            return { label, actorId: entry.role.actor_imdb_id, character: entry.role.character, age: itemAge };
                        });

                        // Shuffle and set structured items
                        shuffleArray(actorChoiceItems);
                        currentQuestion.choiceItems = actorChoiceItems;
                        // find index of correct actor
                        currentQuestion.answerIndex = actorChoiceItems.findIndex(ci => ci.actorId === randomRole.actor_imdb_id && ci.character === randomRole.character);
                        // Backwards-compatible choices labels
                        choices = actorChoiceItems.map(ci => ci.label);
                        break;
                    }
                    case 1: { // "Actor X was Y years old for which movie?"
                        // Build structured choice items so we can show the ages after a selection
                        const distractors1 = getProductionDistractors(actor.imdb_id, production, 3, currentMinYear, currentMaxYear);
                        if (distractors1.length < 3) break;
                        currentQuestion.question = `Actor <strong>${actor.name}</strong> was ${age} years old during the start of production for which movie?`;
                        currentQuestion.difficulty = 3;
                        currentQuestion.score = 4;

                        const allRoles = [ { role: randomRole, productionObj: production } ].concat(distractors1.map(r => ({ role: r, productionObj: productions.find(p => p.imdb_id === r.production_imdb_id) })));

                        // Prepare choice items: { label, productionId, character, age }
                        const bday = new Date(actor['birthday (YYYY-MM-DD)']);
                        let choiceItems = allRoles.map(entry => {
                            const p = entry.productionObj;
                            const prodStart = p && p.production_start ? new Date(p.production_start) : null;
                            const itemAge = prodStart ? calculateAge(bday, prodStart) : null;
                            return { label: `<em>${entry.role.production_title}</em> as ${entry.role.character}`, productionId: p ? p.imdb_id : null, character: entry.role.character, age: itemAge };
                        });

                        // Choose poster from available productions
                        const posters = choiceItems.map(ci => { const p = productions.find(p => p.imdb_id === ci.productionId); return p ? p.poster : null; }).filter(Boolean);
                        currentQuestion.poster = posters.length > 0 ? posters[Math.floor(Math.random() * posters.length)] : null;

                        // Shuffle choice items and set answerIndex
                        shuffleArray(choiceItems);
                        currentQuestion.choiceItems = choiceItems;
                        // find the index of the correct production (randomRole.production_imdb_id)
                        currentQuestion.answerIndex = choiceItems.findIndex(ci => ci.productionId === randomRole.production_imdb_id);
                        // For backward compatibility also set choices to labels
                        choices = choiceItems.map(ci => ci.label);
                        break;
                    }
                    case 2: { // "How old was actor X...?(MC)"
                        choices = generateSortedRandomChoices(age);
                        currentQuestion.question = `How old was <strong>${actor.name}</strong> as ${randomRole.character} at the start of production for <em>${production.title}</em>?`;
                        currentQuestion.answer = `${age}`;
                        currentQuestion.difficulty = 4;
                        currentQuestion.score = 5;
                        currentQuestion.poster = production.poster;
                        break;
                    }
                    case 3: { // "What role did..."
                        // Build structured role choices that include the actor who played each role
                        const productionRoles = roles.filter(r => r.production_imdb_id === production.imdb_id);
                        // Exclude any roles without character or actor name
                        const usableRoles = productionRoles.filter(r => r.character && r.actor_name);
                        if (usableRoles.length < 4) break; // need at least 4 roles (1 correct + 3 distractors)

                        // Find the correct role entry(s) matching the randomRole.character
                        const correctEntries = usableRoles.filter(r => r.character === randomRole.character && r.actor_imdb_id === randomRole.actor_imdb_id);
                        if (correctEntries.length === 0) break; // couldn't find the matching role record

                        // Build distractors: pick random roles excluding the correct one
                        const otherRoles = usableRoles.filter(r => !(r.character === randomRole.character && r.actor_imdb_id === randomRole.actor_imdb_id));
                        shuffleArray(otherRoles);
                        const chosenDistractors = otherRoles.slice(0, 3);

                        // Assemble structured choice items: include label (role), actorName
                        const actorChoiceItemsForRole = [ { label: `${randomRole.character}`, actorName: correctEntries[0].actor_name, actorId: correctEntries[0].actor_imdb_id } ].concat(chosenDistractors.map(r => ({ label: `${r.character}`, actorName: r.actor_name, actorId: r.actor_imdb_id })));

                        shuffleArray(actorChoiceItemsForRole);
                        currentQuestion.choiceItems = actorChoiceItemsForRole;
                        // find index of correct item
                        currentQuestion.answerIndex = actorChoiceItemsForRole.findIndex(ci => ci.actorId === randomRole.actor_imdb_id && ci.label === randomRole.character);

                        currentQuestion.question = `What role did <strong>${actor.name}</strong> play in <em>${production.title}</em>?`;
                        currentQuestion.difficulty = 1;
                        currentQuestion.score = 1;
                        currentQuestion.poster = production.poster;
                        // Backwards-compatible choices
                        choices = actorChoiceItemsForRole.map(ci => ci.label);
                        break;
                    }
                    case 4: { // "How old was actor X...?" (Slider)
                        const randomOffset = Math.floor(Math.random() * 13);
                        const sliderMin = Math.max(10, age - randomOffset);
                        const sliderMax = sliderMin + 12;

                        ageSlider.min = sliderMin;
                        ageSlider.max = sliderMax;
                        ageSlider.value = Math.floor((sliderMin + sliderMax) / 2);

                        currentQuestion.question = `How old was <strong>${actor.name}</strong> as ${randomRole.character} at the start of production for <em>${production.title}</em>?`;
                        currentQuestion.answer = age;
                        currentQuestion.type = 'slider';
                        currentQuestion.difficulty = 6; // now round 6
                        currentQuestion.score = 10;
                        currentQuestion.poster = production.poster;
                        choices = [];
                        break;
                    }
                }

                if (choices && choices.length > 0) {
                    currentQuestion.choices = choices;
                }

                // Only mark the question as generated if we actually populated choices/choiceItems
                const hasChoices = (Array.isArray(currentQuestion.choiceItems) && currentQuestion.choiceItems.length > 0) ||
                    (Array.isArray(currentQuestion.choices) && currentQuestion.choices.length > 0) ||
                    currentQuestion.type === 'slider' || currentQuestion.type === 'drag-and-match';

                if (hasChoices) {
                    usedQuestions.add(questionId);
                    questionGenerated = true;
                }
            }
        }

        if (!questionGenerated) {
            showError("Couldn't generate a question with enough choices. Please check your data or criteria.");
        }
        // Debug log the generated question for diagnosis
        try { console.debug('Generated question', { difficulty, currentRound, currentQuestion, questionGenerated }); } catch (e) {}
        return;
        } catch (err) {
            console.error('generateQuestion failed', err);
            // Fallback question so the UI still renders and the player can continue
            currentQuestion = {
                question: 'Error generating question — skipping',
                choices: ['Continue'],
                type: 'multiple-choice',
                score: 0
            };
            // Ensure UI will show these choices
            try { displayQuestion(); } catch (e) { console.error('displayQuestion failed after generateQuestion error', e); }
        }
    }

    function displayQuestion() {
        displayPlayerScores();
        currentPlayerNameEl.textContent = players[currentPlayerIndex].name;
        currentPlayerNameEl.style.color = players[currentPlayerIndex].color;
        roundNumberEl.textContent = currentRound;
    questionEl.innerHTML = currentQuestion.question;
        choicesEl.innerHTML = '';
        sliderContainer.classList.add('d-none');
        const dragAndMatchContainer = document.getElementById('drag-and-match-container');
        dragAndMatchContainer.classList.add('d-none');
        choicesEl.classList.remove('d-none');
        confirmAgeBtn.classList.add('d-none');
        feedbackEl.innerHTML = '';
        questionPoster.classList.add('d-none');

        if (currentQuestion.poster) {
            questionPoster.src = currentQuestion.poster;
            questionPoster.classList.remove('d-none');
        }

        // Normalize the currentQuestion object to protect against generator inconsistencies
        try {
            // If type wasn't set correctly (or was left as 'multiple-choice' with empty choices),
            // infer the intended UI from the presence of fields.
            if (!currentQuestion.type) {
                if (Array.isArray(currentQuestion.movies) && Array.isArray(currentQuestion.revenues)) {
                    currentQuestion.type = 'drag-and-match';
                } else if (typeof currentQuestion.answer !== 'undefined' && (typeof currentQuestion.answer === 'number' || typeof currentQuestion.answer === 'string')) {
                    // Slider questions have an `answer` number and typically no `choices`
                    currentQuestion.type = 'slider';
                } else if (Array.isArray(currentQuestion.choiceItems) && currentQuestion.choiceItems.length > 0) {
                    currentQuestion.type = 'multiple-choice';
                } else if (Array.isArray(currentQuestion.choices) && currentQuestion.choices.length > 0) {
                    currentQuestion.type = 'multiple-choice';
                }
            }

            // Ensure choices is always a real array for rendering logic (even if empty)
            if (!Array.isArray(currentQuestion.choices)) {
                if (Array.isArray(currentQuestion.choiceItems)) {
                    currentQuestion.choices = currentQuestion.choiceItems.map(ci => ci.label || '');
                } else {
                    currentQuestion.choices = currentQuestion.choices || [];
                }
            }
        } catch (err) {
            console.error('Failed to normalize currentQuestion', err, currentQuestion);
        }

        // Populate debug panel only when developer flag is enabled to avoid showing JSON to players
        try {
            console.debug('displayQuestion currentQuestion', { currentRound, currentQuestion });
            const debugEl = document.getElementById('question-debug');
            if (debugEl) {
                if (window.__showQuestionDebug === true) {
                    debugEl.textContent = JSON.stringify(currentQuestion, null, 2);
                    debugEl.classList.remove('d-none');
                } else {
                    debugEl.classList.add('d-none');
                    // Clear contents to avoid being picked up by accessibility tools
                    debugEl.textContent = '';
                }
            }
        } catch (err) {
            console.error('failed to populate debug view', err);
        }

        // Helper: move a list item up one position
        function moveListItemUp(li) {
            if (!li || !li.parentElement) return;
            const prev = li.previousElementSibling;
            if (prev) {
                li.parentElement.insertBefore(li, prev);
            }
        }

        // Helper: move a list item down one position
        function moveListItemDown(li) {
            if (!li || !li.parentElement) return;
            const next = li.nextElementSibling;
            if (next) {
                li.parentElement.insertBefore(next, li);
            }
        }

        // Helper: update visibility of move buttons (hide up on first, down on last)
        function updateMoveButtons(list) {
            if (!list) return;
            const items = Array.from(list.querySelectorAll('li'));
            items.forEach((li, idx) => {
                const up = li.querySelector('.move-up');
                const down = li.querySelector('.move-down');
                if (up) up.style.display = (idx === 0) ? 'none' : '';
                if (down) down.style.display = (idx === items.length - 1) ? 'none' : '';
            });
        }

        if (currentQuestion.type === 'slider') {
            choicesEl.classList.add('d-none');
            sliderContainer.classList.remove('d-none');
            ageSlider.disabled = false;
            confirmAgeBtn.classList.remove('d-none');
            sliderValue.classList.remove('text-success', 'text-danger');
            sliderValue.textContent = ageSlider.value;
        } else if (currentQuestion.type === 'drag-and-match') {
            choicesEl.classList.add('d-none');
            dragAndMatchContainer.classList.remove('d-none');
            confirmMatchBtn.classList.remove('d-none');
            const dragList = document.getElementById('drag-list');
            const matchList = document.getElementById('match-list');
            dragList.innerHTML = '';
            matchList.innerHTML = '';

            currentQuestion.movies.forEach(movie => {
                const li = document.createElement('li');
                li.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
                li.dataset.id = movie.id;

                // Title container
                const titleSpan = document.createElement('span');
                titleSpan.classList.add('drag-item-title', 'flex-grow-1', 'text-start');
                titleSpan.innerHTML = movie.title;

                // Controls container (up/down); visible and touch-friendly
                const controls = document.createElement('div');
                controls.classList.add('drag-controls', 'ms-2');

                const upBtn = document.createElement('button');
                upBtn.type = 'button';
                upBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary', 'me-1', 'move-up');
                upBtn.setAttribute('aria-label', 'Move up');
                upBtn.innerHTML = '&#9650;'; // up triangle

                const downBtn = document.createElement('button');
                downBtn.type = 'button';
                downBtn.classList.add('btn', 'btn-sm', 'btn-outline-secondary', 'move-down');
                downBtn.setAttribute('aria-label', 'Move down');
                downBtn.innerHTML = '&#9660;'; // down triangle

                controls.appendChild(upBtn);
                controls.appendChild(downBtn);

                li.appendChild(titleSpan);
                li.appendChild(controls);

                dragList.appendChild(li);
            });

            currentQuestion.revenues.forEach(revenue => {
                const li = document.createElement('li');
                li.classList.add('list-group-item');
                li.textContent = revenue;
                matchList.appendChild(li);
            });

            const sortableInstance = new Sortable(dragList, {
                animation: 150,
                ghostClass: 'blue-background-class',
                onEnd: () => {
                    // After a drag reorder completes, ensure up/down button visibility is correct
                    updateMoveButtons(dragList);
                }
            });

            // Click delegation for move up / move down buttons (improves mobile reliability)
            dragList.addEventListener('click', (ev) => {
                const up = ev.target.closest('.move-up');
                const down = ev.target.closest('.move-down');
                if (!up && !down) return;
                ev.preventDefault();
                const li = ev.target.closest('li');
                if (!li) return;
                if (up) {
                    moveListItemUp(li);
                } else if (down) {
                    moveListItemDown(li);
                }
                // after programmatic move, re-sync heights so match column stays aligned
                synchronizeHeights(dragList, matchList);
                // update visibility of buttons since first/last may have changed
                updateMoveButtons(dragList);
            });

            // Initial visibility update for move buttons
            updateMoveButtons(dragList);

            synchronizeHeights(dragList, matchList);

        } else {
            if (currentQuestion.choiceItems && Array.isArray(currentQuestion.choiceItems)) {
                currentQuestion.choiceItems.forEach((ci, idx) => {
                    const choiceEl = document.createElement('button');
                    choiceEl.type = 'button';
                    choiceEl.classList.add('list-group-item', 'list-group-item-action');
                    choiceEl.innerHTML = ci.label;
                    choiceEl.dataset.index = String(idx);
                    choicesEl.appendChild(choiceEl);
                });
            } else {
                currentQuestion.choices.forEach(choice => {
                    const choiceEl = document.createElement('button');
                    choiceEl.type = 'button';
                    choiceEl.classList.add('list-group-item', 'list-group-item-action');
                    choiceEl.innerHTML = choice;
                    choicesEl.appendChild(choiceEl);
                });
            }
        }
        // If no choices were rendered (generation bug), create a safe fallback so user can continue
        try {
            const hasChoicesRendered = choicesEl.children && choicesEl.children.length > 0;
            const isInteractiveType = currentQuestion.type === 'slider' || currentQuestion.type === 'drag-and-match';
            if (!hasChoicesRendered && !isInteractiveType) {
                currentQuestion.choices = ['Continue'];
                currentQuestion.answer = 'Continue';
                const choiceEl = document.createElement('button');
                choiceEl.type = 'button';
                choiceEl.classList.add('list-group-item', 'list-group-item-action');
                choiceEl.innerHTML = 'Continue';
                choicesEl.appendChild(choiceEl);
                console.warn('No choices generated for currentQuestion; inserting fallback Continue choice', currentQuestion);
            }
        } catch (err) {
            console.error('failed to insert fallback choice', err);
        }
        choicesEl.style.pointerEvents = 'auto';
        // If this is the final question of the game, show 'Final Scoring' when the button is revealed
        try {
            const totalPerRound = questionsPerRound * (players.length || 1);
            const isFinalQuestionOverall = (currentRound === roundTitles.length) && (questionsAnsweredInRound === totalPerRound - 1);
            nextQuestionBtn.textContent = isFinalQuestionOverall ? 'Final Scoring' : 'Next Question';
        } catch (err) {
            // Fallback: default label
            nextQuestionBtn.textContent = 'Next Question';
        }
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

    function generateSortedRandomChoices(correctAnswer) {
        const choices = new Array(4);
        const correctIndex = Math.floor(Math.random() * 4);
        choices[correctIndex] = correctAnswer;

        // Fill to the left
        for (let i = correctIndex - 1; i >= 0; i--) {
            const gap = Math.floor(Math.random() * 3) + 2; // 2-4
            choices[i] = choices[i + 1] - gap;
        }

        // Fill to the right
        for (let i = correctIndex + 1; i < 4; i++) {
            const gap = Math.floor(Math.random() * 3) + 2; // 2-4
            choices[i] = choices[i - 1] + gap;
        }

        const minAge = 18;
        if (choices[0] < minAge) {
            const shift = minAge - choices[0];
            for (let i = 0; i < 4; i++) {
                choices[i] += shift;
            }
        }

        return choices.map(String);
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

    function getProductionDistractors(actorId, correctProduction, count, minYear, maxYear) {
        const distractors = new Set();
        let actorRoles = roles.filter(r => r.actor_imdb_id === actorId && r.production_imdb_id !== correctProduction.imdb_id);

        // Filter roles by year range
        actorRoles = actorRoles.filter(role => {
            const production = productions.find(p => p.imdb_id === role.production_imdb_id);
            if (!production || !production.release_date) return false;
            const releaseYear = parseInt(production.release_date.split('-')[0]);
            return releaseYear >= minYear && releaseYear <= maxYear;
        });

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

    function countBubbleSortSwaps(array) {
        let swaps = 0;
        let n = array.length;
        let tempArr = [...array]; // Make a copy to not modify the original

        for (let i = 0; i < n - 1; i++) {
            for (let j = 0; j < n - i - 1; j++) {
                if (tempArr[j] > tempArr[j + 1]) {
                    // Swap
                    [tempArr[j], tempArr[j+1]] = [tempArr[j+1], tempArr[j]];
                    swaps++;
                }
            }
        }
        return swaps;
    }

    function synchronizeHeights(list1, list2) {
        const allItems = [...list1.querySelectorAll('li'), ...list2.querySelectorAll('li')];
        let maxHeight = 0;
        allItems.forEach(item => {
            item.style.minHeight = ''; // Reset min-height before calculating
        });
        allItems.forEach(item => {
            if (item.offsetHeight > maxHeight) {
                maxHeight = item.offsetHeight;
            }
        });
        allItems.forEach(item => {
            item.style.minHeight = `${maxHeight}px`;
        });
    }

    function performSearch() {
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

        const slicedResults = results.slice(0, 40);

        let html = '<ul class="list-group">';
        for (const result of slicedResults) {
            const ageDisplay = result.ageAtStart === result.ageAtEnd ? result.ageAtStart : `${result.ageAtStart}-${result.ageAtEnd}`;
            html += `<li class="list-group-item"><strong>${result.actorName}</strong> was ${ageDisplay} years old as ${result.character} in <em>${result.productionTitle}</em></li>`;
        }
        html += '</ul>';
        if (results.length > 0) {
            html += `<p class="mt-2">Showing ${slicedResults.length} of ${results.length} results.</p>`;
        }
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
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
        // Normalize header names by trimming and removing surrounding quotes
        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map(line => {
            const values = line.split(/,(?=(?:(?:[^"']*"){2})*[^"]*$)/);
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
        const errorEl = document.createElement('div');
        errorEl.classList.add('alert', 'alert-danger', 'mt-3');
        errorEl.textContent = message;
        playerSetup.prepend(errorEl);
        setTimeout(() => errorEl.remove(), 3000);
    }

    function populateGenreModal(genres, productions) {
        const modalBody = document.getElementById('genre-modal-body');
        const genreCounts = new Map();
        genres.forEach(g => genreCounts.set(g.id, 0));

        productions.forEach(p => {
            if (p.genre_ids) {
                const ids = p.genre_ids.split('|');
                ids.forEach(id => {
                    if (genreCounts.has(id)) {
                        genreCounts.set(id, genreCounts.get(id) + 1);
                    }
                });
            }
        });

        const majorGenres = [];
        const minorGenreIds = [];
        genres.forEach(genre => {
            if ((genreCounts.get(genre.id) || 0) >= 10) {
                majorGenres.push(genre);
            } else {
                minorGenreIds.push(genre.id);
            }
        });

        let content = '<div class="form-check"><input class="form-check-input" type="checkbox" value="all" id="genre-all" checked><label class="form-check-label" for="genre-all"><strong>All Genres</strong></label></div><hr>';
        majorGenres.forEach(genre => {
            content += `<div class="form-check"><input class="form-check-input genre-checkbox" type="checkbox" value="${genre.id}" id="genre-${genre.id}" checked data-label="${genre.name}"><label class="form-check-label" for="genre-${genre.id}">${genre.name}</label></div>`;
        });

        if (minorGenreIds.length > 0) {
            content += `<div class="form-check"><input class="form-check-input genre-checkbox" type="checkbox" value="${minorGenreIds.join('|')}" id="genre-other" checked data-label="Other"><label class="form-check-label" for="genre-other">Other</label></div>`;
        }

        modalBody.innerHTML = content;

        const allCheckbox = document.getElementById('genre-all');
        const genreCheckboxes = modalBody.querySelectorAll('.genre-checkbox');

        allCheckbox.addEventListener('change', (e) => {
            genreCheckboxes.forEach(cb => {
                cb.checked = e.target.checked;
            });
        });

        modalBody.addEventListener('change', (e) => {
            if (e.target.classList.contains('genre-checkbox')) {
                if (!e.target.checked) {
                    allCheckbox.checked = false;
                } else {
                    const allChecked = Array.from(genreCheckboxes).every(cb => cb.checked);
                    if (allChecked) {
                        allCheckbox.checked = true;
                    }
                }
            }
        });

        document.querySelector('#genreModal .btn-primary').addEventListener('click', () => {
            updateSelectedItemsDisplay('genre');
            updateAvailableCounts();
        });
    }

    function updateSelectedItemsDisplay(type) {
        const display = document.getElementById(`selected-${type}s-display`);
        const allCheckbox = document.getElementById(`${type}-all`);
        const noneCheckbox = document.getElementById(`${type}-none`);

        if (noneCheckbox && noneCheckbox.checked) {
            display.textContent = 'None';
            return;
        }

        if (allCheckbox.checked) {
            display.textContent = 'All';
            return;
        }

        const selected = [];
        document.querySelectorAll(`#${type}-modal-body .${type}-checkbox:checked`).forEach(cb => {
            selected.push(cb.dataset.label);
        });

        if (selected.length === 0) {
            display.textContent = 'None';
        } else if (selected.length > 3) {
            display.textContent = `${selected.slice(0, 3).join(', ')}, ...`;
        } else {
            display.textContent = selected.join(', ');
        }
    }

    function populateFranchiseModal(productions) {
        const modalBody = document.getElementById('franchise-modal-body');
        
        const franchiseCounts = productions.reduce((counts, p) => {
            const franchise = p.franchise || ''; // Treat empty franchise as a key
            if (!/^\d{4}-\d{2}-\d{2}$/.test(franchise)) {
                counts[franchise] = (counts[franchise] || 0) + 1;
            }
            return counts;
        }, {});

        const majorFranchises = Object.keys(franchiseCounts).filter(f => f && franchiseCounts[f] >= 3);
        majorFranchises.sort();

        const otherFranchises = Object.keys(franchiseCounts).filter(f => f && franchiseCounts[f] < 3);

        let content = `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" value="all" id="franchise-all" checked>
                <label class="form-check-label" for="franchise-all"><strong>All Franchises</strong></label>
            </div>
            <div class="form-check">
                <input class="form-check-input franchise-checkbox" type="checkbox" value="" id="franchise-none" data-label="No Franchises">
                <label class="form-check-label" for="franchise-none">No Franchises</label>
            </div>
            <hr>
        `;

        majorFranchises.forEach(franchise => {
            content += `
                <div class="form-check">
                    <input class="form-check-input franchise-checkbox" type="checkbox" value="${franchise}" id="franchise-${franchise.replace(/\s+/g, '-')}" checked data-label="${franchise}">
                    <label class="form-check-label" for="franchise-${franchise.replace(/\s+/g, '-')}">${franchise}</label>
                </div>
            `;
        });

        if (otherFranchises.length > 0) {
            content += `
                <div class="form-check">
                    <input class="form-check-input franchise-checkbox" type="checkbox" value="${otherFranchises.join('|')}" id="franchise-other" checked data-label="Other franchises (<3 movies)">
                    <label class="form-check-label" for="franchise-other">Other franchises (&lt;3 movies)</label>
                </div>
            `;
        }

        modalBody.innerHTML = content;

        const allCheckbox = document.getElementById('franchise-all');
        const franchiseCheckboxes = modalBody.querySelectorAll('.franchise-checkbox');
        const noneCheckbox = document.getElementById('franchise-none');

        allCheckbox.addEventListener('change', (e) => {
            franchiseCheckboxes.forEach(cb => {
                // Do not toggle the 'No Franchises' checkbox when toggling All
                if (cb.id !== 'franchise-none') cb.checked = e.target.checked;
            });
            // If All is checked, ensure No Franchises is unchecked
            if (e.target.checked && noneCheckbox) noneCheckbox.checked = false;
        });

        modalBody.addEventListener('change', (e) => {
            // If the user toggles the 'No Franchises' option, it should clear all others
            if (e.target && e.target.id === 'franchise-none') {
                if (e.target.checked) {
                    franchiseCheckboxes.forEach(cb => {
                        if (cb.id !== 'franchise-none') cb.checked = false;
                    });
                    if (allCheckbox) allCheckbox.checked = false;
                }
                return;
            }

            if (e.target.classList.contains('franchise-checkbox')) {
                // If any regular franchise checkbox is changed, ensure 'No Franchises' is unchecked
                if (e.target.id !== 'franchise-none' && e.target.checked && noneCheckbox) {
                    noneCheckbox.checked = false;
                }

                if (!e.target.checked) {
                    allCheckbox.checked = false;
                } else {
                    const allChecked = Array.from(franchiseCheckboxes).filter(cb => cb.id !== 'franchise-none').every(cb => cb.checked);
                    if (allChecked) {
                        allCheckbox.checked = true;
                    }
                }
            }
        });

        document.querySelector('#franchiseModal .btn-primary').addEventListener('click', () => {
            updateSelectedItemsDisplay('franchise');
            updateAvailableCounts();
        });
    }
});
