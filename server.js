/*************************************************
|   THEATRE BOOKING BACKEND - MYSQL VERSION
|   AUTHOR: ChatGPT (for Muniyaraj bro 🔥)
*************************************************/

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const Razorpay = require("razorpay");
const mysql = require("mysql2/promise");

const app = express();

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

/*************************************************
|   MYSQL CONNECTION (POOL + KEEP ALIVE)
*************************************************/
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true
});

/*************************************************
|   KEEP-ALIVE QUERY (Prevents Next-Day Error)
*************************************************/
setInterval(async () => {
  try {
    await pool.query("SELECT 1");
    console.log("MySQL KeepAlive OK");
  } catch (e) {
    console.error("KeepAlive ERROR:", e);
  }
}, 5 * 60 * 1000); // every 5 minutes

/*************************************************
|   RAZORPAY CONFIG
*************************************************/
// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID,
//   key_secret: process.env.RAZORPAY_KEY_SECRET,
// });

/*************************************************
|   CREATE TABLES (MYSQL)
*************************************************/
async function createTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS movies (
        id INT AUTO_INCREMENT PRIMARY KEY,
        screen_no INT NOT NULL,
        movie_name VARCHAR(100) NOT NULL,
        poster_url VARCHAR(255),
        trailer_url VARCHAR(255)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS showtimes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        time_slot VARCHAR(20) NOT NULL
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        movie_id INT,
        date DATE NOT NULL,
        time_slot_id INT,
        total_amount INT,
        payment_status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (movie_id) REFERENCES movies(id),
        FOREIGN KEY (time_slot_id) REFERENCES showtimes(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS booking_seats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT,
        seat_no VARCHAR(10),
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        booking_id INT,
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        amount INT,
        currency VARCHAR(10),
        status VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id)
      )
    `);

    console.log("MySQL Tables created successfully!");

  } catch (err) {
    console.error("MySQL TABLE ERROR:", err);
  }
}

createTables();

/*************************************************
|   HELPER — Convert AM/PM time to minutes
*************************************************/
function toMinutes(time12) {
  const [hm, ampm] = time12.trim().split(" ");
  let [h, m] = hm.split(":").map(Number);

  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  return h * 60 + m;
}

/*************************************************
|   GET MOVIES
*************************************************/
app.get("/movies", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT * FROM movies");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*************************************************
|   ADD MOVIE
*************************************************/
app.post("/add-movie", async (req, res) => {
  const { screen_no, movie_name, poster_url, trailer_url } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO movies (screen_no, movie_name, poster_url, trailer_url)
       VALUES (?, ?, ?, ?)`,
      [screen_no, movie_name, poster_url, trailer_url]
    );

    res.json({ status: "success", movie_id: result.insertId });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*************************************************
|   ADD SHOWTIME
*************************************************/
app.post("/add-showtime", async (req, res) => {
  const { time_slot } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO showtimes (time_slot) VALUES (?)`,
      [time_slot]
    );

    res.json({ status: "success", showtime_id: result.insertId });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*************************************************
|   SHOWTIMES (SORTED + TODAY FILTER)
*************************************************/
app.post("/showtimes", async (req, res) => {
  try {
    const { selected_date } = req.body;

    const [times] = await pool.query("SELECT * FROM showtimes");

    times.sort((a, b) => toMinutes(a.time_slot) - toMinutes(b.time_slot));

    const today = new Date().toISOString().split("T")[0];

    if (selected_date !== today) {
      return res.json(times);
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const upcoming = times.filter(slot => {
      const start = toMinutes(slot.time_slot);
      return currentMinutes <= start + 135;
    });

    res.json(upcoming);

  } catch (err) {
    res.status(500).json({ error: "Cannot fetch showtimes" });
  }
});

/*************************************************
|   BOOK TICKET (WITH MULTIPLE SEATS)
*************************************************/
app.post("/book", async (req, res) => {
  const { user_id, movie_id, date, time_slot_id, seats, total_amount } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO bookings (user_id, movie_id, date, time_slot_id, total_amount)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, movie_id, date, time_slot_id, total_amount]
    );

    const booking_id = result.insertId;

    for (let seat of seats) {
      await pool.query(
        `INSERT INTO booking_seats (booking_id, seat_no)
         VALUES (?, ?)`,
        [booking_id, seat]
      );
    }

    res.json({ status: "success", booking_id });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*************************************************
|   AVAILABLE SEATS
*************************************************/
app.post("/available-seats", async (req, res) => {
  const { movie_id, date, time_slot_id } = req.body;

  const allSeats = [
    "A1","A2","A3","A4","A5","A6",
    "B1","B2","B3","B4","B5","B6",
    "C1","C2","C3","C4","C5","C6",
    "D1","D2","D3","D4","D5","D6",
    "E1","E2","E3","E4","E5","E6"
  ];

  try {
    const [booked] = await pool.query(
      `SELECT seat_no FROM booking_seats 
       WHERE booking_id IN (
         SELECT id FROM bookings 
         WHERE movie_id=? AND date=? AND time_slot_id=? AND payment_status='success'
       )`,
      [movie_id, date, time_slot_id]
    );

    const bookedSeats = booked.map(b => b.seat_no);
    const available = allSeats.filter(s => !bookedSeats.includes(s));

    res.json({ available });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/*************************************************
|   SAMPLE ROUTE
*************************************************/
app.get("/sample", (req, res) => {
  res.json({ status: "success" });
});

/*************************************************
|   SERVER START
*************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
