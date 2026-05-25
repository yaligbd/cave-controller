#include <string.h>
#include <stdint.h>
#include <stdbool.h>

#include "app.h"
#include "FreeRTOS.h"
#include "task.h"
#include "param.h"
#include "log.h"
#include "commander.h"
#include "usec_time.h"

#define DEBUG_MODULE "APP_MISSION"
#include "debug.h"

#define MISSION_RATE_HZ 10
#define MAX_LOG_POINTS 1000 // 100 seconds at 10Hz

// Parameter variables exposed to CRTP
static uint8_t mission_state = 0; // 0=IDLE, 1=FLYING, 2=LANDING, 4=RTH
static uint16_t mission_timer = 0; // Duration in seconds
static uint8_t mission_rth = 0;    // 0=Land immediately, 1=RTH

// Dynamic Tuning Parameters
static float mission_kp_wall = 0.0015f;
static float mission_kp_ceiling = 0.0010f;
static uint16_t mission_target_wall = 400; // mm
static uint16_t mission_target_ceiling = 500; // mm
static float mission_max_v = 0.2f; // m/s

// SRAM Logging Structure
typedef struct {
    int16_t x;
    int16_t y;
    int16_t z;
} point3d_t;

static point3d_t flight_log[MAX_LOG_POINTS];
static uint16_t log_index = 0;

// Log IDs for reading the kalman state estimator
static logVarId_t logIdX = 0;
static logVarId_t logIdY = 0;
static logVarId_t logIdZ = 0;

// Log IDs for reading the Multi-ranger deck
static logVarId_t logIdRangeFront = 0;
static logVarId_t logIdRangeRight = 0;
static logVarId_t logIdRangeUp = 0;

// App initialization
void appInit() {
    logIdX = logGetVarId("stateEstimate", "x");
    logIdY = logGetVarId("stateEstimate", "y");
    logIdZ = logGetVarId("stateEstimate", "z");
    logIdRangeFront = logGetVarId("range", "front");
    logIdRangeRight = logGetVarId("range", "right");
    logIdRangeUp = logGetVarId("range", "up");
    DEBUG_PRINT("App Initialized. Waiting for mission.state == 1\n");
}

// Helper to send priority commander setpoints (Hover/Abs Z)
static void sendHoverSetpoint(float vx, float vy, float z, float yawRate) {
    setpoint_t setpoint;
    memset(&setpoint, 0, sizeof(setpoint_t));
    setpoint.mode.x = modeVelocity;
    setpoint.mode.y = modeVelocity;
    setpoint.mode.z = modeAbs;
    setpoint.mode.yaw = modeVelocity;
    
    setpoint.velocity.x = vx;
    setpoint.velocity.y = vy;
    setpoint.position.z = z;
    setpoint.attitudeRate.yaw = yawRate;
    
    commanderSetSetpoint(&setpoint, 3);
}

// Helper to send complete Velocity setpoints (for Ceiling following)
static void sendVelocitySetpoint(float vx, float vy, float vz, float yawRate) {
    setpoint_t setpoint;
    memset(&setpoint, 0, sizeof(setpoint_t));
    setpoint.mode.x = modeVelocity;
    setpoint.mode.y = modeVelocity;
    setpoint.mode.z = modeVelocity;
    setpoint.mode.yaw = modeVelocity;
    
    setpoint.velocity.x = vx;
    setpoint.velocity.y = vy;
    setpoint.velocity.z = vz;
    setpoint.attitudeRate.yaw = yawRate;
    
    commanderSetSetpoint(&setpoint, 3);
}

// Helper to send Return To Home setpoints
static void sendRTHSetpoint(float x, float y, float vz) {
    setpoint_t setpoint;
    memset(&setpoint, 0, sizeof(setpoint_t));
    setpoint.mode.x = modeAbs;
    setpoint.mode.y = modeAbs;
    setpoint.mode.z = modeVelocity;
    setpoint.mode.yaw = modeVelocity;
    
    setpoint.position.x = x;
    setpoint.position.y = y;
    setpoint.velocity.z = vz;
    setpoint.attitudeRate.yaw = 0.0f;
    
    commanderSetSetpoint(&setpoint, 3);
}

// App Main Task (FreeRTOS)
void appMain() {
    vTaskDelay(M2T(2000)); // Wait for system to settle
    appInit();
    
    uint32_t flight_ticks = 0;
    
    while(1) {
        if (mission_state == 0) {
            // State 0: IDLE
            // Do nothing, wait for parameter change over CRTP
            vTaskDelay(M2T(100)); // Check at 10Hz
        } 
        else if (mission_state == 1) {
            // State 1: FLYING
            DEBUG_PRINT("Mission Started! Timer: %d seconds\n", mission_timer);
            
            // Convert seconds to task loop ticks
            uint32_t total_ticks_target = mission_timer * MISSION_RATE_HZ;
            flight_ticks = 0;
            log_index = 0;
            
            while (flight_ticks < total_ticks_target && mission_state == 1) {
                // Read Multi-ranger distances (in millimeters)
                uint16_t rangeFront = 8000; // Default out-of-range limit
                uint16_t rangeRight = 8000;
                uint16_t rangeUp = 8000;
                
                if (logIdRangeFront != 0 && logIdRangeRight != 0 && logIdRangeUp != 0) {
                    rangeFront = logGetUint(logIdRangeFront);
                    rangeRight = logGetUint(logIdRangeRight);
                    rangeUp = logGetUint(logIdRangeUp);
                }

                // Base flight parameters
                float vx = mission_max_v;    // Forward velocity from tuning parameter
                float vy = 0.0f;    
                float vz = 0.0f;    // Determined by Ceiling logic
                float yawRate = 0.0f;

                // Z-Axis Controller (Ceiling Follower)
                if (rangeUp > 8000) rangeUp = 8000; // Prevent overflow reading
                
                float error_z = (float)rangeUp - (float)mission_target_ceiling; // Positive = too far (ascend), Negative = too close (descend)
                vz = error_z * mission_kp_ceiling;
                
                // Crucial Constraint: Aerodynamic suction prevention
                if (rangeUp < 400) {
                    vz = -0.3f; // Strong descend to break suction
                } else {
                    // Safe velocity caps
                    if (vz > 0.2f) vz = 0.2f;
                    if (vz < -0.2f) vz = -0.2f;
                }

                // Corner Detection (Yaw overriding)
                if (rangeFront < 400) {
                    // Wall in front detected. Stop X/Y and rotate left.
                    vx = 0.0f;
                    vy = 0.0f;
                    yawRate = 90.0f; // Turn left at 90 deg/sec
                } else {
                    // Right-Wall Following P-Controller
                    float error = (float)mission_target_wall - (float)rangeRight; // Positive if too close, negative if too far
                    vy = error * mission_kp_wall;
                    
                    // Cap maximum Y-correction to 0.15 m/s to prevent violent swings
                    if (vy > 0.15f) vy = 0.15f;
                    if (vy < -0.15f) vy = -0.15f;
                }

                // 1. Send calculated Velocity Setpoint (Ceiling + Wall follower)
                sendVelocitySetpoint(vx, vy, vz, yawRate);
                
                // 2. Log Position to SRAM
                if (log_index < MAX_LOG_POINTS && logIdX != 0) {
                    float x = logGetFloat(logIdX);
                    float y = logGetFloat(logIdY);
                    float z = logGetFloat(logIdZ);
                    
                    // Compress floats (meters) into int16_t (millimeters)
                    flight_log[log_index].x = (int16_t)(x * 1000.0f);
                    flight_log[log_index].y = (int16_t)(y * 1000.0f);
                    flight_log[log_index].z = (int16_t)(z * 1000.0f);
                    log_index++;
                }
                
                flight_ticks++;
                vTaskDelay(M2T(1000 / MISSION_RATE_HZ));
            }
            
            // Transition once timer expires based on RTH toggle
            if (mission_rth == 1) {
                mission_state = 4;
            } else {
                mission_state = 2;
            }
        } 
        else if (mission_state == 2) {
            // State 2: LANDING/DONE
            DEBUG_PRINT("Mission Complete. Landing.\n");
            
            // Send gradual landing setpoints
            for (int i = 0; i < 20; i++) {
                sendHoverSetpoint(0.0f, 0.0f, 0.1f, 0.0f); // Drop to 10cm
                vTaskDelay(M2T(100));
            }
            
            // Hand control back / Stop motors
            setpoint_t setpoint;
            memset(&setpoint, 0, sizeof(setpoint_t));
            setpoint.mode.x = modeDisable;
            setpoint.mode.y = modeDisable;
            setpoint.mode.z = modeDisable;
            setpoint.mode.yaw = modeDisable;
            commanderSetSetpoint(&setpoint, 3);
            
            DEBUG_PRINT("Landed. Ready for memory offload. Logged points: %d\n", log_index);
            mission_state = 3; // Keep it from repeating state 2
        }
        else if (mission_state == 4) {
            // State 4: Return To Home (RTH)
            DEBUG_PRINT("Mission Complete. Executing RTH.\n");
            
            while (mission_state == 4) {
                float currentX = 100.0f;
                float currentY = 100.0f;
                
                if (logIdX != 0 && logIdY != 0) {
                    currentX = logGetFloat(logIdX);
                    currentY = logGetFloat(logIdY);
                }
                
                // Calculate distance from 0,0
                float dist_sq = (currentX * currentX) + (currentY * currentY);
                
                if (dist_sq < 0.04f) { // roughly 0.2 meters from origin
                    DEBUG_PRINT("Arrived home. Initiating landing.\n");
                    mission_state = 2; // Transition to standard landing sequence
                    break;
                }
                
                // Command modeAbs to (0,0) and safely descend slightly (-0.05 m/s)
                sendRTHSetpoint(0.0f, 0.0f, -0.05f);
                
                // Keep logging points during RTH
                if (log_index < MAX_LOG_POINTS && logIdX != 0) {
                    float z = logGetFloat(logIdZ);
                    flight_log[log_index].x = (int16_t)(currentX * 1000.0f);
                    flight_log[log_index].y = (int16_t)(currentY * 1000.0f);
                    flight_log[log_index].z = (int16_t)(z * 1000.0f);
                    log_index++;
                }
                
                vTaskDelay(M2T(100));
            }
        }
        else {
             // State 3: Safely idle, wait for app to download memory and reset state.
             vTaskDelay(M2T(500));
        }
    }
}

// Expose variables to CRTP Parameter Subsystem (Port 2)
PARAM_GROUP_START(mission)
  PARAM_ADD_CORE(PARAM_UINT8, state, &mission_state)
  PARAM_ADD_CORE(PARAM_UINT16, timer, &mission_timer)
  PARAM_ADD_CORE(PARAM_UINT8, rth, &mission_rth)
  PARAM_ADD_CORE(PARAM_FLOAT, kp_wall, &mission_kp_wall)
  PARAM_ADD_CORE(PARAM_FLOAT, kp_ceiling, &mission_kp_ceiling)
  PARAM_ADD_CORE(PARAM_UINT16, target_wall, &mission_target_wall)
  PARAM_ADD_CORE(PARAM_UINT16, target_ceiling, &mission_target_ceiling)
  PARAM_ADD_CORE(PARAM_FLOAT, max_v, &mission_max_v)
PARAM_GROUP_STOP(mission)
