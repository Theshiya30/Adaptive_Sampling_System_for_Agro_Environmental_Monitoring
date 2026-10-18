import { useEffect, useState } from "react";
import axios from "axios";
import * as THREE from "three";
import UIEnhancements from "./UIEnhancements";
const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

import {
    Activity,
    BarChart3,
    Bell,
    ChevronRight,
    CloudRain,
    Droplets,
    Gauge,
    Leaf,
    Radio,
    Settings,
    Sun,
    Moon,
    FileDown,
    AlertTriangle,
    ShieldCheck,
    Check,
    X,
    Thermometer,
    Wifi,
    Zap,
    Cpu,
    Battery,
} from "lucide-react";

import { getRealtimeAlerts } from "./alertEngine";
import { generatePdfReport } from "./reportGenerator";

import {
    ResponsiveContainer,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    BarChart,
    Bar,
} from "recharts";

import {
    Canvas,
} from "@react-three/fiber";

import {
    OrbitControls,
    Html,
    Line as DreiLine,
} from "@react-three/drei";


// =========================================================
// NAVIGATION
// =========================================================

const navigation = [
    {
        id: "live",
        label: "LIVE",
        icon: Activity,
    },
    {
        id: "field",
        label: "FIELD",
        icon: Leaf,
    },
    {
        id: "analysis",
        label: "ANALYSIS",
        icon: BarChart3,
    },
    {
        id: "alerts",
        label: "ALERTS",
        icon: Bell,
    },
];


// =========================================================
// MAIN APP
// =========================================================

function App() {

    const [activePage, setActivePage] =
        useState("live");

    const [liveData, setLiveData] =
        useState(null);

    const [backendConnected, setBackendConnected] =
        useState(false);

    const [historyData, setHistoryData] =
        useState([]);

    const [isPdfModalOpen, setIsPdfModalOpen] =
        useState(false);

    const [theme, setTheme] = useState(() => {
        return localStorage.getItem("smartfarm_theme") || "dark";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("smartfarm_theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "dark" ? "light" : "dark"));
    };

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/api/history?limit=500`
                );
                const records = Array.isArray(response.data?.records)
                    ? response.data.records
                    : Array.isArray(response.data?.history)
                        ? response.data.history
                        : [];
                setHistoryData(records);
            } catch (error) {
                // Non-blocking background history fetch
            }
        };

        fetchHistory();
        const interval = setInterval(fetchHistory, 5000);
        return () => clearInterval(interval);
    }, []);


    // =======================================================
    // LIVE BACKEND POLLING
    // =======================================================

    useEffect(() => {

        const fetchLiveData = async () => {

            try {

                const response = await axios.get(
                    `${API_BASE_URL}/api/status`
                );

                const raw = response.data;

                // Normalize the backend response so the LIVE UI can consume
                // sensor, adaptive and stability fields consistently.
                const sensorData = raw.sensor_data || {};
                const adaptive = raw.adaptive_decision || {};
                const stability = raw.farm_stability || {};
                const system = raw.system || {};

                const data = {
                    ...raw,
                    ...sensorData,
                    ...adaptive,
                    ...stability,
                    timestamp: raw.timestamp || system.last_update || null,
                    connected: raw.connected === true,
                    data_age_seconds: raw.data_age_seconds ?? null,
                    hardware_status: system.hardware_status || null,
                    last_known_stability: raw.last_known_stability || null,
                    last_known_stability_timestamp: raw.last_known_stability_timestamp || null,
                };

                setLiveData(data);

                setBackendConnected(true);

            } catch (error) {

                console.error(
                    "Backend connection failed:",
                    error
                );

                setBackendConnected(false);

            }

        };


        fetchLiveData();

        const interval = setInterval(
            fetchLiveData,
            2000
        );


        return () => {
            clearInterval(interval);
        };

    }, []);


    // =======================================================
    // HARDWARE STATUS
    // =======================================================

    const getHardwareStatus = () => {
        if (!backendConnected) {
            return "OFFLINE";
        }

        if (liveData?.is_simulated === true || liveData?.data_source === "SIMULATION") {
            return "SIMULATION";
        }

        if (!liveData) {
            return "NO_DATA";
        }

        if (liveData.connected === true) {
            return "LIVE";
        }

        if (
            liveData.data_age_seconds !== null &&
            liveData.data_age_seconds !== undefined &&
            liveData.data_age_seconds <= 180
        ) {
            return "STALE";
        }

        if (
            liveData.last_known_telemetry ||
            liveData.last_known_stability ||
            liveData.data_source === "LAST KNOWN HARDWARE" ||
            liveData.hardware_status === "ESP32 NOT CONNECTED" ||
            liveData.timestamp ||
            (historyData && historyData.length > 0)
        ) {
            return "OFFLINE";
        }

        return "NO_DATA";
    };


    const hardwareStatus =
        getHardwareStatus();


    // =======================================================
    // SENSOR HEALTH ENGINE — M2
    // =======================================================

    const getSensorHealth = () => {

        const offlineHealth = {
            soil1: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
            soil2: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
            dht22: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
            bh1750: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
            rain: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
            ina219: { state: "OFFLINE", reason: "No fresh hardware telemetry" },
        };

        if (hardwareStatus === "OFFLINE") {
            return offlineHealth;
        }

        if (hardwareStatus === "STALE") {
            const stale = {
                soil1: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
                soil2: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
                dht22: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
                bh1750: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
                rain: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
                ina219: { state: "STALE", reason: "Last reading retained; no fresh telemetry" },
            };
            return stale;
        }

        if (hardwareStatus !== "LIVE") {
            return offlineHealth;
        }

        const soil1 = Number(liveData?.soil_moisture_1);
        const soil2 = Number(liveData?.soil_moisture_2);
        const temperature = Number(liveData?.temperature);
        const humidity = Number(liveData?.humidity);
        const light = Number(liveData?.light);
        const busVoltage = Number(liveData?.bus_voltage);
        const current = Number(liveData?.current_mA);
        const power = Number(liveData?.power_mW);

        const soil1Valid = Number.isFinite(soil1) && soil1 >= 0 && soil1 <= 100;
        const soil2Valid = Number.isFinite(soil2) && soil2 >= 0 && soil2 <= 100;
        const temperatureValid = Number.isFinite(temperature) && temperature >= -40 && temperature <= 80;
        const humidityValid = Number.isFinite(humidity) && humidity >= 0 && humidity <= 100;
        const lightValid = Number.isFinite(light) && light >= 0;
        const rainValid = typeof liveData?.rain === "boolean";
        const ina219Valid = Number.isFinite(busVoltage) && Number.isFinite(current) && Number.isFinite(power);

        const soilDifference = soil1Valid && soil2Valid ? Math.abs(soil1 - soil2) : null;
        const soilVerification = soilDifference !== null && soilDifference > 25;

        return {
            soil1: {
                state: !soil1Valid ? "FAULT" : soilVerification ? "VERIFY" : "HEALTHY",
                reason: !soil1Valid ? "Invalid moisture value" : soilVerification ? "Significant difference from Soil 02" : "Reading within valid range",
            },
            soil2: {
                state: !soil2Valid ? "FAULT" : soilVerification ? "VERIFY" : "HEALTHY",
                reason: !soil2Valid ? "Invalid moisture value" : soilVerification ? "Significant difference from Soil 01" : "Reading within valid range",
            },
            dht22: {
                state: temperatureValid && humidityValid ? "HEALTHY" : "FAULT",
                reason: temperatureValid && humidityValid ? "Temperature and humidity valid" : "Invalid temperature or humidity",
            },
            bh1750: {
                state: lightValid ? "HEALTHY" : "FAULT",
                reason: lightValid ? "Light reading valid" : "Invalid light reading",
            },
            rain: {
                state: rainValid ? "HEALTHY" : "FAULT",
                reason: rainValid ? "Rain sensor reading valid" : "Rain reading unavailable",
            },
            ina219: {
                state: ina219Valid ? "HEALTHY" : "FAULT",
                reason: ina219Valid ? "Energy measurements valid" : "Invalid voltage/current/power",
            },
        };
    };

    const sensorHealth = getSensorHealth();

    const realAlerts = getRealtimeAlerts({
        liveData,
        backendConnected,
        sensorHealth,
        history: historyData,
    });

    const activeAlertsCount = realAlerts.filter(
        (a) => a.severity === "CRITICAL" || a.severity === "WARNING"
    ).length;


    return (

        <div className="app-shell">

            <UIEnhancements />

            <style>{`
        .field-page {
          box-sizing: border-box;
        }

        .field-page > * {
          min-width: 0;
          min-height: 0;
        }

        .field-page .recharts-responsive-container,
        .field-page .recharts-wrapper,
        .field-page .recharts-surface {
          min-width: 0 !important;
        }

        .large-chart,
        .chart-host {
          width: 100% !important;
          min-width: 0 !important;
        }

        .large-chart .recharts-responsive-container,
        .chart-host .recharts-responsive-container {
          width: 100% !important;
          height: 280px !important;
          min-width: 0 !important;
          min-height: 280px !important;
        }

        /* Analysis charts must never preserve desktop columns on a narrow viewport.
           The existing chart layouts use inline grid definitions, so this rule
           intentionally overrides those definitions only on small screens. */
        .analysis-page {
          min-width: 0 !important;
          width: 100% !important;
          max-width: 100% !important;
          overflow-x: hidden !important;
        }

        .analysis-page [style*="grid-template-columns"] {
          min-width: 0 !important;
          max-width: 100% !important;
        }

        .analysis-page .panel,
        .analysis-page .chart-panel,
        .analysis-page .large-chart,
        .analysis-page .chart-host {
          min-width: 0 !important;
          max-width: 100% !important;
          box-sizing: border-box;
        }

        .analysis-page .recharts-responsive-container {
          max-width: 100% !important;
          min-width: 0 !important;
        }

        @media (max-width: 820px) {
          .analysis-page [style*="grid-template-columns"] {
            grid-template-columns: minmax(0, 1fr) !important;
          }

          .analysis-page .recharts-responsive-container {
            width: 100% !important;
          }
        }

        @media (max-width: 1100px) {
          .field-page {
            grid-template-columns: minmax(0, 1fr) 280px !important;
          }
        }

        @media (max-width: 820px) {
          .field-page {
            grid-template-columns: minmax(0, 1fr) !important;
            grid-template-rows: minmax(460px, 60vh) auto !important;
            height: auto !important;
            min-height: 0 !important;
          }

          .field-page > * {
            width: 100%;
          }
        }

        @media (max-width: 600px) {
          .field-page {
            grid-template-rows: minmax(380px, 52vh) auto !important;
            gap: 12px !important;
          }

          .field-page > div:first-child {
            min-height: 380px !important;
          }

          .large-chart,
          .chart-host {
            height: 260px !important;
            min-height: 260px !important;
          }
        }
      `}</style>

            {/* =================================================
          SIDEBAR
         ================================================= */}

            <aside className="sidebar">

                <div className="brand">

                    <div className="brand-mark">
                        <Leaf size={20} />
                    </div>

                    <div>

                        <div className="brand-name">
                            SMARTFARM
                        </div>

                        <div className="brand-subtitle">
                            AGRO-ENVIRONMENTAL MONITORING
                        </div>

                    </div>

                </div>


                <nav className="navigation">

                    {navigation.map((item) => {

                        const Icon = item.icon;

                        return (

                            <button
                                key={item.id}
                                className={`nav-item ${activePage === item.id
                                    ? "active"
                                    : ""
                                    }`}
                                onClick={() =>
                                    setActivePage(item.id)
                                }
                            >

                                <Icon size={18} />

                                <span>
                                    {item.label}
                                </span>

                                {item.id === "alerts" && activeAlertsCount > 0 && (
                                    <span className="alert-counter-badge">
                                        {activeAlertsCount}
                                    </span>
                                )}

                                {activePage === item.id && (

                                    <ChevronRight
                                        className="nav-arrow"
                                        size={15}
                                    />

                                )}

                            </button>

                        );

                    })}

                </nav>


                {/* SIDEBAR STATUS */}

                <div className="sidebar-bottom">

                    <div className="system-status">

                        <span
                            className="status-dot"
                            style={{
                                background:
                                    hardwareStatus === "LIVE"
                                        ? "#62c87b"
                                        : hardwareStatus === "STALE"
                                            ? "#d4a84b"
                                            : "#777",

                                boxShadow:
                                    hardwareStatus === "LIVE"
                                        ? "0 0 10px rgba(98, 200, 123, 0.5)"
                                        : "none",
                            }}
                        />

                        <div>

                            <div className="status-title">

                                {hardwareStatus === "LIVE"
                                    ? "SYSTEM ONLINE"
                                    : hardwareStatus === "STALE"
                                        ? "DATA STALE"
                                        : hardwareStatus === "SIMULATION"
                                            ? "SIMULATION MODE"
                                            : hardwareStatus === "NO_DATA"
                                                ? "NO HARDWARE DATA"
                                                : "HARDWARE OFFLINE"}

                            </div>

                            <div className="status-description">
                                ESP32 monitoring node
                            </div>

                        </div>

                    </div>


                    <button className="settings-button">

                        <Settings size={17} />

                        Settings

                    </button>

                </div>

            </aside>


            {/* =================================================
          MAIN CONTENT
         ================================================= */}

            <main className="main-content">


                {/* TOP BAR */}

                <header className="topbar">

                    <div>

                        <div className="page-kicker">
                            AGRO-ENVIRONMENTAL MONITORING
                        </div>

                        <h1>
                            {activePage.toUpperCase()}
                        </h1>

                    </div>


                    <div className="topbar-actions">

                        <button
                            className="pdf-report-btn"
                            onClick={() => setIsPdfModalOpen(true)}
                            title="Generate and download farm telemetry PDF report"
                        >
                            <FileDown size={15} />
                            <span>PDF Report</span>
                        </button>

                        <button
                            className="theme-toggle-btn"
                            onClick={toggleTheme}
                            title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
                        >
                            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                            <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
                        </button>

                        <div className="connection-status">

                            <span
                                className="connection-dot"
                                style={{
                                    background:
                                        hardwareStatus === "LIVE"
                                            ? "#62c87b"
                                            : hardwareStatus === "STALE"
                                                ? "#d4a84b"
                                                : "#777",

                                    boxShadow:
                                        hardwareStatus === "LIVE"
                                            ? "0 0 10px rgba(98, 200, 123, 0.5)"
                                            : "none",
                                }}
                            />

                            <div>

                                <div className="connection-label">
                                    ESP32
                                </div>

                                <div className="connection-value">

                                    {hardwareStatus === "LIVE"
                                        ? "CONNECTED"
                                        : hardwareStatus === "STALE"
                                            ? "STALE DATA"
                                            : hardwareStatus === "SIMULATION"
                                                ? "SIMULATION"
                                                : hardwareStatus === "NO_DATA"
                                                    ? "NO DATA"
                                                    : "OFFLINE"}

                                </div>

                            </div>

                            <Wifi size={17} />

                        </div>

                    </div>

                </header>


                {/* =================================================
            LIVE
           ================================================= */}
                {activePage === "live" && (
                    <LivePage
                        liveData={liveData}
                        backendConnected={backendConnected}
                        hardwareStatus={hardwareStatus}
                        sensorHealth={sensorHealth}
                    />
                )}

                {activePage === "field" && (
                    <FieldPage
                        liveData={liveData}
                        backendConnected={backendConnected}
                        hardwareStatus={hardwareStatus}
                        sensorHealth={sensorHealth}
                    />
                )}

                {activePage === "analysis" && (
                    <AnalysisPage
                        liveData={liveData}
                        backendConnected={backendConnected}
                        hardwareStatus={hardwareStatus}
                        theme={theme}
                        onOpenPdfModal={() => setIsPdfModalOpen(true)}
                    />
                )}

                {activePage === "alerts" && (
                    <AlertsPage
                        liveData={liveData}
                        backendConnected={backendConnected}
                        sensorHealth={sensorHealth}
                        historyData={historyData}
                        alerts={realAlerts}
                        onOpenPdfModal={() => setIsPdfModalOpen(true)}
                    />
                )}

            </main>

            <PdfReportModal
                isOpen={isPdfModalOpen}
                onClose={() => setIsPdfModalOpen(false)}
                liveData={liveData}
                historyData={historyData}
                alerts={realAlerts}
            />

        </div>
    );
}


// =========================================================
// LIVE PAGE
// =========================================================

function LivePage({
    liveData,
    backendConnected,
    hardwareStatus,
    sensorHealth,
}) {

    const getDataAgeText = () => {

        if (
            liveData?.data_age_seconds === null ||
            liveData?.data_age_seconds === undefined
        ) {
            return "No reading received";
        }

        const age = Math.max(
            0,
            Math.round(
                liveData.data_age_seconds
            )
        );


        if (age < 60) {
            return `${age}s ago`;
        }


        const minutes =
            Math.floor(age / 60);

        const seconds =
            age % 60;


        if (minutes < 60) {
            return `${minutes}m ${seconds}s ago`;
        }


        const hours =
            Math.floor(minutes / 60);

        const remainingMinutes =
            minutes % 60;


        return `${hours}h ${remainingMinutes}m ago`;
    };


    const getLastReadingTime = () => {

        if (!liveData?.timestamp) {
            return "No reading received";
        }

        try {

            return new Date(
                liveData.timestamp
            ).toLocaleTimeString();

        } catch {

            return "Unknown";

        }

    };


    const statusConfig = {

        LIVE: {

            title:
                "LIVE MONITORING",

            description:
                "The ESP32 monitoring node is connected and transmitting fresh environmental data.",

            color:
                "#62c87b",

        },


        STALE: {

            title:
                "STALE DATA",

            description:
                "The ESP32 has stopped transmitting recently. The displayed readings are the last known hardware values.",

            color:
                "#d4a84b",

        },


        OFFLINE: {
            title:
                "HARDWARE OFFLINE",
            description:
                "The ESP32 is powered off. Displaying last known verified telemetry and persisted historical records.",
            color:
                "#777",
        },

        NO_DATA: {
            title:
                "NO HARDWARE DATA",
            description:
                "The backend is running, but no ESP32 sensor reading has been recorded yet.",
            color:
                "#777",
        },

        SIMULATION: {
            title:
                "SIMULATION MODE",
            description:
                "Displaying simulated telemetry. Physical hardware monitoring is paused.",
            color:
                "#42c8d9",
        },

    };


    const currentStatus =
        statusConfig[hardwareStatus] || statusConfig.OFFLINE;


    // =======================================================
    // LAST-KNOWN STABILITY & TELEMETRY
    // =======================================================
    const hasCurrentStability =
        backendConnected &&
        hardwareStatus === "LIVE" &&
        [liveData?.ssi, liveData?.msi, liveData?.fsi]
            .every((value) => Number.isFinite(Number(value)));

    const stabilityDisplay = hasCurrentStability
        ? {
            ssi: Number(liveData.ssi),
            msi: Number(liveData.msi),
            fsi: Number(liveData.fsi),
            ssi_status: liveData.ssi_status,
            msi_status: liveData.msi_status,
            fsi_status: liveData.fsi_status,
            timestamp: liveData.timestamp,
            state: "CURRENT",
        }
        : (liveData?.last_known_stability || (liveData?.ssi !== undefined && liveData?.ssi !== null))
            ? {
                ssi: Number(liveData.last_known_stability?.ssi ?? liveData.ssi),
                msi: Number(liveData.last_known_stability?.msi ?? liveData.msi),
                fsi: Number(liveData.last_known_stability?.fsi ?? liveData.fsi),
                ssi_status: liveData.last_known_stability?.ssi_status ?? liveData.ssi_status ?? "STABLE",
                msi_status: liveData.last_known_stability?.msi_status ?? liveData.msi_status ?? "STABLE",
                fsi_status: liveData.last_known_stability?.fsi_status ?? liveData.fsi_status ?? "STABLE",
                timestamp: liveData.last_known_stability_timestamp || liveData.timestamp,
                state: "LAST KNOWN",
            }
            : null;

    const activeSensorData = (hardwareStatus === "OFFLINE" && liveData?.last_known_telemetry)
        ? { ...liveData, ...liveData.last_known_telemetry }
        : liveData;

    const sensors = [
        {
            name: "Soil Moisture 01",
            value: activeSensorData?.soil_moisture_1,
            unit: "%",
            icon: Droplets,
        },
        {
            name: "Soil Moisture 02",
            value: activeSensorData?.soil_moisture_2,
            unit: "%",
            icon: Droplets,
        },
        {
            name: "Temperature",
            value: activeSensorData?.temperature,
            unit: "°C",
            icon: Thermometer,
        },
        {
            name: "Humidity",
            value: activeSensorData?.humidity,
            unit: "%",
            icon: Activity,
        },
        {
            name: "Light",
            value: activeSensorData?.light,
            unit: "lux",
            icon: Sun,
        },
        {
            name: "Rain",
            value:
                activeSensorData?.rain === true
                    ? "YES"
                    : activeSensorData?.rain === false
                        ? "NO"
                        : "—",
            unit: "",
            icon: CloudRain,
        },
    ];

    const getSensorLabel = () => {
        if (hardwareStatus === "LIVE") {
            return "LIVE";
        }
        if (hardwareStatus === "SIMULATION") {
            return "SIMULATED";
        }
        if (hardwareStatus === "STALE" || hardwareStatus === "OFFLINE") {
            return (activeSensorData?.temperature !== undefined && activeSensorData?.temperature !== null)
                ? "LAST KNOWN"
                : "NO DATA";
        }
        return "NO DATA";
    };


    return (

        <div className="page-content">


            {/* =================================================
          HERO
         ================================================= */}

            <section className="hero-grid">


                <div className="state-panel">

                    <div className="panel-label">
                        CURRENT FARM STATE
                    </div>


                    <div className="state-row">

                        <div>

                            <div className="state-title">

                                {currentStatus.title}

                            </div>


                            <p className="state-description">

                                {currentStatus.description}

                            </p>


                            <div
                                style={{
                                    marginTop: "12px",
                                    color: "#68776e",
                                    fontFamily:
                                        '"JetBrains Mono", monospace',
                                    fontSize: "10px",
                                }}
                            >

                                Last hardware reading:{" "}

                                <strong
                                    style={{
                                        color:
                                            currentStatus.color,
                                    }}
                                >
                                    {getLastReadingTime()}
                                </strong>

                                {" • "}

                                {getDataAgeText()}

                            </div>

                        </div>


                        <div
                            className="state-indicator"
                            style={{
                                borderColor:
                                    currentStatus.color,

                                color:
                                    currentStatus.color,
                            }}
                        >

                            <Radio size={22} />

                        </div>

                    </div>

                </div>


                {/* ADAPTIVE */}

                <div className="adaptive-panel">

                    <div className="panel-label">
                        ADAPTIVE MODE
                    </div>


                    <div className="adaptive-value">

                        <span
                            className="mode-indicator"
                            style={{
                                background:
                                    liveData?.adaptive_mode === "RAPID"
                                        ? "#d65f5f"
                                        : liveData?.adaptive_mode === "VERIFICATION"
                                            ? "#d4a84b"
                                            : liveData?.adaptive_mode === "ADAPTIVE"
                                                ? "#d4a84b"
                                                : liveData?.adaptive_mode === "NORMAL"
                                                    ? "#62c87b"
                                                    : "#777",
                            }}
                        />

                        {hardwareStatus === "LIVE"
                            ? (liveData?.adaptive_mode || "NOT AVAILABLE")
                            : hardwareStatus === "STALE"
                                ? "STALE DATA"
                                : "NOT AVAILABLE"}

                    </div>


                    <div className="adaptive-meta">

                        Sampling interval{" "}

                        <strong>
                            {hardwareStatus === "LIVE" && liveData?.sampling_interval
                                ? `${liveData.sampling_interval} sec`
                                : "—"}
                        </strong>

                    </div>


                    <div
                        style={{
                            marginTop: "8px",
                            color: "#5f6c64",
                            fontSize: "10px",
                            lineHeight: "1.5",
                        }}
                    >

                        {hardwareStatus === "LIVE"
                            ? (liveData?.adaptive_reason || "Adaptive decision received")
                            : hardwareStatus === "STALE"
                                ? "Last adaptive decision retained; no fresh telemetry."
                                : "Adaptive decision unavailable until hardware telemetry is received."}

                    </div>

                </div>

            </section>


            {/* =================================================
          SENSOR SECTION
         ================================================= */}

            <section className="section">

                <div className="section-heading">

                    <div>

                        <div className="section-kicker">
                            REAL-TIME TELEMETRY
                        </div>

                        <h2>
                            Environmental Sensors
                        </h2>

                    </div>


                    <div className="freshness">

                        <span
                            style={{
                                background:
                                    currentStatus.color,
                            }}
                        />


                        {hardwareStatus === "LIVE"
                            ? "Live hardware data"
                            : hardwareStatus === "STALE"
                                ? "Last known data"
                                : hardwareStatus === "OFFLINE"
                                    ? "Hardware offline"
                                    : "Waiting for hardware"}

                    </div>

                </div>


                <div className="sensor-grid">

                    {sensors.map((sensor) => {

                        const Icon =
                            sensor.icon;


                        return (

                            <div
                                className="sensor-card"
                                key={sensor.name}
                            >

                                <div className="sensor-card-top">

                                    <div className="sensor-icon">
                                        <Icon size={18} />
                                    </div>


                                    <span
                                        className="sensor-status"
                                        style={{
                                            color:
                                                currentStatus.color,
                                        }}
                                    >
                                        {getSensorLabel()}
                                    </span>

                                </div>


                                <div className="sensor-name">
                                    {sensor.name}
                                </div>


                                <div className="sensor-reading">

                                    {sensor.value ?? "—"}

                                    <span>
                                        {sensor.unit}
                                    </span>

                                </div>


                                {hardwareStatus !== "LIVE" &&
                                    hardwareStatus !== "NO_DATA" &&
                                    liveData?.timestamp && (

                                        <div
                                            style={{
                                                marginTop: "7px",
                                                color: "#5f6c64",
                                                fontFamily:
                                                    '"JetBrains Mono", monospace',
                                                fontSize: "9px",
                                            }}
                                        >

                                            {getDataAgeText()}

                                        </div>

                                    )}

                            </div>

                        );

                    })}

                </div>

            </section>


            {/* =================================================
          SENSOR HEALTH — M2
         ================================================= */}

            <section className="section">

                <div className="section-heading">

                    <div>
                        <div className="section-kicker">
                            SENSOR HEALTH
                        </div>

                        <h2>
                            Sensor Status
                        </h2>
                    </div>

                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "12px",
                    }}
                >

                    {[
                        ["Soil 01", sensorHealth?.soil1],
                        ["Soil 02", sensorHealth?.soil2],
                        ["DHT22", sensorHealth?.dht22],
                        ["BH1750", sensorHealth?.bh1750],
                        ["Rain", sensorHealth?.rain],
                        ["INA219", sensorHealth?.ina219],
                    ].map(([name, health]) => {

                        const state = health?.state || "UNKNOWN";

                        const stateColor =
                            state === "HEALTHY"
                                ? "#62c87b"
                                : state === "VERIFY" || state === "STALE"
                                    ? "#d4a84b"
                                    : state === "FAULT"
                                        ? "#d65f5f"
                                        : "#777";

                        return (

                            <div
                                className="panel"
                                key={name}
                                style={{ padding: "16px" }}
                            >

                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                    }}
                                >

                                    <span
                                        style={{
                                            fontSize: "13px",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {name}
                                    </span>

                                    <span
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "6px",
                                            color: stateColor,
                                            fontFamily: '"JetBrains Mono", monospace',
                                            fontSize: "10px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                width: "7px",
                                                height: "7px",
                                                borderRadius: "50%",
                                                background: stateColor,
                                            }}
                                        />
                                        {state}
                                    </span>

                                </div>

                                <div
                                    style={{
                                        marginTop: "9px",
                                        color: "#708077",
                                        fontSize: "10px",
                                        lineHeight: "1.5",
                                    }}
                                >
                                    {health?.reason || "Sensor state unavailable"}
                                </div>

                            </div>

                        );
                    })}

                </div>

            </section>


            {/* =================================================
          BOTTOM PANELS
         ================================================= */}

            <section className="bottom-grid">


                {/* STABILITY */}

                <div className="panel">

                    <div className="panel-header">

                        <div>

                            <div className="panel-label">
                                STABILITY ASSESSMENT
                            </div>

                            <h2>
                                Farm Stability Index
                            </h2>

                        </div>

                        <Gauge size={20} />

                    </div>


                    {stabilityDisplay ? (

                        <div>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                                    gap: "10px",
                                    marginTop: "14px",
                                }}
                            >

                                {[
                                    ["SSI", "Soil Stability Index", stabilityDisplay.ssi, stabilityDisplay.ssi_status],
                                    ["MSI", "Microclimate Stability Index", stabilityDisplay.msi, stabilityDisplay.msi_status],
                                    ["FSI", "Farm Stability Index", stabilityDisplay.fsi, stabilityDisplay.fsi_status],
                                ].map(([code, label, value, status]) => (

                                    <div
                                        key={code}
                                        style={{
                                            border: "1px solid #dfe7e1",
                                            borderRadius: "14px",
                                            padding: "14px",
                                            background: "#fbfdfb",
                                        }}
                                    >
                                        <div
                                            style={{
                                                fontSize: "10px",
                                                fontFamily: '"JetBrains Mono", monospace',
                                                color: "#718078",
                                                letterSpacing: "0.08em",
                                            }}
                                        >
                                            {code}
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "28px",
                                                fontWeight: 700,
                                                lineHeight: 1.1,
                                                marginTop: "7px",
                                                color: "#193d29",
                                            }}
                                        >
                                            {Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "—"}
                                        </div>
                                        <div style={{ fontSize: "10px", color: "#65736b", marginTop: "5px" }}>
                                            {label}
                                        </div>
                                        <div
                                            style={{
                                                marginTop: "9px",
                                                fontSize: "9px",
                                                fontFamily: '"JetBrains Mono", monospace',
                                                color: "#4f8b61",
                                            }}
                                        >
                                            {status || "ASSESSED"}
                                        </div>
                                    </div>

                                ))}

                            </div>

                            <div
                                style={{
                                    marginTop: "12px",
                                    fontSize: "10px",
                                    color: "#68776e",
                                    lineHeight: 1.5,
                                }}
                            >
                                {stabilityDisplay.state === "CURRENT"
                                    ? "Calculated from the latest validated hardware telemetry."
                                    : `Last valid hardware assessment • ${stabilityDisplay.timestamp
                                        ? new Date(stabilityDisplay.timestamp).toLocaleString()
                                        : "time unavailable"
                                    }`}
                            </div>

                        </div>

                    ) : (

                        <div className="stability-content">
                            <div className="stability-score">—</div>
                            <div className="stability-info">
                                <div className="stability-state">NO ASSESSMENT</div>
                                <p>
                                    No validated hardware stability assessment has been recorded yet.
                                </p>
                            </div>
                        </div>

                    )}

                </div>


                {/* ENERGY */}

                <div className="panel">

                    <div className="panel-header">

                        <div>

                            <div className="panel-label">
                                ENERGY MONITORING
                            </div>

                            <h2>
                                Power System
                            </h2>

                        </div>

                        <Zap size={20} />

                    </div>


                    <div className="power-grid">

                        <PowerMetric
                            label="BUS VOLTAGE"
                            value={
                                liveData?.bus_voltage ??
                                "—"
                            }
                            unit="V"
                        />


                        <PowerMetric
                            label="CURRENT"
                            value={
                                liveData?.current_mA ??
                                "—"
                            }
                            unit="mA"
                        />


                        <PowerMetric
                            label="POWER"
                            value={
                                liveData?.power_mW ??
                                "—"
                            }
                            unit="mW"
                        />

                    </div>

                </div>

            </section>

        </div>
    );
}


// =========================================================
// FIELD PAGE
// =========================================================

function FieldPage({
    liveData,
    hardwareStatus,
    sensorHealth,
}) {

    const [selectedSensor, setSelectedSensor] =
        useState("ESP32");


    const componentData = {

        ESP32: {

            title:
                "ESP32",

            type:
                "EDGE CONTROLLER",

            description:
                "Primary edge controller responsible for sensor acquisition and communication with the backend.",

            status:
                hardwareStatus,

            icon:
                Cpu,

        },


        "SOIL-01": {

            title:
                "SOIL MOISTURE 01",

            type:
                "SOIL SENSOR",

            description:
                "Capacitive soil moisture sensor used for soil-zone moisture measurement.",

            status:
                sensorHealth?.soil1?.state ?? "UNKNOWN",

            value:
                liveData?.soil_moisture_1,

            unit:
                "%",

            icon:
                Droplets,

        },


        "SOIL-02": {

            title:
                "SOIL MOISTURE 02",

            type:
                "SOIL SENSOR",

            description:
                "Second capacitive soil moisture sensor used for spatial cross-validation.",

            status:
                sensorHealth?.soil2?.state ?? "UNKNOWN",

            value:
                liveData?.soil_moisture_2,

            unit:
                "%",

            icon:
                Droplets,

        },


        DHT22: {

            title:
                "DHT22",

            type:
                "MICROCLIMATE SENSOR",

            description:
                "Measures ambient temperature and relative humidity.",

            status:
                sensorHealth?.dht22?.state ?? "UNKNOWN",

            value:
                liveData?.temperature,

            unit:
                "°C",

            secondary:
                liveData?.humidity,

            secondaryUnit:
                "%",

            icon:
                Thermometer,

        },


        BH1750: {

            title:
                "BH1750",

            type:
                "LIGHT SENSOR",

            description:
                "Digital ambient light sensor providing illumination measurements in lux.",

            status:
                sensorHealth?.bh1750?.state ?? "UNKNOWN",

            value:
                liveData?.light,

            unit:
                "lux",

            icon:
                Sun,

        },


        RAIN: {

            title:
                "RAIN SENSOR",

            type:
                "PRECIPITATION SENSOR",

            description:
                "Rain detection module used to identify wet conditions and precipitation events.",

            status:
                sensorHealth?.rain?.state ?? "UNKNOWN",

            value:
                liveData?.rain === true
                    ? "RAIN"
                    : liveData?.rain === false
                        ? "NO RAIN"
                        : "—",

            unit:
                "",

            icon:
                CloudRain,

        },


        INA219: {

            title:
                "INA219",

            type:
                "ENERGY MONITOR",

            description:
                "Monitors the regulated system bus voltage, current and calculated power.",

            status:
                sensorHealth?.ina219?.state ?? "UNKNOWN",

            value:
                liveData?.bus_voltage,

            unit:
                "V",

            secondary:
                liveData?.current_mA,

            secondaryUnit:
                "mA",

            icon:
                Battery,

        },

    };


    const selected =
        componentData[selectedSensor];

    const SelectedIcon =
        selected.icon;


    return (

        <div
            className="field-page"
            style={{
                minHeight:
                    "calc(100vh - 110px)",

                position:
                    "relative",

                display:
                    "grid",

                gridTemplateColumns:
                    "minmax(0, 1fr) minmax(280px, 320px)",

                gridTemplateRows:
                    "minmax(560px, 1fr)",

                alignItems:
                    "stretch",

                gap:
                    "18px",

                width:
                    "100%",

                minWidth:
                    0,
            }}
        >


            {/* =================================================
          3D VIEW
         ================================================= */}

            <div
                style={{
                    position:
                        "relative",

                    overflow:
                        "hidden",

                    border:
                        "1px solid rgba(98, 200, 123, 0.16)",

                    borderRadius:
                        "14px",

                    background:
                        "radial-gradient(circle at 50% 35%, rgba(31,55,43,0.42), rgba(7,14,11,0.96) 70%)",

                    minWidth:
                        0,

                    minHeight:
                        0,

                    height:
                        "100%",
                }}
            >


                <div
                    style={{
                        position:
                            "absolute",

                        top:
                            "18px",

                        left:
                            "20px",

                        zIndex:
                            5,
                    }}
                >

                    <div
                        style={{
                            fontFamily:
                                '"JetBrains Mono", monospace',

                            fontSize:
                                "10px",

                            letterSpacing:
                                "0.18em",

                            color:
                                "#62756a",
                        }}
                    >
                        FIELD TWIN
                    </div>


                    <div
                        style={{
                            marginTop:
                                "5px",

                            fontSize:
                                "17px",

                            fontWeight:
                                600,

                            color:
                                "#e8eee9",
                        }}
                    >
                        Prototype Sensor Layout
                    </div>

                </div>


                {/* LEGEND */}

                <div
                    style={{
                        position:
                            "absolute",

                        bottom:
                            "18px",

                        left:
                            "20px",

                        zIndex:
                            5,

                        display:
                            "flex",

                        gap:
                            "14px",

                        flexWrap:
                            "wrap",

                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "9px",

                        color:
                            "#708077",
                    }}
                >

                    <LegendDot
                        color="#62c87b"
                        label="LIVE"
                    />

                    <LegendDot
                        color="#d4a84b"
                        label="VERIFY"
                    />

                    <LegendDot
                        color="#777"
                        label="OFFLINE"
                    />

                    <LegendDot
                        color="#42c8d9"
                        label="DATA PATH"
                    />

                </div>


                <Canvas
                    style={{
                        width: "100%",
                        height: "100%",
                        display: "block",
                    }}
                    camera={{
                        position:
                            [7, 6, 9],

                        fov:
                            45,
                    }}

                    dpr={[
                        1,
                        2,
                    ]}
                >

                    <color
                        attach="background"
                        args={[
                            "#07100c",
                        ]}
                    />


                    <ambientLight
                        intensity={
                            1.5
                        }
                    />


                    <directionalLight
                        position={[
                            4,
                            8,
                            5,
                        ]}
                        intensity={
                            2.5
                        }
                    />


                    <directionalLight
                        position={[
                            -4,
                            3,
                            -3,
                        ]}
                        intensity={
                            1
                        }
                    />


                    <FieldGround />


                    {/* SOIL 01 */}

                    <SensorNode
                        id="SOIL-01"
                        position={[
                            -2.2,
                            0.25,
                            0.8,
                        ]}
                        label="SOIL 01"
                        icon="soil"
                        selected={
                            selectedSensor ===
                            "SOIL-01"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "SOIL-01"
                            )
                        }
                        status={
                            sensorHealth?.soil1?.state ?? hardwareStatus
                        }
                    />


                    {/* SOIL 02 */}

                    <SensorNode
                        id="SOIL-02"
                        position={[
                            0.4,
                            0.25,
                            0.8,
                        ]}
                        label="SOIL 02"
                        icon="soil"
                        selected={
                            selectedSensor ===
                            "SOIL-02"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "SOIL-02"
                            )
                        }
                        status={
                            sensorHealth?.soil2?.state ?? hardwareStatus
                        }
                    />


                    {/* DHT22 */}

                    <SensorNode
                        id="DHT22"
                        position={[
                            -2.7,
                            1.4,
                            -1.7,
                        ]}
                        label="DHT22"
                        icon="dht"
                        selected={
                            selectedSensor ===
                            "DHT22"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "DHT22"
                            )
                        }
                        status={
                            sensorHealth?.dht22?.state ?? hardwareStatus
                        }
                    />


                    {/* BH1750 */}

                    <SensorNode
                        id="BH1750"
                        position={[
                            1.8,
                            1.7,
                            -1.5,
                        ]}
                        label="BH1750"
                        icon="light"
                        selected={
                            selectedSensor ===
                            "BH1750"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "BH1750"
                            )
                        }
                        status={
                            sensorHealth?.bh1750?.state ?? hardwareStatus
                        }
                    />


                    {/* RAIN */}

                    <SensorNode
                        id="RAIN"
                        position={[
                            3.0,
                            0.55,
                            1.8,
                        ]}
                        label="RAIN"
                        icon="rain"
                        selected={
                            selectedSensor ===
                            "RAIN"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "RAIN"
                            )
                        }
                        status={
                            sensorHealth?.rain?.state ?? hardwareStatus
                        }
                    />


                    {/* INA219 */}

                    <SensorNode
                        id="INA219"
                        position={[
                            2.7,
                            0.7,
                            -1.0,
                        ]}
                        label="INA219"
                        icon="power"
                        selected={
                            selectedSensor ===
                            "INA219"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "INA219"
                            )
                        }
                        status={
                            sensorHealth?.ina219?.state ?? hardwareStatus
                        }
                    />


                    {/* ESP32 */}

                    <ESP32Node
                        position={[
                            0,
                            1.35,
                            0,
                        ]}
                        selected={
                            selectedSensor ===
                            "ESP32"
                        }
                        onClick={() =>
                            setSelectedSensor(
                                "ESP32"
                            )
                        }
                        status={
                            hardwareStatus
                        }
                    />


                    {/* DATA PATH */}

                    <DreiLine
                        points={[
                            [
                                -2.2,
                                0.35,
                                0.8,
                            ],
                            [
                                0,
                                1.35,
                                0,
                            ],
                            [
                                0.4,
                                0.35,
                                0.8,
                            ],
                        ]}
                        color="#42c8d9"
                        lineWidth={1}
                        transparent
                        opacity={
                            hardwareStatus ===
                                "LIVE"
                                ? 0.8
                                : 0.2
                        }
                    />


                    <DreiLine
                        points={[
                            [
                                -2.7,
                                1.4,
                                -1.7,
                            ],
                            [
                                0,
                                1.35,
                                0,
                            ],
                            [
                                1.8,
                                1.7,
                                -1.5,
                            ],
                        ]}
                        color="#42c8d9"
                        lineWidth={1}
                        transparent
                        opacity={
                            hardwareStatus ===
                                "LIVE"
                                ? 0.7
                                : 0.15
                        }
                    />


                    <DreiLine
                        points={[
                            [
                                3.0,
                                0.55,
                                1.8,
                            ],
                            [
                                0,
                                1.35,
                                0,
                            ],
                            [
                                2.7,
                                0.7,
                                -1.0,
                            ],
                        ]}
                        color="#42c8d9"
                        lineWidth={1}
                        transparent
                        opacity={
                            hardwareStatus ===
                                "LIVE"
                                ? 0.7
                                : 0.15
                        }
                    />


                    <OrbitControls
                        enableDamping
                        dampingFactor={
                            0.08
                        }
                        minDistance={
                            5
                        }
                        maxDistance={
                            15
                        }
                        target={[
                            0,
                            0.5,
                            0,
                        ]}
                    />

                </Canvas>


                <div
                    style={{
                        position:
                            "absolute",

                        right:
                            "18px",

                        bottom:
                            "18px",

                        zIndex:
                            5,

                        padding:
                            "8px 11px",

                        border:
                            "1px solid rgba(255,255,255,0.08)",

                        borderRadius:
                            "8px",

                        background:
                            "rgba(5,10,8,0.75)",

                        color:
                            "#65746c",

                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "9px",
                    }}
                >
                    DRAG TO ROTATE · SCROLL TO ZOOM · CLICK SENSOR
                </div>

            </div>


            {/* =================================================
          COMPONENT INSPECTOR
         ================================================= */}

            <div
                style={{
                    border:
                        "1px solid rgba(98, 200, 123, 0.16)",

                    borderRadius:
                        "14px",

                    background:
                        "rgba(13,23,18,0.92)",

                    padding:
                        "22px",

                    display:
                        "flex",

                    flexDirection:
                        "column",

                    minWidth:
                        0,
                }}
            >

                <div
                    style={{
                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "10px",

                        letterSpacing:
                            "0.18em",

                        color:
                            "#62756a",
                    }}
                >
                    COMPONENT INSPECTOR
                </div>


                <div
                    style={{
                        marginTop:
                            "18px",

                        display:
                            "flex",

                        alignItems:
                            "center",

                        gap:
                            "12px",
                    }}
                >

                    <div
                        style={{
                            width:
                                "42px",

                            height:
                                "42px",

                            display:
                                "grid",

                            placeItems:
                                "center",

                            border:
                                "1px solid rgba(98,200,123,0.25)",

                            borderRadius:
                                "10px",

                            background:
                                "rgba(98,200,123,0.07)",

                            color:
                                "#62c87b",
                        }}
                    >

                        <SelectedIcon
                            size={20}
                        />

                    </div>


                    <div>

                        <div
                            style={{
                                color:
                                    "#e7eee9",

                                fontSize:
                                    "16px",

                                fontWeight:
                                    600,
                            }}
                        >
                            {selected.title}
                        </div>


                        <div
                            style={{
                                marginTop:
                                    "4px",

                                color:
                                    "#607067",

                                fontFamily:
                                    '"JetBrains Mono", monospace',

                                fontSize:
                                    "9px",
                            }}
                        >
                            {selected.type}
                        </div>

                    </div>

                </div>


                {/* STATUS */}

                <div
                    style={{
                        marginTop:
                            "24px",

                        padding:
                            "12px 13px",

                        border:
                            "1px solid rgba(255,255,255,0.07)",

                        borderRadius:
                            "9px",
                    }}
                >

                    <div
                        style={{
                            color:
                                "#64736a",

                            fontFamily:
                                '"JetBrains Mono", monospace',

                            fontSize:
                                "9px",
                        }}
                    >
                        STATUS
                    </div>


                    <div
                        style={{
                            marginTop:
                                "7px",

                            color:
                                selected.status === "HEALTHY"
                                    ? "#62c87b"
                                    : selected.status === "VERIFY"
                                        ? "#d4a84b"
                                        : selected.status === "STALE"
                                            ? "#d4a84b"
                                            : selected.status === "FAULT"
                                                ? "#d65f5f"
                                                : selected.status === "OFFLINE"
                                                    ? "#777"
                                                    : hardwareStatus === "LIVE"
                                                        ? "#62c87b"
                                                        : "#777",

                            fontFamily:
                                '"JetBrains Mono", monospace',

                            fontSize:
                                "12px",

                            fontWeight:
                                600,
                        }}
                    >
                        {selected.status}
                    </div>

                </div>


                {/* DESCRIPTION */}

                <div
                    style={{
                        marginTop:
                            "20px",

                        color:
                            "#839189",

                        fontSize:
                            "12px",

                        lineHeight:
                            "1.7",
                    }}
                >
                    {selected.description}
                </div>


                {/* VALUE */}

                {selected.value !==
                    undefined && (

                        <div
                            style={{
                                marginTop:
                                    "24px",
                            }}
                        >

                            <div
                                style={{
                                    color:
                                        "#64736a",

                                    fontFamily:
                                        '"JetBrains Mono", monospace',

                                    fontSize:
                                        "9px",
                                }}
                            >
                                CURRENT READING
                            </div>


                            <div
                                style={{
                                    marginTop:
                                        "7px",

                                    color:
                                        "#e9f0eb",

                                    fontFamily:
                                        '"JetBrains Mono", monospace',

                                    fontSize:
                                        "25px",
                                }}
                            >

                                {selected.value ??
                                    "—"}

                                <span
                                    style={{
                                        marginLeft:
                                            "5px",

                                        color:
                                            "#68776e",

                                        fontSize:
                                            "11px",
                                    }}
                                >
                                    {selected.unit}
                                </span>

                            </div>

                        </div>

                    )}


                {/* SECONDARY */}

                {selected.secondary !==
                    undefined && (

                        <div
                            style={{
                                marginTop:
                                    "14px",

                                display:
                                    "flex",

                                gap:
                                    "25px",
                            }}
                        >

                            <MiniValue
                                label="SECONDARY"
                                value={
                                    selected.secondary
                                }
                                unit={
                                    selected.secondaryUnit
                                }
                            />

                        </div>

                    )}


                <div
                    style={{
                        marginTop:
                            "auto",

                        paddingTop:
                            "20px",

                        borderTop:
                            "1px solid rgba(255,255,255,0.06)",

                        color:
                            "#58665e",

                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "9px",

                        lineHeight:
                            "1.6",
                    }}
                >

                    {hardwareStatus ===
                        "LIVE"
                        ? "Telemetry is being received from the ESP32."
                        : hardwareStatus ===
                            "STALE"
                            ? "Displayed measurement is the last known hardware value."
                            : "Hardware telemetry is currently unavailable."}

                </div>

            </div>

        </div>
    );
}


// =========================================================
// FIELD GROUND
// =========================================================

function FieldGround() {

    return (

        <group>

            <mesh
                rotation={[
                    -Math.PI / 2,
                    0,
                    0,
                ]}
                position={[
                    0,
                    0,
                    0,
                ]}
            >

                <planeGeometry
                    args={[
                        7,
                        5,
                    ]}
                />

                <meshStandardMaterial
                    color="#17231a"
                    roughness={1}
                />

            </mesh>


            <gridHelper
                args={[
                    7,
                    14,
                    "#31523d",
                    "#1b3024",
                ]}
                position={[
                    0,
                    0.015,
                    0,
                ]}
            />


            <lineSegments>

                <edgesGeometry
                    args={[
                        new THREE.BoxGeometry(
                            7,
                            0.15,
                            5
                        ),
                    ]}
                />

                <lineBasicMaterial
                    color="#41644d"
                />

            </lineSegments>

        </group>
    );
}


// =========================================================
// 3D SENSOR NODE
// =========================================================

function SensorNode({
    position,
    label,
    selected,
    onClick,
    status,
    icon,
}) {

    const activeColor =
        status === "LIVE" || status === "HEALTHY"
            ? "#62c87b"
            : status === "STALE" || status === "VERIFY"
                ? "#d4a84b"
                : status === "FAULT"
                    ? "#d65f5f"
                    : "#707a74";


    const getGeometry = () => {

        if (icon === "soil") {

            return (

                <group>

                    <mesh>

                        <cylinderGeometry
                            args={[
                                0.13,
                                0.16,
                                0.8,
                                16,
                            ]}
                        />

                        <meshStandardMaterial
                            color="#a9b2aa"
                            metalness={0.25}
                            roughness={0.55}
                        />

                    </mesh>


                    <mesh
                        position={[
                            0,
                            0.45,
                            0,
                        ]}
                    >

                        <sphereGeometry
                            args={[
                                0.1,
                                12,
                                12,
                            ]}
                        />

                        <meshStandardMaterial
                            color={activeColor}
                            emissive={activeColor}
                            emissiveIntensity={
                                status === "LIVE"
                                    ? 1.2
                                    : 0.2
                            }
                        />

                    </mesh>

                </group>

            );
        }


        if (icon === "dht") {

            return (

                <mesh>

                    <boxGeometry
                        args={[
                            0.5,
                            0.3,
                            0.18,
                        ]}
                    />

                    <meshStandardMaterial
                        color="#d8ded9"
                    />

                </mesh>

            );
        }


        if (icon === "light") {

            return (

                <group>

                    <mesh>

                        <cylinderGeometry
                            args={[
                                0.28,
                                0.28,
                                0.15,
                                20,
                            ]}
                        />

                        <meshStandardMaterial
                            color="#c6cec8"
                        />

                    </mesh>


                    <mesh
                        position={[
                            0,
                            0.16,
                            0,
                        ]}
                    >

                        <sphereGeometry
                            args={[
                                0.08,
                                12,
                                12,
                            ]}
                        />

                        <meshStandardMaterial
                            color="#f0d96c"
                            emissive="#f0d96c"
                            emissiveIntensity={1}
                        />

                    </mesh>

                </group>

            );
        }


        if (icon === "rain") {

            return (

                <group>

                    <mesh>

                        <boxGeometry
                            args={[
                                0.55,
                                0.15,
                                0.45,
                            ]}
                        />

                        <meshStandardMaterial
                            color="#65746c"
                        />

                    </mesh>


                    <mesh
                        position={[
                            0,
                            0.2,
                            0,
                        ]}
                    >

                        <cylinderGeometry
                            args={[
                                0.04,
                                0.04,
                                0.3,
                                10,
                            ]}
                        />

                        <meshStandardMaterial
                            color="#bfcac3"
                        />

                    </mesh>

                </group>

            );
        }


        return (

            <mesh>

                <boxGeometry
                    args={[
                        0.5,
                        0.35,
                        0.25,
                    ]}
                />

                <meshStandardMaterial
                    color="#89958d"
                />

            </mesh>

        );
    };


    return (

        <group
            position={position}
            onClick={(event) => {

                event.stopPropagation();

                onClick();

            }}
        >

            {getGeometry()}


            {selected && (

                <mesh>

                    <ringGeometry
                        args={[
                            0.35,
                            0.43,
                            32,
                        ]}
                    />

                    <meshBasicMaterial
                        color={activeColor}
                        transparent
                        opacity={0.8}
                        side={2}
                    />

                </mesh>

            )}


            <Html
                distanceFactor={8}
                position={[
                    0,
                    0.7,
                    0,
                ]}
                center
            >

                <div
                    style={{
                        padding:
                            "4px 7px",

                        border:
                            `1px solid ${activeColor}55`,

                        borderRadius:
                            "5px",

                        background:
                            "rgba(5,10,8,0.85)",

                        color:
                            activeColor,

                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "8px",

                        whiteSpace:
                            "nowrap",

                        pointerEvents:
                            "none",
                    }}
                >
                    {label}
                </div>

            </Html>

        </group>
    );
}


// =========================================================
// ESP32 3D NODE
// =========================================================

function ESP32Node({
    position,
    selected,
    onClick,
    status,
}) {

    const activeColor =
        status === "LIVE"
            ? "#62c87b"
            : status === "STALE"
                ? "#d4a84b"
                : "#707a74";


    return (

        <group
            position={position}
            onClick={(event) => {

                event.stopPropagation();

                onClick();

            }}
        >

            <mesh>

                <boxGeometry
                    args={[
                        1.15,
                        0.12,
                        0.65,
                    ]}
                />

                <meshStandardMaterial
                    color="#214b38"
                    metalness={0.15}
                    roughness={0.65}
                />

            </mesh>


            <mesh
                position={[
                    0,
                    0.09,
                    0,
                ]}
            >

                <boxGeometry
                    args={[
                        0.35,
                        0.06,
                        0.25,
                    ]}
                />

                <meshStandardMaterial
                    color="#1b2020"
                />

            </mesh>


            <mesh
                position={[
                    0.45,
                    0.09,
                    0.15,
                ]}
            >

                <boxGeometry
                    args={[
                        0.35,
                        0.03,
                        0.04,
                    ]}
                />

                <meshStandardMaterial
                    color="#b4bdb7"
                />

            </mesh>


            <mesh
                position={[
                    -0.4,
                    0.11,
                    -0.2,
                ]}
            >

                <sphereGeometry
                    args={[
                        0.045,
                        12,
                        12,
                    ]}
                />

                <meshStandardMaterial
                    color={activeColor}
                    emissive={activeColor}
                    emissiveIntensity={
                        status === "LIVE"
                            ? 1.5
                            : 0.15
                    }
                />

            </mesh>


            {selected && (

                <mesh
                    position={[
                        0,
                        0.02,
                        0,
                    ]}
                >

                    <boxGeometry
                        args={[
                            1.35,
                            0.04,
                            0.85,
                        ]}
                    />

                    <meshBasicMaterial
                        color={activeColor}
                        wireframe
                    />

                </mesh>

            )}


            <Html
                distanceFactor={7}
                position={[
                    0,
                    0.65,
                    0,
                ]}
                center
            >

                <div
                    style={{
                        padding:
                            "5px 9px",

                        border:
                            `1px solid ${activeColor}66`,

                        borderRadius:
                            "5px",

                        background:
                            "rgba(5,10,8,0.9)",

                        color:
                            activeColor,

                        fontFamily:
                            '"JetBrains Mono", monospace',

                        fontSize:
                            "9px",

                        whiteSpace:
                            "nowrap",

                        pointerEvents:
                            "none",
                    }}
                >
                    ESP32
                </div>

            </Html>

        </group>
    );
}


// =========================================================
// ANALYSIS PAGE
// =========================================================

function AnalysisPage({
    liveData,
    backendConnected,
    hardwareStatus = "OFFLINE",
    theme = "dark",
    onOpenPdfModal,
}) {

    const [historyData, setHistoryData] =
        useState([]);

    const [loading, setLoading] =
        useState(true);

    const [activeTab, setActiveTab] =
        useState("overview");

    const isLight = theme === "light";
    const chartGridStroke = isLight ? "#e2ebe5" : "#26352c";
    const chartAxisStroke = isLight ? "#6b7d72" : "#627067";
    const chartTooltipStyle = {
        background: isLight ? "#ffffff" : "#101a14",
        border: isLight ? "1px solid #cad5ce" : "1px solid #294034",
        color: isLight ? "#16241b" : "#dce7df",
        borderRadius: "8px",
    };


    // =======================================================
    // FETCH HISTORY
    // =======================================================

    useEffect(() => {

        const fetchHistory = async () => {

            try {

                const response =
                    await axios.get(
                        `${API_BASE_URL}/api/history?limit=500`
                    );


                const records =
                    Array.isArray(response.data?.records)
                        ? response.data.records
                        : Array.isArray(response.data?.history)
                            ? response.data.history
                            : [];

                setHistoryData(records);

            } catch (error) {

                console.error(
                    "History fetch failed:",
                    error
                );

            } finally {

                setLoading(false);

            }

        };


        fetchHistory();


        const interval =
            setInterval(
                fetchHistory,
                5000
            );


        return () => {
            clearInterval(interval);
        };

    }, []);


    // =======================================================
    // FORMAT CHART DATA
    // =======================================================

    const chartData =
        historyData.map(
            (record, index) => {

                let time =
                    `#${index + 1}`;


                if (record.timestamp) {

                    try {

                        time =
                            new Date(
                                record.timestamp
                            ).toLocaleTimeString(
                                [],
                                {
                                    hour:
                                        "2-digit",

                                    minute:
                                        "2-digit",

                                    second:
                                        "2-digit",
                                }
                            );

                    } catch {

                        time =
                            `#${index + 1}`;

                    }

                }


                return {

                    ...record,

                    time,

                    temperature:
                        toNumber(
                            record.temperature
                        ),

                    humidity:
                        toNumber(
                            record.humidity
                        ),

                    light:
                        toNumber(
                            record.light
                        ),

                    soil1:
                        toNumber(
                            record.soil_moisture_1
                        ),

                    soil2:
                        toNumber(
                            record.soil_moisture_2
                        ),

                    voltage:
                        toNumber(
                            record.bus_voltage
                        ),

                    current:
                        toNumber(
                            record.current_mA
                        ),

                    power:
                        toNumber(
                            record.power_mW
                        ),

                };

            }
        );


    const latest =
        chartData.length > 0
            ? chartData[
            chartData.length - 1
            ]
            : null;


    const first =
        chartData.length > 0
            ? chartData[0]
            : null;


    const soilDifference =
        latest &&
            latest.soil1 !== null &&
            latest.soil2 !== null
            ? Math.abs(
                latest.soil1 -
                latest.soil2
            )
            : null;


    const temperatureChange =
        first &&
            latest &&
            first.temperature !== null &&
            latest.temperature !== null
            ? latest.temperature -
            first.temperature
            : null;


    const humidityChange =
        first &&
            latest &&
            first.humidity !== null &&
            latest.humidity !== null
            ? latest.humidity -
            first.humidity
            : null;


    const rainCount =
        historyData.filter(
            (item) =>
                item.rain === true
        ).length;


    const tabs = [
        "overview",
        "environment",
        "soil",
        "energy",
    ];


    return (

        <div className="page-content analysis-page">


            {/* =================================================
          ANALYSIS HEADER
         ================================================= */}

            <section
                style={{
                    marginBottom:
                        "22px",
                }}
            >

                <div className="section-kicker">
                    HISTORICAL DATA ANALYSIS
                </div>


                <div
                    style={{
                        display:
                            "flex",

                        justifyContent:
                            "space-between",

                        alignItems:
                            "flex-end",

                        gap:
                            "20px",

                        flexWrap:
                            "wrap",
                    }}
                >

                    <div>

                        <h2
                            style={{
                                marginTop:
                                    "5px",

                                fontSize:
                                    "24px",
                            }}
                        >
                            Environmental Intelligence
                        </h2>


                        <p
                            style={{
                                marginTop:
                                    "7px",

                                color:
                                    "#68776e",

                                fontSize:
                                    "12px",
                            }}
                        >
                            Analysis generated from
                            recorded ESP32 telemetry.
                        </p>

                    </div>


                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>

                        <div
                            style={{
                                padding:
                                    "9px 13px",

                                border:
                                    "1px solid rgba(98,200,123,0.16)",

                                borderRadius:
                                    "8px",

                                color:
                                    "#708078",

                                fontFamily:
                                    '"JetBrains Mono", monospace',

                                fontSize:
                                    "9px",
                            }}
                        >

                            {loading
                                ? "LOADING DATA"
                                : `${historyData.length} RECORDED SAMPLES`}

                        </div>

                        {onOpenPdfModal && (
                            <button
                                className="pdf-report-btn"
                                onClick={onOpenPdfModal}
                                style={{ padding: "8px 14px", fontSize: "10.5px" }}
                            >
                                <FileDown size={14} />
                                <span>Export PDF Report</span>
                            </button>
                        )}

                    </div>

                </div>

            </section>


            {/* =================================================
          TABS
         ================================================= */}

            <div
                style={{
                    display:
                        "flex",

                    gap:
                        "6px",

                    marginBottom:
                        "20px",

                    borderBottom:
                        "1px solid rgba(255,255,255,0.06)",

                    paddingBottom:
                        "10px",

                    overflowX:
                        "auto",
                }}
            >

                {tabs.map((tab) => (

                    <button
                        key={tab}
                        onClick={() =>
                            setActiveTab(tab)
                        }
                        style={{
                            border:
                                "none",

                            borderRadius:
                                "6px",

                            padding:
                                "8px 14px",

                            background:
                                activeTab === tab
                                    ? "rgba(98,200,123,0.12)"
                                    : "transparent",

                            color:
                                activeTab === tab
                                    ? "#62c87b"
                                    : "#68776e",

                            fontFamily:
                                '"JetBrains Mono", monospace',

                            fontSize:
                                "9px",

                            letterSpacing:
                                "0.08em",

                            cursor:
                                "pointer",

                            textTransform:
                                "uppercase",
                        }}
                    >
                        {tab}
                    </button>

                ))}

            </div>


            {/* =================================================
          OFFLINE WITH HISTORY BANNER
         ================================================= */}
            {historyData.length > 0 && hardwareStatus === "OFFLINE" && (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "11px 16px",
                        marginBottom: "20px",
                        borderRadius: "8px",
                        background: isLight ? "#fbf6ec" : "rgba(212, 168, 75, 0.08)",
                        border: isLight ? "1px solid #ead8b1" : "1px solid rgba(212, 168, 75, 0.25)",
                        color: isLight ? "#8a661b" : "#d4a84b",
                        fontSize: "11px",
                        fontFamily: '"JetBrains Mono", monospace'
                    }}
                >
                    <Radio size={14} />
                    <span>ESP32 MONITORING NODE IS OFFLINE &bull; DISPLAYING {historyData.length} PERSISTED HISTORICAL READINGS</span>
                </div>
            )}

            {/* =================================================
          NO DATA
         ================================================= */}

            {!loading &&
                historyData.length === 0 && (

                    <div
                        className="panel"
                        style={{
                            padding:
                                "50px",

                            textAlign:
                                "center",
                        }}
                    >

                        <BarChart3
                            size={30}
                            color="#526159"
                        />


                        <h3
                            style={{
                                marginTop:
                                    "15px",

                                color:
                                    isLight ? "#38473e" : "#aab5ae",
                            }}
                        >
                            No historical records saved yet
                        </h3>


                        <p
                            style={{
                                marginTop:
                                    "8px",

                                color:
                                    isLight ? "#63746a" : "#627067",

                                fontSize:
                                    "12px",
                            }}
                        >
                            The database currently contains no recorded sensor telemetry.
                            Power on the ESP32 monitoring node to start capturing readings.
                        </p>

                    </div>

                )}


            {/* =================================================
          OVERVIEW
         ================================================= */}

            {activeTab ===
                "overview" &&
                historyData.length > 0 && (

                    <>

                        <AnalysisSummary
                            samples={
                                historyData.length
                            }

                            latest={
                                latest
                            }

                            soilDifference={
                                soilDifference
                            }

                            rainCount={
                                rainCount
                            }
                        />


                        <div
                            style={{
                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "minmax(0, 2fr) minmax(300px, 1fr)",

                                gap:
                                    "18px",

                                marginTop:
                                    "18px",
                            }}
                        >

                            <ChartPanel
                                title="Temperature Trend"
                                subtitle="Recorded temperature over time"
                            >

                                <TemperatureChart
                                    data={
                                        chartData
                                    }
                                    theme={theme}
                                />

                            </ChartPanel>


                            <ChartPanel
                                title="Soil Comparison"
                                subtitle="Sensor 01 vs Sensor 02"
                            >

                                <SoilChart
                                    data={
                                        chartData
                                    }
                                    theme={theme}
                                />

                            </ChartPanel>

                        </div>


                        <div
                            style={{
                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "1fr 1fr",

                                gap:
                                    "18px",

                                marginTop:
                                    "18px",
                            }}
                        >

                            <ChartPanel
                                title="Humidity & Light"
                                subtitle="Microclimate measurements"
                            >

                                <EnvironmentChart
                                    data={
                                        chartData
                                    }
                                    theme={theme}
                                />

                            </ChartPanel>


                            <ChartPanel
                                title="Power Consumption"
                                subtitle="Monitored system power"
                            >

                                <PowerChart
                                    data={
                                        chartData
                                    }
                                    theme={theme}
                                />

                            </ChartPanel>

                        </div>


                        <InferencePanel
                            temperatureChange={
                                temperatureChange
                            }

                            humidityChange={
                                humidityChange
                            }

                            soilDifference={
                                soilDifference
                            }

                            samples={
                                historyData.length
                            }
                        />

                    </>

                )}


            {/* =================================================
          ENVIRONMENT
         ================================================= */}

            {activeTab ===
                "environment" &&
                historyData.length > 0 && (

                    <>

                        <ChartPanel
                            title="Temperature"
                            subtitle="Environmental temperature history"
                        >

                            <LargeChart>

                                <LineChart
                                    data={
                                        chartData
                                    }
                                >

                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke={chartGridStroke}
                                    />


                                    <XAxis
                                        dataKey="time"
                                        stroke={chartAxisStroke}
                                        tick={{
                                            fontSize:
                                                9,
                                        }}
                                    />


                                    <YAxis
                                        stroke={chartAxisStroke}
                                        tick={{
                                            fontSize:
                                                9,
                                        }}
                                    />


                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                    />


                                    <Line
                                        type="monotone"
                                        dataKey="temperature"
                                        stroke="#62c87b"
                                        strokeWidth={2}
                                        dot={false}
                                        connectNulls
                                    />

                                </LineChart>

                            </LargeChart>

                        </ChartPanel>


                        <div
                            style={{
                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "1fr 1fr",

                                gap:
                                    "18px",

                                marginTop:
                                    "18px",
                            }}
                        >

                            {/* HUMIDITY */}

                            <ChartPanel
                                title="Humidity"
                                subtitle="Relative humidity history"
                            >

                                <LargeChart>

                                    <LineChart
                                        data={
                                            chartData
                                        }
                                    >

                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={chartGridStroke}
                                        />


                                        <XAxis
                                            dataKey="time"
                                            stroke={chartAxisStroke}
                                        />


                                        <YAxis
                                            stroke={chartAxisStroke}
                                        />


                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                        />


                                        <Line
                                            type="monotone"
                                            dataKey="humidity"
                                            stroke="#42c8d9"
                                            strokeWidth={2}
                                            dot={false}
                                        />

                                    </LineChart>

                                </LargeChart>

                            </ChartPanel>


                            {/* LIGHT */}

                            <ChartPanel
                                title="Light"
                                subtitle="Illumination history"
                            >

                                <LargeChart>

                                    <LineChart
                                        data={
                                            chartData
                                        }
                                    >

                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={chartGridStroke}
                                        />


                                        <XAxis
                                            dataKey="time"
                                            stroke={chartAxisStroke}
                                        />


                                        <YAxis
                                            stroke={chartAxisStroke}
                                        />


                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                        />


                                        <Line
                                            type="monotone"
                                            dataKey="light"
                                            stroke="#d4a84b"
                                            strokeWidth={2}
                                            dot={false}
                                        />

                                    </LineChart>

                                </LargeChart>

                            </ChartPanel>

                        </div>


                        <div
                            className="panel"
                            style={{
                                marginTop:
                                    "18px",

                                padding:
                                    "20px",
                            }}
                        >

                            <div className="panel-label">
                                OBSERVATION
                            </div>


                            <p
                                style={{
                                    marginTop:
                                        "10px",

                                    color:
                                        "#8b9991",

                                    fontSize:
                                        "12px",

                                    lineHeight:
                                        "1.7",
                                }}
                            >

                                {temperatureChange !==
                                    null

                                    ? `Temperature changed by ${temperatureChange.toFixed(
                                        2
                                    )}°C across the currently recorded observation window.`

                                    : "Additional temperature records are required for temporal change analysis."}

                            </p>

                        </div>

                    </>

                )}


            {/* =================================================
          SOIL
         ================================================= */}

            {activeTab ===
                "soil" &&
                historyData.length > 0 && (

                    <>

                        <ChartPanel
                            title="Soil Moisture Cross-Validation"
                            subtitle="Comparison between the two physical soil sensors"
                        >

                            <LargeChart>

                                <LineChart
                                    data={
                                        chartData
                                    }
                                >

                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke={chartGridStroke}
                                    />


                                    <XAxis
                                        dataKey="time"
                                        stroke={chartAxisStroke}
                                    />


                                    <YAxis
                                        stroke={chartAxisStroke}
                                    />


                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                    />


                                    <Legend />


                                    <Line
                                        type="monotone"
                                        dataKey="soil1"
                                        name="Soil 01"
                                        stroke="#62c87b"
                                        strokeWidth={2}
                                        dot
                                    />


                                    <Line
                                        type="monotone"
                                        dataKey="soil2"
                                        name="Soil 02"
                                        stroke="#42c8d9"
                                        strokeWidth={2}
                                        dot
                                    />

                                </LineChart>

                            </LargeChart>

                        </ChartPanel>


                        <div
                            style={{
                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "repeat(3, 1fr)",

                                gap:
                                    "18px",

                                marginTop:
                                    "18px",
                            }}
                        >

                            <MetricBox
                                label="SOIL 01"
                                value={
                                    latest?.soil1
                                }
                                unit="%"
                            />


                            <MetricBox
                                label="SOIL 02"
                                value={
                                    latest?.soil2
                                }
                                unit="%"
                            />


                            <MetricBox
                                label="SENSOR DIFFERENCE"
                                value={
                                    soilDifference !==
                                        null
                                        ? soilDifference.toFixed(
                                            2
                                        )
                                        : "—"
                                }
                                unit="%"
                            />

                        </div>


                        <div
                            className="panel"
                            style={{
                                marginTop:
                                    "18px",

                                padding:
                                    "20px",
                            }}
                        >

                            <div className="panel-label">
                                CROSS-VALIDATION
                            </div>


                            <p
                                style={{
                                    marginTop:
                                        "10px",

                                    color:
                                        "#87948d",

                                    fontSize:
                                        "12px",

                                    lineHeight:
                                        "1.7",
                                }}
                            >

                                {soilDifference !==
                                    null

                                    ? `The latest readings differ by ${soilDifference.toFixed(
                                        2
                                    )} percentage points. This difference is displayed for sensor comparison; additional observations are required before classifying the difference as spatial variation or sensor abnormality.`

                                    : "Both soil sensors require valid readings for cross-validation."}

                            </p>

                        </div>

                    </>

                )}


            {/* =================================================
          ENERGY
         ================================================= */}

            {activeTab ===
                "energy" &&
                historyData.length > 0 && (

                    <>

                        <ChartPanel
                            title="Power System History"
                            subtitle="INA219 monitored electrical parameters"
                        >

                            <LargeChart>

                                <LineChart
                                    data={
                                        chartData
                                    }
                                >

                                    <CartesianGrid
                                        strokeDasharray="3 3"
                                        stroke={chartGridStroke}
                                    />


                                    <XAxis
                                        dataKey="time"
                                        stroke={chartAxisStroke}
                                    />


                                    <YAxis
                                        stroke={chartAxisStroke}
                                    />


                                    <Tooltip
                                        contentStyle={chartTooltipStyle}
                                    />


                                    <Legend />


                                    <Line
                                        type="monotone"
                                        dataKey="voltage"
                                        name="Voltage (V)"
                                        stroke="#62c87b"
                                        strokeWidth={2}
                                        dot={false}
                                    />


                                    <Line
                                        type="monotone"
                                        dataKey="current"
                                        name="Current (mA)"
                                        stroke="#42c8d9"
                                        strokeWidth={2}
                                        dot={false}
                                    />

                                </LineChart>

                            </LargeChart>

                        </ChartPanel>


                        <div
                            style={{
                                marginTop:
                                    "18px",
                            }}
                        >

                            <ChartPanel
                                title="Power"
                                subtitle="Calculated monitored power"
                            >

                                <LargeChart>

                                    <BarChart
                                        data={
                                            chartData
                                        }
                                    >

                                        <CartesianGrid
                                            strokeDasharray="3 3"
                                            stroke={chartGridStroke}
                                        />


                                        <XAxis
                                            dataKey="time"
                                            stroke={chartAxisStroke}
                                        />


                                        <YAxis
                                            stroke={chartAxisStroke}
                                        />


                                        <Tooltip
                                            contentStyle={chartTooltipStyle}
                                        />


                                        <Bar
                                            dataKey="power"
                                            name="Power (mW)"
                                            fill="#62c87b"
                                            radius={[
                                                3,
                                                3,
                                                0,
                                                0,
                                            ]}
                                        />

                                    </BarChart>

                                </LargeChart>

                            </ChartPanel>

                        </div>


                        <div
                            style={{
                                display:
                                    "grid",

                                gridTemplateColumns:
                                    "repeat(3, 1fr)",

                                gap:
                                    "18px",

                                marginTop:
                                    "18px",
                            }}
                        >

                            <MetricBox
                                label="BUS VOLTAGE"
                                value={
                                    latest?.voltage
                                }
                                unit="V"
                            />


                            <MetricBox
                                label="CURRENT"
                                value={
                                    latest?.current
                                }
                                unit="mA"
                            />


                            <MetricBox
                                label="POWER"
                                value={
                                    latest?.power
                                }
                                unit="mW"
                            />

                        </div>

                    </>

                )}

        </div>
    );
}


// =========================================================
// ANALYSIS SUMMARY
// =========================================================

function AnalysisSummary({
    samples,
    latest,
    soilDifference,
    rainCount,
}) {

    return (

        <div
            style={{
                display:
                    "grid",

                gridTemplateColumns:
                    "repeat(4, 1fr)",

                gap:
                    "14px",
            }}
        >

            <MetricBox
                label="SAMPLES"
                value={
                    samples
                }
                unit="records"
            />


            <MetricBox
                label="TEMPERATURE"
                value={
                    latest?.temperature
                }
                unit="°C"
            />


            <MetricBox
                label="SOIL DIFFERENCE"
                value={
                    soilDifference !==
                        null
                        ? soilDifference.toFixed(
                            2
                        )
                        : "—"
                }
                unit="%"
            />


            <MetricBox
                label="RAIN EVENTS"
                value={
                    rainCount
                }
                unit="events"
            />

        </div>
    );
}
// =========================================================
// PDF REPORT GENERATION MODAL
// =========================================================

function PdfReportModal({
    isOpen,
    onClose,
    liveData,
    historyData = [],
    alerts = [],
}) {
    const [range, setRange] = useState("all");
    const [customFrom, setCustomFrom] = useState("");
    const [customTo, setCustomTo] = useState("");
    const [isGenerating, setIsGenerating] = useState(false);
    const [downloadSuccess, setDownloadSuccess] = useState("");

    if (!isOpen) return null;

    const handleDownload = async () => {
        setIsGenerating(true);
        setDownloadSuccess("");
        try {
            const filename = generatePdfReport({
                liveData,
                historyData,
                alerts,
                dateRange: range,
                customRange: range === "custom" && customFrom && customTo
                    ? { from: customFrom, to: customTo }
                    : null,
            });
            setDownloadSuccess(`Successfully exported: ${filename}`);
            setTimeout(() => {
                setDownloadSuccess("");
                onClose();
            }, 1400);
        } catch (error) {
            console.error("PDF generation failed:", error);
            alert("Could not generate PDF report: " + error.message);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div>
                        <div className="panel-label">AGRO-INTELLIGENCE EXPORT</div>
                        <h3 className="modal-title">Generate Farm Telemetry PDF</h3>
                    </div>
                    <button className="modal-close-btn" onClick={onClose} aria-label="Close dialog">
                        <X size={18} />
                    </button>
                </div>

                <p style={{ color: "#798b80", fontSize: "12px", lineHeight: "1.6", margin: "0 0 16px" }}>
                    Exports an executive PDF intelligence report containing current sensor readings, SSI/MSI/FSI stability indices, adaptive sampling intervals, active & historical alerts, agronomic recommendations, and vector trend charts.
                </p>

                <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-primary, #e2ebe4)", marginBottom: "8px" }}>
                    Select Telemetry Date / Sample Scope:
                </div>

                <div className="range-options-grid">
                    <button
                        type="button"
                        className={`range-option-btn ${range === "all" ? "selected" : ""}`}
                        onClick={() => setRange("all")}
                    >
                        <strong>All Recorded History</strong>
                        <div style={{ fontSize: "9px", opacity: 0.75, marginTop: "2px" }}>
                            {historyData.length} total telemetry samples
                        </div>
                    </button>

                    <button
                        type="button"
                        className={`range-option-btn ${range === "24h" ? "selected" : ""}`}
                        onClick={() => setRange("24h")}
                    >
                        <strong>Last 24 Hours</strong>
                        <div style={{ fontSize: "9px", opacity: 0.75, marginTop: "2px" }}>
                            Complete diurnal microclimate cycle
                        </div>
                    </button>

                    <button
                        type="button"
                        className={`range-option-btn ${range === "12h" ? "selected" : ""}`}
                        onClick={() => setRange("12h")}
                    >
                        <strong>Last 12 Hours</strong>
                        <div style={{ fontSize: "9px", opacity: 0.75, marginTop: "2px" }}>
                            Recent daytime/nighttime shift
                        </div>
                    </button>

                    <button
                        type="button"
                        className={`range-option-btn ${range === "1h" ? "selected" : ""}`}
                        onClick={() => setRange("1h")}
                    >
                        <strong>Last 1 Hour</strong>
                        <div style={{ fontSize: "9px", opacity: 0.75, marginTop: "2px" }}>
                            Immediate high-resolution readings
                        </div>
                    </button>
                </div>

                <div
                    style={{
                        background: "rgba(98, 200, 123, 0.07)",
                        border: "1px solid rgba(98, 200, 123, 0.2)",
                        borderRadius: "8px",
                        padding: "10px 14px",
                        fontSize: "11px",
                        color: "#7cc98f",
                        lineHeight: "1.5",
                    }}
                >
                    ✓ <strong>Included in report:</strong> Dual Soil Moisture probes (S1/S2/Avg), DHT22 Temp & Humidity, BH1750 Light, Rain detection, INA219 Battery & Power, SSI / MSI / FSI stability metrics, {alerts.length} verified real-time events, and 2 scalable vector charts.
                </div>

                {downloadSuccess && (
                    <div style={{ marginTop: "12px", color: "#62c87b", fontSize: "11px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                        <Check size={15} /> {downloadSuccess}
                    </div>
                )}

                <div className="modal-actions">
                    <button className="modal-btn-secondary" onClick={onClose} disabled={isGenerating}>
                        Cancel
                    </button>
                    <button className="modal-btn-primary" onClick={handleDownload} disabled={isGenerating}>
                        <FileDown size={14} />
                        <span>{isGenerating ? "Compiling Report..." : "Download PDF Report"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

// =========================================================
// ALERTS PAGE
// =========================================================

function AlertsPage({
    liveData,
    backendConnected,
    sensorHealth,
    historyData = [],
    alerts: propAlerts,
    onOpenPdfModal,
}) {
    const [selectedFilter, setSelectedFilter] = useState("ALL");

    // Use passed alerts or compute dynamically
    const alerts = propAlerts || getRealtimeAlerts({
        liveData,
        backendConnected,
        sensorHealth,
        history: historyData,
    });

    const criticalCount = alerts.filter((a) => a.severity === "CRITICAL").length;
    const warningCount = alerts.filter((a) => a.severity === "WARNING").length;
    const infoCount = alerts.filter((a) => a.severity === "INFO").length;

    const filteredAlerts = alerts.filter((a) => {
        if (selectedFilter === "CRITICAL") return a.severity === "CRITICAL";
        if (selectedFilter === "WARNING") return a.severity === "WARNING";
        if (selectedFilter === "INFO") return a.severity === "INFO";
        return true;
    });

    const getSeverityStyles = (severity) => {
        if (severity === "CRITICAL") {
            return {
                color: "#e87a7a",
                borderLeft: "3px solid #d65f5f",
                bgBadge: "rgba(214, 95, 95, 0.15)",
                borderBadge: "rgba(214, 95, 95, 0.35)",
            };
        }
        if (severity === "WARNING") {
            return {
                color: "#e0b65a",
                borderLeft: "3px solid #d4a84b",
                bgBadge: "rgba(212, 168, 75, 0.15)",
                borderBadge: "rgba(212, 168, 75, 0.35)",
            };
        }
        return {
            color: "#7fe099",
            borderLeft: "3px solid #62c87b",
            bgBadge: "rgba(98, 200, 123, 0.15)",
            borderBadge: "rgba(98, 200, 123, 0.35)",
        };
    };

    const fsi = liveData?.fsi ?? liveData?.farm_stability?.fsi ?? 100;
    const fsiStatus = liveData?.fsi_status ?? liveData?.farm_stability?.fsi_status ?? "STABLE";

    return (
        <div className="page-content">

            <section className="section" style={{ marginTop: 0 }}>

                {/* HEADING ROW */}
                <div
                    className="section-heading"
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-end",
                        flexWrap: "wrap",
                        gap: "16px",
                        marginBottom: "20px",
                    }}
                >
                    <div>
                        <div className="section-kicker">
                            REAL-TIME TELEMETRY DIAGNOSTICS
                        </div>
                        <h2>
                            System & Sensor Alerts
                        </h2>
                        <p style={{ margin: "4px 0 0", color: "#74867b", fontSize: "12px" }}>
                            Real-time alerts derived from ESP32 telemetry, hardware fault detection, and agro-stability thresholds.
                        </p>
                    </div>

                    {onOpenPdfModal && (
                        <button className="pdf-report-btn" onClick={onOpenPdfModal}>
                            <FileDown size={15} />
                            <span>Export Alerts PDF</span>
                        </button>
                    )}
                </div>

                {/* STATS OVERVIEW CARDS */}
                <div className="alerts-stats-grid">
                    <div className="alert-stat-card">
                        <div
                            className="alert-stat-icon"
                            style={{
                                background: "rgba(98, 200, 123, 0.12)",
                                color: "#62c87b",
                            }}
                        >
                            <Bell size={20} />
                        </div>
                        <div>
                            <div className="alert-stat-label">TOTAL EVENTS</div>
                            <div className="alert-stat-value">{alerts.length}</div>
                        </div>
                    </div>

                    <div className="alert-stat-card">
                        <div
                            className="alert-stat-icon"
                            style={{
                                background: criticalCount > 0 ? "rgba(214, 95, 95, 0.15)" : "rgba(255, 255, 255, 0.04)",
                                color: criticalCount > 0 ? "#e87a7a" : "#728479",
                            }}
                        >
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <div className="alert-stat-label">CRITICAL FAULTS</div>
                            <div
                                className="alert-stat-value"
                                style={{ color: criticalCount > 0 ? "#e87a7a" : undefined }}
                            >
                                {criticalCount}
                            </div>
                        </div>
                    </div>

                    <div className="alert-stat-card">
                        <div
                            className="alert-stat-icon"
                            style={{
                                background: warningCount > 0 ? "rgba(212, 168, 75, 0.15)" : "rgba(255, 255, 255, 0.04)",
                                color: warningCount > 0 ? "#e0b65a" : "#728479",
                            }}
                        >
                            <Activity size={20} />
                        </div>
                        <div>
                            <div className="alert-stat-label">WARNINGS</div>
                            <div
                                className="alert-stat-value"
                                style={{ color: warningCount > 0 ? "#e0b65a" : undefined }}
                            >
                                {warningCount}
                            </div>
                        </div>
                    </div>

                    <div className="alert-stat-card">
                        <div
                            className="alert-stat-icon"
                            style={{
                                background: "rgba(98, 200, 123, 0.12)",
                                color: "#62c87b",
                            }}
                        >
                            <ShieldCheck size={20} />
                        </div>
                        <div>
                            <div className="alert-stat-label">FARM STABILITY (FSI)</div>
                            <div className="alert-stat-value">
                                {fsi}
                                <span style={{ fontSize: "11px", marginLeft: "4px", fontWeight: 500, color: "#74867b" }}>
                                    / {fsiStatus}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FILTER BUTTONS */}
                <div className="alert-filters-bar">
                    <button
                        type="button"
                        className={`alert-filter-btn ${selectedFilter === "ALL" ? "active" : ""}`}
                        onClick={() => setSelectedFilter("ALL")}
                    >
                        ALL ALERTS ({alerts.length})
                    </button>

                    <button
                        type="button"
                        className={`alert-filter-btn ${selectedFilter === "CRITICAL" ? "active" : ""}`}
                        onClick={() => setSelectedFilter("CRITICAL")}
                    >
                        CRITICAL ({criticalCount})
                    </button>

                    <button
                        type="button"
                        className={`alert-filter-btn ${selectedFilter === "WARNING" ? "active" : ""}`}
                        onClick={() => setSelectedFilter("WARNING")}
                    >
                        WARNINGS ({warningCount})
                    </button>

                    <button
                        type="button"
                        className={`alert-filter-btn ${selectedFilter === "INFO" ? "active" : ""}`}
                        onClick={() => setSelectedFilter("INFO")}
                    >
                        INFORMATIONAL ({infoCount})
                    </button>
                </div>

                {/* ALERTS LIST */}
                <div
                    style={{
                        display: "grid",
                        gap: "14px",
                    }}
                >
                    {filteredAlerts.map((alert, index) => {
                        const style = getSeverityStyles(alert.severity);

                        return (
                            <div
                                key={alert.id || `${alert.title}-${index}`}
                                className="alert-card"
                                style={{
                                    borderLeft: style.borderLeft,
                                }}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "flex-start",
                                        gap: "15px",
                                        flexWrap: "wrap",
                                    }}
                                >
                                    <div>
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "8px",
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <span
                                                className={`alert-badge alert-badge-${alert.severity.toLowerCase()}`}
                                            >
                                                {alert.severity}
                                            </span>

                                            {alert.category && (
                                                <span className="alert-category-tag">
                                                    {alert.category}
                                                </span>
                                            )}

                                            {alert.status && (
                                                <span
                                                    className={`alert-status-badge alert-status-${alert.status.toLowerCase()}`}
                                                >
                                                    {alert.status}
                                                </span>
                                            )}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: "8px",
                                                color: "var(--text-primary, #e8eee9)",
                                                fontSize: "16px",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {alert.title}
                                        </div>
                                    </div>

                                    {alert.reading && (
                                        <div
                                            style={{
                                                padding: "6px 12px",
                                                borderRadius: "7px",
                                                background: "rgba(255, 255, 255, 0.04)",
                                                border: "1px solid rgba(255, 255, 255, 0.08)",
                                                fontFamily: '"JetBrains Mono", monospace',
                                                fontSize: "12px",
                                                fontWeight: 600,
                                                color: style.color,
                                            }}
                                        >
                                            {alert.reading}
                                        </div>
                                    )}
                                </div>

                                <div
                                    style={{
                                        marginTop: "10px",
                                        color: "var(--text-secondary, #839189)",
                                        fontSize: "13px",
                                        lineHeight: "1.6",
                                    }}
                                >
                                    {alert.reason}
                                </div>

                                {alert.recommendation && (
                                    <div
                                        style={{
                                            marginTop: "12px",
                                            padding: "9px 13px",
                                            borderRadius: "7px",
                                            background: "rgba(98, 200, 123, 0.06)",
                                            border: "1px solid rgba(98, 200, 123, 0.15)",
                                            fontSize: "11.5px",
                                            color: "#7ac58c",
                                            lineHeight: "1.5",
                                        }}
                                    >
                                        <strong style={{ color: "#95e0a6", marginRight: "6px" }}>
                                            Action:
                                        </strong>
                                        {alert.recommendation}
                                    </div>
                                )}

                                <div
                                    style={{
                                        marginTop: "12px",
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        color: "#5e7166",
                                        fontFamily: '"JetBrains Mono", monospace',
                                        fontSize: "9.5px",
                                    }}
                                >
                                    <span>Timestamp: {alert.timestamp}</span>
                                    <span>Status: {alert.status || "ACTIVE"}</span>
                                </div>
                            </div>
                        );
                    })}

                    {filteredAlerts.length === 0 && (
                        <div
                            className="panel"
                            style={{
                                padding: "40px 20px",
                                textAlign: "center",
                                color: "#74867b",
                            }}
                        >
                            <Check size={28} color="#62c87b" style={{ margin: "0 auto 12px" }} />
                            <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary, #e2ebe4)" }}>
                                No Alerts Matching Filter: {selectedFilter}
                            </div>
                            <div style={{ fontSize: "12px", marginTop: "6px" }}>
                                All sensor parameters and system operations are running normally.
                            </div>
                        </div>
                    )}
                </div>

            </section>

        </div>
    );
}

// =========================================================
// METRIC BOX
// =========================================================

function MetricBox({
    label,
    value,
    unit,
}) {

    return (

        <div
            className="panel"
            style={{
                padding:
                    "17px",
            }}
        >

            <div
                style={{
                    color:
                        "#617067",

                    fontFamily:
                        '"JetBrains Mono", monospace',

                    fontSize:
                        "9px",

                    letterSpacing:
                        "0.12em",
                }}
            >
                {label}
            </div>


            <div
                style={{
                    marginTop:
                        "9px",

                    color:
                        "#e5eee8",

                    fontFamily:
                        '"JetBrains Mono", monospace',

                    fontSize:
                        "22px",
                }}
            >

                {value ?? "—"}

                <span
                    style={{
                        marginLeft:
                            "5px",

                        color:
                            "#69776f",

                        fontSize:
                            "9px",
                    }}
                >
                    {unit}
                </span>

            </div>

        </div>
    );
}


// =========================================================
// CHART PANEL
// =========================================================

function ChartPanel({
    title,
    subtitle,
    children,
}) {

    return (

        <div
            className="panel"
            style={{
                padding:
                    "18px",

                minWidth:
                    0,
            }}
        >

            <div
                style={{
                    marginBottom:
                        "12px",
                }}
            >

                <div
                    style={{
                        color:
                            "#e1e9e3",

                        fontSize:
                            "14px",

                        fontWeight:
                            600,
                    }}
                >
                    {title}
                </div>


                <div
                    style={{
                        marginTop:
                            "4px",

                        color:
                            "#617067",

                        fontSize:
                            "10px",
                    }}
                >
                    {subtitle}
                </div>

            </div>


            {children}

        </div>
    );
}


// =========================================================
// LARGE CHART
// =========================================================

function LargeChart({
    children,
}) {

    return (

        <div
            className="large-chart"
            style={{
                width:
                    "100%",

                height:
                    "300px",

                minWidth:
                    0,

                minHeight:
                    "300px",

                position:
                    "relative",
            }}
        >

            <ResponsiveContainer
                width="100%"
                height={280}
                minWidth={0}
                minHeight={280}
            >

                {children}

            </ResponsiveContainer>

        </div>
    );
}


// =========================================================
// TEMPERATURE CHART
// =========================================================

function TemperatureChart({
    data,
    theme = "dark",
}) {
    const isLight = theme === "light";
    const gridColor = isLight ? "#e2ebe5" : "#26352c";
    const axisColor = isLight ? "#6b7d72" : "#627067";
    const tooltipStyle = {
        background: isLight ? "#ffffff" : "#101a14",
        border: isLight ? "1px solid #cad5ce" : "1px solid #294034",
        color: isLight ? "#16241b" : "#e8eee9",
        borderRadius: "8px",
    };

    return (

        <div
            className="chart-host"
            style={{
                width: "100%",
                height:
                    "300px",
                minWidth: 0,
                minHeight: "300px",
                position: "relative",
            }}
        >

            <ResponsiveContainer
                width="100%"
                height={280}
                minWidth={0}
                minHeight={280}
            >

                <LineChart
                    data={
                        data
                    }
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                    />


                    <XAxis
                        dataKey="time"
                        stroke={axisColor}
                        tick={{
                            fontSize:
                                9,
                        }}
                    />


                    <YAxis
                        stroke={axisColor}
                        tick={{
                            fontSize:
                                9,
                        }}
                    />


                    <Tooltip
                        contentStyle={tooltipStyle}
                    />


                    <Line
                        type="monotone"
                        dataKey="temperature"
                        stroke="#62c87b"
                        strokeWidth={2}
                        dot
                        connectNulls
                    />

                </LineChart>

            </ResponsiveContainer>

        </div>
    );
}


// =========================================================
// SOIL CHART
// =========================================================

function SoilChart({
    data,
    theme = "dark",
}) {
    const isLight = theme === "light";
    const gridColor = isLight ? "#e2ebe5" : "#26352c";
    const axisColor = isLight ? "#6b7d72" : "#627067";
    const tooltipStyle = {
        background: isLight ? "#ffffff" : "#101a14",
        border: isLight ? "1px solid #cad5ce" : "1px solid #294034",
        color: isLight ? "#16241b" : "#e8eee9",
        borderRadius: "8px",
    };

    return (

        <div
            className="chart-host"
            style={{
                width: "100%",
                height:
                    "300px",
                minWidth: 0,
                minHeight: "300px",
                position: "relative",
            }}
        >

            <ResponsiveContainer
                width="100%"
                height={280}
                minWidth={0}
                minHeight={280}
            >

                <LineChart
                    data={
                        data
                    }
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                    />


                    <XAxis
                        dataKey="time"
                        stroke={axisColor}
                        tick={{
                            fontSize:
                                9,
                        }}
                    />


                    <YAxis
                        stroke={axisColor}
                        tick={{
                            fontSize:
                                9,
                        }}
                    />


                    <Tooltip
                        contentStyle={tooltipStyle}
                    />


                    <Legend />


                    <Line
                        type="monotone"
                        dataKey="soil1"
                        name="Soil 01"
                        stroke="#62c87b"
                        strokeWidth={2}
                        dot
                    />


                    <Line
                        type="monotone"
                        dataKey="soil2"
                        name="Soil 02"
                        stroke="#42c8d9"
                        strokeWidth={2}
                        dot
                    />

                </LineChart>

            </ResponsiveContainer>

        </div>
    );
}


// =========================================================
// ENVIRONMENT CHART
// =========================================================

function EnvironmentChart({
    data,
    theme = "dark",
}) {
    const isLight = theme === "light";
    const gridColor = isLight ? "#e2ebe5" : "#26352c";
    const axisColor = isLight ? "#6b7d72" : "#627067";
    const tooltipStyle = {
        background: isLight ? "#ffffff" : "#101a14",
        border: isLight ? "1px solid #cad5ce" : "1px solid #294034",
        color: isLight ? "#16241b" : "#e8eee9",
        borderRadius: "8px",
    };

    return (

        <div
            className="chart-host"
            style={{
                width: "100%",
                height:
                    "300px",
                minWidth: 0,
                minHeight: "300px",
                position: "relative",
            }}
        >

            <ResponsiveContainer
                width="100%"
                height={280}
                minWidth={0}
                minHeight={280}
            >

                <LineChart
                    data={
                        data
                    }
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                    />


                    <XAxis
                        dataKey="time"
                        stroke={axisColor}
                    />


                    <YAxis
                        stroke={axisColor}
                    />


                    <Tooltip
                        contentStyle={tooltipStyle}
                    />


                    <Legend />


                    <Line
                        type="monotone"
                        dataKey="humidity"
                        name="Humidity (%)"
                        stroke="#42c8d9"
                        strokeWidth={2}
                        dot={false}
                    />


                    <Line
                        type="monotone"
                        dataKey="light"
                        name="Light (lux)"
                        stroke="#d4a84b"
                        strokeWidth={2}
                        dot={false}
                    />

                </LineChart>

            </ResponsiveContainer>

        </div>
    );
}


// =========================================================
// POWER CHART
// =========================================================

function PowerChart({
    data,
    theme = "dark",
}) {
    const isLight = theme === "light";
    const gridColor = isLight ? "#e2ebe5" : "#26352c";
    const axisColor = isLight ? "#6b7d72" : "#627067";
    const tooltipStyle = {
        background: isLight ? "#ffffff" : "#101a14",
        border: isLight ? "1px solid #cad5ce" : "1px solid #294034",
        color: isLight ? "#16241b" : "#e8eee9",
        borderRadius: "8px",
    };

    return (

        <div
            className="chart-host"
            style={{
                width: "100%",
                height:
                    "300px",
                minWidth: 0,
                minHeight: "300px",
                position: "relative",
            }}
        >

            <ResponsiveContainer
                width="100%"
                height={280}
                minWidth={0}
                minHeight={280}
            >

                <LineChart
                    data={
                        data
                    }
                >

                    <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={gridColor}
                    />


                    <XAxis
                        dataKey="time"
                        stroke={axisColor}
                    />


                    <YAxis
                        stroke={axisColor}
                    />


                    <Tooltip
                        contentStyle={tooltipStyle}
                    />


                    <Line
                        type="monotone"
                        dataKey="power"
                        name="Power (mW)"
                        stroke="#62c87b"
                        strokeWidth={2}
                        dot
                    />

                </LineChart>

            </ResponsiveContainer>

        </div>
    );
}


// =========================================================
// INFERENCE PANEL
// =========================================================

function InferencePanel({
    temperatureChange,
    humidityChange,
    soilDifference,
    samples,
}) {

    return (

        <div
            className="panel"
            style={{
                marginTop:
                    "18px",

                padding:
                    "20px",
            }}
        >

            <div className="panel-label">
                DATA INTERPRETATION
            </div>


            <h3
                style={{
                    marginTop:
                        "6px",

                    color:
                        "#e2ebe4",

                    fontSize:
                        "15px",
                }}
            >
                Observation → Evidence → Interpretation
            </h3>


            <div
                style={{
                    display:
                        "grid",

                    gridTemplateColumns:
                        "repeat(3, 1fr)",

                    gap:
                        "18px",

                    marginTop:
                        "18px",
                }}
            >

                <InferenceItem
                    title="OBSERVED"
                    text={
                        `The system currently contains ${samples} recorded hardware sample${samples === 1
                            ? ""
                            : "s"
                        }.`
                    }
                />


                <InferenceItem
                    title="EVIDENCE"
                    text={
                        temperatureChange !==
                            null

                            ? `Temperature changed by ${temperatureChange.toFixed(
                                2
                            )}°C across the available records.`

                            : "More records are required to determine a temperature trend."
                    }
                />


                <InferenceItem
                    title="INTERPRETATION"
                    text={
                        soilDifference !==
                            null

                            ? `The latest soil sensor difference is ${soilDifference.toFixed(
                                2
                            )}%. This is reported as a measurement difference, not automatically classified as a fault.`

                            : "Soil interpretation requires valid measurements from both sensors."
                    }
                />

            </div>

        </div>
    );
}


// =========================================================
// INFERENCE ITEM
// =========================================================

function InferenceItem({
    title,
    text,
}) {

    return (

        <div
            style={{
                borderLeft:
                    "2px solid #294034",

                paddingLeft:
                    "13px",
            }}
        >

            <div
                style={{
                    color:
                        "#62c87b",

                    fontFamily:
                        '"JetBrains Mono", monospace',

                    fontSize:
                        "9px",

                    letterSpacing:
                        "0.12em",
                }}
            >
                {title}
            </div>


            <p
                style={{
                    marginTop:
                        "7px",

                    color:
                        "#7d8c83",

                    fontSize:
                        "11px",

                    lineHeight:
                        "1.65",
                }}
            >
                {text}
            </p>

        </div>
    );
}


// =========================================================
// MINI VALUE
// =========================================================

function MiniValue({
    label,
    value,
    unit,
}) {

    return (

        <div>

            <div
                style={{
                    color:
                        "#64736a",

                    fontFamily:
                        '"JetBrains Mono", monospace',

                    fontSize:
                        "8px",
                }}
            >
                {label}
            </div>


            <div
                style={{
                    marginTop:
                        "4px",

                    color:
                        "#cbd5cf",

                    fontFamily:
                        '"JetBrains Mono", monospace',

                    fontSize:
                        "14px",
                }}
            >

                {value ?? "—"}

                <span
                    style={{
                        marginLeft:
                            "4px",

                        color:
                            "#66746c",

                        fontSize:
                            "9px",
                    }}
                >
                    {unit}
                </span>

            </div>

        </div>
    );
}


// =========================================================
// LEGEND DOT
// =========================================================

function LegendDot({
    color,
    label,
}) {

    return (

        <span
            style={{
                display:
                    "flex",

                alignItems:
                    "center",

                gap:
                    "5px",
            }}
        >

            <span
                style={{
                    width:
                        "6px",

                    height:
                        "6px",

                    borderRadius:
                        "50%",

                    background:
                        color,
                }}
            />

            {label}

        </span>
    );
}


// =========================================================
// PLACEHOLDER
// =========================================================

function PlaceholderPage({
    icon,
    title,
}) {

    return (

        <div className="placeholder-page">

            <div className="placeholder-icon">
                {icon}
            </div>


            <h2>
                {title}
            </h2>


            <p>
                This module will be implemented
                in the next development stage.
            </p>

        </div>
    );
}


// =========================================================
// POWER METRIC
// =========================================================

function PowerMetric({
    label,
    value,
    unit,
}) {

    return (

        <div className="power-metric">

            <div>
                {label}
            </div>


            <strong>

                {value}

                <span>
                    {unit}
                </span>

            </strong>

        </div>
    );
}


// =========================================================
// NUMBER HELPER
// =========================================================

function toNumber(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return null;

    }


    const number =
        Number(value);


    return Number.isFinite(number)
        ? number
        : null;
}


// =========================================================
// EXPORT
// =========================================================

export default App;