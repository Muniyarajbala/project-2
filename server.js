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

      await pool.query(`
      INSERT IGNORE INTO turf_slots (slot_time) VALUES
      ('06:00 AM - 07:00 AM'),
      ('07:00 AM - 08:00 AM'),
      ('08:00 AM - 09:00 AM'),
      ('09:00 AM - 10:00 AM'),
      ('10:00 AM - 11:00 AM'),
      ('11:00 AM - 12:00 PM'),
      ('12:00 PM - 01:00 PM'),
      ('01:00 PM - 02:00 PM'),
      ('02:00 PM - 03:00 PM'),
      ('03:00 PM - 04:00 PM'),
      ('04:00 PM - 05:00 PM'),
      ('05:00 PM - 06:00 PM'),
      ('06:00 PM - 07:00 PM'),
      ('07:00 PM - 08:00 PM'),
      ('08:00 PM - 09:00 PM'),
      ('09:00 PM - 10:00 PM')
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

    // 1️⃣ Get user by mail
    const [userRows] = await pool.query(
      `SELECT id FROM users WHERE email = ?`,
      [mail]
    );

    if (userRows.length === 0) {
      // No user found → no booking
      return res.json({ paid: false });
    }

    const user_id = userRows[0].id;

    // 2️⃣ Check if user has a successful payment booking
    const [bookingRows] = await pool.query(
      `SELECT id FROM bookings 
       WHERE user_id = ? 
       AND payment_status = 'success'
       ORDER BY id DESC
       LIMIT 1`,
      [user_id]
    );

    if (bookingRows.length === 0) {
      return res.json({ paid: false });
    }

    // Booking found
    return res.json({
      paid: true,
      booking_id: bookingRows[0].id
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

// After adding above route, restart your server
// Test URL format:
// http://localhost:3000/payment?key=rzp_test_xxx&order_id=order_123&amount=450&booking_id=1&name=Test&email=test@test.com

// On Railway:
// https://your-app.railway.app/payment?key=rzp_test_xxx&order_id=order_123&amount=450&booking_id=1&name=Test&email=test@test.com
/*************************************************
|   SERVER START
*************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 