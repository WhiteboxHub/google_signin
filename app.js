require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { OAuth2Client } = require('google-auth-library');
const session = require('express-session');
const axios = require('axios');

const app = express();
const PORT = 3001;

// Middleware to parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded({ extended: true }));

// Google OAuth2 client setup
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const oauth2Client = new OAuth2Client(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// MySQL database setup
const dbConfig = {
  host: process.env.DBCONFIG_HOST,
  user: process.env.DBCONFIG_USER,
  password: process.env.DBCONFIG_PASSWORD,
  database: process.env.DBCONFIG_DATABASE
};

async function queryDb(query, params) {
  const connection = await mysql.createConnection(dbConfig);
  const [results] = await connection.execute(query, params);
  await connection.end();
  return results;
}

// Express session setup
app.use(session({
  secret: 'secret',
  resave: false,
  saveUninitialized: true,
}));

// Route for sign in with Google
app.get('/signin', async (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account' // Forces to select an account for sign-in
  });
  res.redirect(url);
});

// Google OAuth2 callback route
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: CLIENT_ID,
  });
  const payload = ticket.getPayload();
  
  const { sub: googleId, name: displayName, email } = payload;

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [googleId]);
  if (users.length === 0) {
    // Redirect to a form to collect additional information
    req.session.googleId = googleId;
    req.session.displayName = displayName;
    req.session.email = email;
    return res.redirect('/additional-info');
  } else {
    req.session.userId = googleId;
    return res.redirect('/home');
  }
});

// Route for "Please sign up first" page
app.get('/please-signup', (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Please sign up first before accessing your Google account</h1>
        <a href="/signup">Sign Up with Google</a>
      </body>
    </html>
  `);
});

// Route to collect additional information
app.get('/additional-info', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f4f4f4;
          }
          .container {
            background-color: #fff;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
          }
          h1 {
            text-align: center;
            color: #333;
          }
          form {
            display: flex;
            flex-direction: column;
          }
          label {
            margin-bottom: 5px;
            font-weight: bold;
            color: #333;
          }
          input {
            margin-bottom: 10px;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
          }
          button {
            padding: 10px;
            background-color: #4CAF50;
            color: #fff;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #45a049;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Please Enter Your Details</h1>
          <form action="/submit-info" method="POST">
            <label for="location">Location:</label>
            <input type="text" id="location" name="location" required>
            <label for="mobile">Mobile Number:</label>
            <input type="text" id="mobile" name="mobile" required>
            <label for="address">Address:</label>
            <input type="text" id="address" name="address" required>
            <label for="zip">ZIP Code:</label>
            <input type="text" id="zip" name="zip" required>
            <button type="submit">Submit</button>
          </form>
        </div>
      </body>
    </html>
  `);
});

// Route to handle the form submission
app.post('/submit-info', async (req, res) => {
  const { location, mobile, address, zip } = req.body;
  const { googleId, displayName, email } = req.session;

  await queryDb('INSERT INTO Users (googleId, displayName, email, location, mobileNumber, address, zip) VALUES (?, ?, ?, ?, ?, ?, ?)', 
    [googleId, displayName, email, location, mobile, address, zip]);
  
  req.session.userId = googleId;
  res.redirect('/home');
});

// Route to display the home page after sign in
app.get('/home', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/');
  }

  let users = await queryDb('SELECT * FROM Users WHERE googleId = ?', [req.session.userId]);
  if (users.length === 0) {
    return res.redirect('/');
  }

  res.send(`
    <html>
      <body>
        <h1>Welcome to Home Page</h1>
      </body>
    </html>
  `);
});

// Static files for the buttons
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <style>
          body {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            background-color: #f4f4f4;
          }
          .button {
            display: inline-block;
            padding: 10px 20px;
            font-size: 16px;
            cursor: pointer;
            text-align: center;
            text-decoration: none;
            outline: none;
            color: #fff;
            background-color: #4CAF50;
            border: none;
            border-radius: 15px;
            box-shadow: 0 4px #999;
          }
          .button:hover {background-color: #3e8e41}
          .button:active {
            background-color: #3e8e41;
            box-shadow: 0 2px #666;
            transform: translateY(2px);
          }
        </style>
      </head>
      <body>
        <a href="/signin" class="button">Sign In with Google</a>
      </body>
    </html>
  `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
