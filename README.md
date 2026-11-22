# Pharma Cold-Chain Monitor: 4-Day Build Plan (IoT Platform)

> **"An ESP32 device inside a medicine fridge that logs temperature and door state, shows them on a small screen, uploads to a live app, and tells you WHY a fridge is failing: door left open, power cut, or compressor failure."**
> — *Sumukh, 4-Day Build Plan (22 Nov to 25 Nov 2026)*

---

## 🧊 Overview & Problem Statement

India loses an estimated **₹92,000 crore** of perishable goods every year to cold chain failures. Vaccines and critical biologics must strictly stay between **+2°C and +8°C**.
Commercial pharma data loggers cost **₹5,000 to ₹20,000** per unit and only record numbers after the damage is done.

Our prototype:
- Costs roughly **₹1,500** (~$18 USD)
- Alerts in real-time (< 1.5s delay)
- Diagnoses the physical root cause (Human Error vs Grid Power Failure vs Mechanical Compressor Breakdown)
- Tracks cumulative **Spoilage Clock**
- Guarantees data integrity via a cryptographic **Tamper-Evident SHA-256 Hash Chain**
- Exports audit-ready **PDF Compliance Reports**

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- **Node.js** LTS (v18+ or v26+)
- **Visual Studio Code** (Extensions automatically configured in `.vscode/extensions.json`)

### 2. Install & Run
Open terminal in the project directory:
```powershell
# Install dependencies
npm install

# Start Express server
npm start
```
The server will start at:
👉 **`http://localhost:3000`**

### 3. Default Credentials
| Account | Email | Password | Role |
| :--- | :--- | :--- | :--- |
| **Lead / Admin** | `admin@pharmachain.com` | `Admin@123` | Lead Engineer (Sumukh) |
| **Quality Auditor** | `demo@pharmachain.com` | `Demo@123` | Dr. Anita Rao |

---

## 🧭 Web Application Pages

| URL | Page | Description |
| :--- | :--- | :--- |
| `/` | **Landing Page** | The ₹92k Cr problem statement, live ESP32 preview, rule overview, and BOM. |
| `/dashboard` | **Live Monitor** | Dual-axis temperature chart (2–8°C safe zone), Wow-moment Diagnosis Card, Spoilage Clock, and OLED mirror. |
| `/simulator` | **Virtual Test Lab** | Slider controls (temp, door, mains) and 1-click execution for all 6 scenarios from the build plan. |
| `/audit` | **Hash Chain Explorer** | SHA-256 chained block ledger, live tamper injection test, and repair function. |
| `/hardware` | **Hardware & Wiring** | BOM table (~₹1,500), ESP32 pinout diagram, full Arduino C++ firmware, and Wokwi setup. |
| `/presentation`| **Slides & Viva Prep** | 8-slide presentation deck (gold & teal theme) + 5 Viva Q&A flashcards directly from Page 12. |
| `/api/report.pdf`| **PDF Compliance Report** | Real-time audit PDF generated via `pdfkit` detailing excursions & cryptographic verification. |

---

## 🧠 Diagnosis Rules Engine (The Wow Moment)

```javascript
// Rule Engine from Page 8 of PDF
if (r.temp < 2.0) return { level: 'warn', cause: 'Freezing risk' };
if (r.temp <= 8.0) return { level: 'ok', cause: 'Normal' };
if (r.door) return { level: 'alert', cause: 'Door left open' };
if (!r.mains) return { level: 'alert', cause: 'Power cut' };
if (rising) return { level: 'alert', cause: 'Possible compressor failure' };
return { level: 'warn', cause: 'Temperature high, cause unclear' };
```

---

## ⚡ Superstar Features

### 1. Spoilage Clock
- Tracks cumulative seconds spent above 8°C.
- Gap capping: Time intervals are capped at 60s so temporary Wi-Fi drops do not artificially inflate the excursion total.
- Clear status verdicts:
  - **SAFE** (< 50% budget)
  - **CAUTION** (50%–99% budget)
  - **QUARANTINE: DO NOT USE** (100%+ budget)
- Switchable budget (30 minutes real vs 2 minutes demo mode).

### 2. Tamper-Evident SHA-256 Hash Chain
- Every reading is stored with: `hash = sha256(prev_hash + JSON.stringify(reading))`
- Modifying any past temperature record instantly breaks the downstream chain.
- Built-in demonstration: `POST /api/tamper/:i` alters an old record to show the app badge turn red live!

---

## 🔌 Hardware Wiring (ESP32 Pins)

| Pin | Connection | Function |
| :--- | :--- | :--- |
| **GPIO4** | DS18B20 Data (4.7 kΩ pull-up to 3.3V) | Waterproof Temperature Probe |
| **GPIO14** | Reed Switch (`INPUT_PULLUP` to GND) | Magnetic Door Sensor (Closed = Shut) |
| **GPIO21** | I2C SDA (0.96" SSD1306 OLED) | Local Visual Display (Line 1: Temp, Line 2: Door, Line 3: Status) |
| **GPIO22** | I2C SCL (0.96" SSD1306 OLED) | Local Visual Display Clock |
| **GPIO18** | Active Buzzer | Local Hardware Failsafe Alarm |
| **GPIO25** | Green LED (220 Ω resistor) | Normal Status Light |
| **GPIO26** | Red LED (220 Ω resistor) | Out-of-Range Alarm Light |
| **GPIO34** | Mains Voltage Divider (ADC) | Power-Cut Detection |

---

## 🛠️ VS Code Development Setup

Recommended extensions installed and ready in `.vscode/extensions.json`:
- **ESLint** (`dbaeumer.vscode-eslint`)
- **Prettier** (`esbenp.prettier-vscode`)
- **Live Server** (`ritwickdey.liveserver`)
- **REST Client** (`humao.rest-client`) — Run tests in `api.http`
- **Auto Rename Tag** (`formulahendry.auto-rename-tag`)
- **Path IntelliSense** (`christian-kohler.path-intellisense`)
- **Material Icon Theme** (`pkief.material-icon-theme`)

---

## ⚠️ Honest Prototype Caveat

*This is a functional prototype with a hobby-grade DS18B20 sensor (±0.5°C), not a certified medical device. The compressor rule is an algorithmic heuristic based on a steady slope rather than refrigerant line pressure.*
