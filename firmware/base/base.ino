// Base station firmware: a radio modem, as the plan puts it — receives an
// ESP-NOW packet, stamps it with the RSSI and the arrival time, and prints one
// CSV line over serial at 115200. All the logic lives on the laptop: the
// header and the line format are EXACTLY the TELEMETRY_HEADER contract from
// src/simulation/telemetry.ts, the single source of truth the parser owns.
//
// Arduino IDE, board "ESP32 Dev Module", arduino-esp32 core 3.x (the receive
// callback takes esp_now_recv_info_t, which carries the RSSI).

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// Must stay byte-identical to TELEMETRY_HEADER in src/simulation/telemetry.ts.
// The parser skips repeated header lines, so reprinting it on every reset is
// part of the contract, not a problem for a capture spanning resets.
constexpr char TELEMETRY_HEADER[] = "node_id,seq,voltage,rssi,t_tx_ms,t_rx_ms";

constexpr uint8_t ESPNOW_CHANNEL = 1;
constexpr uint8_t LED_PIN = 2;

// External 10 mm indicator modules for showing the link live: green flashes on
// every received packet, red lights up when a node's seq skips, i.e. a packet
// was lost on the air. Active high.
constexpr uint8_t RX_LED_PIN = 25;
constexpr uint8_t LOSS_LED_PIN = 26;
constexpr uint32_t RX_FLASH_MS = 30;
constexpr uint32_t LOSS_FLASH_MS = 300;

// --- Shared with firmware/node/node.ino: keep both copies byte-identical. ---
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

// The receive callback runs on the WiFi task, so it only stamps the packet and
// queues it; the serial printing stays in loop() where it cannot delay radio
// reception. Three nodes at 5 packets a second leave the queue nearly empty.
struct Received {
  TelemetryPacket pkt;
  int rssi;
  uint32_t t_rx_ms;
};

constexpr size_t QUEUE_SIZE = 32;
Received queue[QUEUE_SIZE];
volatile size_t qHead = 0;
volatile size_t qTail = 0;
portMUX_TYPE qMux = portMUX_INITIALIZER_UNLOCKED;

void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len != sizeof(TelemetryPacket)) return;
  Received r;
  memcpy(&r.pkt, data, sizeof(r.pkt));
  if (r.pkt.magic != PACKET_MAGIC) return;
  r.rssi = info->rx_ctrl->rssi;
  r.t_rx_ms = millis();
  portENTER_CRITICAL(&qMux);
  size_t next = (qHead + 1) % QUEUE_SIZE;
  if (next != qTail) {
    queue[qHead] = r;
    qHead = next;
  }
  portEXIT_CRITICAL(&qMux);
}

// Last seq seen per node, to spot gaps. Only loop() touches these.
uint32_t lastSeq[256];
bool seenNode[256];
uint32_t rxLedOffMs = 0;
uint32_t lossLedOffMs = 0;

// A seq at or below the last one means the node rebooted and restarted its
// counter, which is not a loss.
bool isGap(const TelemetryPacket &pkt) {
  bool gap = seenNode[pkt.node_id] && pkt.seq > lastSeq[pkt.node_id] + 1;
  seenNode[pkt.node_id] = true;
  lastSeq[pkt.node_id] = pkt.seq;
  return gap;
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  pinMode(RX_LED_PIN, OUTPUT);
  pinMode(LOSS_LED_PIN, OUTPUT);

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.setSleep(false);
  esp_wifi_set_channel(ESPNOW_CHANNEL, WIFI_SECOND_CHAN_NONE);
  if (esp_now_init() != ESP_OK) {
    Serial.println("esp_now_init failed, restarting");
    delay(1000);
    ESP.restart();
  }
  esp_now_register_recv_cb(onReceive);

  Serial.println(TELEMETRY_HEADER);
}

void loop() {
  uint32_t now = millis();
  if (now >= rxLedOffMs) digitalWrite(RX_LED_PIN, LOW);
  if (now >= lossLedOffMs) digitalWrite(LOSS_LED_PIN, LOW);

  while (true) {
    Received r;
    portENTER_CRITICAL(&qMux);
    if (qTail == qHead) {
      portEXIT_CRITICAL(&qMux);
      break;
    }
    r = queue[qTail];
    qTail = (qTail + 1) % QUEUE_SIZE;
    portEXIT_CRITICAL(&qMux);

    Serial.printf("%u,%lu,%.2f,%d,%lu,%lu\n", r.pkt.node_id, (unsigned long)r.pkt.seq,
                  r.pkt.voltage_mv / 1000.0f, r.rssi, (unsigned long)r.pkt.t_tx_ms,
                  (unsigned long)r.t_rx_ms);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));

    digitalWrite(RX_LED_PIN, HIGH);
    rxLedOffMs = millis() + RX_FLASH_MS;
    if (isGap(r.pkt)) {
      digitalWrite(LOSS_LED_PIN, HIGH);
      lossLedOffMs = millis() + LOSS_FLASH_MS;
    }
  }
}
