/*************************************************
|   THEATRE BOOKING BACKEND - MYSQL VERSION + GOOGLE OAUTH
*************************************************/

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const mysql = require("mysql2/promise");
const session = require("express-session");
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

/*************************************************
|   SESSION + PASSPORT
*************************************************/
app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret123",
    resave: false,
    saveUninitialized: true,
  })
);
app.use(passport.initialize());
app.use(passport.session());

/*************************************************
|   MYSQL CONNECTION
*************************************************/
const pool = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  enableKeepAlive: true
});

/*************************************************
|   KEEP-ALIVE TASK
*************************************************/
setInterval(async () => {
  try {
    await pool.query("SELECT 1");
  } catch (e) {}
}, 5 * 60 * 1000);

/*************************************************
|   GOOGLE STRATEGY
*************************************************/
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_REDIRECT_URI,
    },
    async function (accessToken, refreshToken, profile, done) {
      const email = profile.emails[0].value;
      const name = profile.displayName;

      let user_id;

      const [rows] = await pool.query(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );

      if (rows.length > 0) {
        user_id = rows[0].id;
      } else {
        const [result] = await pool.query(
          "INSERT INTO users (name, email) VALUES (?, ?)",
          [name, email]
        );
        user_id = result.insertId;
      }

      return done(null, { id: user_id, name, email });
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user);
});
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

/*************************************************
|   GOOGLE LOGIN ROUTES
*************************************************/
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/failure" }),
  function (req, res) {
    res.json({
      status: "success",
      user: req.user, // id, name, email
    });
  }
);

app.get("/auth/failure", (req, res) => {
  res.json({ error: "Google login failed" });
});

/*************************************************
|   CREATE TABLES
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
    
    console.log("MySQL Tables created successfully!");
  } catch (err) {
    console.error("MySQL Error:", err);
  }
}

createTables();

/*************************************************
|   MOVIE + SHOWTIME + SEAT APIs
*************************************************/
// KEEP YOUR OLD APIs HERE (no change)
// movies, add-movie, showtimes, available-seats, book

/*************************************************
|   START SERVER
*************************************************/
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

