/************************************************************
 * LocalRot Server
 * Backend officiel – Production Ready
 * Compatible Render / Node.js
 * Auteur : LocalRot
 * Version : 1.0.0
 ************************************************************/

/* ==========================================================
   IMPORTS
========================================================== */
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/* ==========================================================
   APP CONFIG
========================================================== */
const app = express();
const PORT = process.env.PORT || 3000;

/* ==========================================================
   PATHS
========================================================== */
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DB_DIR = path.join(ROOT_DIR, "database");

const USERS_FILE = path.join(DB_DIR, "users.json");
const RESERVATIONS_FILE = path.join(DB_DIR, "reservations.json");
const PAYMENTS_FILE = path.join(DB_DIR, "payments.json");

/* ==========================================================
   MIDDLEWARES
========================================================== */
app.use(cors());
app.use(bodyParser.json({ limit: "1mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

/* ==========================================================
   DATABASE INIT
========================================================== */
function ensureFile(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
    }
}

function initDatabase() {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR);

    ensureFile(USERS_FILE, []);
    ensureFile(RESERVATIONS_FILE, []);
    ensureFile(PAYMENTS_FILE, []);
}

initDatabase();

/* ==========================================================
   UTILS
========================================================== */
function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateId(prefix) {
    return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ==========================================================
   FRONTEND ROUTE
========================================================== */
app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "localrot.html"));
});

/* ==========================================================
   AUTH API
========================================================== */
app.post("/api/register", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: "Missing fields" });

    const users = readJSON(USERS_FILE);

    if (users.find(u => u.username === username))
        return res.status(409).json({ error: "User already exists" });

    users.push({
        id: generateId("USR"),
        username,
        password: hashPassword(password),
        createdAt: Date.now()
    });

    writeJSON(USERS_FILE, users);
    res.json({ success: true });
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users.find(
        u => u.username === username &&
             u.password === hashPassword(password)
    );

    if (!user)
        return res.status(401).json({ error: "Invalid credentials" });

    res.json({
        success: true,
        user: { id: user.id, username: user.username }
    });
});

/* ==========================================================
   RESERVATIONS API
========================================================== */
function calculatePrice(type, amount) {
    let price = 0;

    if (type === "hour" && amount > 5)
        price = (amount - 5) * 1;

    if (type === "day")
        price = amount * 2;

    if (type === "month") {
        if (amount === 1) price = 4.99;
        if (amount === 2) price = 9.98;
    }

    return Number(price.toFixed(2));
}

app.post("/api/reserve", (req, res) => {
    const { username, game, type, amount, date, email } = req.body;

    if (!username || !game || !type || !amount || !email)
        return res.status(400).json({ error: "Invalid data" });

    if (!isValidEmail(email))
        return res.status(400).json({ error: "Invalid email" });

    const reservations = readJSON(RESERVATIONS_FILE);
    const price = calculatePrice(type, amount);

    const reservation = {
        id: generateId("RES"),
        username,
        game,
        type,
        amount,
        date: date || null,
        email,
        price,
        status: price > 0 ? "PENDING_PAYMENT" : "CONFIRMED",
        createdAt: Date.now()
    };

    reservations.push(reservation);
    writeJSON(RESERVATIONS_FILE, reservations);

    res.json({ success: true, reservation });
});

app.get("/api/reservations/:username", (req, res) => {
    const reservations = readJSON(RESERVATIONS_FILE);
    res.json(reservations.filter(r => r.username === req.params.username));
});

/* ==========================================================
   PAYMENTS API
========================================================== */
app.post("/api/payment/create", (req, res) => {
    const { reservationId } = req.body;

    const payments = readJSON(PAYMENTS_FILE);
    const reservations = readJSON(RESERVATIONS_FILE);

    const reservation = reservations.find(r => r.id === reservationId);
    if (!reservation)
        return res.status(404).json({ error: "Reservation not found" });

    payments.push({
        id: generateId("PAY"),
        reservationId,
        status: "CREATED",
        createdAt: Date.now()
    });

    writeJSON(PAYMENTS_FILE, payments);
    res.json({ success: true });
});

/* ==========================================================
   ADMIN API
========================================================== */
app.get("/api/admin/stats", (req, res) => {
    const users = readJSON(USERS_FILE);
    const reservations = readJSON(RESERVATIONS_FILE);
    const payments = readJSON(PAYMENTS_FILE);

    res.json({
        users: users.length,
        reservations: reservations.length,
        confirmed: reservations.filter(r => r.status === "CONFIRMED").length,
        pending: reservations.filter(r => r.status === "PENDING_PAYMENT").length,
        payments: payments.length
    });
});

/* ==========================================================
   404 HANDLER
========================================================== */
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

/* ==========================================================
   START SERVER
========================================================== */
app.listen(PORT, () => {
    console.log("========================================");
    console.log(" LocalRot Server RUNNING ");
    console.log(` Port : ${PORT}`);
    console.log("========================================");
});
