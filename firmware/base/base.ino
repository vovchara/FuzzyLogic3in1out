// Base station firmware: a radio modem, as the plan puts it — receives an
// ESP-NOW packet, stamps it with the RSSI and the arrival time, and prints CSV
// over serial at 115200. It also echo-pings the known nodes in turn to time
// the round trip. All the logic lives on the laptop: the header and the line
// formats are EXACTLY the contract from src/simulation/telemetry.ts, the single
// source of truth the parser owns.
//
// Arduino IDE, board "ESP32 Dev Module", Flash Mode DIO, arduino-esp32 core 3.x
// (the receive callback takes esp_now_recv_info_t, which carries the RSSI).

#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>

// Must stay byte-identical to TELEMETRY_HEADER, NEIGHBOR_HEADER and RTT_HEADER
// in src/simulation/telemetry.ts. The parser skips repeated header lines, so
// reprinting them on every reset is part of the contract, not a problem for a
// capture spanning resets. The main line kept its v1 format, so old captures
// stay valid; the tagged lines cannot be mistaken for numeric telemetry.
constexpr char TELEMETRY_HEADER[] = "node_id,seq,voltage,rssi,t_tx_ms,t_rx_ms";
constexpr char NEIGHBOR_HEADER[] =
    "nb,reporter_id,reporter_seq,neighbor_id,heard,first_seq,last_seq,rssi_sum,rssi_sq_sum";
constexpr char RTT_HEADER[] = "rtt,node_id,ping_seq,rtt_us";

constexpr uint8_t ESPNOW_CHANNEL = 1;
constexpr uint8_t LED_PIN = 2;

// One ping every 250 ms, round-robin over the known nodes: five nodes get a
// sample every 1.25 s, a few dozen over a 20-60 s measurement point.
constexpr uint32_t PING_PERIOD_MS = 250;

// External 10 mm indicator modules for showing the link live: green flashes on
// every received telemetry packet, red lights up when a node's seq skips, i.e.
// a packet was lost on the air. Pongs do not touch them. Active high.
constexpr uint8_t RX_LED_PIN = 25;
constexpr uint8_t LOSS_LED_PIN = 22;
constexpr uint32_t RX_FLASH_MS = 30;
constexpr uint32_t LOSS_FLASH_MS = 300;

// --- Shared with firmware/node/node.ino: keep both copies byte-identical. ---
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

// The receive callback runs on the WiFi task, so it only stamps the packet and
// queues it; the serial printing stays in loop() where it cannot delay radio
// reception. One telemetry record expands into its nb lines in loop(), so the
// neighbor tables do not grow the queue: five nodes at 5 packets a second plus
// 4 pongs a second leave it nearly empty.
struct Received {
  uint8_t type;
  uint8_t src_mac[6];
  int rssi;
  uint32_t t_rx_ms;
  uint32_t rtt_us;  // pongs only, stamped on arrival
  union {
    TelemetryPacket telemetry;
    PingPacket pong;
  };
};

constexpr size_t QUEUE_SIZE = 32;
Received queue[QUEUE_SIZE];
volatile size_t qHead = 0;
volatile size_t qTail = 0;
portMUX_TYPE qMux = portMUX_INITIALIZER_UNLOCKED;

void enqueue(const Received &r) {
  portENTER_CRITICAL(&qMux);
  size_t next = (qHead + 1) % QUEUE_SIZE;
  if (next != qTail) {
    queue[qHead] = r;
    qHead = next;
  }
  portEXIT_CRITICAL(&qMux);
}

void onReceive(const esp_now_recv_info_t *info, const uint8_t *data, int len) {
  uint32_t nowUs = micros();
  if (len < 3) return;
  uint16_t magic;
  memcpy(&magic, data, sizeof(magic));
  if (magic != PACKET_MAGIC) return;

  Received r;
  r.type = data[2];
  memcpy(r.src_mac, info->src_addr, sizeof(r.src_mac));
  r.rssi = info->rx_ctrl->rssi;
  r.t_rx_ms = millis();
  r.rtt_us = 0;

  if (r.type == PACKET_TELEMETRY && len >= (int)TELEMETRY_HEAD_SIZE) {
    memcpy(&r.telemetry, data, TELEMETRY_HEAD_SIZE);
    if (r.telemetry.neighbor_count > MAX_NEIGHBORS ||
        len != (int)(TELEMETRY_HEAD_SIZE + r.telemetry.neighbor_count * sizeof(NeighborReport))) {
      return;
    }
    memcpy(&r.telemetry, data, len);
    enqueue(r);
    return;
  }
  if (r.type == PACKET_PONG && len == sizeof(PingPacket)) {
    memcpy(&r.pong, data, sizeof(r.pong));
    r.rtt_us = nowUs - r.pong.t_ping_us;
    enqueue(r);
  }
}

// Per-node state, indexed by node id. Only loop() touches these.
uint32_t lastSeq[256];
bool seenNode[256];
uint8_t nodeMac[256][6];
uint32_t pingSeq[256];
uint8_t knownIds[256];
size_t knownCount = 0;
size_t nextPing = 0;
uint32_t lastPingMs = 0;
uint32_t rxLedOffMs = 0;
uint32_t lossLedOffMs = 0;

// A seq at or below the last one means the node rebooted and restarted its
// counter, which is not a loss.
bool isGap(const TelemetryPacket &pkt) {
  bool gap = seenNode[pkt.node_id] && pkt.seq > lastSeq[pkt.node_id] + 1;
  lastSeq[pkt.node_id] = pkt.seq;
  return gap;
}

// The station learns each node's MAC from its telemetry, so nothing is flashed
// with addresses and any board can still serve as any node.
void rememberNode(const Received &r) {
  uint8_t id = r.telemetry.node_id;
  if (seenNode[id]) return;
  seenNode[id] = true;
  memcpy(nodeMac[id], r.src_mac, 6);
  esp_now_peer_info_t peer = {};
  memcpy(peer.peer_addr, r.src_mac, 6);
  peer.channel = ESPNOW_CHANNEL;
  peer.ifidx = WIFI_IF_STA;
  peer.encrypt = false;
  esp_now_add_peer(&peer);
  knownIds[knownCount++] = id;
}

// Unicast, so ESP-NOW retries at the MAC level: the extra attempts on a weak
// link are part of the measured round trip. A lost ping simply has no rtt
// line; the parser counts the losses from gaps in ping_seq.
void pingNext(uint32_t now) {
  if (knownCount == 0 || now - lastPingMs < PING_PERIOD_MS) return;
  lastPingMs = now;
  uint8_t id = knownIds[nextPing];
  nextPing = (nextPing + 1) % knownCount;
  PingPacket ping;
  ping.magic = PACKET_MAGIC;
  ping.type = PACKET_PING;
  ping.node_id = id;
  ping.ping_seq = ++pingSeq[id];
  ping.t_ping_us = micros();
  esp_now_send(nodeMac[id], (const uint8_t *)&ping, sizeof(ping));
}

void printTelemetry(const Received &r) {
  const TelemetryPacket &p = r.telemetry;
  Serial.printf("%u,%lu,%.2f,%d,%lu,%lu\n", p.node_id, (unsigned long)p.seq,
                p.voltage_mv / 1000.0f, r.rssi, (unsigned long)p.t_tx_ms,
                (unsigned long)r.t_rx_ms);
  for (uint8_t i = 0; i < p.neighbor_count; i++) {
    const NeighborReport &n = p.neighbors[i];
    Serial.printf("nb,%u,%lu,%u,%lu,%lu,%lu,%ld,%lu\n", p.node_id, (unsigned long)p.seq, n.id,
                  (unsigned long)n.heard, (unsigned long)n.first_seq, (unsigned long)n.last_seq,
                  (long)n.rssi_sum, (unsigned long)n.rssi_sq_sum);
  }
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
  Serial.println(NEIGHBOR_HEADER);
  Serial.println(RTT_HEADER);
}

void loop() {
  uint32_t now = millis();
  if (now >= rxLedOffMs) digitalWrite(RX_LED_PIN, LOW);
  if (now >= lossLedOffMs) digitalWrite(LOSS_LED_PIN, LOW);
  pingNext(now);

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

    if (r.type == PACKET_PONG) {
      Serial.printf("rtt,%u,%lu,%lu\n", r.pong.node_id, (unsigned long)r.pong.ping_seq,
                    (unsigned long)r.rtt_us);
      continue;
    }

    bool gap = isGap(r.telemetry);
    rememberNode(r);
    printTelemetry(r);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));

    digitalWrite(RX_LED_PIN, HIGH);
    rxLedOffMs = millis() + RX_FLASH_MS;
    if (gap) {
      digitalWrite(LOSS_LED_PIN, HIGH);
      lossLedOffMs = millis() + LOSS_FLASH_MS;
    }
  }
}
