const express = require('express');
const bodyParser = require('body-parser');
const { Sequelize, DataTypes } = require('sequelize');
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken");
const fetchUser = require("./middlewares/fetchUser");
const fetchAdmin = require("./middlewares/fetchAdmin");
const axios = require("axios");

require("dotenv").config();

const app = express();
const PORT = 3000;

app.set("view-engine", "ejs");

app.use('/CSS', express.static('CSS'));

// Middleware
app.use(bodyParser.json());


// Sequelize initialization
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: 'database.sqlite' // SQLite database file
});

// Define User model
const User = sequelize.define('User', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "guest",
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false
    },
    isAdmin: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
});

const Event = sequelize.define('Event', {
    eventName: {
        type: DataTypes.STRING,
        allowNull: false
    },
    datetime: {
        type: DataTypes.DATE,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'Users',
            key: 'id'
        }
    },
    location: {
        type: DataTypes.STRING,
        allowNull: false
    },
    details: {
        type: DataTypes.STRING
    },
    weather: {
        type: String
    },
    approved: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    }
});

const WEATHER_API_KEY = process.env.API_KEY;


(async () => {
    try {
        // Check if there's already an admin in the database
        const existingAdmin = await User.findOne({ where: { isAdmin: true } });

        if (!existingAdmin) {
            // If there's no admin, create a new admin user

            const password = "adminpassword"
            const hashedPassword = await bcrypt.hash(password, 10);
            await User.create({
                name: "Admin",
                username: "admin",
                email: "admin@example.com",
                password: hashedPassword, // You should hash the password in production
                isAdmin: true
            });

            console.log('Default admin created successfully.');
        } else {
            console.log('Admin already exists.');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
})();

// Sync model with the database
sequelize.sync()
    .then(() => {
        console.log('Database & tables created!');
    })
    .catch(err => console.error('Error syncing database:', err));

let loggedInUser;

app.get("/", async (req, res)=>{
    res.render("login.ejs");
})

app.get("/signup", async (req, res)=>{
    res.render("signup.ejs");
})



app.get("/home", async (req, res)=>{
    const response = await fetch("http://localhost:3000/api/events");
    const json = await response.json();
    const events = json.events;
    if (!loggedInUser){
        res.render("loggingOut.ejs")
    }
    res.render("home.ejs", {user: loggedInUser, events});
})

app.get("/admin", async (req, res)=>{
    const response = await fetch("http://localhost:3000/api/events");
    const json = await response.json();
    const events = json.events;
    if (!loggedInUser){
        res.render("loggingOut.ejs")
    }
    res.render("adminhome.ejs", {admin: loggedInUser, events});
})

app.get("/viewusers", async (req, res)=>{
    res.render("viewUsers.ejs");
})

// Route for user login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ where: { username } });

        if (user) {
            const passwordCorrect = await bcrypt.compare(password, user.password);
            if (passwordCorrect) {
                if (user.isAdmin){
                    const id = {admin:{id: user.id}}
                    const admin_token = jwt.sign(id, process.env.JWT_SECRET); 
                    loggedInUser = {name: user.name, email: user.email, username: user.username};
                    return res.json({ message: 'Login successful', admin_token, success: true });
                }
                const id = {user:{id: user.id}}
                console.log(id)
                const token = jwt.sign(id, process.env.JWT_SECRET); 
                loggedInUser = {name: user.name, email: user.email, username: user.username};
                return res.json({ message: 'Login successful', token, success: true });
            } else {
                return res.json({ message: 'Invalid username or password', success: false });
            }
        } else {
            return res.json({ message: 'Invalid username or password', success: false });
        }
    } catch (error) {
        console.error('Error during login:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Route for guest registration
app.post('/api/register', async (req, res) => {
    const { username, password, email, name } = req.body;

    try {
        const existingUser = await User.findOne({ where: { username } });

        if (existingUser) {
            return res.json({ message: 'Username already exists', success: false });
        } else {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail){
                return res.json({ message: 'Email already exists', success: false });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await User.create({ username, password: hashedPassword, email, name });
            const id = {user:{id: newUser.id}}
            const token = jwt.sign(id, process.env.JWT_SECRET); 
            loggedInUser = {name: newUser.name, email: newUser.email, username: newUser.username};
            return res.json({ message: 'Registration successful', token, success: true });
        }
    } catch (error) {
        console.error('Error during registration:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

app.get("/api/users", fetchAdmin, async (req, res)=>{
    try {
        const users = await User.findAll();
        return res.json({users, success: true});
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
})

// Endpoint for users to create events
app.post('/api/events', fetchUser, async (req, res) => {
    const { eventName, datetime, location, details } = req.body;

    try {
        const response = await axios.get(`http://api.openweathermap.org/data/2.5/forecast?q=${location}&appid=${WEATHER_API_KEY}`);
        // console.log(response)
        // Create the event
        const event = await Event.create({
            eventName,
            datetime,
            location,
            details,
            userId: req.user.id,
            weather: response.data.list[0].weather[0].description
        });
        // console.log(event)
        return res.json({ message: 'Event created successfully', event, success: true });
    } catch (error) {
        try{
            const event = await Event.create({
                eventName,
                datetime,
                location,
                details,
                userId: req.user.id
            });
            // console.log(event)
            return res.json({ message: 'Event created successfully', event, success: true });
        }catch(error){
            console.error('Error creating event:', error);
            return res.json({ message: 'Internal server error', success: false });
        }
    }
});

// Endpoint to get all events (for the dashboard)
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.findAll();
        return res.json({events, success: true});
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint for admin to approve an event
app.put('/api/events/:eventId/approve', fetchAdmin, async (req, res) => {
    const { eventId } = req.params;

    try {
        const event = await Event.findByPk(eventId);

        if (!event) {
            return res.json({ message: 'Event not found', success: false });
        }

        // Update event to set approved flag to true
        await event.update({ approved: true });

        return res.json({ message: 'Event approved successfully', success: true });
    } catch (error) {
        console.error('Error approving event:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint for admin to delete an event
app.delete('/api/events/:eventId', fetchAdmin, async (req, res) => {
    const { eventId } = req.params;

    try {
        const event = await Event.findByPk(eventId);

        if (!event) {
            return res.status(404).json({ message: 'Event not found', success: false });
        }

        // Delete the event
        await event.destroy();

        return res.json({ message: 'Event deleted successfully', success: true });
    } catch (error) {
        console.error('Error deleting event:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint for admins to create a new admin
app.post('/api/admin', fetchAdmin, async (req, res) => {
    const { name, username, password, email } = req.body;

    try {

        const hashedPassword = await bcrypt.hash(password, 10)

        const existingUser = await User.findOne({ where: { username } });

        if (existingUser) {
            return res.json({ message: 'Username already exists', success: false });
        } else {
            const existingEmail = await User.findOne({ where: { email } });
            if (existingEmail){
                return res.json({ message: 'Email already exists', success: false });
            }
        }
        // Create the new admin
        
        await User.create({
            name,
            username,
            password: hashedPassword,
            email,
            isAdmin: true
        });

        return res.json({ message: 'New admin created successfully', success: true });
    } catch (error) {
        console.error('Error creating new admin:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port http://localhost:${PORT}`);
});
