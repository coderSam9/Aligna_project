# 🚀 Aligna — Posture & Fatigue Monitoring System

## 📌 Overview

**Aligna** is a full-stack posture monitoring system that simulates human posture data, processes it through a backend server, and visualizes it in a modern dashboard with a real-time 3D digital twin.

It combines:

- 📊 Analytics Dashboard (React)
- 🧠 Backend API (Node.js + MongoDB)
- 🤖 Device Simulator (Python)
- 🧍 Real-time Digital Twin (Three.js)

---

## 🧠 System Architecture

```
Python Simulator (Socket + HTTP)
        ↓
POST → Backend (Node.js + MongoDB)
        ↓
GET → React Dashboard (Charts & Metrics)
        ↓
Socket → 3D Digital Twin (Real-time Visualization)
```

---

## 🛠 Tech Stack

### Frontend

- React (Vite)
- Recharts (data visualization)
- Three.js + React Three Fiber (3D twin)
- Axios

### Backend

- Node.js
- Express.js
- MongoDB (Mongoose)
- dotenv

### Simulator

- Python
- Flask + Flask-SocketIO
- Eventlet
- Requests

---

## 📂 Project Structure

```
Aligna/
├── backend/
│   ├── server.js
│   ├── db.js
│   ├── package.json
│   └── .env
│
├── dashboard/
│   ├── src/
│   ├── public/
│   ├── package.json
│   ├── vite.config.js
│   └── .env
│
├── device-simulator/
│   ├── simulator.py
│   └── requirements.txt
│
└── README.md
```

---

## ⚙️ Prerequisites

Make sure you have installed:

- Node.js (v16+)
- Python (v3.8+)
- npm or yarn
- MongoDB Atlas account

---

# 🚀 Setup Instructions

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/coderSam9/Aligna_project.git
cd Aligna_project
```

---

## 2️⃣ Backend Setup (Node.js + MongoDB)

```bash
cd backend
npm install
```

### 🔐 Create `.env`

```env
MONGO_URI=your_mongodb_connection_string
PORT=5050
```

### ▶️ Run Backend

```bash
node server.js
```

You should see:

```
✅ MongoDB connected
Server running on port 5050
```

---

## 3️⃣ Device Simulator Setup (Python)

```bash
cd device-simulator
python -m venv venv
```

### Activate environment:

#### Windows:

```bash
venv\Scripts\activate
```

#### Mac/Linux:

```bash
source venv/bin/activate
```

### Install dependencies:

```bash
pip install -r requirements.txt
```

### ▶️ Run Simulator

```bash
python simulator.py
```

### 💡 Alternative (if dependencies already installed)

If you already have required Python packages installed globally, you can run:

```bash
python3 simulator.py
```

✔ Sends posture data every second
✔ Emits real-time socket data

---

## 4️⃣ Frontend Setup (React Dashboard)

```bash
cd dashboard
npm install
```

### 🔐 Create `.env`

```env
VITE_API_URL=http://localhost:5050
VITE_SOCKET_URL=http://localhost:5051
```

### ▶️ Run Frontend

```bash
npm run dev
```

---

# ▶️ Running the Full System (IMPORTANT)

Start services in this exact order:

```bash
1. Backend (Node.js)  --> node .\server.js
2. Simulator (Python) --> py .\simulator.py
3. Frontend (React)   --> npm run dev
```

---

## 🌐 API Endpoints

### POST `/api/posture`

Send posture data:

```json
{
  "deviceId": "POSTURE_01",
  "angle": 17.6,
  "fatigueLevel": 0.8,
  "postureStatus": "good",
  "poseData": {
    "l_shoulder": [-0.2, 1, 0.2770213270787423],
    "r_shoulder": [0.2, 1, 0.2770213270787423],
    "l_hip": [-0.2, 0, 0],
    "r_hip": [0.2, 0, 0]
  },
  "timestamp": "2026-04-02T19:03:31.528182"
}
```

---

### GET `/api/posture`

Returns latest 50 posture records

---

## ⚠️ Troubleshooting

### ❌ Backend not connecting

- Check MongoDB URI
- Ensure IP whitelist (`0.0.0.0/0`)

---

### ❌ Frontend shows "Disconnected"

- Backend not running
- Wrong API URL

---

### ❌ Simulator not sending data

- Ensure backend is running first
- Check port `5050`

---

### ❌ 3D Twin not updating

- Ensure simulator is running
- Check socket port `5051`

---

## 🧹 Important Notes

- Do NOT commit:

  - `node_modules/`
  - `venv/`
  - `.env`

- These are already included in `.gitignore`

---


