const jwt = require("jsonwebtoken");

const fetchUser = (req, res, next) => {
    const adminToken = req.header("admin-token");

    if (!adminToken) {
        return res.json({ message: "Please authenticate using a valid token", success: false });
    }

    try {
        const string = jwt.verify(adminToken, process.env.JWT_SECRET);
        req.admin = string.admin;
    } catch (error) {
        return res.json({ message: "Please authenticate using a valid token", success: false });
    }
    next();
}

module.exports = fetchUser;