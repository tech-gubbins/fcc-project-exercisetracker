const express = require("express");
const app = express();
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
    res.sendFile(__dirname + "/views/index.html");
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});

// Connection events
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error"));
db.once("open", () => {
    console.log("Connected to MongoDB");
});

const listener = app.listen(process.env.PORT || 3000, () => {
    console.log("Your app is listening on port " + listener.address().port);
});

// POST /api/users — Create a New User
const User = require("./models/User");

app.post("/api/users", async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ error: "Username is required" });
    }

    try {
        // Check if username already exists
        let existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.json({
                username: existingUser.username,
                _id: existingUser._id,
            });
        }

        // Create new user
        const newUser = new User({ username });
        await newUser.save();

        res.json({
            username: newUser.username,
            _id: newUser._id,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// GET /api/users — Retrieve All Users
app.get("/api/users", async (req, res) => {
    try {
        const users = await User.find({}, "username _id");
        res.json(users);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// POST /api/users/:_id/exercises - Add an exercise
app.post("/api/users/:_id/exercises", async (req, res) => {
    const { _id } = req.params;
    const { description, duration, date } = req.body;

    const Exercise = require("./models/Exercise");

    // Validate required fields
    if (!description || !duration) {
        return res
            .status(400)
            .json({ error: "Description and duration are required" });
    }

    // Validate duration is a number
    if (isNaN(duration)) {
        return res.status(400).json({ error: "Duration must be a number" });
    }

    // Validate and parse date
    let exerciseDate;
    if (date) {
      exerciseDate = new Date(date);
      if (exerciseDate.toString() === 'Invalid Date') {
        return res.status(400).json({ error: 'Invalid date format' });
      }
    } else {
      exerciseDate = new Date(); // Current date
    }

    try {
        // Find user by _id
        const user = await User.findById(_id);
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        // Create new exercise
        const newExercise = new Exercise({
            userId: user._id,
            description,
            duration: Number(duration),
            date: exerciseDate.toUTCString().split(' ').slice(0, 4).join(' '), // UTC-formatted date
        });

        await newExercise.save();

        // Respond with the expected structure
        res.json({
            username: user.username,
            description: newExercise.description,
            duration: newExercise.duration,
            date: newExercise.date.toDateString(), // Formats the date as "Mon Jan 01 1990"
            _id: user._id,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});

// GET /api/users/:_id/logs — Retrieve Exercise Logs
app.get("/api/users/:_id/logs", async (req, res) => {
    const { _id } = req.params;
    const { from, to, limit } = req.query;

    const Exercise = require("./models/Exercise");

    // Validate _id
    if (!_id) {
        return res.status(400).json({ error: "User ID is required" });
    }

    try {
        // Find user by _id
        const user = await User.findById(_id);
        if (!user) {
            return res.status(400).json({ error: "User not found" });
        }

        // Build query
        let query = { userId: _id };
        let dateFilter = {};

        if (from) {
            const fromDate = new Date(from);
            if (fromDate.toString() === "Invalid Date") {
                return res
                    .status(400)
                    .json({ error: "Invalid from date format" });
            }
            dateFilter.$gte = fromDate;
        }

        if (to) {
            const toDate = new Date(to);
            if (toDate.toString() === "Invalid Date") {
                return res
                    .status(400)
                    .json({ error: "Invalid to date format" });
            }
            dateFilter.$lte = toDate;
        }

        if (from || to) {
            query.date = dateFilter;
        }

        let exercisesQuery = Exercise.find(query).select(
            "description duration date"
        );

        if (limit) {
            const limitNumber = Number(limit);
            if (isNaN(limitNumber) || limitNumber < 1) {
                return res
                    .status(400)
                    .json({ error: "Limit must be a positive number" });
            }
            exercisesQuery = exercisesQuery.limit(limitNumber);
        }

        const exercises = await exercisesQuery.exec();

        // Format exercises
        const log = exercises.map((ex) => ({
            description: ex.description,
            duration: ex.duration,
            date: ex.date.toDateString(),
        }));

        res.json({
            username: user.username,
            count: exercises.length,
            _id: user._id,
            log,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error" });
    }
});
