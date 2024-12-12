const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const cron = require('node-cron');

// Initialize the app
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection URI
const dbURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/eventDB'; // Use environment variable for production
mongoose.connect(dbURI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB connection error: ", err));

// Define Event Schema
const eventSchema = new mongoose.Schema({
  title: String,
  start: Date,
  end: Date,
  url: String,
  phoneNumber: String, // To send SMS reminders
  notified: { type: Boolean, default: false }, // Track if notification was sent
});

// Create Event Model
const Event = mongoose.model('Event', eventSchema);

// Twilio Setup
const accountSid = process.env.TWILIO_ACCOUNT_SID; // Store in environment variables
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = new twilio(accountSid, authToken);

// Send SMS Notification
function sendSmsNotification(phoneNumber, event) {
  const message = `Reminder: You have an upcoming event: ${event.title} at ${new Date(event.start).toLocaleString()}. Click here to join: ${event.url}`;

  client.messages
    .create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER, // Store Twilio number in environment variables
      to: phoneNumber
    })
    .then((message) => console.log(`Message sent: ${message.sid}`))
    .catch((error) => console.error('Error sending SMS:', error));
}

// API Route to get events
app.get('/api/events', async (req, res) => {
  try {
    const events = await Event.find(); // Fetch events from DB
    res.json(events);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// API Route to create event
app.post('/api/events', async (req, res) => {
  const { title, start, end, url, phoneNumber } = req.body;

  const newEvent = new Event({
    title,
    start: new Date(start),
    end: new Date(end),
    url,
    phoneNumber,
  });

  try {
    await newEvent.save(); // Save event to DB
    sendSmsNotification(phoneNumber, newEvent); // Send SMS reminder
    res.status(201).json(newEvent);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Cron job to send reminders before the event starts
cron.schedule('*/5 * * * *', async () => { // Run every 5 minutes
  const events = await Event.find({ notified: false }); // Only check events that haven't been notified yet
  const now = new Date();

  events.forEach(event => {
    const eventTime = new Date(event.start);
    const timeDifference = eventTime - now;

    if (timeDifference <= 30 * 60 * 1000 && timeDifference > 0) { // 30 minutes before event
      sendSmsNotification(event.phoneNumber, event);
      event.notified = true; // Mark as notified
      event.save(); // Save the updated event with the 'notified' field
    }
  });
});
