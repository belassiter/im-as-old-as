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
const colors = ['#fd7e14', '#198754', '#0d6efd', '#6f42c1'];
const roundTitles = [
    "Actors and Roles",
    "How old were they?",
    "Filmography age",
    "Production age",
    "Ordering Box Office & IMDb ratings",
    "Production age: hard mode"
];
const roundPoints = [1, 3, 4, 5, 10, 10];

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
    const questionPoster = document.getElementById('question-poster');

    function getPointsString(points) {
        return points === 1 ? '1 point' : `${points} points`;
    }

    showLoading();

    try {
        const [actorsRes, productionsRes, rolesRes] = await Promise.all([
            fetch('actors.csv'),
            fetch('productions.csv'),
            fetch('roles.csv')
        ]);

        // Fail early with a clear error if any of the CSVs couldn't be fetched (404/500)
        const failed = [];
        if (!actorsRes.ok) failed.push(`actors.csv (${actorsRes.status})`);
        if (!productionsRes.ok) failed.push(`productions.csv (${productionsRes.status})`);
        if (!rolesRes.ok) failed.push(`roles.csv (${rolesRes.status})`);
        if (failed.length > 0) {
            throw new Error(`Failed to fetch required data files: ${failed.join(', ')}`);
        }

        const [actorsText, productionsText, rolesText] = await Promise.all([
            actorsRes.text(),
            productionsRes.text(),
            rolesRes.text()
        ]);

        const parsedActors = parseCsv(actorsText);
        productions = parseCsv(productionsText);
        const allRolesArray = parseCsv(rolesText);

        // Helper to safely parse a release year from a release_date string like "YYYY-MM-DD"
        function parseReleaseYear(releaseDate) {
            if (!releaseDate) return NaN;
            const s = String(releaseDate).trim();
            if (s.length === 0) return NaN;
            const parts = s.split('-');
            const y = parseInt(parts[0]);
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
                if (currentRound > 5) {
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

        choicesEl.addEventListener('click', (e) => {
            const clickedElement = e.target.closest('.list-group-item');
            if (clickedElement) {
                const selectedAnswer = clickedElement.innerHTML;
                if (selectedAnswer === currentQuestion.answer) {
                    clickedElement.classList.add('list-group-item-success');
                    players[currentPlayerIndex].score += currentQuestion.score;
                    feedbackEl.innerHTML = `<div class="alert alert-success">Correct! You scored ${getPointsString(currentQuestion.score)}.</div>`;
                } else {
                    clickedElement.classList.add('list-group-item-danger');
                    // Highlight the correct answer
                    const correctChoice = Array.from(choicesEl.children).find(choice => choice.innerHTML === currentQuestion.answer);
                    if (correctChoice) {
                        correctChoice.classList.add('list-group-item-success');
                    }
                    feedbackEl.innerHTML = `<div class="alert alert-danger">Incorrect!</div>`;
                }
                displayPlayerScores();
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
            playerSetup.classList.add('d-none');
            gameContainer.classList.remove('d-none');

            currentPlayerIndex = 0;
            currentRound = 1;
            questionsAnsweredInRound = 0;

            showRoundStartScreen();
        });

        startRoundBtn.addEventListener('click', () => {
            roundStart.classList.add('d-none');
            questionCard.classList.remove('d-none');
            playerScoresContainer.classList.remove('d-none');
            generateQuestion(currentRound);
            displayQuestion();
        });

        newGameBtn.addEventListener('click', () => {
            gameOver.classList.add('d-none');
            showGameMode();
        });

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
                tooltips: true,
                format: {
                    to: value => Math.round(value),
                    from: value => Math.round(value)
                }
            });

            yearRangeSlider.noUiSlider.on('update', (values, handle) => {
                yearRangeValueSpan.textContent = `${values[0]} - ${values[1]}`;
            });
        }
    }

    function showRoundStartScreen() {
        if (currentRound === 5) {
            usedFranchises.clear();
            usedActorsForImdbQuestions.clear();
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

    function generateQuestion(difficulty) {
        const yearRangeSlider = document.getElementById('year-range-slider');
        let [currentMinYear, currentMaxYear] = yearRangeSlider.noUiSlider.get();

        let questionGenerated = false;

        if (difficulty === 5) {
            if (Math.random() < 0.5) {
                // Franchise box office question
                let franchiseFound = false;
                let localMinYear = currentMinYear;
                let localMaxYear = currentMaxYear;
                const allFranchises = [...new Set(productions.map(p => p.franchise).filter(f => f))];
                shuffleArray(allFranchises);

                while (!franchiseFound) {
                    for (const franchise of allFranchises) {
                        if (usedFranchises.has(franchise)) {
                            continue;
                        }

                        const franchiseMovies = productions.filter(p =>
                            p.franchise === franchise &&
                            p.box_office_us && p.box_office_us !== 'N/A' &&
                            (function(){ const ry = parseReleaseYear(p && p.release_date); return !isNaN(ry) && ry >= localMinYear && ry <= localMaxYear; })()
                        );

                        if (franchiseMovies.length >= 4) {
                            shuffleArray(franchiseMovies);
                            const selectedMovies = franchiseMovies.slice(0, 4);
                            currentQuestion.poster = selectedMovies[Math.floor(Math.random() * selectedMovies.length)].poster;
                            const parseRevenue = (revenue) => parseInt(revenue.replace(/[^\d]/g, ''));
                            selectedMovies.sort((a, b) => parseRevenue(a.box_office_us) - parseRevenue(b.box_office_us));

                            currentQuestion.question = `Match the US Box Office revenue for these movies in the <strong>${franchise}</strong> franchise.`
                            currentQuestion.type = 'drag-and-match';
                            currentQuestion.subType = 'box-office';
                            currentQuestion.movies = selectedMovies.map(p => {
                                const role = roles.find(r => r.production_imdb_id === p.imdb_id);
                                return {
                                    id: p.imdb_id,
                                    title: p.title,
                                    character: role ? role.character : ''
                                };
                            });
                            currentQuestion.revenues = selectedMovies.map(p => p.box_office_us);
                            currentQuestion.correctOrder = selectedMovies.map(p => p.imdb_id);
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
                                shuffleArray(allFranchises); // Reshuffle to try again with a new order
                            } else if (allFranchises.filter(f => !usedFranchises.has(f)).length === 0) {
                                // This case handles when there are available franchises, but they don't meet the 4-movie criteria within the fully expanded year range.
                                // This is a fallback to prevent an infinite loop.
                                usedFranchises.clear();
                                shuffleArray(allFranchises);
                            }
                        }
                    }
                }
            } else {
                // Actor IMDb rating question
                let actorFound = false;
                let localMinYear = currentMinYear;
                let localMaxYear = currentMaxYear;

                const allActorIds = [...new Set(roles.map(r => r.actor_imdb_id))];
                shuffleArray(allActorIds);

                while (!actorFound) {
                    for (const actorId of allActorIds) {
                        if (usedActorsForImdbQuestions.has(actorId)) {
                            continue;
                        }

                        const actorRoles = roles.filter(r => r.actor_imdb_id === actorId);
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
                                return {
                                    id: p.imdb_id,
                                    title: p.title,
                                    character: r.character,
                                    imdb_rating: p.imdb_rating,
                                    poster: p.poster
                                };
                            });

                            selectedItems.sort((a, b) => parseFloat(a.imdb_rating) - parseFloat(b.imdb_rating));

                            currentQuestion.poster = selectedItems[Math.floor(Math.random() * selectedItems.length)].poster;
                            currentQuestion.question = `Order these films from <strong>${actor.name}</strong>, based on IMDb rating (1-10 scale)`;
                            currentQuestion.type = 'drag-and-match';
                            currentQuestion.subType = 'imdb-rating';
                            currentQuestion.score = 10;
                            currentQuestion.correctOrder = selectedItems.map(item => item.id);
                            currentQuestion.revenues = selectedItems.map(item => `${item.imdb_rating} ⭐`);

                            let draggableItems = selectedItems.map(item => ({
                                id: item.id,
                                title: `${item.character} in <em>${item.title}</em>`
                            }));
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
            }
        } else {
            let attempts = 0;
            const maxAttempts = roles.length * 2;
            while (!questionGenerated && attempts < maxAttempts) {
                attempts++;
                const randomRole = roles[Math.floor(Math.random() * roles.length)];
                const actor = actors.get(`${randomRole.actor_imdb_id}-${randomRole.actor_name}`);
                const production = productions.find(p => p.imdb_id === randomRole.production_imdb_id);

                if (!actor || !production || !actor['birthday (YYYY-MM-DD)'] || !production.production_start || !production.release_date) {
                    continue;
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
                else if (difficulty === 3) questionType = 1;
                else if (difficulty === 4) questionType = 2;
                else if (difficulty === 6) questionType = 4;

                let choices = [];
                currentQuestion.type = 'multiple-choice';
                currentQuestion.poster = null;

                switch (questionType) {
                    case 0: // "Which actor was..."
                        const distractors0 = getActorDistractors(actor, randomRole, production, 3, age, roles, actors);
                        if (distractors0.length < 3) continue;
                        currentQuestion.question = `Which actor was ${age} years old at the start of production for <em>${production.title}</em>?`;
                        currentQuestion.answer = `<strong>${actor.name}</strong> as ${randomRole.character}`;
                        currentQuestion.difficulty = 2;
                        currentQuestion.score = 3;
                        currentQuestion.poster = production.poster;
                        choices = distractors0.map(r => `<strong>${r.actor_name}</strong> as ${r.character}`);
                        choices.push(currentQuestion.answer);
                        shuffleArray(choices);
                        break;
                    case 1: // "Actor X was Y years old for which movie?"
                        const distractors1 = getProductionDistractors(actor.imdb_id, production, 3, currentMinYear, currentMaxYear);
                        if (distractors1.length < 3) continue;
                        currentQuestion.question = `Actor <strong>${actor.name}</strong> was ${age} years old during the start of production for which movie?`;
                        currentQuestion.answer = `<em>${production.title}</em> as ${randomRole.character}`;
                        currentQuestion.difficulty = 3;
                        currentQuestion.score = 4;
                        
                        const allProductionsInQuestion = [production, ...distractors1.map(r => productions.find(p => p.imdb_id === r.production_imdb_id))];
                        const posters = allProductionsInQuestion.map(p => p ? p.poster : null).filter(p => p);

                        if (posters.length > 0) {
                            currentQuestion.poster = posters[Math.floor(Math.random() * posters.length)];
                        } else {
                            currentQuestion.poster = null;
                        }

                        choices = distractors1.map(p => `<em>${p.production_title}</em> as ${p.character}`);
                        choices.push(currentQuestion.answer);
                        shuffleArray(choices);
                        break;
                    case 2: // "How old was actor X...?" (MC)
                        choices = generateSortedRandomChoices(age);
                        currentQuestion.question = `How old was <strong>${actor.name}</strong> as ${randomRole.character} at the start of production for <em>${production.title}</em>?`;
                        currentQuestion.answer = `${age}`;
                        currentQuestion.difficulty = 4;
                        currentQuestion.score = 5;
                        currentQuestion.poster = production.poster;
                        break;
                    case 3: // "What role did..."
                        const distractors3 = getRoleDistractors(actor.imdb_id, production.imdb_id, randomRole.character, 3, roles);
                        if (distractors3.length < 3) continue;
                        currentQuestion.question = `What role did <strong>${actor.name}</strong> play in <em>${production.title}</em>?`;
                        currentQuestion.answer = `${randomRole.character}`;
                        currentQuestion.difficulty = 1;
                        currentQuestion.score = 1;
                        currentQuestion.poster = production.poster;
                        choices = distractors3;
                        choices.push(currentQuestion.answer);
                        shuffleArray(choices);
                        break;
                    case 4: // "How old was actor X...?" (Slider)
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
                        choices = []; // No choices for slider
                        break;
                }
                currentQuestion.choices = choices;
                usedQuestions.add(questionId);
                questionGenerated = true;
            }
        }

        if (!questionGenerated) {
            showError("Couldn't generate a question with enough choices. Please check your data or criteria.");
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
                li.classList.add('list-group-item');
                li.dataset.id = movie.id;
                li.innerHTML = movie.title;
                dragList.appendChild(li);
            });

            currentQuestion.revenues.forEach(revenue => {
                const li = document.createElement('li');
                li.classList.add('list-group-item');
                li.textContent = revenue;
                matchList.appendChild(li);
            });

            new Sortable(dragList, {
                animation: 150,
                ghostClass: 'blue-background-class'
            });

            synchronizeHeights(dragList, matchList);

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
        const lines = text.split('\n').filter(line => line.trim() !== '');
        // Normalize header names by trimming and removing surrounding quotes
        const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const rows = lines.slice(1).map(line => {
            const values = line.split(/,(?=(?:(?:[^"]*\"){2})*[^\"]*$)/);
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
});