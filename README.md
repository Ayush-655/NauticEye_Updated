# NauticEye

NauticEye is a maritime oil-spill investigation and visualization prototype.

It provides an interactive interface for examining an oil-spill incident using SAR observations, vessel/AIS data, vessel tracks, timeline replay, and investigation evidence. The current version uses simulated data to demonstrate the complete investigation workflow.

## How It Works

NauticEye is structured around an investigation workflow:

```text
Incident
   ↓
SAR Detection
   ↓
Vessel Correlation
   ↓
Track Analysis
   ↓
Closest Approach
   ↓
Investigation & Evidence
```

The application brings these stages together in a single map-based interface instead of treating detection and investigation as separate systems.

## Features

### Incident Investigation

* Select and inspect an incident
* View incident details and detection time
* Track the current investigation stage
* Navigate between different investigation views

### SAR Detection

The SAR view provides a visual representation of the detected spill area.

It includes:

* SAR acquisition view
* Detection region
* Segmentation/mask visualization
* Detection highlighting
* Animated scan and detection effects

### Vessel & AIS Analysis

Vessel information can be examined alongside the detected spill.

The interface provides:

* Vessel selection and highlighting
* Vessel tracks
* AIS timestamps
* Vessel type and flag information
* Vessel operational details
* Closest-approach analysis

### Investigation Replay

The incident can be reviewed across a **56-hour timeline**.

Replay controls include:

* 1×, 2× and 3× playback
* Timeline scrubbing
* Stage-based progression
* Automatic investigation progression

### Interactive Map

The map provides a combined view of the incident and related evidence.

It can display:

* Spill location
* Spill footprint
* SAR detection area
* Vessel positions
* Vessel tracks
* Investigation markers
* Geographic information

### Analysis

The analysis section brings together information related to the selected incident and vessel.

It includes:

* Investigation evidence
* Vessel correlation
* Closest approach
* Drift information
* Location comparison
* System status

The drift information in the current prototype is illustrative and should not be interpreted as an actual spill-origin prediction.

### Location Comparison

The prototype provides a comparison between the detected location and a reference location.

The interface shows:

* Detected SAR coordinates
* Reference coordinates
* Distance between locations
* Bearing
* Agreement status

The reference location is simulated in the current demonstration.

### Data Export

Investigation data can be exported in several formats:

* HTML
* JSON
* CSV
* GeoJSON

## Data & Prototype Status

The current version uses simulated data for parts of the investigation pipeline.

This allows the complete interface and investigation workflow to be demonstrated without requiring live connections to satellite, AIS, or other external data sources.

Simulated values are used where real data is not currently connected, and the application identifies these areas accordingly.

## Tech Stack

* **Next.js 16**
* **React 19**
* **TypeScript**
* **Tailwind CSS**
* **Leaflet**
* **Lucide React**
* **shadcn**
* **pnpm**

## Project Structure

```text
NauticEye_Updated/
│
├── app/                    # Application pages and routes
├── components/             # UI components
├── lib/                    # Application and investigation logic
├── public/                  # Static assets
│
├── NAUTICEYE_UPDATES.md    # Development notes
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── next.config.mjs
├── tsconfig.json
└── README.md
```

## Running Locally

### Requirements

Make sure you have:

* Node.js
* pnpm
* Git

### 1. Clone the repository

```bash
git clone https://github.com/Ayush-655/NauticEye_Updated.git
```

### 2. Enter the project directory

```bash
cd NauticEye_Updated
```

### 3. Install dependencies

```bash
pnpm install
```

### 4. Start the development server

```bash
pnpm dev
```

The terminal should display a local address, normally:

```text
http://localhost:3000
```

Open that address in your browser.

### If `pnpm dev` does not start correctly

If pnpm reports that packages need build-script approval, run:

```bash
pnpm approve-builds
```

Follow the prompts shown in the terminal and then run:

```bash
pnpm dev
```

### Production build

To create a production build:

```bash
pnpm build
```

To start the production version:

```bash
pnpm start
```

## Prototype Scope

NauticEye is currently a prototype focused on the **investigation and visualization workflow**.

The current implementation does not represent a complete operational oil-spill monitoring system. Some data and analytical outputs are simulated for demonstration purposes.

The architecture is intended to allow these simulated inputs to be replaced or supplemented with real data sources in future versions.

## Future Integration

Potential integrations include:

* SAR satellite imagery
* AIS vessel data
* Real geographic datasets
* Oil-spill segmentation models
* Automated detection pipelines
* External maritime data services

These integrations would allow the existing investigation workflow to operate on real observations.

## Development Notes

Development changes and implementation notes are maintained in:

[`NAUTICEYE_UPDATES.md`](./NAUTICEYE_UPDATES.md)

## License

This project is licensed under the MIT License.
