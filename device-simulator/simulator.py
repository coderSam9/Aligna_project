import random
import time
import requests
from datetime import datetime
from flask import Flask
from flask_socketio import SocketIO
import threading

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# Configuration
DEVICE_ID = "POSTURE_01"
BAD_POSTURE_THRESHOLD = 30
BAD_POSTURE_TIME = 3
BACKEND_URL = "http://127.0.0.1:5050/api/posture"

# Simulation parameters
fatigue = 50
time_counter = 0
break_interval = 300
noise_range = (-2, 2)

USER_TYPE = "lazy"

bad_posture_counter = 0
current_angle = 18
posture_hold_time = 0
current_target = 18


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
    global current_angle, fatigue, posture_hold_time, current_target

    # Determine if we need to shift to a new posture
    if posture_hold_time <= 0:
        # Pick a new hold time between 4 and 15 seconds
        posture_hold_time = random.randint(4, 15)
        
        # 50% chance they actively correct their posture (sit up straight)
        # 50% chance they slump, which is worsened by fatigue
        if random.random() < 0.5:
            current_target = random.uniform(2, 12) # Excellent straight posture
        else:
            drift = random.uniform(5.0, 15.0)
            fatigue_effect = (fatigue / 100.0) * 35.0 
            current_target = 15 + drift + fatigue_effect # Slumped posture
            
        current_target = max(0, min(70, current_target)) # Lowered floor to 0

    # Countdown the hold time
    posture_hold_time -= 1

    # Smoothly transition current_angle toward the current_target over a few seconds
    current_angle = (current_angle * 0.85) + (current_target * 0.15)
    
    # Add very small micro-movements (breathing, small shifts)
    noisy_angle = current_angle + random.uniform(-0.5, 0.5)
    
    # Occasional sudden user movements (adjusting in seat)
    if random.random() < 0.02:
        noisy_angle += random.uniform(-8, 12)
        # Also reset hold time so they settle into a new posture after a sudden shift
        posture_hold_time = 0
        
    return max(-5, min(70, noisy_angle))


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

            if angle > BAD_POSTURE_THRESHOLD:
                posture_status = "bad"
            elif angle > 15 or fatigue > 70:
                posture_status = "warning"
            else:
                posture_status = "good"

            # 🔥 Convert angle → poseData
            tilt = angle / 60
            
            # Generate highly organic human fidgeting, swaying, and asymmetrical leaning
            import time
            import math
            now = time.time()
            sway = math.sin(now * 0.4) * 0.3 # Swaying left to right
            dip = math.cos(now * 0.6) * 0.4  # Slumping one shoulder lower than the other
            
            poseData = {
                "l_shoulder": [-0.2 + sway, 1 + dip, tilt],
                "r_shoulder": [0.2 + sway, 1 - dip, tilt],
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
                    json=data
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