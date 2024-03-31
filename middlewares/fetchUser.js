const jwt = require("jsonwebtoken");

const fetchUser = (req, res, next) => {
    const userToken = req.header("user-token");

    if (!userToken) {
        return res.json({ error: "Please authenticate using a valid token", success: false });
    }

    try {
        const string = jwt.verify(userToken, process.env.JWT_SECRET);
        req.user = string.user;
    } catch (error) {
        return res.json({ error: "Please authenticate using a valid token", success: false });
    }
    next();
}

module.exports = fetchUser;