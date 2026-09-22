import { useMemo, useState } from "react";
import {
    Canvas,
    useThree,
} from "@react-three/fiber";
import {
    OrbitControls,
    Text,
    Html,
    Float,
} from "@react-three/drei";
import * as THREE from "three";
import {
    Cpu,
    Droplets,
    Thermometer,
    Sun,
    CloudRain,
    Zap,
    Radio,
    Activity,
    X,
} from "lucide-react";

/* -------------------------------------------------------
   COLORS
------------------------------------------------------- */

const COLORS = {
    healthy: "#62c87b",
    active: "#37d6e8",
    warning: "#d6a84f",
    fault: "#e05e5e",
    offline: "#6f7773",
    soil: "#6b4d35",
    soilDark: "#493528",
    board: "#173d2b",
    boardDark: "#0d2419",
};

/* -------------------------------------------------------
   COMPONENT DATA
------------------------------------------------------- */

const componentInfo = {
    soil1: {
        title: "Soil Moisture 01",
        type: "CAPACITIVE SOIL SENSOR",
        description:
            "Primary soil moisture measurement point used for soil condition assessment.",
        icon: Droplets,
    },

    soil2: {
        title: "Soil Moisture 02",
        type: "CAPACITIVE SOIL SENSOR",
        description:
            "Secondary soil measurement point used for cross-validation and spatial comparison.",
        icon: Droplets,
    },

    dht22: {
        title: "DHT22",
        type: "TEMPERATURE / HUMIDITY",
        description:
            "Measures ambient temperature and relative humidity for microclimate analysis.",
        icon: Thermometer,
    },

    bh1750: {
        title: "BH1750",
        type: "LIGHT SENSOR",
        description:
            "Digital ambient light sensor providing illumination measurements in lux.",
        icon: Sun,
    },

    rain: {
        title: "RAIN SENSOR",
        type: "PRECIPITATION DETECTION",
        description:
            "Detects rainfall events and provides environmental context for adaptive monitoring.",
        icon: CloudRain,
    },

    ina219: {
        title: "INA219",
        type: "POWER MONITOR",
        description:
            "Measures monitored bus voltage, current and power consumption of the monitoring node.",
        icon: Zap,
    },

    esp32: {
        title: "ESP32",
        type: "EDGE CONTROLLER",
        description:
            "Collects sensor measurements and communicates telemetry with the monitoring backend.",
        icon: Cpu,
    },
};

/* -------------------------------------------------------
   3D SENSOR NODE
------------------------------------------------------- */

function SensorNode({
    position,
    id,
    color = COLORS.healthy,
    label,
    selected,
    onSelect,
}) {
    return (
        <group
            position={position}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(id);
            }}
        >
            <Float
                speed={selected ? 2 : 1}
                rotationIntensity={selected ? 0.2 : 0.05}
                floatIntensity={selected ? 0.5 : 0.15}
            >
                <mesh>
                    <cylinderGeometry args={[0.18, 0.18, 0.08, 24]} />
                    <meshStandardMaterial
                        color={selected ? "#ffffff" : color}
                        emissive={color}
                        emissiveIntensity={selected ? 0.8 : 0.35}
                    />
                </mesh>

                <mesh position={[0, 0.12, 0]}>
                    <cylinderGeometry args={[0.045, 0.045, 0.25, 12]} />
                    <meshStandardMaterial
                        color={color}
                        emissive={color}
                        emissiveIntensity={0.4}
                    />
                </mesh>

                <Text
                    position={[0, 0.35, 0]}
                    fontSize={0.16}
                    color="#dce8df"
                    anchorX="center"
                    anchorY="middle"
                >
                    {label}
                </Text>
            </Float>
        </group>
    );
}

/* -------------------------------------------------------
   ESP32
------------------------------------------------------- */

function ESP32Node({
    position,
    selected,
    onSelect,
}) {
    return (
        <group
            position={position}
            onClick={(event) => {
                event.stopPropagation();
                onSelect("esp32");
            }}
        >
            <mesh>
                <boxGeometry args={[1.1, 0.18, 0.62]} />
                <meshStandardMaterial
                    color={selected ? "#285d43" : COLORS.board}
                    roughness={0.65}
                    metalness={0.15}
                />
            </mesh>

            <mesh position={[0, 0.14, 0]}>
                <boxGeometry args={[0.42, 0.04, 0.32]} />
                <meshStandardMaterial
                    color="#10261c"
                    roughness={0.8}
                />
            </mesh>

            <mesh position={[0.47, 0.12, 0]}>
                <boxGeometry args={[0.08, 0.04, 0.42]} />
                <meshStandardMaterial
                    color="#b6b6a8"
                    metalness={0.7}
                    roughness={0.25}
                />
            </mesh>

            <Text
                position={[0, 0.3, 0]}
                fontSize={0.18}
                color="#dce8df"
                anchorX="center"
                anchorY="middle"
            >
                ESP32
            </Text>
        </group>
    );
}

/* -------------------------------------------------------
   INA219
------------------------------------------------------- */

function INA219Node({
    position,
    selected,
    onSelect,
}) {
    return (
        <group
            position={position}
            onClick={(event) => {
                event.stopPropagation();
                onSelect("ina219");
            }}
        >
            <mesh>
                <boxGeometry args={[0.55, 0.12, 0.38]} />
                <meshStandardMaterial
                    color={selected ? "#285d43" : COLORS.board}
                />
            </mesh>

            <mesh position={[0, 0.09, 0]}>
                <boxGeometry args={[0.22, 0.03, 0.16]} />
                <meshStandardMaterial color="#0c1511" />
            </mesh>

            <Text
                position={[0, 0.23, 0]}
                fontSize={0.14}
                color="#dce8df"
                anchorX="center"
                anchorY="middle"
            >
                INA219
            </Text>
        </group>
    );
}

/* -------------------------------------------------------
   CONNECTION LINE
------------------------------------------------------- */

function ConnectionLine({
    start,
    end,
    active = true,
}) {
    const points = useMemo(() => {
        const startVector = new THREE.Vector3(...start);
        const endVector = new THREE.Vector3(...end);

        return [startVector, endVector];
    }, [start, end]);

    const geometry = useMemo(() => {
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        return geo;
    }, [points]);

    return (
        <line geometry={geometry}>
            <lineBasicMaterial
                color={active ? COLORS.active : COLORS.offline}
                transparent
                opacity={active ? 0.65 : 0.2}
            />
        </line>
    );
}

/* -------------------------------------------------------
   FIELD PLATFORM
------------------------------------------------------- */

function FieldPlatform({
    onSelect,
}) {
    return (
        <group>
            {/* Soil base */}
            <mesh
                position={[0, -0.25, 0]}
                receiveShadow
            >
                <boxGeometry args={[8, 0.45, 5]} />
                <meshStandardMaterial
                    color={COLORS.soil}
                    roughness={1}
                />
            </mesh>

            {/* Soil surface */}
            <mesh position={[0, 0.01, 0]}>
                <boxGeometry args={[7.8, 0.06, 4.8]} />
                <meshStandardMaterial
                    color={COLORS.soilDark}
                    roughness={1}
                />
            </mesh>

            {/* Soil sensor 1 */}
            <SensorNode
                position={[-2.4, 0.25, -0.8]}
                id="soil1"
                label="SOIL 01"
                color={COLORS.healthy}
                onSelect={onSelect}
            />

            {/* Soil sensor 2 */}
            <SensorNode
                position={[2.1, 0.25, 0.8]}
                id="soil2"
                label="SOIL 02"
                color={COLORS.healthy}
                onSelect={onSelect}
            />

            {/* DHT22 */}
            <SensorNode
                position={[-1.5, 0.35, 1.5]}
                id="dht22"
                label="DHT22"
                color={COLORS.healthy}
                onSelect={onSelect}
            />

            {/* BH1750 */}
            <SensorNode
                position={[0.8, 0.35, -1.5]}
                id="bh1750"
                label="BH1750"
                color={COLORS.healthy}
                onSelect={onSelect}
            />

            {/* Rain */}
            <SensorNode
                position={[2.8, 0.35, -1.5]}
                id="rain"
                label="RAIN"
                color={COLORS.healthy}
                onSelect={onSelect}
            />

            {/* ESP32 mounting point */}
            <ESP32Node
                position={[0, 0.38, 0]}
                onSelect={onSelect}
            />

            {/* INA219 */}
            <INA219Node
                position={[1.5, 0.42, 1.4]}
                onSelect={onSelect}
            />

            {/* Communication lines */}
            <ConnectionLine
                start={[-2.4, 0.3, -0.8]}
                end={[0, 0.45, 0]}
            />

            <ConnectionLine
                start={[2.1, 0.3, 0.8]}
                end={[0, 0.45, 0]}
            />

            <ConnectionLine
                start={[-1.5, 0.4, 1.5]}
                end={[0, 0.45, 0]}
            />

            <ConnectionLine
                start={[0.8, 0.4, -1.5]}
                end={[0, 0.45, 0]}
            />

            <ConnectionLine
                start={[2.8, 0.4, -1.5]}
                end={[0, 0.45, 0]}
            />

            <ConnectionLine
                start={[1.5, 0.45, 1.4]}
                end={[0, 0.45, 0]}
            />
        </group>
    );
}

/* -------------------------------------------------------
   DETAIL PANEL
------------------------------------------------------- */

function DetailPanel({
    selected,
    onClose,
}) {
    if (!selected) {
        return null;
    }

    const info = componentInfo[selected];

    if (!info) {
        return null;
    }

    const Icon = info.icon;

    return (
        <div className="field-detail-panel">
            <button
                className="field-detail-close"
                onClick={onClose}
            >
                <X size={16} />
            </button>

            <div className="field-detail-icon">
                <Icon size={21} />
            </div>

            <div className="field-detail-type">
                {info.type}
            </div>

            <h3>{info.title}</h3>

            <p>{info.description}</p>

            <div className="field-detail-status">
                <span className="field-status-dot" />
                MONITORING NODE
            </div>
        </div>
    );
}

/* -------------------------------------------------------
   MAIN FIELD PAGE
------------------------------------------------------- */

export default function FieldPage({
    backendConnected = false,
    liveData = null,
}) {
    const [selected, setSelected] = useState(null);

    const statusColor = backendConnected
        ? COLORS.healthy
        : COLORS.offline;

    return (
        <div className="field-page">

            <div className="field-header-row">
                <div>
                    <div className="section-kicker">
                        PHYSICAL SYSTEM MODEL
                    </div>

                    <h2>Field Twin</h2>

                    <p>
                        Interactive representation of the SmartFarm
                        monitoring prototype.
                    </p>
                </div>

                <div className="field-status">
                    <span
                        style={{
                            background: statusColor,
                        }}
                    />

                    {backendConnected
                        ? "LIVE TELEMETRY"
                        : "HARDWARE OFFLINE"}
                </div>
            </div>

            <div className="field-workspace">

                <div className="field-canvas">

                    <Canvas
                        camera={{
                            position: [8, 6, 8],
                            fov: 45,
                        }}
                        shadows
                    >
                        <color
                            attach="background"
                            args={["#07100c"]}
                        />

                        <ambientLight intensity={1.1} />

                        <directionalLight
                            position={[4, 8, 5]}
                            intensity={2}
                            castShadow
                        />

                        <pointLight
                            position={[-4, 3, -3]}
                            intensity={1}
                            color="#62c87b"
                        />

                        <FieldPlatform
                            onSelect={setSelected}
                        />

                        <OrbitControls
                            enableDamping
                            dampingFactor={0.08}
                            minDistance={5}
                            maxDistance={16}
                            maxPolarAngle={Math.PI / 2.05}
                        />

                        <gridHelper
                            args={[14, 14, "#193326", "#0e2017"]}
                            position={[0, -0.02, 0]}
                        />
                    </Canvas>

                    <div className="field-canvas-label">
                        <Radio size={14} />
                        SENSOR NETWORK
                    </div>

                    <div className="field-live-indicator">
                        <span
                            style={{
                                background: statusColor,
                            }}
                        />

                        {backendConnected
                            ? "CONNECTED"
                            : "OFFLINE"}
                    </div>

                </div>

                <div className="field-side-panel">

                    <div className="field-panel-label">
                        SYSTEM OVERVIEW
                    </div>

                    <h3>Monitoring Node</h3>

                    <div className="field-metric">
                        <span>ESP32</span>
                        <strong
                            style={{
                                color: statusColor,
                            }}
                        >
                            {backendConnected
                                ? "CONNECTED"
                                : "OFFLINE"}
                        </strong>
                    </div>

                    <div className="field-metric">
                        <span>Soil Sensors</span>
                        <strong>2</strong>
                    </div>

                    <div className="field-metric">
                        <span>Microclimate</span>
                        <strong>3</strong>
                    </div>

                    <div className="field-metric">
                        <span>Power Monitor</span>
                        <strong>INA219</strong>
                    </div>

                    <div className="field-divider" />

                    <div className="field-panel-label">
                        LIVE VALUES
                    </div>

                    <div className="field-live-values">

                        <div>
                            <span>Temperature</span>
                            <strong>
                                {liveData?.temperature != null
                                    ? `${Number(liveData.temperature).toFixed(1)} °C`
                                    : "—"}
                            </strong>
                        </div>

                        <div>
                            <span>Humidity</span>
                            <strong>
                                {liveData?.humidity != null
                                    ? `${Number(liveData.humidity).toFixed(1)} %`
                                    : "—"}
                            </strong>
                        </div>

                        <div>
                            <span>Light</span>
                            <strong>
                                {liveData?.light != null
                                    ? `${Number(liveData.light).toFixed(1)} lux`
                                    : "—"}
                            </strong>
                        </div>

                        <div>
                            <span>Rain</span>
                            <strong>
                                {liveData?.rain == null
                                    ? "—"
                                    : liveData.rain
                                        ? "DETECTED"
                                        : "NO RAIN"}
                            </strong>
                        </div>

                    </div>

                    <div className="field-instruction">
                        <Activity size={15} />

                        Select a component in the 3D
                        field model to inspect it.
                    </div>

                </div>

                <DetailPanel
                    selected={selected}
                    onClose={() => setSelected(null)}
                />

            </div>
        </div>
    );
}