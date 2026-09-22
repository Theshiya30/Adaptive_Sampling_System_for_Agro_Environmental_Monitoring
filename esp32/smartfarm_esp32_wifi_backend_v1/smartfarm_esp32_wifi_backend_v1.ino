/*
 * SmartFarm ESP32 Firmware
 * Adaptive AI-Based Real-Time Soil & Microclimate Monitoring
 * 
 * Sensors:
 *   - 2x Soil Moisture (Analog)
 *   - DHT22 Temperature/Humidity
 *   - BH1750 Light Sensor (I2C)
 *   - Rain Sensor (Analog)
 *   - INA219 Voltage/Current/Power (I2C)
 * 
 * Communication:
 *   ESP32 → HTTP POST → Python Backend → Supabase
 *   Backend returns adaptive decisions (next interval, mode)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <Adafruit_INA219.h>
#include <WiFiClientSecure.h>

// ─── WiFi Configuration ───
const char* WIFI_SSID = "Suresh 5g";
const char* WIFI_PASSWORD = "12345679";

// ─── Backend Configuration ───
const char* BACKEND_URL = "http://10.114.187.230:5000/api/hardware-data";
const char* DEVICE_ID = "esp32-001";
const char* API_KEY = "";

// ─── Pin Configuration ───
#define SOIL_MOISTURE_1_PIN  34  // Analog input
#define SOIL_MOISTURE_2_PIN  35  // Analog input
#define RAIN_SENSOR_PIN      32  // Analog input
#define DHT_PIN              4  // Digital
#define DHT_TYPE             DHT22
#define SDA_PIN              21  // I2C SDA
#define SCL_PIN              22  // I2C SCL

// ─── Sensor Objects ───
DHT dht(DHT_PIN, DHT_TYPE);
BH1750 lightMeter;
Adafruit_INA219 ina219;

// ─── Adaptive Sampling State ───
unsigned long samplingInterval = 30000;  // Default 30s (milliseconds)
String adaptiveMode = "NORMAL";
unsigned long lastSampleTime = 0;
unsigned long lastCommandPoll = 0;
const unsigned long COMMAND_POLL_INTERVAL = 0;  // Disabled in initial integration

// ─── Sensor Data Structure ───
struct SensorData {
  float soilMoisture1;
  float soilMoisture2;
  float temperature;
  float humidity;
  float lightLux;
  float rainValue;
  bool rainDetected;
  float voltage;
  float currentMA;
  float powerMW;
  bool dhtValid;
  bool lightValid;
  bool inaValid;
};

// ─── Forward Declarations ───
SensorData readAllSensors();
void sendToBackend(SensorData& data);
void printSensorData(SensorData& data);
void connectWiFi();
void pollCommands();
void processCommand(JsonObject& cmd);
void acknowledgeCommand(int cmdId, bool success);

// ─── Connectivity ───
int wifiRetryCount = 0;
const int MAX_WIFI_RETRIES = 20;
unsigned long lastWifiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000;

// ─── Watchdog ───
hw_timer_t* watchdogTimer = NULL;
const int WATCHDOG_TIMEOUT_S = 120;  // 2 minutes

void IRAM_ATTR resetModule() {
  esp_restart();
}

// =====================================================
// SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n[SmartFarm] ESP32 Starting...");
  
  // Initialize I2C
  Wire.begin(SDA_PIN, SCL_PIN);
  
  // Initialize sensors
  dht.begin();
  
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE)) {
    Serial.println("[SmartFarm] BH1750 initialized");
  } else {
    Serial.println("[SmartFarm] BH1750 FAILED to initialize");
  }
  
  if (ina219.begin()) {
    Serial.println("[SmartFarm] INA219 initialized");
  } else {
    Serial.println("[SmartFarm] INA219 FAILED to initialize");
  }
  
  // Initialize analog pins
  analogReadResolution(12);  // 12-bit ADC (0-4095)
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup watchdog (ESP32 Arduino Core 3.x API)
  watchdogTimer = timerBegin(1000000);  // 1 MHz timer frequency (1 tick = 1 microsecond)
  timerAttachInterrupt(watchdogTimer, &resetModule);
  timerAlarm(watchdogTimer, (uint64_t)WATCHDOG_TIMEOUT_S * 1000000ULL, false, 0);
  
  Serial.println("[SmartFarm] Setup complete. Starting monitoring loop.");
  Serial.printf("[SmartFarm] Initial interval: %lu ms, Mode: %s\n", 
                samplingInterval, adaptiveMode.c_str());
}

// =====================================================
// MAIN LOOP
// =====================================================
void loop() {
  // Reset watchdog
  timerRestart(watchdogTimer);
  
  unsigned long now = millis();
  
  // Check WiFi connectivity
  if (now - lastWifiCheck >= WIFI_CHECK_INTERVAL) {
    lastWifiCheck = now;
    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[SmartFarm] WiFi disconnected. Reconnecting...");
      connectWiFi();
    }
  }
  
  // Sampling cycle
  if (now - lastSampleTime >= samplingInterval) {
    lastSampleTime = now;
    
    // 1. Read all sensors
    SensorData data = readAllSensors();
    
    // 2. Send to backend and get adaptive decision
    if (WiFi.status() == WL_CONNECTED) {
      sendToBackend(data);
    } else {
      Serial.println("[SmartFarm] WiFi not connected. Skipping upload.");
    }
    
    // 3. Print to serial for debugging
    printSensorData(data);
  }
  
  // Command polling is disabled during the initial API integration.
  // The backend returns next_sampling_interval directly in the upload response.
  
  delay(100);  // Small delay to prevent tight loop
}

// =====================================================
// READ ALL SENSORS
// =====================================================
SensorData readAllSensors() {
  SensorData data;
  
  // ── Soil Moisture (Analog) ──
  // Raw: 0 (wet) to 4095 (dry) → Convert to percentage
  int raw1 = analogRead(SOIL_MOISTURE_1_PIN);
  int raw2 = analogRead(SOIL_MOISTURE_2_PIN);
  data.soilMoisture1 = map(raw1, 4095, 0, 0, 100);  // Invert: higher raw = drier
  data.soilMoisture2 = map(raw2, 4095, 0, 0, 100);
  data.soilMoisture1 = constrain(data.soilMoisture1, 0, 100);
  data.soilMoisture2 = constrain(data.soilMoisture2, 0, 100);
  
  // ── DHT22 Temperature & Humidity ──
  data.temperature = dht.readTemperature();
  data.humidity = dht.readHumidity();
  data.dhtValid = !isnan(data.temperature) && !isnan(data.humidity);
  if (!data.dhtValid) {
    data.temperature = -999;
    data.humidity = -999;
  }
  
  // ── BH1750 Light ──
  data.lightLux = lightMeter.readLightLevel();
  data.lightValid = (data.lightLux >= 0);
  if (!data.lightValid) {
    data.lightLux = -999;
  }
  
  // ── Rain Sensor (Analog) ──
  int rainRaw = analogRead(RAIN_SENSOR_PIN);
  data.rainValue = (float)rainRaw;
  // Lower values = more rain detected (sensor-dependent threshold)
  data.rainDetected = (rainRaw < 2000);
  
  // ── INA219 Voltage/Current/Power ──
  data.voltage = ina219.getBusVoltage_V();
  data.currentMA = ina219.getCurrent_mA();
  data.powerMW = ina219.getPower_mW();
  data.inaValid = (data.voltage >= 0 && data.voltage < 30);
  if (!data.inaValid) {
    data.voltage = -999;
    data.currentMA = -999;
    data.powerMW = -999;
  }
  
  return data;
}

// Helper function to initialize HTTPClient with SSL support for HTTPS endpoints (Vercel)
void initHttpClient(HTTPClient& http, WiFiClient& client, WiFiClientSecure& secureClient, const String& url) {
  if (url.startsWith("https://")) {
    secureClient.setInsecure(); // Disable strict certificate check for serverless endpoint
    http.begin(secureClient, url);
  } else {
    http.begin(client, url);
  }
}

// =====================================================
// SEND DATA TO BACKEND
// =====================================================
void sendToBackend(SensorData& data) {
  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secureClient;
  initHttpClient(http, client, secureClient, String(BACKEND_URL));
  http.addHeader("Content-Type", "application/json");
  if (strlen(API_KEY) > 0) http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(10000);  // 10s timeout
  
  // Build JSON payload
  JsonDocument doc;
  doc["device_id"] = DEVICE_ID;
  doc["soil_moisture_1"] = data.soilMoisture1;
  doc["soil_moisture_2"] = data.soilMoisture2;
  
  if (data.dhtValid) {
    doc["temperature"] = data.temperature;
    doc["humidity"] = data.humidity;
  }
  
  if (data.lightValid) {
    doc["light"] = data.lightLux;
  }
  
  doc["rain"] = data.rainDetected;
  doc["rain_raw"] = data.rainValue;
  
  if (data.inaValid) {
    doc["bus_voltage"] = data.voltage;
    doc["current_mA"] = data.currentMA;
    doc["power_mW"] = data.powerMW;
  }
  
  String jsonPayload;
  serializeJson(doc, jsonPayload);
  
  Serial.printf("[SmartFarm] Sending data (%d bytes)...\n", jsonPayload.length());
  
  int httpCode = http.POST(jsonPayload);
  
  if (httpCode == 200) {
    String response = http.getString();
    Serial.println("[SmartFarm] Backend response received.");
    
    // Parse the adaptive interval returned by the current SmartFarm backend.
    JsonDocument resDoc;
    DeserializationError err = deserializeJson(resDoc, response);

    if (!err) {
      if (resDoc.containsKey("next_sampling_interval")) {
        unsigned long newInterval =
            resDoc["next_sampling_interval"].as<unsigned long>() * 1000UL;

        if (newInterval >= 1000UL && newInterval <= 3600000UL) {
          if (newInterval != samplingInterval) {
            Serial.printf("[SmartFarm] Backend interval: %lu -> %lu ms\n",
                          samplingInterval, newInterval);
          }
          samplingInterval = newInterval;
        }
      }

      if (resDoc.containsKey("mode")) {
        String newMode = resDoc["mode"].as<String>();
        if (newMode.length() > 0) {
          adaptiveMode = newMode;
        }
      }
    }
  } else {
    Serial.printf("[SmartFarm] HTTP Error: %d\n", httpCode);
  }
  
  http.end();
}

// =====================================================
// POLL FOR COMMANDS
// =====================================================
void pollCommands() {
  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secureClient;
  String url = String(BACKEND_URL);
  // Replace /ingest with /commands/pending
  url.replace("/ingest", "/commands/pending?device_id=");
  url += DEVICE_ID;
  
  initHttpClient(http, client, secureClient, url);
  if (strlen(API_KEY) > 0) http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(5000);
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String response = http.getString();
    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, response);
    
    if (!err && doc.containsKey("commands")) {
      JsonArray commands = doc["commands"];
      for (JsonObject cmd : commands) {
        processCommand(cmd);
      }
    }
  }
  
  http.end();
}

// =====================================================
// PROCESS COMMAND
// =====================================================
void processCommand(JsonObject& cmd) {
  String cmdType = cmd["command_type"].as<String>();
  int cmdId = cmd["id"].as<int>();
  
  Serial.printf("[SmartFarm] Processing command: %s (id: %d)\n", 
                cmdType.c_str(), cmdId);
  
  bool success = false;
  
  if (cmdType == "set_interval") {
    unsigned long newInterval = cmd["payload"]["interval_s"].as<unsigned long>() * 1000;
    if (newInterval >= 1000 && newInterval <= 3600000) {
      samplingInterval = newInterval;
      success = true;
      Serial.printf("[SmartFarm] Interval set to %lu ms\n", samplingInterval);
    }
  } else if (cmdType == "set_mode") {
    String newMode = cmd["payload"]["mode"].as<String>();
    adaptiveMode = newMode;
    success = true;
    Serial.printf("[SmartFarm] Mode set to %s\n", adaptiveMode.c_str());
  } else if (cmdType == "restart") {
    Serial.println("[SmartFarm] Restart command received. Restarting...");
    acknowledgeCommand(cmdId, true);
    delay(1000);
    esp_restart();
  } else if (cmdType == "read_now") {
    // Force an immediate reading
    lastSampleTime = 0;  // Will trigger reading on next loop
    success = true;
  }
  
  // Acknowledge command
  acknowledgeCommand(cmdId, success);
}

// =====================================================
// ACKNOWLEDGE COMMAND
// =====================================================
void acknowledgeCommand(int cmdId, bool success) {
  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secureClient;
  String url = String(BACKEND_URL);
  url.replace("/ingest", "/commands/");
  url += String(cmdId);
  url += "/acknowledge";
  
  initHttpClient(http, client, secureClient, url);
  http.addHeader("Content-Type", "application/json");
  if (strlen(API_KEY) > 0) http.addHeader("X-API-Key", API_KEY);
  http.setTimeout(5000);
  
  JsonDocument doc;
  doc["status"] = success ? "acknowledged" : "failed";
  doc["device_id"] = DEVICE_ID;
  
  String payload;
  serializeJson(doc, payload);
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    Serial.printf("[SmartFarm] Command %d acknowledged (%s)\n", 
                  cmdId, success ? "success" : "failed");
  } else {
    Serial.printf("[SmartFarm] Failed to acknowledge command %d: HTTP %d\n", 
                  cmdId, httpCode);
  }
  
  http.end();
}

// =====================================================
// WIFI CONNECTION
// =====================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  Serial.printf("[SmartFarm] Connecting to WiFi: %s", WIFI_SSID);
  
  wifiRetryCount = 0;
  while (WiFi.status() != WL_CONNECTED && wifiRetryCount < MAX_WIFI_RETRIES) {
    delay(500);
    Serial.print(".");
    wifiRetryCount++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[SmartFarm] WiFi connected. IP: %s\n", 
                  WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[SmartFarm] WiFi connection FAILED. Will retry later.");
  }
}

// =====================================================
// DEBUG PRINT
// =====================================================
void printSensorData(SensorData& data) {
  Serial.println("─── Sensor Reading ───");
  Serial.printf("  Soil 1: %.1f%%  Soil 2: %.1f%%\n", 
                data.soilMoisture1, data.soilMoisture2);
  if (data.dhtValid) {
    Serial.printf("  Temp: %.1f°C  Humidity: %.1f%%\n", 
                  data.temperature, data.humidity);
  } else {
    Serial.println("  DHT22: READ ERROR");
  }
  if (data.lightValid) {
    Serial.printf("  Light: %.1f lux\n", data.lightLux);
  } else {
    Serial.println("  BH1750: READ ERROR");
  }
  Serial.printf("  Rain: %.0f  Detected: %s\n", 
                data.rainValue, data.rainDetected ? "YES" : "NO");
  if (data.inaValid) {
    Serial.printf("  Voltage: %.2fV  Current: %.1fmA  Power: %.1fmW\n", 
                  data.voltage, data.currentMA, data.powerMW);
  } else {
    Serial.println("  INA219: READ ERROR");
  }
  Serial.printf("  Mode: %s  Interval: %lus\n", 
                adaptiveMode.c_str(), samplingInterval / 1000);
  Serial.println("──────────────────────");
}
