import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * SmartFarm Comprehensive PDF Report Generator
 * Generates an executive agro-environmental intelligence report including:
 * - Current sensor telemetry readings
 * - Farm Stability Indices (SSI, MSI, FSI)
 * - Adaptive sampling system dynamics
 * - Real-time and historical alerts
 * - Actionable agronomic recommendations
 * - High-resolution vector-rendered historical trend charts
 * - Filtered historical telemetry table by selected date range
 */

export function generatePdfReport({
  liveData,
  historyData = [],
  alerts = [],
  dateRange = "all",
  customRange = null,
}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;

  // -------------------------------------------------------------
  // Filter History Data by Selected Date Range
  // -------------------------------------------------------------
  const now = new Date();
  let filteredHistory = [...historyData];
  let rangeLabel = "All Available Records";

  if (dateRange === "1h") {
    rangeLabel = "Last 1 Hour";
    const cutoff = now.getTime() - 1 * 60 * 60 * 1000;
    const subset = filteredHistory.filter((item) => {
      const t = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
      return !isNaN(t) && t >= cutoff;
    });
    if (subset.length > 0) filteredHistory = subset;
  } else if (dateRange === "12h") {
    rangeLabel = "Last 12 Hours";
    const cutoff = now.getTime() - 12 * 60 * 60 * 1000;
    const subset = filteredHistory.filter((item) => {
      const t = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
      return !isNaN(t) && t >= cutoff;
    });
    if (subset.length > 0) filteredHistory = subset;
  } else if (dateRange === "24h") {
    rangeLabel = "Last 24 Hours";
    const cutoff = now.getTime() - 24 * 60 * 60 * 1000;
    const subset = filteredHistory.filter((item) => {
      const t = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
      return !isNaN(t) && t >= cutoff;
    });
    if (subset.length > 0) filteredHistory = subset;
  } else if (dateRange === "custom" && customRange?.from && customRange?.to) {
    const fromTime = new Date(customRange.from).getTime();
    const toTime = new Date(customRange.to).getTime();
    rangeLabel = `${new Date(customRange.from).toLocaleDateString()} to ${new Date(customRange.to).toLocaleDateString()}`;
    const subset = filteredHistory.filter((item) => {
      const t = item.timestamp ? new Date(item.timestamp).getTime() : NaN;
      return !isNaN(t) && t >= fromTime && t <= toTime;
    });
    if (subset.length > 0) filteredHistory = subset;
  }

  // -------------------------------------------------------------
  // Color Palette Constants
  // -------------------------------------------------------------
  const FOREST_GREEN = [28, 98, 54];
  const LIGHT_GREEN_BG = [238, 247, 241];
  const DARK_TEXT = [22, 33, 27];
  const MUTED_TEXT = [95, 110, 102];
  const BORDER_COLOR = [205, 218, 210];
  const CRITICAL_RED = [214, 95, 95];
  const WARNING_AMBER = [212, 168, 75];
  const STABLE_GREEN = [60, 179, 113];

  let currentY = margin;

  // -------------------------------------------------------------
  // Header Banner
  // -------------------------------------------------------------
  doc.setFillColor(...FOREST_GREEN);
  doc.roundedRect(margin, currentY, contentWidth, 24, 2, 2, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SMARTFARM — AGRO-ENVIRONMENTAL MONITORING REPORT", margin + 6, currentY + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    "Adaptive AI-Based Real-Time Soil & Microclimate Telemetry Intelligence",
    margin + 6,
    currentY + 16
  );

  doc.setFontSize(8);
  doc.text(
    `Generated: ${now.toLocaleString()} | Scope: ${rangeLabel} (${filteredHistory.length} samples)`,
    margin + 6,
    currentY + 21
  );

  currentY += 28;

  // -------------------------------------------------------------
  // Executive Overview & Stability Indices
  // -------------------------------------------------------------
  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("1. Farm Stability & Health Assessment", margin, currentY);
  currentY += 4;

  const fsi = liveData?.fsi ?? liveData?.farm_stability?.fsi ?? 100;
  const ssi = liveData?.ssi ?? liveData?.farm_stability?.ssi ?? 100;
  const msi = liveData?.msi ?? liveData?.farm_stability?.msi ?? 100;

  const getStatus = (score) => {
    if (score >= 90) return "STABLE";
    if (score >= 70) return "MODERATE";
    if (score >= 50) return "DEGRADED";
    return "CRITICAL";
  };

  const getStatusColor = (score) => {
    if (score >= 90) return STABLE_GREEN;
    if (score >= 70) return [100, 180, 120];
    if (score >= 50) return WARNING_AMBER;
    return CRITICAL_RED;
  };

  const cardWidth = (contentWidth - 8) / 3;
  const cardHeight = 22;

  const indices = [
    { label: "FSI (Farm Stability)", score: fsi, status: getStatus(fsi), desc: "Composite agro-ecosystem balance" },
    { label: "SSI (Soil Stability)", score: ssi, status: getStatus(ssi), desc: "Dual soil moisture probe stability" },
    { label: "MSI (Microclimate Stability)", score: msi, status: getStatus(msi), desc: "Temperature, humidity, light, rain" },
  ];

  indices.forEach((item, idx) => {
    const cardX = margin + idx * (cardWidth + 4);
    doc.setFillColor(...LIGHT_GREEN_BG);
    doc.setDrawColor(...BORDER_COLOR);
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(item.label, cardX + 4, currentY + 5.5);

    doc.setFontSize(14);
    doc.setTextColor(...DARK_TEXT);
    doc.text(`${item.score}/100`, cardX + 4, currentY + 13);

    const statusCol = getStatusColor(item.score);
    doc.setFillColor(...statusCol);
    doc.roundedRect(cardX + cardWidth - 26, currentY + 4, 22, 6, 1, 1, "F");
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(item.status, cardX + cardWidth - 24, currentY + 8.2);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(item.desc, cardX + 4, currentY + 18.5);
  });

  currentY += cardHeight + 6;

  // -------------------------------------------------------------
  // 2. Current Telemetry Snapshot Table
  // -------------------------------------------------------------
  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("2. Real-Time Sensor Telemetry Snapshot", margin, currentY);
  currentY += 2;

  const soil1 = liveData?.soil_moisture_1 != null ? `${Number(liveData.soil_moisture_1).toFixed(1)}%` : "N/A";
  const soil2 = liveData?.soil_moisture_2 != null ? `${Number(liveData.soil_moisture_2).toFixed(1)}%` : "N/A";
  const soilAvg = liveData?.soil_moisture != null ? `${Number(liveData.soil_moisture).toFixed(1)}%` : soil1;
  const tempVal = liveData?.temperature != null ? `${Number(liveData.temperature).toFixed(1)} °C` : "N/A";
  const humVal = liveData?.humidity != null ? `${Number(liveData.humidity).toFixed(1)} %` : "N/A";
  const lightVal = liveData?.light != null ? `${Number(liveData.light).toFixed(0)} lux` : "N/A";
  const rainVal = liveData?.rain === true ? "ACTIVE RAIN" : "DRY / NO RAIN";
  const battVal = liveData?.battery != null ? `${Number(liveData.battery).toFixed(1)} %` : "N/A";
  const powerVal = liveData?.power_mW != null ? `${Number(liveData.power_mW).toFixed(1)} mW` : "N/A";

  const telemetryBody = [
    ["Soil Moisture 01 (Capacitive)", soil1, "40% – 70%", Number(liveData?.soil_moisture_1) < 30 ? "LOW" : "NORMAL"],
    ["Soil Moisture 02 (Capacitive)", soil2, "40% – 70%", Number(liveData?.soil_moisture_2) < 30 ? "LOW" : "NORMAL"],
    ["Composite Soil Moisture (Avg)", soilAvg, "40% – 70%", "OPERATIONAL"],
    ["Ambient Temperature (DHT22)", tempVal, "18.0 – 35.0 °C", Number(liveData?.temperature) > 38 ? "HIGH" : "OPTIMAL"],
    ["Relative Humidity (DHT22)", humVal, "50% – 85%", Number(liveData?.humidity) > 90 ? "HIGH" : "NORMAL"],
    ["Ambient Light Intensity (BH1750)", lightVal, "100 – 900 lux", Number(liveData?.light) > 900 ? "VERY HIGH" : "NORMAL"],
    ["Precipitation Sensor (Digital)", rainVal, "DRY Condition", liveData?.rain ? "PRECIPITATING" : "NORMAL"],
    ["Battery Level & Power (INA219)", `${battVal} | ${powerVal}`, ">= 40% Capacity", Number(liveData?.battery) < 20 ? "CRITICAL" : "HEALTHY"],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Sensor / Parameter", "Telemetry Reading", "Optimal Range", "Status"]],
    body: telemetryBody,
    theme: "striped",
    headStyles: {
      fillColor: FOREST_GREEN,
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: DARK_TEXT,
      cellPadding: 1.8,
    },
    alternateRowStyles: {
      fillColor: [248, 251, 249],
    },
    margin: { left: margin, right: margin },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // -------------------------------------------------------------
  // 3. Adaptive Sampling System Information
  // -------------------------------------------------------------
  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("3. Adaptive Sampling System Dynamics", margin, currentY);
  currentY += 2;

  const mode = liveData?.adaptive_decision?.system_mode || liveData?.system_mode || "NORMAL";
  const interval = liveData?.adaptive_decision?.sampling_interval || liveData?.sampling_interval || 120;
  const changeScore = liveData?.adaptive_decision?.environmental_change || liveData?.environmental_change || 0.0;
  const context = liveData?.adaptive_decision?.context || liveData?.context || "NORMAL";
  const reason = liveData?.adaptive_decision?.reason || liveData?.reason || "Normal agro-environmental monitoring";

  const adaptiveBody = [
    ["Current Adaptive Mode", mode, "Target Sampling Interval", `${interval} seconds`],
    ["Environmental Change Magnitude", `${changeScore} / 10`, "Detected Environmental Context", context],
    ["Dynamic Adaptation Rationale", { content: reason, colSpan: 3 }],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [["Adaptive Parameter", "Current Value", "Metric", "Operating Status"]],
    body: adaptiveBody,
    theme: "grid",
    headStyles: {
      fillColor: [44, 82, 60],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7.5,
      textColor: DARK_TEXT,
      cellPadding: 1.8,
    },
    margin: { left: margin, right: margin },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // -------------------------------------------------------------
  // 4. Alerts & System Notifications
  // -------------------------------------------------------------
  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`4. Real-Time Alerts & System Events (${alerts.length})`, margin, currentY);
  currentY += 2;

  const alertRows = alerts.map((a) => [
    a.severity,
    a.category || "SYSTEM",
    a.title,
    a.reason,
    a.status || "ACTIVE",
    a.timestamp || "Recent",
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [["Severity", "Category", "Alert Title", "Trigger Reason", "Status", "Timestamp"]],
    body: alertRows.length > 0 ? alertRows : [["INFO", "SYSTEM", "All Systems Operational", "No active warnings detected", "RESOLVED", now.toLocaleString()]],
    theme: "striped",
    headStyles: {
      fillColor: [45, 60, 52],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7,
      textColor: DARK_TEXT,
      cellPadding: 1.6,
    },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 18 },
      1: { cellWidth: 26 },
      2: { fontStyle: "bold", cellWidth: 36 },
      3: { cellWidth: 50 },
      4: { cellWidth: 18 },
      5: { cellWidth: 34 },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 0) {
        const val = data.cell.raw;
        if (val === "CRITICAL") {
          data.cell.styles.textColor = CRITICAL_RED;
        } else if (val === "WARNING") {
          data.cell.styles.textColor = WARNING_AMBER;
        } else {
          data.cell.styles.textColor = STABLE_GREEN;
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // -------------------------------------------------------------
  // 5. Actionable Agronomic Recommendations
  // -------------------------------------------------------------
  const recommendations = liveData?.recommendations?.recommendations || [
    "Continue standard adaptive monitoring frequency.",
    "Maintain soil moisture within 40–70% for balanced root respiration.",
    "Monitor ambient temperature during peak sunlight hours.",
  ];

  if (currentY > pageHeight - 45) {
    doc.addPage();
    currentY = margin;
  }

  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("5. Actionable Farm Recommendations", margin, currentY);
  currentY += 4;

  recommendations.forEach((rec, idx) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...FOREST_GREEN);
    doc.text(`[${idx + 1}]`, margin + 2, currentY + 3);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...DARK_TEXT);
    doc.text(rec, margin + 10, currentY + 3);
    currentY += 5.5;
  });

  currentY += 4;

  // -------------------------------------------------------------
  // PAGE 2: Historical Trend Charts & Telemetry Log
  // -------------------------------------------------------------
  doc.addPage();
  currentY = margin;

  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("6. Historical Agro-Environmental Trend Charts", margin, currentY);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED_TEXT);
  doc.text(`Visualized trend analysis over ${rangeLabel} (${filteredHistory.length} recorded telemetry samples)`, margin, currentY + 5);
  currentY += 9;

  // Draw Vector Chart 1: Farm Stability Indices (SSI, MSI, FSI)
  drawVectorLineChart(doc, {
    title: "Farm Stability Indices Trend (0–100 Benchmark Scale)",
    x: margin,
    y: currentY,
    width: contentWidth,
    height: 48,
    data: filteredHistory,
    series: [
      { key: "fsi", name: "FSI (Farm Stability)", color: [28, 98, 54], lineWidth: 0.8 },
      { key: "ssi", name: "SSI (Soil Stability)", color: [46, 139, 87], lineWidth: 0.5 },
      { key: "msi", name: "MSI (Microclimate Stability)", color: [32, 178, 170], lineWidth: 0.5 },
    ],
    yDomain: [0, 100],
    yUnit: "",
  });

  currentY += 56;

  // Draw Vector Chart 2: Microclimate & Soil Moisture Trends
  drawVectorLineChart(doc, {
    title: "Microclimate & Soil Parameters Trend",
    x: margin,
    y: currentY,
    width: contentWidth,
    height: 48,
    data: filteredHistory,
    series: [
      { key: "temperature", name: "Temperature (°C)", color: [220, 80, 50], lineWidth: 0.7 },
      { key: "humidity", name: "Humidity (%)", color: [40, 140, 200], lineWidth: 0.7 },
      { key: "soil_moisture", name: "Soil Moisture (%)", color: [46, 139, 87], lineWidth: 0.7 },
    ],
    yDomain: [0, 100],
    yUnit: "",
  });

  currentY += 56;

  // -------------------------------------------------------------
  // Historical Telemetry Table
  // -------------------------------------------------------------
  doc.setTextColor(...DARK_TEXT);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("7. Recorded Telemetry History Table", margin, currentY);
  currentY += 2;

  const sampleLimit = 40; // Most recent samples in the selected range
  const tableData = filteredHistory.slice(-sampleLimit).map((item, idx) => {
    let timeStr = `#${idx + 1}`;
    if (item.timestamp) {
      try {
        timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      } catch {
        timeStr = item.timestamp.slice(11, 19);
      }
    }
    return [
      timeStr,
      item.soil_moisture != null ? `${Number(item.soil_moisture).toFixed(1)}%` : "—",
      item.temperature != null ? `${Number(item.temperature).toFixed(1)}°C` : "—",
      item.humidity != null ? `${Number(item.humidity).toFixed(1)}%` : "—",
      item.light != null ? `${Number(item.light).toFixed(0)} lx` : "—",
      item.rain ? "Wet" : "Dry",
      item.fsi != null ? `${item.fsi}` : "100",
      item.sampling_interval ? `${item.sampling_interval}s` : "120s",
      item.battery != null ? `${Number(item.battery).toFixed(0)}%` : "—",
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [["Time", "Soil", "Temp", "Humidity", "Light", "Rain", "FSI", "Interval", "Battery"]],
    body: tableData.length > 0 ? tableData : [["No historical telemetry recorded", "—", "—", "—", "—", "—", "—", "—", "—"]],
    theme: "striped",
    headStyles: {
      fillColor: FOREST_GREEN,
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 6.8,
      textColor: DARK_TEXT,
      cellPadding: 1.4,
    },
    margin: { left: margin, right: margin },
  });

  // -------------------------------------------------------------
  // Running Page Footers (Page X of Y)
  // -------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER_COLOR);
    doc.setLineWidth(0.3);
    doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED_TEXT);
    doc.text(
      "SmartFarm Adaptive AI Agro-Environmental Monitoring System — Confidential Farm Intelligence Report",
      margin,
      pageHeight - 5
    );
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth - margin - 18,
      pageHeight - 5
    );
  }

  // -------------------------------------------------------------
  // Save / Trigger Download
  // -------------------------------------------------------------
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `SmartFarm_Report_${dateStr}_${timeStr}.pdf`;
  doc.save(filename);
  return filename;
}

/**
 * High-Resolution Vector Chart Drawing in jsPDF
 * Renders scalable, crystal-clear line charts with axes, grids, point markers, and legends.
 */
function drawVectorLineChart(doc, { title, x, y, width, height, data, series, yDomain = [0, 100], yUnit = "" }) {
  const chartLeft = x + 12;
  const chartRight = x + width - 6;
  const chartTop = y + 10;
  const chartBottom = y + height - 8;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;

  // Box background
  doc.setFillColor(250, 253, 251);
  doc.setDrawColor(218, 228, 222);
  doc.setLineWidth(0.3);
  doc.roundedRect(x, y, width, height, 1.5, 1.5, "FD");

  // Chart Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(28, 48, 36);
  doc.text(title, x + 4, y + 6);

  // Series Legends at top right
  let legendX = x + width - 4;
  for (let s = series.length - 1; s >= 0; s--) {
    const item = series[s];
    const textWidth = doc.getTextWidth(item.name);
    legendX -= textWidth + 10;

    doc.setFillColor(...item.color);
    doc.circle(legendX - 2, y + 5, 1.2, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(60, 75, 68);
    doc.text(item.name, legendX + 1, y + 6.2);
  }

  // Draw Grid lines & Y-axis labels
  const yMin = yDomain[0];
  const yMax = yDomain[1];
  const gridSteps = 4;

  doc.setDrawColor(230, 238, 233);
  doc.setLineWidth(0.2);

  for (let g = 0; g <= gridSteps; g++) {
    const ratio = g / gridSteps;
    const gridY = chartBottom - ratio * chartHeight;
    const labelVal = Math.round(yMin + ratio * (yMax - yMin));

    doc.line(chartLeft, gridY, chartRight, gridY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120, 135, 126);
    doc.text(`${labelVal}${yUnit}`, chartLeft - 9, gridY + 1.5);
  }

  // Draw X and Y Axis borders
  doc.setDrawColor(180, 195, 186);
  doc.setLineWidth(0.4);
  doc.line(chartLeft, chartTop, chartLeft, chartBottom); // Y axis
  doc.line(chartLeft, chartBottom, chartRight, chartBottom); // X axis

  // If no data points, display placeholder text
  if (!data || data.length === 0) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(140, 155, 146);
    doc.text("No historical data points available in the selected range", chartLeft + chartWidth / 2 - 35, chartTop + chartHeight / 2);
    return;
  }

  // Plot Each Series
  series.forEach((s) => {
    doc.setDrawColor(...s.color);
    doc.setFillColor(...s.color);
    doc.setLineWidth(s.lineWidth || 0.6);

    let prevX = null;
    let prevY = null;

    data.forEach((d, i) => {
      let rawVal = d[s.key];
      if (rawVal === undefined || rawVal === null) return;
      const val = Number(rawVal);
      if (!Number.isFinite(val)) return;

      const clampedVal = Math.max(yMin, Math.min(yMax, val));
      const px = data.length === 1
        ? chartLeft + chartWidth / 2
        : chartLeft + (i / (data.length - 1)) * chartWidth;
      const py = chartBottom - ((clampedVal - yMin) / (yMax - yMin)) * chartHeight;

      if (prevX !== null && prevY !== null) {
        doc.line(prevX, prevY, px, py);
      }

      // Draw point marker
      if (data.length <= 35) {
        doc.circle(px, py, 0.8, "F");
      }

      prevX = px;
      prevY = py;
    });
  });

  // Time labels on X Axis
  const firstSample = data[0];
  const lastSample = data[data.length - 1];

  const formatSampleTime = (item) => {
    if (!item?.timestamp) return "";
    try {
      return new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return item.timestamp.slice(11, 16);
    }
  };

  const tFirst = formatSampleTime(firstSample);
  const tLast = formatSampleTime(lastSample);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(110, 125, 116);
  if (tFirst) doc.text(tFirst, chartLeft, chartBottom + 4);
  if (tLast && data.length > 1) doc.text(tLast, chartRight - 10, chartBottom + 4);
}
