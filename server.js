/************************************************************
 * LocalRot-Server - Backend officiel
 * Fichier : server.js
 * Version : 1.0.0
 * Auteur  : LocalRot
 ************************************************************/

/* ==========================================================
   IMPORTS
========================================================== */
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");

/* ==========================================================
   CONFIG
========================================================== */
const app = express();
const PORT = 3000;

const DB_PATH = "./database";
const USERS_FILE = `${DB_PATH}/users.json`;
const RESERVATIONS_FILE = `${DB_PATH}/reservations.json`;
const PAYMENTS_FILE = `${DB_PATH}/payments.json`;

/* ==========================================================
   MIDDLEWARE
========================================================== */
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("public"));

/* ==========================================================
   INIT DATABASE
========================================================== */
function initDB() {
    if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

    if (!fs.existsSync(USERS_FILE))
        fs.writeFileSync(USERS_FILE, JSON.stringify([]));

    if (!fs.existsSync(RESERVATIONS_FILE))
        fs.writeFileSync(RESERVATIONS_FILE, JSON.stringify([]));

    if (!fs.existsSync(PAYMENTS_FILE))
        fs.writeFileSync(PAYMENTS_FILE, JSON.stringify([]));
}

initDB();

/* ==========================================================
   UTILS
========================================================== */
function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateId(prefix = "ID") {
    return `${prefix}_${crypto.randomBytes(6).toString("hex")}`;
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ==========================================================
   AUTH ROUTES
========================================================== */

/**
 * REGISTER
 */
app.post("/api/register", (req, res) => {
    const { username, password } = req.body;

    if (!username || !password)
        return res.status(400).json({ error: "Champs manquants" });

    const users = readJSON(USERS_FILE);

    if (users.find(u => u.username === username))
        return res.status(409).json({ error: "Utilisateur déjà existant" });

    users.push({
        id: generateId("USR"),
        username,
        password: hashPassword(password),
        createdAt: Date.now()
    });

    writeJSON(USERS_FILE, users);

    res.json({ success: true });
});

/**
 * LOGIN
 */
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const users = readJSON(USERS_FILE);

    const user = users.find(
        u => u.username === username && u.password === hashPassword(password)
    );

    if (!user)
        return res.status(401).json({ error: "Identifiants invalides" });

    res.json({
        success: true,
        user: { id: user.id, username: user.username }
    });
});

/* ==========================================================
   RESERVATIONS
========================================================== */

/**
 * CREATE RESERVATION
 * Compatible avec ton modal HTML
 */
app.post("/api/reserve", (req, res) => {
    const {
        username,
        game,
        type,
        amount,
        date,
        email
    } = req.body;

    if (!username || !game || !type || !amount || !email)
        return res.status(400).json({ error: "Données incomplètes" });

    if (!isValidEmail(email))
        return res.status(400).json({ error: "Email invalide" });

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

    res.json({
        success: true,
        reservation
    });
});

/**
 * GET USER RESERVATIONS
 */
app.get("/api/reservations/:username", (req, res) => {
    const { username } = req.params;
    const reservations = readJSON(RESERVATIONS_FILE);

    res.json(
        reservations.filter(r => r.username === username)
    );
});

/* ==========================================================
   PAYMENTS (PAYPAL READY)
========================================================== */

/**
 * CREATE PAYMENT RECORD
 * (appelé AVANT affichage PayPal)
 */
app.post("/api/payment/create", (req, res) => {
    const { reservationId, paypalButtonId } = req.body;

    const payments = readJSON(PAYMENTS_FILE);
    const reservations = readJSON(RESERVATIONS_FILE);

    const reservation = reservations.find(r => r.id === reservationId);

    if (!reservation)
        return res.status(404).json({ error: "Réservation introuvable" });

    payments.push({
        id: generateId("PAY"),
        reservationId,
        paypalButtonId,
        status: "CREATED",
        createdAt: Date.now()
    });

    writeJSON(PAYMENTS_FILE, payments);

    res.json({ success: true });
});

/**
 * PAYPAL WEBHOOK (FUTUR)
 * prêt pour IPN / Webhook
 */
app.post("/api/paypal/webhook", (req, res) => {
    const event = req.body;

    // Ici plus tard : vérification signature PayPal

    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED") {
        const paymentId = event.resource.id;

        const payments = readJSON(PAYMENTS_FILE);
        const reservations = readJSON(RESERVATIONS_FILE);

        const payment = payments.find(p => p.paypalPaymentId === paymentId);

        if (payment) {
            payment.status = "COMPLETED";

            const reservation = reservations.find(
                r => r.id === payment.reservationId
            );

            if (reservation) {
                reservation.status = "CONFIRMED";
                writeJSON(RESERVATIONS_FILE, reservations);
            }

            writeJSON(PAYMENTS_FILE, payments);
        }
    }

    res.sendStatus(200);
});

/* ==========================================================
   PRICE LOGIC (IDENTIQUE FRONT)
========================================================== */
function calculatePrice(type, amount) {
    let price = 0;

    if (type === "hour") {
        if (amount > 5) price = (amount - 5) * 1;
    }

    if (type === "day") {
        price = amount * 2;
    }

    if (type === "month") {
        if (amount === 1) price = 4.99;
        if (amount === 2) price = 9.98;
    }

    return Number(price.toFixed(2));
}

/* ==========================================================
   ADMIN / DEBUG
========================================================== */
app.get("/api/admin/stats", (req, res) => {
    const users = readJSON(USERS_FILE).length;
    const reservations = readJSON(RESERVATIONS_FILE);
    const payments = readJSON(PAYMENTS_FILE);

    res.json({
        users,
        reservations: reservations.length,
        confirmed: reservations.filter(r => r.status === "CONFIRMED").length,
        pending: reservations.filter(r => r.status === "PENDING_PAYMENT").length,
        payments: payments.length
    });
});

/* ==========================================================
   START SERVER
========================================================== */
app.listen(PORT, () => {
    console.log("=====================================");
    console.log(" LocalRot-Server BACKEND ACTIF ");
    console.log(` http://localhost:${PORT}`);
    console.log("=====================================");
});
