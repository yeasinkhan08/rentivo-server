const jwt = require("jsonwebtoken");

module.exports = (usersCollection) => {
  const verifyToken = (req, res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    const token = header.split(" ")[1];
    jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
      if (error) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      req.decoded = decoded;
      next();
    });
  };

  const checkRole = (role) => async (req, res, next) => {
    const user = await usersCollection.findOne({ email: req.decoded.email });
    if (!user || user.role !== role) {
      return res.status(403).send({ message: "forbidden access" });
    }
    next();
  };

  return {
    verifyToken,
    verifyRenter: checkRole("customer"),
    verifyOwner: checkRole("owner"),
    verifyAdmin: checkRole("admin"),
  };
};
