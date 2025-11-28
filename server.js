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
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());
const crypto = require("crypto");
app.use(express.static("public"));

/*************************************************
|   MYSQL CONNECTION (POOL + KEEP ALIVE)
*************************************************/
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,        // ✔ correct
  user: process.env.MYSQLUSER,        // ✔ FIXED
  password: process.env.MYSQLPASSWORD, // ✔ correct
  database: process.env.MYSQLDATABASE, // ✔ correct
  port: process.env.MYSQLPORT,         // ✔ correct
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
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

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
         razorpay_order_id VARCHAR(100),
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
     console.log("RAW BODY:", req.body);
    const { selected_date } = req.body;

    const [times] = await pool.query("SELECT * FROM showtimes");

    // Convert time_slot strings to minutes and sort
    times.sort((a, b) => toMinutes(a.time_slot) - toMinutes(b.time_slot));

    // Get today's date in IST (VERY IMPORTANT FIX)
    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Kolkata"
    });

    // If selected date ≠ today → return ALL times
    if (selected_date !== today) {
      return res.json(times);
    }

    // Current IST time
    const nowIST = new Date().toLocaleString("en-US", {
      timeZone: "Asia/Kolkata"
    });

    const now = new Date(nowIST);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    // Filter upcoming timings (slot + 2h15min allowed)
    const upcoming = times.filter(slot => {
      const start = toMinutes(slot.time_slot);    // Convert slot time to minutes
      return currentMinutes <= start + 135;       // 135 min = 2hr 15min
    });

    res.json(upcoming);

  } catch (err) {
    console.error(err);
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
    "D1","D2","D3","D4","D5",
    "C1","C2","C3","C4","C5",
     "B1","B2","B3","B4","B5",
     "A1","A2","A3","A4","A5",
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

    res.json({ 
      booked: bookedSeats,
      available: available
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
/*************************************************
|   CHECK USER BY EMAIL  (exist_user + user data)
*************************************************/
app.post("/check-user", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT * FROM users WHERE email = ?`,
      [email]
    );

    // user exists
    if (rows.length > 0) {
      return res.json({
        exist_user: true,
        user: rows[0]   // returns full user data: id, name, email, phone
      });
    }

    // user not found
    return res.json({
      exist_user: false
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/*************************************************
|   INITIATE BOOKING (Old/New User → Booking → RZP Order)
*************************************************/
app.post("/initiate-booking", async (req, res) => {
  try {
    const { mail, name, movie_id, slot_id, seats, amount, date } = req.body;

    if (!mail || !name || !movie_id || !slot_id || !seats || !amount) {
      return res.status(400).json({ error: "Missing fields" });
    }

    /* 1️⃣ Check if user exists */
    let [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [mail]
    );

    let user_id;

    if (userRows.length > 0) {
      user_id = userRows[0].id;
    } else {
      const [insertUser] = await pool.query(
        `INSERT INTO users (name, email) VALUES (?, ?)`,
        [name, mail]
      );
      user_id = insertUser.insertId;
    }

    /* 2️⃣ Create pending booking */
    const bookingDate = date || new Date().toISOString().slice(0, 10);

    const [booking] = await pool.query(
      `INSERT INTO bookings (user_id, movie_id, date, time_slot_id, total_amount, payment_status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [user_id, movie_id, bookingDate, slot_id, amount]
    );

    const booking_id = booking.insertId;

    /* 3️⃣ Insert seats */
    for (let seat of seats) {
      await pool.query(
        `INSERT INTO booking_seats (booking_id, seat_no) VALUES (?, ?)`,
        [booking_id, seat.trim()]
      );
    }

    /* 4️⃣ Create Razorpay order */
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "receipt_" + booking_id
    });

    /* 5️⃣ Save order_id inside booking */
    await pool.query(
      `UPDATE bookings SET razorpay_order_id = ? WHERE id = ?`,
      [order.id, booking_id]
    );

    /* 6️⃣ Send response to bot */
    res.json({
      status: "success",
      booking_id,
      order_id: order.id,
      key_id: process.env.RAZORPAY_KEY_ID,
      amount
    });

  } catch (err) {
    console.error("INITIATE BOOKING ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});




app.post("/verify-payment", async (req, res) => {
  try {
    const { 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature, 
      booking_id 
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    /* 1️⃣ Verify signature */
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generated = hmac.digest("hex");

    if (generated !== razorpay_signature) {
      return res.json({ verified: false });
    }

    /* 2️⃣ Fetch amount from booking */
    const [rows] = await pool.query(
      `SELECT total_amount FROM bookings WHERE id = ?`,
      [booking_id]
    );

    const amount = rows[0].total_amount;

    /* 3️⃣ Mark booking success */
    await pool.query(
      `UPDATE bookings SET payment_status='success' WHERE id = ?`,
      [booking_id]
    );

    /* 4️⃣ Save payment record */
    await pool.query(
      `INSERT INTO payments 
       (booking_id, razorpay_order_id, razorpay_payment_id, amount, currency, status)
       VALUES (?, ?, ?, ?, 'INR', 'success')`,
      [booking_id, razorpay_order_id, razorpay_payment_id, amount]
    );

    res.json({ verified: true });

  } catch (err) {
    console.error("VERIFY PAYMENT ERROR:", err);
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