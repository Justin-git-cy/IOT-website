# PharmaGuard Enterprise — IoT Cold-Chain Surveillance Platform

> **Continuous multi-factor thermal surveillance, automated failure diagnostics, and cryptographic chain-of-custody logging for life-saving pharmaceuticals and biologics.**

---

## 🧊 Executive Overview & Problem Architecture

Perishable pharmaceuticals—such as mRNA vaccines, insulin, monoclonal antibodies, and blood plasma—must strictly remain within the prescribed **+2.0°C to +8.0°C** thermal envelope. Thermal excursions cause irreversible protein denaturation, rendering doses inactive without visible degradation.

Traditional commercial temperature loggers cost **$100 to $300 (₹8,000–₹25,000)** per unit and function merely as passive digital thermometers, logging readings after damage has already occurred without alerting staff to *why* the unit failed.

### PharmaGuard Capabilities:
- **Intelligent Edge Sensing:** Continuous 1-Wire DS18B20 digital thermal monitoring and hermetic door barrier sensing.
- **Root-Cause Diagnostic Engine:** Distinguishes in real time between **Operator Negligence (Door Ajar)**, **Utility Blackout (Power Cut)**, and **Mechanical Cooling Failure (Compressor Degradation)**.
- **The Spoilage Clock:** Accumulates exact thermal exposure duration with network-jitter gap capping (60s threshold) and automatic safety dispositioning (`SAFE`, `CAUTION`, `QUARANTINE`).
- **Cryptographic Chain of Custody:** Every packet is immutably recorded via a sequential **SHA-256 Merkle chain**, ensuring compliance with **FDA 21 CFR Part 11** and **WHO Good Distribution Practice (GDP)**.
- **Autonomous Local Failsafe:** Local OLED display mirror and active piezo audio alarm operate independently on the hardware node—ensuring network dropouts never silence a critical alarm.

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** LTS (v18+ or v26+)
- **Visual Studio Code** (Extensions configured in `.vscode/extensions.json`)

### 2. Execution
Open your terminal in the project directory:
```powershell
# Navigate into project directory
cd "C:\Visual Studio\IOT website"

# Install production dependencies
npm install

# Launch backend server
npm start
```
The console will be accessible at:
👉 **`http://localhost:3000`**

### 3. Pre-Configured Personnel Access
| Role | Email | Password | Personnel Name |
| :--- | :--- | :--- | :--- |
| **Chief Quality Officer** | `admin@pharmachain.com` | `Admin@123` | Dr. Sarah Jenkins |
| **Clinical Storage Director** | `demo@pharmachain.com` | `Demo@123` | Marcus Vance |

---

## 🧭 Platform Navigation & Architecture

| URL Route | Interface | Functional Overview |
| :--- | :--- | :--- |
| `/` | **Enterprise Homepage** | Clinical overview, live edge preview, diagnostic rules breakdown, and compliance specifications. |
| `/dashboard` | **Clinical Monitor** | Real-time dual-limit thermal curve, live diagnostic banner, Spoilage Clock, and OLED display mirror. |
| `/simulator` | **Diagnostics Lab** | Test bench with manual calibration sliders and one-click test vectors (Door Ajar, Grid Outage, Compressor Slope). |
| `/audit` | **Chain of Custody** | Immutable SHA-256 block ledger, live tamper detection testing, and ledger integrity verification. |
| `/hardware` | **Hardware & Schematics** | Bill of Materials (BOM), ESP32 pinout diagram, production Arduino C++ firmware, and calibration protocols. |
| `/api/report.pdf`| **Compliance Certificate** | Downloadable FDA 21 CFR Part 11 compliant audit PDF generated dynamically via `pdfkit`. |

---

## 🧠 Root-Cause Diagnostic Logic

```javascript
// Multi-Factor Diagnostic Rule Engine
if (r.temp < 2.0) return { level: 'warn', cause: 'Freezing Hazard (< 2.0°C)' };
if (r.temp <= 8.0) return { level: 'ok', cause: 'Compliant (+2.0°C to +8.0°C)' };
if (r.door) return { level: 'alert', cause: 'Door Left Ajar (Thermal Breach)' };
if (!r.mains) return { level: 'alert', cause: 'Mains Grid Power Failure' };
if (rising) return { level: 'alert', cause: 'Compressor Cooling System Failure' };
return { level: 'warn', cause: 'Thermal Excursion (Unassigned Cause)' };
```

---

## 🔌 Hardware Schematics (ESP32-WROOM-32)

| Pin | Connection | Specification |
| :--- | :--- | :--- |
| **GPIO4** | DS18B20 1-Wire Data | 4.7 kΩ pull-up resistor to 3.3V |
| **GPIO14** | Magnetic Reed Switch | Configured with internal `INPUT_PULLUP` to GND |
| **GPIO21** | I2C SDA (0.96" SSD1306) | Local Visual Display Bus |
| **GPIO22** | I2C SCL (0.96" SSD1306) | Local Visual Display Clock |
| **GPIO18** | Active Piezo Buzzer | Local Hardware Failsafe Alarm |
| **GPIO25** | Green Status LED | Compliant Target Indicator (220 Ω) |
| **GPIO26** | Red Alert LED | Thermal Breach Warning (220 Ω) |
| **GPIO34** | AC Mains Voltage Divider | Grid Line Sensing ADC |

---

## 🛠️ Visual Studio Code Development Tools

Recommended extensions configured in `.vscode/extensions.json`:
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **Live Server** (`ritwickdey.liveserver`)
- **REST Client** (`humao.rest-client`) — Execute API test suites directly in `api.http`
- **Path IntelliSense** (`christian-kohler.path-intellisense`)
- **Material Icon Theme** (`pkief.material-icon-theme`)
