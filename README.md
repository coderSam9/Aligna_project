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
```

### Install dependencies:

```bash
pip install -r requirements.txt
```

### ▶️ Run Simulator

```bash
python simulator.py
```

### 🧠 Simulator Notes

- The simulator uses Flask-SocketIO (threading mode)
- No additional async libraries (like eventlet) are required
- Runs on port `5051` by default

---

### ⚠️ Port Configuration Notes

- Backend runs on: `http://127.0.0.1:5050`
- Simulator sends data to: `http://127.0.0.1:5050/api/posture`
- Simulator Socket.IO server runs on: `http://localhost:5051`

#### Common Issue

If you see errors like:
ECONNREFUSED 127.0.0.1:5050

👉 This means the backend is not running or is running on a different port.

#### Fix

- Always start the backend before running the simulator
- Verify backend port in `server.js`:

````js
const PORT = process.env.PORT || 5050;

If you change the backend port, update this in simulator.py:
BACKEND_URL = "http://127.0.0.1:5050/api/posture"

---

## 4️⃣ Frontend Setup (React Dashboard)

```bash
cd dashboard
npm install
````

### 🔐 Create `.env`

```env
VITE_API_URL=http://127.0.0.1:5050
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
1. Backend (Node.js)
2. Simulator (Python)
3. Frontend (React)
```

---

## 🌐 API Endpoints

### POST `/api/posture`

Send posture data:

```json
{
  "deviceId": "POSTURE_01",
  "angle": 58.91,
  "fatigueLevel": 55.1,
  "postureStatus": "bad",
  "poseData": {
     "l_shoulder": [-0.4308, 1.3871, 0.9818],
     "r_shoulder": [-0.0308, 0.6128, 0.9818],
     "l_hip": [-0.2, 0, 0],
     "r_hip": [0.2, 0, 0]
   },
 "timestamp": "2026-04-08T12:29:30.777671"
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
