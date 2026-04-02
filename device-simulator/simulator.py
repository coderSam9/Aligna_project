import eventlet
eventlet.monkey_patch()
import random
import time
import requests
from datetime import datetime
from flask import Flask
from flask_socketio import SocketIO
import threading

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# Configuration
DEVICE_ID = "POSTURE_01"
BAD_POSTURE_THRESHOLD = 30
BAD_POSTURE_TIME = 5
BACKEND_URL = "http://127.0.0.1:5050/api/posture"

# Simulation parameters
fatigue = 0
time_counter = 0
break_interval = 60
noise_range = (-2, 2)

USER_TYPE = "normal"

bad_posture_counter = 0
current_angle = 15


def fatigue_growth():
    global fatigue
    if USER_TYPE == "disciplined":
        fatigue += 0.05
    elif USER_TYPE == "normal":
        fatigue += 0.1
    else:
        fatigue += 0.15


def simulate_recovery():
    global fatigue, current_angle
    fatigue = max(0, fatigue - 8)
    current_angle = random.uniform(12, 18)


def generate_angle():
    global current_angle, fatigue

    drift = random.uniform(-1.5, 1.5)
    fatigue_effect = fatigue * 0.6

    target_angle = current_angle + drift + fatigue_effect
    target_angle = max(10, min(60, target_angle))

    current_angle = (current_angle * 0.7) + (target_angle * 0.3)

    noisy_angle = current_angle + random.uniform(*noise_range)
    return noisy_angle


# ✅ MAIN SIMULATION LOOP
def run_simulator():
    global time_counter, bad_posture_counter

    try:
        while True:
            time_counter += 1
            fatigue_growth()

            if time_counter % break_interval == 0:
                simulate_recovery()

            angle = generate_angle()

            if angle > BAD_POSTURE_THRESHOLD:
                bad_posture_counter += 1
            else:
                bad_posture_counter = 0

            posture_status = "bad" if bad_posture_counter >= BAD_POSTURE_TIME else "good"

            # 🔥 Convert angle → poseData
            tilt = angle / 60

            poseData = {
                "l_shoulder": [-0.2, 1, tilt],
                "r_shoulder": [0.2, 1, tilt],
                "l_hip": [-0.2, 0, 0],
                "r_hip": [0.2, 0, 0],
            }

            data = {
                "deviceId": DEVICE_ID,
                "angle": round(angle, 2),
                "fatigueLevel": round(fatigue, 2),
                "postureStatus": posture_status,
                "poseData": poseData,
                "timestamp": datetime.now().isoformat()
            }

            socketio.emit("pose_data", data)

            try:
                requests.post(
                    BACKEND_URL,
                    json=data,
                    timeout=3
                )
                print("Sent:", data)
            except Exception as e:
                print("Error sending data:", e)

            time.sleep(1)

    except KeyboardInterrupt:
        print("\nSimulator stopped manually.")


if __name__ == "__main__":
    threading.Thread(target=run_simulator, daemon=True).start()
    socketio.run(app, host="0.0.0.0", port=5051)