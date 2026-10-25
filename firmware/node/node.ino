// Mobile node firmware: reads the pack voltage through the divider on D34 and
// broadcasts one ESP-NOW TELEMETRY packet every SEND_PERIOD_MS, carrying what
// it has heard from the other nodes. It also answers the base station's echo
// pings, so the station can time the round trip. The board runs headless off
// the 2S pack (into VIN only!), so the onboard LED blinks on every send as the
// only sign of life; serial output is debug-only for bring-up over USB.
//
// Arduino IDE, board "ESP32 Dev Module", Flash Mode DIO, arduino-esp32 core 3.x.

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
constexpr uint32_t NEIGHBOR_LOG_PERIOD_MS = 1000;
constexpr uint8_t ESPNOW_CHANNEL = 1;
constexpr uint8_t LED_PIN = 2;
constexpr uint32_t LED_FLASH_MS = 20;

// --- Shared with firmware/base/base.ino: keep both copies byte-identical. ---
// Filters out foreign ESP-NOW traffic on a desk full of 2.4 GHz devices.
constexpr uint16_t PACKET_MAGIC = 0xF37A;

enum PacketType : uint8_t {
  PACKET_TELEMETRY = 1,  // node -> broadcast
  PACKET_PING = 2,       // station -> node, unicast
  PACKET_PONG = 3,       // node -> station, unicast
};

// 8 reports keep a full packet at 183 bytes, under ESP-NOW's 250.
constexpr uint8_t MAX_NEIGHBORS = 8;

// Everything is cumulative since the reporter's boot, so a report lost on the
// way to the station costs nothing: the next one carries the full sums, and
// the link's delivery comes from the first and last report of a capture.
typedef struct __attribute__((packed)) {
  uint8_t id;
  uint32_t heard;        // TELEMETRY packets heard from this neighbor
  uint32_t first_seq;    // the neighbor's seq when first heard
  uint32_t last_seq;     // the neighbor's seq when last heard
  int32_t rssi_sum;
  uint32_t rssi_sq_sum;
} NeighborReport;

typedef struct __attribute__((packed)) {
  uint16_t magic;
  uint8_t type;
  uint8_t node_id;
  uint32_t seq;
  uint16_t voltage_mv;
  uint32_t t_tx_ms;
  uint8_t neighbor_count;
  NeighborReport neighbors[MAX_NEIGHBORS];  // only neighbor_count are sent
} TelemetryPacket;

constexpr size_t TELEMETRY_HEAD_SIZE = offsetof(TelemetryPacket, neighbors);

typedef struct __attribute__((packed)) {
  uint16_t magic;
  uint8_t type;
  uint8_t node_id;     // PING: the target; PONG: the replying node
  uint32_t ping_seq;
  uint32_t t_ping_us;  // the station's micros() at send, echoed back
} PingPacket;
// ---------------------------------------------------------------------------

// Telemetry goes to broadcast: any board can serve as the station, and without
// MAC-level retries a lost packet stays lost, so the delivery logged is the
// real channel, not the retry budget. Pongs are unicast on purpose (see loop).
const uint8_t BROADCAST[6] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

// Written by the receive callback on the WiFi task, read by loop(): both sides
// hold the mux, and loop() only copies under it.
NeighborReport neighbors[MAX_NEIGHBORS];
uint8_t neighborCount = 0;
bool pingPending = false;
PingPacket pendingPing;
uint8_t stationMac[6];
portMUX_TYPE rxMux = portMUX_INITIALIZER_UNLOCKED;

bool stationPeerAdded = false;
uint32_t seq = 0;
uint32_t lastSendMs = 0;
uint32_t lastNeighborLogMs = 0;
uint32_t ledOffMs = 0;

// Median-free mean of a few calibrated reads keeps the value steady; the
// divider's 5 kOhm output impedance is already in the ADC's comfort zone.
uint16_t readBatteryMv() {
  uint32_t sum = 0;
  for (int i = 0; i < ADC_SAMPLES; i++) sum += analogReadMilliVolts(BATTERY_PIN);
  return (uint16_t)(sum / ADC_SAMPLES * DIVIDER_RATIO);
}

// A table full of neighbors ignores newcomers rather than evicting: a report
// that changes identity mid-capture would read as a reboot to the parser.
void hearNeighbor(uint8_t id, uint32_t neighborSeq, int rssi) {
  NeighborReport *n = nullptr;
  for (uint8_t i = 0; i < neighborCount; i++) {
    if (neighbors[i].id == id) n = &neighbors[i];
  }
  if (n == nullptr) {
    if (neighborCount == MAX_NEIGHBORS) return;
    n = &neighbors[neighborCount++];
    *n = {};
    n->id = id;
    n->first_seq = neighborSeq;
  }
  n->heard++;
  n->last_seq = neighborSeq;
  n->rssi_sum += rssi;
  n->rssi_sq_sum += (uint32_t)(rssi * rssi);
}

void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  if (len < 3) return;
  uint16_t magic;
  memcpy(&magic, data, sizeof(magic));
  if (magic != PACKET_MAGIC) return;
  uint8_t type = data[2];

  if (type == PACKET_TELEMETRY && len >= (int)TELEMETRY_HEAD_SIZE) {
    TelemetryPacket pkt;
    memcpy(&pkt, data, TELEMETRY_HEAD_SIZE);
    if (pkt.node_id == NODE_ID) return;
    portENTER_CRITICAL(&rxMux);
    hearNeighbor(pkt.node_id, pkt.seq, info->rx_ctrl->rssi);
    portEXIT_CRITICAL(&rxMux);
    return;
  }
  // Sending from here would block the WiFi task the reply has to go out on,
  // so the ping is only noted and loop() answers it.
  if (type == PACKET_PING && len == sizeof(PingPacket)) {
    PingPacket ping;
    memcpy(&ping, data, sizeof(ping));
    if (ping.node_id != NODE_ID) return;
    portENTER_CRITICAL(&rxMux);
    pendingPing = ping;
    memcpy(stationMac, info->src_addr, sizeof(stationMac));
    pingPending = true;
    portEXIT_CRITICAL(&rxMux);
  }
}

void addPeer(const uint8_t *mac) {
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, mac, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  esp_now_add_peer(&peer);
}

// A unicast pong gets ESP-NOW's MAC-level retries, and that is the point: on a
// weak link the retries stretch the round trip, which is the same delay the
// app's channel model derives from delivery.
void answerPing() {
  PingPacket pong;
  uint8_t mac[6];
  portENTER_CRITICAL(&rxMux);
  bool pending = pingPending;
  pingPending = false;
  pong = pendingPing;
  memcpy(mac, stationMac, sizeof(mac));
  portEXIT_CRITICAL(&rxMux);
  if (!pending) return;

  if (!stationPeerAdded) {
    addPeer(mac);
    stationPeerAdded = true;
  }
  pong.type = PACKET_PONG;
  pong.node_id = NODE_ID;
  esp_now_send(mac, (const uint8_t *)&pong, sizeof(pong));
}

void sendTelemetry(uint32_t now) {
  TelemetryPacket pkt;
  pkt.magic = PACKET_MAGIC;
  pkt.type = PACKET_TELEMETRY;
  pkt.node_id = NODE_ID;
  pkt.seq = ++seq;
  pkt.voltage_mv = readBatteryMv();
  portENTER_CRITICAL(&rxMux);
  pkt.neighbor_count = neighborCount;
  memcpy(pkt.neighbors, neighbors, neighborCount * sizeof(NeighborReport));
  portEXIT_CRITICAL(&rxMux);
  pkt.t_tx_ms = millis();
  size_t len = TELEMETRY_HEAD_SIZE + pkt.neighbor_count * sizeof(NeighborReport);
  esp_now_send(BROADCAST, (const uint8_t *)&pkt, len);

  digitalWrite(LED_PIN, HIGH);
  ledOffMs = now + LED_FLASH_MS;
  Serial.printf("sent seq=%lu voltage=%.2f\n", (unsigned long)pkt.seq, pkt.voltage_mv / 1000.0f);
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
  addPeer(BROADCAST);
  esp_now_register_recv_cb(onReceive);

  Serial.printf("node %d up, sending every %lu ms\n", NODE_ID, (unsigned long)SEND_PERIOD_MS);
}

// No early returns: a pending ping is answered on every pass, whether or not
// telemetry is due, so the round trip is not padded by the send period.
void loop() {
  answerPing();

  uint32_t now = millis();
  if (ledOffMs != 0 && (int32_t)(now - ledOffMs) >= 0) {
    digitalWrite(LED_PIN, LOW);
    ledOffMs = 0;
  }
  if (now - lastSendMs >= SEND_PERIOD_MS || seq == 0) {
    lastSendMs = now;
    sendTelemetry(now);
  }
  if (now - lastNeighborLogMs >= NEIGHBOR_LOG_PERIOD_MS) {
    lastNeighborLogMs = now;
    Serial.printf("neighbors=%u\n", neighborCount);
  }
}
