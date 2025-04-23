import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Clock setup
const clock = new THREE.Clock();
let simulatedTime = 0; // in minutes since midnight
const realSecondsPerSimMinute = 0.1; // 1 second = 10 minutes in simulation

const clockDisplay = document.createElement('div');
clockDisplay.id = 'clock';
clockDisplay.style.position = 'absolute';
clockDisplay.style.top = '10px';
clockDisplay.style.left = '50%';
clockDisplay.style.transform = 'translateX(-50%)';
clockDisplay.style.padding = '5px 10px';
clockDisplay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
clockDisplay.style.color = 'white';
clockDisplay.style.fontFamily = 'Arial, sans-serif';
clockDisplay.style.fontSize = '16px';
clockDisplay.style.borderRadius = '5px';
clockDisplay.innerHTML = '00:00';
document.body.appendChild(clockDisplay);

// Passenger Info Display
const infoBox = document.createElement('div');
infoBox.id = 'passenger-info';
infoBox.style.position = 'absolute';
infoBox.style.top = '10px';
infoBox.style.right = '10px';
infoBox.style.padding = '10px';
infoBox.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
infoBox.style.color = 'white';
infoBox.style.fontFamily = 'Arial, sans-serif';
infoBox.style.fontSize = '14px';
infoBox.style.borderRadius = '5px';
infoBox.style.display = 'block';
infoBox.innerHTML = 'Total Passengers: 0<br>Stations:<br>A: 0<br>B: 0<br>C: 0<br>D: 0<br>E: 0<br>Trains:<br>ABC: 0<br>CBA: 0<br>DBE: 0<br>EBD: 0';
document.body.appendChild(infoBox);

// Add heatmap toggle button
let showHeatmap = false;
const heatmapToggle = document.createElement('button');
heatmapToggle.innerText = 'Show Heatmap';
heatmapToggle.style.position = 'absolute';
heatmapToggle.style.top = '285px';
heatmapToggle.style.right = '10px';
heatmapToggle.style.padding = '5px 10px';
heatmapToggle.style.fontFamily = 'Arial, sans-serif';
heatmapToggle.style.fontSize = '14px';
heatmapToggle.style.cursor = 'pointer';
heatmapToggle.addEventListener('click', () => {
    showHeatmap = !showHeatmap;
    heatmapToggle.innerText = showHeatmap ? 'Show Humans' : 'Show Heatmap';
    console.log('Heatmap mode:', showHeatmap);
});
document.body.appendChild(heatmapToggle);

// Debug cube
const debugCube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
debugCube.position.set(0, 0, 0);
scene.add(debugCube);

// Variables
let trackModel = null;
let humanModel = null;
const trackSpacing = 5;
const trackElevation = 0.01;
const maxHumansPerStation = 40;
const maxPassengersPerTrain = 15;

const stationData = {
    'A': { humans: [] },
    'B_green': { humans: [] },
    'C': { humans: [] },
    'D': { humans: [] },
    'B_purple': { humans: [] },
    'E': { humans: [] }
};

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(5, 10, 7);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
scene.add(directionalLight);

// Station positions
const stationPositions = {
    'A': new THREE.Vector3(0, 2, 40),
    'B_green': new THREE.Vector3(0, 2, 0),
    'C': new THREE.Vector3(0, 2, -40),
    'D': new THREE.Vector3(-40, 0, 0),
    'B_purple': new THREE.Vector3(0, 0, 0),
    'E': new THREE.Vector3(40, 0, 0)
};

// Station names
const stationNames = {
    'A': 'Chikpete',
    'B_green': 'Majestic (Green)',
    'C': 'Mantri Square',
    'D': 'KSR Station',
    'B_purple': 'Majestic (Purple)',
    'E': 'Central College'
};

// Track paths
const trackPaths = {
    'ABC': [new THREE.Vector3(-1, 2, 40), new THREE.Vector3(-1, 2, 0), new THREE.Vector3(-1, 2, -40)],
    'CBA': [new THREE.Vector3(1, 2, -40), new THREE.Vector3(1, 2, 0), new THREE.Vector3(1, 2, 40)],
    'DBE': [new THREE.Vector3(-40, 0, -1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(40, 0, -1)],
    'EBD': [new THREE.Vector3(40, 0, 1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-40, 0, 1)]
};

// Train variables
let trainABC, trainCBA, trainDBE, trainEBD;
let tABC = 0, tCBA = 0, tDBE = 0, tEBD = 0;
let dirABC = 1, dirCBA = 1, dirDBE = 1, dirEBD = 1;
const trainSpeed = 0.0016667;
const waitFrames = 120;
const trainStates = {
    ABC: { state: 'moving', waitTimer: 0, passengers: 0 },
    CBA: { state: 'moving', waitTimer: 0, passengers: 0 },
    DBE: { state: 'moving', waitTimer: 0, passengers: 0 },
    EBD: { state: 'moving', waitTimer: 0, passengers: 0 }
};

// Elevation constants
const stationFloorHeight = 0.2;
const stationRoofGap = 2;
const trainOffset = 0.25;

// Probability of alighting, exiting and boarding
const pAlight = (station) => {
    if (['A', 'C', 'D', 'E'].includes(station)) return 0.5;
    else if (['B_green', 'B_purple'].includes(station)) return 0.2;
    else return 0;
};
const pExit = 0.9;
const pBoard = 0.7;

// Camera and controls
camera.position.set(60, 60, 60);
camera.lookAt(0, 0, 0);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

async function init() {
    try {
        console.log('Initializing...');
        await loadTrackModel();
        await loadHumanModel();

        Object.entries({
            'A': 0x008000, 'B_green': 0x008000, 'C': 0x008000,
            'D': 0x800080, 'B_purple': 0x800080, 'E': 0x800080
        }).forEach(([key, color]) => {
            createStation(stationPositions[key], key.includes('B_'), color, key);
        });

        createTracks();

        trainABC = await createTrain();
        trainCBA = await createTrain();
        trainDBE = await createTrain();
        trainEBD = await createTrain();

        scene.add(trainABC, trainCBA, trainDBE, trainEBD);

        trainABC.position.copy(trackPaths.ABC[0]).add(new THREE.Vector3(0, trainOffset, 0));
        trainCBA.position.copy(trackPaths.CBA[0]).add(new THREE.Vector3(0, trainOffset, 0));
        trainDBE.position.copy(trackPaths.DBE[0]).add(new THREE.Vector3(0, trainOffset, 0));
        trainEBD.position.copy(trackPaths.EBD[0]).add(new THREE.Vector3(0, trainOffset, 0));

        trainABC.userData = { type: 'train', name: 'ABC' };
        trainCBA.userData = { type: 'train', name: 'CBA' };
        trainDBE.userData = { type: 'train', name: 'DBE' };
        trainEBD.userData = { type: 'train', name: 'EBD' };

        console.log('Initialization complete, starting animation...');
        animate();
    } catch (error) {
        console.error('Init failed:', error);
    }
}

async function createTrain() {
    const loader = new GLTFLoader();
    try {
        const gltf = await loader.loadAsync('/metro3d/scene.glb');
        const train = gltf.scene.clone();
        train.scale.set(0.9, 0.9, 0.9);
        const container = new THREE.Group();
        container.add(train);
        train.rotation.set(0, Math.PI / 2, 0);
        train.position.set(0, 0, 0);
        console.log('Train model loaded');
        return container;
    } catch (error) {
        console.warn('Train loading failed, using fallback:', error);
        const fallback = createFallbackTrain();
        fallback.rotation.y = Math.PI / 2;
        return fallback;
    }
}

function createFallbackTrain() {
    const train = new THREE.Group();
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1.5, 2),
        new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    train.add(body);
    const window = new THREE.Mesh(
        new THREE.BoxGeometry(6.84, 1.8, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    window.position.z = 1;
    train.add(window);
    return train;
}

async function loadTrackModel() {
    const loader = new GLTFLoader();
    try {
        const gltf = await loader.loadAsync('/metro3d/track.glb');
        trackModel = gltf.scene.clone();
        trackModel.scale.set(0.01, 0.004, 0.01);
        trackModel.rotation.set(0, 0, 0);
        trackModel.visible = false;
        scene.add(trackModel);
        console.log('Track model loaded');
    } catch (error) {
        console.warn('Track model loading failed:', error);
    }
}

async function loadHumanModel() {
    const loader = new GLTFLoader();
    try {
        const gltf = await loader.loadAsync('/metro3d/human.glb');
        humanModel = gltf.scene.clone();
        humanModel.scale.set(0.003, 0.003, 0.003);
        humanModel.visible = false;
        scene.add(humanModel);
        console.log('Human model loaded');
    } catch (error) {
        console.warn('Human model loading failed:', error);
    }
}

function createTextTexture(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = '24px Arial';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

function createStation(position, isCentral, color, name) {
    try {
        const width = isCentral ? 18 : 9;
        const depth = isCentral ? 18 : 9;
        const geometry = new THREE.BoxGeometry(width, stationFloorHeight, depth);
        const station = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.7
        }));
        station.position.copy(position);
        station.receiveShadow = true;
        station.userData = { type: 'station', stationName: name };
        scene.add(station);

        stationData[name].platform = station;

        const heatmapGeometry = new THREE.PlaneGeometry(width, depth);
        const heatmapMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            transparent: true,
            opacity: 0.5,
            side: THREE.DoubleSide
        });
        const tileSize = isCentral ? 4.5 : 2.25;
        const tiles = [];
        for (let i = -1.5; i <= 1.5; i++) {
            for (let j = -1.5; j <= 1.5; j++) {
                const tileGeometry = new THREE.PlaneGeometry(tileSize, tileSize);
                const tileMaterial = new THREE.MeshBasicMaterial({
                    color: 0x00ff00,
                    transparent: true,
                    opacity: 0.5,
                    side: THREE.DoubleSide
                });
                const tile = new THREE.Mesh(tileGeometry, tileMaterial);
                tile.rotation.x = Math.PI / 2;
                tile.position.copy(position).add(new THREE.Vector3(
                    i * tileSize,
                    stationFloorHeight / 2 + 0.01,
                    j * tileSize
                ));
                tile.visible = false;
                scene.add(tile);
                tiles.push({
                    mesh: tile,
                    center: tile.position.clone()
                });
            }
        }
        stationData[name].heatmapTiles = tiles;

        if (name === 'B_green' || !isCentral) {
            const roofGeometry = isCentral ? new THREE.BoxGeometry(19, 0.2, 19) : new THREE.BoxGeometry(10, 0.2, 10);
            const roof = new THREE.Mesh(roofGeometry, new THREE.MeshStandardMaterial({
                color: 0x222222,
                metalness: 0.3
            }));
            roof.position.copy(position).add(new THREE.Vector3(0, stationFloorHeight / 2 + stationRoofGap + 0.1, 0));
            roof.castShadow = true;
            scene.add(roof);
        }

        const marker = new THREE.Mesh(
            new THREE.CylinderGeometry(isCentral ? 0.6 : 0.9, isCentral ? 0.6 : 0.9, 0.1, 16),
            new THREE.MeshStandardMaterial({ color: color })
        );
        marker.position.copy(position).add(new THREE.Vector3(0, stationFloorHeight / 2 + stationRoofGap + 0.2, 0));
        scene.add(marker);

        const indicatorGeometry = new THREE.SphereGeometry(0.5, 8, 8);
        const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
        indicator.position.copy(marker.position).add(new THREE.Vector3(0, 1, 0));
        indicator.visible = false;
        indicator.originalScale = indicator.scale.clone();
        scene.add(indicator);
        stationData[name].indicator = indicator;

        const wallHeight = stationRoofGap + 0.1;
        const wallThickness = 0.2;
        const isElevated = name === 'A' || name === 'B_green' || name === 'C';
        const textTexture = createTextTexture(stationNames[name]);

        if (isElevated) {
            const wallGeometry = new THREE.BoxGeometry(wallThickness, wallHeight, depth);
            const wallMaterial = new THREE.MeshStandardMaterial({ map: textTexture });

            const westWall = new THREE.Mesh(wallGeometry, wallMaterial);
            westWall.position.copy(position).add(new THREE.Vector3(-width / 2, wallHeight / 2, 0));
            westWall.castShadow = true;
            westWall.receiveShadow = true;
            scene.add(westWall);

            const eastWall = new THREE.Mesh(wallGeometry, wallMaterial.clone());
            eastWall.position.copy(position).add(new THREE.Vector3(width / 2, wallHeight / 2, 0));
            eastWall.castShadow = true;
            eastWall.receiveShadow = true;
            scene.add(eastWall);
        } else {
            const wallGeometry = new THREE.BoxGeometry(width, wallHeight, wallThickness);
            const wallMaterial = new THREE.MeshStandardMaterial({ map: textTexture });

            const southWall = new THREE.Mesh(wallGeometry, wallMaterial);
            southWall.position.copy(position).add(new THREE.Vector3(0, wallHeight / 2, -depth / 2));
            southWall.castShadow = true;
            southWall.receiveShadow = true;
            scene.add(southWall);

            const northWall = new THREE.Mesh(wallGeometry, wallMaterial.clone());
            northWall.position.copy(position).add(new THREE.Vector3(0, wallHeight / 2, depth / 2));
            northWall.castShadow = true;
            northWall.receiveShadow = true;
            scene.add(northWall);
        }

        populateStationHumans(name, position, isCentral);
        console.log(`Station ${name} created`);
    } catch (error) {
        console.error(`Error creating station ${name}:`, error);
    }
}

function createHuman(stationName) {
    if (!humanModel) return null;
    const position = stationPositions[stationName];
    const isCentral = stationName.includes('B_');
    const areaWidth = isCentral ? 18 : 9;
    const areaDepth = isCentral ? 18 : 9;
    const trackAvoidZone = 2;
    const human = humanModel.clone();
    human.visible = true;
    let x, z;
    const isElevated = stationName === 'A' || stationName === 'B_green' || stationName === 'C';
    do {
        x = position.x + (Math.random() - 0.5) * areaWidth * 0.8;
        z = position.z + (Math.random() - 0.5) * areaDepth * 0.8;
        if (isElevated) {
            if (Math.abs(x - (position.x - 1)) < trackAvoidZone || Math.abs(x - (position.x + 1)) < trackAvoidZone) continue;
        } else {
            if (Math.abs(z - (position.z - 1)) < trackAvoidZone || Math.abs(z - (position.z + 1)) < trackAvoidZone) continue;
        }
    } while (false);
    human.position.set(x, position.y + stationFloorHeight / 2, z);
    human.traverse((child) => {
        if (child.isMesh && child.material) {
            child.material = child.material.clone();
            child.material.color.setHex(Math.random() * 0xffffff);
        }
    });
    human.userData = {
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.02, 0, (Math.random() - 0.5) * 0.02),
        stationBounds: {
            minX: position.x - areaWidth / 2 * 0.8,
            maxX: position.x + areaWidth / 2 * 0.8,
            minZ: position.z - areaDepth / 2 * 0.8,
            maxZ: position.z + areaDepth / 2 * 0.8
        },
        stationName: stationName,
        trackAvoidZone: trackAvoidZone,
        isElevated: isElevated
    };
    return human;
}

function populateStationHumans(stationName, position, isCentral) {
    if (!humanModel) return;
    const numHumans = Math.min(maxHumansPerStation, Math.floor(Math.random() * (maxHumansPerStation + 1)));
    for (let i = 0; i < numHumans; i++) {
        const human = createHuman(stationName);
        if (human) {
            stationData[stationName].humans.push(human);
            scene.add(human);
        }
    }
}

function boardHumans(train, t, stateObj, stationName) {
    if (stateObj.state === 'waiting' && stateObj.waitTimer === waitFrames - 1) {
        const alightProb = pAlight(stationName);
        const numberAlighting = Math.floor(stateObj.passengers * alightProb);
        stateObj.passengers -= numberAlighting;
        const alightedHumans = [];
        for (let i = 0; i < numberAlighting; i++) {
            const human = createHuman(stationName);
            if (human) {
                alightedHumans.push(human);
                stationData[stationName].humans.push(human);
                scene.add(human);
            }
        }
        const numberExiting = Math.floor(alightedHumans.length * pExit);
        for (let i = 0; i < numberExiting; i++) {
            const index = Math.floor(Math.random() * alightedHumans.length);
            const human = alightedHumans.splice(index, 1)[0];
            if (human) {
                const humanIndex = stationData[stationName].humans.indexOf(human);
                if (humanIndex !== -1) {
                    stationData[stationName].humans.splice(humanIndex, 1);
                    human.visible = false;
                    scene.remove(human);
                }
            }
        }
        const availableSpace = maxPassengersPerTrain - stateObj.passengers;
        let humansToBoard = 0;
        const candidates = Math.min(availableSpace, stationData[stationName].humans.length);
        for (let i = 0; i < candidates; i++) {
            if (Math.random() < pBoard) {
                humansToBoard++;
            }
        }
        for (let i = 0; i < humansToBoard; i++) {
            const human = stationData[stationName].humans.pop();
            if (human) {
                human.visible = false;
                scene.remove(human);
                stateObj.passengers++;
            }
        }
        console.log(`${stationName}: ${numberAlighting} alighted, ${numberExiting} exited, ${humansToBoard} boarded, train passengers: ${stateObj.passengers}`);
    }
}

function updateSimulatedTime(delta) {
    simulatedTime += delta / realSecondsPerSimMinute;
    simulatedTime %= 1440; // Wrap around every 24 hours (1440 minutes)
}

function formatTime(minutes) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

function isPeakHour(time) {
    const hour = Math.floor(time / 60);
    return (hour >= 7 && hour < 11) || (hour >= 17 && hour < 21);
}

function updatePassengerInfo() {
    const totalHumans = Object.values(stationData).reduce((sum, data) => sum + data.humans.length, 0);
    const totalPassengersOnTrains = Object.values(trainStates).reduce((sum, state) => sum + state.passengers, 0);

    let stationInfo = '<b>Stations (Humans / Max 30):</b><br>';
    Object.keys(stationData).forEach(key => {
        const displayName = stationNames[key];
        const humanCount = stationData[key].humans.length;
        stationInfo += `${displayName}: ${humanCount} / 30<br>`;
    });

    let trainInfo = '<b>Trains (Passengers / Max 15):</b><br>';
    trainInfo += `ABC (Green): ${trainStates.ABC.passengers} / 15<br>`;
    trainInfo += `CBA (Green): ${trainStates.CBA.passengers} / 15<br>`;
    trainInfo += `DBE (Purple): ${trainStates.DBE.passengers} / 15<br>`;
    trainInfo += `EBD (Purple): ${trainStates.EBD.passengers} / 15<br>`;

    infoBox.innerHTML = `Total Humans (Stations): ${totalHumans}<br>` +
                        `Total Passengers (Trains): ${totalPassengersOnTrains}<br><br>` +
                        stationInfo + '<br>' +
                        trainInfo;
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    updateSimulatedTime(delta);
    clockDisplay.innerHTML = formatTime(simulatedTime);

    function updateTrain(train, t, dir, path, stateObj, yOffset) {
        if (!train) return;

        if (stateObj.state === 'moving') {
            t += trainSpeed * dir;
            if (t >= 1) {
                t = 1;
                stateObj.state = 'waiting';
                stateObj.waitTimer = waitFrames;
                dir = -1;
            } else if (t <= 0) {
                t = 0;
                stateObj.state = 'waiting';
                stateObj.waitTimer = waitFrames;
                dir = 1;
            } else if (Math.abs(t - 0.5) < 0.001) {
                t = 0.5;
                stateObj.state = 'waiting';
                stateObj.waitTimer = waitFrames;
            }
        } else if (stateObj.state === 'waiting') {
            stateObj.waitTimer--;
            if (stateObj.waitTimer <= 0) {
                stateObj.state = 'moving';
            }
        }

        const segmentT = t % 0.5 * 2;
        const pos = t < 0.5 ? [path[0], path[1]] : [path[1], path[2]];
        train.position.lerpVectors(pos[0], pos[1], segmentT);
        train.position.y = yOffset;
        const direction = new THREE.Vector3().subVectors(pos[1], pos[0]).normalize();
        train.rotation.y = Math.atan2(direction.x, direction.z);

        if (t === 0) boardHumans(train, t, stateObj, path[0].y === 2 ? 'A' : 'D');
        else if (t === 0.5) boardHumans(train, t, stateObj, path[1].y === 2 ? 'B_green' : 'B_purple');
        else if (t === 1) boardHumans(train, t, stateObj, path[2].y === 2 ? 'C' : 'E');

        return { t, dir };
    }

    if (trainABC) {
        const resultABC = updateTrain(trainABC, tABC, dirABC, trackPaths.ABC, trainStates.ABC, 2 + trainOffset);
        tABC = resultABC.t;
        dirABC = resultABC.dir;
    }
    if (trainCBA) {
        const resultCBA = updateTrain(trainCBA, tCBA, dirCBA, trackPaths.CBA, trainStates.CBA, 2 + trainOffset);
        tCBA = resultCBA.t;
        dirCBA = resultCBA.dir;
    }
    if (trainDBE) {
        const resultDBE = updateTrain(trainDBE, tDBE, dirDBE, trackPaths.DBE, trainStates.DBE, 0 + trainOffset);
        tDBE = resultDBE.t;
        dirDBE = resultDBE.dir;
    }
    if (trainEBD) {
        const resultEBD = updateTrain(trainEBD, tEBD, dirEBD, trackPaths.EBD, trainStates.EBD, 0 + trainOffset);
        tEBD = resultEBD.t;
        dirEBD = resultEBD.dir;
    }

    Object.entries(stationData).forEach(([stationName, data]) => {
        data.humans.forEach(human => {
            human.visible = !showHeatmap;
        });
        if (data.heatmapTiles) {
            data.heatmapTiles.forEach(tile => {
                tile.mesh.visible = showHeatmap;
                if (showHeatmap) {
                    const radius = stationName.includes('B_') ? 2.25 : 4.5;
                    let density = 0;
                    const humansToCheck = (stationName === 'B_green' || stationName === 'B_purple')
                        ? [...stationData['B_green'].humans, ...stationData['B_purple'].humans]
                        : data.humans;
                    humansToCheck.forEach(human => {
                        const dist = tile.center.distanceTo(human.position);
                        if (dist < radius) {
                            density += 1 - dist / radius;
                        }
                    });
                    const t = Math.min(density / 5, 1);
                    const color = new THREE.Color().lerpColors(
                        new THREE.Color(0x00ff00),
                        new THREE.Color(0xff0000),
                        t
                    );
                    tile.mesh.material.color.set(color);
                }
            });
        }
        data.humans.forEach((human) => {
            const pos = human.position;
            const userData = human.userData;
            const platformWidth = userData.isCentral ? 18 : 9;
            const platformDepth = platformWidth;
            const trackZone = 3;
            const safeMargin = 0.5;

            const newPos = pos.clone().add(userData.velocity);
            if (userData.isElevated) {
                const platformLeftMin = -platformWidth / 2 + safeMargin;
                const platformLeftMax = -trackZone;
                const platformRightMin = trackZone;
                const platformRightMax = platformWidth / 2 - safeMargin;

                const isLeftPlatform = pos.x < 0;
                if (isLeftPlatform) {
                    if (newPos.x > platformLeftMax) {
                        userData.velocity.x *= -1;
                        newPos.x = pos.x;
                    } else if (newPos.x < platformLeftMin) {
                        userData.velocity.x *= -1;
                        newPos.x = pos.x;
                    }
                    newPos.x = Math.max(platformLeftMin, Math.min(platformLeftMax, newPos.x));
                } else {
                    if (newPos.x < platformRightMin) {
                        userData.velocity.x *= -1;
                        newPos.x = pos.x;
                    } else if (newPos.x > platformRightMax) {
                        userData.velocity.x *= -1;
                        newPos.x = pos.x;
                    }
                    newPos.x = Math.max(platformRightMin, Math.min(platformRightMax, newPos.x));
                }
            } else {
                const platformBottomMin = -platformDepth / 2 + safeMargin;
                const platformBottomMax = -trackZone;
                const platformTopMin = trackZone;
                const platformTopMax = platformDepth / 2 - safeMargin;

                const isBottomPlatform = pos.z < 0;
                if (isBottomPlatform) {
                    if (newPos.z > platformBottomMax) {
                        userData.velocity.z *= -1;
                        newPos.z = pos.z;
                    } else if (newPos.z < platformBottomMin) {
                        userData.velocity.z *= -1;
                        newPos.z = pos.z;
                    }
                    newPos.z = Math.max(platformBottomMin, Math.min(platformBottomMax, newPos.z));
                } else {
                    if (newPos.z < platformTopMin) {
                        userData.velocity.z *= -1;
                        newPos.z = pos.z;
                    } else if (newPos.z > platformTopMax) {
                        userData.velocity.z *= -1;
                        newPos.z = pos.z;
                    }
                    newPos.z = Math.max(platformTopMin, Math.min(platformTopMax, newPos.z));
                }
            }
            pos.copy(newPos);

            if (pos.x < userData.stationBounds.minX || pos.x > userData.stationBounds.maxX) {
                pos.x = Math.max(userData.stationBounds.minX, Math.min(userData.stationBounds.maxX, pos.x));
                userData.velocity.x *= -1;
            }
            if (pos.z < userData.stationBounds.minZ || pos.z > userData.stationBounds.maxZ) {
                pos.z = Math.max(userData.stationBounds.minZ, Math.min(userData.stationBounds.maxZ, pos.z));
                userData.velocity.z *= -1;
            }
        });

        const humanCount = data.humans.length;
        if (humanCount > 25) {
            data.indicator.visible = true;
            const excess = humanCount - maxHumansPerStation;
            const frequency = 200 / (1 + excess * 0.1);
            const pulse = 1.5 + 0.5 * Math.sin(Date.now() / frequency);
            data.indicator.scale.set(
                data.indicator.originalScale.x * pulse,
                data.indicator.originalScale.y * pulse,
                data.indicator.originalScale.z * pulse
            );
        } else {
            data.indicator.visible = false;
            data.indicator.scale.copy(data.indicator.originalScale);
        }
    });

    updatePassengerInfo();

    controls.update();
    renderer.render(scene, camera);
}

function createTracks() {
    if (!trackModel) return;
    createTrack(trackPaths.ABC[0], trackPaths.ABC[1], true);
    createTrack(trackPaths.ABC[1], trackPaths.ABC[2], true);
    createTrack(trackPaths.CBA[0], trackPaths.CBA[1], true);
    createTrack(trackPaths.CBA[1], trackPaths.CBA[2], true);
    createTrack(trackPaths.DBE[0], trackPaths.DBE[1], false);
    createTrack(trackPaths.DBE[1], trackPaths.DBE[2], false);
    createTrack(trackPaths.EBD[0], trackPaths.EBD[1], false);
    createTrack(trackPaths.EBD[1], trackPaths.EBD[2], false);
}

function createTrack(start, end, isElevated) {
    const direction = new THREE.Vector3().subVectors(end, start);
    const distance = start.distanceTo(end);
    const segmentCount = Math.ceil(distance / trackSpacing);

    for (let i = 0; i < segmentCount; i++) {
        const trackPiece = trackModel.clone();
        trackPiece.visible = true;
        const t = (i + 0.5) / segmentCount;
        const position = new THREE.Vector3().lerpVectors(start, end, t);
        trackPiece.position.copy(position);
        trackPiece.position.y = isElevated ? 2 + stationFloorHeight / 2 + trackElevation : 0 + stationFloorHeight / 2 + trackElevation;
        trackPiece.rotation.y = Math.atan2(direction.x, direction.z);
        scene.add(trackPiece);
    }
}

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

function onMouseClick(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0) {
        let target = intersects[0].object;
        while (target && !target.userData.type) {
            target = target.parent;
        }
        if (target && target.userData.type === 'station') {
            const stationName = target.userData.stationName;
            let displayName, humanCount;
            if (stationName === 'B_green' || stationName === 'B_purple') {
                displayName = 'Majestic';
                humanCount = stationData['B_green'].humans.length + stationData['B_purple'].humans.length;
            } else {
                displayName = stationNames[stationName];
                humanCount = stationData[stationName].humans.length;
            }
            infoBox.innerHTML = `Station: ${displayName}<br>Humans: ${humanCount}`;
        } else if (target && target.userData.type === 'train') {
            const trainName = target.userData.name;
            const passengers = trainStates[trainName].passengers;
            infoBox.innerHTML = `Train: ${trainName}<br>Passengers: ${passengers}`;
        }
        setTimeout(updatePassengerInfo, 2000);
    }
}

window.addEventListener('click', onMouseClick, false);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

init();

// Passenger generation based on simulated time
setInterval(() => {
    const currentTime = simulatedTime;
    const peak = isPeakHour(currentTime);
    if (peak) {
        const randomStation = Object.keys(stationData)[Math.floor(Math.random() * Object.keys(stationData).length)];
        const currentHumans = stationData[randomStation].humans.length;
        const extraPeople = Math.random() < 0.6 ? 25 : 15;
        const availableSpace = maxHumansPerStation - currentHumans;
        const humansToAdd = Math.min(extraPeople, availableSpace);
        for (let i = 0; i < humansToAdd; i++) {
            const human = createHuman(randomStation);
            if (human) {
                stationData[randomStation].humans.push(human);
                scene.add(human);
            }
        }
        if (humansToAdd > 0) {
            console.log(`Peak Hour Event: ${humansToAdd} extra people arrived at ${randomStation}`);
        }
    } else {
        Object.keys(stationData).forEach(stationName => {
            const currentHumans = stationData[stationName].humans.length;
            if (currentHumans < maxHumansPerStation / 2) {
                const availableSpace = maxHumansPerStation - currentHumans;
                const newArrivals = Math.min(Math.floor(Math.random() * 2), availableSpace); // 0 or 1
                for (let i = 0; i < newArrivals; i++) {
                    const human = createHuman(stationName);
                    if (human) {
                        stationData[stationName].humans.push(human);
                        scene.add(human);
                    }
                }
            }
        });
    }
}, 5000);