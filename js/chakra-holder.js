const unitRotations = new WeakMap();
const rotationMultiplier = 120;

function initUnitRing(element, unitData) {
    const unitElement = typeof element === 'string' ? document.getElementById(element) : element;
    if (!unitElement) return;

    const mainRing = unitElement.querySelector('.unit-ring');
    const miniRing = mainRing.querySelector('.mini-unit-ring');

    const mainPortrait = mainRing.querySelector(':scope > .portrait');
    const mainChakraSegment = mainRing.querySelector(':scope > .chakra-container > .chakra-segment');

    const miniPortrait = miniRing.querySelector('.portrait');
    const miniChakraSegment = miniRing.querySelector('.chakra-container > .chakra-segment');

    mainPortrait.src = `assets/characters/${unitData.main}.png`;
    miniPortrait.src = `assets/characters/${unitData.support}.png`;

    const unitNameElement = unitElement.querySelector('.unit-name');
    if (unitNameElement && unitData.name) {
        unitNameElement.textContent = unitData.name;
    }

    if (!unitRotations.has(mainChakraSegment)) {
        unitRotations.set(mainChakraSegment, 0);
    }
    if (!unitRotations.has(miniChakraSegment)) {
        unitRotations.set(miniChakraSegment, 0);
    }

    mainChakraSegment.style.transform = `rotate(0deg)`;
    miniChakraSegment.style.transform = `rotate(0deg)`;
}

function setChakra(unitElement, amount) {
    const element = typeof unitElement === 'string' ? document.getElementById(unitElement) : unitElement;
    if (!element) return;

    const mainRing = element.querySelector('.unit-ring');
    const mainChakraSegment = mainRing.querySelector(':scope > .chakra-container > .chakra-segment');

    let currentRotation = unitRotations.get(mainChakraSegment) || 0;
    currentRotation += amount * rotationMultiplier;
    unitRotations.set(mainChakraSegment, currentRotation);

    mainChakraSegment.style.transform = `rotate(${currentRotation}deg)`;
}

function addChakra(unitId, amount) {
    setChakra(unitId, amount);
}
