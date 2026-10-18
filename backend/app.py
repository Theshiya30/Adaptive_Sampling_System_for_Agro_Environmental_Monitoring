from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
import random
import threading
import time
import json
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ============================================================
# SMART FARM ADAPTIVE MONITORING SYSTEM
# PHASE 2 - CENTRAL FLASK BACKEND
# ============================================================

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})


# ============================================================
# GLOBAL SYSTEM STATE
# ============================================================

state_lock = threading.Lock()

system_state = {

    "system": {
        "name": "Smart Farm Adaptive Monitoring System",
        "version": "Phase 2",
        "data_source": "WAITING FOR HARDWARE",
        "hardware_status": "WAITING FOR ESP32",
        "monitoring_mode": "ADAPTIVE",
        "last_update": None
    },

    "sensor_data": {

        "soil_moisture": 50.0,
        "temperature": 28.0,
        "humidity": 65.0,
        "light": 450.0,
        "rain": False,
        "battery": 95.0
    },

    "adaptive_decision": {

        "context": "NORMAL",
        "environmental_change": 0.0,
        "sampling_interval": 120,
        "system_mode": "NORMAL",
        "reason": "Normal environmental monitoring"
    },

    "farm_stability": {

        "ssi": 100,
        "msi": 100,
        "fsi": 100,

        "ssi_status": "STABLE",
        "msi_status": "STABLE",
        "fsi_status": "STABLE"
    },

    "sensor_health": {

        "soil_moisture": "NORMAL",
        "temperature": "NORMAL",
        "humidity": "NORMAL",
        "light": "NORMAL",
        "rain": "NORMAL",
        "battery": "NORMAL"
    },

    "recommendations": {

        "alerts": [
            "No critical alerts"
        ],

        "recommendations": [
            "Continue normal adaptive monitoring"
        ]
    },

    "statistics": {

        "soil_average": 50.0,
        "temperature_average": 28.0,
        "humidity_average": 65.0,
        "light_average": 450.0,

        "samples": 1
    }
}


# ============================================================
# SUPABASE & LOCAL PERSISTENCE CONFIGURATION
# ============================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase = None
supabase_status = "not_configured"

if SUPABASE_URL and SUPABASE_KEY:
    try:
        from supabase import create_client
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        supabase_status = "configured"
        print("Supabase client initialized with endpoint:", SUPABASE_URL)
    except Exception as exc:
        print("Supabase client initialization failed:", exc)
        supabase_status = "initialization_failed"

MAX_HISTORY = 1000
HARDWARE_TIMEOUT = 60  # Seconds before hardware telemetry is considered stale
hardware_last_seen = 0.0

HISTORY_FILE = Path(__file__).with_name("smartfarm_history.json")
LAST_KNOWN_STABILITY_FILE = Path(__file__).with_name("smartfarm_last_known_stability.json")
LAST_KNOWN_TELEMETRY_FILE = Path(__file__).with_name("smartfarm_last_known_telemetry.json")

last_known_hardware_stability = None
last_known_hardware_stability_timestamp = None
last_known_hardware_telemetry = None
last_known_hardware_telemetry_timestamp = None

def load_last_known_hardware_stability():
    global last_known_hardware_stability, last_known_hardware_stability_timestamp
    try:
        if LAST_KNOWN_STABILITY_FILE.exists():
            saved = json.loads(LAST_KNOWN_STABILITY_FILE.read_text(encoding="utf-8"))
            stability = saved.get("stability")
            if isinstance(stability, dict) and all(k in stability for k in ("ssi", "msi", "fsi")):
                last_known_hardware_stability = stability
                last_known_hardware_stability_timestamp = saved.get("timestamp")
    except Exception as exc:
        print("Could not load last-known stability:", exc)

def save_last_known_hardware_stability(stability, timestamp):
    global last_known_hardware_stability, last_known_hardware_stability_timestamp
    last_known_hardware_stability = dict(stability)
    last_known_hardware_stability_timestamp = timestamp
    try:
        LAST_KNOWN_STABILITY_FILE.write_text(
            json.dumps({"stability": last_known_hardware_stability, "timestamp": timestamp}, indent=2),
            encoding="utf-8"
        )
    except Exception as exc:
        print("Could not save last-known stability:", exc)

def load_last_known_hardware_telemetry():
    global last_known_hardware_telemetry, last_known_hardware_telemetry_timestamp
    try:
        if LAST_KNOWN_TELEMETRY_FILE.exists():
            saved = json.loads(LAST_KNOWN_TELEMETRY_FILE.read_text(encoding="utf-8"))
            telemetry = saved.get("telemetry")
            if isinstance(telemetry, dict):
                last_known_hardware_telemetry = telemetry
                last_known_hardware_telemetry_timestamp = saved.get("timestamp")
    except Exception as exc:
        print("Could not load last-known telemetry:", exc)

def save_last_known_hardware_telemetry(telemetry, timestamp):
    global last_known_hardware_telemetry, last_known_hardware_telemetry_timestamp
    last_known_hardware_telemetry = dict(telemetry)
    last_known_hardware_telemetry_timestamp = timestamp
    try:
        LAST_KNOWN_TELEMETRY_FILE.write_text(
            json.dumps({"telemetry": last_known_hardware_telemetry, "timestamp": timestamp}, indent=2),
            encoding="utf-8"
        )
    except Exception as exc:
        print("Could not save last-known telemetry:", exc)

def load_history_from_file():
    try:
        if HISTORY_FILE.exists():
            data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
    except Exception as exc:
        print("Could not load history from file:", exc)
    return []

def save_history_to_file(records):
    try:
        HISTORY_FILE.write_text(
            json.dumps(records[-MAX_HISTORY:], indent=2),
            encoding="utf-8"
        )
    except Exception as exc:
        print("Could not save history to file:", exc)

def save_to_supabase(record):
    global supabase_status
    if supabase is None:
        return False
    try:
        row = {
            "device_id": "esp32-01",
            "soil_moisture_1": record.get("soil_moisture_1"),
            "soil_moisture_2": record.get("soil_moisture_2"),
            "average_soil_moisture": record.get("soil_moisture"),
            "soil_disagreement": record.get("soil_disagreement"),
            "temperature": record.get("temperature"),
            "humidity": record.get("humidity"),
            "light_lux": record.get("light"),
            "rain_detected": record.get("rain"),
            "rain_value": record.get("rain_raw"),
            "voltage": record.get("bus_voltage"),
            "current_ma": record.get("current_mA"),
            "power_mw": record.get("power_mW"),
            "is_valid": True,
            "validation_flags": {
                "source": "ESP32",
                "adaptive_mode": record.get("adaptive_mode"),
                "environmental_change": record.get("environmental_change"),
            },
            "created_at": record.get("timestamp"),
            "environmental_change": record.get("environmental_change", False),
            "adaptive_mode": record.get("adaptive_mode", "NORMAL"),
            "sampling_interval": record.get("sampling_interval", 30),
            "adaptive_reason": record.get("adaptive_reason", ""),
            "ssi": record.get("ssi"),
            "msi": record.get("msi"),
            "fsi": record.get("fsi"),
        }
        supabase.table("sensor_readings").insert(row).execute()
        supabase_status = "online"
        return True
    except Exception as exc:
        supabase_status = "paused_or_unreachable"
        print("Supabase save attempt (using local persistent storage fallback):", exc)
        return False

def load_history_from_supabase(limit=500):
    global supabase_status
    if supabase is None:
        return []
    try:
        response = (
            supabase.table("sensor_readings")
            .select("*")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        rows = list(reversed(response.data or []))
        records = []
        for row in rows:
            s1 = row.get("soil_moisture_1")
            s2 = row.get("soil_moisture_2")
            records.append({
                "timestamp": row.get("created_at"),
                "soil_moisture_1": s1,
                "soil_moisture_2": s2,
                "soil_moisture": row.get("average_soil_moisture") or (
                    round((s1 + s2) / 2, 2) if s1 is not None and s2 is not None else s1
                ),
                "soil_disagreement": row.get("soil_disagreement"),
                "temperature": row.get("temperature"),
                "humidity": row.get("humidity"),
                "light": row.get("light_lux") if row.get("light_lux") is not None else row.get("light"),
                "rain": row.get("rain_detected") if row.get("rain_detected") is not None else row.get("rain"),
                "rain_raw": row.get("rain_value") if row.get("rain_value") is not None else row.get("rain_raw"),
                "bus_voltage": row.get("voltage") if row.get("voltage") is not None else row.get("bus_voltage"),
                "current_mA": row.get("current_ma") if row.get("current_ma") is not None else row.get("current_mA"),
                "power_mW": row.get("power_mw") if row.get("power_mw") is not None else row.get("power_mW"),
                "environmental_change": row.get("environmental_change", False),
                "adaptive_mode": row.get("adaptive_mode", "NORMAL"),
                "sampling_interval": row.get("sampling_interval", 30),
                "adaptive_reason": row.get("adaptive_reason", ""),
                "ssi": row.get("ssi"),
                "msi": row.get("msi"),
                "fsi": row.get("fsi"),
                "is_simulated": False
            })
        supabase_status = "online"
        return records
    except Exception as exc:
        supabase_status = "paused_or_unreachable"
        print("Supabase load attempt (falling back to local persistent storage):", exc)
        return []

# Initialize persistent state on module load
history = load_history_from_file()
load_last_known_hardware_stability()
load_last_known_hardware_telemetry()

# If local history file was empty, sync from Supabase
if not history and supabase is not None:
    initial_supabase_history = load_history_from_supabase(500)
    if initial_supabase_history:
        history = initial_supabase_history
        save_history_to_file(history)

# If last known real hardware telemetry was saved, initialize sensor state with it
if last_known_hardware_telemetry:
    system_state["sensor_data"].update(last_known_hardware_telemetry)
    system_state["system"]["last_update"] = last_known_hardware_telemetry_timestamp
    system_state["system"]["data_source"] = "LAST KNOWN HARDWARE"
    system_state["system"]["hardware_status"] = "ESP32 NOT CONNECTED"
elif len(history) > 0:
    # Use most recent persisted history record
    latest_hist = history[-1]
    telemetry_fields = {
        k: latest_hist.get(k) for k in [
            "soil_moisture", "soil_moisture_1", "soil_moisture_2",
            "temperature", "humidity", "light", "rain", "battery",
            "bus_voltage", "current_mA", "power_mW"
        ] if latest_hist.get(k) is not None
    }
    system_state["sensor_data"].update(telemetry_fields)
    system_state["system"]["last_update"] = latest_hist.get("timestamp")
    system_state["system"]["data_source"] = "LAST KNOWN HARDWARE"
    system_state["system"]["hardware_status"] = "ESP32 NOT CONNECTED"
    save_last_known_hardware_telemetry(telemetry_fields, latest_hist.get("timestamp"))

    stability_fields = {
        "ssi": latest_hist.get("ssi"),
        "msi": latest_hist.get("msi"),
        "fsi": latest_hist.get("fsi"),
    }
    if all(stability_fields.get(k) is not None for k in ("ssi", "msi", "fsi")):
        system_state["farm_stability"].update(stability_fields)
        save_last_known_hardware_stability(stability_fields, latest_hist.get("timestamp"))
else:
    # Clear out mock values on fresh install so empty state is genuine
    system_state["system"]["last_update"] = None
    system_state["system"]["data_source"] = "NO HARDWARE DATA"
    system_state["system"]["hardware_status"] = "WAITING FOR ESP32"
    system_state["sensor_data"] = {
        "soil_moisture": None,
        "soil_moisture_1": None,
        "soil_moisture_2": None,
        "temperature": None,
        "humidity": None,
        "light": None,
        "rain": None,
        "battery": None
    }


# ============================================================
# UTILITY FUNCTIONS
# ============================================================

def clamp(value, minimum, maximum):

    return max(
        minimum,
        min(
            maximum,
            value
        )
    )


def safe_float(value, default=0.0):

    try:
        return float(value)

    except (
        TypeError,
        ValueError
    ):

        return default


# ============================================================
# ENVIRONMENTAL CHANGE
# ============================================================

def calculate_environmental_change(data):
    soil = safe_float(data.get("soil_moisture", 50))
    temperature = safe_float(data.get("temperature", 28))
    humidity = safe_float(data.get("humidity", 65))
    light_raw = data.get("light", None)
    rain = bool(data.get("rain", False))

    change = 0.0
    change += abs(soil - 50) / 10
    change += abs(temperature - 28) / 5
    change += abs(humidity - 65) / 10

    # Light is optional until the BH1750/GY302 is installed.
    if light_raw is not None:
        light = safe_float(light_raw, 450)
        change += abs(light - 450) / 150

    if rain:
        change += 2

    return round(change, 2)


# ============================================================
# ADAPTIVE SAMPLING INTERVAL
# ============================================================

def calculate_sampling_interval(change):

    if change >= 8:

        return 10


    if change >= 6:

        return 20


    if change >= 4:

        return 30


    if change >= 2:

        return 60


    return 120


# ============================================================
# SOIL STABILITY INDEX
# ============================================================

def calculate_ssi(soil):

    score = 100


    if soil < 20:

        score -= 65


    elif soil < 30:

        score -= 45


    elif soil < 40:

        score -= 20


    elif soil > 90:

        score -= 40


    elif soil > 80:

        score -= 20


    return int(
        clamp(
            score,
            0,
            100
        )
    )


# ============================================================
# MICROCLIMATE STABILITY INDEX
# ============================================================

def calculate_msi(
    temperature,
    humidity,
    light,
    rain
):

    score = 100


    # Temperature

    if temperature > 42:

        score -= 45


    elif temperature > 38:

        score -= 30


    elif temperature > 35:

        score -= 15


    # Humidity

    if humidity > 92:

        score -= 30


    elif humidity > 85:

        score -= 15


    elif humidity < 30:

        score -= 25


    elif humidity < 40:

        score -= 10


    # Light

    if light is not None and light > 900:

        score -= 20


    elif light is not None and light > 750:

        score -= 10


    elif light is not None and light < 60:

        score -= 15


    # Rain

    if rain:

        score -= 5


    return int(
        clamp(
            score,
            0,
            100
        )
    )


# ============================================================
# STATUS CLASSIFICATION
# ============================================================

def stability_status(score):

    if score >= 90:

        return "STABLE"


    if score >= 70:

        return "MODERATE"


    if score >= 50:

        return "DEGRADED"


    return "CRITICAL"


# ============================================================
# ENVIRONMENTAL CONTEXT
# ============================================================

def determine_context(
    soil,
    temperature,
    humidity,
    rain,
    change
):

    if rain and soil > 80:

        return "HEAVY RAIN"


    if soil < 25:

        return "DRY SOIL"


    if temperature >= 38:

        return "HIGH TEMPERATURE"


    if humidity >= 90:

        return "HIGH HUMIDITY"


    if change >= 6:

        return "RAPID CHANGE"


    if change >= 3:

        return "CHANGING"


    return "NORMAL"


# ============================================================
# SYSTEM MODE
# ============================================================

def determine_system_mode(interval):

    if interval <= 20:

        return "HIGH FREQUENCY"


    if interval <= 60:

        return "ADAPTIVE"


    return "NORMAL"

# ============================================================
# DYNAMIC SENSOR HEALTH
# ============================================================

def calculate_sensor_health(data):
    soil = data.get("soil_moisture")
    temperature = data.get("temperature")
    humidity = data.get("humidity")
    light = data.get("light")
    battery = data.get("battery")
    rain = data.get("rain")

    def score_range(value, ideal_min, ideal_max, warning_min, warning_max):
        if value is None:
            return None
        value = safe_float(value)
        if ideal_min <= value <= ideal_max:
            return 100
        if warning_min <= value < ideal_min:
            distance = ideal_min - value
            return max(70, int(100 - distance * 5))
        if ideal_max < value <= warning_max:
            distance = value - ideal_max
            return max(70, int(100 - distance * 5))
        return 50

    soil_score = score_range(soil, 10, 90, 0, 100)
    temperature_score = score_range(temperature, 5, 45, 0, 50)
    humidity_score = score_range(humidity, 10, 90, 0, 100)
    light_score = score_range(light, 20, 900, 0, 1000)

    if battery is None:
        battery_score = None
    else:
        battery = safe_float(battery)
        if battery >= 80: battery_score = 100
        elif battery >= 60: battery_score = 90
        elif battery >= 40: battery_score = 75
        elif battery >= 20: battery_score = 50
        else: battery_score = 25

    rain_score = 100 if rain is not None else None

    def status(score):
        if score is None:
            return "NOT AVAILABLE"
        if score >= 90: return "EXCELLENT"
        if score >= 75: return "GOOD"
        if score >= 50: return "WARNING"
        return "CRITICAL"

    scores = [s for s in [soil_score, temperature_score, humidity_score, light_score, battery_score, rain_score] if s is not None]
    overall = round(sum(scores) / len(scores)) if scores else 0

    return {
        "overall": overall,
        "sensors": {
            "soil_moisture": {"score": soil_score, "status": status(soil_score)},
            "temperature": {"score": temperature_score, "status": status(temperature_score)},
            "humidity": {"score": humidity_score, "status": status(humidity_score)},
            "light": {"score": light_score, "status": status(light_score)},
            "battery": {"score": battery_score, "status": status(battery_score)},
            "rain": {"score": rain_score, "status": status(rain_score)}
        }
    }


# ============================================================
# RECOMMENDATION ENGINE
# ============================================================

def generate_recommendations(
    data,
    ssi,
    msi,
    fsi,
    context
):

    alerts = []

    recommendations = []


    soil = data["soil_moisture"]

    temperature = data["temperature"]

    humidity = data["humidity"]

    light = data["light"]

    rain = data["rain"]

    battery = data["battery"]


    # --------------------------------------------------------
    # SOIL
    # --------------------------------------------------------

    if soil < 20:

        alerts.append(
            "Critical soil moisture"
        )

        recommendations.append(
            "Increase irrigation monitoring"
        )


    elif soil < 30:

        alerts.append(
            "Low soil moisture"
        )

        recommendations.append(
            "Consider irrigation"
        )


    elif soil > 90:

        alerts.append(
            "Excessive soil moisture"
        )

        recommendations.append(
            "Monitor soil saturation"
        )


    else:

        recommendations.append(
            "Soil moisture within normal operating range"
        )


    # --------------------------------------------------------
    # TEMPERATURE
    # --------------------------------------------------------

    if temperature >= 42:

        alerts.append(
            "Extreme temperature detected"
        )

        recommendations.append(
            "Increase microclimate monitoring"
        )


    elif temperature >= 38:

        alerts.append(
            "High temperature detected"
        )

        recommendations.append(
            "Monitor heat stress conditions"
        )


    # --------------------------------------------------------
    # HUMIDITY
    # --------------------------------------------------------

    if humidity >= 92:

        alerts.append(
            "Very high humidity detected"
        )

        recommendations.append(
            "Monitor fungal and crop stress conditions"
        )


    elif humidity < 30:

        alerts.append(
            "Low humidity detected"
        )

        recommendations.append(
            "Monitor crop moisture stress"
        )


    # --------------------------------------------------------
    # LIGHT
    # --------------------------------------------------------

    if light is not None and light > 900:

        alerts.append(
            "Very high light intensity"
        )

        recommendations.append(
            "Monitor heat and light stress"
        )


    elif light is not None and light < 60:

        recommendations.append(
            "Low light condition detected"
        )


    # --------------------------------------------------------
    # RAIN
    # --------------------------------------------------------

    if rain:

        alerts.append(
            "Rain detected"
        )

        recommendations.append(
            "Monitor soil saturation"
        )


    # --------------------------------------------------------
    # FARM STABILITY
    # --------------------------------------------------------

    if fsi < 50:

        alerts.append(
            "Critical farm stability"
        )

        recommendations.append(
            "Immediate environmental assessment recommended"
        )


    elif fsi < 70:

        recommendations.append(
            "Farm stability is degraded - increase monitoring"
        )


    # --------------------------------------------------------
    # BATTERY
    # --------------------------------------------------------

    if battery is not None and battery < 20:

        alerts.append(
            "Critical battery level"
        )

        recommendations.append(
            "Recharge or replace power source"
        )


    elif battery is not None and battery < 40:

        recommendations.append(
            "Battery level is low"
        )


    # --------------------------------------------------------
    # NORMAL CASE
    # --------------------------------------------------------

    if not alerts:

        alerts.append(
            "No critical alerts"
        )


    if len(recommendations) == 0:

        recommendations.append(
            "Continue normal adaptive monitoring"
        )


    return {

        "alerts": alerts,

        "recommendations":
            recommendations

    }


# ============================================================
# UPDATE STATISTICS
# ============================================================

def update_statistics(data):
    stats = system_state["statistics"]
    samples = stats["samples"]

    for key, stat_key in [
        ("soil_moisture", "soil_average"),
        ("temperature", "temperature_average"),
        ("humidity", "humidity_average"),
        ("light", "light_average")
    ]:
        value = data.get(key)
        if value is None:
            continue
        if samples == 0:
            stats[stat_key] = round(float(value), 2)
        else:
            stats[stat_key] = round((stats[stat_key] * samples + float(value)) / (samples + 1), 2)

    stats["samples"] += 1


# ============================================================
# PROCESS ENVIRONMENTAL DATA
# ============================================================

def process_environment(data):
    soil = safe_float(data.get("soil_moisture", 50))
    temperature = safe_float(data.get("temperature", 28))
    humidity = safe_float(data.get("humidity", 65))
    light = data.get("light", None)
    battery = data.get("battery", None)
    rain = bool(data.get("rain", False))

    soil = clamp(soil, 0, 100)
    temperature = clamp(temperature, 0, 50)
    humidity = clamp(humidity, 0, 100)
    if light is not None:
        light = clamp(safe_float(light), 0, 1000)
    if battery is not None:
        battery = clamp(safe_float(battery), 0, 100)

    sensor_data = {
        "soil_moisture": round(soil, 2),
        "temperature": round(temperature, 2),
        "humidity": round(humidity, 2),
        "light": None if light is None else round(light, 2),
        "rain": rain,
        "battery": None if battery is None else round(battery, 2),
        "soil_moisture_1": data.get("soil_moisture_1"),
        "soil_moisture_2": data.get("soil_moisture_2"),
        "soil_disagreement": data.get("soil_disagreement"),
        "bus_voltage": data.get("bus_voltage"),
        "current_mA": data.get("current_mA"),
        "power_mW": data.get("power_mW")
    }

    change = calculate_environmental_change(sensor_data)
    interval = calculate_sampling_interval(change)
    ssi = calculate_ssi(soil)
    msi = calculate_msi(temperature, humidity, light, rain)
    fsi = int(round((ssi + msi) / 2))
    context = determine_context(soil, temperature, humidity, rain, change)
    mode = determine_system_mode(interval)

    with state_lock:
        system_state["sensor_data"] = sensor_data
        system_state["adaptive_decision"] = {
            "context": context,
            "environmental_change": change,
            "sampling_interval": interval,
            "system_mode": mode,
            "reason": "Environmental conditions require increased monitoring" if interval <= 30 else "Normal adaptive monitoring"
        }
        system_state["farm_stability"] = {
            "ssi": ssi, "msi": msi, "fsi": fsi,
            "ssi_status": stability_status(ssi),
            "msi_status": stability_status(msi),
            "fsi_status": stability_status(fsi)
        }
        system_state["sensor_health"] = calculate_sensor_health(sensor_data)
        system_state["recommendations"] = generate_recommendations(sensor_data, ssi, msi, fsi, context)
        system_state["system"]["last_update"] = datetime.now().isoformat(timespec="seconds")
        update_statistics(sensor_data)
        history.append({
            "timestamp": system_state["system"]["last_update"],
            **sensor_data,
            "environmental_change": change,
            "sampling_interval": interval,
            "ssi": ssi, "msi": msi, "fsi": fsi, "context": context
        })
        if len(history) > MAX_HISTORY:
            history.pop(0)

    return get_state_copy()


# ============================================================
# COPY STATE SAFELY
# ============================================================

def get_state_copy():

    with state_lock:
        hardware_active = hardware_last_seen > 0 and (time.time() - hardware_last_seen) <= HARDWARE_TIMEOUT
        data_age = None if hardware_last_seen == 0 else round(max(0, time.time() - hardware_last_seen), 1)
        has_real_records = len(history) > 0 or last_known_hardware_telemetry is not None

        system_copy = dict(system_state["system"])
        if system_state["system"].get("is_simulated"):
            system_copy["hardware_status"] = "SIMULATION MODE"
            system_copy["data_source"] = "SIMULATION"
        elif hardware_active:
            system_copy["hardware_status"] = "ESP32 CONNECTED"
            system_copy["data_source"] = "REAL ESP32 HARDWARE"
        elif has_real_records:
            system_copy["hardware_status"] = "ESP32 NOT CONNECTED"
            system_copy["data_source"] = "LAST KNOWN HARDWARE"
        else:
            system_copy["hardware_status"] = "WAITING FOR ESP32"
            system_copy["data_source"] = "NO HARDWARE DATA"

        stability_copy = dict(system_state["farm_stability"])
        last_stability = None if last_known_hardware_stability is None else dict(last_known_hardware_stability)
        last_telemetry = None if last_known_hardware_telemetry is None else dict(last_known_hardware_telemetry)

        # Active sensor data: if hardware is disconnected but last known telemetry exists,
        # provide last known telemetry so dashboard retains values
        active_sensor_data = dict(system_state["sensor_data"])
        if not hardware_active and last_telemetry:
            active_sensor_data.update(last_telemetry)

        timestamp_val = (
            system_state["system"].get("last_update")
            if hardware_active
            else (last_known_hardware_telemetry_timestamp or system_state["system"].get("last_update"))
        )

        result = {
            "system": system_copy,
            "sensor_data": active_sensor_data,
            "adaptive_decision": dict(system_state["adaptive_decision"]),
            "farm_stability": stability_copy,
            "last_known_stability": last_stability,
            "last_known_stability_timestamp": last_known_hardware_stability_timestamp,
            "last_known_telemetry": last_telemetry,
            "last_known_telemetry_timestamp": last_known_hardware_telemetry_timestamp,
            "connected": hardware_active,
            "data_age_seconds": data_age,
            "timestamp": timestamp_val,
            "history_count": len(history),
            "supabase_configured": bool(supabase),
            "supabase_status": supabase_status,
            "is_simulated": system_state["system"].get("is_simulated", False),
            "data_source": system_copy.get("data_source"),
            "sensor_health": dict(system_state["sensor_health"]),
            "recommendations": {
                "alerts": list(system_state["recommendations"]["alerts"]),
                "recommendations": list(system_state["recommendations"]["recommendations"])
            },
            "statistics": dict(system_state["statistics"])
        }

        return result


# ============================================================
# HOME / DASHBOARD
# ============================================================

@app.route("/")
def dashboard():

    return render_template(
        "dashboard.html"
    )


# ============================================================
# SIMULATOR PAGE
# ============================================================

@app.route("/simulator")
def simulator():

    return render_template(
        "simulator.html"
    )


# ============================================================
# SENSOR HEALTH PAGE
# ============================================================

@app.route("/sensor-health")
def sensor_health():

    return render_template(
        "sensor_health.html"
    )


# ============================================================
# FARM REPORT PAGE
# ============================================================

@app.route("/farm-report")
def farm_report():

    return render_template(
        "farm_report.html"
    )


# ============================================================
# API - COMPLETE SYSTEM STATUS
# ============================================================

@app.route(
    "/api/status",
    methods=["GET"]
)
def api_status():

    return jsonify(
        get_state_copy()
    )


# ============================================================
# API - SIMULATOR APPLY
# ============================================================

@app.route(
    "/api/simulator/apply",
    methods=["POST"]
)
def simulator_apply():

    try:

        payload = request.get_json(
            silent=True
        )


        if not payload:

            return jsonify({

                "success": False,

                "error":
                    "No JSON data received"

            }), 400


        result = \
            process_environment(
                payload
            )


        return jsonify({

            "success": True,

            "message":
                "Environmental conditions applied",

            "data":
                result

        })


    except Exception as error:

        return jsonify({

            "success": False,

            "error":
                str(error)

        }), 500


# ============================================================
# API - CURRENT SENSOR DATA
# ============================================================

@app.route(
    "/api/sensors",
    methods=["GET"]
)
def api_sensors():

    return jsonify({

        "success": True,

        "sensor_data":
            get_state_copy()[
                "sensor_data"
            ]

    })


# ============================================================
# API - ADAPTIVE DECISION
# ============================================================

@app.route(
    "/api/adaptive",
    methods=["GET"]
)
def api_adaptive():

    return jsonify({

        "success": True,

        "adaptive_decision":
            get_state_copy()[
                "adaptive_decision"
            ]

    })


# ============================================================
# API - FARM STABILITY
# ============================================================

@app.route(
    "/api/stability",
    methods=["GET"]
)
def api_stability():

    return jsonify({

        "success": True,

        "farm_stability":
            get_state_copy()[
                "farm_stability"
            ]

    })


# ============================================================
# API - RECOMMENDATIONS
# ============================================================

@app.route(
    "/api/recommendations",
    methods=["GET"]
)
def api_recommendations():

    return jsonify({

        "success": True,

        "recommendations":
            get_state_copy()[
                "recommendations"
            ]

    })


# ============================================================
# API - SENSOR HEALTH
# ============================================================

@app.route(
    "/api/sensor-health",
    methods=["GET"]
)
def api_sensor_health():

    return jsonify({

        "success": True,

        "sensor_health":
            get_state_copy()[
                "sensor_health"
            ]

    })


# ============================================================
# API - STATISTICS
# ============================================================

@app.route(
    "/api/statistics",
    methods=["GET"]
)
def api_statistics():

    return jsonify({

        "success": True,

        "statistics":
            get_state_copy()[
                "statistics"
            ]

    })


# ============================================================
# API - REAL ESP32 HARDWARE DATA
# ============================================================

@app.route("/api/hardware-data", methods=["POST"])
def api_hardware_data():
    global hardware_last_seen

    try:
        payload = request.get_json(silent=True)
        if not payload:
            return jsonify({"success": False, "error": "No JSON data received"}), 400

        required = ["soil_moisture_1", "soil_moisture_2", "temperature", "humidity", "rain"]
        missing = [key for key in required if key not in payload]
        if missing:
            return jsonify({"success": False, "error": "Missing fields: " + ", ".join(missing)}), 400

        s1 = clamp(safe_float(payload.get("soil_moisture_1")), 0, 100)
        s2 = clamp(safe_float(payload.get("soil_moisture_2")), 0, 100)
        disagreement = abs(s1 - s2)
        soil = (s1 + s2) / 2.0

        data = {
            "soil_moisture": soil,
            "soil_moisture_1": round(s1, 2),
            "soil_moisture_2": round(s2, 2),
            "soil_disagreement": round(disagreement, 2),
            "temperature": payload.get("temperature"),
            "humidity": payload.get("humidity"),
            "light": payload.get("light"),
            "rain": payload.get("rain"),
            "battery": payload.get("battery"),
            "bus_voltage": payload.get("bus_voltage"),
            "current_mA": payload.get("current_mA"),
            "power_mW": payload.get("power_mW")
        }

        result = process_environment(data)
        hardware_last_seen = time.time()
        timestamp = datetime.now(timezone.utc).isoformat()

        # Build clean persistent record
        record = {
            "timestamp": timestamp,
            **data,
            "soil_moisture": soil,
            "soil_disagreement": round(disagreement, 2),
            "environmental_change": result["adaptive_decision"]["environmental_change"],
            "adaptive_mode": result["adaptive_decision"]["system_mode"],
            "sampling_interval": next_interval,
            "adaptive_reason": result["adaptive_decision"]["reason"],
            "ssi": result.get("farm_stability", {}).get("ssi"),
            "msi": result.get("farm_stability", {}).get("msi"),
            "fsi": result.get("farm_stability", {}).get("fsi"),
            "is_simulated": False
        }

        # Persist the most recent VALID real-hardware stability & telemetry assessments.
        stability = result.get("farm_stability", {})
        if all(stability.get(k) is not None for k in ("ssi", "msi", "fsi")):
            save_last_known_hardware_stability(stability, timestamp)
        save_last_known_hardware_telemetry(data, timestamp)

        with state_lock:
            system_state["system"]["data_source"] = "REAL ESP32 HARDWARE"
            system_state["system"]["hardware_status"] = "ESP32 CONNECTED"
            system_state["system"]["is_simulated"] = False
            system_state["system"]["last_update"] = timestamp
            history.append(record)
            if len(history) > MAX_HISTORY:
                del history[:-MAX_HISTORY]
            save_history_to_file(history)

            if disagreement >= 15:
                system_state["recommendations"]["alerts"].insert(0, "Soil sensor disagreement detected")
                system_state["recommendations"]["recommendations"].insert(0, "Verify soil sensor readings and placement")

        # Asynchronously save to Supabase
        threading.Thread(target=save_to_supabase, args=(record,), daemon=True).start()

        next_interval = result["adaptive_decision"]["sampling_interval"]
        return jsonify({
            "success": True,
            "message": "Real ESP32 reading processed",
            "data": result,
            "next_sampling_interval": next_interval,
            "mode": result["adaptive_decision"]["system_mode"],
            "context": result["adaptive_decision"]["context"]
        })

    except Exception as error:
        print("Hardware data error:", error)
        return jsonify({"success": False, "error": str(error)}), 500


# ============================================================
# API - LAST KNOWN STABILITY
# ============================================================

@app.route("/api/last-known-stability", methods=["GET"])
def api_last_known_stability():
    return jsonify({
        "available": last_known_hardware_stability is not None,
        "stability": None if last_known_hardware_stability is None else dict(last_known_hardware_stability),
        "timestamp": last_known_hardware_stability_timestamp
    })


# ============================================================
# API - HARDWARE STATUS
# ============================================================

@app.route("/api/hardware", methods=["GET"])
def api_hardware():
    active = (time.time() - hardware_last_seen) <= HARDWARE_TIMEOUT
    return jsonify({
        "connected": active,
        "status": "ESP32 CONNECTED" if active else "ESP32 NOT CONNECTED",
        "data_source": "REAL ESP32 HARDWARE" if active else "NO HARDWARE DATA",
        "last_seen_seconds": None if hardware_last_seen == 0 else round(time.time() - hardware_last_seen, 1)
    })


# ============================================================
# API - SIMULATION STEP
# ============================================================

@app.route(
    "/api/simulation-step",
    methods=["POST"]
)
def api_simulation_step():

    try:
        if (time.time() - hardware_last_seen) <= HARDWARE_TIMEOUT:
            return jsonify({"success": False, "error": "Real ESP32 hardware is active; simulation is disabled."}), 409

        with state_lock:

            current = dict(
                system_state[
                    "sensor_data"
                ]
            )

        # Create one fresh simulated reading immediately.
        # This is used by the dashboard Refresh button.
        new_data = {

            "soil_moisture":
                clamp(
                    current["soil_moisture"]
                    + random.uniform(-1.5, 1.5),
                    0,
                    100
                ),

            "temperature":
                clamp(
                    current["temperature"]
                    + random.uniform(-0.5, 0.5),
                    0,
                    50
                ),

            "humidity":
                clamp(
                    current["humidity"]
                    + random.uniform(-1.0, 1.0),
                    0,
                    100
                ),

            "light":
                clamp(
                    current["light"]
                    + random.uniform(-20, 20),
                    0,
                    1000
                ),

            "rain":
                current["rain"],

            "battery":
                current["battery"]
        }

        result = process_environment(
            new_data
        )

        return jsonify({
            "success": True,
            "message": "New simulated reading generated",
            "data": result
        })

    except Exception as error:

        print(
            "Simulation step error:",
            error
        )

        return jsonify({
            "success": False,
            "error": str(error)
        }), 500


# ============================================================
# API - HISTORY
# ============================================================

@app.route(
    "/api/history",
    methods=["GET"]
)
def api_history():
    try:
        limit = int(
            request.args.get("limit", MAX_HISTORY)
        )
    except (TypeError, ValueError):
        limit = MAX_HISTORY

    limit = max(
        1,
        min(limit, MAX_HISTORY)
    )

    records = []
    source = "local_persistent"

    # Attempt to load from Supabase if client is available
    if supabase is not None:
        supabase_records = load_history_from_supabase(limit)
        if supabase_records:
            records = supabase_records
            source = "supabase"

    # Fallback to local persistent history
    if not records:
        with state_lock:
            records = list(history[-limit:])
            source = "local_persistent"

    return jsonify({
        "success": True,
        "count": len(records),
        "records": records,
        "history": records,
        "source": source,
        "supabase_status": supabase_status
    })


# ============================================================
# API - RESET SIMULATION
# ============================================================

@app.route(
    "/api/reset",
    methods=["POST"]
)
def api_reset():

    default_data = {

        "soil_moisture": 50,

        "temperature": 28,

        "humidity": 65,

        "light": 450,

        "rain": False,

        "battery": 95

    }


    result = \
        process_environment(
            default_data
        )


    with state_lock:

        history.clear()


    return jsonify({

        "success": True,

        "message":
            "Simulation reset",

        "data":
            result

    })


# ============================================================
# API - HARDWARE STATUS
# ============================================================



# ============================================================
# API - DEMO SCENARIOS
# ============================================================

SCENARIOS = {

    "normal": {

        "soil_moisture": 55,

        "temperature": 28,

        "humidity": 65,

        "light": 450,

        "rain": False,

        "battery": 95

    },


    "dry": {

        "soil_moisture": 18,

        "temperature": 42,

        "humidity": 32,

        "light": 850,

        "rain": False,

        "battery": 91

    },


    "rain": {

        "soil_moisture": 88,

        "temperature": 25,

        "humidity": 94,

        "light": 120,

        "rain": True,

        "battery": 89

    },


    "humid": {

        "soil_moisture": 60,

        "temperature": 30,

        "humidity": 94,

        "light": 300,

        "rain": False,

        "battery": 87

    },


    "extreme": {

        "soil_moisture": 12,

        "temperature": 46,

        "humidity": 96,

        "light": 980,

        "rain": True,

        "battery": 78

    }

}


@app.route(
    "/api/scenario/<scenario_name>",
    methods=["POST"]
)
def apply_scenario(
    scenario_name
):

    scenario_name = \
        scenario_name.lower()


    if scenario_name not in SCENARIOS:

        return jsonify({

            "success": False,

            "error":
                "Unknown scenario"

        }), 404


    result = \
        process_environment(
            SCENARIOS[
                scenario_name
            ]
        )


    return jsonify({

        "success": True,

        "scenario":
            scenario_name,

        "data":
            result

    })


# ============================================================
# SIMULATED BACKGROUND SENSOR
# ============================================================

simulation_running = True


def simulation_loop():

    # The simulator now follows the adaptive sampling interval
    # calculated by the existing adaptive algorithm.
    #
    # Example:
    # environmental change >= 8  -> 10 sec
    # environmental change >= 6  -> 20 sec
    # environmental change >= 4  -> 30 sec
    # environmental change >= 2  -> 60 sec
    # otherwise                   -> 120 sec

    while simulation_running:

        try:

            # Once real ESP32 data has arrived recently, completely pause
            # the simulator so it cannot overwrite hardware readings.
            if (time.time() - hardware_last_seen) <= HARDWARE_TIMEOUT:
                time.sleep(1)
                continue

            with state_lock:

                current = dict(
                    system_state[
                        "sensor_data"
                    ]
                )

            # Create the next simulated sensor reading.
            # These small variations make the trend graphs move
            # naturally instead of jumping unrealistically.

            new_data = {

                "soil_moisture":
                    clamp(
                        current["soil_moisture"]
                        + random.uniform(-1.5, 1.5),
                        0,
                        100
                    ),

                "temperature":
                    clamp(
                        current["temperature"]
                        + random.uniform(-0.5, 0.5),
                        0,
                        50
                    ),

                "humidity":
                    clamp(
                        current["humidity"]
                        + random.uniform(-1.0, 1.0),
                        0,
                        100
                    ),

                "light":
                    clamp(
                        current["light"]
                        + random.uniform(-20, 20),
                        0,
                        1000
                    ),

                "rain":
                    current["rain"],

                "battery":
                    current["battery"]
            }

            # Run the complete adaptive processing pipeline.
            process_environment(new_data)

            # Read the NEW adaptive sampling interval after
            # processing this reading.
            with state_lock:

                next_interval = int(
                    system_state[
                        "adaptive_decision"
                    ].get(
                        "sampling_interval",
                        120
                    )
                )

            # Wait according to the adaptive algorithm.
            # This replaces the previous hard-coded 10-second wait.
            time.sleep(
                max(
                    1,
                    next_interval
                )
            )

        except Exception as exc:

            # Keep the simulator alive if one iteration fails.
            print(
                "Simulation error:",
                exc
            )

            # Retry after a short delay instead of spinning
            # continuously on an error.
            time.sleep(2)


# ============================================================
# STARTUP
# ============================================================

if __name__ == "__main__":

    print()
    print(
        "=" * 65
    )

    print(
        "SMART FARM ADAPTIVE MONITORING SYSTEM"
    )

    print(
        "PHASE 2 BACKEND"
    )

    print(
        "=" * 65
    )

    print(
        "Hardware integration backend starting..."
    )

    print(
        "ESP32 hardware integration: ENABLED"
    )

    print(
        "Dashboard: http://127.0.0.1:5000"
    )

    print(
        "Simulator: http://127.0.0.1:5000/simulator"
    )

    print(
        "=" * 65
    )

    print("Real hardware integration mode ready. Waiting for ESP32 data...")

    app.run(

        host="0.0.0.0",

        port=5000,

        debug=True,

        use_reloader=False

    )