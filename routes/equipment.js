const { ObjectId } = require("mongodb");

module.exports = (app, collections, middleware) => {
  const { usersCollection, equipmentCollection } = collections;
  const { verifyToken, verifyOwner, verifyAdmin } = middleware;

  // allows the owner of the item, or an admin
  const canManage = async (req, res, next) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "invalid id" });
    }
    const user = await usersCollection.findOne({ email: req.decoded.email });
    const item = await equipmentCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!item) {
      return res.status(404).send({ message: "equipment not found" });
    }
    const isAdmin = user && user.role === "admin";
    const isOwner = item.ownerEmail === req.decoded.email;
    if (!isAdmin && !isOwner) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.item = item;
    next();
  };

  // public: 6 approved items for the home page
  app.get("/equipment/featured", async (req, res) => {
    const items = await equipmentCollection
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    res.send(items);
  });

  // public: search, filter, sort and paginate (server side)
  app.get("/equipment", async (req, res) => {
    const {
      search,
      category,
      rentalType,
      minPrice,
      maxPrice,
      availability,
      sort,
      page = 1,
      limit = 9,
    } = req.query;

    const query = { status: "approved" };

    if (search) {
      // escape special characters so the search text is treated as plain text
      const text = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: text, $options: "i" } },
        { location: { $regex: text, $options: "i" } },
      ];
    }
    if (category) query.category = category;
    if (rentalType) query.rentalType = rentalType;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = Number(minPrice);
      if (maxPrice) query.price.$lte = Number(maxPrice);
    }
    if (availability === "available") query.quantity = { $gt: 0 };
    if (availability === "unavailable") query.quantity = { $lte: 0 };

    let sortOption = { createdAt: -1 };
    if (sort === "price_asc") sortOption = { price: 1 };
    if (sort === "price_desc") sortOption = { price: -1 };

    const pageNumber = Math.max(Number(page), 1);
    const limitNumber = Math.max(Number(limit), 1);

    const total = await equipmentCollection.countDocuments(query);
    const items = await equipmentCollection
      .find(query)
      .sort(sortOption)
      .skip((pageNumber - 1) * limitNumber)
      .limit(limitNumber)
      .toArray();

    res.send({
      items,
      total,
      page: pageNumber,
      pages: Math.ceil(total / limitNumber),
    });
  });

  // owner: add equipment (always starts as pending)
  app.post("/equipment", verifyToken, verifyOwner, async (req, res) => {
    const user = await usersCollection.findOne({ email: req.decoded.email });
    const body = req.body;

    const equipment = {
      name: body.name,
      description: body.description,
      category: body.category,
      location: body.location,
      price: Number(body.price),
      rentalType: body.rentalType,
      quantity: Number(body.quantity),
      condition: body.condition,
      brand: body.brand,
      model: body.model,
      image: body.image,
      terms: body.terms,
      status: "pending",
      ownerName: user.name,
      ownerEmail: user.email,
      ownerImage: user.image || "",
      createdAt: new Date(),
    };

    const result = await equipmentCollection.insertOne(equipment);
    res.send(result);
  });

  // owner: own equipment
  app.get("/my-equipment", verifyToken, verifyOwner, async (req, res) => {
    const items = await equipmentCollection
      .find({ ownerEmail: req.decoded.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(items);
  });

  // admin: all equipment
  app.get("/admin/equipment", verifyToken, verifyAdmin, async (req, res) => {
    const items = await equipmentCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(items);
  });

  // admin: approve or reject
  app.patch(
    "/admin/equipment/:id/status",
    verifyToken,
    verifyAdmin,
    async (req, res) => {
      const { status } = req.body;
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).send({ message: "invalid status" });
      }
      if (!ObjectId.isValid(req.params.id)) {
        return res.status(400).send({ message: "invalid id" });
      }
      const result = await equipmentCollection.updateOne(
        { _id: new ObjectId(req.params.id) },
        { $set: { status } },
      );
      res.send(result);
    },
  );

  // logged in: one equipment (details page)
  // logged in: one equipment (details page)
  app.get("/equipment/:id", verifyToken, async (req, res) => {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).send({ message: "invalid id" });
    }
    const item = await equipmentCollection.findOne({
      _id: new ObjectId(req.params.id),
    });
    if (!item) {
      return res.status(404).send({ message: "equipment not found" });
    }

    // only the owner or an admin can see items that are not approved
    if (item.status !== "approved") {
      const user = await usersCollection.findOne({ email: req.decoded.email });
      const isAdmin = user && user.role === "admin";
      const isOwner = item.ownerEmail === req.decoded.email;
      if (!isAdmin && !isOwner) {
        return res.status(404).send({ message: "equipment not found" });
      }
    }

    res.send(item);
  });

  // owner of the item or admin: update
  app.patch("/equipment/:id", verifyToken, canManage, async (req, res) => {
    const body = req.body;
    const updatedFields = {
      name: body.name,
      description: body.description,
      category: body.category,
      location: body.location,
      price: Number(body.price),
      rentalType: body.rentalType,
      quantity: Number(body.quantity),
      condition: body.condition,
      brand: body.brand,
      model: body.model,
      image: body.image,
      terms: body.terms,
    };
    const result = await equipmentCollection.updateOne(
      { _id: req.item._id },
      { $set: updatedFields },
    );
    res.send(result);
  });

  // owner of the item or admin: delete
  app.delete("/equipment/:id", verifyToken, canManage, async (req, res) => {
    const result = await equipmentCollection.deleteOne({ _id: req.item._id });
    res.send(result);
  });
};
