const express = require("express");
const bodyParser = require("body-parser");
const mqtt = require("mqtt");
const cors = require("cors");
const low = require("lowdb");
const FileSync = require("lowdb/adapters/FileSync");

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Setup LowDB with FileSync
const adapter = new FileSync("db.json");
const db = low(adapter);

// Set default database structure if not exists
db.defaults({
  sensors: { light: 0, motion: false, current: 0 },
  actuators: { light: "off", socket: "off" },
}).write();

// MQTT Configuration
const mqttOptions = {
  host: "q52b5905.ala.us-east-1.emqxsl.com",
  port: 8883,
  protocol: "mqtts",
  username: "ronny",
  password: "125566aa",
};

const mqttClient = mqtt.connect(mqttOptions);

// MQTT topics
const topics = {
  light: "sensors/light",
  motion: "sensors/motion",
  current: "sensors/current",
  actuator_light: "actuators/light",
  actuator_socket: "actuators/socket",
};

mqttClient.on("connect", () => {
  console.log("✅ MQTT connected");
  mqttClient.subscribe([topics.light, topics.motion, topics.current]);
});

mqttClient.on("message", (topic, message) => {
  const payload = JSON.parse(message.toString());

  if (topic === topics.light) {
    db.set("sensors.light", payload.value).write();
  } else if (topic === topics.motion) {
    db.set("sensors.motion", payload.motion).write();
  } else if (topic === topics.current) {
    db.set("sensors.current", payload.value).write();
  }
});

// REST Endpoints

// Get all sensor values
app.get("/api/sensors", (req, res) => {
  const sensors = db.get("sensors").value();
  res.json(sensors);
});

// Get actuator states
app.get("/api/actuators", (req, res) => {
  const actuators = db.get("actuators").value();
  res.json(actuators);
});

// Set actuator state
app.post("/api/actuators/:device", (req, res) => {
  const device = req.params.device;
  const command = req.body.command;

  if (
    !["light", "socket"].includes(device) ||
    !["on", "off"].includes(command)
  ) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // Publish to MQTT
  const topic = topics[`actuator_${device}`];
  mqttClient.publish(topic, JSON.stringify({ command }));

  // Update DB
  db.set(`actuators.${device}`, command).write();

  res.json({ success: true });
});

// Health check
app.get("/", (req, res) => {
  res.send("🚀 ESP8266 Backend is running...");
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Backend running on http://localhost:${PORT}`);
});
