const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken");
const fetchUser = require("./middlewares/fetchUser");
const fetchAdmin = require("./middlewares/fetchAdmin");
const axios = require("axios");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient()
const path = require("path")

require("dotenv").config();

const app = express();
const PORT = 3000;

app.set("view-engine", "ejs");

app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(bodyParser.json());

app.get("/", async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'login.html');
    return res.sendFile(filePath);
})

app.get("/signup", async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'signup.html');
    return res.sendFile(filePath);
})

app.get("/home", async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'home.html');
    return res.sendFile(filePath);
})

app.get("/admin", async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'adminHome.html');
    return res.sendFile(filePath);
})

app.get("/viewusers", async (req, res) => {
    const filePath = path.join(__dirname, 'public', 'viewUsers.html');
    return res.sendFile(filePath);
})

// Route for user login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({ message: "Enter both username and password", success: false })
    }

    try {
        const user = await prisma.user.findFirst({ where: { username } });

        if (user) {
            const passwordCorrect = await bcrypt.compare(password, user.password);
            if (passwordCorrect) {
                if (user.isAdmin) {
                    const id = { admin: { id: user.id } }
                    const admin_token = jwt.sign(id, process.env.JWT_SECRET);
                    return res.json({ message: 'Login successful', admin_token, success: true });
                }
                const id = { user: { id: user.id } }
                const token = jwt.sign(id, process.env.JWT_SECRET);
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
        const existingUser = await prisma.user.findFirst({ where: { username } });

        if (existingUser) {
            return res.json({ message: 'Username already exists', success: false });
        } else {
            const existingEmail = await prisma.user.findFirst({ where: { email } });
            if (existingEmail) {
                return res.json({ message: 'Email already exists', success: false });
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            const newUser = await prisma.user.create({ data: { username, password: hashedPassword, email, name } });
            const id = { user: { id: newUser.id } }
            const token = jwt.sign(id, process.env.JWT_SECRET);
            return res.json({ message: 'Registration successful', token, success: true });
        }
    } catch (error) {
        console.error('Error during registration:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

app.get("/api/users", fetchAdmin, async (req, res) => {
    try {
        const users = await prisma.user.findMany();
        return res.json({ users, success: true });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
})

app.get("/api/user", fetchUser, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({ where: { id: req.user.id } })
        return res.json({ user, success: true });
    } catch (error) {
        console.error('Error fetching users:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
})

app.get("/api/admin", fetchAdmin, async (req, res) => {
    try {
        const admin = await prisma.user.findUnique({ where: { id: req.admin.id } })
        return res.json({ admin, success: true });
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
        const event = await prisma.event.create({
            data: {
                eventName,
                datetime: new Date(datetime),
                location,
                details,
                weather: response.data.list[0].weather[0].description,
                user: {
                    connect: { id: req.user.id }
                }
            }
        });
        // console.log(event)
        return res.json({ message: 'Event created successfully', event, success: true });
    } catch (error) {
        try {
            const event = await prisma.event.create({
                data: {
                    eventName,
                    datetime: new Date(datetime),
                    location,
                    details,
                    user: {
                        connect: { id: req.user.id }
                    }
                }
            });
            // console.log(event)
            return res.json({ message: 'Event created successfully', event, success: true });
        } catch (error) {
            console.error('Error creating event:', error);
            return res.json({ message: 'Internal server error', success: false });
        }
    }
});

app.put("/api/events/:eventId", fetchUser, async (req, res) => {
    const eventId = req.params.eventId;
    try {
        const id = req.user.id;
        const event = await prisma.event.findUnique({ where: { id: eventId } });

        if (event.userId != id) {
            return res.json({ message: "You cannot edit this event", success: false })
        }
        let response;
        try {
            response = await axios.get(`http://api.openweathermap.org/data/2.5/forecast?q=${location}&appid=${WEATHER_API_KEY}`);
        } catch (e) {

        }

        const { eventName, datetime, location, details } = req.body;
        if (response) {
            await prisma.event.update({
                where: {
                    id: eventId
                },
                data: {
                    eventName,
                    datetime: new Date(datetime),
                    location,
                    details,
                    weather : response.data.list[0].weather[0].description
                }
            })
        } else {
            await prisma.event.update({
                where: {
                    id: eventId
                },
                data: {
                    eventName,
                    datetime: new Date(datetime),
                    location,
                    details
                }
            })
        }

        return res.json({ message: "Event Edited Successfully", success: true })
    } catch (error) {
        console.log("Error", error)
        return res.json({ message: "Internal Server Error", success: false })
    }
})

// Endpoint to get all events (for the dashboard)
app.get('/api/user/events', fetchUser, async (req, res) => {
    try {
        const userId = req.user.id
        const events = await prisma.event.findMany();
        return res.json({ events, userId, success: true });
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint to get all events (for the dashboard)
app.get('/api/user/event/:id', fetchUser, async (req, res) => {
    try {
        const event = await prisma.event.findUnique({where:{id:req.params.id}});
        return res.json({ event, success: true });
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

app.get('/api/admin/events', fetchAdmin, async (req, res) => {
    try {
        const userId = req.admin.id
        const events = await prisma.event.findMany();
        return res.json({ events, userId, success: true });
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint to get all events (for the dashboard)
app.get('/api/admin/events', fetchAdmin, async (req, res) => {
    try {
        const events = await prisma.event.findMany();
        return res.json({ events, success: true });
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint to get all events (for the dashboard)
app.get('/api/user/events', fetchUser, async (req, res) => {
    try {
        const events = await prisma.event.findMany();
        return res.json({ events, success: true });
    } catch (error) {
        console.error('Error fetching events:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint for admin to approve an event
app.put('/api/events/:eventId/approve', fetchAdmin, async (req, res) => {
    const { eventId } = req.params;

    try {
        const event = await prisma.event.findUnique({where:{id:eventId}});

        if (!event) {
            return res.json({ message: 'Event not found', success: false });
        }

        // Update event to set approved flag to true
        await prisma.event.update({where: {id: eventId}, data: { approved: true }});

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
        const event = await prisma.event.findUnique({where:{id:eventId}});

        if (!event) {
            return res.status(404).json({ message: 'Event not found', success: false });
        }

        // Delete the event
        await prisma.event.delete({where:{id:eventId}});

        return res.json({ message: 'Event deleted successfully', success: true });
    } catch (error) {
        console.error('Error deleting event:', error);
        return res.json({ message: 'Internal server error', success: false });
    }
});

// Endpoint for user to delete an event
app.delete('/api/user/events/:eventId', fetchUser, async (req, res) => {
    const { eventId } = req.params;

    try {
        const event = await prisma.event.findUnique({where:{id:eventId}});

        if (!event) {
            return res.status(404).json({ message: 'Event not found', success: false });
        }

        if (event.userId != req.user.id) {
            return res.json({ message: 'You cannot delete this event', success: false });
        }

        // Delete the event
        await prisma.event.delete({where:{id:eventId}});

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

        const existingUser = await prisma.user.findFirst({ where: { username } });

        if (existingUser) {
            return res.json({ message: 'Username already exists', success: false });
        } else {
            const existingEmail = await prisma.user.findFirst({ where: { email } });
            if (existingEmail) {
                return res.json({ message: 'Email already exists', success: false });
            }
        }
        // Create the new admin

        await prisma.user.create({data:{
            name,
            username,
            password: hashedPassword,
            email,
            isAdmin: true
        }});

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
