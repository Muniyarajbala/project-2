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
  CREATE TABLE IF NOT EXISTS movie_puzzles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    question TEXT NOT NULL,
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    option_d VARCHAR(255) NOT NULL,
    correct_answer VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )
`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20)
      )
    `);

      await pool.query(`
    CREATE TABLE IF NOT EXISTS email_otps (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(150) NOT NULL,
      otp VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      await pool.query(`
    CREATE TABLE IF NOT EXISTS turf_slots (
      id INT AUTO_INCREMENT PRIMARY KEY,
      slot_time VARCHAR(30) NOT NULL UNIQUE
    )
  `);
            
      await pool.query(`
      CREATE TABLE IF NOT EXISTS turf_bookings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        date DATE NOT NULL,
        total_amount INT NOT NULL,
        payment_status VARCHAR(20) DEFAULT 'pending',
        razorpay_order_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS turf_booking_slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        turf_booking_id INT NOT NULL,
        slot_time VARCHAR(30) NOT NULL,
        FOREIGN KEY (turf_booking_id) REFERENCES turf_bookings(id)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payments_turf (
        id INT AUTO_INCREMENT PRIMARY KEY,
        turf_booking_id INT NOT NULL,
        razorpay_order_id VARCHAR(100),
        razorpay_payment_id VARCHAR(100),
        amount INT NOT NULL,
        currency VARCHAR(10) DEFAULT 'INR',
        status VARCHAR(20) DEFAULT 'success',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (turf_booking_id) REFERENCES turf_bookings(id)
      )
    `);

    console.log("MySQL Tables created successfully!");

  } catch (err) {
    console.error("MySQL TABLE ERROR:", err);
  }
}

createTables();
function buildTheatreCalendarLink(movieName, date, startTime) {
  const [year, month, day] = date.split("-");

  // Convert 12h start time → 24h
  let [time, ampm] = startTime.split(" ");
  let [h, m] = time.split(":").map(Number);

  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  const startHH = h.toString().padStart(2, "0");
  const startMM = m.toString().padStart(2, "0");

  const startDT = `${year}${month}${day}T${startHH}${startMM}00`;

  // End time = +2 hours
  let endH = h + 2;
  if (endH >= 24) endH -= 24;

  const endHH = endH.toString().padStart(2, "0");
  const endDT = `${year}${month}${day}T${endHH}${startMM}00`;

  const desc = `Date: ${date}\nTime: ${startTime}`;

  return (
    "https://www.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent(movieName) +
    "&details=" + encodeURIComponent(desc) +
    "&dates=" + startDT + "/" + endDT
  );
}

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

app.post("/store-user", async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: "name and email required" });
    }

    const [result] = await pool.query(
      `INSERT INTO users (name, email) VALUES (?, ?)`,
      [name, email]
    );

    res.json({
      status: "success",
      user_id: result.insertId
    });

  } catch (err) {
    console.error("STORE USER ERROR:", err);

    // If email already exists → send friendly message
    if (err.code === "ER_DUP_ENTRY") {
      return res.json({
        status: "exists",
        message: "Email already exists"
      });
    }

    res.status(500).json({ error: err.message });
  }
});

app.post("/save-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: "email and otp required" });
    }

    // DELETE previous OTP entries for this email
    await pool.query(
      `DELETE FROM email_otps WHERE email = ?`,
      [email]
    );

    // INSERT new OTP
    await pool.query(
      `INSERT INTO email_otps (email, otp) VALUES (?, ?)`,
      [email, otp]
    );

    res.json({ status: "success", message: "OTP saved" });

  } catch (err) {
    console.error("SAVE OTP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/get-otp", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email required" });
    }

    const [rows] = await pool.query(
      `SELECT otp FROM email_otps WHERE email = ? ORDER BY id DESC LIMIT 1`,
      [email]
    );

    if (rows.length === 0) {
      return res.json({ exist: false });
    }

    res.json({
      exist: true,
      otp: rows[0].otp
    });

  } catch (err) {
    console.error("GET OTP ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


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
    "A1","A2","A3","A4","A5", 
     "B1","B2","B3","B4","B5",
     "C1","C2","C3","C4","C5",
    "D1","D2","D3","D4","D5",
         
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
    const { mail, name, movie_id, slot_id, amount, date } = req.body;

    let seats = req.body.seats;

    // Convert string seats → array
    if (typeof seats === "string") {
      try {
        seats = JSON.parse(seats);
      } catch (e) {
        seats = seats.replace("[", "").replace("]", "");
        seats = seats.split(",").map(s => s.trim());
      }
    }

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

    /* 5️⃣ Save razorpay order_id */
    await pool.query(
      `UPDATE bookings SET razorpay_order_id = ? WHERE id = ?`,
      [order.id, booking_id]
    );

    /* 6️⃣ Build FULL PAYMENT URL */
    const paymentUrl =
      `https://project-2-production-e62e.up.railway.app/payment` +
      `?key=${process.env.RAZORPAY_KEY_ID}` +
      `&order_id=${order.id}` +
      `&amount=${amount}` +
      `&booking_id=${booking_id}` +
      `&name=${encodeURIComponent(name)}` +
      `&email=${encodeURIComponent(mail)}`;

    /* 7️⃣ Send only URL to Zobot */
    res.json({
      status: "success",
      payment_url: paymentUrl
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
|   ADD THIS TO YOUR BACKEND (index.js)
|   Add before the /sample route or at the end
*************************************************/

app.get("/payment", (req, res) => {
  const { key, order_id, amount, booking_id, name, email } = req.query;
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 450px;
            width: 100%;
            text-align: center;
            animation: slideUp 0.4s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(30px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .icon {
            font-size: 64px;
            margin-bottom: 15px;
        }
        h2 {
            color: #333;
            margin-bottom: 10px;
            font-size: 24px;
        }
        .booking-id {
            color: #666;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .amount {
            font-size: 48px;
            color: #667eea;
            font-weight: bold;
            margin: 20px 0;
        }
        .pay-btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 16px 50px;
            font-size: 18px;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: 600;
            box-shadow: 0 10px 25px rgba(102, 126, 234, 0.3);
        }
        .pay-btn:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 35px rgba(102, 126, 234, 0.4);
        }
        .pay-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .status {
            margin-top: 25px;
            font-size: 16px;
            min-height: 30px;
        }
        .loading {
            color: #666;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
        }
        .spinner {
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            width: 20px;
            height: 20px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .success {
            color: #28a745;
            font-size: 18px;
            font-weight: 600;
        }
        .error {
            color: #dc3545;
            font-size: 16px;
        }
        .info {
            background: #f8f9fa;
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-size: 14px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon" id="icon">🎬</div>
        <h2>Complete Payment</h2>
        <div class="booking-id">Booking ID: <strong>${booking_id}</strong></div>
        
        <div class="amount">₹${amount}</div>
        
        <div class="info">
            Secure payment powered by Razorpay
        </div>
        
        <button class="pay-btn" id="payBtn" onclick="openRazorpay()">
            💳 Pay Now
        </button>
        
        <div class="status" id="status"></div>
    </div>

    <script>
        function openRazorpay() {
            const options = {
                key: '${key}',
                amount: ${amount} * 100,
                currency: 'INR',
                order_id: '${order_id}',
                name: 'Theatre Booking',
                description: 'Movie Ticket Payment',
                prefill: {
                    name: '${name}',
                    email: '${email}'
                },
                theme: {
                    color: '#667eea'
                },
                handler: function(response) {
                    verifyPayment(response);
                },
                modal: {
                    ondismiss: function() {
                        showInfo('Payment cancelled');
                        setTimeout(() => {
                            window.close();
                        }, 1500);
                    }
                }
            };

            const rzp = new Razorpay(options);
            
            rzp.on('payment.failed', function(response) {
                showError('Payment failed: ' + response.error.description);
            });

            rzp.open();
        }

        async function verifyPayment(response) {
            showLoading('Verifying payment...');
            document.getElementById('payBtn').disabled = true;

            try {
                const backendUrl = window.location.origin; // Gets current domain automatically
                const result = await fetch('https://project-2-production-e62e.up.railway.app/verify-payment', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        razorpay_payment_id: response.razorpay_payment_id,
                        razorpay_order_id: response.razorpay_order_id,
                        razorpay_signature: response.razorpay_signature,
                        booking_id: '${booking_id}'
                    })
                });

                const data = await result.json();

                if (data.verified) {
                    showSuccess('✅ Payment Successful!');
                    document.getElementById('icon').textContent = '✅';
                    
                    setTimeout(() => {
                        window.close();
                    }, 2000);
                } else {
                    showError('❌ Payment verification failed');
                }

            } catch (error) {
                console.error('Error:', error);
                showError('❌ Network error occurred');
            }
        }

        function showLoading(message) {
            document.getElementById('status').innerHTML = \`
                <div class="loading">
                    <div class="spinner"></div>
                    <span>\${message}</span>
                </div>
            \`;
        }

        function showSuccess(message) {
            document.getElementById('status').innerHTML = \`
                <div class="success">\${message}</div>
            \`;
        }

        function showError(message) {
            document.getElementById('status').innerHTML = \`
                <div class="error">\${message}</div>
            \`;
        }

        function showInfo(message) {
            document.getElementById('status').innerHTML = \`
                <div style="color: #666;">\${message}</div>
            \`;
        }

        // Auto-open on mobile
        if (window.innerWidth <= 768) {
            setTimeout(openRazorpay, 800);
        }
    </script>
</body>
</html>
  `);
});

app.post("/check-payment-by-mail", async (req, res) => {
  try {
    const { mail } = req.body;

    if (!mail) {
      return res.status(400).json({ error: "mail is required" });
    }

    // 1️⃣ Find user
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [mail]
    );

    if (userRows.length === 0) {
      return res.json({ paid: false });
    }

    const user_id = userRows[0].id;

    // 2️⃣ Get latest successful booking
    const [bookingRows] = await pool.query(
      `SELECT b.id, b.date, s.time_slot, m.movie_name
       FROM bookings b
       LEFT JOIN movies m ON m.id = b.movie_id
       LEFT JOIN showtimes s ON s.id = b.time_slot_id
       WHERE b.user_id = ?
       AND b.payment_status = 'success'
       ORDER BY b.id DESC
       LIMIT 1`,
      [user_id]
    );

    if (bookingRows.length === 0) {
      return res.json({ paid: false });
    }

    const booking = bookingRows[0];

    // ⭐ FIX DATE ⭐ Convert MySQL DATE → 'YYYY-MM-DD'
    const dateStr = new Date(booking.date)
      .toISOString()
      .split("T")[0];

    // 3️⃣ Build calendar link
    const calendar_link = buildTheatreCalendarLink(
      booking.movie_name,
      dateStr,          // USE FIXED STRING
      booking.time_slot
    );

    // 4️⃣ Send full response
    return res.json({
      paid: true,
      booking_id: booking.id,
      calendar_link: calendar_link
    });

  } catch (err) {
    console.error("CHECK PAYMENT BY MAIL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});



app.post("/cancel-payment", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // 1️⃣ Find user
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (userRows.length === 0) {
      return res.json({ deleted: false, message: "No user found" });
    }

    const user_id = userRows[0].id;

    // 2️⃣ Find pending bookings for user
    const [bookingRows] = await pool.query(
      `SELECT id FROM bookings 
       WHERE user_id = ? AND payment_status = 'pending'`,
      [user_id]
    );

    if (bookingRows.length === 0) {
      return res.json({ deleted: false, message: "No pending booking found" });
    }

    const bookingIds = bookingRows.map(b => b.id);

    // 3️⃣ Delete seats of these bookings
    await pool.query(
      `DELETE FROM booking_seats WHERE booking_id IN (${bookingIds.join(",")})`
    );

    // 4️⃣ Delete payment entries linked with these pending bookings
    await pool.query(
      `DELETE FROM payments WHERE booking_id IN (${bookingIds.join(",")})`
    );

    // 5️⃣ Delete pending bookings
    await pool.query(
      `DELETE FROM bookings WHERE id IN (${bookingIds.join(",")})`
    );

    res.json({
      deleted: true,
      message: "Pending booking cancelled and data removed"
    });

  } catch (err) {
    console.error("CANCEL PAYMENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/my-bookings", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // 1️⃣ Check user exists
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (userRows.length === 0) {
      return res.json({ exist: false });
    }

    const user_id = userRows[0].id;

    // 2️⃣ Get bookings
    const [bookings] = await pool.query(
      `SELECT 
          b.id AS booking_id,
          b.date AS raw_date,
          s.time_slot,
          m.movie_name
       FROM bookings b
       LEFT JOIN movies m ON b.movie_id = m.id
       LEFT JOIN showtimes s ON b.time_slot_id = s.id
       WHERE b.user_id = ?
       AND b.payment_status = 'success'
       ORDER BY b.id DESC`,
      [user_id]
    );

    // 3️⃣ Process each booking
    for (let b of bookings) {

      // 👉 Format Date (remove "T00:00:00.000Z")
      if (b.raw_date instanceof Date) {
        b.date = b.raw_date.toISOString().split("T")[0];
      } else {
        b.date = b.raw_date;  
      }

      delete b.raw_date; // remove extra field

      // 👉 Fetch seats → "A1, A2"
      const [seats] = await pool.query(
        `SELECT seat_no FROM booking_seats WHERE booking_id = ?`,
        [b.booking_id]
      );

      b.seats = seats.map(s => s.seat_no).join(", ");
    }

    return res.json({
      exist: true,
      bookings
    });

  } catch (err) {
    console.error("MY BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


/*************************************************
|   TESTING THE ROUTE
*************************************************/
app.post("/turf-available-slots", async (req, res) => {
  try {
    const { date } = req.body;

    if (!date) {
      return res.status(400).json({ error: "date is required" });
    }

    // Convert Zobot date (29-Nov-2025) → MySQL (2025-11-29)
    function convertToMySQLDate(zobotDate) {
      const months = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04",
        May: "05", Jun: "06", Jul: "07", Aug: "08",
        Sep: "09", Oct: "10", Nov: "11", Dec: "12"
      };

      const parts = zobotDate.split("-");
      const day = parts[0];
      const month = months[parts[1]];
      const year = parts[2];

      return `${year}-${month}-${day}`;
    }

    const mysqlDate = convertToMySQLDate(date);

    // 1️⃣ Fetch all slots with ids
    const [allSlots] = await pool.query(`
      SELECT id, slot_time FROM turf_slots ORDER BY id
    `);

    // 2️⃣ Fetch booked slots for that date
    const [booked] = await pool.query(`
      SELECT tbs.slot_time 
      FROM turf_booking_slots tbs
      INNER JOIN turf_bookings tb ON tb.id = tbs.turf_booking_id
      WHERE tb.date = ?
      AND tb.payment_status = 'success'
    `, [mysqlDate]);

    const bookedSlots = booked.map(b => b.slot_time);

    // 3️⃣ Filter only available slots (return id + slot_time)
    const available = allSlots.filter(slot => 
      !bookedSlots.includes(slot.slot_time)
    );

    return res.json({
      status: "success",
      available_slots: available
    });

  } catch (err) {
    console.error("AVAILABLE TURF SLOTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
///payment for turf
app.get("/turf-all-slots", async (req, res) => {
  try {
    // Get all slots
    const [rows] = await pool.query(`
      SELECT id, slot_time FROM turf_slots
    `);

    // Helper function → convert "07:00 PM - 08:00 PM" to minutes
    function toMinutes(slot) {
      const start = slot.split(" - ")[0]; // "07:00 PM"
      const [hm, ampm] = start.split(" ");
      let [h, m] = hm.split(":").map(Number);

      if (ampm === "PM" && h !== 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;

      return h * 60 + m;
    }

    // Sort by starting time
    rows.sort((a, b) => toMinutes(a.slot_time) - toMinutes(b.slot_time));

    res.json({
      status: "success",
      slots: rows
    });

  } catch (err) {
    console.error("ALL SLOTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/turf-initiate-booking", async (req, res) => {
  try {
    const { name, email, date, selected_time_slots_id, amount } = req.body;

    if (!name || !email || !date || !selected_time_slots_id || !amount) {
      return res.status(400).json({ error: "Missing fields" });
    }

    console.log("RAW SLOTS RECEIVED:", selected_time_slots_id);

    // Convert Zobot date (29-Nov-2025) → MySQL
    function convertToMySQLDate(zobotDate) {
      const months = {
        Jan: "01", Feb: "02", Mar: "03", Apr: "04",
        May: "05", Jun: "06", Jul: "07", Aug: "08",
        Sep: "09", Oct: "10", Nov: "11", Dec: "12"
      };
      const parts = zobotDate.split("-");
      return `${parts[2]}-${months[parts[1]]}-${parts[0]}`;
    }

    const mysqlDate = convertToMySQLDate(date);

    // 1️⃣ Check or insert user
    let [u] = await pool.query(`SELECT id FROM users WHERE email=?`, [email]);
    let user_id;

    if (u.length > 0) user_id = u[0].id;
    else {
      const [ins] = await pool.query(
        `INSERT INTO users (name,email) VALUES (?,?)`,
        [name, email]
      );
      user_id = ins.insertId;
    }

    // 2️⃣ Create turf booking (pending)
    const [b] = await pool.query(
      `INSERT INTO turf_bookings (user_id,date,total_amount,payment_status)
       VALUES (?,?,?,'pending')`,
      [user_id, mysqlDate, amount]
    );

    const turf_booking_id = b.insertId;

    // 3️⃣ FIX SLOT INPUT — Convert "14,15,16" → [14, 15, 16]
    let slotArray = selected_time_slots_id;

    if (typeof slotArray === "string") {
      slotArray = slotArray.split(",").map(s => s.trim());
    }

    // Convert each slot to number + remove duplicates
    const uniqueSlotIds = [...new Set(slotArray.map(id => Number(id)))];

    console.log("UNIQUE SLOTS:", uniqueSlotIds);

    // 4️⃣ Insert slot times in DB
    for (let id of uniqueSlotIds) {
      const [slot] = await pool.query(
        `SELECT slot_time FROM turf_slots WHERE id=?`,
        [id]
      );

      if (slot.length === 0) {
        console.log("IGNORED INVALID SLOT:", id);
        continue;
      }

      await pool.query(
        `INSERT INTO turf_booking_slots (turf_booking_id, slot_time)
         VALUES (?,?)`,
        [turf_booking_id, slot[0].slot_time]
      );
    }

    // 5️⃣ Razorpay order
    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: "turf_" + turf_booking_id
    });

    await pool.query(
      `UPDATE turf_bookings SET razorpay_order_id=? WHERE id=?`,
      [order.id, turf_booking_id]
    );

    // 6️⃣ Payment URL
    const url =
      `https://project-2-production-e62e.up.railway.app/turf-payment` +
      `?key=${process.env.RAZORPAY_KEY_ID}` +
      `&order_id=${order.id}` +
      `&amount=${amount}` +
      `&turf_booking_id=${turf_booking_id}` +
      `&name=${encodeURIComponent(name)}` +
      `&email=${encodeURIComponent(email)}`;

    // FINAL RESPONSE
    res.json({
      status: "success",
      payment_url: url
    });

  } catch (err) {
    console.error("TURF INITIATE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/turf-payment", (req, res) => {
  const { key, order_id, amount, turf_booking_id, name, email } = req.query;

  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Turf Payment</title>
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #0ba360 0%, #3cba92 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px 30px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 450px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.4s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .icon { font-size: 64px; margin-bottom: 15px; }
        h2 { color: #333; margin-bottom: 10px; font-size: 24px; }
        .booking-id { color: #444; font-size: 14px; margin-bottom: 20px; }
        .amount {
            font-size: 52px;
            color: #0ba360;
            font-weight: bold;
            margin: 20px 0;
        }
        .pay-btn {
            background: #0ba360;
            color: white;
            border: none;
            padding: 16px 50px;
            font-size: 18px;
            border-radius: 40px;
            cursor: pointer;
            transition: 0.3s ease;
            font-weight: 600;
        }
        .pay-btn:hover {
            background: #099f54;
            transform: translateY(-3px);
        }
        .pay-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .status {
            margin-top: 20px;
            min-height: 25px;
            font-size: 16px;
        }
        .info {
            background: #f3f3f3;
            padding: 12px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-size: 14px;
            color: #555;
        }
        .success { color: green; font-weight: bold; }
        .error { color: red; font-weight: bold; }
    </style>
</head>
<body>
<div class="container">
    <div class="icon">⚽</div>
    <h2>Turf Payment</h2>
    <div class="booking-id">Booking ID: <strong>${turf_booking_id}</strong></div>

    <div class="amount">₹${amount}</div>

    <div class="info">Secure payment powered by Razorpay</div>

    <button class="pay-btn" id="payBtn" onclick="openRazorpay()">Pay Now</button>

    <div class="status" id="status"></div>
</div>

<script>
function openRazorpay() {
    const options = {
        key: '${key}',
        amount: ${amount} * 100,
        currency: 'INR',
        order_id: '${order_id}',
        name: 'Turf Booking',
        description: 'Turf Slot Payment',
        prefill: {
            name: '${name}',
            email: '${email}'
        },
        handler: function (response) {
            verifyPayment(response);
        },
        modal: {
            ondismiss: function () {
                showMessage('Payment Cancelled', 'error');
                setTimeout(() => window.close(), 1500);
            }
        }
    };

    const rzp = new Razorpay(options);
    rzp.open();
}

async function verifyPayment(response) {
    document.getElementById('payBtn').disabled = true;
    showMessage('Verifying payment...', 'info');

    const result = await fetch('/turf-verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
            turf_booking_id: '${turf_booking_id}'
        })
    });

    const data = await result.json();

    if (data.verified) {
        showMessage('Payment Successful ✔', 'success');
        setTimeout(() => window.close(), 2000);
    } else {
        showMessage('Payment Verification Failed ❌', 'error');
    }
}

function showMessage(msg, type) {
    document.getElementById('status').innerHTML =
        '<span class="' + type + '">' + msg + '</span>';
}
</script>

</body>
</html>
  `);
});
app.post("/turf-verify-payment", async (req, res) => {
  try {
    const {
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature,
      turf_booking_id
    } = req.body;

    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment fields" });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;

    // 1️⃣ Generate HMAC signature
    const hmac = crypto.createHmac("sha256", secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const digest = hmac.digest("hex");

    if (digest !== razorpay_signature) {
      return res.json({ verified: false });
    }

    // 2️⃣ Get amount for this booking
    const [rows] = await pool.query(
      `SELECT total_amount FROM turf_bookings WHERE id=?`,
      [turf_booking_id]
    );

    if (rows.length === 0) {
      return res.json({ verified: false, error: "Booking not found" });
    }

    const amount = rows[0].total_amount;

    // 3️⃣ Mark booking as success
    await pool.query(
      `UPDATE turf_bookings SET payment_status='success' WHERE id=?`,
      [turf_booking_id]
    );

    // 4️⃣ Save payment entry
    await pool.query(
      `INSERT INTO payments_turf 
       (turf_booking_id, razorpay_order_id, razorpay_payment_id, amount, currency, status)
       VALUES (?, ?, ?, ?, 'INR', 'success')`,
      [turf_booking_id, razorpay_order_id, razorpay_payment_id, amount]
    );

    return res.json({ verified: true });

  } catch (err) {
    console.error("TURF VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
// Helper: Convert "06:00 AM - 07:00 AM" → "06:00 AM"
function getStartTime(slot) {
  return slot.split("-")[0].trim();
}

// Helper: Convert 12h time to 24h "HHMM"
function convertTo24(time12) {
  let [time, ampm] = time12.split(" ");
  let [h, m] = time.split(":").map(Number);

  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;

  return { h, m };
}

// MAIN API
app.post("/turf-check-payment-by-mail", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // 1️⃣ Get user
    const [userRow] = await pool.query(
      `SELECT id FROM users WHERE email=?`,
      [email]
    );

    if (userRow.length === 0) {
      return res.json({ paid: false });
    }

    const user_id = userRow[0].id;

    // 2️⃣ Get latest successful turf booking
    const [bookingRow] = await pool.query(
      `SELECT id, date, total_amount
       FROM turf_bookings
       WHERE user_id=? AND payment_status='success'
       ORDER BY id DESC LIMIT 1`,
      [user_id]
    );

    if (bookingRow.length === 0) {
      return res.json({ paid: false });
    }

    const booking = bookingRow[0];

    // 3️⃣ Get all slot times
    const [slots] = await pool.query(
      `SELECT slot_time FROM turf_booking_slots WHERE turf_booking_id=?`,
      [booking.id]
    );

    if (slots.length === 0) {
      return res.json({
        paid: true,
        turf_booking_id: booking.id,
        calendar_link: null
      });
    }

    // Sort slots like: earliest → last
    const sortedSlots = slots.map(s => s.slot_time);

    // Get start time of first slot (e.g. "06:00 AM")
    const startTime = getStartTime(sortedSlots[0]);

    // Get end time from last slot's end time
    // "07:00 AM - 08:00 AM" → "08:00 AM"
    const lastSlot = sortedSlots[sortedSlots.length - 1];
    const endTime = lastSlot.split("-")[1].trim();

    // 4️⃣ Convert MySQL date YYYY-MM-DD to event format
    const [year, month, day] = booking.date.toISOString().split("T")[0].split("-");

    // Convert start time to 24h
    const { h: sh, m: sm } = convertTo24(startTime);
    const startDT = `${year}${month}${day}T${String(sh).padStart(2, "0")}${String(sm).padStart(2, "0")}00`;

    // Convert end time to 24h
    const { h: eh, m: em } = convertTo24(endTime);
    const endDT = `${year}${month}${day}T${String(eh).padStart(2, "0")}${String(em).padStart(2, "0")}00`;

    // 5️⃣ Build final Google Calendar link
    const desc = `Turf Booking\nSlots: ${sortedSlots.join(", ")}\nAmount: ₹${booking.total_amount}`;

    const calendarLink =
      "https://www.google.com/calendar/render?action=TEMPLATE" +
      "&text=" + encodeURIComponent("Turf Booking") +
      "&details=" + encodeURIComponent(desc) +
      "&dates=" + startDT + "/" + endDT;

    // 6️⃣ Response
    return res.json({
      paid: true,
      turf_booking_id: booking.id,
     
      calendar_link: calendarLink
    });

  } catch (err) {
    console.error("TURF CHECK PAYMENT BY MAIL ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/turf-cancel-payment", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // 1️⃣ Find user
    const [userRow] = await pool.query(
      `SELECT id FROM users WHERE email=?`,
      [email]
    );

    if (userRow.length === 0) {
      return res.json({ deleted: false, message: "No user found" });
    }

    const user_id = userRow[0].id;

    // 2️⃣ Find pending turf bookings
    const [pendingRows] = await pool.query(
      `SELECT id FROM turf_bookings 
       WHERE user_id=? AND payment_status='pending'`,
      [user_id]
    );

    if (pendingRows.length === 0) {
      return res.json({ deleted: false, message: "No pending turf booking found" });
    }

    const ids = pendingRows.map(b => b.id);

    // 3️⃣ Delete booking slots for these bookings
    await pool.query(
      `DELETE FROM turf_booking_slots WHERE turf_booking_id IN (${ids.join(",")})`
    );

    // 4️⃣ Delete payment attempts (if any)
    await pool.query(
      `DELETE FROM payments_turf WHERE turf_booking_id IN (${ids.join(",")})`
    );

    // 5️⃣ Delete turf bookings
    await pool.query(
      `DELETE FROM turf_bookings WHERE id IN (${ids.join(",")})`
    );

    return res.json({
      deleted: true,
      message: "Pending turf booking cancelled successfully"
    });

  } catch (err) {
    console.error("TURF CANCEL PAYMENT ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/my-turf-bookings", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    // 1️⃣ Check if user exists
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [email]
    );

    if (userRows.length === 0) {
      return res.json({ exist: false });
    }

    const user_id = userRows[0].id;

    // 2️⃣ Fetch all successful turf bookings
    const [bookings] = await pool.query(
      `SELECT 
          tb.id AS turf_booking_id,
          tb.date AS raw_date,
          tb.total_amount
       FROM turf_bookings tb
       WHERE tb.user_id = ?
       AND tb.payment_status = 'success'
       ORDER BY tb.id DESC`,
      [user_id]
    );

    if (bookings.length === 0) {
      return res.json({ exist: true, bookings: [] });
    }

    // 3️⃣ Format each booking
    for (let b of bookings) {

      // Convert MySQL date → YYYY-MM-DD
      if (b.raw_date instanceof Date) {
        b.date = b.raw_date.toISOString().split("T")[0];
      } else {
        b.date = b.raw_date;
      }

      delete b.raw_date;

      // Fetch all slot_times for the booking
      const [slots] = await pool.query(
        `SELECT slot_time 
         FROM turf_booking_slots 
         WHERE turf_booking_id = ?`,
        [b.turf_booking_id]
      );

      b.slots = slots.map(s => s.slot_time).join(", ");
    }

    return res.json({
      exist: true,
      bookings: bookings
    });

  } catch (err) {
    console.error("MY TURF BOOKINGS ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/add-puzzle", async (req, res) => {
  try {
    const { question, option_a, option_b, option_c, option_d, correct_answer } = req.body;

    if (!question || !option_a || !option_b || !option_c || !option_d || !correct_answer) {
      return res.status(400).json({ error: "Missing fields" });
    }

    await pool.query(
      `INSERT INTO movie_puzzles 
       (question, option_a, option_b, option_c, option_d, correct_answer)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [question, option_a, option_b, option_c, option_d, correct_answer]
    );

    res.json({ status: "success", message: "Puzzle added successfully" });

  } catch (err) {
    console.error("ADD PUZZLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});
app.get("/daily-puzzle", async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM movie_puzzles ORDER BY id`);

    if (rows.length === 0) {
      return res.json({ status: "empty", message: "No puzzles available" });
    }

    // Pick today's puzzle index
    const today = new Date();
    const dayNum = today.getDate(); // 1 → 31
    const index = (dayNum - 1) % rows.length; 

    const puzzle = rows[index];

    res.json({
      status: "success",
      puzzle: {
        id: puzzle.id,
        question: puzzle.question,
        options: {
          A: puzzle.option_a,
          B: puzzle.option_b,
          C: puzzle.option_c,
          D: puzzle.option_d
        },
        answer: puzzle.correct_answer // you wanted answer also
      }
    });

  } catch (err) {
    console.error("DAILY PUZZLE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 