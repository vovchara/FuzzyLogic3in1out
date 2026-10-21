// Mobile node firmware: reads the pack voltage through the divider on D34 and
// broadcasts one ESP-NOW packet every SEND_PERIOD_MS. The board runs headless
// off the 2S pack (into VIN only!), so the onboard LED blinks on every send as
// the only sign of life; serial output is debug-only for bring-up over USB.
//
// Arduino IDE, board "ESP32 Dev Module", arduino-esp32 core 3.x.

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// Flash each board with its own id: board #1 = field node #1 in the app,
// wherever that node stands. Ids are positive integers.
#define NODE_ID 1

// D34 is ADC1 and input-only: ADC2 does not work while WiFi is on, and an
// input-only pin cannot be accidentally driven as an output.
constexpr uint8_t BATTERY_PIN = 34;
// 3 x 7.5 kOhm divider: the ADC sees a third of the pack voltage. Trim this
// after checking the divider with the multimeter (measured pack V / debug V).
constexpr float DIVIDER_RATIO = 3.0f;
constexpr int ADC_SAMPLES = 16;

constexpr uint32_t SEND_PERIOD_MS = 200;
constexpr uint8_t ESPNOW_CHANNEL = 1;
constexpr uint8_t LED_PIN = 2;
constexpr uint32_t LED_FLASH_MS = 20;

// --- Shared with firmware/base/base.ino: keep both copies byte-identical. ---
// Filters out foreign ESP-NOW traffic on a desk full of 2.4 GHz devices.
constexpr uint16_t PACKET_MAGIC = 0xF37A;

typedef struct __attribute__((packed)) {
  uint16_t magic;
  uint8_t node_id;
  uint32_t seq;
  uint16_t voltage_mv;
  uint32_t t_tx_ms;
} TelemetryPacket;
// ---------------------------------------------------------------------------

// Broadcast instead of pairing with the station's MAC: any board can serve as
// the station, and without MAC-level retries a lost packet stays lost, so the
// delivery the station logs is the real channel, not the retry budget.
const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

uint32_t seq = 0;
uint32_t lastSendMs = 0;
uint32_t ledOffMs = 0;

// Median-free mean of a few calibrated reads keeps the value steady; the
// divider's 5 kOhm output impedance is already in the ADC's comfort zone.
uint16_t readBatteryMv() {
  uint32_t sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) sum += analogReadMilliVolts(BATTERY_PIN);
  return (uint16_t)(sum / ADC_SAMPLES * DIVIDER_RATIO);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  analogSetPinAttenuation(BATTERY_PIN, ADC_11db);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.setSleep(false);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (esp_now_init() != ESP_OK) {
    Serial.println("esp_now_init failed, restarting");
    delay(1000);
    ESP.restart();
  }
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, BROADCAST, sizeof(BROADCAST));
  peer.channel = ESPNOW_CHANNEL;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  esp_now_add_peer(&peer);

  Serial.printf("node %d up, sending every %lu ms\n", NODE_ID, (unsigned long)SEND_PERIOD_MS);
}

void loop() {
  uint32_t now = millis();
  if (ledOffMs != 0 && (int32_t)(now - ledOffMs) >= 0) {
    digitalWrite(LED_PIN, LOW);
    ledOffMs = 0;
  }
  if (now - lastSendMs < SEND_PERIOD_MS && seq != 0) return;
  lastSendMs = now;

  TelemetryPacket pkt;
  pkt.magic = PACKET_MAGIC;
  pkt.node_id = NODE_ID;
  pkt.seq = ++seq;
  pkt.voltage_mv = readBatteryMv();
  pkt.t_tx_ms = millis();
  esp_now_send(BROADCAST, (const uint8_t *)&pkt, sizeof(pkt));

  digitalWrite(LED_PIN, HIGH);
  ledOffMs = pkt.t_tx_ms + LED_FLASH_MS;
  Serial.printf("sent seq=%lu voltage=%.2f\n", (unsigned long)pkt.seq, pkt.voltage_mv / 1000.0f);
}
