from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timezone
import os
import time
import threading

from dotenv import load_dotenv
from supabase import create_client, Client

app = Flask(__name__)
CORS(app)

# Load Supabase credentials from backend/.env.
load_dotenv()
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

supabase: Client | None = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("Supabase connection configured")
    except Exception as exc:
        print("Supabase initialization failed:", exc)
else:
    print("WARNING: SUPABASE_URL/SUPABASE_KEY not configured; database persistence disabled")

# ============================================================
# CONFIG
# ============================================================

NORMAL_INTERVAL = 30
ADAPTIVE_INTERVAL = 20
RAPID_INTERVAL = 10
VERIFICATION_INTERVAL = 10

SOIL_VERIFY_THRESHOLD = 25.0

SOIL_CHANGE_ADAPTIVE = 3.0
SOIL_CHANGE_RAPID = 8.0
TEMP_CHANGE_ADAPTIVE = 0.5
TEMP_CHANGE_RAPID = 2.0
HUMIDITY_CHANGE_ADAPTIVE = 3.0
HUMIDITY_CHANGE_RAPID = 10.0
LIGHT_CHANGE_ADAPTIVE = 50.0
LIGHT_CHANGE_RAPID = 150.0

HARDWARE_TIMEOUT = 180
MAX_HISTORY = 5000

state_lock = threading.Lock()
previous_data = None
last_received_time = None

latest_data = {
    "connected": False,
    "timestamp": None,
    "data_age_seconds": None,
    "soil_moisture_1": None,
    "soil_moisture_2": None,
    "temperature": None,
    "humidity": None,
    "light": None,
    "rain": None,
    "bus_voltage": None,
    "current_mA": None,
    "power_mW": None,
    "adaptive_mode": "NORMAL",
    "sampling_interval": NORMAL_INTERVAL,
    "adaptive_reason": "Waiting for environmental data",
    "environmental_change": False,
    "ssi": None,
    "msi": None,
    "fsi": None,
}

history = []


# ============================================================
# HELPERS
# ============================================================

def safe_float(value):
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def clamp(value, minimum, maximum):
    return max(minimum, min(maximum, value))


def change(current, previous):
    if current is None or previous is None:
        return 0.0
    return abs(current - previous)


# ============================================================
# SIMPLE STABILITY INDICES
# These are project-level indicators, not universal standards.
# ============================================================

def calculate_ssi(soil1, soil2):
    if soil1 is None and soil2 is None:
        return None

    values = [v for v in (soil1, soil2) if v is not None]
    avg = sum(values) / len(values)
    disagreement = abs(soil1 - soil2) if soil1 is not None and soil2 is not None else 0

    # Stable moisture around the middle range and low disagreement.
    range_score = max(0.0, 100.0 - abs(avg - 50.0) * 1.5)
    disagreement_penalty = min(40.0, disagreement)
    return round(clamp(range_score - disagreement_penalty, 0, 100), 1)


def calculate_msi(temperature, humidity, light):
    values = []

    if temperature is not None:
        values.append(max(0.0, 100.0 - abs(temperature - 28.0) * 3.0))
    if humidity is not None:
        values.append(max(0.0, 100.0 - abs(humidity - 65.0) * 1.2))
    if light is not None:
        values.append(max(0.0, 100.0 - abs(light - 450.0) / 10.0))

    if not values:
        return None

    return round(clamp(sum(values) / len(values), 0, 100), 1)


# ============================================================
# ADAPTIVE SAMPLING ENGINE
# ============================================================

def calculate_adaptive_sampling(current):
    global previous_data

    if previous_data is None:
        return {
            "mode": "NORMAL",
            "interval": NORMAL_INTERVAL,
            "reason": "Initial environmental reading received",
            "environmental_change": False,
        }

    soil1 = safe_float(current.get("soil_moisture_1"))
    soil2 = safe_float(current.get("soil_moisture_2"))
    temperature = safe_float(current.get("temperature"))
    humidity = safe_float(current.get("humidity"))
    light = safe_float(current.get("light"))
    rain = current.get("rain")

    psoil1 = safe_float(previous_data.get("soil_moisture_1"))
    psoil2 = safe_float(previous_data.get("soil_moisture_2"))
    ptemperature = safe_float(previous_data.get("temperature"))
    phumidity = safe_float(previous_data.get("humidity"))
    plight = safe_float(previous_data.get("light"))
    prain = previous_data.get("rain")

    soil_change = max(
        change(soil1, psoil1),
        change(soil2, psoil2)
    )
    temperature_change = change(temperature, ptemperature)
    humidity_change = change(humidity, phumidity)
    light_change = change(light, plight)

    disagreement = (
        abs(soil1 - soil2)
        if soil1 is not None and soil2 is not None
        else 0.0
    )

    # Sensor verification has priority over environmental modes.
    if disagreement >= SOIL_VERIFY_THRESHOLD:
        return {
            "mode": "VERIFICATION",
            "interval": VERIFICATION_INTERVAL,
            "reason": "Significant disagreement detected between Soil 01 and Soil 02",
            "environmental_change": True,
        }

    rapid_reasons = []

    if soil_change >= SOIL_CHANGE_RAPID:
        rapid_reasons.append(f"Soil change {soil_change:.1f}%")
    if temperature_change >= TEMP_CHANGE_RAPID:
        rapid_reasons.append(f"Temperature change {temperature_change:.1f}°C")
    if humidity_change >= HUMIDITY_CHANGE_RAPID:
        rapid_reasons.append(f"Humidity change {humidity_change:.1f}%")
    if light_change >= LIGHT_CHANGE_RAPID:
        rapid_reasons.append(f"Light change {light_change:.1f} lux")

    if rain is not None and prain is not None and rain != prain:
        rapid_reasons.append("Rain condition changed")

    if rapid_reasons:
        return {
            "mode": "RAPID",
            "interval": RAPID_INTERVAL,
            "reason": "Rapid environmental change: " + ", ".join(rapid_reasons),
            "environmental_change": True,
        }

    adaptive_reasons = []

    if soil_change >= SOIL_CHANGE_ADAPTIVE:
        adaptive_reasons.append(f"Soil change {soil_change:.1f}%")
    if temperature_change >= TEMP_CHANGE_ADAPTIVE:
        adaptive_reasons.append(f"Temperature change {temperature_change:.1f}°C")
    if humidity_change >= HUMIDITY_CHANGE_ADAPTIVE:
        adaptive_reasons.append(f"Humidity change {humidity_change:.1f}%")
    if light_change >= LIGHT_CHANGE_ADAPTIVE:
        adaptive_reasons.append(f"Light change {light_change:.1f} lux")

    if adaptive_reasons:
        return {
            "mode": "ADAPTIVE",
            "interval": ADAPTIVE_INTERVAL,
            "reason": "Environmental change detected: " + ", ".join(adaptive_reasons),
            "environmental_change": True,
        }

    return {
        "mode": "NORMAL",
        "interval": NORMAL_INTERVAL,
        "reason": "Environmental conditions stable; sampling interval increased",
        "environmental_change": False,
    }




# ============================================================
# SUPABASE PERSISTENCE
# ============================================================

def save_to_supabase(record):
    """Persist one real ESP32 reading without interrupting the live API."""
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
            "rain_value": record.get("rain_raw"),
            "rain_detected": record.get("rain"),
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
            "environmental_change": record.get("environmental_change"),
            "adaptive_mode": record.get("adaptive_mode"),
            "sampling_interval": record.get("sampling_interval"),
            "adaptive_reason": record.get("adaptive_reason"),
            "ssi": record.get("ssi"),
            "msi": record.get("msi"),
            "fsi": record.get("fsi"),
        }

        supabase.table("sensor_readings").insert(row).execute()
        return True
    except Exception as exc:
        print("Supabase save failed:", exc)
        return False


def load_history_from_supabase(limit=500):
    """Load recent persisted readings into the API history shape."""
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
            records.append({
                "timestamp": row.get("created_at"),
                "soil_moisture_1": row.get("soil_moisture_1"),
                "soil_moisture_2": row.get("soil_moisture_2"),
                "soil_moisture": row.get("average_soil_moisture"),
                "soil_disagreement": row.get("soil_disagreement"),
                "temperature": row.get("temperature"),
                "humidity": row.get("humidity"),
                "light": row.get("light_lux"),
                "rain": row.get("rain_detected"),
                "rain_raw": row.get("rain_value"),
                "bus_voltage": row.get("voltage"),
                "current_mA": row.get("current_ma"),
                "power_mW": row.get("power_mw"),
                "environmental_change": row.get("environmental_change", False),
                "adaptive_mode": row.get("adaptive_mode", "NORMAL"),
                "sampling_interval": row.get("sampling_interval", NORMAL_INTERVAL),
                "adaptive_reason": row.get("adaptive_reason", ""),
                "ssi": row.get("ssi"),
                "msi": row.get("msi"),
                "fsi": row.get("fsi"),
            })
        return records
    except Exception as exc:
        print("Supabase history load failed:", exc)
        return []


# ============================================================
# HARDWARE DATA
# ============================================================

@app.route("/api/hardware-data", methods=["POST"])
def hardware_data():
    global previous_data, last_received_time

    try:
        payload = request.get_json(silent=True) or {}

        soil1 = safe_float(payload.get("soil_moisture_1"))
        soil2 = safe_float(payload.get("soil_moisture_2"))
        temperature = safe_float(payload.get("temperature"))
        humidity = safe_float(payload.get("humidity"))
        light = safe_float(payload.get("light"))
        rain = payload.get("rain")
        rain_raw = safe_float(payload.get("rain_raw"))
        bus_voltage = safe_float(payload.get("bus_voltage"))
        current_mA = safe_float(payload.get("current_mA"))
        power_mW = safe_float(payload.get("power_mW"))

        current = {
            "soil_moisture_1": clamp(soil1, 0, 100) if soil1 is not None else 0,
            "soil_moisture_2": clamp(soil2, 0, 100) if soil2 is not None else 0,
            "temperature": temperature,
            "humidity": humidity,
            "light": light,
            "rain": rain,
            "rain_raw": rain_raw,
            "bus_voltage": bus_voltage,
            "current_mA": current_mA,
            "power_mW": power_mW,
        }

        decision = calculate_adaptive_sampling(current)

        ssi = calculate_ssi(soil1, soil2)
        msi = calculate_msi(temperature, humidity, light)
        fsi = (
            round((ssi + msi) / 2, 1)
            if ssi is not None and msi is not None
            else None
        )

        timestamp = datetime.now(timezone.utc).isoformat()

        record = {
            "timestamp": timestamp,
            **current,
            "soil_moisture": round(
                (current["soil_moisture_1"] + current["soil_moisture_2"]) / 2, 2
            ),
            "soil_disagreement": round(abs(
                current["soil_moisture_1"] - current["soil_moisture_2"]
            ), 2),
            "rain_raw": rain_raw,
            "environmental_change": decision["environmental_change"],
            "adaptive_mode": decision["mode"],
            "sampling_interval": decision["interval"],
            "adaptive_reason": decision["reason"],
            "ssi": ssi,
            "msi": msi,
            "fsi": fsi,
        }

        save_to_supabase(record)

        previous_data = dict(current)
        last_received_time = time.time()

        with state_lock:
            latest_data.update({
                **current,
                "connected": True,
                "timestamp": timestamp,
                "data_age_seconds": 0,
                "adaptive_mode": decision["mode"],
                "sampling_interval": decision["interval"],
                "adaptive_reason": decision["reason"],
                "environmental_change": decision["environmental_change"],
                "ssi": ssi,
                "msi": msi,
                "fsi": fsi,
            })

            history.append(record)

            if len(history) > MAX_HISTORY:
                del history[:-MAX_HISTORY]

        print("\n----------------------------------------")
        print("REAL ESP32 READING")
        print(f"Soil 01      : {current['soil_moisture_1']:.2f}%")
        print(f"Soil 02      : {current['soil_moisture_2']:.2f}%")
        print(f"Temperature  : {current['temperature']}")
        print(f"Humidity     : {current['humidity']}")
        print(f"Light        : {current['light']}")
        print(f"Rain         : {current['rain']}")
        print(f"ADAPTIVE MODE: {decision['mode']}")
        print(f"NEXT SAMPLE  : {decision['interval']} seconds")
        print(f"REASON       : {decision['reason']}")
        print("----------------------------------------")

        return jsonify({
            "success": True,
            "message": "Hardware data received",
            "next_sampling_interval": decision["interval"],
            "mode": decision["mode"],
            "reason": decision["reason"],
            "environmental_change": decision["environmental_change"],
        })

    except Exception as error:
        print("Hardware data error:", error)
        return jsonify({"success": False, "error": str(error)}), 500


# ============================================================
# STATUS
# ============================================================

@app.route("/api/status", methods=["GET"])
def api_status():
    response = dict(latest_data)

    if last_received_time is not None:
        age = max(0, time.time() - last_received_time)
        response["data_age_seconds"] = round(age, 1)
        response["connected"] = age <= HARDWARE_TIMEOUT
    else:
        response["connected"] = False
        response["data_age_seconds"] = None

    return jsonify(response)


# ============================================================
# HISTORY
# IMPORTANT:
# The React Analysis page expects response.data.records.
# We return BOTH "records" and "history" for compatibility.
# ============================================================

@app.route("/api/history", methods=["GET"])
def api_history():
    try:
        limit = int(request.args.get("limit", 500))
    except (TypeError, ValueError):
        limit = 500

    limit = max(1, min(limit, MAX_HISTORY))

    records = load_history_from_supabase(limit)

    if not records:
        with state_lock:
            records = list(history[-limit:])

    return jsonify({
        "success": True,
        "count": len(records),
        "records": records,
        "history": records,
    })


# ============================================================
# SIMPLE HEALTH CHECK
# ============================================================

@app.route("/", methods=["GET"])
def index():
    return jsonify({
        "service": "SmartFarm Backend",
        "status": "running",
        "adaptive_sampling": True,
        "history_records": len(history),
        "supabase_configured": supabase is not None,
    })


# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    print("SMARTFARM ADAPTIVE BACKEND")
    print("Real hardware + adaptive sampling + history enabled")

    app.run(
        host="0.0.0.0",
        port=5000,
        debug=False
    )
