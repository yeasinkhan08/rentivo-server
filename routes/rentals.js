module.exports = (app, collections, middleware) => {
  const { bookingsCollection } = collections;
  const { verifyToken, verifyRenter, verifyOwner, verifyAdmin } = middleware;

  // a confirmed booking becomes "completed" once its end date has passed
  const withStatus = (booking) => {
    const today = new Date().toISOString().slice(0, 10);
    if (booking.bookingStatus === "confirmed" && booking.endDate < today) {
      return { ...booking, bookingStatus: "completed" };
    }
    return booking;
  };

  // customer: own rentals
  app.get("/bookings/my", verifyToken, verifyRenter, async (req, res) => {
    const bookings = await bookingsCollection
      .find({ customerEmail: req.decoded.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookings.map(withStatus));
  });

  // owner: rentals of the owner's equipment
  app.get("/bookings/owner", verifyToken, verifyOwner, async (req, res) => {
    const bookings = await bookingsCollection
      .find({ ownerEmail: req.decoded.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookings.map(withStatus));
  });

  // admin: every rental
  app.get("/admin/bookings", verifyToken, verifyAdmin, async (req, res) => {
    const bookings = await bookingsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    res.send(bookings.map(withStatus));
  });
};
