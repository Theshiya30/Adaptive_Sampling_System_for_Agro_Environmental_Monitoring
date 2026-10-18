/**
 * SmartFarm Real-Time Alert Engine
 * Evaluates live telemetry and historical records to produce structured,
 * genuine real-time alerts for sensor faults, abnormal readings, low battery,
 * and important environmental changes.
 * 
 * Never produces simulated/fake alerts; every alert directly corresponds to
 * real backend telemetry thresholds or sensor health diagnostics.
 */

export function getRealtimeAlerts({ liveData, backendConnected, sensorHealth = null, history = [] }) {
  const alerts = [];
  const now = new Date();
  const defaultTimestamp = liveData?.timestamp || now.toISOString().replace("T", " ").slice(0, 19);

  // -------------------------------------------------------------
  // 1. SYSTEM & CONNECTIVITY ALERTS
  // -------------------------------------------------------------
  if (!backendConnected) {
    alerts.push({
      id: "sys_backend_offline",
      severity: "CRITICAL",
      category: "SYSTEM",
      title: "Backend Server Offline",
      reason: "Central Flask backend is not reachable. Real-time telemetry streaming paused.",
      reading: "OFFLINE",
      timestamp: defaultTimestamp,
      status: "ACTIVE",
      recommendation: "Verify that the backend service (port 5000 / cloud host) is running and network is connected.",
    });
    return alerts;
  }

  const hardwareStatus = liveData?.hardware_status;
  const isConnected = liveData?.connected === true;
  const dataAge = liveData?.data_age_seconds;

  if (hardwareStatus === "ESP32 NOT CONNECTED" || (!isConnected && dataAge !== null && dataAge > 180)) {
    alerts.push({
      id: "sys_esp32_disconnected",
      severity: "WARNING",
      category: "SYSTEM",
      title: "ESP32 Node Disconnected",
      reason: `No telemetry received from ESP32 node for ${dataAge ? Math.round(dataAge) + "s" : "an extended period"}. Retaining last known hardware readings.`,
      reading: "DISCONNECTED",
      timestamp: defaultTimestamp,
      status: "MONITORING",
      recommendation: "Check ESP32 power connection, battery level, and local 2.4GHz Wi-Fi reception.",
    });
  }

  // -------------------------------------------------------------
  // 2. SENSOR FAULTS (Hardware diagnostics & Sensor Health Engine)
  // -------------------------------------------------------------
  if (sensorHealth) {
    // Soil Sensor 1
    if (sensorHealth.soil1?.state === "FAULT") {
      alerts.push({
        id: "sensor_soil1_fault",
        severity: "CRITICAL",
        category: "SENSOR FAULT",
        title: "Soil Moisture Sensor 01 Fault",
        reason: sensorHealth.soil1.reason || "Invalid or missing soil moisture telemetry",
        reading: liveData?.soil_moisture_1 != null ? `${Number(liveData.soil_moisture_1).toFixed(1)}%` : "N/A",
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Inspect Soil Sensor 01 wiring and ADC pin connection on the ESP32.",
      });
    }

    // Soil Sensor 2
    if (sensorHealth.soil2?.state === "FAULT") {
      alerts.push({
        id: "sensor_soil2_fault",
        severity: "CRITICAL",
        category: "SENSOR FAULT",
        title: "Soil Moisture Sensor 02 Fault",
        reason: sensorHealth.soil2.reason || "Invalid or missing soil moisture telemetry",
        reading: liveData?.soil_moisture_2 != null ? `${Number(liveData.soil_moisture_2).toFixed(1)}%` : "N/A",
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Inspect Soil Sensor 02 probe and wiring on the secondary channel.",
      });
    }

    // Soil Disagreement / Verification
    const s1 = Number(liveData?.soil_moisture_1);
    const s2 = Number(liveData?.soil_moisture_2);
    const disagreement = liveData?.soil_disagreement != null
      ? Number(liveData.soil_disagreement)
      : (Number.isFinite(s1) && Number.isFinite(s2) ? Math.abs(s1 - s2) : null);

    if (sensorHealth.soil1?.state === "VERIFY" || sensorHealth.soil2?.state === "VERIFY" || (disagreement !== null && disagreement >= 15)) {
      alerts.push({
        id: "sensor_soil_disagreement",
        severity: "WARNING",
        category: "SENSOR FAULT",
        title: "Soil Sensor Disagreement Detected",
        reason: `Soil Sensor 01 (${s1.toFixed(1)}%) and Soil Sensor 02 (${s2.toFixed(1)}%) differ by ${disagreement ? disagreement.toFixed(1) : "over 15"}%. Exceeds consistency threshold.`,
        reading: `Δ ${disagreement ? disagreement.toFixed(1) : ">15"}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Calibrate soil moisture sensors and verify physical probe insertion depth in soil.",
      });
    }

    // DHT22 (Temperature & Humidity)
    if (sensorHealth.dht22?.state === "FAULT") {
      alerts.push({
        id: "sensor_dht22_fault",
        severity: "CRITICAL",
        category: "SENSOR FAULT",
        title: "DHT22 Climate Sensor Fault",
        reason: sensorHealth.dht22.reason || "Temperature or humidity readings out of physical operating limits (-40 to 80°C, 0-100%)",
        reading: `T: ${liveData?.temperature ?? "N/A"}°C, H: ${liveData?.humidity ?? "N/A"}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Check DHT22 signal cable and 4.7kΩ pull-up resistor connection.",
      });
    }

    // BH1750 (Ambient Light)
    if (sensorHealth.bh1750?.state === "FAULT") {
      alerts.push({
        id: "sensor_bh1750_fault",
        severity: "WARNING",
        category: "SENSOR FAULT",
        title: "BH1750 Light Sensor Fault",
        reason: sensorHealth.bh1750.reason || "Ambient light measurement unavailable or invalid lux range",
        reading: liveData?.light != null ? `${liveData.light} lux` : "N/A",
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Check I2C communication lines (SDA/SCL) and 3.3V supply to BH1750 module.",
      });
    }

    // Rain Sensor
    if (sensorHealth.rain?.state === "FAULT") {
      alerts.push({
        id: "sensor_rain_fault",
        severity: "WARNING",
        category: "SENSOR FAULT",
        title: "Rain Sensor Fault",
        reason: sensorHealth.rain.reason || "Rain detector sensor state unavailable",
        reading: "Unavailable",
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Inspect rain board traces for corrosion or debris and check digital output pin.",
      });
    }

    // INA219 (Power & Battery Monitor)
    if (sensorHealth.ina219?.state === "FAULT") {
      alerts.push({
        id: "sensor_ina219_fault",
        severity: "WARNING",
        category: "SENSOR FAULT",
        title: "INA219 Power Monitor Fault",
        reason: sensorHealth.ina219.reason || "Bus voltage, current, or power metrics out of valid range",
        reading: "Invalid",
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Verify INA219 I2C address and shunt resistor wiring on the power bus.",
      });
    }
  }

  // -------------------------------------------------------------
  // 3. LOW BATTERY & POWER ALERTS
  // -------------------------------------------------------------
  const battery = liveData?.battery !== undefined && liveData?.battery !== null ? Number(liveData.battery) : null;
  if (battery !== null && Number.isFinite(battery)) {
    if (battery < 20) {
      alerts.push({
        id: "battery_critical",
        severity: "CRITICAL",
        category: "LOW BATTERY",
        title: "Critical Battery Level",
        reason: `ESP32 node battery is at ${battery.toFixed(1)}%. Field node shutdown imminent below 15%.`,
        reading: `${battery.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Recharge or replace the battery pack immediately to prevent monitoring loss.",
      });
    } else if (battery < 40) {
      alerts.push({
        id: "battery_low",
        severity: "WARNING",
        category: "LOW BATTERY",
        title: "Low Battery Warning",
        reason: `Battery capacity has dropped to ${battery.toFixed(1)}%. Normal threshold is >= 50%.`,
        reading: `${battery.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Plan solar recharging or battery replacement within 24 hours.",
      });
    }
  }

  // -------------------------------------------------------------
  // 4. ABNORMAL ENVIRONMENTAL READINGS
  // -------------------------------------------------------------
  const temp = liveData?.temperature !== undefined && liveData?.temperature !== null ? Number(liveData.temperature) : null;
  const humidity = liveData?.humidity !== undefined && liveData?.humidity !== null ? Number(liveData.humidity) : null;
  const soilMoisture = liveData?.soil_moisture !== undefined && liveData?.soil_moisture !== null
    ? Number(liveData.soil_moisture)
    : (liveData?.soil_moisture_1 != null ? Number(liveData.soil_moisture_1) : null);
  const light = liveData?.light !== undefined && liveData?.light !== null ? Number(liveData.light) : null;

  // Temperature
  if (temp !== null && Number.isFinite(temp)) {
    if (temp >= 42) {
      alerts.push({
        id: "abnormal_temp_extreme",
        severity: "CRITICAL",
        category: "ABNORMAL READING",
        title: "Extreme Temperature Detected",
        reason: `Ambient temperature reached ${temp.toFixed(1)}°C (Thermal damage threshold: 42°C). High risk of crop heat stress.`,
        reading: `${temp.toFixed(1)}°C`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Engage shading, misting, or greenhouse ventilation systems immediately.",
      });
    } else if (temp >= 38) {
      alerts.push({
        id: "abnormal_temp_high",
        severity: "WARNING",
        category: "ABNORMAL READING",
        title: "High Temperature Stress",
        reason: `Ambient temperature elevated at ${temp.toFixed(1)}°C (Optimal crop range: 18–32°C).`,
        reading: `${temp.toFixed(1)}°C`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Monitor crop wilting and prepare supplemental canopy cooling.",
      });
    } else if (temp <= 4) {
      alerts.push({
        id: "abnormal_temp_frost",
        severity: "CRITICAL",
        category: "ABNORMAL READING",
        title: "Frost Hazard Warning",
        reason: `Temperature dropped to ${temp.toFixed(1)}°C (Near freezing frost risk).`,
        reading: `${temp.toFixed(1)}°C`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Deploy frost covers or frost protection irrigation.",
      });
    }
  }

  // Soil Moisture
  if (soilMoisture !== null && Number.isFinite(soilMoisture)) {
    if (soilMoisture < 20) {
      alerts.push({
        id: "abnormal_soil_critical",
        severity: "CRITICAL",
        category: "ABNORMAL READING",
        title: "Critical Soil Dehydration",
        reason: `Soil moisture dropped to ${soilMoisture.toFixed(1)}% (Permanent wilting point risk below 20%).`,
        reading: `${soilMoisture.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Irrigate immediately to restore root zone moisture and prevent crop failure.",
      });
    } else if (soilMoisture < 30) {
      alerts.push({
        id: "abnormal_soil_low",
        severity: "WARNING",
        category: "ABNORMAL READING",
        title: "Low Soil Moisture Warning",
        reason: `Soil moisture is depleted to ${soilMoisture.toFixed(1)}% (Target: 40–70%).`,
        reading: `${soilMoisture.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Schedule irrigation cycle within the next few hours.",
      });
    } else if (soilMoisture > 90) {
      alerts.push({
        id: "abnormal_soil_saturated",
        severity: "WARNING",
        category: "ABNORMAL READING",
        title: "Excessive Soil Moisture Saturation",
        reason: `Soil moisture reached ${soilMoisture.toFixed(1)}%. Risk of root hypoxia and waterlogging.`,
        reading: `${soilMoisture.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Suspend irrigation and inspect field drainage channels.",
      });
    }
  }

  // Humidity
  if (humidity !== null && Number.isFinite(humidity)) {
    if (humidity >= 92) {
      alerts.push({
        id: "abnormal_humidity_high",
        severity: "WARNING",
        category: "ABNORMAL READING",
        title: "High Relative Humidity Risk",
        reason: `Ambient humidity at ${humidity.toFixed(1)}% exceeds 92%. Elevated pathogen & fungal spore proliferation risk.`,
        reading: `${humidity.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Increase airflow/ventilation and inspect foliage for fungal signs.",
      });
    } else if (humidity < 30) {
      alerts.push({
        id: "abnormal_humidity_low",
        severity: "WARNING",
        category: "ABNORMAL READING",
        title: "Dry Air Condition",
        reason: `Relative humidity at ${humidity.toFixed(1)}% is below 30%, causing rapid plant transpiration.`,
        reading: `${humidity.toFixed(1)}%`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Monitor leaf moisture tension and guard against rapid soil dry-out.",
      });
    }
  }

  // Light
  if (light !== null && Number.isFinite(light) && light > 900) {
    alerts.push({
      id: "abnormal_light_high",
      severity: "WARNING",
      category: "ABNORMAL READING",
      title: "Intense Solar Radiation",
      reason: `Light intensity recorded at ${light.toFixed(0)} lux. High photochemical and evapotranspiration load.`,
      reading: `${light.toFixed(0)} lux`,
      timestamp: defaultTimestamp,
      status: "ACTIVE",
      recommendation: "Consider shade mesh deployment for sensitive crops.",
    });
  }

  // -------------------------------------------------------------
  // 5. IMPORTANT ENVIRONMENTAL CHANGES & ADAPTIVE DECISION
  // -------------------------------------------------------------
  // Precipitation event
  if (liveData?.rain === true) {
    alerts.push({
      id: "env_rain_detected",
      severity: "INFO",
      category: "ENVIRONMENTAL CHANGE",
      title: "Precipitation Event Active",
      reason: "Rain sensor is detecting active rainfall. Soil hydration rate increasing.",
      reading: "RAIN ACTIVE",
      timestamp: defaultTimestamp,
      status: "ACTIVE",
      recommendation: "Halt scheduled automated irrigation cycles to prevent water waste.",
    });
  }

  // Adaptive interval acceleration
  const samplingInterval = liveData?.sampling_interval ?? liveData?.adaptive_decision?.sampling_interval;
  const envChange = liveData?.environmental_change ?? liveData?.adaptive_decision?.environmental_change;
  const envContext = liveData?.context ?? liveData?.adaptive_decision?.context;

  if (samplingInterval !== undefined && samplingInterval !== null && Number(samplingInterval) <= 20) {
    alerts.push({
      id: "env_adaptive_accelerated",
      severity: "WARNING",
      category: "ENVIRONMENTAL CHANGE",
      title: "Adaptive Sampling Rate Accelerated",
      reason: `Environmental change magnitude (${envChange ?? "High"}) forced sampling interval down to ${samplingInterval}s (${envContext ?? "RAPID CHANGE"}).`,
      reading: `${samplingInterval}s interval`,
      timestamp: defaultTimestamp,
      status: "MONITORING",
      recommendation: "Monitor rapid microclimate transitions until parameters restabilize.",
    });
  }

  // Farm Stability Index Degradation
  const fsi = liveData?.fsi ?? liveData?.farm_stability?.fsi;
  const fsiStatus = liveData?.fsi_status ?? liveData?.farm_stability?.fsi_status;

  if (fsi !== undefined && fsi !== null) {
    const fsiNum = Number(fsi);
    if (fsiNum < 50 || fsiStatus === "CRITICAL") {
      alerts.push({
        id: "env_fsi_critical",
        severity: "CRITICAL",
        category: "ENVIRONMENTAL CHANGE",
        title: "Critical Farm Stability Index (FSI)",
        reason: `Composite Farm Stability Index declined to ${fsiNum}/100. Agro-environmental equilibrium critically compromised.`,
        reading: `${fsiNum}/100 (CRITICAL)`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Conduct immediate on-site inspection of irrigation and climate controls.",
      });
    } else if (fsiNum < 70 || fsiStatus === "DEGRADED") {
      alerts.push({
        id: "env_fsi_degraded",
        severity: "WARNING",
        category: "ENVIRONMENTAL CHANGE",
        title: "Degraded Farm Stability Index (FSI)",
        reason: `Farm Stability Index is degraded at ${fsiNum}/100. Soil or microclimate variations detected.`,
        reading: `${fsiNum}/100 (DEGRADED)`,
        timestamp: defaultTimestamp,
        status: "ACTIVE",
        recommendation: "Review soil moisture and temperature stability sub-indices (SSI and MSI).",
      });
    }
  }

  // Backend recommendation engine alert messages
  const backendAlerts = liveData?.recommendations?.alerts || [];
  backendAlerts.forEach((item, idx) => {
    if (typeof item === "string" && item.trim() && !item.toLowerCase().includes("no critical alerts")) {
      const alreadyCovered = alerts.some(a => a.title.toLowerCase().includes(item.toLowerCase()) || a.reason.toLowerCase().includes(item.toLowerCase()));
      if (!alreadyCovered) {
        alerts.push({
          id: `backend_rec_alert_${idx}`,
          severity: item.toLowerCase().includes("critical") ? "CRITICAL" : "WARNING",
          category: "ABNORMAL READING",
          title: item,
          reason: `Reported by central farm decision engine: ${item}`,
          reading: null,
          timestamp: defaultTimestamp,
          status: "ACTIVE",
          recommendation: liveData?.recommendations?.recommendations?.[idx] || "Investigate farm telemetry.",
        });
      }
    }
  });

  // -------------------------------------------------------------
  // 6. ALL CLEAR / SYSTEM NORMAL
  // -------------------------------------------------------------
  if (alerts.length === 0) {
    alerts.push({
      id: "all_systems_normal",
      severity: "INFO",
      category: "SYSTEM",
      title: "All Systems Operational",
      reason: "All sensor readings, microclimate indices, battery voltage, and farm stability levels are operating within optimal agricultural tolerances.",
      reading: "OPTIMAL",
      timestamp: defaultTimestamp,
      status: "RESOLVED",
      recommendation: "Continue standard adaptive monitoring routine.",
    });
  }

  return alerts;
}
