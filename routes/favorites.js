const { ObjectId } = require("mongodb");

module.exports = (app, collections, middleware) => {
  const { favoritesCollection, equipmentCollection } = collections;
  const { verifyToken, verifyRenter } = middleware;

  // customer: all favorite equipment
  app.get("/favorites", verifyToken, verifyRenter, async (req, res) => {
    const favorites = await favoritesCollection
      .find({ userEmail: req.decoded.email })
      .sort({ createdAt: -1 })
      .toArray();
    const ids = favorites.map((item) => new ObjectId(item.equipmentId));
    const items = await equipmentCollection
      .find({ _id: { $in: ids } })
      .toArray();
    res.send(items);
  });

  // logged in: is this item a favorite?
  app.get("/favorites/:equipmentId", verifyToken, async (req, res) => {
    const found = await favoritesCollection.findOne({
      userEmail: req.decoded.email,
      equipmentId: req.params.equipmentId,
    });
    res.send({ isFavorite: !!found });
  });

  // customer: add favorite
  app.post("/favorites", verifyToken, verifyRenter, async (req, res) => {
    const { equipmentId } = req.body;
    if (!ObjectId.isValid(equipmentId)) {
      return res.status(400).send({ message: "invalid id" });
    }
    const exists = await favoritesCollection.findOne({
      userEmail: req.decoded.email,
      equipmentId,
    });
    if (exists) {
      return res.send({ message: "already saved" });
    }
    const result = await favoritesCollection.insertOne({
      userEmail: req.decoded.email,
      equipmentId,
      createdAt: new Date(),
    });
    res.send(result);
  });

  // customer: remove favorite
  app.delete(
    "/favorites/:equipmentId",
    verifyToken,
    verifyRenter,
    async (req, res) => {
      const result = await favoritesCollection.deleteOne({
        userEmail: req.decoded.email,
        equipmentId: req.params.equipmentId,
      });
      res.send(result);
    },
  );
};
